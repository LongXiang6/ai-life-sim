/**
 * @module campaigns/default/index.ts
 * @description 默认叙事 Campaign：正文即时发布后并行执行数据分析与事件识别
 * @mod mod-engine
 */

import type {
  AIModelConfig,
  HistoricalEventCandidateInput,
  NarrativeStage,
  PromptTemplate,
  RoundContext,
} from '@/foundation'
import {
  buildSegmentedPrompt,
  callAIWithPromptTemplate,
  computeNarrativeEventRecognitionTokenBudget,
  computeNarrativeSettlementTokenBudget,
  eventBus,
  isAiResponseTruncatedError,
  recordRoundCacheMetrics,
} from '@/core'
import { logger } from '@/core/logger/client-logger'
import { notifyLegendaryEncounterInjected } from '@/core/player-content/player-content-client'
import { useSettingsStore } from '@/mods/mod-settings'

import { DEFAULT_WORD_COUNT_TARGET } from '../../constants/narrative-config'
import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import { buildSettlementBranchIntentInstruction } from '../../helpers/branch-intent-resolution'
import { buildNarrativeEventRecognitionPromptInput } from '../../helpers/narrative-event-recognition-context'
import { buildNarrativeSettlementPromptInput } from '../../helpers/narrative-settlement-context'
import {
  buildNarrativeEventRecognitionRepairInstruction,
  buildNarrativeRepairInstruction,
  buildNarrativeSettlementRepairInstruction,
  inspectNarrativeEventRecognitionQuality,
  inspectNarrativeResponseQuality,
  inspectNarrativeSettlementQuality,
  type NarrativeEventRecognitionQuality,
  type NarrativeResponseQuality,
  type NarrativeSettlementQuality,
} from '../../helpers/narrative-response-quality'
import { narrativeEventRecognitionPrompt } from '../../prompts/narrative-event-recognition-prompt'
import { narrativeSettlementPrompt } from '../../prompts/narrative-settlement-prompt'
import { useEngineStore } from '../../store'
import {
  type ParsedNarrative,
} from '../../subsystems/narrative-parser-system'
import { orchestrator } from '../../subsystems/orchestrator-system'

const MAX_FORMAT_REPAIR_ATTEMPTS = 2
const STRUCTURED_ANALYSIS_REASONING_EFFORT = 'disabled' as const
const STAGE_OWNER = 'mod-engine'
const STAGE_FAILURE_TARGET = 'mod-engine'

/** 阶段运行时上下文：只保存本轮两次调用之间的临时值。 */
export interface StageRuntimeContext extends RoundContext {
  _promptContext?: ReturnType<typeof orchestrator.assemblePromptContext>
  _eventInjectionText?: string
  _legendaryEncounterInjected?: boolean
  _narrativeResponse?: string
  _narrativeParsed?: ParsedNarrative
  _settledNarrative?: ParsedNarrative
  _recognizedEventCandidates?: HistoricalEventCandidateInput[]
  _roundResult?: ReturnType<typeof orchestrator.handleNarrativeResponse>
}

function buildLegendaryEncounterGuidance(
  encounter: NonNullable<ReturnType<typeof useEngineStore.getState>['legendaryEncounter']>,
): string {
  const representative = encounter.achievements.find((item) => item.kind === 'lifespan-adjustment')
    ?? encounter.achievements[0]
  return [
    '【低优先级异界传闻素材】',
    `另一段人生曾发生于“${encounter.worldName}”，主角名为“${encounter.characterName}”。`,
    `留下的结算评语：${encounter.endingReview}`,
    ...(representative
      ? [`可引用事件：${representative.timeLabel}，${representative.title}：${representative.detail}`]
      : []),
    '仅在不影响本轮主线、玩家意图、命运事件和连续性的前提下，把它改写成当前世界能够理解的一小段传说、书页、旧档案、梦境、遗物铭文或路人故事。',
    '不得让传闻直接改变主角属性、强制选择或夺取主线；不适合出现时可以完全不用。',
  ].join('\n')
}

function narrativeRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeGenerationRejectedError'
  return error
}

function settlementRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeSettlementRejectedError'
  return error
}

function eventRecognitionRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeEventRecognitionRejectedError'
  return error
}

async function callStructuredAnalysis(
  label: string,
  rejection: (message: string) => Error,
  promptTemplate: PromptTemplate,
  userPrompt: string,
  options: Parameters<typeof callAIWithPromptTemplate>[2],
): Promise<string> {
  try {
    return await callAIWithPromptTemplate(promptTemplate, userPrompt, options)
  } catch (error) {
    if (!isAiResponseTruncatedError(error)) throw error

    const rejected = rejection(`${label}响应达到输出上限，已停止本轮收束并保留已生成正文，请重试。`)
    Object.assign(rejected, {
      cause: error,
      finishReason: error.finishReason,
      maxTokens: error.maxTokens,
      requestId: error.requestId,
      responseLength: error.responseLength,
    })
    throw rejected
  }
}

/**
 * 加载默认 Campaign。预览只缓存第一次严格叙事响应；真实回合先发布正文，
 * 再并行执行数据分析与事件识别，全部成功后进入唯一原子提交。
 */
export function loadStages(
  aiConfig: AIModelConfig,
  promptTemplate: PromptTemplate,
  sessionId?: string,
): NarrativeStage[] {
  const stages: NarrativeStage[] = [
    {
      name: 'prepare-round',
      phase: 'prepare',
      dependsOn: [],
      order: 0,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: () => {
        const context = orchestrator.getRoundContextSnapshot()
        if (!context.contextId || !context.characterId) {
          throw new Error('回合上下文缺少 contextId 或 characterId')
        }
      },
      maxRounds: 1,
    },
    {
      name: 'queue-round',
      phase: 'ready',
      dependsOn: ['prepare-round'],
      order: 50,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: () => undefined,
      maxRounds: 1,
    },
    {
      name: 'advance-time',
      phase: 'execute',
      dependsOn: ['queue-round'],
      order: 100,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: () => {
        if (!orchestrator.isPreviewExecution()) {
          eventBus.emit('mod-engine:round-start', orchestrator.getRound())
        }
        orchestrator.advanceTime()
      },
      maxRounds: 1,
    },
    {
      name: 'subsystem-advance',
      phase: 'execute',
      dependsOn: ['advance-time'],
      order: 200,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: async () => {
        await orchestrator.advanceAllSubsystems()
      },
      maxRounds: 1,
    },
    {
      name: 'collect-states',
      phase: 'execute',
      dependsOn: ['subsystem-advance'],
      order: 300,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: async () => {
        await orchestrator.collectAllSubsystemStates()
      },
      maxRounds: 1,
    },
    {
      name: 'event-lifecycle',
      phase: 'execute',
      dependsOn: ['collect-states'],
      order: 400,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const lifecycle = buildEventInjectionText(
          orchestrator.getDetectionStates(),
          orchestrator.getEventLifecycle(),
          orchestrator.getState().totalRounds,
        )
        orchestrator.setEventLifecycle(lifecycle.newLifecycle)
        ctx._eventInjectionText = lifecycle.eventInjectionText || undefined
      },
      maxRounds: 1,
    },
    {
      name: 'assemble-prompt',
      phase: 'execute',
      dependsOn: ['event-lifecycle'],
      order: 500,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!orchestrator.isPreviewExecution()) await orchestrator.refreshNarrativeMemoryRecall()

        const engineState = useEngineStore.getState()
        const encounter = engineState.legendaryEncounter
        const lastNarrative = engineState.narrativeHistory.at(-1)
        const canInjectLegend = !orchestrator.isPreviewExecution()
          && encounter?.status === 'selected'
          && engineState.totalRounds >= 2
          && !ctx._eventInjectionText
          && !orchestrator.getFocusedBranchIntent()
          && !engineState.forceBranchNext
          && !lastNarrative?.resolvedChoice
        const promptContext = orchestrator.assemblePromptContext(ctx._eventInjectionText)
        ctx._promptContext = canInjectLegend && encounter
          ? {
              ...promptContext,
              narrativeGuidanceText: [
                promptContext.narrativeGuidanceText,
                buildLegendaryEncounterGuidance(encounter),
              ].filter(Boolean).join('\n'),
            }
          : promptContext
        ctx._legendaryEncounterInjected = canInjectLegend
      },
      maxRounds: 1,
    },
    {
      name: 'ai-narration',
      phase: 'execute',
      dependsOn: ['assemble-prompt'],
      order: 600,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._promptContext) throw narrativeRejection('第一次调用缺少叙事上下文')

        const settings = useSettingsStore.getState()
        const wordCountTarget = settings.wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
        const requestBranch = useEngineStore.getState().forceBranchNext
        const activeStyle = orchestrator.getNarrativeStyleSnapshot()
        const cachedNarrative = orchestrator.consumePrefetchedNarrative()
        const prefetched = ctx._legendaryEncounterInjected ? null : cachedNarrative
        let response: string | undefined
        let quality: NarrativeResponseQuality | undefined
        let source: 'live' | 'prefetched' = 'live'

        if (prefetched) {
          const prefetchedQuality = inspectNarrativeResponseQuality(
            prefetched,
            wordCountTarget,
          )
          if (prefetchedQuality.valid) {
            response = prefetched
            quality = prefetchedQuality
            source = 'prefetched'
          }
        }

        let repairAttempts = 0
        const repairKinds: string[] = []
        if (!response || !quality) {
          const model = settings.customModel || aiConfig.model
          const segments = buildSegmentedPrompt(promptTemplate, ctx._promptContext)
          const routeOptions = {
            providerId: settings.provider,
            customBaseUrl: settings.customUrl || undefined,
            customModel: model,
            apiKey: settings.customKey || undefined,
          }
          const baseLogContext = {
            lifeRunId: orchestrator.getState().lifeRunId,
            round: orchestrator.getState().totalRounds,
            age: Number(ctx._promptContext.characterStatusView.年龄) || undefined,
            strategy: segments.strategy,
            callKind: 'narrative-main',
            pool: 'narrative',
            model,
            sessionId,
            executionKind: orchestrator.isPreviewExecution() ? 'preview' : 'real',
            promptVersion: promptTemplate.version,
            targetWordCount: wordCountTarget,
            styleSource: activeStyle.source,
            styleText: activeStyle.text,
            styleVersion: activeStyle.version,
          }
          const callOptions = {
            config: { ...aiConfig, model },
            pool: 'narrative' as const,
            strictSchema: true,
            sessionId,
            signal: orchestrator.getPreviewAbortSignal(),
            userSegments: segments.userSegments,
            logContext: baseLogContext,
            ...routeOptions,
            ...(settings.storySeed.trim() ? { storySeed: settings.storySeed.trim() } : {}),
          }

          response = await callAIWithPromptTemplate(promptTemplate, segments.full, callOptions)
          quality = inspectNarrativeResponseQuality(response, wordCountTarget)
          while (!quality.valid && repairAttempts < MAX_FORMAT_REPAIR_ATTEMPTS) {
            repairAttempts += 1
            repairKinds.push('narrative-format-repair')
            response = await callAIWithPromptTemplate(promptTemplate, segments.full, {
              ...callOptions,
              overrideTemperature: 0,
              extraUserMessages: [
                `${buildNarrativeRepairInstruction(quality, wordCountTarget, requestBranch)}\n\n⟦上一版叙事响应⟧${response}`,
              ],
              logContext: {
                ...baseLogContext,
                callKind: 'narrative-format-repair',
              },
              logMeta: { repairAttempt: repairAttempts },
            })
            quality = inspectNarrativeResponseQuality(response, wordCountTarget)
          }

          recordRoundCacheMetrics({
            strategy: 'S4',
            stablePrefixChars: segments.stablePrefixChars,
            userMessageCount: segments.userMessageCount ?? 3,
          })
        }

        if (!quality.valid || !quality.parsed) {
          orchestrator.noteNarrativeQuality({
            source,
            finalValid: false,
            acceptedNarrativeBody: false,
            finalReason: quality.reason,
            repairAttempts,
            repairKinds,
          })
          throw narrativeRejection(`叙事响应经过 ${repairAttempts} 次格式修复后仍无效：${quality.reason}`)
        }

        ctx._narrativeResponse = response
        ctx._narrativeParsed = quality.parsed
        orchestrator.setLastExecutedFullContent(response)
        orchestrator.noteNarrativeQuality({
          source,
          finalValid: true,
          acceptedNarrativeBody: true,
          narrativeChars: quality.narrativeChars,
          responseChars: response.length,
          repairAttempts,
          repairKinds,
        })
        logger.info('narrative-quality', 'narrative-response-accepted', {
          round: orchestrator.getState().totalRounds,
          source,
          repairAttempts,
          narrativeChars: quality.narrativeChars,
        })
      },
      maxRounds: 1,
    },
    {
      name: 'publish-narrative',
      phase: 'execute',
      dependsOn: ['ai-narration'],
      order: 650,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        if (orchestrator.isPreviewExecution()) return
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._narrativeParsed) {
          throw narrativeRejection('正文发布缺少已经严格解析的第一次响应')
        }
        const state = orchestrator.getState()
        const roundContext = orchestrator.getRoundContextSnapshot()
        const roundSequence = roundContext.roundSequence ?? state.totalRounds
        useEngineStore.getState().setPendingNarrative({
          executionId: `narrative-round:${state.lifeRunId}:${roundSequence}:real`,
          roundSequence,
          text: ctx._narrativeParsed.narrative,
          timestamp: Date.now(),
          status: 'pending',
          statusCode: 'narrative-round:publish-narrative:running',
        })
      },
      onExit: () => {
        if (orchestrator.isPreviewExecution()) return
        const state = orchestrator.getState()
        const roundSequence = orchestrator.getRoundContextSnapshot().roundSequence ?? state.totalRounds
        const executionId = `narrative-round:${state.lifeRunId}:${roundSequence}:real`
        useEngineStore.getState().updatePendingNarrative(
          executionId,
          'committing',
          'narrative-round:publish-narrative:succeeded',
        )
      },
      maxRounds: 1,
    },
    {
      name: 'ai-data-analysis',
      phase: 'execute',
      dependsOn: ['publish-narrative'],
      order: 700,
      parallelGroup: 'narrative-background-analysis',
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (orchestrator.isPreviewExecution()) return
        if (!ctx._narrativeResponse || !ctx._narrativeParsed) {
          throw settlementRejection('第二次调用缺少已经严格解析的第一次响应')
        }

        const focusedIntent = orchestrator.getFocusedBranchIntent()
        const intentCondition = focusedIntent
          ? buildSettlementBranchIntentInstruction(
              focusedIntent,
              orchestrator.getActiveBranchIntents().filter(
                (intent) => intent.intentId !== focusedIntent.intentId,
              ),
            )
          : undefined
        const settlementInput = buildNarrativeSettlementPromptInput({
          subsystemStates: orchestrator.getSubsystemStateSnapshot(),
          roundContext: orchestrator.getRoundContextSnapshot(),
          intentCondition,
          narrativeResponse: ctx._narrativeResponse,
        })
        const settings = useSettingsStore.getState()
        const model = settings.customModel || aiConfig.model
        const settlementMaxTokens = computeNarrativeSettlementTokenBudget({
          narrativeCharacters: ctx._narrativeParsed.narrative.replace(/\s/gu, '').length,
          activeSubsystemCount: settlementInput.activeSubsystemIds.length,
          reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
        })
        const joinedInput = settlementInput.userSegments.join('\n\n')
        const baseLogContext = {
          lifeRunId: orchestrator.getState().lifeRunId,
          round: orchestrator.getState().totalRounds,
          strategy: 'S4',
          callKind: 'narrative-settlement',
          pool: 'narrative',
          model,
          sessionId,
          executionKind: 'real',
          promptVersion: narrativeSettlementPrompt.version,
        }
        const callOptions = {
          config: {
            ...aiConfig,
            model,
            maxTokens: settlementMaxTokens,
            reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          },
          pool: 'narrative' as const,
          strictSchema: true,
          sessionId,
          signal: orchestrator.getPreviewAbortSignal(),
          providerId: settings.provider,
          customBaseUrl: settings.customUrl || undefined,
          customModel: model,
          apiKey: settings.customKey || undefined,
          userSegments: settlementInput.userSegments,
          overrideTemperature: 0,
          reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          logContext: baseLogContext,
        }

        let response = await callStructuredAnalysis(
          '结算',
          settlementRejection,
          narrativeSettlementPrompt,
          joinedInput,
          callOptions,
        )
        let quality: NarrativeSettlementQuality = inspectNarrativeSettlementQuality({
          content: response,
          narrative: ctx._narrativeParsed,
          allowedEvidenceEventIds: settlementInput.allowedEvidenceEventIds,
          allowedSubsystemIds: settlementInput.activeSubsystemIds,
          expectedIntentId: focusedIntent?.intentId,
        })
        let repairAttempts = 0
        while (!quality.valid && repairAttempts < MAX_FORMAT_REPAIR_ATTEMPTS) {
          repairAttempts += 1
          response = await callStructuredAnalysis('结算', settlementRejection, narrativeSettlementPrompt, joinedInput, {
            ...callOptions,
            extraUserMessages: [buildNarrativeSettlementRepairInstruction(quality, response)],
            logContext: {
              ...baseLogContext,
              callKind: 'narrative-settlement-format-repair',
            },
            logMeta: { repairAttempt: repairAttempts },
          })
          quality = inspectNarrativeSettlementQuality({
            content: response,
            narrative: ctx._narrativeParsed,
            allowedEvidenceEventIds: settlementInput.allowedEvidenceEventIds,
            allowedSubsystemIds: settlementInput.activeSubsystemIds,
            expectedIntentId: focusedIntent?.intentId,
          })
        }

        if (!quality.valid || !quality.parsed) {
          throw settlementRejection(`结算响应经过 ${repairAttempts} 次格式修复后仍无效：${quality.reason}`)
        }
        ctx._settledNarrative = quality.parsed
        logger.info('narrative-quality', 'settlement-response-accepted', {
          round: orchestrator.getState().totalRounds,
          repairAttempts,
          activeSubsystemCount: settlementInput.activeSubsystemIds.length,
        })
      },
      maxRounds: 1,
    },
    {
      name: 'ai-event-recognition',
      phase: 'execute',
      dependsOn: ['publish-narrative'],
      order: 700,
      parallelGroup: 'narrative-background-analysis',
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (orchestrator.isPreviewExecution()) return
        if (!ctx._narrativeResponse || !ctx._narrativeParsed) {
          throw eventRecognitionRejection('事件识别缺少已经严格解析的第一次响应')
        }

        const roundContext = orchestrator.getRoundContextSnapshot()
        const existingCandidates = orchestrator.getAvailableHistoricalEventCandidates()
        const recognitionInput = buildNarrativeEventRecognitionPromptInput({
          roundContext,
          narrativeResponse: ctx._narrativeResponse,
          existingCandidates,
        })
        const settings = useSettingsStore.getState()
        const model = settings.customModel || aiConfig.model
        const recognitionMaxTokens = computeNarrativeEventRecognitionTokenBudget({
          narrativeCharacters: ctx._narrativeParsed.narrative.replace(/\s/gu, '').length,
          existingCandidateCount: recognitionInput.existingCandidates.length,
          reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
        })
        const joinedInput = recognitionInput.userSegments.join('\n\n')
        const baseLogContext = {
          lifeRunId: orchestrator.getState().lifeRunId,
          round: orchestrator.getState().totalRounds,
          strategy: 'S4',
          callKind: 'narrative-event-recognition',
          pool: 'narrative',
          model,
          sessionId,
          executionKind: 'real',
          promptVersion: narrativeEventRecognitionPrompt.version,
        }
        const callOptions = {
          config: {
            ...aiConfig,
            model,
            maxTokens: recognitionMaxTokens,
            reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          },
          pool: 'narrative' as const,
          strictSchema: true,
          sessionId,
          signal: orchestrator.getPreviewAbortSignal(),
          providerId: settings.provider,
          customBaseUrl: settings.customUrl || undefined,
          customModel: model,
          apiKey: settings.customKey || undefined,
          userSegments: recognitionInput.userSegments,
          overrideTemperature: 0,
          reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          logContext: baseLogContext,
        }

        let response = await callStructuredAnalysis(
          '事件识别',
          eventRecognitionRejection,
          narrativeEventRecognitionPrompt,
          joinedInput,
          callOptions,
        )
        let quality: NarrativeEventRecognitionQuality = inspectNarrativeEventRecognitionQuality({
          content: response,
          currentContextId: roundContext.contextId,
          currentTotalDays: roundContext.totalDays,
          existingCandidates: recognitionInput.existingCandidates,
        })
        let repairAttempts = 0
        while (!quality.valid && repairAttempts < MAX_FORMAT_REPAIR_ATTEMPTS) {
          repairAttempts += 1
          response = await callStructuredAnalysis('事件识别', eventRecognitionRejection, narrativeEventRecognitionPrompt, joinedInput, {
            ...callOptions,
            extraUserMessages: [buildNarrativeEventRecognitionRepairInstruction(quality, response)],
            logContext: {
              ...baseLogContext,
              callKind: 'narrative-event-recognition-format-repair',
            },
            logMeta: { repairAttempt: repairAttempts },
          })
          quality = inspectNarrativeEventRecognitionQuality({
            content: response,
            currentContextId: roundContext.contextId,
            currentTotalDays: roundContext.totalDays,
            existingCandidates: recognitionInput.existingCandidates,
          })
        }

        if (!quality.valid || !quality.candidates) {
          throw eventRecognitionRejection(
            `事件识别响应经过 ${repairAttempts} 次格式修复后仍无效：${quality.reason}`,
          )
        }
        ctx._recognizedEventCandidates = quality.candidates
        logger.info('narrative-quality', 'event-recognition-response-accepted', {
          round: orchestrator.getState().totalRounds,
          repairAttempts,
          existingCandidateCount: recognitionInput.existingCandidates.length,
          recognizedCandidateCount: quality.candidates.length,
        })
      },
      maxRounds: 1,
    },
    {
      name: 'post-processing',
      phase: 'transition',
      dependsOn: ['ai-data-analysis', 'ai-event-recognition'],
      order: 800,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        if (orchestrator.isPreviewExecution()) return
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._settledNarrative) {
          throw settlementRejection('结算结果未形成唯一提交候选')
        }
        if (!ctx._recognizedEventCandidates) {
          throw eventRecognitionRejection('事件识别结果未形成唯一候选集合')
        }

        const result = orchestrator.handleNarrativeResponse(
          ctx._settledNarrative,
          ctx._recognizedEventCandidates,
        )
        if (ctx._legendaryEncounterInjected && result.narrative) {
          const engineState = useEngineStore.getState()
          engineState.markLegendaryEncounterInjected(engineState.totalRounds)
          void notifyLegendaryEncounterInjected(engineState.lifeRunId, engineState.totalRounds)
            .catch(() => undefined)
        }
        if (result.notableEvents?.length) orchestrator.setLastNotableEvents(result.notableEvents)
        orchestrator.applyWorldDirectionFromNarrative(result.narrative)
        ctx._roundResult = result
      },
      maxRounds: 1,
    },
    {
      name: 'epilogue-check',
      phase: 'transition',
      dependsOn: ['post-processing'],
      order: 900,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: async () => {
        if (!orchestrator.isPreviewExecution()) {
          await orchestrator.checkAndTriggerEpilogue(aiConfig, sessionId)
        }
      },
      maxRounds: 1,
    },
    {
      name: 'compress-save',
      phase: 'finalize',
      dependsOn: ['epilogue-check'],
      order: 1000,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        if (orchestrator.isPreviewExecution()) return
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) {
          throw settlementRejection('终态收束缺少已提交的回合结果')
        }
      },
      maxRounds: 1,
    },
  ]

  return stages
}

export { getWorldRules } from '../../prompts/narrative-prompt'
