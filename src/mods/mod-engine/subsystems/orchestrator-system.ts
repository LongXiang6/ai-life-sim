/**
 * @module orchestrator-system.ts
 * @description 引擎编排子系统 —— 协调各子系统，执行完整模拟主循环（含本地模拟、事件追踪、跨域联动、安全检查）
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
 *  10. 世界方向修正 (MVP 暂停；未来段由存活子系统重新接入)
 *  11. 检测死亡并触发死后尾声 (PostDeathEpilogueSystem)
 *  12. 检查叙事压缩 (SummaryCompressor)
 *  13. 触发回合完成事件 (EventBus)
 */

import { BaseSubsystem, eventBus, callAIWithPromptTemplate, buildSegmentedPrompt, getNarrativeUserSegments } from '@/core'
import { isInstrumentEnabled, getInstrumentHooks } from '@/core/instrument/instrument-mode'
import type { NarrativeStage, YearEvent } from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'
import { saveManager } from '@/core/storage/save-manager'
import {
  adaptationManager,
  DEFAULT_ENGINE_CONFIG,
  USE_AI_SUMMARY_COMPRESSION,
  getWorldRules,
  buildWordCountInstruction,
  buildStyleInstruction,
  resolveNarrativeToneHint,
  buildEventInjectionText,
  buildTimeBridgeSummary,
  extractBridgeSnapshot,
  WorldEventBus,
  globalDeadLoopDetector,
  sanitizeSubSystemState,
  buildNarrativeCoherenceHeader,
  buildNarrativeWorldRules,
  collectActiveModWorldRules,
  isSubsystemOpenForPrompt,
  isMvpNarrativeChangeSubsystem,
  isMvpPromptSubsystem,
  isMvpRuntimeSubsystem,
  buildMvpSubsystemGuide,
  resolveTimeStep,
  shouldAlignTimeStepTransition,
  mapSubsystemStatesToDetectionStates,
  buildLifeStageNarrativeHint,
  resolveLifeStageFromAge,
  normalizeNarrativeParagraphs,
  buildNarrativeHints,
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
  collectGameSavePayload,
  computeNarrativeMaxTokens,
  DEFAULT_WORD_COUNT_TARGET,
  RECENT_NARRATIVE_WINDOW,
  simulationBridge,
  TimeSystem,
  timeSystem,
  narrativeParser,
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

import { buildPowerCeilingPresetsForNarrative } from '@/mods/mod-world'
import { buildCalendarNarrativeContext } from '../helpers/calendar-narrative-context'
import {
  isEligibleNarrativeBranch,
  normalizeNarrativeBranchOptions,
} from '../helpers/narrative-branch-policy'
import {
  createNeutralNarrativeSemanticSignals,
  type NarrativeIntentResolution,
} from '../helpers/narrative-semantic-signals'
import {
  buildBranchIntentInstruction,
  commitBranchIntentResolution,
  findFocusedBranchIntent,
  findMostRecentlyUpdatedBranchIntentId,
  upsertBranchIntent,
  validateIntentResolutionForState,
  type BranchIntentState,
} from '../helpers/branch-intent-resolution'
import { getSeasonForMonth } from '../helpers/calendar-season.js'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
} from '../helpers/narrative-ai-input-view'
import { AI_CREATION_CATEGORIES } from '../helpers/narrative-ai-protocol'
import {
  compileNarrativeDynamicComponents,
} from '../prompts/narrative-prompt-components'
import type { NarrativePromptComponent } from '../helpers/narrative-prompt-component-types'

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
/** 普通命运分支最小间隔。强制分支不受此限制。 */
const MIN_BRANCH_GAP_ROUNDS = 4

