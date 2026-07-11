/**
 * @module orchestrator-system.ts
 * @description 引擎编排子系统 —— 协调各子系统，执行完整模拟主循环（含本地模拟、事件追踪、跨域联动、叙事后处理、安全检查）
 * @mod mod-engine
 *
 * 完整 13 步管线：
 *   1. 推进时间 (TimeSystem)
 *   2. 本地模拟推进 (subsystem.advance — 非 AI 回合纯规则计算)
 *   3. 收集所有子系统状态 (collectState)
 *   4. 事件生命周期追踪 (EventLifecycleTracker — 10 维度事件检测)
 *   5. 跨域联动 (WorldEventBus — 5 条规则)
 *   6. 组装富 PromptContext (assemblePromptContext — 含事件注入、天赋列表、世界自定义)
 *   7. 构建分段 Prompt (buildSegmentedPrompt — 模板顺序决定 KV Cache 命中区间)
 *   8. 调用 AI (callAIStream，流式输出)
 *   9. 解析响应 + 分发变更 (handleNarrativeResponse)
 *  10. 叙事后处理 (runPostNarrativePhase — 连锁反应提示；寿命闭环归 LifespanSystem)
 *  11. 世界方向修正 (MVP 暂停；未来段由存活子系统重新接入)
 *  12. 检测死亡并触发死后尾声 (PostDeathEpilogueSystem)
 *  13. 检查叙事压缩 (SummaryCompressor)
 *  14. 触发回合完成事件 (EventBus)
 */

import { BaseSubsystem, eventBus, callAIWithPromptTemplate, buildSegmentedPrompt, getNarrativeUserSegments } from '@/core'
import { isInstrumentEnabled, getInstrumentHooks } from '@/core/instrument/instrument-mode'
import type { NarrativeStage, YearEvent } from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'
import { saveManager } from '@/core/storage/save-manager'
import {
  adaptationManager,
  DEFAULT_ENGINE_CONFIG,
  MAX_NARRATIVE_HISTORY,
  MAX_CHARACTER_CREATIONS,
  USE_AI_SUMMARY_COMPRESSION,
  getWorldRules,
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
  buildEventInjectionText,
  buildTimeBridgeSummary,
  extractBridgeSnapshot,
  extractL0Title,
  WorldEventBus,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  buildLayeredMemoryStateCard,
  buildNarrativeCoherenceHeader,
  buildNarrativeWorldRules,
  collectMemoryStateSummaries,
  dedupeSummariesAgainstMemory,
  isSubsystemOpenForPrompt,
  isMvpNarrativeChangeSubsystem,
  isMvpPromptSubsystem,
  isMvpRuntimeSubsystem,
  shouldSkipEconomyTierRules,
  runPostNarrativePhase,
  resolveTimeStep,
  shouldAlignTimeStepTransition,
  mapSubsystemStatesToDetectionStates,
  buildLifeStageNarrativeHint,
  resolveLifeStageFromAge,
  normalizeNarrativeParagraphs,
  buildNarrativeHints,
  classifyActionScale,
  INFORMATION_PRIORITY_RULE,
  RoundCommitBus,
  runNarrativeInterceptors,
  buildNarrativeTimeContext,
  readEraStartYearFromConfig,
  readBirthEraYearFromConfig,
  formatNarrativeTimeLabel,
  resolveCalendarEraYear,
  buildTimeScaleNarrativeHint,
  generateArchetypeHint,
  buildLifespanReminder,
  countConsecutiveConflictRounds,
  collectGameSavePayload,
  computeNarrativeMaxTokens,
  DEFAULT_WORD_COUNT_TARGET,
  SUBSYSTEM_GUIDE,
  simulationBridge,
  TimeSystem,
  timeSystem,
  narrativeParser,
  summaryCompressor,
  plotStructure,
  foreshadowing,
  memoryLifecycle,
  digestLedger,
  coreMemory,
  subsystemRelevance,
  useEngineStore,
  type BridgeSnapshot,
  type EventLifecycleTracker,
  type DomainEvent,
  type SubsystemInstruction,
  type NarrativeHintInput,
  type RoundCommitSource,
  type RoundCommitResult,
  type EngineState,
  type RoundInfo,
  type RoundResult,
  type NarrativeChunk,
  type CharacterCreation,
  type TimeStep,
  type ParsedNarrative,
  type DigestLedgerSnapshot,
} from './shared'

import { useSettingsStore } from '@/mods/mod-settings'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useCharacterStore } from '@/mods/mod-character'

import { ECONOMIC_TIER_CONFIG, MAX_REACHABLE_STAGE } from '@/mods/mod-power-system'
import type { EconomicTierInfo } from '@/mods/mod-power-system'
import { buildPowerCeilingPresetsForNarrative } from '@/mods/mod-world'
import { buildCalendarNarrativeContext } from '../helpers/calendar-narrative-context'
import {
  isEligibleNarrativeBranch,
  normalizeNarrativeBranchOptions,
} from '../helpers/narrative-branch-policy'

import type {
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
} from '@/foundation'

// Uses pattern matching via patternManager; USE_PATTERN_MANAGER feature flag managed centrally

/** 兜底叙事 maxAge 后备值（lifespan 子系统未注册时） */
const DEFAULT_MAX_AGE_FALLBACK = 100
/** 普通命运分支最小间隔。强制分支不受此限制。 */
const MIN_BRANCH_GAP_ROUNDS = 4

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
  state: EngineState
  lastSubsystemStates: Record<string, SubSystemState>
  eventLifecycle: EventLifecycleTracker
  lastNotableEvents: string[]
  prevAbbreviationSnapshot: Record<string, string>
  prevRoundYear: number
  prevBridgeSnapshot: BridgeSnapshot
  lastNarrativeText: string
  totalBreakthroughs: number
  timeRound: RoundInfo
  lastNarratedTimeStep?: TimeStep
  lastAiConfig?: AIModelConfig | null
  lastSessionId?: string
  lastExecutedFullContent?: string | null
  lastPlayerChoice?: string
  consecutiveSameGoalRounds?: number
  branchJustResolved?: boolean
  lastBranchTotalRound?: number
  lastCommittedPlayerChoice?: string
  prefetchedNarrativeContent?: string | null
  digestLedgerSnapshot?: DigestLedgerSnapshot
}

/** 预生成专用快照；补充不进入存档契约的步长对齐运行态。 */
export interface OrchestratorPreviewSnapshot {
  orchestrator: OrchestratorSnapshot
  pendingTimeStepAlignmentFromUnit?: TimeStep['unit']
}

// ============================================================
// OrchestratorSystem
// ============================================================

export class OrchestratorSystem extends BaseSubsystem {
  readonly id = 'orchestrator' as const
  readonly mod = 'mod-engine' as const
  readonly label = '模拟编排器' as const
  readonly description = '引擎核心编排器，协调本地模拟、AI 叙事生成、事件追踪、跨域联动、叙事后处理全流程' as const

  private state: EngineState = {
    status: 'idle',
    round: { year: 0, season: 0, month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
    timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
    totalRounds: 0,
    narrativeHistory: [],
    currentNarrative: '',
    compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0, lastAt: 0 },
    compressedSummaries: { summaries: [] },
    lastAutoSaveRound: 0,
    characterCreations: [],
  }

  private subsystems: ISubSystem[] = []
  private onNarrativeChunk: ((chunk: NarrativeChunk) => void) | null = null

  /** 上次收集的子系统状态缓存 */
  private lastSubsystemStates: Record<string, SubSystemState> = {}

  /** 世界设定 */
  private worldSetting: WorldSetting | null = null

  /** 角色信息 */
  private characterState: CharacterState | null = null

  /** 事件生命周期追踪器 */
  private eventLifecycle: EventLifecycleTracker = {}

  /** 跨域联动事件总线 */
  private worldEventBus: WorldEventBus = new WorldEventBus()

  /** P3: AI 上轮输出的 notableEvents（作为跨域联动补充触发源） */
  private lastNotableEvents: string[] = []

  /** K: MOD 清单（用于聚合各 MOD 的世界观规则） */
  private modManifests: ModManifest[] = []

  /** @deprecated 寿命突破次数由 LifespanSystem.breakthroughs 派生，保留旧快照字段避免读档结构抖动 */
  private totalBreakthroughs = 0

  /** Phase 6：压缩管线所需 AI 配置（executeRoundV2 注入） */
  private lastAiConfig: AIModelConfig | null = null
  /** 叙事 KV 会话 ID（传给 summary 压缩池） */
  private lastSessionId: string | undefined

  /** 上轮系统缩写快照（用于生成变化摘要） */
  private prevAbbreviationSnapshot: Record<string, string> = {}

  /** 大步进 bridge：advanceTime 前的年份与子系统快照 */
  private prevRoundYear = 0
  private prevBridgeSnapshot: BridgeSnapshot = {}

  /** 上一轮叙事全文（写入 RoundContext.lastNarrativeText 供 lifespan 减寿检测） */
  private lastNarrativeText = ''

  /** 上一条已完成叙事采用的时间步长，用于粗→细切换后定位下一时间节点 */
  private lastNarratedTimeStep: TimeStep = { ...DEFAULT_ENGINE_CONFIG.timeStep }

  /** 玩家粗→细切换后等待下一轮消费的原粒度；仅运行态使用，不进入存档契约。 */
  private pendingTimeStepAlignmentFromUnit?: TimeStep['unit']

  /** 玩家分支选择（注入下一轮 Prompt，一次性消费） */
  private lastPlayerChoice?: string

  /** 连续选择同一目标轮数（用于叙事节奏控制） */
  private consecutiveSameGoalRounds = 0

  /** 上轮是否为分叉点且已被解决 */
  private branchJustResolved = false

  /** 最近一次生成分支的总轮次；预生成快照也依赖它判断普通分支冷却。 */
  private lastBranchTotalRound = Number.NEGATIVE_INFINITY

  /** 缓存的上轮玩家选择（用于进度对比） */
  private lastCommittedPlayerChoice?: string

  /** 预生成缓存：跳过 AI 叙事阶段 */
  private prefetchedNarrativeContent: string | null = null

  /** 最近一次 AI 原始 JSON 输出（预生成队列用） */
  private lastExecutedFullContent: string | null = null

  /** 预生成/预览执行深度：只允许临时推进到 AI 输出，不提交真实副作用 */
  private previewExecutionDepth = 0

  /** 子系统状态写入总线（叙事 / 跨域 / 后处理等统一入口） */
  private readonly roundCommitBus = new RoundCommitBus(
    (id) => this.subsystems.find((s) => s.id === id),
    (change, context) => {
      const sub = this.subsystems.find((s) => s.id === change.id)
      sub?.applyChanges(change, context)
    },
  )

