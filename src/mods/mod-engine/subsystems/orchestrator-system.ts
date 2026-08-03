/**
 * Purpose: Coordinate one core simulation round across local systems, narrative AI, and post-story analysis.
 * Owner: mod-engine
 * Responsibility: Hold round state and delegate owned work; subsystem logic and prompt projections stay downstream.
 *
 * @module orchestrator-system.ts
 * @description 引擎编排子系统 —— 协调本地模拟、故事后并行 AI 分析与原子提交
 * @mod mod-engine
 *
 * 默认 Campaign 负责声明阶段顺序；本系统只提供上下文、状态快照、
 * 严格提交和失败恢复边界，不保留第二条硬编码回合管线。
 */

import { BaseSubsystem, eventBus, EXECUTION_FLOWS } from '@/core'
import { isInstrumentEnabled, getInstrumentHooks } from '@/core/instrument/instrument-mode'
import {
  executionSequenceError,
  runExecutionSequence,
} from '@/foundation'
import { getMvpRuntimeSubsystemOrder } from '../helpers/mvp-runtime-policy'
import type {
  EntityLifecycleState,
  PendingDeathFact,
  NarrativeStage,
  YearEvent,
} from '@/foundation'
import { saveManager } from '@/core/storage/save-manager'
import {
  DEFAULT_ENGINE_CONFIG,
  buildStyleInstruction,
  extractBridgeSnapshot,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  isMvpRuntimeSubsystem,
  resolveTimeStep,
  shouldAlignTimeStepTransition,
  mapSubsystemStatesToDetectionStates,
  RoundCommitBus,
  readEraStartYearFromConfig,
  readBirthEraYearFromConfig,
  collectGameSavePayload,
  computeNarrativeMaxTokens,
  DEFAULT_WORD_COUNT_TARGET,
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
  type TimeStep,
  type NarrativeEventCommitData,
  type ParsedNarrative,
  type DigestLedgerSnapshot,
  createNarrativeLifeRunId,
  isNarrativeRepetitionMetric,
  summarizeNarrativeHistoryRepetition,
  summarizeNarrativeRepetitionMetrics,
  NarrativeBackgroundResultInbox,
  type NarrativeBackgroundAnalysisIdentity,
  type NarrativeBackgroundAnalysisKind,
  type NarrativeBackgroundAnalysisRecord,
} from '../orchestrator-shared'

