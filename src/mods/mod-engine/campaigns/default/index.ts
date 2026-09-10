/**
 * Purpose: Declare the default narrative round as one main-story call plus active parallel specialist calls.
 * Owner: mod-engine
 * Responsibility: Stage ordering, frozen-input handoff, deterministic commit, and reverse recovery only.
 *
 * @module campaigns/default/index.ts
 * @description 默认叙事 Campaign：主故事通过协议后立即发布，活动专项分析随后并行收束
 * @mod mod-engine
 */

import type {
  AIModelConfig,
  NarrativeStage,
  PromptTemplate,
  RoundContext,
} from '@/foundation'
import {
  callAIWithPromptTemplate,
  eventBus,
  isAiResponseTruncatedError,
} from '@/core'
import { logger } from '@/core/logger/client-logger'
import { notifyLegendaryEncounterInjected } from '@/core/player-content/player-content-client'
import { useCharacterStore } from '@/mods/mod-character'
import { getCharacterBaseSystem } from '@/mods/mod-character/subsystems/character-base-system'
import {
  captureDestinyPatternGrowthTransaction,
  commitPreparedDestinyPatternGrowthChoice,
  createPendingDestinyPatternGrowth,
  getDestinyPatternSystem,
  prepareDestinyPatternGrowthChoice,
  restoreDestinyPatternGrowthTransaction,
  type DestinyPatternGrowthDirection,
  type PreparedDestinyPatternGrowthChoice,
} from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import {
  executeMainNarrativeRequest,
  prepareMainNarrativeRequest,
} from '../../helpers/main-narrative-call'
import {
  startNarrativePreGeneration,
  takeNarrativePreGeneration,
} from '../../helpers/narrative-pre-generation'
import {
  buildNarrativeStoryContinuityPromptInput,
  type NarrativeStoryContinuityPromptInput,
} from '../../helpers/narrative-story-continuity-context'
import {
  buildNarrativeEventLibraryPromptInput,
  type NarrativeEventLibraryPromptInput,
} from '../../helpers/narrative-event-library-context'
import {
  inspectNarrativeStoryContinuityQuality,
  inspectNarrativeTalentGrowthQuality,
  inspectNarrativeEventLibraryQuality,
} from '../../helpers/narrative-response-quality'
import {
  buildAllStoriesForRound,
  buildRecentStoriesForRound,
  type RecentStoryProjection,
} from '../../helpers/recent-story-context'
import {
  buildNarrativeTalentGrowthPromptInput,
  getDestinyPatternMinimumEvidenceWindows,
  type NarrativeTalentGrowthPromptInput,
} from '../../helpers/narrative-talent-growth-context'
import { narrativeStoryContinuityPrompt } from '../../prompts/narrative-story-continuity-prompt'
import { narrativeTalentGrowthPrompt } from '../../prompts/narrative-talent-growth-prompt'
import { narrativeEventLibraryPrompt } from '../../prompts/narrative-event-library-prompt'
import { prepareNarrativeRoundPromptContext } from '../../helpers/narrative-round-prompt-preparation'
import { useEngineStore } from '../../store'
import type { ParsedNarrative } from '../../subsystems/narrative-parser-system'
import { orchestrator, type AcceptedNarrativeResult } from '../../subsystems/orchestrator-system'
import type { NarrativeChunk } from '../../types'

const STRUCTURED_ANALYSIS_REASONING_EFFORT = 'disabled' as const
const STAGE_OWNER = 'mod-engine'
const STAGE_FAILURE_TARGET = 'mod-engine'
const SPECIALIST_PARALLEL_GROUP = 'narrative-specialists'

type PreparedStoryContinuity = ReturnType<typeof orchestrator.prepareNarrativeStoryContinuity>
type PreparedStoryContinuityLedger = ReturnType<typeof orchestrator.prepareNarrativeStoryContinuityLedger>

