/**
 * @module orchestrator-system.ts
 * @description 引擎编排子系统 —— 协调本地模拟、故事后并行 AI 分析与原子提交
 * @mod mod-engine
 *
 * 默认 Campaign 负责声明阶段顺序；本系统只提供上下文、状态快照、
 * 严格提交和失败恢复边界，不保留第二条硬编码回合管线。
 */

import { BaseSubsystem, eventBus } from '@/core'
import { isInstrumentEnabled, getInstrumentHooks } from '@/core/instrument/instrument-mode'
import {
  createExecutionOutcomeCodes,
  executionSequenceError,
  runExecutionSequence,
} from '@/foundation'
import { getMvpRuntimeSubsystemOrder } from '../helpers/mvp-runtime-policy'
import type {
  EntityLifecycleState,
  LifecycleStageDefinition,
  LifespanRuleProfile,
  PendingDeathFact,
  NarrativeStage,
  YearEvent,
  PowerFrameworkDefinition,
} from '@/foundation'
import { saveManager } from '@/core/storage/save-manager'
import {
  DEFAULT_ENGINE_CONFIG,
  USE_AI_SUMMARY_COMPRESSION,
  getWorldRules,
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
  buildTimeBridgeSummary,
  extractBridgeSnapshot,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  buildNarrativeCoherenceHeader,
  buildNarrativeWorldRules,
  collectActiveModWorldRules,
  isSubsystemOpenForPrompt,
  isMvpRuntimeSubsystem,
  resolveTimeStep,
  shouldAlignTimeStepTransition,
  mapSubsystemStatesToDetectionStates,
  buildLifecycleNarrativeHint,
  generateLifecycleArchetypeHint,
  buildLifecycleLifespanReminder,
  buildNarrativeHints,
  RoundCommitBus,
  buildNarrativeTimeContext,
  resolveNarrativeCalendarNode,
  readEraStartYearFromConfig,
  readBirthEraYearFromConfig,
  resolveCalendarEraYear,
  buildTimeScaleNarrativeHint,
  collectGameSavePayload,
  computeNarrativeMaxTokens,
  DEFAULT_WORD_COUNT_TARGET,
  RECENT_NARRATIVE_WINDOW,
  simulationBridge,
  TimeSystem,
  timeSystem,
  summaryCompressor,
  memoryEngine,
  plotStructure,
  foreshadowing,
  memoryLifecycle,
  memoryForgetting,
  causalDelay,
  digestLedger,
  coreMemory,
  subsystemRelevance,
  useEngineStore,
  type BridgeSnapshot,
  type EventLifecycleTracker,
  type NarrativeHintInput,
  type RoundCommitSource,
  type RoundCommitResult,
  type EngineState,
  type RoundInfo,
  type RoundResult,
  type NarrativeChunk,
  type CharacterCreation,
  type NarrativeTransitionAuditSnapshot,
  type TimeStep,
  type ParsedNarrative,
  type DigestLedgerSnapshot,
  createNarrativeLifeRunId,
  calculateNarrativeRepetitionMetric,
  isNarrativeRepetitionMetric,
  summarizeNarrativeHistoryRepetition,
  summarizeNarrativeRepetitionMetrics,
  type NarrativePromptComponent,
} from '../orchestrator-shared'

import { useSettingsStore } from '@/mods/mod-settings'
import { logger } from '@/core/logger/client-logger'
import type {
  NarrativeDiagnosticPhase,
  NarrativeRoundAdoption,
  NarrativeRoundOutcomeReport,
} from '@/core/logger/narrative-round-diagnostic'
import {
  drainDevelopmentSystemEvents,
  recordDevelopmentSystemEvent,
  type DevelopmentSystemStatus,
} from '@/core/logger/development-system-diagnostic'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useCharacterStore } from '@/mods/mod-character'

import {
  formatPowerFrameworkForPrompt,
  formatCalibrationSummary,
  useWorldStore,
  type WorldCalibration,
} from '@/mods/mod-world'
import { buildCalendarNarrativeContext } from '../helpers/calendar-narrative-context'
import {
  type NarrativeIntentResolution,
} from '../helpers/narrative-semantic-signals'
import {
  buildNarrativeBranchIntentProjection,
  commitBranchIntentResolution,
  findFocusedBranchIntent,
  findMostRecentlyUpdatedBranchIntentId,
  isBranchIntentProjectionConsistent,
  normalizeBranchIntentProjection,
  rebuildBranchIntentsFromHistory,
  upsertBranchIntent,
  validateIntentResolutionForState,
  type BranchIntentProjection,
  type BranchIntentState,
} from '../helpers/branch-intent-resolution'
import { getSeasonForMonth } from '../helpers/calendar-season.js'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
} from '../helpers/narrative-ai-input-view'
import {
  formatNarrativeTimelineEntries,
  formatNarrativeTimelineForPrompt,
  projectSummaryToNarrativeTimeline,
  type NarrativeTimelineEntry,
} from '../helpers/timeline-memory'
import {
  type NarrativeScopeView,
} from '../helpers/narrative-context-scope'
import {
  buildHistoricalEventPromptProjection,
  HISTORICAL_EVENT_LEDGER_ID,
} from '../helpers/historical-event-prompt-projection'
import { buildNarrativeRoundOutputContract } from '../helpers/narrative-response-quality'
import {
  compileNarrativeDynamicComponents,
} from '../prompts/narrative-prompt-components'
import type {
  HistoricalEventCommitBatch,
  HistoricalEventCommitResult,
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateInput,
  HistoricalEventCandidateQuery,
  HistoricalEventCandidateSubmission,
  HistoricalCausalEdgeInput,
  HistoricalEventCreateInput,
  HistoricalEventEvidenceInput,
  HistoricalEventPreflightResult,
  HistoricalEventScope,
  HistoricalEventTransitionInput,
  HistoricalEventValidationContext,
  HistoricalEventView,
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
  WorldSetting,
  CharacterState,
  PromptContext,
  PromptTemplate,
  AIModelConfig,
  ModManifest,
  LuckNarrativeGuidance,
  ExecutionPhase,
  ExecutionSequenceNode,
} from '@/foundation'

// Uses pattern matching via patternManager; USE_PATTERN_MANAGER feature flag managed centrally

function createHistoricalTransactionId(kind: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `history-${kind}-${suffix}`
}

function formatEquippedMythicPatternForPrompt(patterns: readonly {
  name: string
  concept: string
  effect: string
}[] | null | undefined): string | undefined {
  const rules = (patterns ?? []).flatMap((pattern) => {
    const effect = pattern.effect.trim()
    if (!effect) return []
    const name = pattern.name.trim() || '未命名轮回天赋'
    const concept = pattern.concept.trim()
    return [`${name}${concept ? `（${concept}）` : ''}：${effect}`]
  })
  return rules.length > 0
    ? `【轮回天赋】${rules.join('\n')}`
    : undefined
}

function formatDestinyPatternsForPrompt(
  patterns: readonly { name: string; description: string; effect: string }[],
  includeDescription: boolean,
): string | undefined {
  const rows = patterns.flatMap((pattern) => {
    const name = pattern.name.trim()
    const effect = pattern.effect.trim()
    const description = pattern.description.trim()
    const rule = effect || description
    if (!name || !rule) return []
    const openingDetail = includeDescription && description && description !== rule
      ? `；特质说明：${description}`
      : ''
    return [`${name}：${rule}${openingDetail}`]
  })
  if (rows.length === 0) return undefined
  return `【普通命格】${rows.join('；')}`
}

function resolveRestoredAutoSaveRound(
  restoredRound: number | undefined,
  restoredTotalRounds: number | undefined,
  previousRound: number | undefined,
  previousTotalRounds: number | undefined,
): number {
  const restored = Math.max(0, restoredRound ?? 0)
  const restoredTotal = Math.max(0, restoredTotalRounds ?? 0)
  const previous = Math.max(0, previousRound ?? 0)
  const previousTotal = Math.max(0, previousTotalRounds ?? 0)
  const hasPreviousTimeline = previousRound !== undefined || previousTotalRounds !== undefined
  const previousIsValid = hasPreviousTimeline && previous <= Math.max(previousTotal, restoredTotal)

  if (restored <= restoredTotal) {
    return previousIsValid ? Math.max(restored, previous) : restored
  }

  if (previousIsValid) return previous

  return restoredTotal
}

function formatLuckNarrativeGuidance(guidance: LuckNarrativeGuidance): string {
  const directionText: Record<LuckNarrativeGuidance['direction'], string> = {
    bad: '坏方向：可轻微增加阻力、代价或不利巧合',
    neutral: '无干扰：不施加好运或厄运方向，按既有因果自然推进',
    good: '好方向：可轻微增加机会、转机或有利巧合',
  }
  return [
    '【低优先级运气方向】',
    `本地投掷 ${guidance.roll.toFixed(2)}/100，落入${directionText[guidance.direction]}。`,
    `区间概率：坏 ${guidance.badProbabilityPercent}%、无干扰 ${guidance.neutralProbabilityPercent}%、好 ${guidance.goodProbabilityPercent}%（当前气运 ${guidance.luck}）。`,
    '这只是叙事倾向，不是必然结果；不得强制成功或失败，不得改写玩家选择、世界硬规则或已经成立的事实。',
  ].join('\n')
}

/** 预生成/快照：编排器可恢复状态 */
export interface OrchestratorSnapshot {
  /** 保存时当前世界上下文，用于与 world Store 交叉校验 */
  worldContextId?: string
  state: EngineState
  lastSubsystemStates: Record<string, SubSystemState>
  eventLifecycle: EventLifecycleTracker
  lastNotableEvents: string[]
  prevAbbreviationSnapshot: Record<string, string>
  prevRoundYear: number
  prevBridgeSnapshot: BridgeSnapshot
  /** 本次叙事开始前的时间节点；用于给 Prompt 提供真实的起止窗口。 */
  previousNarrativeRound?: RoundInfo
  timeRound: RoundInfo
  lastNarratedTimeStep?: TimeStep
  /** 当前叙事是否处于粗→细切换后的首轮边界对齐桥接。 */
  lastTimeStepAlignment?: {
    fromUnit: TimeStep['unit']
    fromValue: number
  }
  lastAiConfig?: AIModelConfig | null
  lastSessionId?: string
  lastExecutedFullContent?: string | null
  lastPlayerChoice?: string
  consecutiveSameGoalRounds?: number
  branchJustResolved?: boolean
  lastCommittedPlayerChoice?: string
  branchIntents?: BranchIntentState[]
  focusedBranchIntentId?: string
  /** 终态/被新目标替代的意图历史；只用于连续性审计，不进入活动主线 Prompt。 */
  archivedBranchIntents?: BranchIntentState[]
  prefetchedNarrativeContent?: string | null
  prefetchedLuckGuidance?: LuckNarrativeGuidance | null
  lastNarrativeLuckGuidance?: LuckNarrativeGuidance | null
  digestLedgerSnapshot?: DigestLedgerSnapshot
  /** 不由 EngineState 或外部 Store 单独拥有的内部叙事系统状态 */
  engineSubsystemStates?: Record<string, unknown>
  /** 外部系统的完整存档状态；与每轮 collectState 相关视图分离。 */
  persistentSubsystemStates?: Record<string, unknown>
}

/** 预生成专用快照；补充不进入存档契约的步长对齐运行态。 */
export interface OrchestratorPreviewSnapshot {
  orchestrator: OrchestratorSnapshot
  pendingTimeStepAlignmentFromUnit?: TimeStep['unit']
  pendingTimeStepAlignmentFromValue?: number
  /** 叙事前同步会直接写入 CharacterStore 的运行态字段。 */
  characterStoreRuntime: Pick<
    ReturnType<typeof useCharacterStore.getState>,
    'age'
  >
  engineStoreRuntime: Pick<
    ReturnType<typeof useEngineStore.getState>,
    'status' | 'narrativeError'
  >
  subsystemPreviewStates: Record<string, unknown>
}

type RuntimeManagedSubsystem = ISubSystem & {
  hydrateFromStore?: () => void
  restoreCollectedState?: (snapshot: unknown) => void
  capturePreviewState?: () => unknown
  restorePreviewState?: (snapshot: unknown) => void
  capturePersistenceState?: () => unknown
  restorePersistenceState?: (snapshot: unknown) => void
  importLegacyCollectedStates?: (states: Record<string, SubSystemState>) => boolean
  onHistoricalEventsCommitted?: (eventIds: string[], context: RoundContext) => void
}

type LuckNarrativeRuntime = ISubSystem & {
  prepareNarrativeGuidance: (
    context: RoundContext,
    prefetched?: LuckNarrativeGuidance,
  ) => LuckNarrativeGuidance
}