import { useSettingsStore } from '@/mods/mod-settings'
import { logger } from '@/core/logger/client-logger'
import type {
  NarrativeDiagnosticPhase,
  NarrativeRoundAdoption,
  NarrativeRoundOutcomeReport,
} from '@/core/logger/narrative-round-diagnostic'
import {
  recordExecutionSequenceResult,
  type DevelopmentSystemStatus,
} from '@/core/logger/development-system-diagnostic'
import { useCharacterStore } from '@/mods/mod-character'
import {
  type NarrativeIntentResolution,
  type NarrativeRoundMetadata,
} from '../helpers/narrative-semantic-signals'
import {
  commitBranchIntentResolution,
  findFocusedBranchIntent,
  findMostRecentlyUpdatedBranchIntentId,
  isBranchIntentProjectionConsistent,
  normalizeBranchIntentProjection,
  rebuildBranchIntentsFromHistory,
  upsertBranchIntent,
  type BranchIntentProjection,
  type BranchIntentState,
} from '../helpers/branch-intent-resolution'
import { getSeasonForMonth } from '../helpers/calendar-season.js'
import type { NarrativeTimelineEntry } from '../helpers/timeline-memory'
import {
  type NarrativeScopeView,
} from '../helpers/narrative-context-scope'
import type {
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateInput,
  HistoricalEventScope,
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
} from '@/foundation'
import { createSubsystemAdvanceExecutionNodes } from '../helpers/subsystem-execution-flow'
import {
  RoundDiagnosticController,
  CampaignStageRuntime,
  getNarrativeScopeViewRuntime,
  refreshNarrativeMemoryRecallRuntime,
  buildPromptTimelineMemoryRuntime,
  formatNarrativeHistoryEntryRuntime,
  projectNarrativeHistoryEntryRuntime,
  projectRoundMemoryEventRuntime,
  resolveNarrativeRoundTimeRuntime,
  buildYearEventsRuntime,
  ensureCompressionGateRuntime,
  runCompressionPipelineRuntime,
  acceptNarrativeResponseRuntime,
  buildHistoricalCausalScopeRuntime,
  getAvailableHistoricalEventCandidatesRuntime,
  getCurrentHistoricalScopeRuntime,
  getHistoricalEventLedgerRuntimeRuntime,
  notifyHistoricalEventsCommittedRuntime,
  type HistoricalEventLedgerRuntime,
  buildHistoricalNarrativeTransactionPlanRuntime,
  type HistoricalNarrativeTransactionOptions,
  type HistoricalNarrativeTransactionPlan,
  consumeEventRecognitionRecordRuntime,
  consumeNarrativeBackgroundResultsRuntime,
  consumeSystemAnalysisRecordRuntime,
  deferAcceptedNarrativeCausalityAfterRecognitionFailureRuntime,
  getNarrativeBackgroundAnalysisRecordsRuntime,
  launchNarrativeBackgroundAnalysisRuntime,
  reconcileAcceptedNarrativeRecordsRuntime,
  recordNarrativeBackgroundLaunchFailureRuntime,
  applyNarrativeEventRecognitionRuntime,
  updateNarrativeTransitionAuditRuntime,
  assemblePromptContextRuntime,
  buildRoundGuidanceInputRuntime,
  buildAbbreviationSnapshotRuntime,
  buildHintInputRuntime,
  buildInfluenceTextRuntime,
  buildLightWorldSettingRuntime,
  buildSystemChangeSummaryRuntime,
  buildTimeBridgeInputRuntime,
  getMemoryL0TitlesRuntime,
  getSystemContextRuntime,
} from './orchestrator-system/delegated-runtimes'

// Uses pattern matching via patternManager; USE_PATTERN_MANAGER feature flag managed centrally

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


export interface AcceptedNarrativeResult extends RoundResult {
  narrativeId: string
  roundSequence: number
  deliveredCausalEventIds: string[]
}

interface AcceptedNarrativeRecord {
  schemaVersion: 1
  lifeRunId: string
  roundSequence: number
  narrativeId: string
  acceptedAt: number
  roundContext: RoundContext
  narrative: ParsedNarrative
  deliveredCausalEventIds: string[]
  focusedIntentId?: string
}

interface NarrativeSystemAnalysisResult {
  changes: SubSystemChanges[]
}

interface NarrativeEventRecognitionResult {
  metadata: NarrativeRoundMetadata
  candidates: HistoricalEventCandidateInput[]
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

  /** 最近一次事件识别返回的长期事件。 */
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

  /** 已接纳正文的不可变来源快照；后台结果只能按此身份提交。 */
  private readonly acceptedNarrativeRecords = new Map<string, AcceptedNarrativeRecord>()

  /** 四路后台 AI 的版本化结果收件箱；仅在确定性回合边界消费。 */
  private readonly narrativeBackgroundInbox = new NarrativeBackgroundResultInbox()

  /** 预生成/预览执行深度：只允许临时推进到 AI 输出，不提交真实副作用 */
  private previewExecutionDepth = 0

  /** 当前预览任务的取消信号；失效预生成必须停止请求后才能释放单写者。 */
  private previewAbortSignal?: AbortSignal

  /** 预览任务（含快照恢复）的清理完成门；真实回合接管前等待它结束。 */
  private previewCompletion: Promise<void> | null = null

  /** 真实回合压缩唯一 AI 闸门；失败会拒绝当前回合终态。 */
  private pendingCompression: Promise<void> | null = null
  /** 最近一次压缩闸门终态失败；清除前不得开始新回合。 */
  private compressionGateFailure: Error | null = null

  /** 压缩系统从本存档数据库返回的按需时间轴回忆。 */
  private narrativeMemoryRecall: NarrativeTimelineEntry[] = []