function formatEquippedMythicPatternForPrompt(pattern: {
  name: string
  concept: string
  effect: string
} | null | undefined): string | undefined {
  if (!pattern) return undefined
  const effect = pattern.effect.trim()
  if (!effect) return undefined

  const name = pattern.name.trim() || '未命名神话命格'
  const concept = pattern.concept.trim()
  return `【已装备神话命格·每轮遵守】${name}${concept ? `（${concept}）` : ''}：${effect}`
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
  return `【普通命格·每轮遵守】${rows.join('；')}`
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

/** 预生成/快照：编排器可恢复状态 */
export interface OrchestratorSnapshot {
  state: EngineState
  lastSubsystemStates: Record<string, SubSystemState>
  eventLifecycle: EventLifecycleTracker
  lastNotableEvents: string[]
  prevAbbreviationSnapshot: Record<string, string>
  prevRoundYear: number
  prevBridgeSnapshot: BridgeSnapshot
  /** 本次叙事开始前的时间节点；用于给 Prompt 提供真实的起止窗口。 */
  previousNarrativeRound?: RoundInfo
  lastNarrativeText: string
  totalBreakthroughs: number
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
  lastBranchTotalRound?: number
  lastCommittedPlayerChoice?: string
  branchIntents?: BranchIntentState[]
  focusedBranchIntentId?: string
  prefetchedNarrativeContent?: string | null
  digestLedgerSnapshot?: DigestLedgerSnapshot
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
    'status' | 'streamingNarrative' | 'narrativeError'
  >
  subsystemPreviewStates: Record<string, unknown>
}

type RuntimeManagedSubsystem = ISubSystem & {
  hydrateFromStore?: () => void
  restoreCollectedState?: (snapshot: unknown) => void
  capturePreviewState?: () => unknown
  restorePreviewState?: (snapshot: unknown) => void
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
    round: { year: 0, season: getSeasonForMonth(0), month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
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
  /** 流式原始协议缓冲；UI 只接收其中已解析出的正文增量。 */
  private rawNarrativeStream = ''

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

  /** 已加载 MOD 清单；组装 Prompt 时再按实际运行绑定过滤规则。 */
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
  private lastNarrativeText = ''

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

  /** 最近一次生成分支的总轮次；预生成快照也依赖它判断普通分支冷却。 */
  private lastBranchTotalRound = Number.NEGATIVE_INFINITY

  /** 缓存的上轮玩家选择（用于进度对比） */
  private lastCommittedPlayerChoice?: string

  /** 所有尚未进入终态的命运选择；不得因新分支或容量压力静默丢失。 */
  private branchIntents: BranchIntentState[] = []

  /** 本轮主叙事必须评估并推进的命运意图。 */
  private focusedBranchIntentId?: string

  /** 预生成缓存：跳过 AI 叙事阶段 */
  private prefetchedNarrativeContent: string | null = null

  /** 最近一次 AI 原始 JSON 输出（预生成队列用） */
  private lastExecutedFullContent: string | null = null

  /** 本轮已到期但尚未在有效叙事提交中确认兑现的因果事项。 */
  private pendingNarrativeCausalEventIds: string[] = []

  /** 预生成/预览执行深度：只允许临时推进到 AI 输出，不提交真实副作用 */
  private previewExecutionDepth = 0

  /** 真实回合异步摘要压缩；下一次推进/预生成/读档前必须等待其提交完成。 */
  private pendingCompression: Promise<void> | null = null

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
      [memoryLifecycle.id, memoryLifecycle],
      [memoryForgetting.id, memoryForgetting],
      [plotStructure.id, plotStructure],
      [foreshadowing.id, foreshadowing],
      [coreMemory.id, coreMemory],
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
      [memoryLifecycle.id, memoryLifecycle],
      [memoryForgetting.id, memoryForgetting],
      [plotStructure.id, plotStructure],
      [foreshadowing.id, foreshadowing],
      [coreMemory.id, coreMemory],
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
      return
    }
    this.subsystems.push(subsystem)
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
  advanceAllSubsystems(): void {
    this.advanceSubsystems(this.buildRoundContext())
  }

  /** 三回合收集所有子系统状态（供 stage 闭包使用） */
  collectAllSubsystemStates(recordRelevance = true): void {
    this.collectSubsystemStates(false, recordRelevance)
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
    this.rawNarrativeStream = ''
    this.state.currentNarrative = ''
  }

  /** 追加原始流式块，但只把正文区增量交给 UI，协议标记与数据区不显示。 */
  appendNarrativeChunk(chunk: string): void {
    this.rawNarrativeStream += chunk
    const visibleNarrative = narrativeParser.parsePartial(this.rawNarrativeStream)
    if (!visibleNarrative) return

    const previous = this.state.currentNarrative
    if (visibleNarrative.startsWith(previous)) {
      const delta = visibleNarrative.slice(previous.length)
      this.state.currentNarrative = visibleNarrative
      if (delta && this.onNarrativeChunk) {
        this.onNarrativeChunk({ text: delta, isComplete: false, timestamp: Date.now() })
      }
      return
    }

    this.state.currentNarrative = visibleNarrative
    if (this.onNarrativeChunk) {
      this.onNarrativeChunk({ text: '', isComplete: false, isReset: true, timestamp: Date.now() })
      this.onNarrativeChunk({ text: visibleNarrative, isComplete: false, timestamp: Date.now() })
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

  private focusMostRecentlyUpdatedBranchIntent(): void {
    this.focusedBranchIntentId = findMostRecentlyUpdatedBranchIntentId(this.branchIntents)
  }

  resolveBranchChoice(branchId: string, choice: string): void {
    const trimmed = choice.trim()
    if (!branchId || !trimmed) return

    this.state.narrativeHistory = this.state.narrativeHistory.map((entry) =>
      entry.id === branchId ? { ...entry, resolvedChoice: trimmed } : entry,
    )
    this.lastBranchTotalRound = Math.max(this.lastBranchTotalRound, this.state.totalRounds)
    this.branchJustResolved = true

    const next = upsertBranchIntent(this.branchIntents, branchId, trimmed, this.state.totalRounds)
    this.branchIntents = next.intents
    this.focusedBranchIntentId = next.focusedIntentId
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
      previousNarrativeRound: this.previousNarrativeRound,
      lastNarrativeText: this.lastNarrativeText,
      totalBreakthroughs: this.totalBreakthroughs,
      timeRound: timeSystem.exportRound(),
      lastNarratedTimeStep: this.lastNarratedTimeStep,
      lastTimeStepAlignment: this.lastTimeStepAlignment,
      lastAiConfig: this.lastAiConfig,
      lastSessionId: this.lastSessionId,
      lastExecutedFullContent: this.lastExecutedFullContent,
      lastPlayerChoice: this.lastPlayerChoice,
      consecutiveSameGoalRounds: this.consecutiveSameGoalRounds,
      branchJustResolved: this.branchJustResolved,
      lastBranchTotalRound: this.lastBranchTotalRound,
      lastCommittedPlayerChoice: this.lastCommittedPlayerChoice,
      branchIntents: this.branchIntents,
      focusedBranchIntentId: this.focusedBranchIntentId,
      prefetchedNarrativeContent: this.prefetchedNarrativeContent,
      digestLedgerSnapshot: digestLedger.toSnapshot(),
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
      orchestrator: this.captureSnapshot(),
      pendingTimeStepAlignmentFromUnit: this.pendingTimeStepAlignmentFromUnit,
      pendingTimeStepAlignmentFromValue: this.pendingTimeStepAlignmentFromValue,
      characterStoreRuntime: {
        age: characterStore.age,
      },
      engineStoreRuntime: {
        status: engineStore.status,
        streamingNarrative: engineStore.streamingNarrative,
        narrativeError: engineStore.narrativeError,
      },
      subsystemPreviewStates: this.captureSubsystemPreviewStates(),
    }
  }

  /** 恢复预览会改写、但 EngineStore 不保存的 orchestrator 运行态。 */
  private restoreSnapshotRuntimeState(snap: OrchestratorSnapshot): void {
    this.lastSubsystemStates = structuredClone(snap.lastSubsystemStates ?? {})
    this.restoreSubsystemsFromCollectedStates(this.lastSubsystemStates)
    this.eventLifecycle = structuredClone(snap.eventLifecycle ?? {})
    this.lastNotableEvents = [...(snap.lastNotableEvents ?? [])]
    this.prevAbbreviationSnapshot = { ...(snap.prevAbbreviationSnapshot ?? {}) }
    this.prevRoundYear = snap.prevRoundYear ?? this.state.round.year
    this.prevBridgeSnapshot = structuredClone(snap.prevBridgeSnapshot ?? {})
    this.previousNarrativeRound = {
      ...(snap.previousNarrativeRound ?? snap.state.round ?? this.state.round),
    }
    this.lastNarrativeText = snap.lastNarrativeText ?? ''
    this.totalBreakthroughs = snap.totalBreakthroughs ?? 0
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
    this.lastBranchTotalRound = snap.lastBranchTotalRound ?? Number.NEGATIVE_INFINITY
    this.lastCommittedPlayerChoice = snap.lastCommittedPlayerChoice
    this.branchIntents = Array.isArray(snap.branchIntents)
      ? structuredClone(snap.branchIntents)
      : []
    this.focusedBranchIntentId = snap.focusedBranchIntentId
    if (!this.getFocusedBranchIntentRuntime()) {
      this.focusMostRecentlyUpdatedBranchIntent()
    }
    this.prefetchedNarrativeContent = snap.prefetchedNarrativeContent ?? null
    digestLedger.loadSnapshot(snap.digestLedgerSnapshot)
  }

  restoreSnapshot(snap: OrchestratorSnapshot): void {
    this.state = structuredClone(snap.state)
    this.restoreSnapshotRuntimeState(snap)
    // 旧存档可能保留了按旧规则计算的 season；以月份重新推导当前节点，
    // 但不改写历史叙事条目的时间标签。
    timeSystem.importRound(snap.timeRound ?? this.state.round)
    this.state.round = timeSystem.getRound()
    summaryCompressor.restoreFromEngineState(this.state.compressedSummaries, this.state.compressionStats)
    coreMemory.hydrateFromStore()
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
    this.restoreSnapshotRuntimeState(snap.orchestrator)
    this.restoreSubsystemPreviewStates(snap.subsystemPreviewStates)
    this.hydrateFromEngineStore(snap.orchestrator.state.timeStep, true)
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
  private collectSubsystemStates(
    refreshContext = false,
    recordRelevance = true,
  ): Record<string, SubSystemState> {
    const context = this.buildRoundContext()
    const states: Record<string, SubSystemState> = {}

    // 这两项是 mod-engine 内部叙事运行态，不进入外部子系统状态卡，
    // 但必须随每个真实/预生成回合推进，才能让阶段与伏笔计时保持有效。
    for (const subsystem of [plotStructure, foreshadowing]) {
      try {
        subsystem.collectState(context)
      } catch (error) {
        console.error(`[Orchestrator] 内部叙事系统 ${subsystem.id} 推进失败:`, error)
      }
    }

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
        if (!this.isPreviewExecution() && recordRelevance) {
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

    // 10. 记忆生命周期：消费 AI 结构化重要度与事件弧状态
    if (result.narrative) {
      const importanceResult = memoryLifecycle.scoreImportance(
        result.narrative,
        this.state.totalRounds,
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
    if (this.state.status !== 'running' && this.state.status !== 'complete') return

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

  /** Phase 6：L1–L6 AI 压缩 + 记忆生命周期索引 */
  private runCompressionPipeline(): void {
    if (!USE_AI_SUMMARY_COMPRESSION) return
    if (this.isPreviewExecution()) return
    if (!this.lastAiConfig || !this.worldSetting || !this.characterState) return
    if (this.pendingCompression) return

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
      })
      .catch((err) => {
        console.error('[Orchestrator] 叙事压缩失败:', err)
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

  /**
   * 组装主叙事三层消息中的“记忆”层。
   * 长期覆盖摘要在前，只在成功压缩时变化；相关往事与近期完整原文在后，
   * 从而让同一摘要版本下的请求尽量复用相同前缀。
   */
  private buildPromptMemoryLayers(): {
    longTermMemory?: string
    relevantMemory?: string
    recentNarrativeMemory?: string
  } {
    const richContext = memoryLifecycle.buildRichPrompt(
      '',
      this.state.narrativeHistory.slice(-RECENT_NARRATIVE_WINDOW).map((n) => n.text),
      summaryCompressor.getSummaries(),
    )

    const longTermMemory = memoryLifecycle.formatLongTermMemoryForInjection(richContext)
    const retrievedMemory = memoryLifecycle.formatRetrievedMemoryForInjection(richContext)
    const ledgerLines = digestLedger.selectForPrompt(this.state.totalRounds)
    const ledgerMemory = ledgerLines.length > 0
      ? ['【往事回响】', ...ledgerLines].join('\n')
      : ''
    const relevantMemory = [retrievedMemory, ledgerMemory].filter(Boolean).join('\n\n')
    const recentNarrativeMemory = memoryLifecycle.formatRecentNarrativesForInjection(richContext)

    return {
      longTermMemory: longTermMemory || undefined,
      relevantMemory: relevantMemory || undefined,
      recentNarrativeMemory: recentNarrativeMemory || undefined,
    }
  }

  getCompressedNarrativeHistory(): string {
    // 使用记忆生命周期系统构建富Prompt上下文
    // DS V4 1M上下文：5个压缩层级 + L0原文 + 状态卡 + 检索命中

    const summaries = summaryCompressor.getSummaries()
    const recentTexts = this.state.narrativeHistory
      .slice(-RECENT_NARRATIVE_WINDOW)
      .map((n) => n.text)

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
    for (const subsystem of this.subsystems) {
      try {
        subsystem.reset()
      } catch (error) {
        console.warn(`[Orchestrator] 子系统 ${subsystem.id} 重置失败:`, error)
      }
    }
    timeSystem.reset()
    this.state = {
      status: 'idle',
      round: { year: 0, season: getSeasonForMonth(0), month: 0, day: 0, dayOfYear: 1, totalDays: 0, ...TimeSystem.resolveDisplayEra(0) },
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
    this.rawNarrativeStream = ''
    this.eventLifecycle = {}
    this.totalBreakthroughs = 0
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
    this.lastNarrativeText = ''
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
    this.focusedBranchIntentId = undefined
    this.pendingNarrativeCausalEventIds = []
    this.consecutiveSameGoalRounds = 0
    this.branchJustResolved = false
    this.lastBranchTotalRound = Number.NEGATIVE_INFINITY
    this.prefetchedNarrativeContent = null
    this.worldSetting = null
    this.characterState = null
    this.worldEventBus.reset()
    narrativeParser.reset()
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
    adaptationManager.clear()
    globalDeadLoopDetector.resetAll()
  }

  /** 读档后从 EngineStore 恢复 orchestrator 内部状态 */
  hydrateFromEngineStore(previousTimeStep?: TimeStep, preserveAdaptationCache = false): void {
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
    this.branchIntents = []
    this.focusedBranchIntentId = undefined
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
    if (store.narrativeHistory.length > 0) {
      this.lastNarrativeText = store.narrativeHistory[store.narrativeHistory.length - 1]?.text ?? ''
    }
    this.hydrateSubsystemsFromStores()
    summaryCompressor.restoreFromEngineState(store.compressedSummaries, store.compressionStats)
    coreMemory.hydrateFromStore()
    if (!preserveAdaptationCache) adaptationManager.clear()
    if (this.state.status !== 'complete') this.start()
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
    // 获取适配后的 summaries（adaptation 管线：缓存命中用适配文本，未命中用原始文本）
    const rawStateSummaries = Object.values(relevantStates)
      .filter((s) => s.id !== this.id && isSubsystemOpenForPrompt(s, s.id))
      .map((s) => ({ id: s.id, summary: s.summary }))
      .filter((s) => s.summary)
    const adaptedMap = adaptationManager.getAdaptedSummaries(rawStateSummaries)

    const summaries: string[] = rawStateSummaries
      .map((s) => adaptedMap.get(s.id) ?? s.summary)

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
      plotStructure.getConsecutiveConflictRounds(),
    )
    // 寿命提醒：告知 AI 角色当前寿命阶段约束
    const lifespanReminder = buildLifespanReminder(maxAge, syncedCharacter.age)

    // 按生命周期和顺序装配动态写作组件；未触发组件不进入本轮消息。
    const dynamicGuidanceSources: Array<{
      id: string
      content: string | undefined
      order: number
      kind: NarrativePromptComponent['kind']
      authority: NarrativePromptComponent['authority']
    }> = [
      { id: 'round-coherence', content: coherenceHeader, order: 10, kind: '硬限制', authority: '世界与协议' },
      { id: 'life-stage', content: lifeStageHint, order: 20, kind: '硬限制', authority: '当前事实' },
      { id: 'event-archetype', content: archetypeHint, order: 30, kind: '写作规则', authority: '剧情引导' },
      { id: 'lifespan-reminder', content: lifespanReminder, order: 40, kind: '硬限制', authority: '当前事实' },
      { id: 'influence-boundary', content: influenceText, order: 50, kind: '硬限制', authority: '当前事实' },
      { id: 'recent-system-changes', content: slidingWindowText, order: 60, kind: '流程指令', authority: '当前事实' },
      { id: 'npc-network', content: coreMemory.buildNPCNetworkText(), order: 70, kind: '流程指令', authority: '当前事实' },
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

    const calibrationRaw = this.worldSetting?.config?._calibration as
      | { styleGuide?: { narrativeTone?: string } }
      | undefined
    const narrativeToneHint = resolveNarrativeToneHint(
      calibrationRaw?.styleGuide?.narrativeTone,
    )

    const userInstruction = this.buildUserInstruction()
    const mythicPatternText = formatEquippedMythicPatternForPrompt(
      useCharacterStore.getState().equippedMythicPattern,
    )
    const destinyPatternText = formatDestinyPatternsForPrompt(
      getDestinyPatternSystem().getPatterns(),
      isOpeningNarrativeRound,
    )

    // 构建轻量 worldSetting（剥离每轮不变的静态参数，减少 Token 浪费）
    // aiDetailedParameters（43字段，~2000字符）在世界初始化后不再变化，每轮重复发送无意义
    const lightWorldSetting = this.buildLightWorldSetting(narrativeTime.eraLabel)
    const worldNarrativeView = projectWorldSettingForNarrativeAI(lightWorldSetting)
    const characterNarrativeView = projectCharacterForNarrativeAI(syncedCharacter)
    const promptMemory = this.buildPromptMemoryLayers()

    // 非超凡世界不重复发送无关的 24 阶力量表；有力量体系时使用现有叙事精简格式。
    const powerSystemTag = typeof config.powerSystemTag === 'string' ? config.powerSystemTag : ''
    const powerCeiling = Number(config.powerCeiling)
    const powerCeilingPresets = powerSystemTag === 'none' || !Number.isFinite(powerCeiling) || powerCeiling <= 1
      ? undefined
      : buildPowerCeilingPresetsForNarrative(powerCeiling)
    const timeScaleHint = buildTimeScaleNarrativeHint(this.state.timeStep)
    const previousCalendarYear = resolveCalendarEraYear(
      this.previousNarrativeRound.year,
      readEraStartYearFromConfig(config),
      readBirthEraYearFromConfig(config),
    )
    const calendarNarrativeContext = buildCalendarNarrativeContext({
      timeStep: this.state.timeStep,
      calendarYear: narrativeTime.calendarYear,
      month: this.state.round.month + 1,
      day: this.state.round.day + 1,
      previousNode: {
        calendarYear: previousCalendarYear,
        month: this.previousNarrativeRound.month + 1,
        day: this.previousNarrativeRound.day + 1,
      },
      daysPassed: timeSystem.getDaysPassed(),
      timeStepAlignment: this.lastTimeStepAlignment,
    })
    const triggeredCausality = causalDelay.checkCausalTrigger(this.state.totalRounds)
    this.pendingNarrativeCausalEventIds = triggeredCausality.triggeredEvents.map((event) => event.id)

    const assembled: PromptContext = {
      worldNarrativeView,
      characterProfileView: characterNarrativeView.profile,
      characterStatusView: characterNarrativeView.status,
      currentTime: narrativeTime.timeLabel,
      subsystemSummaries: summaries,
      narrativeHistory: this.state.narrativeHistory.slice(-20).map((n) => n.text),
      eventInjectionText: eventInjectionText || undefined,
      causalChainHint: triggeredCausality.narrativeText || undefined,
      timeBridgeSummary: buildTimeBridgeSummary(this.buildTimeBridgeInput()) || undefined,
      systemChangeSummary: systemChangeSummary || undefined,
      narrativeGuidanceText: narrativeGuidanceText || undefined,
      plotStructureText: plotStructure.buildPhaseGuidance() || undefined,
      foreshadowingText: foreshadowing.buildForeshadowingText() || undefined,
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
      talents: [destinyPatternText, mythicPatternText].filter(Boolean).join('\n') || undefined,
      longTermMemory: promptMemory.longTermMemory,
      relevantMemory: promptMemory.relevantMemory,
      recentNarrativeMemory: promptMemory.recentNarrativeMemory,
      coreMemory: coreMemory.buildCoreMemory() || undefined,
      // 从单一来源常量取默认字数，避免散落硬编码回退
      wordCountInstruction: buildWordCountInstruction(useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET),
      calibrationSummary: (this.worldSetting?.config?._calibrationSummary as string) || undefined,
      creationProtectionText: this.buildCreationProtectionText(),
      userInstruction,
      powerCeilingPresets,
    }

    if (isOpeningNarrativeRound) {
      const firstRoundInstruction = isBirthOpeningRound
        ? '【出生开场】只写出生当日或前后短时段：用婴儿可感知的细节建立家庭处境与时代环境；禁止跨到翻身、爬行、学步或说话。当前年龄由时间系统派生；没有永久数值变化时省略状态变更。'
        : '人生记录开场：从当前年龄附近的具体场景建立身份、家世、环境与社会位置，不概述此前整段人生。'
      assembled.userInstruction = assembled.userInstruction
        ? `${assembled.userInstruction}\n\n${firstRoundInstruction}`
        : firstRoundInstruction
    }

    // 只注入当前实际开放且可由叙事写入的字段，避免延后系统进入 Prompt。
    const activeSubsystemGuide = buildMvpSubsystemGuide(promptOpenIds)
    if (activeSubsystemGuide) assembled.subsystemGuideText = activeSubsystemGuide

    // 每轮动态时间导演提示放在 FAST 段末尾，避免污染 STABLE 前缀缓存。
    assembled.timeGuideText = [
      timeScaleHint,
      calendarNarrativeContext,
    ].filter(Boolean).join('\n')

    if (isInstrumentEnabled()) {
      const mem = [
        assembled.longTermMemory,
        assembled.relevantMemory,
        assembled.recentNarrativeMemory,
      ].filter(Boolean).join('\n')
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
    const digestByRound = new Map(
      digestLedger.getEntries().map((entry) => [entry.round, entry.digest.trim()]),
    )
    return memoryLifecycle.getTaggedEvents()
      .filter((e) => {
        const calendarYear = e.calendarYear ?? e.round
        return calendarYear > fromYear && calendarYear <= toYear
      })
      .map((e) => digestByRound.get(e.round) || e.narrative.trim())
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
   * 构建原创保护文本（注入 STABLE KV Cache 段）
   * 从 characterCreations 生成硬性约束，禁止 AI 将角色原创改写为遗迹来源
   */
  private buildCreationProtectionText(): string | undefined {
    const creations = this.state.characterCreations
    if (!creations.length) return undefined
    const lines = creations.map((c) => {
      const category = AI_CREATION_CATEGORIES.internalToAI[
        c.category as keyof typeof AI_CREATION_CATEGORIES.internalToAI
      ] ?? '其他'
      return `- [${category}] ${c.name}：${c.description}（第${c.confirmedRound}轮开创）`
    })
    return [
      '【原创保护（硬性约束）】以下为角色亲自开创的内容，其来源是角色自身的创造力。',
      '严禁在后续叙事中将其改写为「遗迹发现」「古人传承」「秘境所得」「他人遗留」等外部来源。',
      '若需描写这些内容的发展，应侧重于角色的自我完善、突破或传道授业，而非发掘古人遗产。',
      ...lines,
    ].join('\n')
  }

  /**
   * 构建角色影响力文本（五维过滤：力量等级 → 叙事因果影响范围）
   */
  private buildInfluenceText(): string | undefined {
    const totalPower = subsystemRelevance.calculateTotalPower(this.lastSubsystemStates)
    const scope = subsystemRelevance.getInfluenceScope(totalPower)
    return subsystemRelevance.buildInfluenceText(totalPower, scope)
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
    if (hasFreshPlayerChoice) {
      this.lastBranchTotalRound = Math.max(this.lastBranchTotalRound, this.state.totalRounds)
    }

    // 信息优先级：开场叙事注入
    if (this.state.narrativeHistory.length === 0) {
      addComponent('opening-information-priority', INFORMATION_PRIORITY_RULE, '硬限制', '世界与协议')
    }

    // 动态 hints（移植自废弃项目 buildNarrativeRoundPrompt）
    const hints = buildNarrativeHints(this.buildHintInput())
    if (hints.mandatory.length > 0) {
      addComponent('mandatory-round-hints', `【本轮必须遵守】${hints.mandatory.join('。')}`, '硬限制', '当前事实')
    }
    if (hints.optional.length > 0) {
      addComponent('optional-round-hints', `【本轮参考建议】${hints.optional.join('。')}`, '写作规则', '剧情引导')
    }

    const focusedIntent = this.getFocusedBranchIntentRuntime()
    if (focusedIntent) {
      const otherActiveIntents = this.branchIntents.filter(
        (intent) => intent.intentId !== focusedIntent.intentId,
      )
      addComponent(
        'focused-branch-intent',
        buildBranchIntentInstruction(focusedIntent, otherActiveIntents),
        '流程指令',
        '玩家意图',
      )
    } else {
      addComponent(
        'no-focused-branch-intent',
        '【命运意图条件】本轮没有玩家命运意图，禁止输出“命运意图判定”字段；不要从标准示例复制条件字段。',
        '流程指令',
        '玩家意图',
      )
    }

    // 原有逻辑
    if (useEngineStore.getState().forceBranchNext) {
      addComponent('forced-branch', '【强制分支】本轮必须将“命运分支”设为真，并提供“分支标题”与二至四个字符串“分支选项”；正文在抉择前结束，不要替玩家做决定。')
    }
    if (this.lastPlayerChoice) {
      addComponent('fresh-player-choice', `【玩家选择】${this.lastPlayerChoice}`)
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
      addComponent('resolved-branch-history', `【历史分支选择】${resolvedLines.join('；')}`, '流程指令', '当前事实')
    }

    // 连续分叉抑制：上轮已解决分支，本轮禁止再生成新分支
    const lastEntry = this.state.narrativeHistory[this.state.narrativeHistory.length - 1]
    if (lastEntry?.resolvedChoice) {
      addComponent('branch-cooldown-after-choice', '上轮已完成命运抉择，本轮禁止生成新的命运分支，给玩家至少一轮消化时间。', '硬限制', '当前事实')
    } else if (this.shouldSuppressBranchPoint(false)) {
      addComponent('branch-cooldown', `普通命运分支冷却中：距离上一次分支不足 ${MIN_BRANCH_GAP_ROUNDS} 轮，本轮禁止生成命运分支。`, '硬限制', '当前事实')
    }
    return compileNarrativeDynamicComponents(components)
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
    const options = normalizeNarrativeBranchOptions(parsed.branchOptions)
    let title = parsed.branchTitle?.trim() ?? ''
    let isBranch = isEligibleNarrativeBranch(parsed)

    if (parsed.branch === true && !isBranch) {
      console.warn('[Branch] 已抑制未满足 HIGH、不可逆命运语义或有效选项要求的分叉点')
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

    if (isBranch) {
      useEngineStore.getState().setForceBranchNext(false)
    }

    return isBranch
      ? { isBranchPoint: true, branchTitle: title, branchOptions: options }
      : { isBranchPoint: false }
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
    if (result.terminal) {
      this.consecutiveSameGoalRounds = 0
    } else {
      this.consecutiveSameGoalRounds = Math.max(1, this.consecutiveSameGoalRounds + 1)
    }

    return result.committed
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
      narrative = this.buildFallbackNarrativeFromState()
      if (interceptorOutcome.blocked) {
        console.warn('[NarrativeInterceptor] 已阻断状态提交:', interceptorOutcome.blockReason)
      }
    }

    // 若解析结果仍是原始对象文本，强制再提取中文正文字段
    const trimmed = narrative.trimStart()
    if (trimmed.startsWith('{') && trimmed.includes('"正文"')) {
      const reparsed = narrativeParser.parse(content)
      if (reparsed.narrative?.trim()) {
        narrative = reparsed.narrative
      }
    }

    narrative = normalizeNarrativeParagraphs(narrative)

    const focusedIntentBeforeCommit = this.getFocusedBranchIntentRuntime()
    const intentResolutionError = focusedIntentBeforeCommit
      ? validateIntentResolutionForState(focusedIntentBeforeCommit, effectiveParsed.intentResolution)
      : undefined
    if (!focusedIntentBeforeCommit && effectiveParsed.intentResolution) {
      // 条件字段误复制不会获得任何写入权限；仅丢弃该字段，保留本轮合法正文、摘要、
      // 语义和分支，避免标准示例的条件字段复制把整个分支结果拖成推理错误。
      console.warn('[BranchIntent] 当前没有玩家命运意图，禁止提交 intentResolution')
    }
    if (intentResolutionError) {
      console.warn('[BranchIntent] 本轮 META 未通过命运意图契约:', intentResolutionError)
    }

    // 状态变更先做整包预检与提交。命运意图契约也是完整 META 的一部分；
    // 任一失败都不得先写入子系统。若意外出现部分写入失败，立即恢复提交前快照。
    const narrativeCommitSnapshot = this.captureSubsystemPreviewStates()
    let commitResult = interceptorOutcome.blocked || intentResolutionError
      ? { committed: [], rejected: [] }
      : this.applyRoundChanges(effectiveParsed.changes, 'narrative')
    if (commitResult.rejected.length > 0) {
      this.restoreSubsystemPreviewStates(narrativeCommitSnapshot)
      console.warn('[RoundCommit] 本轮叙事变更未能完整提交，已回滚并整包拒绝 META')
      commitResult = { committed: [], rejected: commitResult.rejected }
    }
    const committedChanges = commitResult.committed
    const stateChangeBundleAccepted = commitResult.rejected.length === 0
      && committedChanges.length === effectiveParsed.changes.length

    // 数据区只有在完整 Schema、命运意图和状态变更整包都通过时才可消费。
    const structuredDataAccepted = !interceptorOutcome.blocked
      && stateChangeBundleAccepted
      && intentResolutionError === undefined
      && effectiveParsed.metadataRejected !== true
      && effectiveParsed.structuredDataPresent === true
    const hasValidatedSemanticMetadata = structuredDataAccepted
      && effectiveParsed.semanticSignals !== undefined
    if (narrative) {
      const semanticSignals = hasValidatedSemanticMetadata
        ? effectiveParsed.semanticSignals!
        : createNeutralNarrativeSemanticSignals()
      const roundSequence = this.state.totalRounds
      const structuredKeyEvents = structuredDataAccepted && Array.isArray(effectiveParsed.keyEvents)
        ? effectiveParsed.keyEvents.filter((event): event is {
            text: string
            importance: number
            entities?: string[]
          } => typeof event === 'object' && event !== null && typeof event.text === 'string')
        : []

      plotStructure.recordNarrativeSignals(semanticSignals)
      digestLedger.record({
        round: roundSequence,
        importance: structuredDataAccepted ? effectiveParsed.importance : undefined,
        digest: effectiveParsed.digest,
        keyEvents: structuredKeyEvents,
      })

      if (structuredDataAccepted) {
        foreshadowing.detectForeshadowing(
          roundSequence,
          this.characterState?.age ?? 0,
          effectiveParsed.foreshadowing,
        )

        const causalKeys = new Set(
          causalDelay.getCausalEvents().map((existing) =>
            `${existing.type}\u0000${existing.round}\u0000${existing.description}`,
          ),
        )
        for (const item of effectiveParsed.deferredCausality ?? []) {
          const key = `${item.type}\u0000${roundSequence}\u0000${item.description}`
          if (causalKeys.has(key)) continue
          causalDelay.recordCausalEvent(
            item.type,
            item.severity,
            roundSequence,
            ageAtRound,
            item.description,
            item.relatedPerson,
            item.relatedFaction,
          )
          causalKeys.add(key)
        }

        // 原创保护：只累积完整数据区中经校验的 creations。
        const roundCreations = effectiveParsed.creations
        if (roundCreations?.length) {
          for (const c of roundCreations) {
            if (!this.state.characterCreations.some((existing) => existing.name === c.name)) {
              this.state.characterCreations.push({
                name: c.name,
                description: c.description,
                category: c.category as CharacterCreation['category'],
                confirmedRound: this.state.totalRounds,
              })
            }
          }
        }
      }

      if (hasValidatedSemanticMetadata) {
        const entities = structuredKeyEvents.flatMap((event) => event.entities ?? [])

        memoryLifecycle.setAISemanticAnalysis(
          roundSequence,
          effectiveParsed.importance!,
          effectiveParsed.arcStatus!,
          semanticSignals,
          entities,
        )
        coreMemory.recordRelationshipUpdates(
          semanticSignals.relationshipUpdates,
          roundSequence,
        )
        foreshadowing.resolveForeshadowing(
          semanticSignals.resolvedForeshadowingIds,
          narrative,
          roundSequence,
        )

        causalDelay.commitCausalTriggers(
          this.pendingNarrativeCausalEventIds,
          roundSequence,
          effectiveParsed.digest,
        )
        this.pendingNarrativeCausalEventIds = []

      }
    }

    const committedIntentResolution = hasValidatedSemanticMetadata
      && focusedIntentBeforeCommit
      && effectiveParsed.intentResolution
      ? this.commitFocusedBranchIntentResolution(effectiveParsed.intentResolution)
      : undefined

    // 更新叙事历史：完整保存，不按字符、轮数或容量移除旧故事。
    this.state.currentNarrative = narrative
    if (narrative) {
      this.lastNarrativeText = narrative
      const branchMeta = hasValidatedSemanticMetadata
        ? this.resolveBranchFromParsed(effectiveParsed)
        : { isBranchPoint: false as const }
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
        ...(committedIntentResolution
          ? { intentResolution: committedIntentResolution }
          : {}),
        ...(branchMeta.isBranchPoint
          ? {
              isBranchPoint: true,
              branchTitle: branchMeta.branchTitle,
              branchOptions: branchMeta.branchOptions,
            }
          : {}),
      })
      this.lastNarratedTimeStep = { ...this.state.timeStep }
    }

    // commit 已修改子系统私有状态；立即刷新快照，确保 UI 同步与本轮自动存档不是上一轮数据。
    if (committedChanges.length > 0) {
      this.collectSubsystemStates(false, false)
    }

    // 提取结构化世界方向（来自 META 的 direction 字段；MVP 阶段仅透传，不回写世界目标）
    const worldDirection: RoundResult['direction'] =
      hasValidatedSemanticMetadata
      && effectiveParsed.direction
      && typeof effectiveParsed.direction === 'object'
      && !Array.isArray(effectiveParsed.direction)
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
      notableEvents: structuredDataAccepted ? effectiveParsed.notableEvents : [],
      direction: worldDirection,
      intentResolution: committedIntentResolution,
    }
    eventBus.emit('mod-engine:round-complete', result)
    this.publishSimulationSnapshot()

    // 检查是否需要压缩（Phase 6：AI L1–L6 管线）
    this.runCompressionPipeline()

    return result
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
    // 每次执行都从空结果开始，避免预览/HMR 后沿用上一轮完整响应。
    this.lastExecutedFullContent = null

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
        const essenceTag = typeof config.essenceTag === 'string' ? config.essenceTag : this.worldSetting.description
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

    if (!this.lastExecutedFullContent) {
      const rejection = new Error('叙事生成结果未通过完整性与结构门禁，本轮未推进，请重新尝试。')
      rejection.name = 'NarrativeGenerationRejectedError'
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
