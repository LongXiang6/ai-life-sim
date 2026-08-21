/**
 * Purpose: Coordinate one core simulation round across local systems, narrative AI, and post-story analysis.
 * Owner: mod-engine
 * Responsibility: Hold round state and delegate owned work; subsystem logic and prompt projections stay downstream.
 *
 * @module orchestrator-system.ts
 * @description 引擎编排子系统 —— 协调本地模拟、故事后并行 AI 分析与原子提交
 * @mod mod-engine
 *
 * 默认 Campaign 负责声明阶段顺序；本系统只提供上下文、持久化状态导出、
 * 严格提交和错误终止边界，不保留第二条硬编码回合管线。
 */

import { BaseSubsystem, EXECUTION_FLOWS } from '@/core'
import { isInstrumentEnabled, getInstrumentHooks } from '@/core/instrument/instrument-mode'
import {
  executionSequenceError,
  runExecutionSequence,
} from '@/foundation'
import { getMvpRuntimeSubsystemOrder } from '../helpers/mvp-runtime-policy'
import type {
  CharacterNarrativeStatus,
  NarrativeStage,
  YearEvent,
} from '@/foundation'
import type { NarrativeRepetitionMetric } from '../helpers/narrative-repetition-metrics'
import { saveManager } from '@/core/storage/save-manager'
import {
  DEFAULT_ENGINE_CONFIG,
  buildStyleInstruction,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  isMvpRuntimeSubsystem,
  resolveTimeStep,
  shouldAlignTimeStepTransition,
  mapSubsystemStatesToDetectionStates,
  RoundCommitBus,
  readEraStartYearFromConfig,
  readBirthEraYearFromConfig,
  simulationBridge,
  CausalDelaySystem,
  ForeshadowingSystem,
  MemoryLifecycleSystem,
  PlotStructureSystem,
  SubsystemRelevanceSystem,
  SummaryCompressorSystem,
  TimeSystem,
  timeSystem,
  summaryCompressor,
  plotStructure,
  foreshadowing,
  memoryLifecycle,
  causalDelay,
  subsystemRelevance,
  useEngineStore,
  type EventLifecycleTracker,
  type RoundCommitSource,
  type RoundCommitResult,
  type EngineState,
  type RoundInfo,
  type RoundResult,
  type NarrativeChunk,
  type NarrativeDestinyPatternGrowthProjection,
  type NarrativeAIStoryContinuityData,
  type PreparedNarrativeStoryContinuity,
  type NarrativeStoryContinuityTransactionSnapshot,
  type CharacterCreation,
  type TimeStep,
  type ParsedNarrative,
  createNarrativeLifeRunId,
  isNarrativeRepetitionMetric,
  summarizeNarrativeHistoryRepetition,
  summarizeNarrativeRepetitionMetrics,
} from '../orchestrator-shared'

import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
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
import { getSeasonForMonth } from '../helpers/calendar-season.js'
import type { NarrativeTimelineEntry } from '../helpers/timeline-memory'
import {
  type NarrativeScopeView,
} from '../helpers/narrative-context-scope'
import type {
  HistoricalEventCandidateAudit,
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
  buildPromptTimelineMemoryRuntime,
  formatNarrativeHistoryEntryRuntime,
  projectNarrativeHistoryEntryRuntime,
  projectRoundMemoryEventRuntime,
  resolveNarrativeRoundTimeRuntime,
  buildYearEventsRuntime,
  prepareNarrativeResponseRuntime,
  commitNarrativeResponseRuntime,
  finalizeNarrativeResponseRuntime,
  discardNarrativeResponseRuntime,
  buildHistoricalCausalScopeRuntime,
  getAvailableHistoricalEventCandidatesRuntime,
  getDueHistoricalEventCandidatesRuntime,
  getCurrentHistoricalScopeRuntime,
  getHistoricalEventLedgerRuntimeRuntime,
  notifyHistoricalEventsCommittedRuntime,
  type HistoricalEventLedgerRuntime,
  buildHistoricalDeathTransactionPlanRuntime,
  type HistoricalDeathTransactionPlan,
  captureNarrativeStoryContinuityLedgerTransactionRuntime,
  commitPreparedNarrativeStoryContinuityLedgerRuntime,
  prepareNarrativeStoryContinuityLedgerRuntime,
  restoreNarrativeStoryContinuityLedgerTransactionRuntime,
  updateNarrativeTransitionAuditRuntime,
  assemblePromptContextRuntime,
  buildRoundGuidanceInputRuntime,
  buildLightWorldSettingRuntime,
} from './orchestrator-system/delegated-runtimes'
import type {
  PreparedNarrativeStoryContinuityLedger,
  StoryContinuitySourceTime,
} from './orchestrator-system/narrative-story-continuity-contracts'

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

/** 编排器可持久化状态。 */
/** 存档使用的编排器持久化状态；不提供运行时回退或预览恢复能力。 */
export interface OrchestratorPersistenceState {
  /** 保存时当前世界上下文，用于与 world Store 交叉校验 */
  worldContextId?: string
  state: EngineState
  lastSubsystemStates: Record<string, SubSystemState>
  eventLifecycle: EventLifecycleTracker
  /** 本次叙事开始前的时间节点；用于给 Prompt 提供真实的起止窗口。 */
  previousNarrativeRound?: RoundInfo
  timeRound: RoundInfo
  lastNarratedTimeStep?: TimeStep
  /** 当前叙事是否处于粗→细切换后的首轮边界对齐桥接。 */
  lastTimeStepAlignment?: {
    fromUnit: TimeStep['unit']
    fromValue: number
  }
  lastExecutedFullContent?: string | null
  lastPlayerChoice?: string
  lastNarrativeLuckGuidance?: LuckNarrativeGuidance | null
  /** 不由 EngineState 或外部 Store 单独拥有的内部叙事系统状态 */
  engineSubsystemStates?: Record<string, unknown>
  /** 外部系统的完整存档状态；与每轮 collectState 相关视图分离。 */
  persistentSubsystemStates?: Record<string, unknown>
}