/** One execution owns these values; parallel stages only write their dedicated result slot. */
export interface StageRuntimeContext extends RoundContext {
  _promptContext?: ReturnType<typeof orchestrator.assemblePromptContext>
  _playerChoice?: string
  _eventInjectionText?: string
  _legendaryEncounterInjected?: boolean
  _narrativeResponse?: string
  _narrativeParsed?: ParsedNarrative
  _preparedNarrative?: AcceptedNarrativeResult
  _committedRoundResult?: AcceptedNarrativeResult
  _recentStories?: RecentStoryProjection[]
  _frozenRoundContext?: RoundContext
  _frozenNarrativeHistory?: NarrativeChunk[]
  _talentInput?: NarrativeTalentGrowthPromptInput
  _continuityInput?: NarrativeStoryContinuityPromptInput
  _eventLibraryInput?: NarrativeEventLibraryPromptInput
  _preparedTalentGrowth?: PreparedDestinyPatternGrowthChoice | null
  _preparedStoryContinuity?: PreparedStoryContinuity
  _preparedStoryContinuityLedger?: PreparedStoryContinuityLedger
  _storyContinuityFailureReason?: string
  _storyContinuityLedgerFailureReason?: string
  _isPreparedRoundReattempt?: boolean
}

function rejectedError(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.name = name
  return error
}

function narrativeRejection(message: string, cause?: unknown): Error {
  return rejectedError('NarrativeGenerationRejectedError', message, cause)
}

function specialistRejection(kind: string, label: string, message: string, cause?: unknown): Error {
  return rejectedError(`Narrative${kind}RejectedError`, `${label}${message}`, cause)
}

async function callStructuredSpecialist(input: {
  label: string
  errorKind: string
  callKind: string
  prompt: PromptTemplate
  userSegments: readonly string[]
  aiConfig: AIModelConfig
  sessionId?: string
}): Promise<string> {
  const settings = useSettingsStore.getState()
  const model = settings.customModel || input.aiConfig.model
  const userPrompt = input.userSegments.join('\n\n')
  try {
    return await callAIWithPromptTemplate(input.prompt, userPrompt, {
      config: {
        ...input.aiConfig,
        model,
        reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
      },
      pool: 'narrative',
      sessionId: input.sessionId,
      providerId: settings.provider,
      customBaseUrl: settings.customUrl || undefined,
      customModel: model,
      apiKey: settings.customKey || undefined,
      userSegments: [...input.userSegments],
      overrideTemperature: 0,
      reasoningEffort: STRUCTURED_ANALYSIS_REASONING_EFFORT,
      logContext: {
        lifeRunId: orchestrator.getState().lifeRunId,
        round: orchestrator.getState().totalRounds,
        strategy: 'S4',
        callKind: input.callKind,
        pool: input.callKind,
        model,
        sessionId: input.sessionId,
        executionKind: 'real',
        promptVersion: input.prompt.version,
      },
    })
  } catch (error) {
    if (!isAiResponseTruncatedError(error) || !error.content?.trim()) throw error
    logger.info('narrative-quality', 'specialist-truncated-content-recovered', {
      label: input.label,
      responseLength: error.content.length,
    })
    return error.content
  }
}

function requirePreparedNarrative(ctx: StageRuntimeContext, label: string): AcceptedNarrativeResult {
  if (!ctx._preparedNarrative) {
    throw specialistRejection('SpecialistInput', label, '缺少已准备的主故事。')
  }
  return ctx._preparedNarrative
}

async function restoreCommittedSteps(
  steps: Array<() => void | Promise<void>>,
  originalError: unknown,
): Promise<never> {
  const restoreErrors: unknown[] = []
  for (const restore of [...steps].reverse()) {
    try {
      await restore()
    } catch (error) {
      restoreErrors.push(error)
    }
  }
  try {
    orchestrator.refreshCommittedSubsystemStateSnapshot()
  } catch (error) {
    restoreErrors.push(error)
  }
  if (restoreErrors.length > 0) {
    throw new AggregateError(
      [originalError, ...restoreErrors],
      '回合提交失败，且至少一个所属系统未能完整恢复事务快照。',
    )
  }
  throw originalError
}

