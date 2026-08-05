/**
 * Purpose: Declare the default narrative campaign stage graph and AI calls.
 * Owner: mod-engine
 * Responsibility: Stage ordering and result handoff only; subsystem business state stays with its owner.
 *
 * @module campaigns/default/index.ts
 * @description 默认叙事 Campaign：正文接纳后并行启动四类非阻塞后台分析
 * @mod mod-engine
 */

import type {
  AIModelConfig,
  HistoricalEventCandidateInput,
  NarrativeStage,
  PromptTemplate,
  RoundContext,
  SubSystemChanges,
} from '@/foundation'
import {
  buildSegmentedPrompt,
  callAIWithPromptTemplate,
  eventBus,
  isAiResponseTruncatedError,
  recordRoundCacheMetrics,
} from '@/core'
import { logger } from '@/core/logger/client-logger'
import { notifyLegendaryEncounterInjected } from '@/core/player-content/player-content-client'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { DEFAULT_WORD_COUNT_TARGET } from '../../constants/narrative-config'
import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import { buildNarrativeBasicAttributePromptInput } from '../../helpers/narrative-basic-attribute-context'
import { buildNarrativeDataAnalysisPromptInput } from '../../helpers/narrative-data-analysis-context'
import { buildNarrativeEventRecognitionPromptInput } from '../../helpers/narrative-event-recognition-context'
import { buildNarrativeMacroImpactPromptInput } from '../../helpers/narrative-macro-impact-context'
import {
  buildNarrativeRepairInstruction,
  inspectNarrativeBasicAttributeAnalysisQuality,
  inspectNarrativeDataAnalysisQuality,
  inspectNarrativeEventRecognitionQuality,
  inspectNarrativeMacroImpactQuality,
  inspectNarrativeResponseQuality,
  type NarrativeEventRecognitionQuality,
  type NarrativeMacroImpactQuality,
  type NarrativeResponseQuality,
  type NarrativeSystemAnalysisQuality,
} from '../../helpers/narrative-response-quality'
import { buildRecentStoriesForRound, type RecentStoryProjection } from '../../helpers/recent-story-context'
import type { NarrativeRoundMetadata } from '../../helpers/narrative-semantic-signals'
import { narrativeBasicAttributePrompt } from '../../prompts/narrative-basic-attribute-prompt'
import { narrativeDataAnalysisPrompt } from '../../prompts/narrative-data-analysis-prompt'
import { narrativeEventRecognitionPrompt } from '../../prompts/narrative-event-recognition-prompt'
import { narrativeMacroImpactPrompt } from '../../prompts/narrative-macro-impact-prompt'
import { useEngineStore } from '../../store'
import type { ParsedNarrative } from '../../subsystems/narrative-parser-system'
import { orchestrator } from '../../subsystems/orchestrator-system'

const MAX_NARRATIVE_REPAIR_ATTEMPTS = 2
const STRUCTURED_ANALYSIS_REASONING_EFFORT = 'disabled' as const
const STAGE_OWNER = 'mod-engine'
const STAGE_FAILURE_TARGET = 'mod-engine'

/** 阶段运行时上下文：保存正文接纳与后台任务启动所需的本轮不可变值。 */
export interface StageRuntimeContext extends RoundContext {
  _promptContext?: ReturnType<typeof orchestrator.assemblePromptContext>
  _playerChoice?: string
  _eventInjectionText?: string
  _legendaryEncounterInjected?: boolean
  _narrativeResponse?: string
  _narrativeParsed?: ParsedNarrative
  _recentStories?: RecentStoryProjection[]
  _dataChanges?: SubSystemChanges[]
  _basicAttributeChanges?: SubSystemChanges[]
  _eventMetadata?: NarrativeRoundMetadata
  _recognizedEventCandidates?: HistoricalEventCandidateInput[]
  _roundResult?: ReturnType<typeof orchestrator.acceptNarrativeResponse>
  _isPreparedRoundRetry?: boolean
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
    '仅在不影响本轮主线、玩家意图、命运事件和连续性的前提下，把它改写成角色能够接触、并符合当前世界传播媒介与既有因果的一小段信息痕迹。',
    '不得让传闻直接改变主角属性、强制选择或夺取主线；不适合出现时可以完全不用。',
  ].join('\n')
}

function narrativeRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeGenerationRejectedError'
  return error
}

function backgroundAnalysisRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeBackgroundAnalysisRejectedError'
  return error
}

function basicAttributeAnalysisRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeBasicAttributeAnalysisRejectedError'
  return error
}

function dataAnalysisRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeDataAnalysisRejectedError'
  return error
}

type NarrativeBackgroundStageKind =
  | 'basic-attribute'
  | 'data-analysis'
  | 'event-recognition'
  | 'macro-impact'

function runNonBlockingBackgroundLaunch(
  kind: NarrativeBackgroundStageKind,
  narrativeId: string,
  launch: () => void,
): void {
  try {
    launch()
  } catch (error) {
    orchestrator.recordNarrativeBackgroundLaunchFailure({ kind, narrativeId, error })
  }
}

function eventRecognitionRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeEventRecognitionRejectedError'
  return error
}

function macroImpactRejection(message: string): Error {
  const error = new Error(message)
  error.name = 'NarrativeMacroImpactRejectedError'
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

    const rejected = rejection(`${label}响应被 Provider 标记为不完整；该后台分析未提交，已生成正文和其他后台结果不受影响。`)
    Object.assign(rejected, {
      cause: error,
      finishReason: error.finishReason,
      requestId: error.requestId,
      responseLength: error.responseLength,
    })
    throw rejected
  }
}