type RuntimeManagedSubsystem = ISubSystem & {
  hydrateFromStore?: () => void
  restoreCollectedState?: (snapshot: unknown) => void
  capturePersistenceState?: () => unknown
  restorePersistenceState?: (snapshot: unknown) => void
  importLegacyCollectedStates?: (states: Record<string, SubSystemState>) => boolean
  onHistoricalEventsCommitted?: (eventIds: string[], context: RoundContext) => void
}

type LuckNarrativeRuntime = ISubSystem & {
  prepareNarrativeGuidance: (context: RoundContext) => LuckNarrativeGuidance
}

interface OrchestratorRuntimeDependencies {
  readonly time: TimeSystem
  readonly summaryCompressor: SummaryCompressorSystem
  readonly subsystemRelevance: SubsystemRelevanceSystem
  readonly memoryLifecycle: MemoryLifecycleSystem
  readonly causalDelay: CausalDelaySystem
  readonly plotStructure: PlotStructureSystem
  readonly foreshadowing: ForeshadowingSystem
}

interface OrchestratorSystemOptions {
  readonly runtime?: OrchestratorRuntimeDependencies
  readonly projectionMode?: boolean
}

function createDefaultRuntimeDependencies(): OrchestratorRuntimeDependencies {
  return {
    time: timeSystem,
    summaryCompressor,
    subsystemRelevance,
    memoryLifecycle,
    causalDelay,
    plotStructure,
    foreshadowing,
  }
}

function createProjectionRuntimeDependencies(): OrchestratorRuntimeDependencies {
  const memoryLifecycleRuntime = new MemoryLifecycleSystem()
  const summaryCompressorRuntime = new SummaryCompressorSystem()
  return {
    time: new TimeSystem(),
    summaryCompressor: summaryCompressorRuntime,
    subsystemRelevance: new SubsystemRelevanceSystem(),
    memoryLifecycle: memoryLifecycleRuntime,
    causalDelay: new CausalDelaySystem(memoryLifecycleRuntime),
    plotStructure: new PlotStructureSystem(),
    foreshadowing: new ForeshadowingSystem(memoryLifecycleRuntime, summaryCompressorRuntime),
  }
}


export interface AcceptedNarrativeResult extends RoundResult {
  narrativeId: string
  roundSequence: number
  deliveredCausalEventIds: string[]
  deliveredHistoricalEventCandidateIds: string[]
}

interface AcceptedNarrativeRecord {
  schemaVersion: 1
  lifeRunId: string
  roundSequence: number
  narrativeId: string
  acceptedAt: number
  roundContext: RoundContext
  narrative: ParsedNarrative
  /** Prepared visible text; the parsed protocol remains in `narrative`. */
  narrativeText: string
  deliveredCausalEventIds: string[]
  deliveredHistoricalEventCandidateIds: string[]
  playerChoice?: string
  ageAtRound: number
  displayTimeLabel: string
  repetitionMetric: NarrativeRepetitionMetric
  storyRepetitionStats: ReturnType<typeof summarizeNarrativeRepetitionMetrics>
  transitionAudit: import('@/foundation').NarrativeTransitionAuditSnapshot
  branchMeta: {
    isBranchPoint: boolean
    branchTitle?: string
    branchOptions?: string[]
  }
  destinyPatternGrowth?: NarrativeDestinyPatternGrowthProjection
  committed: boolean
  result: AcceptedNarrativeResult
}

export interface NarrativeStoryContinuityRoundTransactionSnapshot {
  readonly compressor: NarrativeStoryContinuityTransactionSnapshot
  readonly engineSummaries: EngineState['compressedSummaries']
  readonly engineStats: EngineState['compressionStats']
}

// ============================================================
// OrchestratorSystem
// ============================================================

export class OrchestratorSystem extends BaseSubsystem {
  readonly id = 'orchestrator' as const
  readonly mod = 'mod-engine' as const
  readonly label = '模拟编排器' as const
  readonly description = '引擎核心编排器，协调本地模拟、AI 叙事生成、事件追踪、跨系统事务协调、叙事后处理全流程' as const

  private readonly runtime: OrchestratorRuntimeDependencies
  private readonly projectionMode: boolean

  constructor(options: OrchestratorSystemOptions = {}) {
    super()
    this.runtime = options.runtime ?? createDefaultRuntimeDependencies()
    this.projectionMode = options.projectionMode === true
  }