  registerSubsystem(subsystem: ISubSystem): void {
    if (!isMvpRuntimeSubsystem(subsystem.id)) {
      return
    }
    if (this.subsystems.some((s) => s.id === subsystem.id)) {
      return
    }
    this.subsystems.push(subsystem)
  }

  /** 清空外部 MOD 子系统（registerAllSubsystems 重入前调用） */
  clearExternalSubsystems(): void {
    this.subsystems = []
  }

  /** RuntimeRegistry 用：已注册子系统绑定 */
  getSubsystemBindings(): Array<{ id: string; mod: string }> {
    return this.subsystems.map((s) => ({ id: s.id, mod: s.mod }))
  }

  /** K: 存储 MOD 清单（用于聚合各 MOD 的世界观规则） */
  setManifests(manifests: ModManifest[]): void {
    this.modManifests = manifests
  }

  onStream(callback: (chunk: NarrativeChunk) => void): void {
    this.onNarrativeChunk = callback
  }

  getState(): EngineState {
    return { ...this.state, compressionStats: { ...this.state.compressionStats } }
  }

  getSubsystemStateSnapshot(): Record<string, SubSystemState> {
    return structuredClone(this.lastSubsystemStates)
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
    // Orchestrator round 是存档/预生成恢复后的权威游标；推进前同步 TimeSystem，
    // 避免运行时单例仍停在旧快照，导致粗→细切换只追平旧日期而重写已叙事周期。
    timeSystem.importRound(this.state.round)
    timeSystem.setTimeStep(this.state.timeStep)

    const alignmentFromUnit = this.pendingTimeStepAlignmentFromUnit ?? this.lastNarratedTimeStep.unit
    if (
      this.state.narrativeHistory.length > 0
      && shouldAlignTimeStepTransition(alignmentFromUnit, this.state.timeStep.unit)
    ) {
      this.pendingTimeStepAlignmentFromUnit = undefined
      return timeSystem.alignToNextPeriod(alignmentFromUnit, this.state.timeStep.unit)
    }

    return timeSystem.advance()
  }

  /** 推进时间（供 stage 闭包使用） */
  advanceTime(): void {
    this.prevRoundYear = this.state.round.year
    this.prevBridgeSnapshot = extractBridgeSnapshot(this.lastSubsystemStates)
    this.state.round = this.advanceTimeForCurrentStep()
    this.state.totalRounds++
    this.branchJustResolved = false
  }