function buildFrozenSpecialistInputs(ctx: StageRuntimeContext): void {
  if (!ctx._narrativeParsed || !ctx._preparedNarrative || !ctx._promptContext) {
    throw narrativeRejection('专项调用输入缺少已经严格解析并准备的主故事。')
  }
  const roundContext = orchestrator.getRoundContextSnapshot()
  const engineState = orchestrator.getState()
  const narrativeHistory = structuredClone(engineState.narrativeHistory)
  const recentStories = buildRecentStoriesForRound({
    history: narrativeHistory,
    currentRound: ctx._preparedNarrative.roundSequence,
    currentStory: {
      text: ctx._narrativeParsed.narrative,
      totalBasePoints: roundContext.totalBasePoints,
      timeLabel: ctx._promptContext.currentTime,
      branchTitle: ctx._narrativeParsed.branchTitle,
      branchOptions: ctx._narrativeParsed.branchOptions,
    },
  })
  const continuityStories = buildAllStoriesForRound({
    history: narrativeHistory,
    currentRound: ctx._preparedNarrative.roundSequence,
    currentStory: {
      text: ctx._narrativeParsed.narrative,
      totalBasePoints: roundContext.totalBasePoints,
      timeLabel: ctx._promptContext.currentTime,
    },
  })
  const currentNarrative: NarrativeChunk = {
    text: ctx._narrativeParsed.narrative,
    isComplete: true,
    timestamp: Date.now(),
    contextId: roundContext.contextId,
    memoryScope: 'context',
    totalBasePoints: roundContext.totalBasePoints,
    totalDays: roundContext.totalDays,
    displayTimeLabel: ctx._promptContext.currentTime,
    branchTitle: ctx._narrativeParsed.branchTitle,
    branchOptions: ctx._narrativeParsed.branchOptions,
  }

  ctx._frozenRoundContext = structuredClone(roundContext)
  ctx._frozenNarrativeHistory = narrativeHistory
  ctx._recentStories = recentStories
  ctx._talentInput = buildNarrativeTalentGrowthPromptInput({
    patterns: getDestinyPatternSystem().getPatterns(),
    compressedSummaries: structuredClone(engineState.compressedSummaries),
    recentStories,
    currentRound: ctx._preparedNarrative.roundSequence,
    totalBasePoints: roundContext.totalBasePoints,
    currentAge: Number(ctx._promptContext.characterStatusView.年龄),
    growthHistory: structuredClone(useCharacterStore.getState().destinyPatterns.growthHistory),
    characterContext: {
      ...structuredClone(ctx._promptContext.characterProfileView),
      当前年龄: ctx._promptContext.characterStatusView.年龄,
    },
    worldContext: {
      世界: structuredClone(ctx._promptContext.worldNarrativeView),
      当前时间: ctx._promptContext.currentTime,
    },
  })
  ctx._continuityInput = buildNarrativeStoryContinuityPromptInput({
    currentRound: ctx._preparedNarrative.roundSequence,
    currentNarrative,
    narrativeHistory,
    compressedSummaries: structuredClone(engineState.compressedSummaries),
    compressionStats: structuredClone(engineState.compressionStats),
    recentStories: continuityStories,
  })
  ctx._eventLibraryInput = buildNarrativeEventLibraryPromptInput({
    currentRound: ctx._preparedNarrative.roundSequence,
    currentNarrative,
    compressedSummaries: structuredClone(engineState.compressedSummaries),
    recentStories,
    worldNarrativeView: structuredClone(ctx._promptContext.worldNarrativeView),
    worldFactsText: orchestrator.getConfirmedWorldFacts(),
    currentTime: ctx._promptContext.currentTime,
    timeScaleText: ctx._promptContext.timeGuideText,
  })
}

