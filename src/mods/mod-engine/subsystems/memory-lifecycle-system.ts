/**
 * @module memory-lifecycle-system.ts
 * @description 记忆生命周期系统 —— 内部事件计算、压缩索引与故事时间轴投影
 * @mod mod-engine
 *
 * 内部数据保留事件重要度、闭环、来源、层级、权重、衰减和检索索引。
 * 故事侧只取得可见叶子摘要、检索命中和近期完整经历的统一时间轴条目；
 * 当前状态由所属系统单独投影，不混入记忆段。
 */

import type {
  CompressedSummaryItem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import { BaseSubsystem } from '@/core'
import type { NarrativeSemanticSignals } from '../helpers/narrative-semantic-signals'
import {
  isNarrativeRecordVisible,
  type NarrativeMemoryScope,
} from '../helpers/narrative-context-scope'
import {
  projectSummaryToNarrativeTimeline,
  type NarrativeTimelineEntry,
} from '../helpers/timeline-memory'

// ============================================================
// 类型定义
// ============================================================

/** 事件重要度 */
export type EventImportance = 'HIGH' | 'NORMAL' | 'LOW'

/** 事件闭环类型 */
export type ClosureType =
  | 'battle'
  | 'journey'
  | 'task'
  | 'relationship'
  | 'life_stage'
  | 'none'

/** 重要度评分结果 */
export interface ImportanceResult {
  importance: EventImportance
  score: number
  semanticTags: string[]
  source: 'ai' | 'fallback'
  isClosure: boolean
  closureType: ClosureType,
}

/** 单个L0事件的完整标记 */
export interface TaggedEvent {
  /** 轮次 */
  round: number
  /** 事件发生上下文 */
  contextId?: string
  /** 当地、全局或旅行携带记忆。 */
  memoryScope?: NarrativeMemoryScope
  /** 事件发生的日历年，仅供时间跨度展示；唯一键仍为 roundSequence。 */
  calendarYear?: number
  /** 叙事文本 */
  narrative: string
  /** 重要度 */
  importance: EventImportance
  /** 是否闭环 */
  isClosure: boolean
  /** 闭环类型 */
  closureType: ClosureType
  /** AI 标注的检索实体 */
  tags: string[],
  /** 该记忆事实关联的历史事件账本条目。 */
  historicalEventIds?: string[]
}

/** 检索索引条目 */
export interface IndexEntry {
  /** 所在层级 */
  level: number
  /** 起始轮 */
  startRound: number
  /** 结束轮 */
  endRound: number
  /** 摘要内容 */
  content: string
  /** 故事 AI 可见的时间+事件投影；不包含内部计算字段。 */
  narrativeTimelineEntries: NarrativeTimelineEntry[]
  /** 索引实体 */
  tags: string[]
  /** 最高重要度 */
  maxImportance: EventImportance,
  /** 该索引覆盖的上下文集合 */
  contextIds?: string[]
  /** 该索引覆盖的记忆作用域集合。 */
  memoryScopes?: NarrativeMemoryScope[]
  /** 该索引覆盖的历史事件账本条目。 */
  historicalEventIds?: string[]
}

// ============================================================
// 事件聚合类型（合并自 span-event-aggregator）
// ============================================================

/** 事件严重度等级 */
export type EventSeverity = 'critical' | 'major' | 'normal' | 'color'

/** 严重度权重（用于排序） */
const SEVERITY_WEIGHT: Record<EventSeverity, number> = {
  critical: 4,
  major: 3,
  normal: 2,
  color: 1,
}

/** 严重度中文标签 */
const SEVERITY_LABELS: Record<EventSeverity, string> = {
  critical: '危急',
  major: '重大',
  normal: '普通',
  color: '背景',
}

/** 聚合后的事件 */
export interface AggregatedEvent {
  id: string
  severity: EventSeverity
  title: string
  description: string
  source: string
  round: number
  causalLinks?: string[]
}

/** 原始事件（内部使用） */
interface RawEvent {
  id: string
  severity: EventSeverity
  title: string
  description: string
  source: string
  round: number
  cause?: string
  effect?: string
}

/** 压缩触发决策 */
export interface CompressionDecision {
  /** 是否触发压缩 */
  shouldCompress: boolean
  /** 触发原因 */
  reason: 'closure' | 'capacity' | 'none'
  /** 闭环类型（如果因闭环触发） */
  closureType?: ClosureType
  /** 差异化token预算 */
  tokenBudgets: {
    HIGH: number
    NORMAL: number
    LOW: number,
  }
  /** 当前块中的事件标记 */
  taggedEvents: TaggedEvent[],
}

/** 故事 AI 可见的统一时间轴记忆候选。 */
export interface NarrativeTimelineProjection {
  /** 叶子摘要、检索命中与近期完整经历的统一时间轴投影。 */
  timelineEntries: NarrativeTimelineEntry[]
}

/** 每个重要度级别的保留比例 */
const RETENTION_RATES: Record<EventImportance, number> = {
  HIGH: 0.80,
  NORMAL: 0.30,
  LOW: 0.10,
}

/** 压缩容量阈值（超过此轮数且未闭环时强制压缩） */
const CAPACITY_THRESHOLD = 15

/** 最少回合数才触发压缩 */
const MIN_ROUNDS_FOR_COMPRESSION = 3

// ============================================================
// MemoryLifecycleSystem
// ============================================================

export class MemoryLifecycleSystem extends BaseSubsystem {
  readonly id = 'memory-lifecycle' as const
  readonly mod = 'mod-engine' as const
  readonly label = '记忆生命周期' as const
  readonly description = '三层记忆分离+重要度分层+事件闭环驱动，精简Prompt注入' as const

  // ---- 状态 ----

  /** 当前块中已标记的事件（尚未压缩） */
  private taggedEvents: TaggedEvent[] = []

  /** 检索索引（L1-L3 摘要的结构化实体索引） */
  private searchIndex: IndexEntry[] = []

  /** 当前是否在战斗/任务/旅程中 */
  private activeClosure: ClosureType = 'none'

  /** 事件聚合状态（合并自 span-event-aggregator） */
  private rawEvents: RawEvent[] = []
  private aggregatedEvents: AggregatedEvent[] = []

  /** 统计 */
  private stats = {
    totalScored: 0,
    totalHigh: 0,
    totalNormal: 0,
    totalLow: 0,
    totalCompressions: 0,
    closureTriggered: 0,
    capacityTriggered: 0,
    totalRetrievals: 0,
    lastCheckAt: 0,
  }

  /** AI 标注的轮次重要性映射（轮次 → 重要度） */
  private aiImportanceMap = new Map<number, 'HIGH' | 'NORMAL' | 'LOW'>()

  /** AI 标注的事件弧状态（轮次 → start/ongoing/end） */
  private aiArcStatusMap = new Map<number, 'start' | 'ongoing' | 'end'>()

  /** AI 结构化事件弧类型与实体标签。 */
  private aiArcTypeMap = new Map<number, ClosureType>()
  private aiEntityMap = new Map<number, string[]>()
  /** 已提交历史事件账本编号（轮次 → 事件编号）。 */
  private aiHistoricalEventIdsMap = new Map<number, string[]>()

  // ---- 公共方法 ----

  getStats() {
    return { ...this.stats, }
  }

  getTaggedEvents(): TaggedEvent[] {
    return [...this.taggedEvents,]
  }

  getSearchIndex(): IndexEntry[] {
    return [...this.searchIndex,]
  }

  /** 记录经 Schema 校验的 AI 语义，供重要性、闭环与检索系统消费。 */
  setAISemanticAnalysis(
    round: number,
    importance: EventImportance,
    arcStatus: 'start' | 'ongoing' | 'end',
    signals: NarrativeSemanticSignals,
    entities: string[],
    historicalEventIds?: readonly string[],
  ): void {
    this.aiImportanceMap.set(round, importance)
    this.aiArcStatusMap.set(round, arcStatus)
    this.aiArcTypeMap.set(round, signals.arcType)
    this.aiEntityMap.set(round, [...new Set(entities.filter(Boolean))])
    const normalizedHistoricalEventIds = [...new Set(
      (historicalEventIds ?? []).map((id) => id.trim()).filter(Boolean),
    )]
    if (normalizedHistoricalEventIds.length > 0) {
      this.aiHistoricalEventIdsMap.set(round, normalizedHistoricalEventIds)
    } else {
      this.aiHistoricalEventIdsMap.delete(round)
    }
  }

  /**
   * 只消费结构化 AI 语义。缺失时使用可识别的 LOW 中立降级，不扫描正文。
   */
  scoreImportance(
    narrative: string,
    round: number,
    calendarYear?: number,
    contextId?: string,
    memoryScope: NarrativeMemoryScope = contextId ? 'context' : 'global',
  ): ImportanceResult {
    const importance = this.aiImportanceMap.get(round) ?? 'LOW'
    const source: ImportanceResult['source'] = this.aiImportanceMap.has(round) ? 'ai' : 'fallback'
    const semanticTags = this.aiEntityMap.get(round) ?? []
    const historicalEventIds = this.aiHistoricalEventIdsMap.get(round) ?? []
    const closureInfo = this.resolveClosure(round)
    const score = importance === 'HIGH' ? 9 : importance === 'NORMAL' ? 5 : 1

    const existingIndex = this.taggedEvents.findIndex((event) => event.round === round)
    const tagged: TaggedEvent = {
      round,
      contextId,
      memoryScope,
      calendarYear,
      narrative,
      importance,
      isClosure: closureInfo.detected,
      closureType: closureInfo.type,
      tags: semanticTags,
      historicalEventIds: historicalEventIds.length > 0 ? [...historicalEventIds] : undefined,
    }
    if (existingIndex >= 0) this.taggedEvents[existingIndex] = tagged
    else this.taggedEvents.push(tagged)

    if (existingIndex < 0) {
      this.stats.totalScored++
      if (importance === 'HIGH') this.stats.totalHigh++
      else if (importance === 'NORMAL') this.stats.totalNormal++
      else this.stats.totalLow++
    }

    return {
      importance,
      score,
      semanticTags,
      source,
      isClosure: closureInfo.detected,
      closureType: closureInfo.type,
    }
  }

  private resolveClosure(round: number): { detected: boolean; type: ClosureType } {
    const status = this.aiArcStatusMap.get(round)
    const typed = this.aiArcTypeMap.get(round) ?? 'none'
    if (!status) return { detected: false, type: 'none' }
    if (status === 'start') {
      this.activeClosure = typed === 'none' ? 'task' : typed
      return { detected: false, type: this.activeClosure }
    }
    if (status === 'ongoing') {
      if (typed !== 'none') this.activeClosure = typed
      return { detected: false, type: this.activeClosure }
    }
    const closed = typed !== 'none'
      ? typed
      : this.activeClosure === 'none' ? 'task' : this.activeClosure
    this.activeClosure = 'none'
    return { detected: true, type: closed }
  }

  // ============================================================
  // 核心方法2：压缩触发决策
  // ============================================================

  /**
   * 决定是否触发压缩
   *
   * 规则：
   *   1. 优先：事件闭环触发 → 当前块中检测到闭环且≥3轮
   *   2. 兜底：容量触发 → 累计超过15轮未压缩
   *   3. 否则：等待 → 继续累积轮次
   *
   * @returns 压缩决策
   */
  decideCompression(): CompressionDecision {
    const eventCount = this.taggedEvents.length

    // 轮数不足不触发
    if (eventCount < MIN_ROUNDS_FOR_COMPRESSION) {
      return {
        shouldCompress: false,
        reason: 'none',
        taggedEvents: [...this.taggedEvents,],
        tokenBudgets: { HIGH: 0, NORMAL: 0, LOW: 0, },
      }
    }

    // 检查是否有闭环事件
    const closureEvents = this.taggedEvents.filter((e,) => e.isClosure,)
    if (closureEvents.length > 0) {
      // 找到最近的闭环
      const lastClosure = closureEvents[closureEvents.length - 1]
      this.stats.closureTriggered++
      return {
        shouldCompress: true,
        reason: 'closure',
        closureType: lastClosure.closureType,
        taggedEvents: [...this.taggedEvents,],
        tokenBudgets: this.calculateTokenBudgets(this.taggedEvents,),
      }
    }

    // 容量触发
    if (eventCount >= CAPACITY_THRESHOLD) {
      this.stats.capacityTriggered++
      return {
        shouldCompress: true,
        reason: 'capacity',
        taggedEvents: [...this.taggedEvents,],
        tokenBudgets: this.calculateTokenBudgets(this.taggedEvents,),
      }
    }

    return {
      shouldCompress: false,
      reason: 'none',
      taggedEvents: [...this.taggedEvents,],
      tokenBudgets: { HIGH: 0, NORMAL: 0, LOW: 0, },
    }
  }

  /**
   * 计算差异化token预算
   */
  private calculateTokenBudgets(events: TaggedEvent[],): {
    HIGH: number
    NORMAL: number
    LOW: number
  } {
    const highEvents = events.filter((e,) => e.importance === 'HIGH',)
    const normalEvents = events.filter((e,) => e.importance === 'NORMAL',)
    const lowEvents = events.filter((e,) => e.importance === 'LOW',)

    // 预估字符数（中文每字约1token）
    const highChars = highEvents.reduce((sum, e,) => sum + e.narrative.length, 0,)
    const normalChars = normalEvents.reduce((sum, e,) => sum + e.narrative.length, 0,)
    const lowChars = lowEvents.reduce((sum, e,) => sum + e.narrative.length, 0,)

    return {
      HIGH: Math.max(200, Math.ceil(highChars * RETENTION_RATES.HIGH,)),
      NORMAL: Math.max(100, Math.ceil(normalChars * RETENTION_RATES.NORMAL,)),
      LOW: Math.max(50, Math.ceil(lowChars * RETENTION_RATES.LOW,)),
    }
  }

  /**
   * 构建差异化压缩的AI Prompt
   *
   * 告诉AI：HIGH事件要保留80%细节，LOW事件可以10%略过
   */
  buildDifferentialPrompt(events: TaggedEvent[],): string {
    const highEvents = events.filter((e,) => e.importance === 'HIGH',)
    const normalEvents = events.filter((e,) => e.importance === 'NORMAL',)
    const lowEvents = events.filter((e,) => e.importance === 'LOW',)

    let prompt = ''

    if (highEvents.length > 0) {
      prompt += `【重要事件（保留80%细节）】\n`
      prompt += highEvents.map((e,) => `第${e.round}轮[HIGH]：${e.narrative}`,).join('\n',)
      prompt += '\n\n'
    }

    if (normalEvents.length > 0) {
      prompt += `【普通事件（保留30%概要）】\n`
      prompt += normalEvents.map((e,) => `第${e.round}轮[NORMAL]：${e.narrative}`,).join('\n',)
      prompt += '\n\n'
    }

    if (lowEvents.length > 0) {
      prompt += `【日常流水（低比例保留细节）】\n`
      prompt += lowEvents.map((e,) => `第${e.round}轮[LOW]：${e.narrative}`,).join('\n',)
    }

    return prompt
  }

  /** 只清理已被摘要覆盖的事件，保留尚未进入任何摘要的新回合。 */
  clearTaggedEventsThrough(endRound: number): number {
    const previousLength = this.taggedEvents.length
    this.taggedEvents = this.taggedEvents.filter((event) => event.round > endRound)
    const removed = previousLength - this.taggedEvents.length
    if (removed > 0) this.stats.totalCompressions++

    for (const key of this.aiImportanceMap.keys()) {
      if (key <= endRound) this.aiImportanceMap.delete(key)
    }
    for (const key of this.aiArcStatusMap.keys()) {
      if (key <= endRound) this.aiArcStatusMap.delete(key)
    }
    for (const key of this.aiArcTypeMap.keys()) {
      if (key <= endRound) this.aiArcTypeMap.delete(key)
    }
    for (const key of this.aiEntityMap.keys()) {
      if (key <= endRound) this.aiEntityMap.delete(key)
    }
    for (const key of this.aiHistoricalEventIdsMap.keys()) {
      if (key <= endRound) this.aiHistoricalEventIdsMap.delete(key)
    }

    return removed
  }

  // ============================================================
  // 事件聚合方法（合并自 span-event-aggregator）
  // ============================================================

  /**
   * 添加原始事件
   */
  addEvent(event: Omit<RawEvent, 'round'>, round: number,): void {
    this.rawEvents.push({ ...event, round, })
  }

  /**
   * 添加多个事件
   */
  addEvents(events: Omit<RawEvent, 'round'>[], round: number,): void {
    for (const event of events) {
      this.addEvent(event, round,)
    }
  }

  /**
   * 清空当前回合的事件
   */
  clearEvents(): void {
    this.rawEvents = []
    this.aggregatedEvents = []
    this.aiImportanceMap.clear()
    this.aiArcStatusMap.clear()
    this.aiArcTypeMap.clear()
    this.aiEntityMap.clear()
    this.aiImportanceMap.clear()
    this.aiArcStatusMap.clear()
  }

  /**
   * 执行完整的事件聚合流程
   * @returns 聚合后的事件列表
   */
  aggregate(): AggregatedEvent[] {
    const sorted = this.sortBySeverity(this.rawEvents,)
    const merged = this.mergeCausalChains(sorted,)

    this.aggregatedEvents = merged.map(e => ({
      id: e.id,
      severity: e.severity,
      title: e.title,
      description: e.description,
      source: e.source,
      round: e.round,
      causalLinks: e.cause ? [e.cause,] : undefined,
    }),)

    return this.aggregatedEvents
  }

  /**
   * 获取聚合后的事件列表
   */
  getAggregatedEvents(): AggregatedEvent[] {
    return [...this.aggregatedEvents,]
  }

  /**
   * 构建事件注入文本（用于注入 Prompt）
   */
  buildEventInjectionText(): string {
    if (this.aggregatedEvents.length === 0) return ''

    const parts: string[] = ['【当前事件】',]
    const eventsBySeverity: Record<EventSeverity, AggregatedEvent[]> = {
      critical: [],
      major: [],
      normal: [],
      color: [],
    }

    for (const event of this.aggregatedEvents) {
      eventsBySeverity[event.severity].push(event,)
    }

    const severityOrder: EventSeverity[] = ['critical', 'major', 'normal', 'color',]
    for (const severity of severityOrder) {
      const events = eventsBySeverity[severity]
      if (events.length === 0) continue
      parts.push(`【${SEVERITY_LABELS[severity]}】`,)
      for (const event of events) {
        parts.push(`- ${event.title}: ${event.description}`,)
      }
    }

    return parts.join('\n',)
  }

  // ---- 事件聚合内部方法 ----

  private sortBySeverity(events: RawEvent[],): RawEvent[] {
    return [...events,].sort((a, b,) => {
      const severityDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
      if (severityDiff !== 0) return severityDiff
      return a.title.length - b.title.length
    },)
  }

  private mergeCausalChains(events: RawEvent[],): RawEvent[] {
    // 因果关系只能来自结构化事件链接；当前 RawEvent 没有稳定 ID 链时保持原序列。
    return events
  }

  // ============================================================
  // 核心方法3：检索索引管理
  // ============================================================

  /**
   * 将压缩后的摘要添加到检索索引
   *
   * L1-L3摘要不重复注入Prompt，而是存入索引。
   * 当后续回合的 AI 结构化实体与索引重合时，按需检索并临时注入。
   */
  addToIndex(
    level: number,
    startRound: number,
    endRound: number,
    content: string,
    narrativeTimelineEntries: readonly NarrativeTimelineEntry[],
    events: TaggedEvent[],
  ): void {
    // 汇总 AI 标注的结构化实体
    const allTags = new Set<string>()
    let maxImportance: EventImportance = 'LOW'

    for (const event of events) {
      for (const tag of event.tags) {
        allTags.add(tag,)
      }
      if (event.importance === 'HIGH') maxImportance = 'HIGH'
      else if (event.importance === 'NORMAL' && maxImportance === 'LOW') maxImportance = 'NORMAL'
    }

    const entry: IndexEntry = {
      level,
      startRound,
      endRound,
      content,
      narrativeTimelineEntries: structuredClone([...narrativeTimelineEntries]),
      tags: [...allTags,],
      maxImportance,
      contextIds: [...new Set(events.map((event) => event.contextId).filter((id): id is string => Boolean(id)))],
      memoryScopes: [...new Set(events.map((event) => event.memoryScope ?? (event.contextId ? 'context' : 'global')))],
      historicalEventIds: [...new Set(events.flatMap((event) => event.historicalEventIds ?? []))],
    }

    this.upsertIndexEntry(entry)
  }

  /**
   * 将 L1-L3 摘要加入同一检索索引。
   *
   * L1 生成后，覆盖区间内的原始 TaggedEvent 会按延迟策略清理；高层摘要
   * 因此从已经建立的低层索引继承实体与最高重要度，避免远期记忆失去可检索性。
   */
  addCompressedSummaryToIndex(
    level: number,
    startRound: number,
    endRound: number,
    content: string,
    narrativeTimelineEntries: readonly NarrativeTimelineEntry[],
  ): void {
    const overlapping = this.searchIndex.filter(
      (entry) => entry.startRound <= endRound && entry.endRound >= startRound,
    )
    const tags = new Set(overlapping.flatMap((entry) => entry.tags))
    const contextIds = [...new Set(overlapping.flatMap((entry) => entry.contextIds ?? []))]
    const memoryScopes = [...new Set(overlapping.flatMap((entry) => entry.memoryScopes ?? []))]
    const historicalEventIds = [...new Set(overlapping.flatMap((entry) => entry.historicalEventIds ?? []))]
    let maxImportance: EventImportance = 'LOW'
    for (const entry of overlapping) {
      if (entry.maxImportance === 'HIGH') maxImportance = 'HIGH'
      else if (entry.maxImportance === 'NORMAL' && maxImportance === 'LOW') {
        maxImportance = 'NORMAL'
      }
    }

    this.upsertIndexEntry({
      level,
      startRound,
      endRound,
      content,
      narrativeTimelineEntries: structuredClone([...narrativeTimelineEntries]),
      tags: [...tags],
      maxImportance,
      contextIds,
      memoryScopes,
      historicalEventIds,
    })
  }

  private upsertIndexEntry(entry: IndexEntry): void {
    const existingIndex = this.searchIndex.findIndex(
      (e,) => e.level === entry.level && e.startRound === entry.startRound && e.endRound === entry.endRound,
    )
    if (existingIndex >= 0) {
      this.searchIndex[existingIndex] = entry
    } else {
      this.searchIndex.push(entry,)
    }
  }

  /**
   * 按需检索：按当前回合 AI 标注实体从索引中检索摘要。
   *
   * 检索策略（替代动态多层级地图）：
   *   1. 实体匹配：当前回合 AI 标注实体与索引标签精确匹配
   *   2. 重要度加成：HIGH 事件优先，NORMAL 次之
   *   3. 地点/区域同样由 keyEvents.entities 显式标注
   *
   * 设计理念：不创建动态多层级地图系统，而是利用已有的检索索引机制。
   * 当角色移动到新的区域时，AI 在 keyEvents.entities 中标注稳定名称，
   * 检索引擎据此调取相关叙事历史，实现"区域感知"。
   *
   * 这等价于：L0=角色当前位置的叙事，L1=城镇级摘要，L2=区域级摘要，
   * L3=长期时间轴。检索引擎按结构化实体匹配自动选择
   * 相关层级的摘要注入 Prompt，无需手动管理地图层级。
   *
   * @param _queryText 兼容旧调用；不再读取正文做语义检索
   * @returns 匹配的摘要内容列表
   */
  retrieveFromIndex(
    _queryText: string,
    currentContextId?: string,
    closedContextIds?: ReadonlySet<string>,
  ): NarrativeTimelineEntry[] {
    if (this.searchIndex.length === 0) return []
    const latestRound = this.aiEntityMap.size > 0
      ? Math.max(...this.aiEntityMap.keys())
      : undefined
    const currentEntities = new Set(latestRound === undefined ? [] : this.aiEntityMap.get(latestRound))

    const results: Array<{ entry: IndexEntry; score: number }> = []

    for (const entry of this.searchIndex) {
      const entryScopes = entry.memoryScopes ?? []
      const visible = entryScopes.length > 0
        ? entryScopes.some((scope) => isNarrativeRecordVisible(
            { contextIds: entry.contextIds, scope },
            { currentContextId, closedContextIds },
          ))
        : isNarrativeRecordVisible(
            { contextIds: entry.contextIds },
            { currentContextId, closedContextIds },
          )
      if (!visible) continue

      let score = 0
      let entityMatches = 0

      // HIGH 条目作为长期核心记忆保底；NORMAL/LOW 只在当前实体命中时召回，
      // 避免把整个索引无差别塞回 Prompt。
      if (entry.maxImportance === 'HIGH') score += 4

      // 0b. AI 标注重要性加成（F1：跨轮次 AI importance 参与排序）
      for (let r = entry.startRound; r <= entry.endRound; r++) {
        const aiImp = this.aiImportanceMap.get(r)
        if (aiImp === 'HIGH') { score += 4; break }
        if (aiImp === 'NORMAL') score += 2
      }

      // 1. AI 实体精确匹配
      for (const tag of entry.tags) {
        if (currentEntities.has(tag)) {
          entityMatches++
          score += 3
        }
      }

      if (entry.maxImportance !== 'HIGH' && entityMatches === 0) continue

      // 3. 重要度加成
      if (entry.maxImportance === 'HIGH') score *= 2
      else if (entry.maxImportance === 'NORMAL') score *= 1.5

      // 4. HIGH 保底：重要记忆即使无实体命中也应进入候选
      if (score === 0 && entry.maxImportance === 'HIGH') {
        score = 5
      }

      if (score > 0) {
        results.push({ entry, score, })
      }
    }

    // 按得分排序并保留全部语义命中。无命中的条目仍完整保存在索引中，
    // 由叶子摘要覆盖历史，或在后续实体再次出现时召回。
    results.sort((a, b,) => b.score - a.score,)

    const hits = results.flatMap((result) => result.entry.narrativeTimelineEntries.map((entry) => ({
      ...entry,
      text: result.entry.contextIds?.length
        ? `【发生上下文：${result.entry.contextIds.join('、')}】\n${entry.text}`
        : entry.text,
    })))

    this.stats.totalRetrievals += hits.length
    return hits
  }

  // ============================================================
  // 核心方法4：故事时间轴投影
  // ============================================================

  /**
   * 构建故事 AI 的时间轴候选；层级与权重只参与本地选择，不进入结果。
   *
   * @param recentNarratives 最近原始叙事
   * @param compressedSummaries 压缩摘要全量数据
   * @returns 统一时间轴投影
   */
  buildNarrativeTimelineProjection(
    recentNarratives: NarrativeTimelineEntry[],
    compressedSummaries: { summaries: CompressedSummaryItem[] },
    currentContextId?: string,
    closedContextIds?: ReadonlySet<string>,
    currentRound = 0,
  ): NarrativeTimelineProjection {
    // 检索命中
    const queryText = recentNarratives.length > 0
      ? recentNarratives[recentNarratives.length - 1].text
      : ''
    const retrievalHits = this.retrieveFromIndex(queryText, currentContextId, closedContextIds)

    // 只注入没有被更高层摘要覆盖的叶子摘要。所有摘要仍完整保存在存储和
    // 检索索引中，这里是语义压缩后的无损覆盖选择，不是固定条数截断。
    const summaries = compressedSummaries.summaries
    const leafTimeline = this.selectLeafSummaries(summaries, currentContextId, closedContextIds, currentRound)

    return {
      timelineEntries: [
        ...leafTimeline,
        ...retrievalHits,
        ...recentNarratives,
      ],
    }
  }

  private selectLeafSummaries(
    summaries: CompressedSummaryItem[],
    currentContextId?: string,
    closedContextIds?: ReadonlySet<string>,
    currentRound = 0,
  ): NarrativeTimelineEntry[] {
    const byLevel = new Map<number, typeof summaries>()
    for (const summary of summaries) {
      if (!isNarrativeRecordVisible(
        { contextIds: summary.contextIds },
        { currentContextId, closedContextIds },
      )) continue
      const items = byLevel.get(summary.level) ?? []
      items.push(summary)
      byLevel.set(summary.level, items)
    }

    const coveredRanges: Array<{ start: number; end: number }> = []
    const timelineEntries: NarrativeTimelineEntry[] = []
    const levels = [...byLevel.keys()].sort((a, b) => b - a)
    for (const level of levels) {
      const visible = (byLevel.get(level) ?? [])
        .filter((summary) => !coveredRanges.some(
          (range) => summary.startRound >= range.start && summary.endRound <= range.end,
        ))
        .sort((a, b) => a.startRound - b.startRound)

      if (visible.length === 0) continue
      for (const summary of visible) {
        coveredRanges.push({ start: summary.startRound, end: summary.endRound })
      }
      for (const summary of visible) {
        const contextIds = summary.contextIds ?? []
        const contextLabel = contextIds.length > 0
          ? `【发生上下文：${contextIds.join('、')}${currentContextId && contextIds.includes(currentContextId) ? '·当前' : ''}】\n`
          : ''
        timelineEntries.push(...projectSummaryToNarrativeTimeline(summary, currentRound).map((entry) => ({
          ...entry,
          text: `${contextLabel}${entry.text}`,
        })))
      }
    }

    return timelineEntries
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 获取 L3 长期时间轴文本
   */
  extractHistoryOutline(compressedSummaries: {
    summaries: Array<{ level: number; content: string }>
  },): string {
    return compressedSummaries.summaries
      .filter((s,) => s.level === 3)
      .map((s,) => s.content)
      .join('\n')
  }

  /**
   * 提取L1摘要供prompt使用（替代旧的"近期摘要"注入）
   * 注意：在新架构中L1也不默认注入，只有检索命中时才出现
   */
  extractL1Summaries(compressedSummaries: {
    summaries: Array<{ level: number; content: string }>
  },): string[] {
    return compressedSummaries.summaries
      .filter((s,) => s.level === 1,)
      .map((s,) => s.content,)
  }

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext,): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】评分:${this.stats.totalScored} H:${this.stats.totalHigh} N:${this.stats.totalNormal} L:${this.stats.totalLow} 压缩:${this.stats.totalCompressions}(闭环:${this.stats.closureTriggered} 容量:${this.stats.capacityTriggered}) 检索:${this.stats.totalRetrievals}`,
      data: structuredClone({
        taggedEvents: this.taggedEvents.length,
        searchIndexSize: this.searchIndex.length,
        activeClosure: this.activeClosure,
        stats: this.stats,
      },) as unknown as Record<string, unknown>,
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext,): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`,)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`,)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes,)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`,)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`,)
    }
    void changes.changes; // 记忆生命周期系统一般不从外部接收变更
  }

  /** 预生成会读取检索索引并累加统计；结束后必须恢复真实时间线。 */
  capturePreviewState(): unknown {
    return structuredClone({
      taggedEvents: this.taggedEvents,
      searchIndex: this.searchIndex,
      activeClosure: this.activeClosure,
      rawEvents: this.rawEvents,
      aggregatedEvents: this.aggregatedEvents,
      stats: this.stats,
      aiImportanceMap: [...this.aiImportanceMap.entries()],
      aiArcStatusMap: [...this.aiArcStatusMap.entries()],
      aiArcTypeMap: [...this.aiArcTypeMap.entries()],
      aiEntityMap: [...this.aiEntityMap.entries()],
      aiHistoricalEventIdsMap: [...this.aiHistoricalEventIdsMap.entries()],
    })
  }

  restorePreviewState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as {
      taggedEvents?: TaggedEvent[]
      searchIndex?: IndexEntry[]
      activeClosure?: ClosureType
      rawEvents?: RawEvent[]
      aggregatedEvents?: AggregatedEvent[]
      stats?: ReturnType<MemoryLifecycleSystem['getStats']>
      aiImportanceMap?: Map<number, EventImportance> | Array<[number, EventImportance]>
      aiArcStatusMap?: Map<number, 'start' | 'ongoing' | 'end'> | Array<[number, 'start' | 'ongoing' | 'end']>
      aiArcTypeMap?: Map<number, ClosureType> | Array<[number, ClosureType]>
      aiEntityMap?: Map<number, string[]> | Array<[number, string[]]>
      aiHistoricalEventIdsMap?: Map<number, string[]> | Array<[number, string[]]>
    }
    if (value.taggedEvents) this.taggedEvents = structuredClone(value.taggedEvents)
    if (value.searchIndex) this.searchIndex = structuredClone(value.searchIndex)
    if (value.activeClosure) this.activeClosure = value.activeClosure
    if (value.rawEvents) this.rawEvents = structuredClone(value.rawEvents)
    if (value.aggregatedEvents) this.aggregatedEvents = structuredClone(value.aggregatedEvents)
    if (value.stats) this.stats = structuredClone(value.stats)
    if (value.aiImportanceMap) this.aiImportanceMap = new Map(value.aiImportanceMap)
    if (value.aiArcStatusMap) this.aiArcStatusMap = new Map(value.aiArcStatusMap)
    if (value.aiArcTypeMap) this.aiArcTypeMap = new Map(value.aiArcTypeMap)
    if (value.aiEntityMap) this.aiEntityMap = new Map(value.aiEntityMap)
    this.aiHistoricalEventIdsMap = value.aiHistoricalEventIdsMap
      ? new Map(value.aiHistoricalEventIdsMap)
      : new Map()
  }

  reset(): void {
    this.taggedEvents = []
    this.searchIndex = []
    this.activeClosure = 'none'
    this.rawEvents = []
    this.aggregatedEvents = []
    this.aiHistoricalEventIdsMap.clear()
    this.stats = {
      totalScored: 0,
      totalHigh: 0,
      totalNormal: 0,
      totalLow: 0,
      totalCompressions: 0,
      closureTriggered: 0,
      capacityTriggered: 0,
      totalRetrievals: 0,
      lastCheckAt: 0,
    }
  }
}

/** 单例 */
export const memoryLifecycle = new MemoryLifecycleSystem()