  /** 叙事用年龄：按绝对天数计算，细粒度回合不会错误增加整岁。 */
  private computeNarrativeAge(context: RoundContext): number {
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
      }
    } else if (
      this.state.narrativeHistory.length > 0
      && shouldAlignTimeStepTransition(this.state.timeStep.unit, step.unit)
    ) {
      this.pendingTimeStepAlignmentFromUnit = this.state.timeStep.unit
    }
    this.state.timeStep = step
    timeSystem.setTimeStep(step)
    useEngineStore.getState().setTimeStep(step)
  }

  getTimeStep(): RoundContext['timeStep'] {
    return { ...this.state.timeStep }
  }

  /** 本地模拟推进所有子系统（供 stage 闭包使用） */
  advanceAllSubsystems(): void {
    this.advanceSubsystems(this.buildRoundContext())
  }

  /** 三回合收集所有子系统状态（供 stage 闭包使用） */
  collectAllSubsystemStates(): void {
    this.collectSubsystemStates()
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

  /** 重置当前叙事文本（供 stage 闭包使用） */
  resetCurrentNarrative(): void {
    this.state.currentNarrative = ''
  }

  /** 追加叙事流式块（供 stage 闭包使用） */
  appendNarrativeChunk(chunk: string): void {
    this.state.currentNarrative += chunk
    if (this.onNarrativeChunk) {
      this.onNarrativeChunk({ text: chunk, isComplete: false, timestamp: Date.now() })
    }
  }

  /** 构建兜底叙事（供 stage 闭包使用） */
  buildFallbackNarrative(): string {
    return this.buildFallbackNarrativeFromState()
  }

  /** 执行跨域联动（供 stage 闭包使用，无参版本） */
  async executeCrossDomainLinkage(): Promise<void> {
    await this._executeCrossDomainLinkage(this.buildRoundContext())
  }

  /** 叙事后处理（供 stage 闭包使用） */
  runNarrativePostProcessing(narrative: string): void {
    this._runNarrativePostProcessing(narrative)
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

  resolveBranchChoice(branchId: string, choice: string): void {
    const trimmed = choice.trim()
    if (!branchId || !trimmed) return

    this.state.narrativeHistory = this.state.narrativeHistory.map((entry) =>
      entry.id === branchId ? { ...entry, resolvedChoice: trimmed } : entry,
    )
    this.lastBranchTotalRound = Math.max(this.lastBranchTotalRound, this.state.totalRounds)
    this.branchJustResolved = true
  }

  setPrefetchedNarrative(content: string | null): void {
    this.prefetchedNarrativeContent = content?.trim() ? content : null
  }

  consumePrefetchedNarrative(): string | null {
    const content = this.prefetchedNarrativeContent
    this.prefetchedNarrativeContent = null
    return content
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

  isBranchCoolingDownForNextRound(): boolean {
    return this.shouldSuppressBranchPoint(false, this.state.totalRounds + 1)
  }

  async runPreviewRound<T>(runner: () => Promise<T>): Promise<T> {
    this.previewExecutionDepth++
    try {
      return await runner()
    } finally {
      this.previewExecutionDepth--
    }
  }

  captureSnapshot(): OrchestratorSnapshot {
    return structuredClone({
      state: this.state,
      lastSubsystemStates: this.lastSubsystemStates,
      eventLifecycle: this.eventLifecycle,
      lastNotableEvents: this.lastNotableEvents,
      prevAbbreviationSnapshot: this.prevAbbreviationSnapshot,
      prevRoundYear: this.prevRoundYear,
      prevBridgeSnapshot: this.prevBridgeSnapshot,
      lastNarrativeText: this.lastNarrativeText,
      totalBreakthroughs: this.totalBreakthroughs,
      timeRound: timeSystem.exportRound(),
      lastNarratedTimeStep: this.lastNarratedTimeStep,
      lastAiConfig: this.lastAiConfig,
      lastSessionId: this.lastSessionId,
      lastExecutedFullContent: this.lastExecutedFullContent,
      lastPlayerChoice: this.lastPlayerChoice,
      consecutiveSameGoalRounds: this.consecutiveSameGoalRounds,
      branchJustResolved: this.branchJustResolved,
      lastBranchTotalRound: this.lastBranchTotalRound,
      lastCommittedPlayerChoice: this.lastCommittedPlayerChoice,
      prefetchedNarrativeContent: this.prefetchedNarrativeContent,
      digestLedgerSnapshot: digestLedger.toSnapshot(),
    })
  }

  capturePreviewSnapshot(): OrchestratorPreviewSnapshot {
    return {
      orchestrator: this.captureSnapshot(),
      pendingTimeStepAlignmentFromUnit: this.pendingTimeStepAlignmentFromUnit,
    }
  }

  /** 恢复预览会改写、但 EngineStore 不保存的 orchestrator 运行态。 */
  private restoreSnapshotRuntimeState(snap: OrchestratorSnapshot): void {
    this.lastSubsystemStates = structuredClone(snap.lastSubsystemStates ?? {})
    this.eventLifecycle = structuredClone(snap.eventLifecycle ?? {})
    this.lastNotableEvents = [...(snap.lastNotableEvents ?? [])]
    this.prevAbbreviationSnapshot = { ...(snap.prevAbbreviationSnapshot ?? {}) }
    this.prevRoundYear = snap.prevRoundYear ?? this.state.round.year
    this.prevBridgeSnapshot = structuredClone(snap.prevBridgeSnapshot ?? {})
    this.lastNarrativeText = snap.lastNarrativeText ?? ''
    this.totalBreakthroughs = snap.totalBreakthroughs ?? 0
    this.lastNarratedTimeStep = { ...(snap.lastNarratedTimeStep ?? this.state.timeStep) }
    this.lastAiConfig = snap.lastAiConfig ?? null
    this.lastSessionId = snap.lastSessionId
    this.lastExecutedFullContent = snap.lastExecutedFullContent ?? null
    this.lastPlayerChoice = snap.lastPlayerChoice
    this.consecutiveSameGoalRounds = snap.consecutiveSameGoalRounds ?? 0
    this.branchJustResolved = snap.branchJustResolved ?? false
    this.lastBranchTotalRound = snap.lastBranchTotalRound ?? Number.NEGATIVE_INFINITY
    this.lastCommittedPlayerChoice = snap.lastCommittedPlayerChoice
    this.prefetchedNarrativeContent = snap.prefetchedNarrativeContent ?? null
    digestLedger.loadSnapshot(snap.digestLedgerSnapshot)
  }

  restoreSnapshot(snap: OrchestratorSnapshot): void {
    this.state = structuredClone(snap.state)
    this.restoreSnapshotRuntimeState(snap)
    if (snap.timeRound) timeSystem.importRound(snap.timeRound)
    useEngineStore.setState((prev) => ({
      ...prev,
      ...this.state,
      streamingNarrative: '',
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

  restorePreviewSnapshot(snap: OrchestratorPreviewSnapshot): void {
    this.restoreSnapshot(snap.orchestrator)
    this.pendingTimeStepAlignmentFromUnit = snap.pendingTimeStepAlignmentFromUnit
  }

  /**
   * 预览失效时先撤销其非 Store 副作用，再从当前 EngineStore 重建权威时间线。
   * 不能直接 restoreSnapshot，否则会覆盖用户在 AI 等待期间完成的步长切换。
   */
  reconcilePreviewSnapshotWithEngineStore(snap: OrchestratorPreviewSnapshot): void {
    this.restoreSnapshotRuntimeState(snap.orchestrator)
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

  /** 从设置 store 读取用户选择的叙事风格 */
  private getNarrativeStyle(): string {
    const style = useSettingsStore.getState().narrativeStyle ?? 'default'
    return buildStyleInstruction(style)
  }

  private shouldStop(): boolean {
    return this.state.totalRounds >= DEFAULT_ENGINE_CONFIG.maxRounds
      || this.state.status === 'complete'
  }

  // === 上下文注入 ===

  setContext(worldSetting: WorldSetting, characterState: CharacterState): void {
    this.worldSetting = worldSetting
    this.characterState = characterState
  }

  // === 本地模拟推进 ===

  /**
   * 本地模拟推进（非 AI 叙事回合的纯规则计算）
   *
   * 遍历所有子系统，调用其 advance() 方法执行本地数值推演。
   * 不调 AI，仅做纯数值计算。
   */
  private advanceSubsystems(context: RoundContext): void {
    for (const sub of this.subsystems) {
      if (sub.id === this.id) continue
      if (!isMvpRuntimeSubsystem(sub.id)) continue
      if (!sub.advance) continue
      try {
        sub.advance(context)
      } catch (e) {
        console.error(`[Orchestrator] 子系统 ${sub.id} 本地推进失败:`, e)
      }
    }
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
  private collectSubsystemStates(refreshContext = false): Record<string, SubSystemState> {
    const context = this.buildRoundContext()
    const states: Record<string, SubSystemState> = {}

    const allSubs = this.subsystems.filter((s) => s.id !== this.id && isMvpRuntimeSubsystem(s.id))

    // === Round 1: 标准收集 (data.lua) ===
    for (const sub of allSubs) {
      try {
        // Instrument: onBeforeCollectState
        if (isInstrumentEnabled()) {
          getInstrumentHooks().onBeforeCollectState?.(sub.id, this.state.round.year)
        }
        const t0 = performance.now()

        const state = sub.collectState(context)
        const sanitized = sanitizeSubSystemState(state, `sub.${sub.id}`)

        // Instrument: onAfterCollectState
        if (isInstrumentEnabled()) {
          getInstrumentHooks().onAfterCollectState?.(
            sub.id,
            performance.now() - t0,
            JSON.stringify(sanitized.result).length,
          )
        }

        if (!sanitized.report.passed) {
          console.warn(`[Orchestrator] 子系统 ${sub.id} 状态安全校验未通过:`, sanitized.report.errors)
        }
        states[state.id] = sanitized.result as SubSystemState

        // 记录状态到滑动窗口（供 SubsystemRelevanceSystem 过滤使用）
        if (!this.isPreviewExecution()) {
          subsystemRelevance.recordState(sub.id, sanitized.result as SubSystemState, this.state.totalRounds)
        }
      } catch (e) {
        console.error(`[Orchestrator] Round1 收集 ${sub.id} 状态失败:`, e)
      }
    }

    // 更新 context 以反映 Round 1 结果
    const round1Context = refreshContext ? this.buildRoundContext() : {
      ...context,
      subsystemStates: { ...states },
    }

    // === Round 2: 跨系统修改 (data-updates.lua) ===
    for (const sub of allSubs) {
      const subV2 = sub as { collectStateUpdate?: (ctx: RoundContext) => SubSystemState | null }
      if (typeof subV2.collectStateUpdate !== 'function') continue
      try {
        const update = subV2.collectStateUpdate(round1Context)
        if (update) {
          const sanitized = sanitizeSubSystemState(update, `sub.${sub.id}.update`)
          if (sanitized.report.passed) {
            states[update.id] = { ...states[update.id], ...sanitized.result } as SubSystemState
          }
        }
      } catch (e) {
        console.error(`[Orchestrator] Round2 收集 ${sub.id} 更新失败:`, e)
      }
    }

    // 更新 context 以反映 Round 2 结果
    const round2Context: RoundContext = {
      ...round1Context,
      subsystemStates: { ...states },
    }

    // === Round 3: 全局一致性修复 (data-final-fixes.lua) ===
    for (const sub of allSubs) {
      const subV2 = sub as { collectStateFinalFix?: (ctx: RoundContext) => SubSystemState | null }
      if (typeof subV2.collectStateFinalFix !== 'function') continue
      try {
        const fix = subV2.collectStateFinalFix(round2Context)
        if (fix) {
          const sanitized = sanitizeSubSystemState(fix, `sub.${sub.id}.fix`)
          if (sanitized.report.passed) {
            states[fix.id] = sanitized.result as SubSystemState
          }
        }
      } catch (e) {
        console.error(`[Orchestrator] Round3 收集 ${sub.id} 修复失败:`, e)
      }
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
      worldId: this.worldSetting?.name ?? '',
      characterId: this.characterState?.name ?? '',
      round: this.state.round,
      timeStep: resolved.calendarAdvance,
      difficulty: (this.worldSetting?.config?.difficulty as RoundContext['difficulty']) ?? 'normal',
      subsystemStates: this.lastSubsystemStates,
      roundSequence: this.state.totalRounds,
      daysPassed: timeSystem.getDaysPassed(),
      totalDays: this.state.round.totalDays,
      lastNarrativeText: this.lastNarrativeText || undefined,
      eraStartYear: eraStartYear || undefined,
      birthEraYear: birthEraYear || undefined,
      essenceTag,
    }
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

  // === 主循环 ===

  /**
   * 执行完整回合（完整 14 步管线）
   *
   * @deprecated 请使用 executeRoundV2()，它通过声明式阶段机驱动管线。
   *   此方法保留仅用于向后兼容，未来版本将移除。
   */
  async executeRound(
    promptTemplate: PromptTemplate,
    aiConfig: AIModelConfig,
    sessionId?: string,
  ): Promise<RoundResult> {
    if (this.state.status !== 'running' && this.state.status !== 'idle') {
      return { narrative: '', changes: [], notableEvents: [] }
    }
    if (this.shouldStop()) {
      this.state.status = 'complete'
      return { narrative: '', changes: [], notableEvents: [] }
    }

    // 死循环保护
    const pipelineCheck = globalDeadLoopDetector.checkAndIncrement('orchestrator-pipeline', 200)
    if (!pipelineCheck.allowed) {
      console.error('[Orchestrator]', pipelineCheck.reason)
      this.state.status = 'complete'
      return { narrative: '', changes: [], notableEvents: [] }
    }

    this.state.status = 'running'
    this.lastSessionId = sessionId

    // 1. 推进时间
    eventBus.emit('mod-engine:round-start', this.state.round)
    this.state.round = this.advanceTimeForCurrentStep()
    this.state.totalRounds++

    // 2. 本地模拟推进（所有子系统的纯规则推演）
    this.advanceSubsystems(this.buildRoundContext())

    // 3. 收集子系统状态
    this.collectSubsystemStates()

    // 4. 事件生命周期追踪（10 维度事件检测）
    const context = this.buildRoundContext()
    const { eventInjectionText, newLifecycle } = buildEventInjectionText(
      this.extractDetectionStates(),
      this.eventLifecycle,
      this.state.totalRounds,
    )
    this.eventLifecycle = newLifecycle

    // 5. 跨域联动（宏观事件驱动规则 + 角色状态驱动规则 → 产出指令 → 应用到子系统）
    //    移除 if(eventInjectionText) 守卫：角色状态驱动规则需要每轮检查 dataCondition
    const hadMacroEvents = !!eventInjectionText
    await this._executeCrossDomainLinkage(context)

    // 重新收集状态（跨域联动可能已修改子系统数据）
    this.collectSubsystemStates()

    // P5: 跨域联动后重新事件检测（仅宏观事件后重检，新事件注入当前轮 Prompt，不延迟到下一轮）
    let finalEventInjectionText = eventInjectionText
    if (hadMacroEvents) {
      const reDetect = buildEventInjectionText(
        this.extractDetectionStates(),
        this.eventLifecycle,
        this.state.totalRounds,
      )
      this.eventLifecycle = reDetect.newLifecycle
      if (reDetect.eventInjectionText) {
        finalEventInjectionText = [eventInjectionText, reDetect.eventInjectionText]
          .filter(Boolean)
          .join('\n')
      }
    }

    // 6. 组装富 PromptContext
    const promptContext = this.assemblePromptContext(finalEventInjectionText)

    // 7. 构建分段 Prompt
    const segments = buildSegmentedPrompt(promptTemplate, promptContext)

    // 8. 调用 AI（流式 + 降级链）
    this.state.currentNarrative = ''
    const fallbackNarrative = this.buildFallbackNarrativeFromState()
    const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
    let fullContent: string
    try {
      const model = customModel || aiConfig.model
      fullContent = await callAIWithPromptTemplate(
        promptTemplate,
        segments.full,
        {
          streaming: true,
          fallbackText: fallbackNarrative,
          config: { ...aiConfig, model },
          pool: 'narrative',
          strictSchema: true,
          sessionId,
          providerId: provider,
          customBaseUrl: customUrl || undefined,
          customModel: model,
          apiKey: customKey || undefined,
          userSegments: getNarrativeUserSegments(segments),
          onChunk: (chunk: string) => {
            this.state.currentNarrative += chunk
            if (this.onNarrativeChunk) {
              this.onNarrativeChunk({
                text: chunk,
                isComplete: false,
                timestamp: Date.now(),
              })
            }
          },
          onResetStream: () => {
            // AI 重试/降级前：清空本地累积 + 通知 UI 丢弃残留流式文本，避免拼接重复
            this.state.currentNarrative = ''
            if (this.onNarrativeChunk) {
              this.onNarrativeChunk({
                text: '',
                isComplete: false,
                isReset: true,
                timestamp: Date.now(),
              })
            }
          },
        },
      )
    } catch (err) {
      // 极端情况：连降级链都失败（理论上不会到达这里，wrapper 内部 callAIStreamDegraded 已兜底）
      console.error('[Orchestrator] AI 调用完全失败（降级链耗尽）:', err)
      fullContent = fallbackNarrative
    }

    // 9. 解析响应 + 分发变更
    const result = this.handleNarrativeResponse(fullContent)

    // P3: 存储 notableEvents，供下一轮跨域联动使用
    if (result.notableEvents?.length) {
      this.lastNotableEvents = result.notableEvents
    }

    // 10. 叙事后处理（连锁反应 + 寿命突破/损失）
    if (result.narrative) {
      this._runNarrativePostProcessing(result.narrative)
    }

    // 10c. 记忆生命周期：重要性评分（每轮分析叙事重要度+检测事件闭环）
    if (result.narrative) {
      const importanceResult = memoryLifecycle.scoreImportance(
        result.narrative,
        this.state.round.year,
      )
      if (importanceResult.importance === 'HIGH' || importanceResult.isClosure) {
        // console.log(
        //   `[Orchestrator] 叙事重要度：${importanceResult.importance}，` +
        //   `闭环检测：${importanceResult.isClosure ? importanceResult.closureType : '无'}`
        // )
      }
    }

    // 11. 世界方向修正：MVP 阶段目标子系统未运行，仅保留未来段入口
    this._applyWorldDirectionFromNarrative(result.narrative)

    // 12. 检测死亡 → 触发死后尾声生成（等待完成后继续）
    await this._checkAndTriggerEpilogue(aiConfig, sessionId)

    return result
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
      const healthSub = this.subsystems.find((s) => s.id === 'health')
      if (!healthSub) return

      const context = this.buildRoundContext()
      const healthState = healthSub.collectState(context)
      const hData = healthState.data as { isDead?: boolean }
      if (!hData?.isDead) return

      const epilogueSub = this.subsystems.find((s) => s.id === 'post-death-epilogue') as unknown as {
        hasEpilogue: () => boolean
        generateEpilogue: (
          ctx: RoundContext,
          config: AIModelConfig,
          history: string[],
          sid?: string,
        ) => Promise<string>
      } | undefined
      if (!epilogueSub) return

      if (epilogueSub.hasEpilogue()) return

      const freshContext = this.buildRoundContext()
      const narrativeHistory = this.state.narrativeHistory.map((n) => n.text)

      await epilogueSub.generateEpilogue(freshContext, aiConfig, narrativeHistory, sessionId)
        .then((epilogueText) => {
          // console.log(`[Orchestrator] 死后尾声已生成（${epilogueText.length} 字符）`)
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
  public triggerAutoSave(): void {
    if (this.state.totalRounds <= 0) return
    if (this.state.status !== 'running') return

    const worldName = this.worldSetting?.name ?? ''
    const characterName = this.characterState?.name ?? ''
    const saveRound = this.state.totalRounds
    const payload = collectGameSavePayload()

    void saveManager.autoSave(worldName, characterName, payload).then(() => {
      const store = useEngineStore.getState()
      const currentSavedRound = store.lastAutoSaveRound ?? 0
      const currentTotalRounds = store.totalRounds ?? saveRound
      const savedRoundIsFromAnotherTimeline = currentSavedRound > currentTotalRounds
      if (savedRoundIsFromAnotherTimeline || saveRound >= currentSavedRound) {
        this.state.lastAutoSaveRound = saveRound
        store.setLastAutoSaveRound(saveRound)
      }
      // console.log(`[Orchestrator] 自动保存完成（第 ${saveRound} 轮）`)
    }).catch((err) => {
      console.error('[Orchestrator] 自动保存失败:', err)
    })
  }

  // === 压缩 ===

  private buildYearEvents(): YearEvent[] {
    const fallbackRound = this.state.round
    const fallbackAge = this.computeNarrativeAge(this.buildRoundContext())
    const fallbackTimeLabel = `${fallbackRound.eraName}${fallbackRound.eraYear}年`

    return this.state.narrativeHistory.map((n, i) => {
      const age = n.displayAge ?? fallbackAge
      const timeLabel = n.displayTimeLabel?.trim() || fallbackTimeLabel

      return {
        id: i + 1,
        age,
        totalMonths: Math.max(0, Math.round(age * 12)),
        eraYear: fallbackRound.eraYear,
        eraName: '',
        narrative: n.text,
        timeLabel,
      }
    })
  }

  /** Phase 6：L1–L6 AI 压缩 + 记忆生命周期索引 */
  private runCompressionPipeline(): void {
    if (!USE_AI_SUMMARY_COMPRESSION) return
    if (this.isPreviewExecution()) return
    if (!this.lastAiConfig || !this.worldSetting || !this.characterState) return

    const decision = memoryLifecycle.decideCompression()
    const turnCount = this.state.totalRounds - 1

    void summaryCompressor
      .generateCompressedSummaries(
        this.lastAiConfig,
        this.buildYearEvents(),
        this.worldSetting,
        this.characterState,
        turnCount,
        undefined,
        this.lastSessionId,
        memoryLifecycle,
      )
      .then((result) => {
        this.state.compressedSummaries = result.newCompressedSummaries
        const stats = summaryCompressor.getStats()
        this.state.compressionStats = {
          l1Count: stats.totalL1,
          l2Count: stats.totalL2,
          l3Count: stats.totalL3,
          l4Count: stats.totalL4,
          lastAt: stats.lastCompressionAt,
        }
        useEngineStore.getState().setCompressedSummaries(result.newCompressedSummaries)
        useEngineStore.getState().setCompressionStats(this.state.compressionStats)

        const compressedSummaries = result.newCompressedSummaries
        if (compressedSummaries?.summaries) {
          const newL1s = compressedSummaries.summaries.filter(
            (s) => s.level === 1 && s.endRound >= this.state.totalRounds - 10,
          )
          for (const l1 of newL1s) {
            memoryLifecycle.addToIndex(
              1,
              l1.startRound,
              l1.endRound,
              l1.content,
              memoryLifecycle.getTaggedEvents().filter(
                (e) => e.round >= l1.startRound && e.round <= l1.endRound,
              ),
            )
          }
        }

        if (decision.shouldCompress && result.didCompress) {
          memoryLifecycle.clearTaggedEvents()
          eventBus.emit('mod-engine:narrative-compressed', {
            level: 'L1',
            reason: decision.reason,
            stats: this.state.compressionStats,
          })
        }
      })
      .catch((err) => {
        console.error('[Orchestrator] 叙事压缩失败:', err)
      })
  }

  private checkAndCompress(): void {
    this.runCompressionPipeline()
  }

  /**
   * 组装 memorySummary：既有富 Prompt（L1–L6 分层 + 检索）之上，
   * 追加「摘要账本」按有效重要性挑选的长期记忆（想法1）。
   * 账本用 AI 自述的 digest/keyEvents + 连锁 + 衰减，precise 优先于关键词猜测。
   */
  private buildMemorySummaryWithLedger(memoryStateCard: string): string {
    const rich = memoryLifecycle.formatRichPromptForInjection(
      memoryLifecycle.buildRichPrompt(
        memoryStateCard,
        this.state.narrativeHistory.slice(-5).map((n) => n.text),
        summaryCompressor.getSummaries(),
      ),
    )

    const currentRound = this.state.round.year
    const ledgerLines = digestLedger.selectForPrompt(currentRound)
    if (ledgerLines.length === 0) return rich

    const ledgerBlock = ['【往事回响】', ...ledgerLines].join('\n')
    return rich ? `${rich}\n\n${ledgerBlock}` : ledgerBlock
  }

  getCompressedNarrativeHistory(): string {
    // 使用记忆生命周期系统构建富Prompt上下文
    // DS V4 1M上下文：4个压缩层级 + L0原文 + 状态卡 + 检索命中

    const summaries = summaryCompressor.getSummaries()
    const recentTexts = this.state.narrativeHistory.slice(-5).map((n) => n.text)

    // 构建状态卡
    const stateCardLines: string[] = Object.values(this.lastSubsystemStates)
      .filter((s) => s.id !== this.id)
      .map((s) => s.summary)
      .filter(Boolean)
    const stateCard = stateCardLines.join('\n')

    // 组装富Prompt（4层级+L0）
    const richContext = memoryLifecycle.buildRichPrompt(
      stateCard,
      recentTexts,
      summaries,
    )

    return memoryLifecycle.formatRichPromptForInjection(richContext)
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
    const lifespanData = this.lastSubsystemStates?.['lifespan']?.data as { breakthroughs?: unknown[] } | undefined
    const breakthroughCount = lifespanData?.breakthroughs?.length ?? this.totalBreakthroughs
    return {
      id: this.id,
      summary: `【${this.label}】${this.state.status} | 第 ${this.state.totalRounds} 回合 | 第${this.state.round.year}年 | 事件追踪×${lifecycleCount} | 压缩 L1×${this.state.compressionStats.l1Count} | 突破×${breakthroughCount}`,
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

  reset(): void {
    this.state = {
      status: 'idle',
      round: { year: 1, season: 0, month: 0, day: 0, dayOfYear: 1, totalDays: 365, ...TimeSystem.resolveDisplayEra(1) },
      timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
      totalRounds: 0,
      narrativeHistory: [],
      currentNarrative: '',
      compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0, lastAt: 0 },
      compressedSummaries: { summaries: [] },
      lastAutoSaveRound: 0,
      characterCreations: [],
    }
    this.lastSubsystemStates = {}
    this.eventLifecycle = {}
    this.totalBreakthroughs = 0
    this.prevAbbreviationSnapshot = {}
    this.prevRoundYear = 0
    this.prevBridgeSnapshot = {}
    this.lastNarrativeText = ''
    this.lastNarratedTimeStep = { ...DEFAULT_ENGINE_CONFIG.timeStep }
    this.pendingTimeStepAlignmentFromUnit = undefined
    this.worldSetting = null
    this.characterState = null
    this.worldEventBus.reset()
    summaryCompressor.reset()
    memoryLifecycle.reset()
    digestLedger.reset()
    adaptationManager.clear()
    globalDeadLoopDetector.resetAll()
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
    this.state = {
      status: store.status === 'complete' ? 'complete' : 'idle',
      round: { ...store.round },
      timeStep: { ...store.timeStep },
      totalRounds: store.totalRounds,
      narrativeHistory: store.narrativeHistory.map((chunk) => ({ ...chunk })),
      currentNarrative: store.currentNarrative,
      compressionStats: { ...store.compressionStats },
      compressedSummaries: structuredClone(store.compressedSummaries),
      lastAutoSaveRound,
      characterCreations: [...(store.characterCreations ?? [])] as CharacterCreation[],
    }
    if (lastAutoSaveRound !== store.lastAutoSaveRound) {
      useEngineStore.getState().setLastAutoSaveRound(lastAutoSaveRound)
    }
    timeSystem.importRound(store.round)
    timeSystem.setTimeStep(store.timeStep)
    const shouldRestorePendingAlignment = previousTimeStep
      && store.narrativeHistory.length > 0
      && shouldAlignTimeStepTransition(previousTimeStep.unit, store.timeStep.unit)
    this.lastNarratedTimeStep = shouldRestorePendingAlignment
      ? { ...previousTimeStep }
      : { ...store.timeStep }
    this.pendingTimeStepAlignmentFromUnit = shouldRestorePendingAlignment
      ? previousTimeStep.unit
      : undefined
    if (store.narrativeHistory.length > 0) {
      this.lastNarrativeText = store.narrativeHistory[store.narrativeHistory.length - 1]?.text ?? ''
    }
    adaptationManager.clear()
    this.start()
  }

  // === 叙事后处理 ===

  /**
   * 执行叙事后处理：仅保留非权威连锁反应。
   * 寿命突破/减寿由 LifespanSystem 在 collectStateUpdate 中读取上下文并闭环落地。
   */
  private _runNarrativePostProcessing(narrative: string): void {
    try {
      // 从子系统状态提取所需数据
      const healthState = this.lastSubsystemStates?.['health']
      const economyState = this.lastSubsystemStates?.['economy']
      const reputationState = this.lastSubsystemStates?.['reputation']

      const currentHealth = (healthState?.data as { hp?: number } | undefined)?.hp ?? 50
      const currentWealth =
        (economyState?.data as { currency?: { playerWealth?: number } } | undefined)?.currency
          ?.playerWealth ?? 0
      const currentReputation = (reputationState?.data as { fame?: number } | undefined)?.fame ?? 0

      const postResult = runPostNarrativePhase({
        narrative,
        currentHealth,
        currentWealth,
        currentReputation,
      })

      // 应用连锁反应结果到子系统。MVP 阶段 health/economy/reputation 未开放时，
      // RoundCommitBus 会按运行白名单跳过，避免后处理器绕过子系统恢复顺序。
      const healthDelta = postResult.chainResult.updatedHealth - currentHealth
      if (healthDelta !== 0 && isMvpNarrativeChangeSubsystem('health')) {
        this.applyRoundChanges([{
          id: 'health',
          description: '叙事后处理：连锁反应 — 健康修正',
          changes: { hpDelta: healthDelta },
        }], 'post-narrative')
      }
      if (postResult.chainResult.wealthChange !== 0 && isMvpNarrativeChangeSubsystem('economy')) {
        this.applyRoundChanges([{
          id: 'economy',
          description: '叙事后处理：连锁反应 — 财富修正',
          changes: { wealthDelta: postResult.chainResult.wealthChange },
        }], 'post-narrative')
      }
      if (postResult.chainResult.reputationChange !== 0 && isMvpNarrativeChangeSubsystem('reputation')) {
        this.applyRoundChanges([{
          id: 'reputation',
          description: '叙事后处理：连锁反应 — 声望修正',
          changes: { addFame: postResult.chainResult.reputationChange },
        }], 'post-narrative')
      }

      // 发出通知事件
      if (postResult.notificationText) {
        eventBus.emit('mod-engine:post-narrative-notification', {
          text: postResult.notificationText,
          chain: postResult.chainResult,
        })
      }
    } catch (e) {
      console.error('[Orchestrator] 叙事后处理失败:', e)
    }
  }

  // === 跨域联动 ===

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

  /**
   * 按 WorldCalibration.crossDomainEffectModifier 缩放跨域规则产出的数值参数
   * （在 orchestrator 侧注入，避免 mod-engine → mod-world 循环依赖）
   */
  private _applyCrossDomainEffectModifier(instructions: SubsystemInstruction[]): void {
    const calRaw = this.worldSetting?.config?._calibration as
      | { formulas?: { crossDomainEffectModifier?: number } }
      | undefined
    const modifier = calRaw?.formulas?.crossDomainEffectModifier ?? 1
    if (modifier === 1) return

    for (const inst of instructions) {
      for (const [key, value] of Object.entries(inst.params)) {
        if (typeof value === 'number') {
          inst.params[key] = value * modifier
        }
      }
    }
  }

  /**
   * 执行跨域联动：将事件检测结果转为 DomainEvent 并通过 EventBus 分发
   */
  private async _executeCrossDomainLinkage(_context: RoundContext): Promise<void> {
    try {
      const eventId = `round-${this.state.totalRounds}-${Date.now()}`
      const domainEvent: DomainEvent = {
        id: eventId,
        type: 'SYSTEM_EVENT_BATCH',
        sourceCategory: 'orchestrator',
        severity: 'normal',
        description: Object.keys(this.eventLifecycle)
          .filter((k) => this.eventLifecycle[k].status === 'new' || this.eventLifecycle[k].status === 'ongoing')
          .join('、'),
        context: { valueChanges: {}, round: this.state.totalRounds },
        eraYear: this.state.round.year,
      }

      const detectionStates = this.extractDetectionStates()
      let cooldowns = this.worldEventBus.getCooldowns()
      const instructions: SubsystemInstruction[] = []

      this.worldEventBus.recordEvent(domainEvent)
      const mainEval = await simulationBridge.evalCrossDomain({
        event: domainEvent,
        subsystemStates: detectionStates,
        round: this.state.totalRounds,
        cooldowns,
      })
      cooldowns = mainEval.cooldowns
      instructions.push(...mainEval.instructions)

      for (const notableEvent of this.lastNotableEvents) {
        const aiEvent: DomainEvent = {
          id: `${eventId}-ai-${notableEvent.slice(0, 8)}`,
          type: 'AI_NOTABLE_EVENT',
          sourceCategory: 'ai-narrative',
          severity: 'major',
          description: notableEvent,
          context: { valueChanges: {}, round: this.state.totalRounds },
          eraYear: this.state.round.year,
        }
        this.worldEventBus.recordEvent(aiEvent)
        const aiEval = await simulationBridge.evalCrossDomain({
          event: aiEvent,
          subsystemStates: detectionStates,
          round: this.state.totalRounds,
          cooldowns,
        })
        cooldowns = aiEval.cooldowns
        instructions.push(...aiEval.instructions)
      }

      this.worldEventBus.setCooldowns(cooldowns)

      if (instructions.length > 0) {
        const mvpInstructions = instructions.filter((inst) =>
          isMvpNarrativeChangeSubsystem(inst.targetSystemId),
        )
        if (mvpInstructions.length === 0) return

        for (const inst of mvpInstructions) {
          if (inst.namedAction) {
            const target = this.subsystems.find((s) => s.id === inst.targetSystemId)
            const actions = target?.crossDomainActions
            if (actions?.[inst.namedAction]) {
              inst.params = { ...actions[inst.namedAction], ...inst.params } as Record<string, unknown>
            }
          }
        }
        this._applyCrossDomainEffectModifier(mvpInstructions)
        const rawChanges = WorldEventBus.toSubSystemChanges(mvpInstructions, eventId)
        const changes = await simulationBridge.validateCrossDomainChanges(rawChanges)
        this.applyRoundChanges(changes, 'cross-domain')
      }
    } catch (e) {
      console.error('[Orchestrator] 跨域联动执行失败:', e)
    }
  }

  /** 发布 SimulationSnapshot 供 UI 订阅（Worker 解耦层） */
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
    const syncedCharacter = this.syncCharacterStateForPrompt(context)
    const narrativeTime = buildNarrativeTimeContext(context, this.worldSetting)
    const relevantStates = subsystemRelevance.getRelevantStates(
      this.lastSubsystemStates,
      context,
    )
    const memoryRelevantStates = subsystemRelevance.getMemoryRelevantStates(
      this.lastSubsystemStates,
      context,
    )
    const promptOpenIds = Object.keys(memoryRelevantStates).filter(
      (id) => id !== this.id && isSubsystemOpenForPrompt(memoryRelevantStates[id], id),
    )
    const isRelevant = (id: string, ctx: RoundContext) =>
      isMvpPromptSubsystem(id) && subsystemRelevance.isRelevant(id, ctx)

    const memoryStateSummaries = collectMemoryStateSummaries(
      this.lastSubsystemStates,
      isRelevant,
      context,
    )
    const memoryStateCard = buildLayeredMemoryStateCard(
      this.lastSubsystemStates,
      isRelevant,
      context,
    )

    // 获取适配后的 summaries（adaptation 管线：缓存命中用适配文本，未命中用原始文本）
    const rawStateSummaries = Object.values(relevantStates)
      .filter((s) => s.id !== this.id && isSubsystemOpenForPrompt(s, s.id))
      .map((s) => ({ id: s.id, summary: s.summary }))
      .filter((s) => s.summary)
    const adaptedMap = adaptationManager.getAdaptedSummaries(rawStateSummaries)

    const summaries: string[] = dedupeSummariesAgainstMemory(
      rawStateSummaries.map((s) => adaptedMap.get(s.id) ?? s.summary),
      memoryStateSummaries,
    )

    // 滑动窗口变化摘要（最近 3 轮内有变化的系统）
    const slidingWindowText = subsystemRelevance.buildSlidingWindowSummary(
      this.state.totalRounds,
    )

    // 系统变化摘要（与前轮缩写快照对比）
    const currentAbbrev = this.buildAbbreviationSnapshot()
    const systemChangeSummary = this.buildSystemChangeSummary(currentAbbrev)
    this.prevAbbreviationSnapshot = currentAbbrev

    // 世界自定义文本（注入玩家设定的宏观维度 + 经济总量 + 角色影响力）
    const worldCustomizeText = this.buildWorldCustomizeText()

    // 角色影响力文本（五维过滤：力量等级 → 叙事因果影响范围）
    const influenceText = this.buildInfluenceText()

    const config = this.worldSetting?.config ?? {}
    const coherenceHeader = buildNarrativeCoherenceHeader(config, syncedCharacter.age)

    const lifespanData = this.lastSubsystemStates?.['lifespan']?.data as { maxAge?: number } | undefined
    const baseData = this.lastSubsystemStates?.['character-base']?.data as { startingAge?: number } | undefined
    const maxAge = lifespanData?.maxAge ?? 100
    const startingAge = baseData?.startingAge ?? 0
    const isOpeningNarrativeRound = this.state.narrativeHistory.length === 0
    const isBirthOpeningRound = isOpeningNarrativeRound && startingAge === 0 && syncedCharacter.age === 0
    const lifeStageHint = buildLifeStageNarrativeHint(
      resolveLifeStageFromAge(syncedCharacter.age, maxAge, startingAge),
      maxAge,
      startingAge,
      syncedCharacter.age,
    )
    // 叙事类型引导：按生命阶段限制可选叙事类型（婴儿禁战斗、老年禁探险）
    const archetypeHint = generateArchetypeHint(
      resolveLifeStageFromAge(syncedCharacter.age, maxAge, startingAge),
      'normal',
      countConsecutiveConflictRounds(this.state.narrativeHistory.slice(-10).map((n) => n.text)),
    )
    // 寿命提醒：告知 AI 角色当前寿命阶段约束
    const lifespanReminder = buildLifespanReminder(maxAge, syncedCharacter.age)

    // 合并静态自定义文本（世界创建后不变，享受 STABLE KV 缓存）
    const staticCustomText = [
      worldCustomizeText,
      this.buildEconomyTierRules(),
    ].filter(Boolean).join('\n')

    // 合并动态叙事引导（每轮变化，放入 FAST 段避免污染 STABLE 前缀）
    const narrativeGuidanceText = [
      coherenceHeader,
      lifeStageHint,
      archetypeHint,
      lifespanReminder,
      influenceText,
      slidingWindowText,
      coreMemory.buildNPCNetworkText(),
    ].filter(Boolean).join('\n')

    // 保留 combinedCustomText 用于 compatibility（组装时仅含静态部分）
    const combinedCustomText = staticCustomText || undefined

    const calibrationRaw = this.worldSetting?.config?._calibration as
      | { styleGuide?: { narrativeTone?: string } }
      | undefined
    const narrativeToneHint = resolveNarrativeToneHint(
      calibrationRaw?.styleGuide?.narrativeTone,
    )

    const userInstruction = this.buildUserInstruction()

    // 构建轻量 worldSetting（剥离每轮不变的静态参数，减少 Token 浪费）
    // aiDetailedParameters（43字段，~2000字符）在世界初始化后不再变化，每轮重复发送无意义
    const lightWorldSetting = this.buildLightWorldSetting(narrativeTime.eraLabel)

    // 非超凡世界不重复发送无关的 24 阶力量表；有力量体系时使用现有叙事精简格式。
    const powerSystemTag = typeof config.powerSystemTag === 'string' ? config.powerSystemTag : ''
    const powerCeiling = Number(config.powerCeiling)
    const powerCeilingPresets = powerSystemTag === 'none' || !Number.isFinite(powerCeiling) || powerCeiling <= 1
      ? undefined
      : buildPowerCeilingPresetsForNarrative(powerCeiling)
    const timeScaleHint = buildTimeScaleNarrativeHint(this.state.timeStep)
    const calendarNarrativeContext = buildCalendarNarrativeContext({
      timeStep: this.state.timeStep,
      calendarYear: narrativeTime.calendarYear,
      month: this.state.round.month + 1,
      day: this.state.round.day + 1,
    })

    const assembled: PromptContext = {
      worldSetting: lightWorldSetting,
      character: syncedCharacter,
      currentTime: narrativeTime.timeLabel,
      subsystemSummaries: summaries,
      narrativeHistory: this.state.narrativeHistory.slice(-20).map((n) => n.text),
      eventInjectionText: eventInjectionText || undefined,
      timeBridgeSummary: buildTimeBridgeSummary(this.buildTimeBridgeInput()) || undefined,
      systemChangeSummary: systemChangeSummary || undefined,
      worldCustomizeText: combinedCustomText || undefined,
      narrativeGuidanceText: narrativeGuidanceText || undefined,
      plotStructureText: plotStructure.buildPhaseGuidance() || undefined,
      foreshadowingText: foreshadowing.buildForeshadowingText() || undefined,
      worldTagsText: (this.worldSetting?.config?._worldTagsText as string) || undefined,
      worldRules: buildNarrativeWorldRules(
        getWorldRules(config.essenceTag as string | undefined),
      ) || undefined,
      modWorldRules: this.modManifests
        .filter((m) => m.worldRules)
        .map((m) => m.worldRules)
        .join('\n') || undefined,
      narrativeStyle: this.getNarrativeStyle(),
      narrativeToneHint,
      memorySummary: this.buildMemorySummaryWithLedger(memoryStateCard),
      coreMemory: coreMemory.buildCoreMemory() || undefined,
      // 从单一来源常量取默认字数，避免散落硬编码回退
      wordCountInstruction: buildWordCountInstruction(useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET),
      calibrationSummary: (this.worldSetting?.config?._calibrationSummary as string) || undefined,
      causalChainHint: this.buildCausalChainHint(),
      creationProtectionText: this.buildCreationProtectionText(),
      userInstruction,
      powerCeilingPresets,
    }

    // 命格注入：开场叙事告知 AI 角色天赋特质
    if (isOpeningNarrativeRound) {
      const patterns = getDestinyPatternSystem().getPatterns()
      if (patterns.length > 0) {
        const talentDesc = patterns
          .map((p) => `${p.name}（${p.rarity}·${p.polarity}）：${p.description}`)
          .join('；')
        assembled.talents = talentDesc
      }

      const firstRoundInstruction = isBirthOpeningRound
        ? [
            '这是角色人生的起点——0岁开场只写出生与家世，不写出生后一整年的成长概述。',
            '① 出生场景：具体时间、地点、天气、接生场景的细节描写',
            '② 家庭环境：父母的职业/身份/性格、家庭经济状况、居住环境的详细描写',
            '③ 时代背景：所在地区的风俗、社会阶层、邻里关系、时代氛围',
            '④ 感官体验：婴儿视角的听觉/视觉/触觉/嗅觉感受',
            '⑤ 时间范围限制在出生当日或出生前后短时段，不写翻身、爬行、学步、说话等后续月份事件',
            '⑥ 年龄由时间推进与起始年龄派生，不要在 changes 中写 lifespan.age；0岁开场通常返回 changes: []',
          ].join('\n')
        : [
            '这是角色人生记录的开场——先建立当前年龄的身份、家世、处境和所处环境。',
            '① 从具体场景切入，交代角色身边的人、居住环境和社会位置',
            '② 只叙述当前开场节点附近发生的事，不概括一整段已过去的人生',
            '③ 叙事自然分段，用具体细节和感官描写替代概括性叙述',
          ].join('\n')
      assembled.userInstruction = assembled.userInstruction
        ? `${assembled.userInstruction}\n\n${firstRoundInstruction}`
        : firstRoundInstruction
    }

    // 注入子系统变更指南（从 System Prompt 移出，由 orchestrator 控制是否包含）
    if (promptOpenIds.length > 0) {
      assembled.subsystemGuideText = SUBSYSTEM_GUIDE
    }

    // 每轮动态时间导演提示放在 FAST 段末尾，避免污染 STABLE 前缀缓存。
    assembled.timeGuideText = [
      timeScaleHint,
      calendarNarrativeContext,
    ].filter(Boolean).join('\n')

    if (isInstrumentEnabled()) {
      const mem = assembled.memorySummary ?? ''
      const core = assembled.coreMemory ?? ''
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
    return memoryLifecycle.getTaggedEvents()
      .filter((e) => e.round > fromYear && e.round <= toYear)
      .map((e) => extractL0Title(e.narrative))
      .filter(Boolean)
  }

  /** Phase 7D-4：待兑现因果链注入叙事 Prompt */
  private buildCausalChainHint(): string | undefined {
    const data = this.lastSubsystemStates['causal-simulation']?.data as {
      queue?: {
        pending?: Array<{
          actionType?: string
          triggerYear?: number
          captureDescription?: string
        }>
      }
    } | undefined
    const pending = data?.queue?.pending
    if (!pending?.length) return undefined
    const lines = pending.slice(0, 3).map((e) => {
      const type = e.actionType ?? '因果'
      const year = e.triggerYear ?? '?'
      const desc = (e.captureDescription ?? '').slice(0, 48)
      return `- ${type}（预计${year}年兑现）${desc ? `：${desc}` : ''}`
    })
    return `【待兑现因果链】\n${lines.join('\n')}`
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
      if (prevText && prevText !== currText) {
        changes.push(`${id}: ${prevText} → ${currText}`)
        // 同步记录到 SubsystemRelevanceSystem 滑动窗口
        if (!this.isPreviewExecution()) {
          subsystemRelevance.recordChange(id, this.state.totalRounds, `${prevText} → ${currText}`)
        }
      } else if (!prevText && currText) {
        changes.push(`${id}: 新增 — ${currText}`)
        if (!this.isPreviewExecution()) {
          subsystemRelevance.recordChange(id, this.state.totalRounds, `新增: ${currText}`)
        }
      }
    }
    return changes.length > 0 ? `【系统变化摘要】\n${changes.join('\n')}` : ''
  }

  /**
   * 构建原创保护文本（注入 STABLE KV Cache 段）
   * 从 characterCreations 生成硬性约束，禁止 AI 将角色原创改写为遗迹来源
   */
  private buildCreationProtectionText(): string | undefined {
    const creations = this.state.characterCreations
    if (!creations.length) return undefined
    const lines = creations.map((c) =>
      `- [${c.category}] ${c.name}：${c.description}（第${c.confirmedRound}轮开创）`,
    )
    return [
      '【原创保护（硬性约束）】以下为角色亲自开创的内容，其来源是角色自身的创造力。',
      '严禁在后续叙事中将其改写为「遗迹发现」「古人传承」「秘境所得」「他人遗留」等外部来源。',
      '若需描写这些内容的发展，应侧重于角色的自我完善、突破或传道授业，而非发掘古人遗产。',
      ...lines,
    ].join('\n')
  }

  /** 构建世界自定义文本 */
  private buildWorldCustomizeText(): string | undefined {
    const parts: string[] = []
    const config = this.worldSetting?.config ?? {}

    if (config.powerCeiling) {
      parts.push(`力量上限：${config.powerCeiling}`)
    }
    // spatialForm 是注入时使用的字段名（与 universeScale 同义但命名统一）
    const spaceForm = (config.spatialForm || config.universeScale) as string | undefined
    if (spaceForm) {
      parts.push(`空间形态：${spaceForm}`)
    }
    if (config.civilizationStage) {
      parts.push(`文明阶段：${config.civilizationStage}`)
    }

    return parts.length > 0
      ? `【玩家自定义宏观维度】\n${parts.join('\n')}`
      : undefined
  }

  /**
   * 构建角色影响力文本（五维过滤：力量等级 → 叙事因果影响范围）
   */
  private buildInfluenceText(): string | undefined {
    const totalPower = subsystemRelevance.calculateTotalPower(this.lastSubsystemStates)
    const scope = subsystemRelevance.getInfluenceScope(totalPower)
    return subsystemRelevance.buildInfluenceText(totalPower, scope)
  }

  /**
   * 战力→经济层级规则（注入 AI Prompt）
   *
   * 告诉 AI 当前世界天花板下物品/丹药/装备的经济层级，
   * AI 据此在叙事中推理合理价格。
   */
  private buildEconomyTierRules(): string | undefined {
    const config = this.worldSetting?.config ?? {}
    if (shouldSkipEconomyTierRules(config)) return undefined

    const powerCeilingRaw = config.powerCeiling
    if (!powerCeilingRaw) return undefined

    const ceilingMatch = String(powerCeilingRaw).match(/(\d+)/)
    const worldCeiling = ceilingMatch ? parseInt(ceilingMatch[1], 10) : MAX_REACHABLE_STAGE
    if (worldCeiling < 1) return undefined

    const calRaw = config._calibration as { formulas?: { economyTierRatios?: number[] } } | undefined
    const ratioList = calRaw?.formulas?.economyTierRatios ?? [0.25, 0.45, 0.65, 0.85, 1.0]
    const economyMod = typeof config._economyModifier === 'number' ? config._economyModifier : 1.0

    const lines: string[] = [
      '【经济层级映射规则】',
      `当前世界战力天花板为 ${worldCeiling} 阶。物品稀缺度按以下层级划分：`,
    ]
    if (economyMod !== 1.0) {
      lines.push(`（世界经济活跃度修正 ×${economyMod.toFixed(2)}）`)
    }

    // 计算各层级的阈值（支持校准 economyTierRatios）
    const thresholds = [
      { tier: 1, stage: Math.floor(worldCeiling * ratioList[0]!), info: (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[1] },
      { tier: 2, stage: Math.floor(worldCeiling * ratioList[1]!), info: (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[2] },
      { tier: 3, stage: Math.floor(worldCeiling * ratioList[2]!), info: (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[3] },
      { tier: 4, stage: Math.floor(worldCeiling * ratioList[3]!), info: (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[4] },
      { tier: 5, stage: Math.floor(worldCeiling * ratioList[4]!), info: (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[5] },
    ]

    let prevMax = 0
    for (const t of thresholds) {
      if (!t.info) continue
      const range = prevMax === 0
        ? `物品阶位 ≤ ${t.stage} 阶`
        : `物品阶位 ${prevMax + 1}~${t.stage} 阶`
      lines.push(`  ${range} → ${t.info.label}（${t.info.rarity}，${t.info.availability}）`)
      prevMax = t.stage
    }

    lines.push('描述物品价格或交易场景时，请参照上述稀缺度层级。')

    return lines.join('\n')
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

  /** 基于当前状态生成兜底叙事（不依赖 AI） */
  private buildFallbackNarrativeFromState(): string {
    const age = this.computeNarrativeAge(this.buildRoundContext())
    const worldName = this.worldSetting?.name ?? '这个世界'
    return `你继续生活在${worldName}中，今年${age}岁。岁月平静地流逝着，没有什么特别的事情发生。生活依旧，你按照自己的方式继续前行。`
  }

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

  private buildUserInstruction(): string | undefined {
    const lines: string[] = []
    const hasFreshPlayerChoice = Boolean(this.lastPlayerChoice?.trim())
    this.branchJustResolved = hasFreshPlayerChoice
    if (hasFreshPlayerChoice) {
      this.lastBranchTotalRound = Math.max(this.lastBranchTotalRound, this.state.totalRounds)
    }

    // 信息优先级：开场叙事注入
    if (this.state.narrativeHistory.length === 0) {
      lines.push(INFORMATION_PRIORITY_RULE)
    }

    // 动态 hints（移植自废弃项目 buildNarrativeRoundPrompt）
    const hints = buildNarrativeHints(this.buildHintInput())
    if (hints.mandatory.length > 0) {
      lines.push(`指令（必遵）：${hints.mandatory.join('。')}`)
    }
    if (hints.optional.length > 0) {
      lines.push(`参考建议：${hints.optional.join('。')}`)
    }

    // 原创保护安全网：双重保险，确保即使 AI 忽略 JSON 中的「原创保护」字段也不改写
    if (this.state.characterCreations.length > 0) {
      const names = this.state.characterCreations.map((c) => c.name).join('、')
      lines.push(`【原创保护】角色已开创：${names}。这些内容的来源是角色自身创造力，严禁改写为遗迹/秘境/古人传承等外部来源。`)
    }

    // 原有逻辑
    if (useEngineStore.getState().forceBranchNext) {
      lines.push('【强制分叉】本轮必须设置 branch=true，并提供 branchTitle 与 2-4 个 branchOptions；叙事正文在抉择前结束，不要替玩家做决定。')
    }
    if (this.lastPlayerChoice) {
      const scale = classifyActionScale(this.lastPlayerChoice)
      const scaleHint = scale === 'small'
        ? '（小规模行动——一轮直接完成）'
        : scale === 'large'
          ? '（宏大目标——分阶段逐步实现）'
          : ''
      lines.push(`【玩家选择】${this.lastPlayerChoice}${scaleHint}`)
      this.lastCommittedPlayerChoice = this.lastPlayerChoice
      this.lastPlayerChoice = undefined
    }
    const resolved = useEngineStore.getState().resolvedBranches
    const resolvedLines: string[] = []
    for (const [id, choice] of Object.entries(resolved)) {
      if (!choice.trim()) continue
      const pos = this.state.narrativeHistory.findIndex((n) => n.id === id)
      if (pos >= 0) {
        resolvedLines.push(`第${pos + 1}轮:${choice}`)
      } else {
        resolvedLines.push(choice)
      }
    }
    if (resolvedLines.length > 0) {
      lines.push(`【历史分叉选择】${resolvedLines.join('；')}`)
    }

    // 连续分叉抑制：上轮已解决分支，本轮禁止再生成新分支
    const lastEntry = this.state.narrativeHistory[this.state.narrativeHistory.length - 1]
    if (lastEntry?.resolvedChoice) {
      lines.push('上轮已完成命运抉择，本轮禁止生成新的分支点(branch=false) - 给玩家至少一轮消化时间')
    } else if (this.shouldSuppressBranchPoint(false)) {
      lines.push(`普通命运分支冷却中：距离上一次分支不足 ${MIN_BRANCH_GAP_ROUNDS} 轮，本轮必须设置 branch=false。`)
    }
    return lines.length > 0 ? lines.join('\n') : undefined
  }

  private getRoundsSinceLatestBranch(history: EngineState['narrativeHistory']): number | null {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.isBranchPoint) {
        return history.length - 1 - i
      }
    }
    return null
  }

  private shouldSuppressBranchPoint(forceBranch: boolean, targetTotalRounds = this.state.totalRounds): boolean {
    if (forceBranch) return false
    if (this.branchJustResolved) return true

    const roundsSinceTrackedBranch = targetTotalRounds - this.lastBranchTotalRound
    if (roundsSinceTrackedBranch >= 0 && roundsSinceTrackedBranch < MIN_BRANCH_GAP_ROUNDS) {
      return true
    }

    const historyDistances = [
      this.getRoundsSinceLatestBranch(this.state.narrativeHistory),
      this.getRoundsSinceLatestBranch(useEngineStore.getState().narrativeHistory),
    ].filter((distance): distance is number => distance !== null)

    if (historyDistances.some((distance) => distance < MIN_BRANCH_GAP_ROUNDS)) {
      return true
    }

    return false
  }

  /** 构建 NarrativeHintInput（从当前 orchestrator 状态收集数据） */
  private buildHintInput(): NarrativeHintInput {
    const lifespanData = this.lastSubsystemStates?.['lifespan']?.data as { maxAge?: number } | undefined
    const baseData = this.lastSubsystemStates?.['character-base']?.data as { startingAge?: number } | undefined
    const maxAge = lifespanData?.maxAge ?? 100
    const startingAge = baseData?.startingAge ?? 0
    const currentAge = this.computeNarrativeAge(this.buildRoundContext())

    return {
      currentAge,
      maxAge,
      startingAge,
      round: this.state.totalRounds,
      recentEvents: this.buildYearEvents().map(e => ({ narrative: e.narrative, age: e.age })),
      lastPlayerChoice: this.lastPlayerChoice,
      forceBranch: useEngineStore.getState().forceBranchNext ?? false,
      branchJustResolved: this.branchJustResolved,
      consecutiveSameGoalRounds: this.consecutiveSameGoalRounds,
      timeStep: this.state.timeStep,
      narrativeStyle: this.getNarrativeStyle(),
      lifeStage: resolveLifeStageFromAge(currentAge, maxAge, startingAge),
    }
  }

  private resolveBranchFromParsed(parsed: ParsedNarrative): {
    isBranchPoint: boolean
    branchTitle?: string
    branchOptions?: string[]
  } {
    let options = normalizeNarrativeBranchOptions(parsed.branchOptions)
    let title = parsed.branchTitle?.trim() ?? ''
    let isBranch = isEligibleNarrativeBranch(parsed)

    if (parsed.branch === true && !isBranch) {
      console.warn('[Branch] 已抑制非 HIGH 或选项不完整的普通分叉点')
    }

    if (isBranch && !title) {
      title = '你愿意承担哪一种长期后果？'
    }

    // 连续分叉抑制：如果上一条叙事历史有 resolvedChoice（刚被解决），强制抑制新分叉点
    const lastHistoryEntry = useEngineStore.getState().narrativeHistory[
      useEngineStore.getState().narrativeHistory.length - 1
    ]
    const forceBranchNext = useEngineStore.getState().forceBranchNext
    const shouldSuppressBranch = (lastHistoryEntry?.resolvedChoice || this.shouldSuppressBranchPoint(forceBranchNext)) && !forceBranchNext

    if (shouldSuppressBranch) {
      isBranch = false
    }

    if (forceBranchNext && !isBranch) {
      options = [
        '正面迎击，不留退路',
        '迂回周旋，寻找更好时机',
        '另辟蹊径，改变原有计划',
      ]
      title = '命运分叉：你打算如何抉择？'
      isBranch = true
    }

    if (isBranch) {
      useEngineStore.getState().setForceBranchNext(false)
    }

    return isBranch
      ? { isBranchPoint: true, branchTitle: title, branchOptions: options }
      : { isBranchPoint: false }
  }

  handleNarrativeResponse(content: string): RoundResult {
    const parsed = narrativeParser.parse(content)

    const interceptorOutcome = runNarrativeInterceptors({
      rawContent: content,
      parsed,
      roundSequence: this.state.totalRounds,
      knownSubsystemIds: this.subsystems.map((s) => s.id),
    })

    for (const warning of interceptorOutcome.warnings) {
      console.warn('[NarrativeInterceptor]', warning)
    }

    const effectiveParsed = interceptorOutcome.parsed

    const ageAtRound = this.computeNarrativeAge(this.buildRoundContext())
    const worldConfig = (this.worldSetting?.config ?? {}) as Record<string, unknown>
    const eraStartYear = readEraStartYearFromConfig(worldConfig)
    const birthEraYear = readBirthEraYearFromConfig(worldConfig)
    const calendarYear = resolveCalendarEraYear(this.state.round.year, eraStartYear, birthEraYear)
    const eraLabel = formatEraYear(calendarYear, eraStartYear !== 0 ? '' : this.state.round.eraName)
    const displayTimeLabel = formatNarrativeTimeLabel(this.state.timeStep, eraLabel, this.state.round)

    // P1: 兜底叙事
    let narrative = effectiveParsed.narrative
    if (interceptorOutcome.blocked || !narrative) {
      const lifespanState = this.lastSubsystemStates?.['lifespan']
      const maxAge = (lifespanState?.data as { maxAge?: number } | undefined)?.maxAge ?? DEFAULT_MAX_AGE_FALLBACK
      narrative = narrativeParser.buildFallbackNarrative(this.state.round.year, maxAge)
      if (interceptorOutcome.blocked) {
        console.warn('[NarrativeInterceptor] 已阻断状态提交:', interceptorOutcome.blockReason)
      }
    }

    // 若解析结果仍是原始 JSON，强制再提取 narrative 字段
    const trimmed = narrative.trimStart()
    if (trimmed.startsWith('{') && trimmed.includes('"narrative"')) {
      const reparsed = narrativeParser.parse(content)
      if (reparsed.narrative?.trim()) {
        narrative = reparsed.narrative
      }
    }

    narrative = normalizeNarrativeParagraphs(narrative)

    // 伏笔检测：从新叙事中检测新伏笔（本地关键词 + AI 主动标注）
    if (narrative) {
      const aiMarked = (effectiveParsed as { foreshadowing?: Array<{ type: string; description: string; priority?: number }> }).foreshadowing
      foreshadowing.detectForeshadowing(narrative, this.state.round.year, this.characterState?.age ?? 0, aiMarked)
      // AI 重要性标注：传递给 memoryLifecycle 辅助评分
      const aiImportance = (effectiveParsed as { importance?: 'HIGH' | 'NORMAL' | 'LOW' }).importance
      if (aiImportance) {
        memoryLifecycle.setAIRoundImportance(this.state.round.year, aiImportance)
      }
      const aiArcStatus = (effectiveParsed as { arcStatus?: 'start' | 'ongoing' | 'end' }).arcStatus
      if (aiArcStatus) {
        memoryLifecycle.setAIArcStatus(this.state.round.year, aiArcStatus)
      }
      // 想法1：记录 AI 自述的 digest + keyEvents 到摘要账本（精确重要性主干）
      const parsedDigest = (effectiveParsed as {
        digest?: string
        keyEvents?: Array<{ text: string; importance: number }>
      })
      digestLedger.record({
        round: this.state.round.year,
        digest: parsedDigest.digest,
        keyEvents: parsedDigest.keyEvents,
      })
      // 原创保护：提取 AI 标注的 creations 并累积
      const roundCreations = effectiveParsed.creations
      if (roundCreations?.length) {
        for (const c of roundCreations) {
          // 按 name 去重，避免重复追加
          if (!this.state.characterCreations.some((existing) => existing.name === c.name)) {
            this.state.characterCreations.push({
              name: c.name,
              description: c.description,
              category: c.category as CharacterCreation['category'],
              confirmedRound: this.state.totalRounds,
            })
          }
        }
        // 超出上限时移除最早确认的设定，防止数组无限增长撑爆 prompt 稳定段
        while (this.state.characterCreations.length > MAX_CHARACTER_CREATIONS) {
          this.state.characterCreations.shift()
        }
      }
      // 检查是否回收了已有伏笔
      foreshadowing.checkResolution(narrative, this.state.round.year)
    }

    // 叙事与状态硬分离：仅经 RoundCommit 总线提交变更
    const commitResult = interceptorOutcome.blocked
      ? { committed: [], rejected: [] }
      : this.applyRoundChanges(effectiveParsed.changes, 'narrative')

    const committedChanges = commitResult.committed

    // 更新叙事历史（限制最大长度，超出时移除最旧条目）
    this.state.currentNarrative = narrative
    if (narrative) {
      this.lastNarrativeText = narrative
      const branchMeta = this.resolveBranchFromParsed(effectiveParsed)
      if (branchMeta.isBranchPoint) {
        this.lastBranchTotalRound = this.state.totalRounds
      }
      this.state.narrativeHistory.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        text: narrative,
        isComplete: true,
        timestamp: Date.now(),
        displayAge: ageAtRound,
        displayTimeLabel,
        ...(branchMeta.isBranchPoint
          ? {
              isBranchPoint: true,
              branchTitle: branchMeta.branchTitle,
              branchOptions: branchMeta.branchOptions,
            }
          : {}),
      })
      this.lastNarratedTimeStep = { ...this.state.timeStep }
      // 超出阈值时移除最旧条目，防止内存和存档无限增长
      while (this.state.narrativeHistory.length > MAX_NARRATIVE_HISTORY) {
        this.state.narrativeHistory.shift()
      }
    }

    // 提取结构化世界方向（来自 META 的 direction 字段；MVP 阶段仅透传，不回写世界目标）
    const worldDirection: RoundResult['direction'] =
      effectiveParsed.direction && typeof effectiveParsed.direction === 'object' && !Array.isArray(effectiveParsed.direction)
        ? (effectiveParsed.direction as Record<string, { direction?: string; magnitude?: number }>)
        : undefined

    // 触发回合完成事件
    const result: RoundResult = {
      narrative,
      changes: committedChanges.map((c) => ({
        id: c.id,
        description: c.description,
        changes: c.changes,
      })),
      notableEvents: effectiveParsed.notableEvents,
      direction: worldDirection,
    }
    eventBus.emit('mod-engine:round-complete', result)
    this.publishSimulationSnapshot()

    // 检查是否需要压缩（Phase 6：AI L1–L6 管线）
    this.runCompressionPipeline()

    return result
  }

  // === NarrativeStage 阶段机（#13: 吸收 Factorio Story Script） ===

  /** 缓存的叙事阶段（从 campaigns/ 加载） */
  private _stages: NarrativeStage[] | null = null

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
    if (this._stages) return this._stages

    try {
      const campaign = await import(`@/mods/${modName}/campaigns/${campaignName}`) as {
        loadStages?: (aiConfig: AIModelConfig, promptTemplate: PromptTemplate, sessionId?: string) => NarrativeStage[]
        stages?: NarrativeStage[]
      }
      const stages = campaign.loadStages?.(aiConfig, promptTemplate, sessionId) ?? campaign.stages ?? []
      this._stages = stages
      return stages
    } catch {
      // MOD 没有 campaigns 目录 → 使用空数组（报错，不静默回退）
      console.warn('[Orchestrator] 未找到 campaign 定义，无法执行阶段机')
      this._stages = []
      return []
    }
  }

  /**
   * 执行叙事阶段机
   *
   * 按 stages 数组顺序逐阶段执行。每阶段支持：
   *   - onEnter: 进入阶段时执行一次
   *   - onUpdate: 每轮执行
   *   - shouldProceed: 判断是否可前进（返回 true → 进入下一阶段）
   *   - onExit: 离开阶段时执行一次
   *   - maxRounds: 超时自动推进（替代手动 deadLoopDetector）
   *
   * 吸收 Factorio Story Script 的 init→update→condition→action 模型。
   */
  private async runStageMachine(
    stages: NarrativeStage[],
    context: RoundContext,
  ): Promise<void> {
    if (stages.length === 0) return

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      let roundCount = 0

      // onEnter: 进入阶段时执行一次
      try {
        await stage.onEnter?.(context)
      } catch (e) {
        console.error(`[Orchestrator] 阶段 "${stage.name}" onEnter 失败:`, e)
        continue
      }

      // 循环执行当前阶段直到 shouldProceed 返回 true 或达到 maxRounds
      while (true) {
        roundCount++

        // maxRounds 自动死循环检测
        const maxRounds = stage.maxRounds ?? 100
        if (roundCount > maxRounds) {
          console.warn(
            `[Orchestrator] 阶段 "${stage.name}" 超过 maxRounds=${maxRounds}，强制推进`,
          )
          break
        }

        // onUpdate: 每轮执行
        try {
          await stage.onUpdate?.(context)
        } catch (e) {
          console.error(`[Orchestrator] 阶段 "${stage.name}" onUpdate 失败:`, e)
        }

        // shouldProceed: 判断是否可前进
        try {
          const shouldProceed = stage.shouldProceed
            ? await stage.shouldProceed(context)
            : true // 无 shouldProceed 的阶段只执行一次 onUpdate 就推进
          if (shouldProceed) break
        } catch (e) {
          console.error(`[Orchestrator] 阶段 "${stage.name}" shouldProceed 失败:`, e)
          break
        }
      }

      // onExit: 离开阶段时执行一次
      try {
        await stage.onExit?.(context)
      } catch (e) {
        console.error(`[Orchestrator] 阶段 "${stage.name}" onExit 失败:`, e)
      }
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
    // 从单一来源常量取默认字数，与 Prompt 组装、pre-gen、hooks 共享同一常量
    const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
    const effectiveAiConfig: AIModelConfig = {
      ...aiConfig,
      maxTokens: computeNarrativeMaxTokens(wordCountTarget),
    }
    const stages = await this.loadCampaignStages(effectiveAiConfig, promptTemplate, sessionId)

    // 没有 campaign 阶段定义 → 报错（不应静默回退）
    if (stages.length === 0) {
      console.error('[Orchestrator] 阶段机无可用阶段，回合中止')
      return { narrative: '', changes: [], notableEvents: [] }
    }

    if (this.state.status !== 'running' && this.state.status !== 'idle') {
      return { narrative: '', changes: [], notableEvents: [] }
    }
    if (this.shouldStop()) {
      this.state.status = 'complete'
      return { narrative: '', changes: [], notableEvents: [] }
    }

    this.state.status = 'running'
    this.lastAiConfig = effectiveAiConfig
    this.lastSessionId = sessionId

    // 注入 AI 配置 + 世界观信息到 adaptation 管线
    const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
    const adaptationModel = customModel || effectiveAiConfig.model
    if (!this.isPreviewExecution()) {
      adaptationManager.setAiConfig(
        { ...effectiveAiConfig, model: adaptationModel },
        sessionId,
        {
          providerId: provider,
          apiKey: customKey || undefined,
          customBaseUrl: customUrl || undefined,
          customModel: adaptationModel,
        },
      )
      if (this.worldSetting) {
        const config = this.worldSetting.config
        const essenceTag = typeof config.essenceTag === 'string' ? config.essenceTag : this.worldSetting.description.slice(0, 30)
        adaptationManager.setWorldviewText(essenceTag, this.worldSetting.description)
      }
    }

    const context = this.buildRoundContext()

    // Instrument: onRoundStart
    if (isInstrumentEnabled()) {
      getInstrumentHooks().onRoundStart?.(this.state.totalRounds)
    }
    const roundT0 = performance.now()

    // 使用阶段机驱动回合管线
    await this.runStageMachine(stages, context)

    // Instrument: onRoundEnd
    if (isInstrumentEnabled()) {
      getInstrumentHooks().onRoundEnd?.(this.state.totalRounds, performance.now() - roundT0)
    }

    // 构建结果（从阶段机执行后的状态中提取）
    const result: RoundResult = {
      narrative: this.state.currentNarrative || this.buildFallbackNarrativeFromState(),
      changes: [],
      notableEvents: this.lastNotableEvents ?? [],
    }

    // 后台异步适配（不阻塞主叙事流）：将子系统硬编码 summary 适配为世界观贴切的叙事文本
    const pendingStates = Object.entries(this.lastSubsystemStates)
      .filter(([id]) => id !== this.id && isMvpPromptSubsystem(id))
      .map(([id, s]) => ({ id, summary: s.summary }))
    if (!this.isPreviewExecution()) {
      adaptationManager.adaptPending(pendingStates).catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Adaptation] 后台适配异常:', (err as Error)?.message ?? err)
        }
      })
    }

    return result
  }
}

/** 单例 */
export const orchestrator = new OrchestratorSystem()