  private readonly roundDiagnostics = new RoundDiagnosticController(() => ({
    lifeRunId: this.state.lifeRunId,
    preview: this.isPreviewExecution(),
  }))

  private beginRoundDiagnostic(round: number): void {
    this.roundDiagnostics.begin(round)
  }

  private finishRoundDiagnostic(status: 'completed' | 'failed', error?: unknown): void {
    this.roundDiagnostics.finish(status, error)
  }

  private recordSystemDiagnostic(
    system: string,
    event: string,
    status: DevelopmentSystemStatus,
    details?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.roundDiagnostics.recordSystem(system, event, status, details, error)
  }

  private pushDiagnosticPhase(phase: NarrativeDiagnosticPhase): void {
    this.roundDiagnostics.pushPhase(phase)
  }

  noteNarrativeQuality(details: Record<string, unknown>): void {
    this.roundDiagnostics.noteNarrativeQuality(details)
  }

  setRoundAdoption(adoption: Partial<NarrativeRoundAdoption>): void {
    this.roundDiagnostics.setRoundAdoption(adoption)
  }

  setCompressionDiagnostic(details: Record<string, unknown>): void {
    this.roundDiagnostics.setCompression(details)
  }

  setAutoSaveDiagnostic(details: Record<string, unknown>): void {
    this.roundDiagnostics.setAutoSave(details)
  }