/** Load the only active round graph. */
export function loadStages(
  aiConfig: AIModelConfig,
  promptTemplate: PromptTemplate,
  sessionId?: string,
): NarrativeStage[] {
  return [
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
          ctx._isPreparedRoundReattempt = true
          ctx._promptContext = pending.promptContext
          ctx._playerChoice = pending.playerChoice
          ctx._eventInjectionText = pending.eventInjectionText
          ctx._legendaryEncounterInjected = pending.legendaryEncounterInjected
          return
        }
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
        if (ctx._isPreparedRoundReattempt) return
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
        if (!ctx._isPreparedRoundReattempt) await orchestrator.advanceAllSubsystems()
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
        if (!ctx._isPreparedRoundReattempt) await orchestrator.collectAllSubsystemStates()
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
        if (ctx._isPreparedRoundReattempt) return
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
        if (ctx._isPreparedRoundReattempt) return

        const prepared = prepareNarrativeRoundPromptContext(orchestrator, ctx._eventInjectionText)
        ctx._playerChoice = prepared.playerChoice
        ctx._promptContext = prepared.promptContext
        ctx._legendaryEncounterInjected = prepared.legendaryEncounterInjected
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
        if (!ctx._promptContext) throw narrativeRejection('主故事调用缺少叙事上下文。')

        const state = orchestrator.getState()
        const request = prepareMainNarrativeRequest({
          owner: orchestrator,
          promptTemplate,
          promptContext: ctx._promptContext,
          aiConfig,
          sessionId,
        })
        let response: string
        let quality
        let source: 'live' | 'preview' = 'live'
        try {
          const preGenerated = await takeNarrativePreGeneration(request)
          const result = preGenerated ?? await executeMainNarrativeRequest(request, 'real')
          if (preGenerated) source = 'preview'
          response = result.response
          quality = result.quality
        } catch (error) {
          orchestrator.noteNarrativeQuality({
            source,
            finalValid: false,
            acceptedNarrativeBody: false,
            finalReason: error instanceof Error ? error.message : String(error),
          })
          throw error
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
        })
        logger.info('narrative-quality', 'narrative-response-accepted', {
          round: state.totalRounds,
          source,
          narrativeChars: quality.narrativeChars,
        })
      },
      maxRounds: 1,
    },
    {
      name: 'prepare-narrative',
      phase: 'execute',
      dependsOn: ['ai-narration'],
      order: 650,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._narrativeParsed) {
          throw narrativeRejection('主故事准备缺少已经严格解析的响应。')
        }
        ctx._preparedNarrative = orchestrator.prepareNarrativeResponse(
          ctx._narrativeParsed,
          ctx._playerChoice,
        )
        const prepared = ctx._preparedNarrative
        const executionId = `narrative-round:${orchestrator.getState().lifeRunId}:${prepared.roundSequence}:real`
        useEngineStore.getState().setPendingNarrative({
          executionId,
          roundSequence: prepared.roundSequence,
          status: 'pending',
          statusCode: 'narrative-round:prepare-narrative:running',
        })
        buildFrozenSpecialistInputs(ctx)
        ctx._committedRoundResult = orchestrator.commitNarrativeResponse(prepared.narrativeId)
        useEngineStore.getState().updatePendingNarrative(
          executionId,
          'committing',
          'narrative-round:post-story-analysis:running',
        )

        if (ctx._legendaryEncounterInjected && ctx._committedRoundResult.narrative) {
          const engineState = useEngineStore.getState()
          engineState.markLegendaryEncounterInjected(engineState.totalRounds)
          void notifyLegendaryEncounterInjected(engineState.lifeRunId, engineState.totalRounds)
            .catch(() => undefined)
        }
      },
      maxRounds: 1,
    },
    {
      name: 'ai-story-continuity',
      phase: 'execute',
      dependsOn: ['prepare-narrative'],
      order: 700,
      parallelGroup: SPECIALIST_PARALLEL_GROUP,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const prepared = requirePreparedNarrative(ctx, '故事连续性')
        if (!ctx._continuityInput) {
          ctx._preparedStoryContinuity = orchestrator.prepareNarrativeStoryContinuity({
            narrativeId: prepared.narrativeId,
            sourceRounds: [],
            result: null,
            rawResponse: '',
          })
          ctx._preparedStoryContinuityLedger = orchestrator.prepareNarrativeStoryContinuityLedger(
            prepared.narrativeId,
            { 本轮剧情: [], 未来事件: [] },
            {
              label: ctx._promptContext?.currentTime ?? '当前时间',
              totalBasePoints: null,
              totalDays: null,
            },
          )
          logger.info('narrative-quality', 'story-continuity-call-skipped', {
            round: prepared.roundSequence,
            reason: '近期正文未超过十轮或尚未到五轮压缩间隔',
          })
          return
        }
        try {
          const response = await callStructuredSpecialist({
            label: '故事连续性',
            errorKind: 'StoryContinuity',
            callKind: 'narrative-story-continuity',
            prompt: narrativeStoryContinuityPrompt,
            userSegments: ctx._continuityInput.userSegments,
            aiConfig,
            sessionId,
          })
          const quality = inspectNarrativeStoryContinuityQuality(
            response,
            ctx._continuityInput.sourceTime.label,
            ctx._continuityInput.sourceRounds,
          )
          if (!quality.valid || !quality.result) {
            throw specialistRejection(
              'StoryContinuity',
              '故事连续性',
              `响应未通过故事连续性契约：${quality.reason}`,
            )
          }
          ctx._preparedStoryContinuity = orchestrator.prepareNarrativeStoryContinuity({
            narrativeId: prepared.narrativeId,
            sourceRounds: ctx._continuityInput.sourceRounds,
            sourceNarratives: ctx._continuityInput.sourceNarratives,
            result: quality.result,
            rawResponse: response,
          })
          if (quality.futureEventReason) {
            ctx._storyContinuityLedgerFailureReason = quality.futureEventReason
          }
          try {
            ctx._preparedStoryContinuityLedger = orchestrator.prepareNarrativeStoryContinuityLedger(
              prepared.narrativeId,
              quality.result,
              ctx._continuityInput.sourceTime,
            )
          } catch (error) {
            ctx._storyContinuityLedgerFailureReason = error instanceof Error ? error.message : String(error)
            ctx._preparedStoryContinuityLedger = orchestrator.prepareNarrativeStoryContinuityLedger(
              prepared.narrativeId,
              { 本轮剧情: [], 未来事件: [] },
              ctx._continuityInput.sourceTime,
            )
          }
          logger.info('narrative-quality', 'story-continuity-response-accepted', {
            round: prepared.roundSequence,
            sourceRounds: ctx._continuityInput.sourceRounds,
            storyCount: quality.result.本轮剧情.length,
            futureEventCount: quality.result.未来事件.length,
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          ctx._storyContinuityFailureReason = reason
          ctx._preparedStoryContinuity = orchestrator.prepareNarrativeStoryContinuity({
            narrativeId: prepared.narrativeId,
            sourceRounds: ctx._continuityInput.sourceRounds,
            sourceNarratives: ctx._continuityInput.sourceNarratives,
            result: null,
            rawResponse: '',
          })
          ctx._preparedStoryContinuityLedger = orchestrator.prepareNarrativeStoryContinuityLedger(
            prepared.narrativeId,
            { 本轮剧情: [], 未来事件: [] },
            ctx._continuityInput.sourceTime,
          )
          logger.info('narrative-quality', 'story-continuity-response-deferred', {
            round: prepared.roundSequence,
            sourceRounds: ctx._continuityInput.sourceRounds,
            reason,
          })
        }
      },
      maxRounds: 1,
    },
    {
      name: 'ai-talent-growth',
      phase: 'execute',
      dependsOn: ['prepare-narrative'],
      order: 700,
      parallelGroup: SPECIALIST_PARALLEL_GROUP,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const prepared = requirePreparedNarrative(ctx, '天赋成长')
        if (!ctx._talentInput) {
          throw specialistRejection('TalentGrowth', '天赋成长', '缺少冻结输入。')
        }
        if (ctx._talentInput.eligiblePatterns.length === 0) {
          ctx._preparedTalentGrowth = null
          logger.info('narrative-quality', 'talent-growth-call-skipped', {
            round: prepared.roundSequence,
            reason: '程序筛选后没有满足年龄、证据、冷却、次数或等级边界的天赋',
          })
          return
        }
        try {
          const response = await callStructuredSpecialist({
          label: '天赋成长',
          errorKind: 'TalentGrowth',
          callKind: 'narrative-talent-growth',
          prompt: narrativeTalentGrowthPrompt,
          userSegments: ctx._talentInput.userSegments,
          aiConfig,
          sessionId,
        })
        const quality = inspectNarrativeTalentGrowthQuality(response)
        if (!quality.valid || !quality.result) {
          throw specialistRejection(
            'TalentGrowth',
            '天赋成长',
            `响应未通过天赋成长契约：${quality.reason}`,
          )
        }
        const decision = quality.result.成长判定
        if (!decision.需要成长) {
          ctx._preparedTalentGrowth = null
          return
        }
        const source = ctx._talentInput.eligiblePatterns.find((pattern) => (
          pattern.lineageId === decision.命格血脉编号
        ))
        if (!source) {
          throw specialistRejection(
            'TalentGrowth',
            '天赋成长',
            `返回了不属于当前可成长天赋的血脉编号：${decision.命格血脉编号}`,
          )
        }
        const availableEvidenceWindows = ctx._talentInput.evidenceWindowsByLineage[source.lineageId] ?? []
        const allowedEvidenceWindowIds = new Set(availableEvidenceWindows.map((window) => window.id))
        const evidenceWindowIds = decision.依据窗口编号
        const targetRarity = source.rarity as 'common' | 'fine' | 'rare' | 'epic'
        const minimumEvidenceWindows = getDestinyPatternMinimumEvidenceWindows(targetRarity)
        if (
          evidenceWindowIds.length < minimumEvidenceWindows
          || new Set(evidenceWindowIds).size !== evidenceWindowIds.length
          || evidenceWindowIds.some((windowId) => !allowedEvidenceWindowIds.has(windowId))
        ) {
          throw specialistRejection(
            'TalentGrowth',
            '天赋成长',
            `成长结果引用了不足或无效的证据窗口：需要至少${minimumEvidenceWindows}个不重复且属于当前天赋的窗口。`,
          )
        }
        const directions = decision.下一阶方向.map((direction): DestinyPatternGrowthDirection => ({
          route: direction.路线,
          name: direction.名称,
          description: direction.详细介绍,
          effect: direction.效果描述,
          attrBonus: {
            ...(direction.属性加成.体魄 === undefined ? {} : { physique: direction.属性加成.体魄 }),
            ...(direction.属性加成.心智 === undefined ? {} : { mind: direction.属性加成.心智 }),
            ...(direction.属性加成.悟性 === undefined ? {} : { talentAptitude: direction.属性加成.悟性 }),
            ...(direction.属性加成.魅力 === undefined ? {} : { charisma: direction.属性加成.魅力 }),
            ...(direction.属性加成.气运 === undefined ? {} : { luck: direction.属性加成.气运 }),
          },
        }))
        const pending = createPendingDestinyPatternGrowth({
          narrativeId: prepared.narrativeId,
          roundSequence: prepared.roundSequence,
          source,
          directions,
        })
        ctx._preparedTalentGrowth = prepareDestinyPatternGrowthChoice(pending)
          logger.info('narrative-quality', 'talent-growth-response-accepted', {
            round: prepared.roundSequence,
            lineageId: pending.lineageId,
            targetRarity: pending.options[0].pattern.rarity,
          })
        } catch (error) {
          ctx._preparedTalentGrowth = null
          logger.info('narrative-quality', 'talent-growth-response-deferred', {
            round: prepared.roundSequence,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      },
      maxRounds: 1,
    },
    {
      name: 'ai-event-library',
      phase: 'execute',
      dependsOn: ['prepare-narrative'],
      order: 700,
      parallelGroup: SPECIALIST_PARALLEL_GROUP,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const prepared = requirePreparedNarrative(ctx, '事件库')
        if (!ctx._eventLibraryInput) {
          throw specialistRejection('EventLibrary', '事件库', '缺少冻结输入。')
        }
        try {
          const response = await callStructuredSpecialist({
            label: '事件库',
            errorKind: 'EventLibrary',
            callKind: 'narrative-event-library',
            prompt: narrativeEventLibraryPrompt,
            userSegments: ctx._eventLibraryInput.userSegments,
            aiConfig,
            sessionId,
          })
          const quality = inspectNarrativeEventLibraryQuality(response)
          if (!quality.valid || !quality.result) {
            throw specialistRejection(
              'EventLibrary',
              '事件库',
              `响应未通过事件库契约：${quality.reason}`,
            )
          }
          orchestrator.setEventLibraryResult(quality.result)
          logger.info('narrative-quality', 'event-library-response-accepted', {
            round: prepared.roundSequence,
            eventCount: quality.result.候选事件.length,
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          orchestrator.setEventLibraryResult(null)
          logger.info('narrative-quality', 'event-library-response-deferred', {
            round: prepared.roundSequence,
            reason,
          })
        }
      },
      maxRounds: 1,
    },
    {
      name: 'commit-round',
      phase: 'transition',
      dependsOn: [
        'ai-story-continuity',
        'ai-talent-growth',
        'ai-event-library',
      ],
      order: 800,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const prepared = requirePreparedNarrative(ctx, '回合提交')
        if (
          ctx._preparedTalentGrowth === undefined
          || !ctx._preparedStoryContinuity
          || !ctx._preparedStoryContinuityLedger
        ) {
          throw new Error('活动专项调用没有形成完整准备结果')
        }

        const restoreSteps: Array<() => void | Promise<void>> = []
        let requestedChangeCount = 0
        let committedChangeCount = 0
        try {
          if (prepared.changes.length > 0) {
            const characterBase = getCharacterBaseSystem()
            const characterSnapshot = characterBase.captureTransactionState()
            restoreSteps.push(() => characterBase.restoreTransactionState(characterSnapshot))
            const attributeCommit = orchestrator.applyRoundChanges(prepared.changes, 'manual')
            requestedChangeCount = prepared.changes.length
            committedChangeCount = attributeCommit.committed.length
            if (attributeCommit.rejected.length > 0) {
              throw new Error(
                `主故事属性变化未能提交：${attributeCommit.rejected.map((item) => item.reason).join('；')}`,
              )
            }
          }
          const continuitySnapshot = orchestrator.captureNarrativeStoryContinuityTransaction()
          restoreSteps.push(() => orchestrator.restoreNarrativeStoryContinuityTransaction(
            continuitySnapshot,
            prepared.roundSequence,
          ))
          await orchestrator.commitPreparedNarrativeStoryContinuity(
            prepared.narrativeId,
            ctx._preparedStoryContinuity,
          )
          if (ctx._storyContinuityFailureReason) {
            orchestrator.setCompressionDiagnostic({
              status: 'failed',
              sourceRound: ctx._preparedStoryContinuity.sourceRound,
              sourceRounds: ctx._preparedStoryContinuity.sourceRounds,
              didCompress: false,
              reason: ctx._storyContinuityFailureReason,
            })
          }

          const ledgerSnapshot = orchestrator.captureNarrativeStoryContinuityLedgerTransaction()
          try {
            orchestrator.commitPreparedNarrativeStoryContinuityLedger(
              prepared.narrativeId,
              ctx._preparedStoryContinuityLedger,
            )
            restoreSteps.push(() => orchestrator.restoreNarrativeStoryContinuityLedgerTransaction(
              ledgerSnapshot,
            ))
          } catch (error) {
            orchestrator.restoreNarrativeStoryContinuityLedgerTransaction(ledgerSnapshot)
            ctx._storyContinuityLedgerFailureReason = error instanceof Error ? error.message : String(error)
          }
          if (ctx._storyContinuityLedgerFailureReason) {
            logger.info('narrative-quality', 'story-continuity-ledger-deferred', {
              round: prepared.roundSequence,
              sourceRound: ctx._preparedStoryContinuity.sourceRound,
              sourceRounds: ctx._preparedStoryContinuity.sourceRounds,
              reason: ctx._storyContinuityLedgerFailureReason,
            })
          }

          if (ctx._preparedTalentGrowth) {
            const talentSnapshot = captureDestinyPatternGrowthTransaction(prepared.narrativeId)
            restoreSteps.push(() => restoreDestinyPatternGrowthTransaction(talentSnapshot))
            commitPreparedDestinyPatternGrowthChoice(ctx._preparedTalentGrowth)
          }

          orchestrator.updateNarrativeTransitionAudit(prepared.narrativeId, {
            requestedChangeCount,
            committedChangeCount,
          })
          orchestrator.finalizeNarrativeResponse(prepared.narrativeId)
        } catch (error) {
          await restoreCommittedSteps(restoreSteps, error)
        }
      },
      maxRounds: 1,
    },
    {
      name: 'finalize-round',
      phase: 'finalize',
      dependsOn: ['commit-round'],
      order: 1000,
      owner: STAGE_OWNER,
      failureTarget: STAGE_FAILURE_TARGET,
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._committedRoundResult) {
          throw new Error('回合终态缺少已经完整提交的正文结果')
        }
        startNarrativePreGeneration({
          owner: orchestrator,
          promptTemplate,
          aiConfig,
          sessionId,
        })
      },
      maxRounds: 1,
    },
  ]
}