/**
 * 加载默认 Campaign。预览只缓存第一次严格叙事响应；真实回合先接纳正文，
 * 再并行启动数据、基础属性、事件与宏观影响分析，后台结果跨轮独立提交。
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
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const pending = orchestrator.getPendingNarrativeRoundPreparation()
        if (pending) {
          ctx._isPreparedRoundRetry = true
          ctx._promptContext = pending.promptContext
          ctx._playerChoice = pending.playerChoice
          ctx._eventInjectionText = pending.eventInjectionText
          ctx._legendaryEncounterInjected = pending.legendaryEncounterInjected
          return
        }
        orchestrator.consumeNarrativeBackgroundResults()
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
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (ctx._isPreparedRoundRetry) return
        eventBus.emit('mod-engine:round-start', orchestrator.getRound())
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
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (ctx._isPreparedRoundRetry) return
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
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (ctx._isPreparedRoundRetry) return
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
        if (ctx._isPreparedRoundRetry) return
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
        if (ctx._isPreparedRoundRetry) return
        await orchestrator.refreshNarrativeMemoryRecall()

        const engineState = useEngineStore.getState()
        const encounter = engineState.legendaryEncounter
        const lastNarrative = engineState.narrativeHistory.at(-1)
        const canInjectLegend = encounter?.status === 'selected'
          && engineState.totalRounds >= 2
          && !ctx._eventInjectionText
          && !engineState.forceBranchNext
          && !lastNarrative?.resolvedChoice
        ctx._playerChoice = orchestrator.getPendingPlayerChoice()
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
        orchestrator.setPendingNarrativeRoundPreparation({
          roundSequence: orchestrator.getState().totalRounds,
          promptContext: ctx._promptContext,
          playerChoice: ctx._playerChoice,
          eventInjectionText: ctx._eventInjectionText,
          legendaryEncounterInjected: ctx._legendaryEncounterInjected,
        })
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
        const state = orchestrator.getState()
        const repetitionContext = {
          round: state.totalRounds,
          recentHistory: state.narrativeHistory.map((entry, index) => ({
            round: Math.max(1, state.totalRounds - state.narrativeHistory.length + index),
            text: entry.text,
          })),
        }
        const cachedNarrative = ctx._isPreparedRoundRetry
          ? null
          : orchestrator.consumePrefetchedNarrative()
        const prefetched = ctx._legendaryEncounterInjected ? null : cachedNarrative
        let response: string | undefined
        let quality: NarrativeResponseQuality | undefined
        let source: 'live' | 'prefetched' = 'live'

        if (prefetched) {
          const prefetchedQuality = inspectNarrativeResponseQuality(
            prefetched,
            wordCountTarget,
            repetitionContext,
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
            executionKind: 'real',
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
            userSegments: segments.userSegments,
            logContext: baseLogContext,
            ...routeOptions,
            ...(settings.storySeed.trim() ? { storySeed: settings.storySeed.trim() } : {}),
          }

          response = await callAIWithPromptTemplate(promptTemplate, segments.full, callOptions)
          quality = inspectNarrativeResponseQuality(response, wordCountTarget, repetitionContext)
          while (!quality.valid && repairAttempts < MAX_NARRATIVE_REPAIR_ATTEMPTS) {
            repairAttempts += 1
            const repairKind = quality.repetitionMetric?.qualityLevel === 'high'
              ? 'narrative-repetition-repair'
              : 'narrative-format-repair'
            repairKinds.push(repairKind)
            response = await callAIWithPromptTemplate(promptTemplate, segments.full, {
              ...callOptions,
              overrideTemperature: 0,
              extraUserMessages: [
                `${buildNarrativeRepairInstruction(quality, wordCountTarget, requestBranch)}\n\n⟦上一版叙事响应⟧${response}`,
              ],
              logContext: {
                ...baseLogContext,
                callKind: repairKind,
              },
              logMeta: { repairAttempt: repairAttempts },
            })
            quality = inspectNarrativeResponseQuality(response, wordCountTarget, repetitionContext)
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
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._narrativeParsed) {
          throw narrativeRejection('正文发布缺少已经严格解析的第一次响应')
        }
        const state = orchestrator.getState()
        const roundContext = orchestrator.getRoundContextSnapshot()
        const roundSequence = roundContext.roundSequence ?? state.totalRounds
        const executionId = `narrative-round:${state.lifeRunId}:${roundSequence}:real`
        ctx._recentStories = buildRecentStoriesForRound({
          history: state.narrativeHistory,
          currentRound: roundSequence,
          currentStory: {
            text: ctx._narrativeParsed.narrative,
            totalDays: roundContext.totalDays,
            timeLabel: ctx._promptContext?.currentTime,
            branchTitle: ctx._narrativeParsed.branchTitle,
            branchOptions: ctx._narrativeParsed.branchOptions,
          },
        })
        useEngineStore.getState().setPendingNarrative({
          executionId,
          roundSequence,
          text: ctx._narrativeParsed.narrative,
          timestamp: Date.now(),
          status: 'pending',
          statusCode: 'narrative-round:publish-narrative:running',
        })
        try {
          ctx._roundResult = orchestrator.acceptNarrativeResponse(
            ctx._narrativeParsed,
            ctx._playerChoice,
          )
        } catch (error) {
          useEngineStore.getState().clearPendingNarrative(executionId)
          throw error
        }
        const result = ctx._roundResult
        if (ctx._legendaryEncounterInjected && result.narrative) {
          const engineState = useEngineStore.getState()
          engineState.markLegendaryEncounterInjected(engineState.totalRounds)
          void notifyLegendaryEncounterInjected(engineState.lifeRunId, engineState.totalRounds)
            .catch(() => undefined)
        }
      },
      onExit: () => {
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
      onUpdate: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) throw dataAnalysisRejection('数据分析缺少已接纳正文')
        const accepted = ctx._roundResult
        runNonBlockingBackgroundLaunch('data-analysis', accepted.narrativeId, () => {
          if (!ctx._narrativeParsed || !ctx._recentStories) {
            throw dataAnalysisRejection('数据分析缺少已经严格解析的故事或最近故事上下文')
          }

          const analysisInput = buildNarrativeDataAnalysisPromptInput({
            subsystemStates: orchestrator.getSubsystemStateSnapshot(),
            roundContext: orchestrator.getRoundContextSnapshot(),
            recentStories: ctx._recentStories,
          })
          const settings = useSettingsStore.getState()
          const model = settings.customModel || aiConfig.model
          const joinedInput = analysisInput.userSegments.join('\n\n')
          const baseLogContext = {
            lifeRunId: orchestrator.getState().lifeRunId,
            round: orchestrator.getState().totalRounds,
            strategy: 'S4',
            callKind: 'narrative-data-analysis',
            pool: 'narrative',
            model,
            sessionId,
            executionKind: 'real',
            promptVersion: narrativeDataAnalysisPrompt.version,
          }
          const callOptions = {
            config: {
              ...aiConfig,
              model,
              reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
            },
            pool: 'narrative' as const,
            strictSchema: true,
            sessionId,
            providerId: settings.provider,
            customBaseUrl: settings.customUrl || undefined,
            customModel: model,
            apiKey: settings.customKey || undefined,
            userSegments: analysisInput.userSegments,
            overrideTemperature: 0,
            reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
            logContext: baseLogContext,
          }

          orchestrator.launchNarrativeBackgroundAnalysis({
            kind: 'data-analysis',
            narrativeId: accepted.narrativeId,
            userSegments: analysisInput.userSegments,
            work: async () => {
              const response = await callStructuredAnalysis(
                '数据分析',
                dataAnalysisRejection,
                narrativeDataAnalysisPrompt,
                joinedInput,
                callOptions,
              )
              const quality: NarrativeSystemAnalysisQuality = inspectNarrativeDataAnalysisQuality({
                content: response,
                allowedEvidenceEventIds: analysisInput.allowedEvidenceEventIds,
                allowedSubsystemIds: analysisInput.activeSubsystemIds,
              })
              if (!quality.valid || !quality.changes) {
                throw dataAnalysisRejection(
                  `数据分析响应未通过 JSON Schema 或业务契约：${quality.reason}`,
                )
              }
              logger.info('narrative-quality', 'data-analysis-response-accepted', {
                round: accepted.roundSequence,
                validationOwner: 'ai-client-json-schema',
                activeSubsystemCount: analysisInput.activeSubsystemIds.length,
                changeCount: quality.changes.length,
              })
              return { changes: quality.changes }
            },
          })
        })
      },
      maxRounds: 1,
    },
    {
      name: 'ai-basic-attribute-analysis',
      phase: 'execute',
      dependsOn: ['publish-narrative'],
      order: 700,
      parallelGroup: 'narrative-background-analysis',
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) throw basicAttributeAnalysisRejection('基础属性分析缺少已接纳正文')
        const accepted = ctx._roundResult
        runNonBlockingBackgroundLaunch('basic-attribute', accepted.narrativeId, () => {
          if (!ctx._recentStories) {
            throw basicAttributeAnalysisRejection('基础属性分析缺少最近故事上下文')
          }

          const analysisInput = buildNarrativeBasicAttributePromptInput({
            subsystemStates: orchestrator.getSubsystemStateSnapshot(),
            character: orchestrator.getCharacterStateSnapshot(),
            roundContext: orchestrator.getRoundContextSnapshot(),
            recentStories: ctx._recentStories,
          })
          const settings = useSettingsStore.getState()
          const model = settings.customModel || aiConfig.model
          const joinedInput = analysisInput.userSegments.join('\n\n')
          const baseLogContext = {
            lifeRunId: orchestrator.getState().lifeRunId,
            round: orchestrator.getState().totalRounds,
            strategy: 'S4',
            callKind: 'narrative-basic-attribute-analysis',
            pool: 'narrative',
            model,
            sessionId,
            executionKind: 'real',
            promptVersion: narrativeBasicAttributePrompt.version,
          }
          const callOptions = {
            config: {
              ...aiConfig,
              model,
              reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
            },
            pool: 'narrative' as const,
            strictSchema: true,
            sessionId,
            providerId: settings.provider,
            customBaseUrl: settings.customUrl || undefined,
            customModel: model,
            apiKey: settings.customKey || undefined,
            userSegments: analysisInput.userSegments,
            overrideTemperature: 0,
            reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
            logContext: baseLogContext,
          }

          orchestrator.launchNarrativeBackgroundAnalysis({
            kind: 'basic-attribute',
            narrativeId: accepted.narrativeId,
            userSegments: analysisInput.userSegments,
            work: async () => {
              const response = await callStructuredAnalysis(
                '基础属性分析',
                basicAttributeAnalysisRejection,
                narrativeBasicAttributePrompt,
                joinedInput,
                callOptions,
              )
              const quality: NarrativeSystemAnalysisQuality = inspectNarrativeBasicAttributeAnalysisQuality({
                content: response,
                allowedEvidenceEventIds: analysisInput.allowedEvidenceEventIds,
                allowedSubsystemIds: analysisInput.activeSubsystemIds,
              })
              if (!quality.valid || !quality.changes) {
                throw basicAttributeAnalysisRejection(
                  `基础属性分析响应未通过 JSON Schema 或业务契约：${quality.reason}`,
                )
              }
              logger.info('narrative-quality', 'basic-attribute-analysis-response-accepted', {
                round: accepted.roundSequence,
                validationOwner: 'ai-client-json-schema',
                changeCount: quality.changes.length,
              })
              return { changes: quality.changes }
            },
          })
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
      onUpdate: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) throw eventRecognitionRejection('事件识别缺少已接纳正文')
        const accepted = ctx._roundResult
        runNonBlockingBackgroundLaunch('event-recognition', accepted.narrativeId, () => {
          if (!ctx._narrativeParsed || !ctx._recentStories) {
            throw eventRecognitionRejection('事件识别缺少已经严格解析的故事或最近故事上下文')
          }

        const roundContext = orchestrator.getRoundContextSnapshot()
        const existingCandidates = orchestrator.getAvailableHistoricalEventCandidates()
        const recognitionInput = buildNarrativeEventRecognitionPromptInput({
          subsystemStates: orchestrator.getSubsystemStateSnapshot(),
          roundContext,
          existingCandidates,
          recentStories: ctx._recentStories,
          deliveredCausalEventIds: accepted.deliveredCausalEventIds,
        })
        const settings = useSettingsStore.getState()
        const model = settings.customModel || aiConfig.model
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
            reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          },
          pool: 'narrative' as const,
          strictSchema: true,
          sessionId,
          providerId: settings.provider,
          customBaseUrl: settings.customUrl || undefined,
          customModel: model,
          apiKey: settings.customKey || undefined,
          userSegments: recognitionInput.userSegments,
          overrideTemperature: 0,
          reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          logContext: baseLogContext,
        }

        orchestrator.launchNarrativeBackgroundAnalysis({
          kind: 'event-recognition',
          narrativeId: accepted.narrativeId,
          userSegments: recognitionInput.userSegments,
          work: async () => {
            const response = await callStructuredAnalysis(
              '事件识别',
              eventRecognitionRejection,
              narrativeEventRecognitionPrompt,
              joinedInput,
              callOptions,
            )
            const quality: NarrativeEventRecognitionQuality = inspectNarrativeEventRecognitionQuality({
              content: response,
              narrative: ctx._narrativeParsed!,
              currentContextId: roundContext.contextId,
              currentTotalDays: roundContext.totalDays,
              existingCandidates: recognitionInput.existingCandidates,
              deliveredCausalEventIds: accepted.deliveredCausalEventIds,
            })
            if (!quality.valid || !quality.metadata || !quality.candidates) {
              throw eventRecognitionRejection(
                `事件识别响应未通过 JSON Schema 或业务契约：${quality.reason}`,
              )
            }
            logger.info('narrative-quality', 'event-recognition-response-accepted', {
              round: accepted.roundSequence,
              validationOwner: 'ai-client-json-schema',
              existingCandidateCount: recognitionInput.existingCandidates.length,
              recognizedCandidateCount: quality.candidates.length,
            })
            return {
              metadata: quality.metadata,
              candidates: quality.candidates,
            }
          },
        })
        })
      },
      maxRounds: 1,
    },
    {
      name: 'ai-macro-impact',
      phase: 'execute',
      dependsOn: ['publish-narrative'],
      order: 700,
      parallelGroup: 'narrative-background-analysis',
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) throw macroImpactRejection('宏观影响分析缺少已接纳正文')
        const accepted = ctx._roundResult
        runNonBlockingBackgroundLaunch('macro-impact', accepted.narrativeId, () => {
          if (!ctx._narrativeParsed || !ctx._recentStories) {
            throw macroImpactRejection('宏观影响分析缺少已经接纳的故事或最近故事上下文')
          }

        const roundContext = orchestrator.getRoundContextSnapshot()
        const analysisInput = buildNarrativeMacroImpactPromptInput({
          subsystemStates: orchestrator.getSubsystemStateSnapshot(),
          roundContext,
          recentStories: ctx._recentStories,
        })
        const settings = useSettingsStore.getState()
        const model = settings.customModel || aiConfig.model
        const joinedInput = analysisInput.userSegments.join('\n\n')
        const callOptions = {
          config: {
            ...aiConfig,
            model,
            reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          },
          pool: 'narrative' as const,
          strictSchema: true,
          sessionId,
          providerId: settings.provider,
          customBaseUrl: settings.customUrl || undefined,
          customModel: model,
          apiKey: settings.customKey || undefined,
          userSegments: analysisInput.userSegments,
          overrideTemperature: 0,
          reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
          logContext: {
            lifeRunId: orchestrator.getState().lifeRunId,
            round: accepted.roundSequence,
            strategy: 'S4',
            callKind: 'narrative-macro-impact',
            pool: 'narrative',
            model,
            sessionId,
            executionKind: 'real',
            promptVersion: narrativeMacroImpactPrompt.version,
          },
        }

        orchestrator.launchNarrativeBackgroundAnalysis({
          kind: 'macro-impact',
          narrativeId: accepted.narrativeId,
          userSegments: analysisInput.userSegments,
          work: async () => {
            const response = await callStructuredAnalysis(
              '宏观影响分析',
              macroImpactRejection,
              narrativeMacroImpactPrompt,
              joinedInput,
              callOptions,
            )
            const quality: NarrativeMacroImpactQuality = inspectNarrativeMacroImpactQuality({
              content: response,
              activeSubsystemIds: analysisInput.activeSubsystemIds,
              allowedEvidenceEventIds: analysisInput.allowedEvidenceEventIds,
              currentContextId: roundContext.contextId,
            })
            if (!quality.valid || !quality.changes) {
              throw macroImpactRejection(
                `宏观影响响应未通过 DAG、字段或证据契约：${quality.reason}`,
              )
            }
            logger.info('narrative-quality', 'macro-impact-response-accepted', {
              round: accepted.roundSequence,
              validationOwner: 'macro-impact-local-dag',
              activeSubsystemCount: analysisInput.activeSubsystemIds.length,
              impactNodeCount: quality.nodes?.length ?? 0,
            })
            return { changes: quality.changes }
          },
        })
        })
      },
      maxRounds: 1,
    },
    {
      name: 'post-processing',
      phase: 'transition',
      dependsOn: [
        'ai-basic-attribute-analysis',
        'ai-data-analysis',
        'ai-event-recognition',
        'ai-macro-impact',
      ],
      order: 800,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) throw backgroundAnalysisRejection('回合收束缺少已接纳正文')
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
      onEnter: () => {
        void orchestrator.checkAndTriggerEpilogue(aiConfig, sessionId)
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
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._roundResult) {
          throw backgroundAnalysisRejection('终态收束缺少已提交的回合结果')
        }
        await orchestrator.ensureCompressionGate()
      },
      maxRounds: 1,
    },
  ]

  return stages
}

export { getWorldRules } from '../../prompts/narrative-prompt'