type HistoricalEventLedgerRuntime = ISubSystem & {
  preflightBatch: (
    batch: HistoricalEventCommitBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventPreflightResult
  commitBatch: (
    batch: HistoricalEventCommitBatch,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCommitResult
  submitCandidates: (
    submission: HistoricalEventCandidateSubmission,
    context: RoundContext | HistoricalEventValidationContext,
  ) => HistoricalEventCandidateAudit[]
  queryCandidates: (
    query?: HistoricalEventCandidateQuery,
  ) => HistoricalEventCandidateAudit[]
  getEvent: (eventId: string) => HistoricalEventView | undefined
}

interface HistoricalNarrativeTransactionPlan {
  batch: HistoricalEventCommitBatch
  eventIds: string[]
  deferredEventIds: string[]
  causalResolutionEventIds: Record<string, string>
}

// ============================================================
// OrchestratorSystem
// ============================================================

export class OrchestratorSystem extends BaseSubsystem {
  readonly id = 'orchestrator' as const
  readonly mod = 'mod-engine' as const
  readonly label = '模拟编排器' as const
  readonly description = '引擎核心编排器，协调本地模拟、AI 叙事生成、事件追踪、跨系统事务协调、叙事后处理全流程' as const

  private state: EngineState = {
    lifeRunId: createNarrativeLifeRunId(),
    status: 'idle',
    round: { year: 0, season: getSeasonForMonth(0), month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
    timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
    totalRounds: 0,
    narrativeHistory: [],
    currentNarrative: '',
    compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, lastAt: 0 },
    compressedSummaries: { summaries: [] },
    lastAutoSaveRound: 0,
    characterCreations: [],
    storyRepetitionStats: summarizeNarrativeRepetitionMetrics([]),
  }

  /** 递增即表示人生时间线已经切换；旧异步写入只能取消，不能提交。 */
  private lifeGeneration = 0

  private subsystems: ISubSystem[] = []
  /** 上次收集的子系统状态缓存 */
  private lastSubsystemStates: Record<string, SubSystemState> = {}

  /** 世界设定 */
  private worldSetting: WorldSetting | null = null

  /** 角色信息 */
  private characterState: CharacterState | null = null

  /** 事件生命周期追踪器 */
  private eventLifecycle: EventLifecycleTracker = {}

  /** 最近一次叙事结算返回的显著事件。 */
  private lastNotableEvents: string[] = []

  /** 已加载 MOD 清单；组装 Prompt 时再按实际运行绑定过滤规则。 */
  private modManifests: ModManifest[] = []

  /** Phase 6：压缩管线所需 AI 配置（executeRoundV2 注入） */
  private lastAiConfig: AIModelConfig | null = null
  /** 叙事 KV 会话 ID（传给 summary 压缩池） */
  private lastSessionId: string | undefined

  /** 上轮系统缩写快照（用于生成变化摘要） */
  private prevAbbreviationSnapshot: Record<string, string> = {}

  /** 大步进 bridge：advanceTime 前的年份与子系统快照 */
  private prevRoundYear = 0
  private prevBridgeSnapshot: BridgeSnapshot = {}

  /** 本次叙事开始前的权威时间节点（不随步长切换额外跳转）。 */
  private previousNarrativeRound: RoundInfo = {
    year: 0,
    season: getSeasonForMonth(0),
    month: 0,
    day: 0,
    dayOfYear: 1,
    totalDays: 0,
    ...TimeSystem.resolveDisplayEra(0),
  }

  /** 上一轮叙事全文（兼容旧 RoundContext；不得用于本地语义判定） */

  /** 上一条已完成叙事采用的时间步长，用于粗→细切换后定位下一时间节点 */
  private lastNarratedTimeStep: TimeStep = { ...DEFAULT_ENGINE_CONFIG.timeStep }

  /** 当前回合若由粗→细切换触发，仅用于 Prompt 说明，不改变时间结果。 */
  private lastTimeStepAlignment?: {
    fromUnit: TimeStep['unit']
    fromValue: number
  }

  /** 玩家粗→细切换后等待下一轮消费的原粒度；仅运行态使用，不进入存档契约。 */
  private pendingTimeStepAlignmentFromUnit?: TimeStep['unit']
  private pendingTimeStepAlignmentFromValue?: number

  /** 玩家分支选择（注入下一轮 Prompt，一次性消费） */
  private lastPlayerChoice?: string

  /** 连续选择同一目标轮数（用于叙事节奏控制） */
  private consecutiveSameGoalRounds = 0

  /** 上轮是否为分叉点且已被解决 */
  private branchJustResolved = false

  /** 缓存的上轮玩家选择（用于进度对比） */
  private lastCommittedPlayerChoice?: string

  /** 所有尚未进入终态的命运选择；不得因新分支或容量压力静默丢失。 */
  private branchIntents: BranchIntentState[] = []
  private archivedBranchIntents: BranchIntentState[] = []
  /** 本轮主叙事必须评估并推进的命运意图。 */
  private focusedBranchIntentId?: string

  /** 预生成缓存：跳过 AI 叙事阶段 */
  private prefetchedNarrativeContent: string | null = null
  /** 预生成与正式回合共享的本地气运引导。 */
  private prefetchedLuckGuidance: LuckNarrativeGuidance | null = null
  /** 最近一次第一次叙事调用实际采用的本地气运引导。 */
  private lastNarrativeLuckGuidance: LuckNarrativeGuidance | null = null

  /** 最近一次 AI 原始 JSON 输出（预生成队列用） */
  private lastExecutedFullContent: string | null = null

  /** 本轮已到期但尚未在有效叙事提交中确认兑现的因果事项。 */
  private pendingNarrativeCausalEventIds: string[] = []

  /** 预生成/预览执行深度：只允许临时推进到 AI 输出，不提交真实副作用 */
  private previewExecutionDepth = 0

  /** 当前预览任务的取消信号；失效预生成必须停止请求后才能释放单写者。 */
  private previewAbortSignal?: AbortSignal

  /** 预览任务（含快照恢复）的清理完成门；真实回合接管前等待它结束。 */
  private previewCompletion: Promise<void> | null = null

  /** 真实回合异步摘要压缩；下一次推进/预生成/读档前必须等待其提交完成。 */
  private pendingCompression: Promise<void> | null = null

  /** 当前真实回合的阶段诊断；只在回合结束时由客户端聚合一次。 */
  private roundDiagnostic: {
    report: NarrativeRoundOutcomeReport
  } | null = null

  /** 压缩系统从本存档数据库返回的按需时间轴回忆。 */
  private narrativeMemoryRecall: NarrativeTimelineEntry[] = []

  private emptyRoundAdoption(): NarrativeRoundAdoption {
    return {
      responseReceived: false,
      narrativeAdopted: false,
      structuredDataPresent: false,
      structuredDataAccepted: false,
      requestedChangeCount: 0,
      committedChangeCount: 0,
      rejectedChangeCount: 0,
      rejectedReasons: [],
      narrativeChars: 0,
    }
  }

  private beginRoundDiagnostic(round: number): void {
    if (this.isPreviewExecution()) return
    const startedAt = Date.now()
    this.roundDiagnostic = {
      report: {
        schemaVersion: 1,
        lifeRunId: this.state.lifeRunId,
        round,
        executionKind: 'real',
        status: 'failed',
        startedAt,
        completedAt: startedAt,
        durationMs: 0,
        phases: [],
        adoption: this.emptyRoundAdoption(),
      },
    }
    this.recordSystemDiagnostic('orchestrator', 'round-started', 'ok')
  }

  private finishRoundDiagnostic(status: 'completed' | 'failed', error?: unknown): void {
    if (this.isPreviewExecution() || !this.roundDiagnostic) return
    const report = this.roundDiagnostic.report
    report.status = status
    report.completedAt = Date.now()
    report.durationMs = Math.max(0, report.completedAt - report.startedAt)
    if (error) {
      report.error = {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    }
    this.recordSystemDiagnostic(
      'orchestrator',
      status === 'completed' ? 'round-completed' : 'round-failed',
      status === 'completed' ? 'ok' : 'error',
      { durationMs: report.durationMs },
      error,
    )
  }

  private recordSystemDiagnostic(
    system: string,
    event: string,
    status: DevelopmentSystemStatus,
    details?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (this.isPreviewExecution()) return
    const report = this.roundDiagnostic?.report
    if (!report) return
    recordDevelopmentSystemEvent({
      system,
      event,
      status,
      lifeRunId: report.lifeRunId,
      round: report.round,
      details,
      error,
    })
  }

  private pushDiagnosticPhase(phase: NarrativeDiagnosticPhase): void {
    if (this.isPreviewExecution() || !this.roundDiagnostic) return
    this.roundDiagnostic.report.phases.push(phase)
    this.recordSystemDiagnostic(
      'orchestrator-stage',
      phase.name,
      phase.status === 'completed'
        ? 'ok'
        : phase.status === 'failed'
          ? 'error'
          : phase.status,
      { durationMs: phase.durationMs, ...(phase.details ?? {}) },
      phase.error,
    )
  }

  noteNarrativeQuality(details: Record<string, unknown>): void {
    if (this.isPreviewExecution() || !this.roundDiagnostic) return
    this.roundDiagnostic.report.quality = {
      ...(this.roundDiagnostic.report.quality ?? {}),
      ...details,
    }
    this.recordSystemDiagnostic('narrative-quality', 'quality-evaluated', 'ok', details)
  }

  setRoundAdoption(adoption: Partial<NarrativeRoundAdoption>): void {
    if (this.isPreviewExecution() || !this.roundDiagnostic) return
    this.roundDiagnostic.report.adoption = {
      ...this.roundDiagnostic.report.adoption,
      ...adoption,
      rejectedReasons: adoption.rejectedReasons
        ?? this.roundDiagnostic.report.adoption.rejectedReasons,
    }
    this.recordSystemDiagnostic(
      'round-commit',
      adoption.narrativeAdopted === false ? 'narrative-not-adopted' : 'adoption-updated',
      adoption.rejectedChangeCount && adoption.rejectedChangeCount > 0 ? 'warning' : 'ok',
      { ...adoption },
    )
  }

  setCompressionDiagnostic(details: Record<string, unknown>): void {
    if (this.isPreviewExecution() || !this.roundDiagnostic) return
    this.roundDiagnostic.report.compression = {
      ...(this.roundDiagnostic.report.compression ?? {}),
      ...details,
    }
    const status = details.status === 'failed'
      ? 'error'
      : details.status === 'skipped'
        ? 'skipped'
        : details.status === 'pending'
          ? 'warning'
          : 'ok'
    this.recordSystemDiagnostic('summary-compressor', 'compression-state', status, details)
  }

  setAutoSaveDiagnostic(details: Record<string, unknown>): void {
    if (this.isPreviewExecution() || !this.roundDiagnostic) return
    this.roundDiagnostic.report.autoSave = {
      ...(this.roundDiagnostic.report.autoSave ?? {}),
      ...details,
    }
    const status = details.status === 'failed'
      ? 'error'
      : details.status === 'skipped'
        ? 'skipped'
        : details.status === 'pending'
          ? 'warning'
          : 'ok'
    this.recordSystemDiagnostic('auto-save', 'save-state', status, details)
  }

  getLastRoundDiagnostic(): NarrativeRoundOutcomeReport | null {
    if (!this.roundDiagnostic) return null
    const report = this.roundDiagnostic.report
    const captured = drainDevelopmentSystemEvents(report.lifeRunId, report.round)
    if (captured.length > 0) {
      report.systemEvents = [...(report.systemEvents ?? []), ...captured]
    }
    return structuredClone(report)
  }

  /** 子系统状态写入总线（叙事 / 跨域 / 后处理等统一入口） */
  private readonly roundCommitBus = new RoundCommitBus(
    (id) => this.subsystems.find((s) => s.id === id),
    (change, context) => {
      const sub = this.subsystems.find((s) => s.id === change.id)
      sub?.applyChanges(change, context)
    },
  )

  private asRuntimeManaged(subsystem: ISubSystem): RuntimeManagedSubsystem {
    return subsystem as RuntimeManagedSubsystem
  }

  private getInternalStatefulSubsystems(): ISubSystem[] {
    return [
      memoryEngine,
      subsystemRelevance,
      memoryLifecycle,
      memoryForgetting,
      causalDelay,
      plotStructure,
      foreshadowing,
      coreMemory,
    ]
  }

  private captureInternalSubsystemStates(): Record<string, unknown> {
    const snapshots: Record<string, unknown> = {}
    for (const subsystem of this.getInternalStatefulSubsystems()) {
      const capture = this.asRuntimeManaged(subsystem).capturePreviewState
      if (capture) snapshots[subsystem.id] = capture.call(subsystem)
    }
    return structuredClone(snapshots)
  }

  private restoreInternalSubsystemStates(snapshots: Record<string, unknown> | undefined): void {
    if (!snapshots) return
    for (const subsystem of this.getInternalStatefulSubsystems()) {
      if (!(subsystem.id in snapshots)) continue
      this.asRuntimeManaged(subsystem).restorePreviewState?.(structuredClone(snapshots[subsystem.id]))
    }
  }

  /**
   * 完整外部存档状态与每轮 Prompt 视图分离。
   * 没有对应快照的旧存档先给 owning system 迁移旧 collected state；仍无数据时显式恢复空态，
   * 避免把另一个存档残留在浏览器 Store 中的状态串入当前存档。
   */
  private restorePersistentSubsystemStates(
    snapshots: Record<string, unknown> | undefined,
    legacyCollectedStates: Record<string, SubSystemState>,
  ): void {
    for (const subsystem of this.subsystems) {
      const managed = this.asRuntimeManaged(subsystem)
      if (!managed.restorePersistenceState) continue
      if (snapshots && Object.hasOwn(snapshots, subsystem.id)) {
        managed.restorePersistenceState(structuredClone(snapshots[subsystem.id]))
        continue
      }

      // 先清空 owning Store，再迁移该存档自己的旧 collected state。否则浏览器中
      // 上一个存档留下的完整 Store 可能被 importLegacyCollectedStates 误当成本存档状态。
      managed.restorePersistenceState(undefined)
      managed.importLegacyCollectedStates?.(
        structuredClone(legacyCollectedStates),
      )
    }
  }

  private capturePersistentSubsystemStates(): Record<string, unknown> {
    const snapshots: Record<string, unknown> = {}
    for (const subsystem of this.subsystems) {
      const capture = this.asRuntimeManaged(subsystem).capturePersistenceState
      if (!capture) continue
      snapshots[subsystem.id] = capture.call(subsystem)
    }
    return structuredClone(snapshots)
  }

  /** 从各 MOD Store 水合当前已注册的 MVP 子系统，不改变公开 ISubSystem 契约。 */
  hydrateSubsystemsFromStores(): void {
    for (const subsystem of this.subsystems) {
      try {
        this.asRuntimeManaged(subsystem).hydrateFromStore?.()
      } catch (error) {
        console.warn(`[Orchestrator] 子系统 ${subsystem.id} Store 水合失败:`, error)
      }
    }
  }

  /** 将持久化的 collectState().data 写回对应私有运行态。 */
  private restoreSubsystemsFromCollectedStates(states: Record<string, SubSystemState>): void {
    for (const subsystem of this.subsystems) {
      const data = states[subsystem.id]?.data
      if (data === undefined) continue
      try {
        this.asRuntimeManaged(subsystem).restoreCollectedState?.(data)
      } catch (error) {
        console.warn(`[Orchestrator] 子系统 ${subsystem.id} 状态恢复失败:`, error)
      }
    }
  }

  private captureSubsystemPreviewStates(): Record<string, unknown> {
    const snapshots: Record<string, unknown> = {}
    const previewSubsystems = new Map<string, ISubSystem>([
      ...this.subsystems.map((subsystem) => [subsystem.id, subsystem] as const),
      ...this.getInternalStatefulSubsystems().map((subsystem) => [subsystem.id, subsystem] as const),
    ])
    for (const subsystem of previewSubsystems.values()) {
      const capture = this.asRuntimeManaged(subsystem).capturePreviewState
      if (!capture) continue
      snapshots[subsystem.id] = capture.call(subsystem)
    }
    return structuredClone(snapshots)
  }

  private restoreSubsystemPreviewStates(snapshots: Record<string, unknown> | undefined): void {
    if (!snapshots) return
    const previewSubsystems = new Map<string, ISubSystem>([
      ...this.subsystems.map((subsystem) => [subsystem.id, subsystem] as const),
      ...this.getInternalStatefulSubsystems().map((subsystem) => [subsystem.id, subsystem] as const),
    ])
    for (const subsystem of previewSubsystems.values()) {
      if (!(subsystem.id in snapshots)) continue
      try {
        this.asRuntimeManaged(subsystem).restorePreviewState?.(structuredClone(snapshots[subsystem.id]))
      } catch (error) {
        console.warn(`[Orchestrator] 子系统 ${subsystem.id} 预生成快照恢复失败:`, error)
      }
    }
  }

  registerSubsystem(subsystem: ISubSystem): void {
    if (!isMvpRuntimeSubsystem(subsystem.id)) {
      return
    }
    if (this.subsystems.some((s) => s.id === subsystem.id)) {
      throw new Error(`[Orchestrator] 子系统标识重复: ${subsystem.id}`)
    }
    this.subsystems.push(subsystem)
    this.subsystems.sort((left, right) => (
      getMvpRuntimeSubsystemOrder(left.id) - getMvpRuntimeSubsystemOrder(right.id)
    ))
    try {
      this.asRuntimeManaged(subsystem).hydrateFromStore?.()
    } catch (error) {
      console.warn(`[Orchestrator] 子系统 ${subsystem.id} 初始水合失败:`, error)
    }
  }

  /** 清空外部 MOD 子系统（registerAllSubsystems 重入前调用） */
  clearExternalSubsystems(): void {
    this.subsystems = []
  }

  /** RuntimeRegistry 用：已注册子系统绑定 */
  getSubsystemBindings(): Array<{ id: string; mod: string }> {
    return this.subsystems.map((s) => ({ id: s.id, mod: s.mod }))
  }

  /** 存储已加载 MOD 清单；manifest 存在不等于其规则进入 Prompt。 */
  setManifests(manifests: ModManifest[]): void {
    this.modManifests = manifests
  }

  getState(): EngineState {
    return { ...this.state, compressionStats: { ...this.state.compressionStats } }
  }

  getSubsystemStateSnapshot(): Record<string, SubSystemState> {
    return structuredClone(this.lastSubsystemStates)
  }

  getRoundContextSnapshot(): RoundContext {
    return structuredClone(this.buildRoundContext())
  }

  getRound(): { year: number; season: number; month: number; day: number } {
    return { ...this.state.round }
  }

  /** 角色名称（供 stage 闭包使用） */
  get characterName(): string {
    return this.characterState?.name ?? ''
  }

  /** 推进时间（供 stage 闭包使用） */
  private advanceTimeForCurrentStep(): RoundInfo {
    // Orchestrator round 是存档/预生成恢复后的权威游标。粗粒度叙事已经
    // 覆盖了当前周期；切到更细粒度时，必须先消费一次“周期对齐”，再让
    // 后续回合从新的合法节点继续推进，不能把已讲过的年份/季度/月重放。
    timeSystem.importRound(this.state.round)
    timeSystem.setTimeStep(this.state.timeStep)
    this.lastTimeStepAlignment = undefined

    const alignmentFromUnit = this.pendingTimeStepAlignmentFromUnit ?? this.lastNarratedTimeStep.unit
    const alignmentFromValue = this.pendingTimeStepAlignmentFromValue ?? this.lastNarratedTimeStep.value
    if (
      this.state.narrativeHistory.length > 0
      && shouldAlignTimeStepTransition(alignmentFromUnit, this.state.timeStep.unit)
    ) {
      this.pendingTimeStepAlignmentFromUnit = undefined
      this.pendingTimeStepAlignmentFromValue = undefined
      this.lastTimeStepAlignment = {
        fromUnit: alignmentFromUnit,
        fromValue: alignmentFromValue,
      }
      return timeSystem.alignToNextPeriod(
        alignmentFromUnit,
        this.state.timeStep.unit,
        alignmentFromValue,
      )
    }

    return timeSystem.advance()
  }

  /** 推进时间（供 stage 闭包使用） */
  advanceTime(): void {
    this.previousNarrativeRound = { ...this.state.round }
    this.prevRoundYear = this.state.round.year
    this.prevBridgeSnapshot = extractBridgeSnapshot(this.lastSubsystemStates)
    this.state.round = this.advanceTimeForCurrentStep()
    this.state.totalRounds++
    this.branchJustResolved = false
  }

  /** 叙事用年龄：按绝对天数计算，细粒度回合不会错误增加整岁。 */
  private computeNarrativeAge(context: RoundContext): number {
    const lifecycle = context.subsystemStates?.['lifecycle-system']?.data as {
      entity?: EntityLifecycleState
    } | undefined
    if (lifecycle?.entity) return Math.floor(lifecycle.entity.ageDays / 365)
    const baseState = context.subsystemStates?.['character-base']?.data
    const startingAge = (baseState && typeof baseState === 'object' && 'startingAge' in baseState)
      ? (baseState as Record<string, unknown>).startingAge as number
      : 0
    const completedYears = Math.floor(Math.max(0, context.totalDays - 365) / 365)
    return (startingAge ?? 0) + completedYears
  }

  /** 设置时间步进（UI → 引擎 + TimeSystem） */
  setTimeStep(step: RoundContext['timeStep']): void {
    if (this.pendingTimeStepAlignmentFromUnit) {
      if (!shouldAlignTimeStepTransition(this.pendingTimeStepAlignmentFromUnit, step.unit)) {
        this.pendingTimeStepAlignmentFromUnit = undefined
        this.pendingTimeStepAlignmentFromValue = undefined
      }
    } else if (
      this.state.narrativeHistory.length > 0
      && shouldAlignTimeStepTransition(this.lastNarratedTimeStep.unit, step.unit)
    ) {
      this.pendingTimeStepAlignmentFromUnit = this.lastNarratedTimeStep.unit
      this.pendingTimeStepAlignmentFromValue = this.lastNarratedTimeStep.value
    }
    this.state.timeStep = step
    timeSystem.setTimeStep(step)
    useEngineStore.getState().setTimeStep(step)
  }

  getTimeStep(): RoundContext['timeStep'] {
    return { ...this.state.timeStep }
  }

  /** 本地模拟推进所有子系统（供 stage 闭包使用） */
  async advanceAllSubsystems(): Promise<void> {
    await this.advanceSubsystems(this.buildRoundContext())
  }

  /** 三回合收集所有子系统状态（供 stage 闭包使用） */
  async collectAllSubsystemStates(recordRelevance = true): Promise<void> {
    await this.collectSubsystemStates(false, recordRelevance)
  }

  /** 获取事件检测所需的状态快照（供 stage 闭包使用） */
  getDetectionStates(): Record<string, unknown> {
    return this.extractDetectionStates()
  }

  /** 获取事件生命周期追踪器（供 stage 闭包使用） */
  getEventLifecycle(): EventLifecycleTracker {
    return this.eventLifecycle
  }

  /** 设置事件生命周期追踪器（供 stage 闭包使用） */
  setEventLifecycle(lifecycle: EventLifecycleTracker): void {
    this.eventLifecycle = lifecycle
  }

  /** 设置上轮 notableEvents（供 stage 闭包使用） */
  setLastNotableEvents(events: string[]): void {
    this.lastNotableEvents = events
  }

  setLastPlayerChoice(choice: string): void {
    const trimmed = choice.trim() || undefined
    if (trimmed && trimmed === this.lastCommittedPlayerChoice) {
      this.consecutiveSameGoalRounds++
    } else if (trimmed) {
      this.consecutiveSameGoalRounds = 1
    } else {
      this.consecutiveSameGoalRounds = 0
    }
    this.lastPlayerChoice = trimmed
  }

  private getFocusedBranchIntentRuntime(): BranchIntentState | undefined {
    return findFocusedBranchIntent(this.branchIntents, this.focusedBranchIntentId)
  }

  getFocusedBranchIntent(): BranchIntentState | undefined {
    const intent = this.getFocusedBranchIntentRuntime()
    return intent ? structuredClone(intent) : undefined
  }

  getActiveBranchIntents(): BranchIntentState[] {
    return structuredClone(this.branchIntents)
  }

  getArchivedBranchIntents(): BranchIntentState[] {
    return structuredClone(this.archivedBranchIntents)
  }

  getLifeGeneration(): number {
    return this.lifeGeneration
  }

  private focusMostRecentlyUpdatedBranchIntent(): void {
    this.focusedBranchIntentId = findMostRecentlyUpdatedBranchIntentId(this.branchIntents)
  }

  private getBranchIntentProjection(): BranchIntentProjection {
    return {
      branchIntents: this.branchIntents,
      archivedBranchIntents: this.archivedBranchIntents,
      ...(this.focusedBranchIntentId
        ? { focusedBranchIntentId: this.focusedBranchIntentId }
        : {}),
    }
  }

  private syncBranchIntentProjectionToEngineStore(): void {
    if (!useEngineStore.getState().setBranchIntentProjection(this.getBranchIntentProjection())) {
      console.warn('[BranchIntent] 运行态投影未通过持久化校验，已保留上一份 Store 投影')
    }
  }

  resolveBranchChoice(branchId: string, choice: string): void {
    const trimmed = choice.trim()
    if (!branchId || !trimmed) return

    this.state.narrativeHistory = this.state.narrativeHistory.map((entry) =>
      entry.id === branchId
        ? { ...entry, resolvedChoice: trimmed, resolvedChoiceRound: this.state.totalRounds }
        : entry,
    )
    this.branchJustResolved = true

    const next = upsertBranchIntent(this.branchIntents, branchId, trimmed, this.state.totalRounds)
    this.branchIntents = next.intents
    this.focusedBranchIntentId = next.focusedIntentId
    if (next.archivedIntents?.length) {
      this.archivedBranchIntents = [
        ...this.archivedBranchIntents,
        ...next.archivedIntents,
      ]
    }
    this.syncBranchIntentProjectionToEngineStore()
  }

  setPrefetchedNarrative(
    content: string | null,
    luckGuidance?: LuckNarrativeGuidance,
  ): void {
    this.prefetchedNarrativeContent = content?.trim() ? content : null
    this.prefetchedLuckGuidance = this.prefetchedNarrativeContent && luckGuidance
      ? structuredClone(luckGuidance)
      : null
  }

  consumePrefetchedNarrative(): string | null {
    const content = this.prefetchedNarrativeContent
    this.prefetchedNarrativeContent = null
    this.prefetchedLuckGuidance = null
    return content
  }

  getLastNarrativeLuckGuidance(): LuckNarrativeGuidance | null {
    return this.lastNarrativeLuckGuidance
      ? structuredClone(this.lastNarrativeLuckGuidance)
      : null
  }

  private prepareLuckNarrativeGuidance(
    context: RoundContext,
  ): LuckNarrativeGuidance | undefined {
    const subsystem = this.subsystems.find((item) => item.id === 'luck') as LuckNarrativeRuntime | undefined
    if (!subsystem?.prepareNarrativeGuidance) {
      if (this.prefetchedLuckGuidance) {
        throw new Error('预生成包含气运引导，但气运系统未注册')
      }
      this.lastNarrativeLuckGuidance = null
      return undefined
    }
    const guidance = subsystem.prepareNarrativeGuidance(
      context,
      this.prefetchedLuckGuidance ?? undefined,
    )
    this.lastNarrativeLuckGuidance = structuredClone(guidance)
    return guidance
  }

  getLastExecutedFullContent(): string | null {
    return this.lastExecutedFullContent
  }

  setLastExecutedFullContent(content: string | undefined): void {
    this.lastExecutedFullContent = content?.trim() ? content : null
  }

  isPreviewExecution(): boolean {
    return this.previewExecutionDepth > 0
  }

  getPreviewAbortSignal(): AbortSignal | undefined {
    return this.previewAbortSignal
  }

  private async waitForPreviewCompletion(): Promise<void> {
    if (this.isPreviewExecution()) return
    const completion = this.previewCompletion
    if (completion) await completion
  }

  async runPreviewRound<T>(runner: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.previewExecutionDepth > 0) return runner()

    let releaseCompletion: (() => void) | undefined
    this.previewCompletion = new Promise<void>((resolve) => {
      releaseCompletion = resolve
    })
    this.previewExecutionDepth++
    this.previewAbortSignal = signal
    try {
      return await runner()
    } finally {
      this.previewExecutionDepth--
      if (this.previewExecutionDepth === 0) {
        this.previewAbortSignal = undefined
        releaseCompletion?.()
        this.previewCompletion = null
      }
    }
  }

  captureSnapshot(includePersistentSubsystemStates = true): OrchestratorSnapshot {
    return structuredClone({
      worldContextId: this.worldSetting?.contextId,
      state: this.state,
      lastSubsystemStates: this.lastSubsystemStates,
      eventLifecycle: this.eventLifecycle,
      lastNotableEvents: this.lastNotableEvents,
      prevAbbreviationSnapshot: this.prevAbbreviationSnapshot,
      prevRoundYear: this.prevRoundYear,
      prevBridgeSnapshot: this.prevBridgeSnapshot,
      previousNarrativeRound: this.previousNarrativeRound,
      timeRound: timeSystem.exportRound(),
      lastNarratedTimeStep: this.lastNarratedTimeStep,
      lastTimeStepAlignment: this.lastTimeStepAlignment,
      lastAiConfig: this.lastAiConfig,
      lastSessionId: this.lastSessionId,
      lastExecutedFullContent: this.lastExecutedFullContent,
      lastPlayerChoice: this.lastPlayerChoice,
      consecutiveSameGoalRounds: this.consecutiveSameGoalRounds,
      branchJustResolved: this.branchJustResolved,
      lastCommittedPlayerChoice: this.lastCommittedPlayerChoice,
      branchIntents: this.branchIntents,
      focusedBranchIntentId: this.focusedBranchIntentId,
      archivedBranchIntents: this.archivedBranchIntents,
      prefetchedNarrativeContent: this.prefetchedNarrativeContent,
      prefetchedLuckGuidance: this.prefetchedLuckGuidance,
      lastNarrativeLuckGuidance: this.lastNarrativeLuckGuidance,
      digestLedgerSnapshot: digestLedger.toSnapshot(),
      engineSubsystemStates: this.captureInternalSubsystemStates(),
      ...(includePersistentSubsystemStates
        ? { persistentSubsystemStates: this.capturePersistentSubsystemStates() }
        : {}),
    })
  }

  isBackgroundCompressionActive(): boolean {
    return this.pendingCompression !== null
  }

  async waitForBackgroundCompression(): Promise<void> {
    while (this.pendingCompression) {
      await this.pendingCompression
    }
  }

  capturePreviewSnapshot(): OrchestratorPreviewSnapshot {
    const engineStore = useEngineStore.getState()
    const characterStore = useCharacterStore.getState()
    return {
      orchestrator: this.captureSnapshot(false),
      pendingTimeStepAlignmentFromUnit: this.pendingTimeStepAlignmentFromUnit,
      pendingTimeStepAlignmentFromValue: this.pendingTimeStepAlignmentFromValue,
      characterStoreRuntime: {
        age: characterStore.age,
      },
      engineStoreRuntime: {
        status: engineStore.status,
        narrativeError: engineStore.narrativeError,
      },
      subsystemPreviewStates: this.captureSubsystemPreviewStates(),
    }
  }

  /** 恢复预览会改写、但 EngineStore 不保存的 orchestrator 运行态。 */
  private restoreSnapshotRuntimeState(
    snap: OrchestratorSnapshot,
    restorePersistentSubsystemStates = true,
  ): void {
    this.lastSubsystemStates = structuredClone(snap.lastSubsystemStates ?? {})
    if (restorePersistentSubsystemStates) {
      this.restorePersistentSubsystemStates(
        snap.persistentSubsystemStates,
        this.lastSubsystemStates,
      )
      this.restoreSubsystemsFromCollectedStates(this.lastSubsystemStates)
    }
    this.eventLifecycle = structuredClone(snap.eventLifecycle ?? {})
    this.lastNotableEvents = [...(snap.lastNotableEvents ?? [])]
    this.prevAbbreviationSnapshot = { ...(snap.prevAbbreviationSnapshot ?? {}) }
    this.prevRoundYear = snap.prevRoundYear ?? this.state.round.year
    this.prevBridgeSnapshot = structuredClone(snap.prevBridgeSnapshot ?? {})
    this.previousNarrativeRound = {
      ...(snap.previousNarrativeRound ?? snap.state.round ?? this.state.round),
    }
    this.lastNarratedTimeStep = { ...(snap.lastNarratedTimeStep ?? this.state.timeStep) }
    this.lastTimeStepAlignment = snap.lastTimeStepAlignment
      ? { ...snap.lastTimeStepAlignment }
      : undefined
    this.lastAiConfig = snap.lastAiConfig ?? null
    this.lastSessionId = snap.lastSessionId
    this.lastExecutedFullContent = snap.lastExecutedFullContent ?? null
    this.pendingNarrativeCausalEventIds = []
    this.lastPlayerChoice = snap.lastPlayerChoice
    this.consecutiveSameGoalRounds = snap.consecutiveSameGoalRounds ?? 0
    this.branchJustResolved = snap.branchJustResolved ?? false
    this.lastCommittedPlayerChoice = snap.lastCommittedPlayerChoice
    const rebuilt = rebuildBranchIntentsFromHistory(
      this.state.narrativeHistory.map((entry, index) => ({
        id: entry.id,
        resolvedChoice: entry.resolvedChoice,
        resolvedChoiceRound: entry.resolvedChoiceRound,
        intentResolution: entry.intentResolution,
        round: entry.repetitionMetric?.round ?? index + 1,
      })),
    )
    const snapshotHasBranchProjection = snap.branchIntents !== undefined
      || snap.archivedBranchIntents !== undefined
      || snap.focusedBranchIntentId !== undefined
    const snapshotProjection = snapshotHasBranchProjection
      ? normalizeBranchIntentProjection({
          branchIntents: snap.branchIntents ?? [],
          archivedBranchIntents: snap.archivedBranchIntents ?? [],
          focusedBranchIntentId: snap.focusedBranchIntentId,
        })
      : undefined
    const rebuiltProjection: BranchIntentProjection = {
      branchIntents: rebuilt.intents,
      archivedBranchIntents: rebuilt.archivedIntents ?? [],
      ...(rebuilt.focusedIntentId
        ? { focusedBranchIntentId: rebuilt.focusedIntentId }
        : {}),
    }
    const restoredProjection = snapshotProjection
      && isBranchIntentProjectionConsistent(snapshotProjection, rebuiltProjection)
      ? snapshotProjection
      : rebuiltProjection
    this.branchIntents = restoredProjection.branchIntents
    this.archivedBranchIntents = restoredProjection.archivedBranchIntents
    this.focusedBranchIntentId = restoredProjection.focusedBranchIntentId
    if (!this.getFocusedBranchIntentRuntime()) {
      this.focusMostRecentlyUpdatedBranchIntent()
    }
    this.prefetchedNarrativeContent = snap.prefetchedNarrativeContent ?? null
    this.prefetchedLuckGuidance = snap.prefetchedLuckGuidance
      ? structuredClone(snap.prefetchedLuckGuidance)
      : null
    this.lastNarrativeLuckGuidance = snap.lastNarrativeLuckGuidance
      ? structuredClone(snap.lastNarrativeLuckGuidance)
      : null
    digestLedger.loadSnapshot(snap.digestLedgerSnapshot)
    this.restoreInternalSubsystemStates(snap.engineSubsystemStates)
  }

  restoreSnapshot(snap: OrchestratorSnapshot, restorePersistentSubsystemStates = true): void {
    const clonedState = structuredClone(snap.state) as unknown
    const rawState = clonedState && typeof clonedState === 'object' && !Array.isArray(clonedState)
      ? clonedState as Partial<EngineState> & {
          lifeRunId?: unknown
          storyRepetitionStats?: unknown
        }
      : {}
    const currentState = structuredClone(this.state)
    const narrativeHistory = (Array.isArray(rawState.narrativeHistory)
      ? rawState.narrativeHistory
      : currentState.narrativeHistory).map((entry): NarrativeChunk => {
      if (entry.repetitionMetric === undefined || isNarrativeRepetitionMetric(entry.repetitionMetric)) {
        return entry
      }
      const { repetitionMetric: _invalidMetric, ...safeEntry } = entry
      return safeEntry as NarrativeChunk
    })
    const currentLifeRunId = typeof currentState.lifeRunId === 'string' && currentState.lifeRunId.trim()
      ? currentState.lifeRunId
      : undefined
    const lifeRunId = typeof rawState.lifeRunId === 'string' && rawState.lifeRunId.trim()
      ? rawState.lifeRunId
      : currentLifeRunId ?? createNarrativeLifeRunId()
    const restored: EngineState = {
      ...currentState,
      ...rawState,
      lifeRunId,
      narrativeHistory,
      storyRepetitionStats: summarizeNarrativeHistoryRepetition(narrativeHistory),
    }
    this.state = restored
    this.narrativeMemoryRecall = []
    this.restoreSnapshotRuntimeState(
      { ...snap, state: restored },
      restorePersistentSubsystemStates,
    )
    // 旧存档可能保留了按旧规则计算的 season；以月份重新推导当前节点，
    // 但不改写历史叙事条目的时间标签。
    timeSystem.importRound(snap.timeRound ?? this.state.round)
    this.state.round = timeSystem.getRound()
    summaryCompressor.restoreFromEngineState(this.state.compressedSummaries, this.state.compressionStats)
    coreMemory.hydrateFromStore()
    useEngineStore.setState((prev) => ({
      ...prev,
      ...this.state,
      narrativeError: null,
      lastAutoSaveRound: resolveRestoredAutoSaveRound(
        this.state.lastAutoSaveRound,
        this.state.totalRounds,
        prev.lastAutoSaveRound,
        prev.totalRounds,
      ),
      resolvedBranches: prev.resolvedBranches,
      forceBranchNext: prev.forceBranchNext,
    }))
    this.syncBranchIntentProjectionToEngineStore()
  }

  restorePreviewSnapshot(snap: OrchestratorPreviewSnapshot): void {
    this.restoreSnapshot(snap.orchestrator, false)
    this.pendingTimeStepAlignmentFromUnit = snap.pendingTimeStepAlignmentFromUnit
    this.pendingTimeStepAlignmentFromValue = snap.pendingTimeStepAlignmentFromValue
    this.restoreSubsystemPreviewStates(snap.subsystemPreviewStates)
    useEngineStore.setState(snap.engineStoreRuntime)
    useCharacterStore.setState(snap.characterStoreRuntime)
  }

  /**
   * 预览失效时先撤销其非 Store 副作用，再从当前 EngineStore 重建权威时间线。
   * 不能直接 restoreSnapshot，否则会覆盖用户在 AI 等待期间完成的步长切换。
   */
  reconcilePreviewSnapshotWithEngineStore(snap: OrchestratorPreviewSnapshot): void {
    const store = useEngineStore.getState()
    const storeHasProgress = store.totalRounds > 0 || store.narrativeHistory.length > 0
    if (!storeHasProgress) {
      this.reset()
      return
    }
    this.restoreSnapshotRuntimeState(snap.orchestrator, false)
    this.restoreSubsystemPreviewStates(snap.subsystemPreviewStates)
    this.hydrateFromEngineStore(snap.orchestrator.state.timeStep)
  }

  /** 世界方向修正（供 stage 闭包使用；MVP 阶段只保留未来段入口） */
  applyWorldDirectionFromNarrative(narrative: string): void {
    this._applyWorldDirectionFromNarrative(narrative)
  }

  /** 检测死亡并触发死后尾声（供 stage 闭包使用） */
  async checkAndTriggerEpilogue(aiConfig: AIModelConfig, sessionId?: string): Promise<void> {
    await this._checkAndTriggerEpilogue(aiConfig, sessionId)
  }

  /** 返回本轮实际生效的完整文风及其显式保存版本。 */
  getNarrativeStyleSnapshot(): {
    source: 'default' | 'custom'
    text: string
    version: number
  } {
    const settings = useSettingsStore.getState()
    if (settings.narrativeStyleText.length > 0) {
      return {
        source: 'custom',
        text: settings.narrativeStyleText,
        version: settings.narrativeStyleVersion,
      }
    }
    return {
      source: 'default',
      text: buildStyleInstruction('default'),
      version: 0,
    }
  }

  /** 从设置 store 读取本轮实际生效的叙事风格。 */
  private getNarrativeStyle(): string {
    return this.getNarrativeStyleSnapshot().text
  }

  private shouldStop(): boolean {
    return this.state.totalRounds >= DEFAULT_ENGINE_CONFIG.maxRounds
      || this.state.status === 'complete'
  }

  // === 上下文注入 ===

  setContext(worldSetting: WorldSetting, characterState: CharacterState): void {
    const store = useEngineStore.getState()
    const storeHasProgress = store.totalRounds > 0 || store.narrativeHistory.length > 0
    const runtimeHasResidualState = this.state.totalRounds > 0
      || this.state.narrativeHistory.length > 0
      || Object.keys(this.lastSubsystemStates).length > 0

    // 新人生 Store 已清空时，旧 orchestrator/子系统单例不得反向复活上一局。
    if (!storeHasProgress && runtimeHasResidualState) {
      this.reset()
    }
    if (!storeHasProgress) {
      this.hydrateSubsystemsFromStores()
    }
    this.worldSetting = worldSetting
    this.characterState = characterState
  }

  // === 本地模拟推进 ===

  private async runSubsystemExecutionSequence(
    flowId: string,
    phase: ExecutionPhase,
    context: RoundContext,
    subsystems: readonly ISubSystem[],
    run: (subsystem: ISubSystem) => void,
  ): Promise<void> {
    if (subsystems.length === 0) return

    const prepareId = `${flowId}-prepare`
    const finalizeId = `${flowId}-finalize`
    const nodes: ExecutionSequenceNode<RoundContext>[] = [
      {
        id: prepareId,
        owner: 'mod-engine',
        failureTarget: 'mod-engine',
        phase: 'prepare',
        dependsOn: [],
        order: 0,
        outcomes: createExecutionOutcomeCodes(flowId, prepareId),
        run: () => ({ status: 'succeeded' }),
      },
      ...subsystems.map((subsystem, index): ExecutionSequenceNode<RoundContext> => ({
        id: `${flowId}-${subsystem.id}`,
        owner: subsystem.mod,
        failureTarget: 'mod-engine',
        phase,
        dependsOn: [index === 0 ? prepareId : `${flowId}-${subsystems[index - 1].id}`],
        order: index,
        outcomes: createExecutionOutcomeCodes(flowId, `${flowId}-${subsystem.id}`),
        run: () => {
          run(subsystem)
          return { status: 'succeeded' }
        },
      })),
      {
        id: finalizeId,
        owner: 'mod-engine',
        failureTarget: 'mod-engine',
        phase: 'finalize',
        dependsOn: [`${flowId}-${subsystems.at(-1)!.id}`],
        order: 0,
        outcomes: createExecutionOutcomeCodes(flowId, finalizeId),
        run: () => ({ status: 'succeeded' }),
      },
    ]

    const result = await runExecutionSequence({
      flowId,
      executionId: `${flowId}:${this.state.lifeRunId}:${this.state.totalRounds}:${Date.now()}`,
      owner: 'mod-engine',
      context,
      nodes,
    })
    if (result.status !== 'succeeded') {
      throw executionSequenceError(result)
    }
  }

  /**
   * 本地模拟推进（非 AI 叙事回合的纯规则计算）
   *
   * 遍历所有子系统，调用其 advance() 方法执行本地数值推演。
   * 不调 AI，仅做纯数值计算。
   */
  private async advanceSubsystems(context: RoundContext): Promise<void> {
    const runnable = this.subsystems.filter((sub) => (
      sub.id !== this.id
      && isMvpRuntimeSubsystem(sub.id)
      && this.isSubsystemEnabledForCurrentContext(sub.id)
      && typeof sub.advance === 'function'
    ))
    await this.runSubsystemExecutionSequence(
      'subsystem-advance',
      'execute',
      context,
      runnable,
      (subsystem) => subsystem.advance!(context),
    )
  }

  // === 子系统状态收集（V2 三回合加载） ===

  /**
   * 三回合收集所有子系统状态
   *
   * Round 1 (data.lua): collectState() — 各子系统独立收集初始状态
   * Round 2 (data-updates.lua): collectStateUpdate() — 基于 Round 1 结果跨系统修正
   * Round 3 (data-final-fixes): collectStateFinalFix() — 全局一致性修复
   *
   * 吸收 Factorio 三阶段数据加载设计。
   *
   * @param refreshContext - 每轮是否重新构建 RoundContext（默认 false，复用同一次）
   */
  private collectSubsystemStates(
    refreshContext = false,
    recordRelevance = true,
  ): Record<string, SubSystemState> {
    const context = this.buildRoundContext()
    const states: Record<string, SubSystemState> = {}

    // 这两项是 mod-engine 内部叙事运行态，不进入外部子系统状态卡，
    // 但必须随每个真实/预生成回合推进，才能让阶段与伏笔计时保持有效。
    for (const subsystem of [plotStructure, foreshadowing]) {
      subsystem.collectState(context)
    }

    const allSubs = this.subsystems.filter((s) =>
      s.id !== this.id
      && isMvpRuntimeSubsystem(s.id)
      && this.isSubsystemEnabledForCurrentContext(s.id),
    )

    // === Round 1: 标准收集 (data.lua) ===
    for (const sub of allSubs) {
      if (isInstrumentEnabled()) {
        getInstrumentHooks().onBeforeCollectState?.(sub.id, this.state.round.year)
      }
      const t0 = performance.now()
      const state = sub.collectState(context)
      if (state.id !== sub.id) {
        throw Error(`[Orchestrator] 子系统 ${sub.id} 返回了错误状态所有者 ${state.id}`)
      }
      const sanitized = sanitizeSubSystemState(state, `sub.${sub.id}`)
      if (isInstrumentEnabled()) {
        getInstrumentHooks().onAfterCollectState?.(
          sub.id,
          performance.now() - t0,
          JSON.stringify(sanitized.result).length,
        )
      }
      if (!sanitized.report.passed) {
        throw Error(
          `[Orchestrator] 子系统 ${sub.id} 状态安全校验未通过: ${sanitized.report.errors.join('; ')}`,
        )
      }
      states[state.id] = sanitized.result as SubSystemState
      if (!this.isPreviewExecution() && recordRelevance) {
        subsystemRelevance.recordState(sub.id, sanitized.result as SubSystemState, this.state.totalRounds)
      }
    }

    // 更新 context 以反映 Round 1 结果
    const round1Context = refreshContext ? this.buildRoundContext() : {
      ...context,
      subsystemStates: { ...states },
    }

    // === Round 2: 跨系统修改 (data-updates.lua) ===
    const updateSubs = allSubs.filter((sub) => (
      typeof (sub as { collectStateUpdate?: unknown }).collectStateUpdate === 'function'
    ))
    for (const sub of updateSubs) {
      const subV2 = sub as { collectStateUpdate?: (ctx: RoundContext) => SubSystemState | null }
      const update = subV2.collectStateUpdate!(round1Context)
      if (!update) continue
      if (update.id !== sub.id) {
        throw Error(`[Orchestrator] 子系统 ${sub.id} Round2 返回了错误状态所有者 ${update.id}`)
      }
      const sanitized = sanitizeSubSystemState(update, `sub.${sub.id}.update`)
      if (!sanitized.report.passed) {
        throw Error(
          `[Orchestrator] 子系统 ${sub.id} Round2 状态校验未通过: ${sanitized.report.errors.join('; ')}`,
        )
      }
      states[update.id] = { ...states[update.id], ...sanitized.result } as SubSystemState
    }

    // 更新 context 以反映 Round 2 结果
    const round2Context: RoundContext = {
      ...round1Context,
      subsystemStates: { ...states },
    }

    // === Round 3: 全局一致性修复 (data-final-fixes.lua) ===
    const fixSubs = allSubs.filter((sub) => (
      typeof (sub as { collectStateFinalFix?: unknown }).collectStateFinalFix === 'function'
    ))
    for (const sub of fixSubs) {
      const subV2 = sub as { collectStateFinalFix?: (ctx: RoundContext) => SubSystemState | null }
      const fix = subV2.collectStateFinalFix!(round2Context)
      if (!fix) continue
      if (fix.id !== sub.id) {
        throw Error(`[Orchestrator] 子系统 ${sub.id} Round3 返回了错误状态所有者 ${fix.id}`)
      }
      const sanitized = sanitizeSubSystemState(fix, `sub.${sub.id}.fix`)
      if (!sanitized.report.passed) {
        throw Error(
          `[Orchestrator] 子系统 ${sub.id} Round3 状态校验未通过: ${sanitized.report.errors.join('; ')}`,
        )
      }
      states[fix.id] = sanitized.result as SubSystemState
    }

    this.lastSubsystemStates = states
    return states
  }

  private buildRoundContext(): RoundContext {
    const resolved = resolveTimeStep(this.state.timeStep)
    const config = (this.worldSetting?.config ?? {}) as Record<string, unknown>
    const eraStartYear = readEraStartYearFromConfig(config)
    const birthEraYear = readBirthEraYearFromConfig(config)
    const essenceTag = typeof config.essenceTag === 'string' ? config.essenceTag : undefined
    return {
      contextId: this.worldSetting?.contextId ?? '',
      contextScope: this.worldSetting?.simulationScope ?? 'active',
      worldId: this.worldSetting?.contextId ?? '',
      characterId: this.characterState?.characterId ?? '',
      round: this.state.round,
      timeStep: resolved.calendarAdvance,
      difficulty: (this.worldSetting?.config?.difficulty as RoundContext['difficulty']) ?? 'normal',
      subsystemStates: this.lastSubsystemStates,
      roundSequence: this.state.totalRounds,
      daysPassed: timeSystem.getDaysPassed(),
      totalDays: this.state.round.totalDays,
      eraStartYear: eraStartYear || undefined,
      birthEraYear: birthEraYear || undefined,
      essenceTag,
    }
  }

  private isSubsystemEnabledForCurrentContext(subsystemId: string): boolean {
    const enabled = this.worldSetting?.capabilityProfile.enabledSubsystemIds
    return !enabled || enabled.length === 0 || enabled.includes(subsystemId)
  }

  /** 叙事前同步角色年龄（与 lifespan 子系统公式一致） */
  private syncCharacterStateForPrompt(context: RoundContext): CharacterState {
    if (!this.characterState) {
      throw new Error('[Orchestrator] characterState 未设置')
    }
    const age = this.computeNarrativeAge(context)
    const storePatterns = useCharacterStore.getState().destinyPatterns.patterns ?? []
    const patternSummaries = storePatterns.length > 0
      ? storePatterns.map((p) => ({
          name: p.name,
          description: p.description,
          effect: p.effect,
          rarity: p.rarity,
          polarity: p.polarity,
        }))
      : this.characterState.destinyPatterns
    const synced = {
      ...this.characterState,
      age,
      destinyPatterns: patternSummaries?.length ? patternSummaries : undefined,
    }
    if (!this.isPreviewExecution()) {
      this.characterState = synced
      useCharacterStore.setState({ age })
    }
    return synced
  }

  // === 变更分发（RoundCommit 总线） ===

  applyRoundChanges(
    changes: SubSystemChanges[],
    source: RoundCommitSource = 'manual',
  ): RoundCommitResult {
    return this.roundCommitBus.commit(
      {
        source,
        changes,
        roundSequence: this.state.totalRounds,
      },
      this.buildRoundContext(),
    )
  }

  // === 世界方向修正 ===

  /**
   * 世界方向修正的未来段入口。
   * 当前 MVP 下 economy/population/ecology/culture-tech 均不运行，且自由文本关键词
   * 不再作为关键路径判定来源；待这些子系统按恢复段放行后，再接结构化 direction。
   */
  private _applyWorldDirectionFromNarrative(
    _narrative: string,
  ): void {
    try {
      const hasLiveTarget = ['economy', 'population', 'ecology', 'culture-tech'].some((id) =>
        this.subsystems.some((s) => s.id === id),
      )
      if (!hasLiveTarget) return
    } catch (e) {
      console.error('[Orchestrator] 世界方向修正失败:', e)
    }
  }

  // === 死后尾声 ===

  private async _checkAndTriggerEpilogue(aiConfig: AIModelConfig, sessionId?: string): Promise<void> {
    try {
      const healthSub = this.subsystems.find((s) => s.id === 'health') as (ISubSystem & {
        hasEpilogue: (entityId: string) => boolean
        generateEpilogue: (
          ctx: RoundContext,
          config: AIModelConfig,
          history: string[],
          sid?: string,
        ) => Promise<string>
      }) | undefined
      if (!healthSub) return

      const context = this.buildRoundContext()
      const healthState = healthSub.collectState(context)
      const hData = healthState.data as { alive?: boolean; death?: unknown }
      if (hData?.alive !== false || !hData.death) return
      if (healthSub.hasEpilogue(context.characterId)) return

      const freshContext = this.buildRoundContext()
      const firstRound = Math.max(
        1,
        this.state.totalRounds - this.state.narrativeHistory.length + 1,
      )
      const narrativeHistory = this.state.narrativeHistory.map((entry, index) => (
        this.formatNarrativeHistoryEntry(
          entry,
          entry.transitionAudit?.round ?? firstRound + index,
        )
      ))

      await healthSub.generateEpilogue(freshContext, aiConfig, narrativeHistory, sessionId)
        .then((epilogueText) => {
          this.collectSubsystemStates(false, false)
          eventBus.emit('mod-character:died', { epilogueGenerated: true, length: epilogueText.length })
        })
        .catch((e) => {
          console.error('[Orchestrator] 死后尾声生成失败:', e)
        })
    } catch (e) {
      console.error('[Orchestrator] 死亡检测异常:', e)
    }
  }

  // === 自动保存 ===

  /**
   * 自动保存：无条件保存当前游戏状态到 slot 0 临时存档槽。
   * 原间隔判断已移除，由外部（hooks.ts）在叙事完成后统一调用。
   */
  public async triggerAutoSave(): Promise<Record<string, unknown>> {
    if (this.state.totalRounds <= 0) {
      const result = { status: 'skipped', reason: 'no-round' }
      this.setAutoSaveDiagnostic(result)
      return result
    }
    if (this.state.status !== 'running' && this.state.status !== 'complete') {
      const result = { status: 'skipped', reason: 'invalid-engine-status', engineStatus: this.state.status }
      this.setAutoSaveDiagnostic(result)
      return result
    }

    const worldName = this.worldSetting?.name ?? ''
    const characterName = this.characterState?.name ?? ''
    const saveRound = this.state.totalRounds
    const saveGeneration = this.lifeGeneration
    const payload = collectGameSavePayload()
    const saveStartedAt = Date.now()

    this.setAutoSaveDiagnostic({ status: 'pending', round: saveRound })
    try {
      const metadata = await saveManager.autoSave(
        worldName,
        characterName,
        payload,
        () => this.lifeGeneration === saveGeneration,
      )
      if (!metadata || this.lifeGeneration !== saveGeneration) {
        const result = { status: 'skipped', reason: 'timeline-changed', round: saveRound }
        this.setAutoSaveDiagnostic(result)
        return result
      }
      const store = useEngineStore.getState()
      const currentSavedRound = store.lastAutoSaveRound ?? 0
      const currentTotalRounds = store.totalRounds ?? 0
      // 旧人生的回调不得改写已 reset 的新世界状态
      if (saveRound > 0 && currentTotalRounds === 0) {
        const result = { status: 'skipped', reason: 'timeline-reset', round: saveRound }
        this.setAutoSaveDiagnostic(result)
        return result
      }
      const savedRoundIsFromAnotherTimeline = currentSavedRound > currentTotalRounds
      if (savedRoundIsFromAnotherTimeline || saveRound >= currentSavedRound) {
        this.state.lastAutoSaveRound = saveRound
        store.setLastAutoSaveRound(saveRound)
      }
      const result = { status: 'completed', round: saveRound, durationMs: Math.max(0, Date.now() - saveStartedAt) }
      this.setAutoSaveDiagnostic(result)
      return result
    } catch (err) {
      console.error('[Orchestrator] 自动保存失败:', err)
      const result = {
        status: 'failed',
        round: saveRound,
        durationMs: Math.max(0, Date.now() - saveStartedAt),
        error: err instanceof Error ? err.message : String(err),
      }
      this.setAutoSaveDiagnostic(result)
      return result
    }
  }

  // === 压缩 ===

  private buildYearEvents(): YearEvent[] {
    const fallbackRound = this.state.round
    const fallbackAge = this.computeNarrativeAge(this.buildRoundContext())
    const fallbackTimeLabel = `${fallbackRound.eraName}${fallbackRound.eraYear}年`
    const ledgerByRound = new Map(
      digestLedger.getEntries().map((entry) => [entry.round, entry]),
    )
    const firstRound = Math.max(
      1,
      this.state.totalRounds - this.state.narrativeHistory.length + 1,
    )

    return this.state.narrativeHistory.map((n, i) => {
      const round = firstRound + i
      const ledgerEntry = ledgerByRound.get(round)
      const age = n.displayAge ?? fallbackAge
      const timeLabel = n.displayTimeLabel?.trim() || fallbackTimeLabel

      return {
        id: round,
        contextId: n.contextId ?? this.worldSetting?.contextId,
        totalDays: n.totalDays,
        age,
        totalMonths: Math.max(0, Math.round(age * 12)),
        eraYear: fallbackRound.eraYear,
        eraName: '',
        narrative: n.text,
        digest: ledgerEntry?.digest || undefined,
        importance: ledgerEntry?.importance,
        keyEvents: ledgerEntry?.events.length
          ? ledgerEntry.events.map((event) => ({
              text: event.text,
              importance: event.adjustedImportance,
              ...(event.entities && event.entities.length > 0
                ? { entities: event.entities }
                : {}),
            }))
          : undefined,
        timeLabel,
      }
    })
  }

  /** Phase 6：L1-L3 AI 压缩 + 记忆生命周期索引 */
  private runCompressionPipeline(): void {
    if (!USE_AI_SUMMARY_COMPRESSION) {
      this.setCompressionDiagnostic({ status: 'skipped', reason: 'disabled' })
      return
    }
    if (this.isPreviewExecution()) return
    if (!this.lastAiConfig || !this.worldSetting || !this.characterState) {
      this.setCompressionDiagnostic({ status: 'skipped', reason: 'missing-context' })
      return
    }
    if (this.pendingCompression) {
      this.setCompressionDiagnostic({ status: 'skipped', reason: 'already-running' })
      return
    }
    const compressionStartedAt = Date.now()
    this.setCompressionDiagnostic({ status: 'pending', startedAt: compressionStartedAt })

    const decision = memoryLifecycle.decideCompression()
    const turnCount = this.state.totalRounds - 1
    const existingL1Keys = new Set(
      summaryCompressor.getSummaries().summaries
        .filter((summary) => summary.level === 1)
        .map((summary) => `${summary.startRound}:${summary.endRound}`),
    )
    const existingSummaryKeys = new Set(
      summaryCompressor.getSummaries().summaries.map(
        (summary) => `${summary.level}:${summary.startRound}:${summary.endRound}`,
      ),
    )

    const task = summaryCompressor
      .generateCompressedSummaries(
        this.lastAiConfig,
        this.buildYearEvents(),
        this.worldSetting,
        this.characterState,
        turnCount,
        undefined,
        this.lastSessionId,
        memoryLifecycle,
        this.state.lifeRunId,
      )
      .then((result) => {
        this.state.compressedSummaries = result.newCompressedSummaries
        const stats = summaryCompressor.getStats()
        this.state.compressionStats = {
          l1Count: stats.totalL1,
          l2Count: stats.totalL2,
          l3Count: stats.totalL3,
          lastAt: stats.lastCompressionAt,
        }
        useEngineStore.getState().setCompressedSummaries(result.newCompressedSummaries)
        useEngineStore.getState().setCompressionStats(this.state.compressionStats)

        const compressedSummaries = result.newCompressedSummaries
        let maxIndexedEndRound = 0
        if (compressedSummaries?.summaries) {
          const newSummaries = compressedSummaries.summaries
            .filter((summary) => summary.level === 1
              ? !existingL1Keys.has(`${summary.startRound}:${summary.endRound}`)
              : !existingSummaryKeys.has(
                  `${summary.level}:${summary.startRound}:${summary.endRound}`,
                ))
            .sort((a, b) => a.level - b.level)

          for (const summary of newSummaries) {
            if (summary.level === 1) {
              memoryLifecycle.addToIndex(
                1,
                summary.startRound,
                summary.endRound,
                summary.content,
                projectSummaryToNarrativeTimeline(summary, this.state.totalRounds),
                memoryLifecycle.getTaggedEvents().filter(
                  (e) => e.round >= summary.startRound && e.round <= summary.endRound,
                ),
              )
              maxIndexedEndRound = Math.max(maxIndexedEndRound, summary.endRound)
            } else {
              memoryLifecycle.addCompressedSummaryToIndex(
                summary.level,
                summary.startRound,
                summary.endRound,
                summary.content,
                projectSummaryToNarrativeTimeline(summary, this.state.totalRounds),
              )
            }
          }
        }

        if (maxIndexedEndRound > 0) {
          const clearedEvents = memoryLifecycle.clearTaggedEventsThrough(maxIndexedEndRound)
          eventBus.emit('mod-engine:narrative-compressed', {
            level: 'L1',
            reason: decision.shouldCompress ? decision.reason : 'interval',
            clearedEvents,
            stats: this.state.compressionStats,
          })
        }
        this.setCompressionDiagnostic({
          status: 'completed',
          durationMs: Math.max(0, Date.now() - compressionStartedAt),
          l1Count: this.state.compressionStats.l1Count,
          l2Count: this.state.compressionStats.l2Count,
          l3Count: this.state.compressionStats.l3Count,
        })
      })
      .catch((err) => {
        console.error('[Orchestrator] 叙事压缩失败:', err)
        this.setCompressionDiagnostic({
          status: 'failed',
          durationMs: Math.max(0, Date.now() - compressionStartedAt),
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        if (this.pendingCompression === task) {
          this.pendingCompression = null
        }
      })
    this.pendingCompression = task
  }

  private checkAndCompress(): void {
    this.runCompressionPipeline()
  }

  /** Prompt 只读取当前、全局或明确可跨界携带的故事；源记录始终完整保留。 */
  private getNarrativeScopeView(): NarrativeScopeView {
    const worldState = useWorldStore.getState()
    const closedContextIds = new Set(
      Object.values(worldState.contexts)
        .filter((instance) => (
          instance.scope.scope === 'closed' || instance.record.lifecycle === 'closed'
        ))
        .map((instance) => instance.record.id),
    )
    return {
      currentContextId: this.worldSetting?.contextId,
      closedContextIds,
    }
  }

  /**
   * 在组装主叙事 Prompt 前检索本存档的明文时间轴记忆。
   * 查询词来自上一轮 AI 已提交的事件实体；数据库仍由压缩系统拥有。
   */
  async refreshNarrativeMemoryRecall(): Promise<void> {
    const entries = digestLedger.getEntries().slice(-8)
    const terms = [...new Set(entries.flatMap((entry) => entry.events.flatMap((event) => [
      ...(event.entities ?? []),
      event.text,
    ]).map((term) => term.trim()).filter((term) => term.length >= 2)))]
    if (terms.length === 0) {
      this.narrativeMemoryRecall = []
      this.recordSystemDiagnostic('narrative-memory', 'recall-skipped', 'skipped', {
        reason: 'no-search-terms',
      })
      return
    }
    try {
      const hits = await summaryCompressor.searchMemory(
        this.state.lifeRunId,
        this.state.totalRounds,
        terms,
      )
      this.narrativeMemoryRecall = hits
        .filter((hit) => hit.active)
        .map((hit) => ({
          timeSpan: hit.timeSpan,
          occurrenceTime: hit.occurrenceTime,
          text: hit.text,
          sortRound: hit.sourceRounds.length > 0
            ? Math.min(...hit.sourceRounds)
            : this.state.totalRounds,
        }))
      this.recordSystemDiagnostic('narrative-memory', 'recall-completed', 'ok', {
        searchTermCount: terms.length,
        hitCount: hits.length,
      })
    } catch (error) {
      this.narrativeMemoryRecall = []
      this.recordSystemDiagnostic('narrative-memory', 'recall-failed', 'error', {
        searchTermCount: terms.length,
      }, error)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Orchestrator] 时间轴记忆检索失败:', error)
      }
    }
  }

  /** 组装主叙事唯一的时间轴记忆投影。 */
  private buildPromptTimelineMemory(): string | undefined {
    const scopeView = this.getNarrativeScopeView()
    const latestCompletedRound = Math.max(0, this.state.totalRounds - 1)
    const recentTimelineEntries = digestLedger.selectRecentFactsForNarrativeTimeline(
      latestCompletedRound,
      RECENT_NARRATIVE_WINDOW,
      scopeView.currentContextId,
      scopeView.closedContextIds,
    ).map((event) => this.projectRoundMemoryEvent(
      event.round,
      event.text,
      event.contextId,
    ))
    const timelineProjection = memoryLifecycle.buildNarrativeTimelineProjection(
      recentTimelineEntries,
      summaryCompressor.getSummaries(),
      scopeView.currentContextId,
      scopeView.closedContextIds,
      this.state.totalRounds,
    )

    const ledgerEntries = digestLedger.selectForNarrativeTimeline(
      this.state.totalRounds,
      scopeView.currentContextId,
      scopeView.closedContextIds,
      {
        excludeRoundsAtOrAfter: Math.max(
          1,
          latestCompletedRound - RECENT_NARRATIVE_WINDOW + 1,
        ),
      },
    ).map((event) => this.projectRoundMemoryEvent(
      event.round,
      event.text,
      event.contextId,
    ))
    const creationEntries = coreMemory.buildCreationTimelineEntries(
      this.state.characterCreations,
      (round) => this.resolveNarrativeRoundTime(round),
    )
    const timelineMemory = formatNarrativeTimelineForPrompt([
      ...timelineProjection.timelineEntries,
      ...creationEntries,
      ...this.narrativeMemoryRecall,
      ...ledgerEntries,
    ])

    return timelineMemory || undefined
  }

  private resolveNarrativeRoundTime(round: number): {
    displayTimeLabel?: string
    displayAge?: number
    totalDays?: number
  } | undefined {
    const firstRound = Math.max(
      1,
      this.state.totalRounds - this.state.narrativeHistory.length + 1,
    )
    const entry = this.state.narrativeHistory.find(
      (candidate) => candidate.transitionAudit?.round === round,
    ) ?? this.state.narrativeHistory[round - firstRound]
    if (!entry) return undefined
    return {
      displayTimeLabel: entry.displayTimeLabel,
      displayAge: entry.displayAge,
      totalDays: entry.totalDays,
    }
  }

  private projectRoundMemoryEvent(
    round: number,
    text: string,
    contextId?: string,
  ): NarrativeTimelineEntry {
    const time = this.resolveNarrativeRoundTime(round)
    const roundLabel = `第${round}轮`
    const timeLabel = time?.displayTimeLabel?.trim() || roundLabel
    const ageLabel = time?.displayAge === undefined ? undefined : `角色${time.displayAge}岁`
    const contextLabel = contextId === this.worldSetting?.contextId
      ? this.worldSetting?.name ?? contextId
      : contextId
    return {
      timeSpan: timeLabel,
      occurrenceTime: [timeLabel, ageLabel].filter(Boolean).join(' · '),
      text: contextLabel ? `【发生上下文：${contextLabel}】\n${text}` : text,
      sortRound: round,
      sortTotalDays: time?.totalDays,
    }
  }

  private projectNarrativeHistoryEntry(
    entry: NarrativeChunk,
    round: number,
  ): NarrativeTimelineEntry {
    const contextLabel = entry.contextName || entry.contextId
    const narrative = entry.text.replace(/^⟦正文⟧(?:\r?\n)*/u, '').trim()
    const roundLabel = `第${round}轮`
    const timeLabel = entry.displayTimeLabel?.trim() || roundLabel
    const ageLabel = entry.displayAge === undefined ? undefined : `角色${entry.displayAge}岁`
    return {
      timeSpan: timeLabel,
      occurrenceTime: [timeLabel, ageLabel].filter(Boolean).join(' · '),
      text: contextLabel ? `【发生上下文：${contextLabel}】\n${narrative}` : narrative,
      sortRound: round,
      sortTotalDays: entry.totalDays,
    }
  }

  private formatNarrativeHistoryEntry(entry: NarrativeChunk, round: number): string {
    return formatNarrativeTimelineEntries([this.projectNarrativeHistoryEntry(entry, round)])
  }

  // === 控制 ===

  start(): void {
    this.state.status = 'running'
  }

  pause(): void {
    this.state.status = 'paused'
  }

  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running'
    }
  }

  stop(): void {
    this.state.status = 'complete'
  }

  // === ISubSystem 实现 ===

  collectState(_context: RoundContext): SubSystemState {
    const lifecycleCount = Object.keys(this.eventLifecycle).length
    const lifespanData = this.lastSubsystemStates?.['lifespan']?.data as { adjustments?: unknown[] } | undefined
    const lifespanAdjustmentCount = lifespanData?.adjustments?.length ?? 0
    return {
      id: this.id,
      summary: `【${this.label}】${this.state.status} | 第 ${this.state.totalRounds} 回合 | 第${this.state.round.year}年 | 事件追踪×${lifecycleCount} | 压缩 L1×${this.state.compressionStats.l1Count} | 寿命调整×${lifespanAdjustmentCount}`,
      data: structuredClone(this.state) as unknown as Record<string, unknown>,
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    void changes.changes;
  }

  /** 取消尚未提交的旧人生异步操作；预览快照恢复不调用此入口。 */
  invalidatePendingLifeOperations(): void {
    this.lifeGeneration += 1
  }

  reset(): void {
    this.invalidatePendingLifeOperations()
    for (const subsystem of this.subsystems) {
      try {
        subsystem.reset()
      } catch (error) {
        console.warn(`[Orchestrator] 子系统 ${subsystem.id} 重置失败:`, error)
      }
    }
    timeSystem.reset()
    this.state = {
      lifeRunId: createNarrativeLifeRunId(),
      status: 'idle',
      round: { year: 0, season: getSeasonForMonth(0), month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
      timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
      totalRounds: 0,
      narrativeHistory: [],
      currentNarrative: '',
      compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, lastAt: 0 },
      compressedSummaries: { summaries: [] },
      lastAutoSaveRound: 0,
      characterCreations: [],
      storyRepetitionStats: summarizeNarrativeRepetitionMetrics([]),
    }
    this.lastSubsystemStates = {}
    this.eventLifecycle = {}
    this.prevAbbreviationSnapshot = {}
    this.prevRoundYear = 0
    this.prevBridgeSnapshot = {}
    this.previousNarrativeRound = {
      year: 0,
      season: getSeasonForMonth(0),
      month: 0,
      day: 0,
      dayOfYear: 1,
      totalDays: 0,
      ...TimeSystem.resolveDisplayEra(0),
    }
    this.lastNotableEvents = []
    this.lastNarratedTimeStep = { ...DEFAULT_ENGINE_CONFIG.timeStep }
    this.lastTimeStepAlignment = undefined
    this.pendingTimeStepAlignmentFromUnit = undefined
    this.pendingTimeStepAlignmentFromValue = undefined
    this.lastAiConfig = null
    this.lastSessionId = undefined
    this.lastExecutedFullContent = null
    this.pendingNarrativeCausalEventIds = []
    this.lastPlayerChoice = undefined
    this.lastCommittedPlayerChoice = undefined
    this.branchIntents = []
    this.archivedBranchIntents = []
    this.focusedBranchIntentId = undefined
    this.pendingNarrativeCausalEventIds = []
    this.consecutiveSameGoalRounds = 0
    this.branchJustResolved = false
    this.prefetchedNarrativeContent = null
    this.prefetchedLuckGuidance = null
    this.lastNarrativeLuckGuidance = null
    this.worldSetting = null
    this.characterState = null
    summaryCompressor.reset()
    memoryEngine.reset()
    memoryLifecycle.reset()
    memoryForgetting.reset()
    causalDelay.reset()
    subsystemRelevance.reset()
    plotStructure.reset()
    foreshadowing.reset()
    coreMemory.reset()
    digestLedger.reset()
    this.narrativeMemoryRecall = []
    globalDeadLoopDetector.resetAll()
    this.syncBranchIntentProjectionToEngineStore()
  }

  /** 读档后从 EngineStore 恢复 orchestrator 内部状态 */
  hydrateFromEngineStore(previousTimeStep?: TimeStep): void {
    const store = useEngineStore.getState()
    const lastAutoSaveRound = resolveRestoredAutoSaveRound(
      store.lastAutoSaveRound,
      store.totalRounds,
      undefined,
      undefined,
    )
    const narrativeHistory: NarrativeChunk[] = store.narrativeHistory.map((chunk): NarrativeChunk => {
      if (chunk.repetitionMetric === undefined || isNarrativeRepetitionMetric(chunk.repetitionMetric)) {
        return { ...chunk }
      }
      const { repetitionMetric: _invalidMetric, ...safeChunk } = chunk
      return safeChunk as NarrativeChunk
    })
    const lifeRunId = typeof store.lifeRunId === 'string' && store.lifeRunId.trim()
      ? store.lifeRunId
      : createNarrativeLifeRunId()
    const storyRepetitionStats = summarizeNarrativeHistoryRepetition(narrativeHistory)
    this.state = {
      lifeRunId,
      status: store.status === 'complete' ? 'complete' : 'idle',
      round: { ...store.round },
      timeStep: { ...store.timeStep },
      totalRounds: store.totalRounds,
      narrativeHistory,
      currentNarrative: store.currentNarrative,
      compressionStats: { ...store.compressionStats },
      compressedSummaries: structuredClone(store.compressedSummaries),
      lastAutoSaveRound,
      characterCreations: [...(store.characterCreations ?? [])] as CharacterCreation[],
      storyRepetitionStats,
    }
    const rebuiltIntents = rebuildBranchIntentsFromHistory(
      narrativeHistory.map((entry, index) => ({
        id: entry.id,
        resolvedChoice: entry.resolvedChoice,
        resolvedChoiceRound: entry.resolvedChoiceRound,
        intentResolution: entry.intentResolution,
        round: entry.repetitionMetric?.round ?? index + 1,
      })),
    )
    const persistedProjection = normalizeBranchIntentProjection({
      branchIntents: store.branchIntents,
      archivedBranchIntents: store.archivedBranchIntents,
      focusedBranchIntentId: store.focusedBranchIntentId,
    })
    const rebuiltProjection: BranchIntentProjection = {
      branchIntents: rebuiltIntents.intents,
      archivedBranchIntents: rebuiltIntents.archivedIntents ?? [],
      ...(rebuiltIntents.focusedIntentId
        ? { focusedBranchIntentId: rebuiltIntents.focusedIntentId }
        : {}),
    }
    const restoredProjection = persistedProjection
      && isBranchIntentProjectionConsistent(persistedProjection, rebuiltProjection)
      ? persistedProjection
      : rebuiltProjection
    this.branchIntents = restoredProjection.branchIntents
    this.archivedBranchIntents = restoredProjection.archivedBranchIntents
    this.focusedBranchIntentId = restoredProjection.focusedBranchIntentId
    if (store.lifeRunId !== lifeRunId || store.storyRepetitionStats !== storyRepetitionStats) {
      useEngineStore.setState({ lifeRunId, narrativeHistory, storyRepetitionStats })
    }
    this.syncBranchIntentProjectionToEngineStore()
    if (lastAutoSaveRound !== store.lastAutoSaveRound) {
      useEngineStore.getState().setLastAutoSaveRound(lastAutoSaveRound)
    }
    timeSystem.importRound(store.round)
    // 读取旧存档时不要继续信任旧 season 序号，当前节点始终按阳历月份重算。
    this.state.round = timeSystem.getRound()
    timeSystem.setTimeStep(store.timeStep)
    // EngineStore 的 round 是最近一条已完成叙事的结束节点；
    // 读档后下一轮从这里开始，不能按当前步长重新推断或回放旧周期。
    this.previousNarrativeRound = { ...store.round }
    const shouldRestorePendingAlignment = previousTimeStep
      && store.narrativeHistory.length > 0
      && shouldAlignTimeStepTransition(previousTimeStep.unit, store.timeStep.unit)
    this.lastNarratedTimeStep = shouldRestorePendingAlignment
      ? { ...previousTimeStep }
      : { ...store.timeStep }
    this.pendingTimeStepAlignmentFromUnit = shouldRestorePendingAlignment
      ? previousTimeStep.unit
      : undefined
    this.pendingTimeStepAlignmentFromValue = shouldRestorePendingAlignment
      ? previousTimeStep.value
      : undefined
    this.hydrateSubsystemsFromStores()
    summaryCompressor.restoreFromEngineState(store.compressedSummaries, store.compressionStats)
    coreMemory.hydrateFromStore()
    if (this.state.status !== 'complete') this.start()
  }

  // === 跨系统事务协调 ===

  /**
   * 从子系统状态中提取事件检测所需的状态快照
   */
  private extractDetectionStates(): Record<string, unknown> {
    const raw: Record<string, unknown> = {}
    for (const [id, ss] of Object.entries(this.lastSubsystemStates)) {
      raw[id] = ss.data
    }
    return mapSubsystemStatesToDetectionStates(raw) as Record<string, unknown>
  }

  /** 发布 SimulationSnapshot 供 UI 订阅。 */
  publishSimulationSnapshot(): void {
    const summaries: Record<string, string> = {}
    for (const [id, state] of Object.entries(this.lastSubsystemStates)) {
      summaries[id] = state.summary
    }
    simulationBridge.publishSnapshot({
      round: this.state.round.year,
      totalRounds: this.state.totalRounds,
      status: this.state.status,
      subsystemSummaries: summaries,
      updatedAt: Date.now(),
    })
  }

  // === Prompt 组装 ===

  /**
   * 组装富 PromptContext
   *
   * 从废案的 4 字段扩展到含事件注入、世界自定义的富上下文。
   * 各子系统的 summary 由子系统自身提供（已经在 collectState 中生成）。
   */
  assemblePromptContext(eventInjectionText?: string): PromptContext {
    if (!this.worldSetting || !this.characterState) {
      throw new Error('[Orchestrator] 请先调用 setContext() 设置世界和角色信息')
    }

    // 各子系统 summary 文本（经 SubsystemRelevanceSystem 五维过滤 + 滑动窗口）
    const context = this.buildRoundContext()
    const luckNarrativeGuidance = this.prepareLuckNarrativeGuidance(context)
    const syncedCharacter = this.syncCharacterStateForPrompt(context)
    const narrativeTime = buildNarrativeTimeContext(context, this.worldSetting)
    const promptScopeView = this.getNarrativeScopeView()
    const relevantStates = subsystemRelevance.getRelevantStates(
      this.lastSubsystemStates,
      context,
    )
    const rawStateSummaries = Object.values(relevantStates)
      .filter((s) => (
        s.id !== this.id
        && s.id !== 'population'
        && s.id !== 'culture-tech'
        && isSubsystemOpenForPrompt(s, s.id)
      ))
      .map((s) => ({
        id: s.id,
        summary: s.id === HISTORICAL_EVENT_LEDGER_ID
          ? buildHistoricalEventPromptProjection(s, context.contextId) ?? ''
          : s.summary,
      }))
      .filter((s) => s.summary)
    const summaries: string[] = rawStateSummaries.map((s) => s.summary)

    // 滑动窗口变化摘要（最近 3 轮内有变化的系统）
    const slidingWindowText = subsystemRelevance.buildSlidingWindowSummary(
      this.state.totalRounds,
    )

    // 系统变化摘要（与前轮缩写快照对比）
    const currentAbbrev = this.buildAbbreviationSnapshot()
    const systemChangeSummary = this.buildSystemChangeSummary(currentAbbrev)
    this.prevAbbreviationSnapshot = currentAbbrev

    // 世界自定义文本（注入玩家设定的宏观维度 + 经济总量 + 角色影响力）
    // 角色影响力文本（五维过滤：力量等级 → 叙事因果影响范围）
    const influenceText = this.buildInfluenceText()

    const config = this.worldSetting?.config ?? {}
    const coherenceHeader = buildNarrativeCoherenceHeader(config, syncedCharacter.age)

    const lifespanData = this.lastSubsystemStates?.['lifespan']?.data as {
      profile?: LifespanRuleProfile
    } | undefined
    const lifecycleData = this.lastSubsystemStates?.['lifecycle-system']?.data as {
      entity?: EntityLifecycleState
      currentStage?: LifecycleStageDefinition
    } | undefined
    const baseData = this.lastSubsystemStates?.['character-base']?.data as { startingAge?: number } | undefined
    const startingAge = baseData?.startingAge ?? 0
    const isOpeningNarrativeRound = this.state.narrativeHistory.length === 0
    const isBirthOpeningRound = isOpeningNarrativeRound && startingAge === 0 && syncedCharacter.age === 0
    const lifeStageHint = buildLifecycleNarrativeHint(
      lifecycleData?.entity,
      lifecycleData?.currentStage,
    )
    const archetypeHint = generateLifecycleArchetypeHint(
      lifecycleData?.currentStage,
      context.difficulty,
      plotStructure.getConsecutiveConflictRounds(),
    )
    const lifespanReminder = buildLifecycleLifespanReminder(
      lifespanData?.profile,
      lifecycleData?.entity,
    )

    // 按生命周期和顺序装配动态写作组件；未触发组件不进入本轮消息。
    const dynamicGuidanceSources: Array<{
      id: string
      content: string | undefined
      order: number
      kind: NarrativePromptComponent['kind']
      authority: NarrativePromptComponent['authority']
    }> = [
      { id: 'round-coherence', content: coherenceHeader, order: 10, kind: '硬限制', authority: '世界与协议' },
      { id: 'lifecycle', content: lifeStageHint, order: 20, kind: '硬限制', authority: '当前事实' },
      { id: 'event-archetype', content: archetypeHint, order: 30, kind: '写作规则', authority: '剧情引导' },
      { id: 'lifespan-reminder', content: lifespanReminder, order: 40, kind: '硬限制', authority: '当前事实' },
      { id: 'influence-boundary', content: influenceText, order: 50, kind: '硬限制', authority: '当前事实' },
      { id: 'recent-system-changes', content: slidingWindowText, order: 60, kind: '流程指令', authority: '当前事实' },
      { id: 'npc-network', content: coreMemory.buildNPCNetworkText(promptScopeView), order: 70, kind: '流程指令', authority: '当前事实' },
      {
        id: 'round-output-contract',
        content: buildNarrativeRoundOutputContract(
          useEngineStore.getState().forceBranchNext,
          isOpeningNarrativeRound,
        ),
        order: 10_000,
        kind: '硬限制',
        authority: '世界与协议',
      },
    ]
    const narrativeGuidanceText = compileNarrativeDynamicComponents(
      dynamicGuidanceSources
        .filter((source) => Boolean(source.content?.trim()))
        .map((source) => ({
          id: source.id,
          title: source.id,
          kind: source.kind,
          lifecycle: '每轮更新',
           authority: source.authority,
           order: source.order,
           dependsOn: [],
           assemblyPosition: '本轮引导',
           loadWhen: '对应动态来源在本轮返回非空内容',
           exitWhen: '触发条件不再成立',
           acceptanceEvidence: 'npm run test:narrative-protocol',
           content: source.content!,
        })),
    )
    const calibrationRaw = this.worldSetting?.config?._calibration as WorldCalibration | undefined
    const narrativeToneHint = resolveNarrativeToneHint(
      calibrationRaw?.styleGuide?.narrativeTone,
    )
    const narrativeCalibrationSummary = calibrationRaw
      ? formatCalibrationSummary({
        ...calibrationRaw,
        ...(calibrationRaw.world
          ? {
              world: Object.fromEntries(
                Object.entries(calibrationRaw.world).filter(([key]) => key !== 'populationBase'),
              ) as WorldCalibration['world'],
            }
          : {}),
        ...(calibrationRaw.formulas
          ? {
              formulas: Object.fromEntries(
                Object.entries(calibrationRaw.formulas).filter(([key]) => key !== 'techProgressModifier'),
              ) as WorldCalibration['formulas'],
            }
          : {}),
      })
      : undefined

    const roundGuidance = this.buildRoundGuidanceInput(luckNarrativeGuidance)
    const mythicPatternText = formatEquippedMythicPatternForPrompt(
      useCharacterStore.getState().equippedMythicPatterns,
    )
    const destinyPatternText = formatDestinyPatternsForPrompt(
      getDestinyPatternSystem().getPatterns(),
      isOpeningNarrativeRound,
    )

    // 构建轻量 worldSetting（剥离每轮不变的静态参数，减少 Token 浪费）
    // aiDetailedParameters（43字段，~2000字符）在世界初始化后不再变化，每轮重复发送无意义
    const lightWorldSetting = this.buildLightWorldSetting(narrativeTime.eraLabel)
    const worldNarrativeView = projectWorldSettingForNarrativeAI(lightWorldSetting, narrativeTime)
    const characterNarrativeView = projectCharacterForNarrativeAI(syncedCharacter)
    const timelineMemory = this.buildPromptTimelineMemory()

    const powerFramework = formatPowerFrameworkForPrompt(
      config.powerFramework as PowerFrameworkDefinition | undefined,
    )
    const timeScaleHint = buildTimeScaleNarrativeHint(this.state.timeStep, {
      usesCanonicalSolarSeasons: narrativeTime.usesCanonicalSolarSeasons,
      calendarName: narrativeTime.calendarName,
    })
    const previousLocalCalendar = resolveNarrativeCalendarNode(
      this.previousNarrativeRound.totalDays,
      this.worldSetting,
    )
    const previousCalendarYear = previousLocalCalendar?.calendarYear ?? resolveCalendarEraYear(
      this.previousNarrativeRound.year,
      readEraStartYearFromConfig(config),
      readBirthEraYearFromConfig(config),
    )
    const calendarNarrativeContext = buildCalendarNarrativeContext({
      timeStep: this.state.timeStep,
      calendarYear: narrativeTime.calendarYear,
      calendarName: narrativeTime.calendarName,
      daysPerYear: narrativeTime.daysPerYear,
      monthsPerYear: narrativeTime.monthsPerYear,
      seasonName: narrativeTime.seasonName,
      usesCanonicalSolarSeasons: narrativeTime.usesCanonicalSolarSeasons,
      month: narrativeTime.month,
      day: narrativeTime.day,
      previousNode: {
        calendarYear: previousCalendarYear,
        month: previousLocalCalendar?.month ?? this.previousNarrativeRound.month + 1,
        day: previousLocalCalendar?.day ?? this.previousNarrativeRound.day + 1,
      },
      daysPassed: previousLocalCalendar
        ? Math.max(0, narrativeTime.localTotalDays - previousLocalCalendar.localTotalDays)
        : timeSystem.getDaysPassed(),
      timeStepAlignment: this.lastTimeStepAlignment,
    })
    const triggeredCausality = causalDelay.checkCausalTrigger(
      this.state.totalRounds,
      {
        currentTotalDays: this.state.round.totalDays,
        scope: this.worldSetting?.contextId ? 'context' : 'global',
        contextId: this.worldSetting?.contextId,
      },
    )
    this.pendingNarrativeCausalEventIds = triggeredCausality.triggeredEvents.map((event) => event.id)

    const assembled: PromptContext = {
      worldNarrativeView,
      characterProfileView: characterNarrativeView.profile,
      characterStatusView: characterNarrativeView.status,
      currentTime: narrativeTime.timeLabel,
      subsystemSummaries: summaries,
      eventInjectionText: eventInjectionText || undefined,
      causalChainHint: triggeredCausality.narrativeText || undefined,
      timeBridgeSummary: buildTimeBridgeSummary(this.buildTimeBridgeInput()) || undefined,
      systemChangeSummary: systemChangeSummary || undefined,
      narrativeGuidanceText: narrativeGuidanceText || undefined,
      plotStructureText: plotStructure.buildPhaseGuidance() || undefined,
      foreshadowingText: foreshadowing.buildForeshadowingText(this.worldSetting?.contextId) || undefined,
      worldTagsText: (this.worldSetting?.config?._worldTagsText as string) || undefined,
      worldRules: buildNarrativeWorldRules(
        getWorldRules(config.essenceTag as string | undefined),
      ) || undefined,
      modWorldRules: collectActiveModWorldRules(
        this.modManifests,
        this.getSubsystemBindings(),
      ),
      narrativeStyle: this.getNarrativeStyle(),
      narrativeToneHint,
      talents: [mythicPatternText, destinyPatternText].filter(Boolean).join('\n') || undefined,
      timelineMemory,
      // 从单一来源常量取默认字数，避免散落硬编码回退
      wordCountInstruction: buildWordCountInstruction(useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET),
      calibrationSummary: narrativeCalibrationSummary,
      roundSystemGuidanceText: roundGuidance.roundSystemGuidanceText,
      playerBranchIntent: roundGuidance.playerBranchIntent,
      powerFramework,
    }

    if (isOpeningNarrativeRound) {
      const firstRoundInstruction = isBirthOpeningRound
        ? '【出生开场】只写出生当日或前后短时段：用婴儿可感知的细节建立家庭处境与时代环境；禁止跨到翻身、爬行、学步或说话。当前年龄由时间系统派生；没有永久数值变化时省略系统指令。'
        : '人生记录开场：从当前年龄附近的具体场景建立身份、家世、环境与社会位置，不概述此前整段人生。'
      assembled.roundSystemGuidanceText = assembled.roundSystemGuidanceText
        ? `${assembled.roundSystemGuidanceText}\n\n${firstRoundInstruction}`
        : firstRoundInstruction
    }

    // 每轮动态时间导演提示放在 FAST 段末尾，避免污染 STABLE 前缀缓存。
    assembled.timeGuideText = [
      timeScaleHint,
      calendarNarrativeContext,
    ].filter(Boolean).join('\n')

    if (isInstrumentEnabled()) {
      const mem = assembled.timelineMemory ?? ''
      const core = ''
      const fore = assembled.foreshadowingText ?? ''
      const plot = assembled.plotStructureText ?? ''
      const totalChars = mem.length + core.length + fore.length + plot.length
      getInstrumentHooks().onPromptAssembled?.({
        round: this.state.totalRounds,
        memorySummaryChars: mem.length,
        coreMemoryChars: core.length,
        foreshadowingChars: fore.length,
        directionChars: 0,
        plotStructureChars: plot.length,
        estimatedTokens: Math.ceil(totalChars / 2.5),
      })
    }

    return assembled
  }

  /** 组装 TS-5 bridge 摘要输入（本地、零 API） */
  private buildTimeBridgeInput() {
    // tickCount = 本轮跨越的年数（桥接摘要按年触发）。旧代码用 resolveTimeStep().simulationTicks，
    // 现直接用 toYear - fromYear（引擎已持有两端年份），不再依赖已删除的 simulationTicks。
    return {
      fromYear: this.prevRoundYear,
      toYear: this.state.round.year,
      tickCount: Math.max(0, this.state.round.year - this.prevRoundYear),
      prevSnapshot: this.prevBridgeSnapshot,
      currentSnapshot: extractBridgeSnapshot(this.lastSubsystemStates),
      memoryL0Titles: this.getMemoryL0Titles(this.prevRoundYear, this.state.round.year),
    }
  }

  private getMemoryL0Titles(fromYear: number, toYear: number): string[] {
    const factsByRound = new Map(
      digestLedger.getEntries().map((entry) => [
        entry.round,
        entry.events.length > 0
          ? entry.events.map((event) => event.text).join('；')
          : entry.digest.trim(),
      ]),
    )
    return memoryLifecycle.getTaggedEvents()
      .filter((e) => {
        const calendarYear = e.calendarYear ?? e.round
        return calendarYear > fromYear && calendarYear <= toYear
      })
      .map((e) => factsByRound.get(e.round) || '')
      .filter(Boolean)
  }

  /** 构建子系统缩写快照（用于变化摘要对比） */
  private buildAbbreviationSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {}
    for (const [id, ss] of Object.entries(this.lastSubsystemStates)) {
      if (id === this.id) continue
      // 取 summary 用于变化检测（不截断，完整比对）
      const short = ss.summary ?? ''
      if (short) snapshot[id] = short
    }
    return snapshot
  }

  /** 构建系统变化摘要（对比前后轮缩写快照） */
  private buildSystemChangeSummary(current: Record<string, string>): string {
    const prev = this.prevAbbreviationSnapshot
    if (Object.keys(prev).length === 0) return ''

    const changes: string[] = []
    for (const [id, currText] of Object.entries(current)) {
      const prevText = prev[id]
      const systemLabel = this.subsystems.find((subsystem) => subsystem.id === id)?.label ?? id
      if (prevText && prevText !== currText) {
        changes.push(`${systemLabel}：${prevText} → ${currText}`)
        // 同步记录到 SubsystemRelevanceSystem 滑动窗口
        if (!this.isPreviewExecution()) {
          subsystemRelevance.recordChange(id, this.state.totalRounds, `${prevText} → ${currText}`)
        }
      } else if (!prevText && currText) {
        changes.push(`${systemLabel}：新增 — ${currText}`)
        if (!this.isPreviewExecution()) {
          subsystemRelevance.recordChange(id, this.state.totalRounds, `新增: ${currText}`)
        }
      }
    }
    return changes.length > 0 ? `【系统变化摘要】\n${changes.join('\n')}` : ''
  }

  /**
   * 构建角色影响力文本（五维过滤：力量等级 → 叙事因果影响范围）
   */
  private buildInfluenceText(): string | undefined {
    const influenceScore = subsystemRelevance.calculateInfluenceScore(this.lastSubsystemStates)
    const scope = subsystemRelevance.getInfluenceScope(influenceScore)
    return subsystemRelevance.buildInfluenceText(influenceScore, scope)
  }

  /** 获取所有子系统的状态上下文字符串（供外部 UI Panel 使用） */
  getSystemContext(): string {
    const states = this.collectSubsystemStates()
    return Object.values(states)
      .map((s) => s.summary)
      .filter(Boolean)
      .join('\n')
  }

  // === AI 响应处理 ===

  /**
   * 构建轻量 worldSetting，剥离每轮不变的静态参数。
   * aiDetailedParameters（43字段 ~2000字符）在世界初始化后不再变化，
   * 每轮发送到 AI 纯属 Token 浪费。这些参数的语义已通过 calibrationSummary、
   * worldRules 等字段注入 AI。
   */
  private buildLightWorldSetting(eraLabel: string): import('@/foundation').WorldSetting {
    if (!this.worldSetting) {
      return { name: '', description: '', era: eraLabel, config: {} } as import('@/foundation').WorldSetting
    }

    const ws = this.worldSetting as unknown as Record<string, unknown>
    const { config, ...rest } = ws
    const lightConfig = config && typeof config === 'object'
      ? { ...config as Record<string, unknown> }
      : {}

    // 剥离每轮不变的大字段
    delete lightConfig.aiDetailedParameters
    // description 在顶层已有，config 内重复
    delete lightConfig.description

    // 剥离所有 `_` 前缀内部字段（_aiFlags/_dimensionModes/_coherenceLocks/_dimensionValues 等）
    // 这些是引擎内部消费的数据，通过 this.worldSetting.config 直接读取，无需进入发给 AI 的 worldSetting
    // 同时删除值为 undefined 的字段，避免序列化噪声
    for (const key of Object.keys(lightConfig)) {
      if (key.startsWith('_') || lightConfig[key] === undefined) {
        delete lightConfig[key]
      }
    }

    return {
      ...rest,
      era: eraLabel,
      config: lightConfig,
    } as unknown as import('@/foundation').WorldSetting
  }

  private buildRoundGuidanceInput(luckNarrativeGuidance?: LuckNarrativeGuidance): {
    roundSystemGuidanceText?: string
    playerBranchIntent?: Record<string, unknown>
  } {
    const components: NarrativePromptComponent[] = []
    let order = 10
    const addComponent = (
      id: string,
      content: string,
      kind: NarrativePromptComponent['kind'] = '流程指令',
      authority: NarrativePromptComponent['authority'] = '玩家意图',
    ) => {
      if (!content.trim()) return
      components.push({
        id,
        title: id,
        kind,
        lifecycle: '条件触发',
        authority,
        order,
        dependsOn: [],
        assemblyPosition: '本轮引导',
        loadWhen: '对应玩家、系统或生命周期触发条件成立',
        exitWhen: '触发条件不再成立',
        acceptanceEvidence: 'npm run test:narrative-protocol',
        content,
      })
      order += 10
    }

    const hasFreshPlayerChoice = Boolean(this.lastPlayerChoice?.trim())
    this.branchJustResolved = hasFreshPlayerChoice

    // 动态 hints（移植自废弃项目 buildNarrativeRoundPrompt）
    const hints = buildNarrativeHints(this.buildHintInput())
    if (hints.mandatory.length > 0) {
      addComponent('mandatory-round-hints', `【本轮必须遵守】${hints.mandatory.join('。')}`, '硬限制', '当前事实')
    }
    if (hints.optional.length > 0) {
      addComponent('optional-round-hints', `【本轮参考建议】${hints.optional.join('。')}`, '写作规则', '剧情引导')
    }
    if (luckNarrativeGuidance) {
      addComponent(
        'luck-narrative-guidance',
        formatLuckNarrativeGuidance(luckNarrativeGuidance),
        '写作规则',
        '剧情引导',
      )
    }

    const focusedIntent = this.getFocusedBranchIntentRuntime()
    const freshPlayerChoice = this.lastPlayerChoice?.trim()
    let playerBranchIntent: Record<string, unknown> | undefined
    if (focusedIntent) {
      const otherActiveIntents = this.branchIntents.filter(
        (intent) => intent.intentId !== focusedIntent.intentId,
      )
      playerBranchIntent = buildNarrativeBranchIntentProjection(focusedIntent, otherActiveIntents)
    }
    if (freshPlayerChoice) {
      if (!focusedIntent) {
        playerBranchIntent = { 玩家选择: freshPlayerChoice }
      }
      this.lastCommittedPlayerChoice = freshPlayerChoice
      this.lastPlayerChoice = undefined
    }
    const resolved = useEngineStore.getState().resolvedBranches
    const resolvedLines: string[] = []
    for (const [id, choice] of Object.entries(resolved)) {
      if (!choice.trim()) continue
      if (id === focusedIntent?.branchId) continue
      const pos = this.state.narrativeHistory.findIndex((n) => n.id === id)
      if (pos >= 0) {
        resolvedLines.push(`第${pos + 1}轮:${choice}`)
      } else {
        resolvedLines.push(choice)
      }
    }
    if (resolvedLines.length > 0) {
      addComponent('recent-resolved-branches', `【最近已确认的分支结果】${resolvedLines.slice(-3).join('；')}`, '流程指令', '当前事实')
    }

    const roundSystemGuidanceText = compileNarrativeDynamicComponents(components)
    return {
      ...(roundSystemGuidanceText ? { roundSystemGuidanceText } : {}),
      ...(playerBranchIntent ? { playerBranchIntent } : {}),
    }
  }

  /** 构建 NarrativeHintInput（从当前 orchestrator 状态收集数据） */
  private buildHintInput(): NarrativeHintInput {
    const baseData = this.lastSubsystemStates?.['character-base']?.data as { startingAge?: number } | undefined
    const startingAge = baseData?.startingAge ?? 0
    const currentAge = this.computeNarrativeAge(this.buildRoundContext())

    return {
      currentAge,
      startingAge,
      round: this.state.totalRounds,
      recentEvents: this.buildYearEvents().map(e => ({ narrative: e.narrative, age: e.age })),
      // BranchIntent 是活动选择的唯一 Prompt 投影；旧 hints 不再重复注入选择正文。
      forceBranch: useEngineStore.getState().forceBranchNext ?? false,
      branchJustResolved: this.branchJustResolved,
      consecutiveSameGoalRounds: this.consecutiveSameGoalRounds,
      timeStep: this.state.timeStep,
      narrativeStyle: this.getNarrativeStyle(),
    }
  }

  private resolveBranchFromParsed(parsed: ParsedNarrative): {
    isBranchPoint: boolean
    branchTitle?: string
    branchOptions?: string[]
  } {
    const forcedBranchRequested = useEngineStore.getState().forceBranchNext === true
    if (parsed.branch !== true) {
      if (!forcedBranchRequested) return { isBranchPoint: false }
      useEngineStore.getState().setForceBranchNext(false)
      return {
        isBranchPoint: true,
        branchTitle: '由你决定下一步',
        branchOptions: [],
      }
    }
    if (!parsed.branchTitle || !parsed.branchOptions) {
      throw new Error('严格分支结果缺少标题或选项')
    }
    useEngineStore.getState().setForceBranchNext(false)
    return {
      isBranchPoint: true,
      branchTitle: parsed.branchTitle,
      branchOptions: [...parsed.branchOptions],
    }
  }

  private commitFocusedBranchIntentResolution(
    resolution: NarrativeIntentResolution,
  ): NarrativeIntentResolution | undefined {
    const result = commitBranchIntentResolution(
      this.branchIntents,
      this.focusedBranchIntentId,
      resolution,
      this.state.totalRounds,
    )
    if (result.error || !result.committed) {
      console.warn('[BranchIntent] 已拒绝不一致的 intentResolution:', result.error)
      return undefined
    }

    this.branchIntents = result.intents
    this.focusedBranchIntentId = result.focusedIntentId
    if (result.archivedIntents?.length) {
      this.archivedBranchIntents = [
        ...this.archivedBranchIntents,
        ...result.archivedIntents,
      ]
    }
    if (result.terminal) {
      this.consecutiveSameGoalRounds = 0
    } else {
      this.consecutiveSameGoalRounds = Math.max(1, this.consecutiveSameGoalRounds + 1)
    }

    return result.committed
  }

  private getHistoricalEventLedgerRuntime(): HistoricalEventLedgerRuntime | undefined {
    const subsystem = this.subsystems.find((item) => item.id === 'historical-event-ledger')
    if (!subsystem) return undefined
    const candidate = subsystem as Partial<HistoricalEventLedgerRuntime>
    if (
      typeof candidate.preflightBatch !== 'function'
      || typeof candidate.commitBatch !== 'function'
      || typeof candidate.submitCandidates !== 'function'
      || typeof candidate.queryCandidates !== 'function'
      || typeof candidate.getEvent !== 'function'
    ) {
      return undefined
    }
    return subsystem as HistoricalEventLedgerRuntime
  }

  /** 读取当前上下文相关的全部可用候选；公开查询上限只限制单页，不截断完整集合。 */
  getAvailableHistoricalEventCandidates(): HistoricalEventCandidateAudit[] {
    const ledger = this.getHistoricalEventLedgerRuntime()
    if (!ledger) throw new Error('historical-event-ledger 未注册或公开契约不完整')

    const context = this.buildRoundContext()
    const candidates: HistoricalEventCandidateAudit[] = []
    const pageSize = 500
    let offset = 0
    while (true) {
      const page = ledger.queryCandidates({
        contextId: context.contextId,
        statuses: ['available'],
        latestOnly: true,
        offset,
        limit: pageSize,
      })
      candidates.push(...page)
      if (page.length < pageSize) break
      offset += page.length
    }

    return candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId))
  }

  /** 历史事实成为最终账本后，通知依赖真实事件 ID 的 owning systems。 */
  private notifyHistoricalEventsCommitted(
    eventIds: readonly string[],
    context: RoundContext,
  ): void {
    const committedIds = [...eventIds]
    for (const subsystem of this.subsystems) {
      this.asRuntimeManaged(subsystem).onHistoricalEventsCommitted?.(committedIds, context)
    }
  }

  private getCurrentHistoricalScope(): HistoricalEventScope {
    const contextId = this.worldSetting?.contextId?.trim()
    return contextId
      ? { kind: 'context', contextIds: [contextId] }
      : { kind: 'global', contextIds: [] }
  }

  private buildHistoricalCausalScope(
    from: HistoricalEventScope,
    to: HistoricalEventScope,
  ): HistoricalEventScope {
    const contextIds = [...new Set([...from.contextIds, ...to.contextIds])]
    if (contextIds.length > 1) return { kind: 'cross-context', contextIds }
    if (contextIds.length === 1) return { kind: 'context', contextIds }
    return { kind: 'global', contextIds: [] }
  }

  private buildHistoricalNarrativeTransactionPlan(
    ledger: HistoricalEventLedgerRuntime,
    parsed: ParsedNarrative,
    keyEvents: Array<{ text: string; importance: number; entities?: string[] }>,
    pendingDeath?: PendingDeathFact,
  ): HistoricalNarrativeTransactionPlan | undefined {
    const context = this.buildRoundContext()
    const scope = this.getCurrentHistoricalScope()
    const sourceId = `narrative-round:${context.contextId}:${context.roundSequence}:${context.totalDays}`
    const source = {
      kind: 'narrative' as const,
      sourceId,
      description: '主叙事完整结构化数据通过本地校验后的历史事实提交',
    }
    const events: HistoricalEventCreateInput[] = []
    const evidence: HistoricalEventEvidenceInput[] = []
    const transitions: HistoricalEventTransitionInput[] = []
    const causalEdges: HistoricalCausalEdgeInput[] = []
    const eventIds: string[] = []
    const narrativeFactEventIds: string[] = []
    const deferredEventIds: string[] = []
    const causalResolutionEventIds: Record<string, string> = {}

    const appendEvent = (
      input: Omit<HistoricalEventCreateInput, 'eventId'>,
      evidenceDescription: string,
      payload: unknown,
      evidenceKind: HistoricalEventEvidenceInput['kind'] = 'narrative',
    ): { eventId: string; evidenceId: string } => {
      const eventId = createHistoricalTransactionId('event')
      const evidenceId = createHistoricalTransactionId('evidence')
      events.push({ ...input, eventId })
      evidence.push({
        evidenceId,
        eventId,
        kind: evidenceKind,
        description: evidenceDescription,
        sourceId,
        contextId: context.contextId || undefined,
        payload,
      })
      eventIds.push(eventId)
      return { eventId, evidenceId }
    }

    for (const keyEvent of keyEvents) {
      const appended = appendEvent({
        eventType: parsed.semanticSignals?.eventType ?? 'narrative-key-event',
        title: keyEvent.text,
        description: keyEvent.text,
        scope,
        status: 'occurred',
        participants: (keyEvent.entities ?? []).map((label) => ({ label })),
        tags: ['narrative-key-event'],
        metadata: {
          importance: keyEvent.importance,
          narrativeImportance: parsed.importance,
          arcStatus: parsed.arcStatus,
        },
      }, '主叙事关键事件通过完整协议、Schema 与回合提交校验', {
        digest: parsed.digest,
        keyEvent,
      })
      narrativeFactEventIds.push(appended.eventId)
    }

    if (keyEvents.length === 0 && parsed.semanticSignals) {
      const appended = appendEvent({
        eventType: parsed.semanticSignals.eventType,
        title: parsed.digest || '本轮叙事事实',
        description: parsed.digest || '本轮叙事事实',
        scope,
        status: 'occurred',
        tags: ['narrative-digest-fact'],
        metadata: {
          importance: parsed.importance,
          arcStatus: parsed.arcStatus,
          semanticSignals: parsed.semanticSignals,
        },
      }, '本轮没有独立关键事件，使用已验证摘要与完整语义记录事实', {
        digest: parsed.digest,
        semanticSignals: parsed.semanticSignals,
      })
      narrativeFactEventIds.push(appended.eventId)
    }

    if (pendingDeath) {
      const appended = appendEvent({
        eventType: 'character-death',
        title: '人物离世',
        description: pendingDeath.causeLabel,
        scope,
        status: 'occurred',
        participants: [{
          entityId: pendingDeath.entityId,
          contextId: pendingDeath.contextId,
          role: 'deceased',
        }],
        tags: ['character-death', pendingDeath.causeKind],
        metadata: {
          causeKind: pendingDeath.causeKind,
          finalAgeDays: pendingDeath.finalAgeDays,
          occurredAtTotalDays: pendingDeath.occurredAtTotalDays,
        },
      }, '健康系统在本轮原子提交中确认人物死亡', pendingDeath, 'system-commit')
      narrativeFactEventIds.push(appended.eventId)
    }

    const primaryNarrativeEventId = narrativeFactEventIds[0]
    const causalConfig = causalDelay.getConfig()
    for (const item of parsed.deferredCausality ?? []) {
      const dueTotalDays = context.totalDays + causalConfig.delayDaysBySeverity[item.severity]
      const appended = appendEvent({
        eventType: `deferred-${item.type}`,
        title: item.description,
        description: item.description,
        scope,
        status: 'scheduled',
        participants: [
          ...(item.relatedPerson ? [{ label: item.relatedPerson, role: 'related-person' }] : []),
          ...(item.relatedFaction ? [{ label: item.relatedFaction, role: 'related-faction' }] : []),
        ],
        schedule: { dueTotalDays },
        tags: ['deferred-causality', item.type, item.severity],
        metadata: {
          causalType: item.type,
          severity: item.severity,
        },
      }, '延期因果事项来自本轮已通过完整校验的结构化数据', {
        digest: parsed.digest,
        deferredCausality: item,
      })
      deferredEventIds.push(appended.eventId)
      if (primaryNarrativeEventId) {
        causalEdges.push({
          edgeId: createHistoricalTransactionId('causal-edge'),
          fromEventId: primaryNarrativeEventId,
          toEventId: appended.eventId,
          relation: 'causes',
          scope,
          evidenceIds: [appended.evidenceId],
        })
      }
    }

    const dueCausalEvents = parsed.semanticSignals
      ? causalDelay.getCausalEvents().filter((item) => (
          this.pendingNarrativeCausalEventIds.includes(item.id)
        ))
      : []
    for (const due of dueCausalEvents) {
      const appended = appendEvent({
        eventType: 'causal-resolution',
        title: `延期事项兑现：${due.description}`,
        description: parsed.digest || due.description,
        scope,
        status: 'occurred',
        participants: [
          ...(due.relatedPerson ? [{ label: due.relatedPerson, role: 'related-person' }] : []),
          ...(due.relatedFaction ? [{ label: due.relatedFaction, role: 'related-faction' }] : []),
        ],
        tags: ['causal-resolution', due.type, due.severity],
        metadata: {
          causalDelayId: due.id,
          originEventId: due.originEventId,
        },
      }, `本轮完整叙事提交成功后兑现延期事项：${due.description}`, {
        digest: parsed.digest,
        causalDelayId: due.id,
        originEventId: due.originEventId,
      })
      causalResolutionEventIds[due.id] = appended.eventId
      narrativeFactEventIds.push(appended.eventId)

      if (!due.originEventId) continue
      const origin = ledger.getEvent(due.originEventId)
      if (!origin) continue
      if (origin.status === 'scheduled') {
        transitions.push({
          transitionId: createHistoricalTransactionId('transition'),
          eventId: origin.eventId,
          toStatus: 'active',
          reason: '延期事项已经到达规范处理时间并进入本轮叙事',
          evidenceIds: [appended.evidenceId],
        })
        transitions.push({
          transitionId: createHistoricalTransactionId('transition'),
          eventId: origin.eventId,
          toStatus: 'resolved',
          reason: '完整叙事与依赖状态已成功提交，延期事项完成兑现',
          evidenceIds: [appended.evidenceId],
        })
      } else if (
        origin.status === 'active'
        || origin.status === 'occurred'
        || origin.status === 'prevented'
      ) {
        transitions.push({
          transitionId: createHistoricalTransactionId('transition'),
          eventId: origin.eventId,
          toStatus: 'resolved',
          reason: '完整叙事与依赖状态已成功提交，延期事项完成兑现',
          evidenceIds: [appended.evidenceId],
        })
      }
      causalEdges.push({
        edgeId: createHistoricalTransactionId('causal-edge'),
        fromEventId: origin.eventId,
        toEventId: appended.eventId,
        relation: 'resolves',
        scope: this.buildHistoricalCausalScope(origin.scope, scope),
        evidenceIds: [appended.evidenceId],
      })
    }

    if (
      events.length === 0
      && evidence.length === 0
      && transitions.length === 0
      && causalEdges.length === 0
    ) {
      return undefined
    }

    return {
      batch: {
        batchId: createHistoricalTransactionId('batch'),
        source,
        events,
        transitions,
        evidence,
        causalEdges,
      },
      eventIds,
      deferredEventIds,
      causalResolutionEventIds,
    }
  }

  handleNarrativeResponse(
    parsed: ParsedNarrative,
    eventCandidates: readonly HistoricalEventCandidateInput[],
  ): RoundResult {
    const commitSnapshot = this.capturePreviewSnapshot()
    try {
      const narrative = parsed.narrative
      const digest = parsed.digest?.trim()
      if (!narrative.trim()) throw new Error('提交候选缺少正文')
      if (!digest) throw new Error('提交候选缺少结算摘要')

      this.setRoundAdoption({
        responseReceived: true,
        narrativeChars: narrative.length,
        structuredDataPresent: true,
      })

      const focusedIntentBeforeCommit = this.getFocusedBranchIntentRuntime()
      if (!focusedIntentBeforeCommit && parsed.intentResolution) {
        throw new Error('当前没有待判定命运意图，结算不得提交命运意图判定')
      }
      const intentResolutionError = focusedIntentBeforeCommit
        ? validateIntentResolutionForState(focusedIntentBeforeCommit, parsed.intentResolution)
        : undefined
      if (intentResolutionError) throw new Error(intentResolutionError)

      const commitResult = this.applyRoundChanges(parsed.changes, 'narrative')
      if (
        commitResult.rejected.length > 0
        || commitResult.committed.length !== parsed.changes.length
      ) {
        const reasons = commitResult.rejected.map((item) => item.reason)
        throw new Error(`系统变更未能完整提交：${reasons.join('；') || '提交数量不一致'}`)
      }

      const roundSequence = this.state.totalRounds
      const transitionAuditId = `narrative-${this.state.lifeRunId}-${roundSequence}`
      const ageAtRound = this.computeNarrativeAge(this.buildRoundContext())
      const displayTimeLabel = buildNarrativeTimeContext(
        this.buildRoundContext(),
        this.worldSetting,
      ).timeLabel
      const structuredKeyEvents = parsed.keyEvents ?? []
      const ledger = this.getHistoricalEventLedgerRuntime()
      const healthRuntime = this.subsystems.find((item) => item.id === 'health') as (ISubSystem & {
        getPendingDeath: (entityId: string) => PendingDeathFact | undefined
      }) | undefined
      const pendingDeath = healthRuntime?.getPendingDeath(this.buildRoundContext().characterId)
      const historicalInputRequired = structuredKeyEvents.length > 0
        || parsed.semanticSignals !== undefined
        || (parsed.deferredCausality?.length ?? 0) > 0
        || pendingDeath !== undefined
        || eventCandidates.length > 0
      if (historicalInputRequired && !ledger) {
        throw new Error('historical-event-ledger 未注册或公开契约不完整')
      }

      const historicalPlan = ledger
        ? this.buildHistoricalNarrativeTransactionPlan(ledger, parsed, structuredKeyEvents, pendingDeath)
        : undefined
      if (historicalPlan && ledger) {
        const preflight = ledger.preflightBatch(historicalPlan.batch, this.buildRoundContext())
        if (!preflight.ok) {
          throw new Error(`历史批次预检失败：${preflight.errors.join('；')}`)
        }
      }

      let acceptedHistoricalEventIds: string[] = []
      if (historicalPlan && ledger) {
        const historicalCommitContext = this.buildRoundContext()
        const historicalCommit = ledger.commitBatch(
          historicalPlan.batch,
          historicalCommitContext,
        )
        if (
          !historicalCommit.ok
          || historicalCommit.eventIds.length !== historicalPlan.eventIds.length
          || historicalPlan.eventIds.some((eventId) => !historicalCommit.eventIds.includes(eventId))
        ) {
          throw new Error(historicalCommit.errors.join('；') || '历史批次提交结果不完整')
        }
        acceptedHistoricalEventIds = [...historicalCommit.eventIds]
        this.notifyHistoricalEventsCommitted(acceptedHistoricalEventIds, historicalCommitContext)
      }

      if (eventCandidates.length > 0 && ledger) {
        const candidateContext = this.buildRoundContext()
        const submission = ledger.submitCandidates({
          source: {
            kind: 'narrative',
            sourceId: `narrative-event-recognition:${candidateContext.contextId}:${roundSequence}:${candidateContext.totalDays}`,
            description: '故事正文返回后由独立事件识别调用登记的未来待触发事项',
          },
          candidates: eventCandidates.map((candidate) => ({
            ...structuredClone(candidate),
            metadata: {
              ...(candidate.metadata ?? {}),
              recognition: {
                schemaVersion: 1,
                lifeRunId: this.state.lifeRunId,
                executionId: `narrative-round:${this.state.lifeRunId}:${roundSequence}:real`,
                roundSequence,
                contextId: candidateContext.contextId,
                totalDays: candidateContext.totalDays,
                narrativeId: transitionAuditId,
                historicalEventIds: [...acceptedHistoricalEventIds],
              },
            },
          })),
        }, candidateContext)
        if (
          submission.length !== eventCandidates.length
          || submission.some((audit) => audit.status !== 'available')
        ) {
          throw new Error('待触发事件候选未能完整注册')
        }
      }

      if (parsed.semanticSignals) {
        plotStructure.recordNarrativeSignals(parsed.semanticSignals, acceptedHistoricalEventIds)
      }
      foreshadowing.detectForeshadowing(
        roundSequence,
        this.characterState?.age ?? 0,
        parsed.foreshadowing,
        this.worldSetting?.contextId,
        acceptedHistoricalEventIds,
      )
      for (const [index, item] of (parsed.deferredCausality ?? []).entries()) {
        causalDelay.recordCausalEvent(
          item.type,
          item.severity,
          roundSequence,
          ageAtRound,
          item.description,
          item.relatedPerson,
          item.relatedFaction,
          {
            scope: this.worldSetting?.contextId ? 'context' : 'global',
            contextId: this.worldSetting?.contextId,
            createdTotalDays: this.state.round.totalDays,
            originEventId: historicalPlan?.deferredEventIds[index],
          },
        )
      }
      for (const creation of parsed.creations ?? []) {
        if (!this.state.characterCreations.some((existing) => existing.name === creation.name)) {
          this.state.characterCreations.push({
            name: creation.name,
            description: creation.description,
            category: creation.category as CharacterCreation['category'],
            confirmedRound: this.state.totalRounds,
          })
        }
      }

      if (parsed.semanticSignals) {
        if (!parsed.importance || !parsed.arcStatus) {
          throw new Error('语义信号缺少重要程度或情节状态')
        }
        const entities = structuredKeyEvents.flatMap((event) => event.entities ?? [])
        memoryLifecycle.setAISemanticAnalysis(
          roundSequence,
          parsed.importance,
          parsed.arcStatus,
          parsed.semanticSignals,
          entities,
          acceptedHistoricalEventIds,
        )
        coreMemory.recordRelationshipUpdates(
          parsed.semanticSignals.relationshipUpdates,
          roundSequence,
          this.worldSetting?.contextId,
          acceptedHistoricalEventIds,
        )
        foreshadowing.resolveForeshadowing(
          parsed.semanticSignals.resolvedForeshadowingIds,
          narrative,
          roundSequence,
          this.worldSetting?.contextId,
          acceptedHistoricalEventIds,
        )
        for (const causalId of this.pendingNarrativeCausalEventIds) {
          const resolutionEventId = historicalPlan?.causalResolutionEventIds[causalId]
          if (!resolutionEventId) {
            throw new Error(`到期因果 ${causalId} 缺少已提交的历史结果事件`)
          }
          causalDelay.commitCausalTriggers(
            [causalId],
            roundSequence,
            digest,
            {
              currentTotalDays: this.state.round.totalDays,
              resolutionEventId,
            },
          )
        }
        this.pendingNarrativeCausalEventIds = []
      }

      digestLedger.record({
        round: roundSequence,
        contextId: this.worldSetting?.contextId,
        memoryScope: this.worldSetting?.contextId ? 'context' : 'global',
        importance: parsed.importance,
        digest,
        keyEvents: structuredKeyEvents,
      })
      memoryLifecycle.scoreImportance(
        narrative,
        roundSequence,
        this.state.round.year,
        this.worldSetting?.contextId,
      )

      const committedIntentResolution = focusedIntentBeforeCommit && parsed.intentResolution
        ? this.commitFocusedBranchIntentResolution(parsed.intentResolution)
        : undefined
      if (focusedIntentBeforeCommit && !committedIntentResolution) {
        throw new Error('命运意图判定未能提交')
      }

      const repetitionMetric = calculateNarrativeRepetitionMetric({
        round: this.state.totalRounds,
        text: narrative,
        recentHistory: this.state.narrativeHistory.map((entry, index) => ({
          round: Math.max(1, this.state.totalRounds - this.state.narrativeHistory.length + index),
          text: entry.text,
        })),
        windowSize: 5,
      })
      const storyRepetitionStats = summarizeNarrativeRepetitionMetrics([
        ...this.state.narrativeHistory
          .map((entry) => entry.repetitionMetric)
          .filter((metric): metric is NonNullable<typeof metric> => Boolean(metric)),
        repetitionMetric,
      ])
      const transitionAudit: NarrativeTransitionAuditSnapshot = {
        schemaVersion: 1,
        round: this.state.totalRounds,
        narrativeId: transitionAuditId,
        validatedWritePath: true,
        interceptorPassed: true,
        intentValidationPassed: true,
        historicalCommitPassed: true,
        structuredDataPresent: true,
        structuredDataAccepted: true,
        requestedChangeCount: parsed.changes.length,
        committedChangeCount: commitResult.committed.length,
        rejectedChangeCount: 0,
        trusted: true,
        validationClean: true,
        reasons: [],
      }
      const branchMeta = this.resolveBranchFromParsed(parsed)

      this.state.currentNarrative = narrative
      this.state.narrativeHistory.push({
        id: transitionAuditId,
        text: narrative,
        isComplete: true,
        timestamp: Date.now(),
        contextId: this.worldSetting?.contextId,
        memoryScope: this.worldSetting?.contextId ? 'context' : 'global',
        contextName: this.worldSetting?.name,
        totalDays: this.state.round.totalDays,
        displayAge: ageAtRound,
        displayTimeLabel,
        ...(committedIntentResolution ? { intentResolution: committedIntentResolution } : {}),
        repetitionMetric,
        transitionAudit,
        ...(branchMeta.isBranchPoint
          ? {
              isBranchPoint: true,
              branchTitle: branchMeta.branchTitle,
              branchOptions: branchMeta.branchOptions,
            }
          : {}),
      })
      this.state.storyRepetitionStats = storyRepetitionStats
      this.lastNarratedTimeStep = { ...this.state.timeStep }
      this.collectSubsystemStates(false, false)

      this.recordSystemDiagnostic('round-commit', 'transition-audited', 'ok', {
        ...transitionAudit,
      })
      this.setRoundAdoption({
        narrativeAdopted: true,
        structuredDataPresent: true,
        structuredDataAccepted: true,
        requestedChangeCount: parsed.changes.length,
        committedChangeCount: commitResult.committed.length,
        rejectedChangeCount: 0,
        rejectedReasons: [],
        narrativeId: transitionAuditId,
        narrativeChars: narrative.length,
      })

      const result: RoundResult = {
        narrative,
        changes: commitResult.committed.map((change) => ({
          id: change.id,
          description: change.description,
          changes: change.changes,
        })),
        notableEvents: parsed.notableEvents,
        intentResolution: committedIntentResolution,
      }
      eventBus.emit('mod-engine:round-complete', result)
      this.publishSimulationSnapshot()
      this.runCompressionPipeline()
      return result
    } catch (error) {
      this.restorePreviewSnapshot(commitSnapshot)
      throw error
    }
  }

  // === NarrativeStage 阶段机（#13: 吸收 Factorio Story Script） ===

  /**
   * 缓存的叙事阶段（从 campaigns/ 加载）。
   *
   * Campaign 的阶段闭包会捕获 Prompt、模型配置和会话 ID，因而不能只按
   * "是否已经加载过" 复用；否则热更新或设置变更后仍会向 AI 发送旧 Prompt。
   */
  private _stages: NarrativeStage[] | null = null
  private _stagesCacheKey: string | null = null

  private buildCampaignStagesCacheKey(
    aiConfig: AIModelConfig,
    promptTemplate: PromptTemplate,
    sessionId: string | undefined,
    modName: string,
    campaignName: string,
  ): string {
    return JSON.stringify({
      modName,
      campaignName,
      sessionId,
      aiConfig,
      prompt: {
        name: promptTemplate.name,
        version: promptTemplate.version,
        systemPrompt: promptTemplate.systemPrompt,
        userPromptTemplate: promptTemplate.userPromptTemplate,
        variables: promptTemplate.variables,
        outputFormat: promptTemplate.outputFormat,
      },
    })
  }

  /**
   * 从 MOD 的 campaigns/ 目录加载叙事阶段定义
   *
   * 吸收 Factorio campaigns/ 设计：
   *   叙事配置与引擎逻辑分离，orchestrator 读取 campaign 配置驱动叙事。
   *
   * @param aiConfig - AI 模型配置（传递给 stage 闭包）
   * @param promptTemplate - Prompt 模板（传递给 stage 闭包）
   * @param sessionId - 会话 ID（传递给 stage 闭包）
   * @param modName - MOD 名称（默认 'mod-engine'）
   * @param campaignName - campaign 名称（默认 'default'）
   */
  private async loadCampaignStages(
    aiConfig: AIModelConfig,
    promptTemplate: PromptTemplate,
    sessionId?: string,
    modName = 'mod-engine',
    campaignName = 'default',
  ): Promise<NarrativeStage[]> {
    const cacheKey = this.buildCampaignStagesCacheKey(
      aiConfig,
      promptTemplate,
      sessionId,
      modName,
      campaignName,
    )
    if (this._stages && this._stagesCacheKey === cacheKey) return this._stages

    try {
      const campaign = await import(`@/mods/${modName}/campaigns/${campaignName}`) as {
        loadStages?: (aiConfig: AIModelConfig, promptTemplate: PromptTemplate, sessionId?: string) => NarrativeStage[]
        stages?: NarrativeStage[]
      }
      const stages = campaign.loadStages?.(aiConfig, promptTemplate, sessionId) ?? campaign.stages ?? []
      this._stages = stages
      this._stagesCacheKey = cacheKey
      return stages
    } catch {
      // MOD 没有 campaigns 目录 → 使用空数组（报错，不静默回退）
      console.warn('[Orchestrator] 未找到 campaign 定义，无法执行阶段机')
      this._stages = []
      this._stagesCacheKey = cacheKey
      return []
    }
  }

  /**
   * 执行叙事阶段机
   *
   * 按阶段声明的执行图逐阶段执行。每阶段支持：
   *   - onEnter: 进入阶段时执行一次
   *   - onUpdate: 每轮执行
   *   - shouldProceed: 判断是否可前进（返回 true → 进入下一阶段）
   *   - onExit: 离开阶段时执行一次
   *   - maxRounds: 阶段执行次数上限，超限进入失败终态
   *
   * 吸收 Factorio Story Script 的 init→update→condition→action 模型。
   */
  private async runStageMachine(
    stages: NarrativeStage[],
    context: RoundContext,
  ): Promise<void> {
    if (stages.length === 0) return
    const executionRoundSequence = (context.roundSequence ?? this.state.totalRounds) + 1

    const nodes = stages.map((stage, index) => ({
      id: stage.name,
      owner: stage.owner,
      failureTarget: stage.failureTarget,
      phase: stage.phase,
      dependsOn: stage.dependsOn,
      order: stage.order,
      parallelGroup: stage.parallelGroup,
      outcomes: createExecutionOutcomeCodes('narrative-round', stage.name),
      run: async (stageContext: RoundContext) => {
        let roundCount = 0
        const stageStartedAt = performance.now()
        let failurePoint: 'onEnter' | 'onUpdate' | 'shouldProceed' | 'onExit' | 'maxRounds' | undefined
        logger.debug('orchestrator-stage', 'stage-enter', {
          stage: stage.name,
          index,
          total: stages.length,
          round: this.state.totalRounds,
        })

        try {
          failurePoint = 'onEnter'
          await stage.onEnter?.(stageContext)

          while (true) {
            roundCount += 1
            const maxRounds = stage.maxRounds ?? 100
            if (roundCount > maxRounds) {
              failurePoint = 'maxRounds'
              throw new Error(`阶段 "${stage.name}" 超过 maxRounds=${maxRounds}`)
            }

            failurePoint = 'onUpdate'
            await stage.onUpdate?.(stageContext)

            failurePoint = 'shouldProceed'
            const shouldProceed = stage.shouldProceed
              ? await stage.shouldProceed(stageContext)
              : true
            if (shouldProceed) break
          }

          failurePoint = 'onExit'
          await stage.onExit?.(stageContext)
          logger.debug('orchestrator-stage', 'stage-exit', {
            stage: stage.name,
            index,
            rounds: roundCount,
          })
          this.pushDiagnosticPhase({
            name: stage.name,
            status: 'completed',
            durationMs: Math.max(0, Math.round(performance.now() - stageStartedAt)),
            details: { index, iterations: roundCount },
          })
          return { status: 'succeeded' as const }
        } catch (error) {
          const stageError: NarrativeDiagnosticPhase['error'] = {
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }
          logger.error('orchestrator-stage', 'stage-failed', error)
          this.pushDiagnosticPhase({
            name: stage.name,
            status: 'failed',
            durationMs: Math.max(0, Math.round(performance.now() - stageStartedAt)),
            details: { index, iterations: roundCount, failurePoint },
            error: stageError,
          })
          throw error
        }
      },
    }))

    const result = await runExecutionSequence({
      flowId: 'narrative-round',
      executionId: `narrative-round:${this.state.lifeRunId}:${executionRoundSequence}:${this.isPreviewExecution() ? 'preview' : 'real'}`,
      owner: 'mod-engine',
      context,
      nodes,
    })
    if (result.status !== 'succeeded') {
      throw executionSequenceError(result)
    }
  }

  /**
   * 使用阶段机执行回合（V2 入口）
   *
   * 始终使用声明式阶段机驱动回合管线。
   * 不再回退到旧的 executeRound() 硬编码管线。
   *
   * @param promptTemplate - Prompt 模板
   * @param aiConfig - AI 配置
   * @param sessionId - 会话 ID
   * @returns 回合结果
   */
  async executeRoundV2(
    promptTemplate: PromptTemplate,
    aiConfig: AIModelConfig,
    sessionId?: string,
  ): Promise<RoundResult> {
    // 预生成与真实回合共享 orchestrator 单写者。失效预生成会先取消 AI，
    // 但必须连同快照恢复一起完成，真实回合才可以接管，避免状态交错回滚。
    await this.waitForPreviewCompletion()

    // 从单一来源常量取默认字数，与 Prompt 组装、pre-gen、hooks 共享同一常量
    const settings = useSettingsStore.getState()
    const wordCountTarget = settings.wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
    const effectiveAiConfig: AIModelConfig = {
      ...aiConfig,
      maxTokens: computeNarrativeMaxTokens(wordCountTarget, {
        reasoningEffort: aiConfig.reasoningEffort ?? settings.reasoningEffort,
        providerId: settings.provider,
        model: aiConfig.model,
      }),
    }
    // 先建立真实回合诊断，再加载阶段定义；这样阶段缺失或初始化异常也有可追溯记录。
    this.beginRoundDiagnostic(this.state.totalRounds + 1)
    const stages = await this.loadCampaignStages(effectiveAiConfig, promptTemplate, sessionId)

    // 没有 campaign 阶段定义 → 报错（不应静默回退）
    if (stages.length === 0) {
      console.error('[Orchestrator] 阶段机无可用阶段，回合中止')
      const error = new Error('阶段机无可用阶段')
      this.finishRoundDiagnostic('failed', error)
      throw error
    }

    if (this.state.status !== 'running' && this.state.status !== 'idle') {
      const error = new Error(`当前引擎状态不允许推进：${this.state.status}`)
      this.finishRoundDiagnostic('failed', error)
      throw error
    }
    if (this.shouldStop()) {
      this.state.status = 'complete'
      return { narrative: '', changes: [], notableEvents: [] }
    }

    this.state.status = 'running'
    this.lastAiConfig = effectiveAiConfig
    this.lastSessionId = sessionId
    // 每次执行都从空结果开始，避免预览/HMR 后沿用上一轮完整响应。
    this.lastExecutedFullContent = null
    this.lastNarrativeLuckGuidance = null
    const context = this.buildRoundContext()

    // Instrument: onRoundStart
    if (isInstrumentEnabled()) {
      getInstrumentHooks().onRoundStart?.(this.state.totalRounds)
    }
    const roundT0 = performance.now()

    try {
      // 使用阶段机驱动回合管线
      await this.runStageMachine(stages, context)

      if (!this.lastExecutedFullContent) {
        const rejection = new Error('叙事生成结果未通过完整性与结构门禁，本轮未推进，请重新尝试。')
        rejection.name = 'NarrativeGenerationRejectedError'
        logger.warn('orchestrator', 'round-rejected-no-committable-narrative', {
          round: this.state.totalRounds + 1,
          lastNarrativeChars: this.state.currentNarrative?.length ?? 0,
        })
        throw rejection
      }

      // maxRounds 是回合完成后的终局边界；达到时立即进入 complete，
      // 不要求玩家再点击一次空推进。
      if (this.shouldStop()) {
        this.state.status = 'complete'
      }

      // Instrument: onRoundEnd
      if (isInstrumentEnabled()) {
        getInstrumentHooks().onRoundEnd?.(this.state.totalRounds, performance.now() - roundT0)
      }

      // 构建结果（从阶段机执行后的状态中提取）
      const result: RoundResult = {
        narrative: this.state.currentNarrative,
        changes: [],
        notableEvents: this.lastNotableEvents ?? [],
      }
      this.finishRoundDiagnostic('completed')
      return result
    } catch (error) {
      this.finishRoundDiagnostic('failed', error)
      throw error
    }
  }
}

/** 单例 */
export const orchestrator = new OrchestratorSystem()
