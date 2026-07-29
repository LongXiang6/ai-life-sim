/**
 * @module campaigns/default/index.ts
 * @description 默认叙事 Campaign：叙事生成后串行执行结构化结算
 * @mod mod-engine
 */

import type {
  AIModelConfig,
  NarrativeStage,
  PromptTemplate,
  RoundContext,
} from '@/foundation'
import {
  buildSegmentedPrompt,
  callAIWithPromptTemplate,
  computeNarrativeSettlementTokenBudget,
  eventBus,
  recordRoundCacheMetrics,
} from '@/core'
import { logger } from '@/core/logger/client-logger'
import { notifyLegendaryEncounterInjected } from '@/core/player-content/player-content-client'
import { useSettingsStore } from '@/mods/mod-settings'

import { DEFAULT_WORD_COUNT_TARGET } from '../../constants/narrative-config'
import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import { buildSettlementBranchIntentInstruction } from '../../helpers/branch-intent-resolution'
import { buildNarrativeSettlementPromptInput } from '../../helpers/narrative-settlement-context'
import {
  buildNarrativeRepairInstruction,
  buildNarrativeSettlementRepairInstruction,
  inspectNarrativeResponseQuality,
  inspectNarrativeSettlementQuality,
  type NarrativeResponseQuality,
  type NarrativeSettlementQuality,
} from '../../helpers/narrative-response-quality'
import { narrativeSettlementPrompt } from '../../prompts/narrative-settlement-prompt'
import { useEngineStore } from '../../store'
import {
  type ParsedNarrative,
} from '../../subsystems/narrative-parser-system'
import { orchestrator } from '../../subsystems/orchestrator-system'

const MAX_FORMAT_REPAIR_ATTEMPTS = 2

/** 阶段运行时上下文：只保存本轮两次调用之间的临时值。 */
export interface StageRuntimeContext extends RoundContext {
  _promptContext?: ReturnType<typeof orchestrator.assemblePromptContext>
  _eventInjectionText?: string
  _legendaryEncounterInjected?: boolean
  _narrativeResponse?: string
  _narrativeParsed?: ParsedNarrative
  _settledNarrative?: ParsedNarrative
  _roundResult?: ReturnType<typeof orchestrator.handleNarrativeResponse>
}

function buildLegendaryEncounterGuidance(
  encounter: NonNullable<ReturnType<typeof useEngineStore.getState>['legendaryEncounter']>,
): string {
  const representative = encounter.achievements.find((item) => item.kind === 'breakthrough')
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

/**
 * 加载默认 Campaign。预览执行到第一次严格叙事响应后停止；真实回合继续
 * 串行结算，只有合并结果完整提交后才产生玩家可见正文。
 */
export function loadStages(
  aiConfig: AIModelConfig,
  promptTemplate: PromptTemplate,
  sessionId?: string,
): NarrativeStage[] {
  const stages: NarrativeStage[] = [
    {
      name: 'advance-time',
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
      onEnter: () => {
        if (!orchestrator.isPreviewExecution()) orchestrator.advanceAllSubsystems()
      },
      maxRounds: 1,
    },
    {
      name: 'collect-states',
      onEnter: () => {
        orchestrator.collectAllSubsystemStates()
      },
      maxRounds: 1,
    },
    {
      name: 'event-lifecycle',
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
      name: 'cross-domain',
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (orchestrator.isPreviewExecution()) return

        const hadMacroEvents = Boolean(ctx._eventInjectionText)
        await orchestrator.executeCrossDomainLinkage()
        orchestrator.collectAllSubsystemStates(false)
        if (!hadMacroEvents) return

        const lifecycle = buildEventInjectionText(
          orchestrator.getDetectionStates(),
          orchestrator.getEventLifecycle(),
          orchestrator.getState().totalRounds,
        )
        orchestrator.setEventLifecycle(lifecycle.newLifecycle)
        if (lifecycle.eventInjectionText) {
          ctx._eventInjectionText = [ctx._eventInjectionText, lifecycle.eventInjectionText]
            .filter(Boolean)
            .join('\n')
        }
      },
      maxRounds: 1,
    },
    {
      name: 'assemble-prompt',
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
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._promptContext) throw narrativeRejection('第一次调用缺少叙事上下文')

        const settings = useSettingsStore.getState()
        const wordCountTarget = settings.wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
        const requestBranch = useEngineStore.getState().forceBranchNext
        const activeStyle = orchestrator.getNarrativeStyleSnapshot()
        const prefetched = ctx._legendaryEncounterInjected
          ? null
          : orchestrator.consumePrefetchedNarrative()
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
      name: 'ai-settlement',
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
          reasoningEffort: aiConfig.reasoningEffort ?? settings.reasoningEffort,
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
          config: { ...aiConfig, model, maxTokens: settlementMaxTokens },
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
          logContext: baseLogContext,
        }

        let response = await callAIWithPromptTemplate(
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
          response = await callAIWithPromptTemplate(narrativeSettlementPrompt, joinedInput, {
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
      name: 'post-processing',
      onEnter: (_ctx) => {
        if (orchestrator.isPreviewExecution()) return
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._settledNarrative) {
          throw settlementRejection('结算结果未形成唯一提交候选')
        }

        const result = orchestrator.handleNarrativeResponse(ctx._settledNarrative)
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
      onEnter: async () => {
        if (!orchestrator.isPreviewExecution()) {
          await orchestrator.checkAndTriggerEpilogue(aiConfig, sessionId)
        }
      },
      maxRounds: 1,
    },
    {
      name: 'compress-save',
      maxRounds: 1,
    },
  ]

  return stages
}

export { getWorldRules } from '../../prompts/narrative-prompt'