  private state: EngineState = {
    lifeRunId: createNarrativeLifeRunId(),
    status: 'idle',
    round: { year: 0, season: getSeasonForMonth(0), month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
    timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
    totalRounds: 0,
    narrativeHistory: [],
    currentNarrative: '',
    compressionStats: { compressedRoundCount: 0, lastSourceRound: null, lastCompletedAt: 0 },
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

  /** 已加载 MOD 清单；组装 Prompt 时再按实际运行绑定过滤规则。 */
  private modManifests: ModManifest[] = []

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

  /** 叙事失败后复用已经推进完成的同一回合输入；仅运行态，不进入存档。 */
  private pendingNarrativeRoundPreparation?: {
    lifeRunId: string
    roundSequence: number
    promptContext: PromptContext
    playerChoice?: string
    eventInjectionText?: string
    legendaryEncounterInjected?: boolean
  }

  /** 最近一次第一次叙事调用实际采用的本地气运引导。 */
  private lastNarrativeLuckGuidance: LuckNarrativeGuidance | null = null

  /** 最近一次 AI 原始 JSON 输出，供诊断使用。 */
  private lastExecutedFullContent: string | null = null

  /** 本轮已到期但尚未在有效叙事提交中确认兑现的因果事项。 */
  private pendingNarrativeCausalEventIds: string[] = []

  /** 当前 Prompt 实际投递、尚未随正文接纳的到期历史候选。 */
  private pendingNarrativeEventCandidateIds: string[] = []

  /** 已随正文接纳、当前运行态已屏蔽重复投影的历史候选；候选账本状态仍由其所属系统保持。 */
  private readonly inFlightNarrativeEventCandidateIds = new Set<string>()

  /** 已接纳正文的不可变来源快照；后台结果只能按此身份提交。 */
  private readonly acceptedNarrativeRecords = new Map<string, AcceptedNarrativeRecord>()

  private readonly roundDiagnostics = new RoundDiagnosticController(() => ({
    lifeRunId: this.state.lifeRunId,
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
      this.runtime.subsystemRelevance,
      this.runtime.memoryLifecycle,
      this.runtime.causalDelay,
      this.runtime.plotStructure,
      this.runtime.foreshadowing,
    ]
  }

  getRuntimeDependencies(): OrchestratorRuntimeDependencies {
    return this.runtime
  }

  /**
   * Create a read-only narrative projection with copied engine/runtime state.
   * The projection never registers Store-backed writes and is used only for
   * speculative prompt assembly; formal round state remains owned by this instance.
   */
  createNarrativeProjection(): OrchestratorSystem {
    const projection = new OrchestratorSystem({
      runtime: createProjectionRuntimeDependencies(),
      projectionMode: true,
    })
    projection.subsystems = this.subsystems.map((subsystem) => {
      if (typeof subsystem.advance !== 'function') return subsystem
      if (subsystem.id === 'simulation-scope-policy') {
        const snapshot = structuredClone(this.lastSubsystemStates[subsystem.id])
        if (!snapshot) throw new Error('预生成投影缺少模拟范围状态')
        return {
          id: subsystem.id,
          mod: subsystem.mod,
          label: subsystem.label,
          description: subsystem.description,
          advance: () => undefined,
          collectState: () => structuredClone(snapshot),
          applyChanges: () => { throw new Error('预生成投影不接受模拟范围写入') },
          reset: () => undefined,
        }
      }

      const managed = this.asRuntimeManaged(subsystem)
      const capture = managed.capturePersistenceState
      const Constructor = subsystem.constructor as new () => ISubSystem
      const clone = new Constructor()
      const restore = this.asRuntimeManaged(clone).restorePersistenceState
      if (!capture || !restore) {
        throw new Error(`预生成投影无法隔离活动子系统：${subsystem.id}`)
      }
      restore.call(clone, structuredClone(capture.call(subsystem)))
      return clone
    })
    projection.modManifests = structuredClone(this.modManifests)
    projection.worldSetting = this.worldSetting ? structuredClone(this.worldSetting) : null
    projection.characterState = this.characterState ? structuredClone(this.characterState) : null
    projection.importPersistenceState(this.exportPersistenceState(false), false)
    return projection
  }

  private exportInternalSubsystemStates(): Record<string, unknown> {
    const states: Record<string, unknown> = {}
    for (const subsystem of this.getInternalStatefulSubsystems()) {
      const capture = this.asRuntimeManaged(subsystem).capturePersistenceState
      if (capture) states[subsystem.id] = capture.call(subsystem)
    }
    return structuredClone(states)
  }

  private importInternalSubsystemStates(states: Record<string, unknown> | undefined): void {
    if (!states) return
    for (const subsystem of this.getInternalStatefulSubsystems()) {
      if (!(subsystem.id in states)) continue
      this.asRuntimeManaged(subsystem).restorePersistenceState?.(structuredClone(states[subsystem.id]))
    }
  }

  /**
   * 完整外部存档状态与每轮 Prompt 视图分离。
   * 没有对应快照的旧存档先给 owning system 迁移旧 collected state；仍无数据时显式恢复空态，
   * 避免把另一个存档残留在浏览器 Store 中的状态串入当前存档。
   */
  private importPersistentSubsystemStates(
    states: Record<string, unknown> | undefined,
    legacyCollectedStates: Record<string, SubSystemState>,
  ): void {
    for (const subsystem of this.subsystems) {
      const managed = this.asRuntimeManaged(subsystem)
      if (!managed.restorePersistenceState) continue
      if (states && Object.hasOwn(states, subsystem.id)) {
        managed.restorePersistenceState(structuredClone(states[subsystem.id]))
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

  private exportPersistentSubsystemStates(): Record<string, unknown> {
    const states: Record<string, unknown> = {}
    for (const subsystem of this.subsystems) {
      const capture = this.asRuntimeManaged(subsystem).capturePersistenceState
      if (!capture) continue
      states[subsystem.id] = capture.call(subsystem)
    }
    return structuredClone(states)
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

  hasPendingDestinyPatternGrowth(): boolean {
    const subsystem = this.subsystems.find((item) => item.id === 'destiny-pattern') as {
      getStateSnapshot?: () => { pendingGrowth?: unknown }
    } | undefined
    return Boolean(subsystem?.getStateSnapshot?.().pendingGrowth)
  }

  /** 角色等 owning system 完成本地命令后，重建同一份规范子系统快照。 */
  refreshCommittedSubsystemStateSnapshot(): void {
    this.collectSubsystemStates(false, false)
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
    // Orchestrator round 是存档恢复后的权威游标。粗粒度叙事已经
    // 覆盖了当前周期；切到更细粒度时，必须先消费一次“周期对齐”，再让
    // 后续回合从新的合法节点继续推进，不能把已讲过的年份/季度/月重放。
    this.runtime.time.importRound(this.state.round)
    this.runtime.time.setTimeStep(this.state.timeStep)
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
      return this.runtime.time.alignToNextPeriod(
        alignmentFromUnit,
        this.state.timeStep.unit,
        alignmentFromValue,
      )
    }

    return this.runtime.time.advance()
  }

  /** 推进时间（供 stage 闭包使用） */
  advanceTime(): void {
    this.previousNarrativeRound = { ...this.state.round }
    this.state.round = this.advanceTimeForCurrentStep()
    this.state.totalRounds++
  }

  /** 叙事用年龄：按绝对天数计算，细粒度回合不会错误增加整岁。 */
  private computeNarrativeAge(context: RoundContext): number {
    const characterBase = context.subsystemStates?.['character-base']?.data as {
      status?: CharacterNarrativeStatus
      startingAge?: number
    } | undefined
    if (characterBase?.status) return Math.floor(characterBase.status.ageDays / 365)
    const startingAge = characterBase?.startingAge ?? 0
    const completedYears = Math.floor(Math.max(0, context.totalDays - 365) / 365)
    return startingAge + completedYears
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
    this.runtime.time.setTimeStep(step)
    if (!this.projectionMode) useEngineStore.getState().setTimeStep(step)
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

  setLastPlayerChoice(choice: string): void {
    this.lastPlayerChoice = choice.trim() || undefined
  }

  getPendingPlayerChoice(): string | undefined {
    return this.lastPlayerChoice
  }

  getPendingNarrativeRoundPreparation(): {
    lifeRunId: string
    roundSequence: number
    promptContext: PromptContext
    playerChoice?: string
    eventInjectionText?: string
    legendaryEncounterInjected?: boolean
  } | undefined {
    const pending = this.pendingNarrativeRoundPreparation
    if (!pending || pending.lifeRunId !== this.state.lifeRunId) return undefined
    return structuredClone(pending)
  }

  setPendingNarrativeRoundPreparation(input: {
    roundSequence: number
    promptContext: PromptContext
    playerChoice?: string
    eventInjectionText?: string
    legendaryEncounterInjected?: boolean
  }): void {
    this.pendingNarrativeRoundPreparation = structuredClone({
      lifeRunId: this.state.lifeRunId,
      ...input,
    })
  }

  clearPendingNarrativeRoundPreparation(roundSequence?: number): void {
    if (roundSequence !== undefined
      && this.pendingNarrativeRoundPreparation?.roundSequence !== roundSequence) return
    this.pendingNarrativeRoundPreparation = undefined
  }

  getLifeGeneration(): number {
    return this.lifeGeneration
  }

  resolveBranchChoice(branchId: string, choice: string): void {
    const trimmed = choice.trim()
    if (!branchId || !trimmed) return

    this.state.narrativeHistory = this.state.narrativeHistory.map((entry) =>
      entry.id === branchId
        ? { ...entry, resolvedChoice: trimmed, resolvedChoiceRound: this.state.totalRounds }
        : entry,
    )
    this.lastPlayerChoice = trimmed
  }

  registerDestinyPatternGrowthProjection(
    narrativeId: string,
    projection: NarrativeDestinyPatternGrowthProjection,
  ): void {
    this.assertDestinyPatternGrowthProjectionRegistration(narrativeId, projection)
    const index = this.state.narrativeHistory.findIndex((entry) => entry.id === narrativeId)
    if (index < 0) {
      const prepared = this.acceptedNarrativeRecords.get(narrativeId)
      if (!prepared || prepared.committed) throw new Error(`命格成长找不到对应故事：${narrativeId}`)
      prepared.destinyPatternGrowth = structuredClone(projection)
      return
    }
    const entry = this.state.narrativeHistory[index]!
    const nextEntry = { ...entry, destinyPatternGrowth: structuredClone(projection) }
    this.state.narrativeHistory = this.state.narrativeHistory.map((item, itemIndex) => (
      itemIndex === index ? nextEntry : item
    ))
    useEngineStore.setState((store) => ({
      narrativeHistory: store.narrativeHistory.map((item) => (
        item.id === narrativeId ? structuredClone(nextEntry) : item
      )),
    }))
  }

  captureDestinyPatternGrowthProjection(
    narrativeId: string,
  ): NarrativeDestinyPatternGrowthProjection | undefined {
    const entry = this.state.narrativeHistory.find((item) => item.id === narrativeId)
    if (entry) return entry.destinyPatternGrowth
      ? structuredClone(entry.destinyPatternGrowth)
      : undefined
    const prepared = this.acceptedNarrativeRecords.get(narrativeId)
    if (!prepared || prepared.committed) throw new Error(`命格成长找不到对应故事：${narrativeId}`)
    return prepared.destinyPatternGrowth
      ? structuredClone(prepared.destinyPatternGrowth)
      : undefined
  }

  restoreDestinyPatternGrowthProjection(
    narrativeId: string,
    projection: NarrativeDestinyPatternGrowthProjection | undefined,
  ): void {
    const index = this.state.narrativeHistory.findIndex((item) => item.id === narrativeId)
    if (index < 0) {
      const prepared = this.acceptedNarrativeRecords.get(narrativeId)
      if (!prepared || prepared.committed) throw new Error(`命格成长找不到对应故事：${narrativeId}`)
      prepared.destinyPatternGrowth = projection ? structuredClone(projection) : undefined
      return
    }
    const restored = this.state.narrativeHistory.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const { destinyPatternGrowth: _current, ...base } = item
      return projection
        ? { ...base, destinyPatternGrowth: structuredClone(projection) }
        : base
    })
    this.state.narrativeHistory = restored
    useEngineStore.setState((store) => ({
      narrativeHistory: store.narrativeHistory.map((item) => {
        if (item.id !== narrativeId) return item
        const { destinyPatternGrowth: _current, ...base } = item
        return projection
          ? { ...base, destinyPatternGrowth: structuredClone(projection) }
          : base
      }),
    }))
  }

  assertDestinyPatternGrowthProjectionRegistration(
    narrativeId: string,
    projection: NarrativeDestinyPatternGrowthProjection,
  ): void {
    const entry = this.state.narrativeHistory.find((item) => item.id === narrativeId)
    if (entry) {
      if (entry.destinyPatternGrowth) throw new Error(`故事已经登记命格成长：${narrativeId}`)
      const storeEntry = useEngineStore.getState().narrativeHistory.find((item) => item.id === narrativeId)
      if (!storeEntry || storeEntry.destinyPatternGrowth) {
        throw new Error('故事展示状态与运行时无法共同登记命格成长')
      }
    } else {
      const prepared = this.acceptedNarrativeRecords.get(narrativeId)
      if (!prepared || prepared.committed) throw new Error(`命格成长找不到对应故事：${narrativeId}`)
      if (prepared.destinyPatternGrowth) throw new Error(`故事已经登记命格成长：${narrativeId}`)
    }
    if (projection.choiceId.trim() === '' || projection.lineageId.trim() === '') {
      throw new Error('命格成长展示投影缺少选择编号或成长身份')
    }
    if (
      projection.options.length !== 3
      || new Set(projection.options.map((option) => option.optionId)).size !== 3
      || projection.options.map((option) => option.route).join('|') !== '深度强化|广度强化|转变强化'
    ) {
      throw new Error('命格成长展示投影必须按固定顺序包含三个不同方向')
    }
  }

  assertDestinyPatternGrowthChoice(
    narrativeId: string,
    choiceId: string,
    optionId: string,
  ): void {
    const entry = this.state.narrativeHistory.find((item) => item.id === narrativeId)
    const growth = entry?.destinyPatternGrowth
    if (!growth || growth.choiceId !== choiceId || growth.selectedOptionId) {
      throw new Error('当前故事中的命格成长已经失效或完成')
    }
    if (!growth.options.some((option) => option.optionId === optionId)) {
      throw new Error('所选命格成长方向不属于当前故事')
    }
    const storeGrowth = useEngineStore.getState().narrativeHistory
      .find((item) => item.id === narrativeId)?.destinyPatternGrowth
    if (!storeGrowth || storeGrowth.choiceId !== choiceId || storeGrowth.selectedOptionId) {
      throw new Error('故事展示状态与运行时命格成长不一致')
    }
  }

  resolveDestinyPatternGrowthProjection(
    narrativeId: string,
    choiceId: string,
    optionId: string,
  ): void {
    this.assertDestinyPatternGrowthChoice(narrativeId, choiceId, optionId)
    const resolveEntry = (entry: NarrativeChunk): NarrativeChunk => {
      if (entry.id !== narrativeId || !entry.destinyPatternGrowth) return entry
      const selected = entry.destinyPatternGrowth.options.find((option) => option.optionId === optionId)!
      const { optionId: _optionId, ...result } = selected
      return {
        ...entry,
        destinyPatternGrowth: {
          ...entry.destinyPatternGrowth,
          selectedOptionId: optionId,
          result,
        },
      }
    }
    this.state.narrativeHistory = this.state.narrativeHistory.map(resolveEntry)
    useEngineStore.setState((store) => ({ narrativeHistory: store.narrativeHistory.map(resolveEntry) }))
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
      this.lastNarrativeLuckGuidance = null
      return undefined
    }
    const guidance = subsystem.prepareNarrativeGuidance(context)
    this.lastNarrativeLuckGuidance = structuredClone(guidance)
    return guidance
  }

  getLastExecutedFullContent(): string | null {
    return this.lastExecutedFullContent
  }

  setLastExecutedFullContent(content: string | undefined): void {
    this.lastExecutedFullContent = content?.trim() ? content : null
  }

  exportPersistenceState(includePersistentSubsystemStates = true): OrchestratorPersistenceState {
    return structuredClone({
      worldContextId: this.worldSetting?.contextId,
      state: this.state,
      lastSubsystemStates: this.lastSubsystemStates,
      eventLifecycle: this.eventLifecycle,
      previousNarrativeRound: this.previousNarrativeRound,
      timeRound: this.runtime.time.exportRound(),
      lastNarratedTimeStep: this.lastNarratedTimeStep,
      lastTimeStepAlignment: this.lastTimeStepAlignment,
      lastExecutedFullContent: this.lastExecutedFullContent,
      lastPlayerChoice: this.lastPlayerChoice,
      lastNarrativeLuckGuidance: this.lastNarrativeLuckGuidance,
      engineSubsystemStates: this.exportInternalSubsystemStates(),
      ...(includePersistentSubsystemStates
        ? { persistentSubsystemStates: this.exportPersistentSubsystemStates() }
        : {}),
    })
  }

  /** 从存档恢复 EngineStore 未单独拥有的编排器运行态；不提供运行时回退。 */
  private importPersistenceRuntimeState(
    state: OrchestratorPersistenceState,
    restorePersistentSubsystemStates = true,
  ): void {
    this.lastSubsystemStates = structuredClone(state.lastSubsystemStates ?? {})
    if (restorePersistentSubsystemStates) {
      this.importPersistentSubsystemStates(
        state.persistentSubsystemStates,
        this.lastSubsystemStates,
      )
      this.restoreSubsystemsFromCollectedStates(this.lastSubsystemStates)
    }
    this.eventLifecycle = structuredClone(state.eventLifecycle ?? {})
    this.previousNarrativeRound = {
      ...(state.previousNarrativeRound ?? state.state.round ?? this.state.round),
    }
    this.lastNarratedTimeStep = { ...(state.lastNarratedTimeStep ?? this.state.timeStep) }
    this.lastTimeStepAlignment = state.lastTimeStepAlignment
      ? { ...state.lastTimeStepAlignment }
      : undefined
    this.lastExecutedFullContent = state.lastExecutedFullContent ?? null
    this.pendingNarrativeCausalEventIds = []
    this.pendingNarrativeEventCandidateIds = []
    this.inFlightNarrativeEventCandidateIds.clear()
    this.lastPlayerChoice = state.lastPlayerChoice
    this.pendingNarrativeRoundPreparation = undefined
    this.lastNarrativeLuckGuidance = state.lastNarrativeLuckGuidance
      ? structuredClone(state.lastNarrativeLuckGuidance)
      : null
    this.importInternalSubsystemStates(state.engineSubsystemStates)
  }

  importPersistenceState(state: OrchestratorPersistenceState, restorePersistentSubsystemStates = true): void {
    const clonedState = structuredClone(state.state) as unknown
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
    this.importPersistenceRuntimeState(
      { ...state, state: restored },
      restorePersistentSubsystemStates,
    )
    // 旧存档可能保留了按旧规则计算的 season；以月份重新推导当前节点，
    // 但不改写历史叙事条目的时间标签。
    this.runtime.time.importRound(state.timeRound ?? this.state.round)
    this.state.round = this.runtime.time.getRound()
    this.runtime.summaryCompressor.restoreFromEngineState(this.state.compressedSummaries, this.state.compressionStats)
    if (!this.projectionMode) {
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
    }
    this.releaseAllPreparedNarratives()
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
    if (!this.projectionMode) {
      recordExecutionSequenceResult(result, {
        lifeRunId: this.state.lifeRunId,
        round: (context.roundSequence ?? this.state.totalRounds) + 1,
      })
    }
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
    // 但必须随每个真实回合推进，才能让阶段与伏笔计时保持有效。
    for (const subsystem of [this.runtime.plotStructure, this.runtime.foreshadowing]) {
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
      if (recordRelevance) {
        this.runtime.subsystemRelevance.recordState(sub.id, sanitized.result as SubSystemState, this.state.totalRounds)
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
      daysPassed: this.runtime.time.getDaysPassed(),
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

  /** 叙事前从 character-base 统一角色状态同步年龄。 */
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
        }))
      : this.characterState.destinyPatterns
    const synced = {
      ...this.characterState,
      age,
      destinyPatterns: patternSummaries?.length ? patternSummaries : undefined,
    }
    this.characterState = synced
    if (!this.projectionMode) useCharacterStore.setState({ age })
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
    // save-restore 反向依赖世界与设置模块，自动存档只在实际执行时加载，避免
    // 把存档边界接入编排器的静态依赖图。
    const { collectGameSavePayload } = await import('../helpers/save-restore')
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

  /** Prompt 只读取当前、全局或明确可跨界携带的故事；源记录始终完整保留。 */
  private getNarrativeScopeView(): NarrativeScopeView {
    return getNarrativeScopeViewRuntime(this)
  }

  private buildPromptTimelineMemory(): string[] | undefined {
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
    return {
      id: this.id,
      summary: `【${this.label}】${this.state.status} | 第 ${this.state.totalRounds} 回合 | 第${this.state.round.year}年 | 事件追踪×${lifecycleCount} | 压缩回合×${this.state.compressionStats.compressedRoundCount}`,
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

  /** 取消尚未提交的旧人生异步操作；真实回合失败不会恢复旧运行态。 */
  invalidatePendingLifeOperations(): void {
    this.lifeGeneration += 1
    this.pendingNarrativeRoundPreparation = undefined
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
    this.runtime.time.reset()
    this.state = {
      lifeRunId: createNarrativeLifeRunId(),
      status: 'idle',
      round: { year: 0, season: getSeasonForMonth(0), month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
      timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
      totalRounds: 0,
      narrativeHistory: [],
      currentNarrative: '',
      compressionStats: { compressedRoundCount: 0, lastSourceRound: null, lastCompletedAt: 0 },
      compressedSummaries: { summaries: [] },
      lastAutoSaveRound: 0,
      characterCreations: [],
      storyRepetitionStats: summarizeNarrativeRepetitionMetrics([]),
    }
    this.lastSubsystemStates = {}
    this.eventLifecycle = {}
    this.previousNarrativeRound = {
      year: 0,
      season: getSeasonForMonth(0),
      month: 0,
      day: 0,
      dayOfYear: 1,
      totalDays: 0,
      ...TimeSystem.resolveDisplayEra(0),
    }
    this.lastNarratedTimeStep = { ...DEFAULT_ENGINE_CONFIG.timeStep }
    this.lastTimeStepAlignment = undefined
    this.pendingTimeStepAlignmentFromUnit = undefined
    this.pendingTimeStepAlignmentFromValue = undefined
    this.lastExecutedFullContent = null
    this.pendingNarrativeCausalEventIds = []
    this.pendingNarrativeEventCandidateIds = []
    this.inFlightNarrativeEventCandidateIds.clear()
    this.acceptedNarrativeRecords.clear()
    this.lastPlayerChoice = undefined
    this.pendingNarrativeRoundPreparation = undefined
    this.pendingNarrativeCausalEventIds = []
    this.pendingNarrativeEventCandidateIds = []
    this.lastNarrativeLuckGuidance = null
    this.worldSetting = null
    this.characterState = null
    this.runtime.summaryCompressor.reset()
    this.runtime.memoryLifecycle.reset()
    this.runtime.causalDelay.reset()
    this.runtime.subsystemRelevance.reset()
    this.runtime.plotStructure.reset()
    this.runtime.foreshadowing.reset()
    globalDeadLoopDetector.resetAll()
  }

  /** 读档后从 EngineStore 恢复 orchestrator 内部状态 */
  hydrateFromEngineStore(previousTimeStep?: TimeStep): void {
    this.acceptedNarrativeRecords.clear()
    this.pendingNarrativeRoundPreparation = undefined
    this.pendingNarrativeEventCandidateIds = []
    this.inFlightNarrativeEventCandidateIds.clear()
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
    if (store.lifeRunId !== lifeRunId || store.storyRepetitionStats !== storyRepetitionStats) {
      useEngineStore.setState({ lifeRunId, narrativeHistory, storyRepetitionStats })
    }
    if (lastAutoSaveRound !== store.lastAutoSaveRound) {
      useEngineStore.getState().setLastAutoSaveRound(lastAutoSaveRound)
    }
    this.runtime.time.importRound(store.round)
    // 读取旧存档时不要继续信任旧 season 序号，当前节点始终按阳历月份重算。
    this.state.round = this.runtime.time.getRound()
    this.runtime.time.setTimeStep(store.timeStep)
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
    this.runtime.summaryCompressor.restoreFromEngineState(store.compressedSummaries, store.compressionStats)
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

  private buildLightWorldSetting(eraLabel: string): WorldSetting {
    return buildLightWorldSettingRuntime(this, eraLabel)
  }

  private buildRoundGuidanceInput(luckNarrativeGuidance?: LuckNarrativeGuidance): {
    roundSystemGuidanceText?: string
    playerBranchIntent?: Record<string, unknown>
  } {
    return buildRoundGuidanceInputRuntime(this, luckNarrativeGuidance)
  }

  private resolveBranchFromParsed(parsed: ParsedNarrative): {
    isBranchPoint: boolean
    branchTitle?: string
    branchOptions?: string[]
  } {
    const forcedBranchRequested = useEngineStore.getState().forceBranchNext === true
    if (parsed.branch !== true) {
      if (!forcedBranchRequested) return { isBranchPoint: false }
      return {
        isBranchPoint: true,
        branchTitle: '由你决定下一步',
        branchOptions: [],
      }
    }
    if (!parsed.branchTitle || !parsed.branchOptions) {
      throw new Error('严格分支结果缺少标题或选项')
    }
    return {
      isBranchPoint: true,
      branchTitle: parsed.branchTitle,
      branchOptions: [...parsed.branchOptions],
    }
  }

  private getHistoricalEventLedgerRuntime(): HistoricalEventLedgerRuntime | undefined {
    return getHistoricalEventLedgerRuntimeRuntime(this)
  }

  getAvailableHistoricalEventCandidates(): HistoricalEventCandidateAudit[] {
    return getAvailableHistoricalEventCandidatesRuntime(this)
  }

  getDueHistoricalEventCandidates(): HistoricalEventCandidateAudit[] {
    return getDueHistoricalEventCandidatesRuntime(
      this,
      [...this.inFlightNarrativeEventCandidateIds],
    )
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

  private buildHistoricalDeathTransactionPlan(
    pendingDeath: import('@/foundation').PendingCharacterDeath,
    context: RoundContext,
    narrativeId: string,
  ): HistoricalDeathTransactionPlan {
    return buildHistoricalDeathTransactionPlanRuntime(this, pendingDeath, context, narrativeId)
  }

  prepareNarrativeResponse(
    parsed: ParsedNarrative,
    playerChoice?: string,
  ): AcceptedNarrativeResult {
    return prepareNarrativeResponseRuntime(this, parsed, playerChoice)
  }

  commitNarrativeResponse(narrativeId: string): AcceptedNarrativeResult {
    return commitNarrativeResponseRuntime(this, narrativeId)
  }

  finalizeNarrativeResponse(narrativeId: string): void { finalizeNarrativeResponseRuntime(this, narrativeId) }

  discardNarrativeResponse(narrativeId: string, failureReason?: string): void { discardNarrativeResponseRuntime(this, narrativeId, failureReason) }

  discardNarrativeResponseForRound(roundSequence: number, failureReason?: string): void {
    this.discardNarrativeResponse(`narrative-${this.state.lifeRunId}-${roundSequence}`, failureReason)
  }

  private getPreparedNarrativeRecord(narrativeId: string): AcceptedNarrativeRecord {
    const accepted = this.acceptedNarrativeRecords.get(narrativeId)
    if (!accepted) throw new Error(`找不到已准备正文：${narrativeId}`)
    return accepted
  }

  prepareNarrativeStoryContinuity(input: {
    narrativeId: string
    sourceRound: number | null
    sourceNarrative?: NarrativeChunk
    result: NarrativeAIStoryContinuityData | null
    rawResponse: string
  }): PreparedNarrativeStoryContinuity {
    const accepted = this.getPreparedNarrativeRecord(input.narrativeId)
    return this.runtime.summaryCompressor.prepareRoundContinuity({
      currentRound: accepted.roundSequence,
      sourceRound: input.sourceRound,
      sourceNarrative: input.sourceNarrative,
      result: input.result,
      rawResponse: input.rawResponse,
    })
  }

  captureNarrativeStoryContinuityTransaction(): NarrativeStoryContinuityRoundTransactionSnapshot {
    return {
      compressor: this.runtime.summaryCompressor.captureTransactionState(),
      engineSummaries: structuredClone(this.state.compressedSummaries),
      engineStats: { ...this.state.compressionStats },
    }
  }

  async commitPreparedNarrativeStoryContinuity(
    narrativeId: string,
    prepared: PreparedNarrativeStoryContinuity,
  ): Promise<void> {
    const accepted = this.getPreparedNarrativeRecord(narrativeId)
    if (prepared.currentRound !== accepted.roundSequence) {
      throw new Error('故事连续性准备包不属于当前冻结回合')
    }
    await this.runtime.summaryCompressor.commitPreparedRoundContinuity(prepared, accepted.lifeRunId)
    const stats = this.runtime.summaryCompressor.getStats()
    this.state.compressedSummaries = this.runtime.summaryCompressor.getSummaries()
    this.state.compressionStats = {
      compressedRoundCount: stats.compressedRoundCount,
      lastSourceRound: stats.lastSourceRound,
      lastCompletedAt: stats.lastCompletedAt,
    }
    useEngineStore.getState().setCompressedSummaries(this.state.compressedSummaries)
    useEngineStore.getState().setCompressionStats(this.state.compressionStats)
    this.setCompressionDiagnostic({
      status: 'completed',
      sourceRound: prepared.sourceRound,
      didCompress: prepared.didCompress,
      compressedRoundCount: stats.compressedRoundCount,
      lastSourceRound: stats.lastSourceRound,
    })
  }

  async restoreNarrativeStoryContinuityTransaction(
    snapshot: NarrativeStoryContinuityRoundTransactionSnapshot,
    currentRound: number,
  ): Promise<void> {
    await this.runtime.summaryCompressor.restoreCommittedTransactionState(
      snapshot.compressor,
      this.state.lifeRunId,
      Math.max(0, currentRound - 1),
    )
    this.state.compressedSummaries = structuredClone(snapshot.engineSummaries)
    this.state.compressionStats = { ...snapshot.engineStats }
    useEngineStore.getState().setCompressedSummaries(this.state.compressedSummaries)
    useEngineStore.getState().setCompressionStats(this.state.compressionStats)
  }

  prepareNarrativeStoryContinuityLedger(
    narrativeId: string,
    result: NarrativeAIStoryContinuityData,
    sourceTime: StoryContinuitySourceTime,
  ): PreparedNarrativeStoryContinuityLedger {
    return prepareNarrativeStoryContinuityLedgerRuntime(this, narrativeId, result, sourceTime)
  }

  captureNarrativeStoryContinuityLedgerTransaction(): unknown {
    return captureNarrativeStoryContinuityLedgerTransactionRuntime(this)
  }

  commitPreparedNarrativeStoryContinuityLedger(
    narrativeId: string,
    preparation: PreparedNarrativeStoryContinuityLedger,
  ): string[] {
    return commitPreparedNarrativeStoryContinuityLedgerRuntime(this, narrativeId, preparation)
  }

  restoreNarrativeStoryContinuityLedgerTransaction(snapshot: unknown): void {
    restoreNarrativeStoryContinuityLedgerTransactionRuntime(this, snapshot)
  }

  private releasePreparedNarrative(record: AcceptedNarrativeRecord): void {
    // 已发布正文没有候选处置消费者；保留既有运行态屏蔽，避免同一候选在后续回合反复注入。
    // 未发布的失败准备仍要释放，以便同一回合的手动重试再次获得候选。
    if (record.committed) return
    for (const candidateId of record.deliveredHistoricalEventCandidateIds) {
      this.inFlightNarrativeEventCandidateIds.delete(candidateId)
    }
  }

  updateNarrativeTransitionAudit(
    narrativeId: string,
    counts: { requestedChangeCount: number; committedChangeCount: number },
  ): void {
    updateNarrativeTransitionAuditRuntime(this, narrativeId, counts)
  }

  private releaseAllPreparedNarratives(): void {
    for (const record of this.acceptedNarrativeRecords.values()) {
      this.releasePreparedNarrative(record)
    }
    this.acceptedNarrativeRecords.clear()
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
    executionRoundSequence: number,
  ): Promise<void> {
    return this.campaignStageRuntime.run(stages, context, {
      lifeRunId: this.state.lifeRunId,
      totalRounds: this.state.totalRounds,
      executionRoundSequence,
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
    const effectiveAiConfig: AIModelConfig = { ...aiConfig }
    const pendingPreparation = this.getPendingNarrativeRoundPreparation()
    const executionRoundSequence = pendingPreparation?.roundSequence ?? this.state.totalRounds + 1
    // 先建立真实回合诊断，再加载阶段定义；这样阶段缺失或初始化异常也有可追溯记录。
    this.beginRoundDiagnostic(executionRoundSequence)
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
    this.state.status = 'running'
    // 每次执行都从空结果开始，避免预览/HMR 后沿用上一轮完整响应。
    this.lastExecutedFullContent = null
    if (!pendingPreparation) this.lastNarrativeLuckGuidance = null
    const context = this.buildRoundContext()

    // Instrument: onRoundStart
    if (isInstrumentEnabled()) {
      getInstrumentHooks().onRoundStart?.(this.state.totalRounds)
    }
    const roundT0 = performance.now()

    try {
      // 使用阶段机驱动回合管线
      await this.runStageMachine(stages, context, executionRoundSequence)

      if (!this.lastExecutedFullContent) {
        const rejection = new Error('叙事生成结果未通过完整性与结构门禁，本轮未推进，请重新尝试。')
        rejection.name = 'NarrativeGenerationRejectedError'
        logger.warn('orchestrator', 'round-rejected-no-committable-narrative', {
          round: this.state.totalRounds + 1,
          lastNarrativeChars: this.state.currentNarrative?.length ?? 0,
        })
        throw rejection
      }

      // Instrument: onRoundEnd
      if (isInstrumentEnabled()) {
        getInstrumentHooks().onRoundEnd?.(this.state.totalRounds, performance.now() - roundT0)
      }

      // 构建结果（从阶段机执行后的状态中提取）
      const result: RoundResult = {
        narrative: this.state.currentNarrative,
        changes: [],
        notableEvents: [],
      }
      this.finishRoundDiagnostic('completed')
      return result
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error)
      this.discardNarrativeResponseForRound(executionRoundSequence, failureReason)
      this.finishRoundDiagnostic('failed', error)
      throw error
    }
  }
}

/** 单例 */
export const orchestrator = new OrchestratorSystem()