  getLastRoundDiagnostic(): NarrativeRoundOutcomeReport | null {
    return this.roundDiagnostics.getLastReport()
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

  getCharacterStateSnapshot(): CharacterState {
    if (!this.characterState) throw new Error('角色状态尚未初始化')
    return structuredClone(this.characterState)
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
    if (this.compressionGateFailure) throw this.compressionGateFailure
  }

  isCompressionGateBlocked(): boolean {
    return this.compressionGateFailure !== null
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
    this.compressionGateFailure = null
    this.lastPlayerChoice = snap.lastPlayerChoice
    this.consecutiveSameGoalRounds = snap.consecutiveSameGoalRounds ?? 0
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
    this.reconcileAcceptedNarrativeRecords()
  }

  restorePreviewSnapshot(snap: OrchestratorPreviewSnapshot): void {
    this.restoreSnapshot(snap.orchestrator, false)
    this.pendingTimeStepAlignmentFromUnit = snap.pendingTimeStepAlignmentFromUnit
    this.pendingTimeStepAlignmentFromValue = snap.pendingTimeStepAlignmentFromValue
    this.restoreSubsystemPreviewStates(snap.subsystemPreviewStates)
    useEngineStore.setState(snap.engineStoreRuntime)
    useCharacterStore.setState(snap.characterStoreRuntime)
    this.reconcileAcceptedNarrativeRecords()
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
    context: RoundContext,
    subsystems: readonly ISubSystem[],
    run: (subsystem: ISubSystem) => void,
  ): Promise<void> {
    const flow = EXECUTION_FLOWS.subsystemAdvance
    const nodes = createSubsystemAdvanceExecutionNodes(flow, subsystems, run)

    const result = await runExecutionSequence({
      flow,
      executionId: `${flow.flowId}:${this.state.lifeRunId}:${this.state.totalRounds}:${Date.now()}`,
      context,
      nodes,
    })
    recordExecutionSequenceResult(result, {
      lifeRunId: this.state.lifeRunId,
      round: (context.roundSequence ?? this.state.totalRounds) + 1,
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
    return buildYearEventsRuntime(this)
  }

  private runCompressionPipeline(): Promise<void> {
    return runCompressionPipelineRuntime(this)
  }

  async ensureCompressionGate(): Promise<void> {
    await ensureCompressionGateRuntime(this)
  }

  /** Prompt 只读取当前、全局或明确可跨界携带的故事；源记录始终完整保留。 */
  private getNarrativeScopeView(): NarrativeScopeView {
    return getNarrativeScopeViewRuntime(this)
  }

  async refreshNarrativeMemoryRecall(): Promise<void> {
    await refreshNarrativeMemoryRecallRuntime(this)
  }

  private buildPromptTimelineMemory(): string | undefined {
    return buildPromptTimelineMemoryRuntime(this)
  }

  private resolveNarrativeRoundTime(round: number): {
    displayTimeLabel?: string
    displayAge?: number
    totalDays?: number
  } | undefined {
    return resolveNarrativeRoundTimeRuntime(this, round)
  }

  private projectRoundMemoryEvent(
    round: number,
    text: string,
    contextId?: string,
  ): NarrativeTimelineEntry {
    return projectRoundMemoryEventRuntime(this, round, text, contextId)
  }

  private projectNarrativeHistoryEntry(
    entry: NarrativeChunk,
    round: number,
  ): NarrativeTimelineEntry {
    return projectNarrativeHistoryEntryRuntime(this, entry, round)
  }

  private formatNarrativeHistoryEntry(entry: NarrativeChunk, round: number): string {
    return formatNarrativeHistoryEntryRuntime(this, entry, round)
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
    this.acceptedNarrativeRecords.clear()
    this.narrativeBackgroundInbox.reset()
    this.lastPlayerChoice = undefined
    this.lastCommittedPlayerChoice = undefined
    this.branchIntents = []
    this.archivedBranchIntents = []
    this.focusedBranchIntentId = undefined
    this.pendingNarrativeCausalEventIds = []
    this.consecutiveSameGoalRounds = 0
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
    this.acceptedNarrativeRecords.clear()
    this.narrativeBackgroundInbox.reset()
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

  assemblePromptContext(eventInjectionText?: string): PromptContext {
    return assemblePromptContextRuntime(this, eventInjectionText)
  }

  private buildTimeBridgeInput() {
    return buildTimeBridgeInputRuntime(this)
  }

  private getMemoryL0Titles(fromYear: number, toYear: number): string[] {
    return getMemoryL0TitlesRuntime(this, fromYear, toYear)
  }

  private buildAbbreviationSnapshot(): Record<string, string> {
    return buildAbbreviationSnapshotRuntime(this)
  }

  private buildSystemChangeSummary(current: Record<string, string>): string {
    return buildSystemChangeSummaryRuntime(this, current)
  }

  private buildInfluenceText(): string | undefined {
    return buildInfluenceTextRuntime(this)
  }

  getSystemContext(): string {
    return getSystemContextRuntime(this)
  }

  private buildLightWorldSetting(eraLabel: string): WorldSetting {
    return buildLightWorldSettingRuntime(this, eraLabel)
  }

  private buildRoundGuidanceInput(luckNarrativeGuidance?: LuckNarrativeGuidance): {
    roundSystemGuidanceText?: string
    playerBranchIntent?: Record<string, unknown>
  } {
    return buildRoundGuidanceInputRuntime(this, luckNarrativeGuidance)
  }

  private buildHintInput(): NarrativeHintInput {
    return buildHintInputRuntime(this)
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
    focusedIntentId = this.focusedBranchIntentId,
  ): NarrativeIntentResolution | undefined {
    const result = commitBranchIntentResolution(
      this.branchIntents,
      focusedIntentId,
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
    return getHistoricalEventLedgerRuntimeRuntime(this)
  }

  getAvailableHistoricalEventCandidates(): HistoricalEventCandidateAudit[] {
    return getAvailableHistoricalEventCandidatesRuntime(this)
  }

  private notifyHistoricalEventsCommitted(
    eventIds: string[],
    context: RoundContext,
  ): void {
    notifyHistoricalEventsCommittedRuntime(this, eventIds, context)
  }

  private getCurrentHistoricalScope(contextIdInput?: string): HistoricalEventScope {
    return getCurrentHistoricalScopeRuntime(this, contextIdInput)
  }

  private buildHistoricalCausalScope(
    sourceScope: HistoricalEventScope,
    resultScope: HistoricalEventScope,
  ): HistoricalEventScope {
    return buildHistoricalCausalScopeRuntime(this, sourceScope, resultScope)
  }

  private buildHistoricalNarrativeTransactionPlan(
    ledger: HistoricalEventLedgerRuntime,
    parsed: NarrativeEventCommitData,
    structuredKeyEvents: NonNullable<NarrativeEventCommitData['keyEvents']>,
    pendingDeath?: PendingDeathFact,
    options: HistoricalNarrativeTransactionOptions = {},
  ): HistoricalNarrativeTransactionPlan | undefined {
    return buildHistoricalNarrativeTransactionPlanRuntime(
      this,
      ledger,
      parsed,
      structuredKeyEvents,
      pendingDeath,
      options,
    )
  }

  acceptNarrativeResponse(parsed: ParsedNarrative): AcceptedNarrativeResult {
    return acceptNarrativeResponseRuntime(this, parsed)
  }

  launchNarrativeBackgroundAnalysis<TResult>(input: {
    kind: NarrativeBackgroundAnalysisKind
    narrativeId: string
    userSegments: readonly string[]
    work: () => Promise<TResult>
  }): NarrativeBackgroundAnalysisIdentity {
    return launchNarrativeBackgroundAnalysisRuntime(this, input)
  }

  recordNarrativeBackgroundLaunchFailure(input: {
    kind: NarrativeBackgroundAnalysisKind
    narrativeId: string
    error: unknown
  }): void {
    recordNarrativeBackgroundLaunchFailureRuntime(this, input)
  }

  consumeNarrativeBackgroundResults(): void {
    consumeNarrativeBackgroundResultsRuntime(this)
  }

  getNarrativeBackgroundAnalysisRecords(): NarrativeBackgroundAnalysisRecord[] {
    return getNarrativeBackgroundAnalysisRecordsRuntime(this)
  }

  private reconcileAcceptedNarrativeRecords(): void {
    reconcileAcceptedNarrativeRecordsRuntime(this)
  }

  private consumeSystemAnalysisRecord(
    record: NarrativeBackgroundAnalysisRecord<NarrativeSystemAnalysisResult>,
  ): void {
    consumeSystemAnalysisRecordRuntime(this, record)
  }

  private consumeEventRecognitionRecord(
    record: NarrativeBackgroundAnalysisRecord<NarrativeEventRecognitionResult>,
  ): void {
    consumeEventRecognitionRecordRuntime(this, record)
  }

  private deferAcceptedNarrativeCausalityAfterRecognitionFailure(
    accepted: AcceptedNarrativeRecord,
  ): void {
    deferAcceptedNarrativeCausalityAfterRecognitionFailureRuntime(this, accepted)
  }

  private updateNarrativeTransitionAudit(
    narrativeId: string,
    counts: { requestedChangeCount: number; committedChangeCount: number },
  ): void {
    updateNarrativeTransitionAuditRuntime(this, narrativeId, counts)
  }

  private applyNarrativeEventRecognition(
    accepted: AcceptedNarrativeRecord,
    result: NarrativeEventRecognitionResult,
  ): void {
    applyNarrativeEventRecognitionRuntime(this, accepted, result)
  }

  private readonly campaignStageRuntime = new CampaignStageRuntime()

  private loadCampaignStages(
    aiConfig: AIModelConfig,
    promptTemplate: PromptTemplate,
    sessionId?: string,
    modName = 'mod-engine',
    campaignName = 'default',
  ): Promise<NarrativeStage[]> {
    return this.campaignStageRuntime.load(
      aiConfig,
      promptTemplate,
      sessionId,
      modName,
      campaignName,
    )
  }

  private runStageMachine(
    stages: NarrativeStage[],
    context: RoundContext,
  ): Promise<void> {
    return this.campaignStageRuntime.run(stages, context, {
      lifeRunId: this.state.lifeRunId,
      totalRounds: this.state.totalRounds,
      preview: this.isPreviewExecution(),
      pushDiagnosticPhase: (phase) => this.pushDiagnosticPhase(phase),
    })
  }

  /**
   * 使用阶段机执行回合（V2 入口）
   *
   * 始终使用声明式阶段机驱动回合管线。
   * 不再回退到旧的硬编码回合管线。
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
