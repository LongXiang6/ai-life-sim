/**
 * @module memory-lifecycle-system.ts
 * @description 记忆生命周期系统 —— 三层记忆分离 + 重要度分层 + 事件闭环驱动 + 事件聚合
 * @mod mod-engine
 *
 * 四方案融合设计：
 *   A. 三层记忆分离：状态卡(始终在)+叙事窗(L0近期)+历史纲(L6)，L2-L6转为检索索引
 *   B. 重要度分层：消费 AI 的 HIGH/NORMAL/LOW，差异化压缩保留
 *   C. 事件闭环驱动：消费 AI 的 arcStatus/arcType，避免语义断裂
 *   D. 事件聚合（合并自 span-event-aggregator）：严重度排序 + 因果链合并 + 比例限制 + 数量上限
 *
 * 架构：
 *   AI META → 重要度/事件弧/实体 → L0 标记 → 事件聚合 → 差异化压缩 → 检索索引 → Prompt注入
 *
 * 每轮Prompt注入内容（精简到极致）：
 *   1. 状态卡（subsystem summaries，结构化当前状态）
 *   2. 最近20轮L0原文（覆盖延迟压缩区间的细节完整短期记忆）
 *   3. L6历史纲要（一生纵览，长期记忆框架）
 *   4. 检索命中摘要（L2-L6 中按 AI 标注实体匹配，"突然想起来的往事"）
 *   5. 聚合事件（严重事件优先，因果链合并，比例控制）
 *
 * AI 重要性约定：
 *   HIGH   = 死亡/战斗/突破/背叛/结婚/生子/重大转折
 *   NORMAL = 人际关系变化/职业变动/旅行/学习/普通事件
 *   LOW    = 日常流水/重复训练/闲逛/无事发生
 *
 * 事件聚合规则（原 span-event-aggregator）：
 *   严重度排序：critical > major > normal > color
 *   因果链合并：将因果相关的事件合并为一条
 *   比例限制：色彩事件(color)不超过总数的 20%
 *   数量上限：最多 15 条事件
 *
 * 差异化保留：
 *   HIGH   800字→640字 (80%)
 *   NORMAL 800字→240字 (30%)
 *   LOW    800字→80字  (10%)
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { BaseSubsystem } from '@/core'
import type { NarrativeSemanticSignals } from '../helpers/narrative-semantic-signals'
import { RECENT_NARRATIVE_WINDOW } from '../constants'

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
  /** 索引实体 */
  tags: string[]
  /** 最高重要度 */
  maxImportance: EventImportance,
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

/** 事件聚合配置 */
const MAX_EVENTS = 15
const MAX_EVENTS_BY_SEVERITY: Record<EventSeverity, number> = {
  critical: 3,
  major: 5,
  normal: 5,
  color: 3,
}
const COLOR_EVENT_RATIO = 0.2

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

/** 富Prompt注入内容（4压缩层级+L0，适配DS V4 1M上下文） */
export interface RichPromptContext {
  /** 状态卡 */
  stateCard: string
  /** 最近完整原文窗口（覆盖延迟 L1 尚未形成摘要的区间） */
  recentNarratives: string[]
  /** L1 近距离记忆（最近2条摘要） */
  l1Summaries: string[]
  /** L2 中距离记忆（最近1条） */
  l2Summary: string
  /** L3 远距离记忆（最近1条） */
  l3Summary: string
  /** L4 纪元记忆（最近1条） */
  l4Summary: string
  /** L6 历史纲要（一生纵览） */
  historyOutline: string
  /** 检索命中（从 L2-L6 结构化实体匹配） */
  retrievalHits: string[],
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

/** 检索索引最大条目数 */
const MAX_INDEX_ENTRIES = 50

/** 每轮检索命中最大注入量 */
const MAX_RETRIEVAL_HITS = 3

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

  /** 检索索引（L2-L6 摘要的结构化实体索引） */
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
  ): void {
    this.aiImportanceMap.set(round, importance)
    this.aiArcStatusMap.set(round, arcStatus)
    this.aiArcTypeMap.set(round, signals.arcType)
    this.aiEntityMap.set(round, [...new Set(entities.filter(Boolean))])
  }

  /**
   * 只消费结构化 AI 语义。缺失时使用可识别的 LOW 中立降级，不扫描正文。
   */
  scoreImportance(narrative: string, round: number, calendarYear?: number): ImportanceResult {
    const importance = this.aiImportanceMap.get(round) ?? 'LOW'
    const source: ImportanceResult['source'] = this.aiImportanceMap.has(round) ? 'ai' : 'fallback'
    const semanticTags = this.aiEntityMap.get(round) ?? []
    const closureInfo = this.resolveClosure(round)
    const score = importance === 'HIGH' ? 9 : importance === 'NORMAL' ? 5 : 1

    const existingIndex = this.taggedEvents.findIndex((event) => event.round === round)
    const tagged: TaggedEvent = {
      round,
      calendarYear,
      narrative,
      importance,
      isClosure: closureInfo.detected,
      closureType: closureInfo.type,
      tags: semanticTags,
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
    const limited = this.applyLimits(merged,)

    this.aggregatedEvents = limited.map(e => ({
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

  private applyLimits(events: RawEvent[],): RawEvent[] {
    const bySeverity: Record<EventSeverity, RawEvent[]> = {
      critical: [],
      major: [],
      normal: [],
      color: [],
    }

    for (const event of events) {
      if (bySeverity[event.severity].length < MAX_EVENTS_BY_SEVERITY[event.severity]) {
        bySeverity[event.severity].push(event,)
      }
    }

    let result: RawEvent[] = []
    for (const severity of ['critical', 'major', 'normal', 'color',] as EventSeverity[]) {
      result = result.concat(bySeverity[severity],)
    }

    if (result.length > MAX_EVENTS) {
      result = result.slice(0, MAX_EVENTS,)
    }

    const colorEvents = result.filter(e => e.severity === 'color',)
    const maxColorEvents = Math.floor(result.length * COLOR_EVENT_RATIO,)
    if (colorEvents.length > maxColorEvents) {
      const nonColorEvents = result.filter(e => e.severity !== 'color',)
      const limitedColorEvents = colorEvents.slice(-maxColorEvents,)
      result = nonColorEvents.concat(limitedColorEvents,)
    }

    return result
  }

  // ============================================================
  // 核心方法3：检索索引管理
  // ============================================================

  /**
   * 将压缩后的摘要添加到检索索引
   *
   * L2-L6摘要不重复注入Prompt，而是存入索引。
   * 当后续回合的 AI 结构化实体与索引重合时，按需检索并临时注入。
   */
  addToIndex(
    level: number,
    startRound: number,
    endRound: number,
    content: string,
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
      tags: [...allTags,],
      maxImportance,
    }

    this.upsertIndexEntry(entry)
  }

  /**
   * 将 L2-L6 摘要加入同一检索索引。
   *
   * L1 生成后，覆盖区间内的原始 TaggedEvent 会按延迟策略清理；高层摘要
   * 因此从已经建立的低层索引继承实体与最高重要度，避免远期记忆失去可检索性。
   */
  addCompressedSummaryToIndex(
    level: number,
    startRound: number,
    endRound: number,
    content: string,
  ): void {
    const overlapping = this.searchIndex.filter(
      (entry) => entry.startRound <= endRound && entry.endRound >= startRound,
    )
    const tags = new Set(overlapping.flatMap((entry) => entry.tags))
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
      tags: [...tags],
      maxImportance,
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

    // 限制索引大小
    if (this.searchIndex.length > MAX_INDEX_ENTRIES) {
      // 优先删除 LOW 旧条目
      const lowIndex = this.searchIndex.findIndex((e,) => e.maxImportance === 'LOW',)
      if (lowIndex >= 0) {
        this.searchIndex.splice(lowIndex, 1,)
      } else {
        this.searchIndex.shift() // 删除最旧的
      }
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
   * L3=大陆级摘要，L4+=世界级摘要。检索引擎按结构化实体匹配自动选择
   * 相关层级的摘要注入 Prompt，无需手动管理地图层级。
   *
   * @param _queryText 兼容旧调用；不再读取正文做语义检索
   * @returns 匹配的摘要内容列表
   */
  retrieveFromIndex(_queryText: string,): string[] {
    if (this.searchIndex.length === 0) return []
    const latestRound = this.aiEntityMap.size > 0
      ? Math.max(...this.aiEntityMap.keys())
      : undefined
    const currentEntities = new Set(latestRound === undefined ? [] : this.aiEntityMap.get(latestRound))

    const results: Array<{ entry: IndexEntry; score: number }> = []

    for (const entry of this.searchIndex) {
      let score = 0

      // 0. 重要性基础分（HIGH 条目不应依赖实体命中才出现）
      if (entry.maxImportance === 'HIGH') score += 4
      else if (entry.maxImportance === 'NORMAL') score += 2

      // 0b. AI 标注重要性加成（F1：跨轮次 AI importance 参与排序）
      for (let r = entry.startRound; r <= entry.endRound; r++) {
        const aiImp = this.aiImportanceMap.get(r)
        if (aiImp === 'HIGH') { score += 4; break }
        if (aiImp === 'NORMAL') score += 2
      }

      // 1. AI 实体精确匹配
      for (const tag of entry.tags) {
        if (currentEntities.has(tag)) {
          score += 3
        }
      }

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

  // 按得分排序，取前N个（扩容 1 个槽位为重要性注入留空间）
  results.sort((a, b,) => b.score - a.score,)

  const hits = results.slice(0, MAX_RETRIEVAL_HITS + 1,).map(
      (r,) => `[记忆回溯：${r.entry.startRound}-${r.entry.endRound}轮] ${r.entry.content}`,
    )

    this.stats.totalRetrievals += hits.length
    return hits
  }

  // ============================================================
  // 核心方法4：富Prompt组装（5压缩层级+L0，适配1M上下文）
  // ============================================================

  /**
   * 构建富Prompt上下文
   *
   * 注入策略（DS V4 1M上下文，可以放宽）：
   *   1. 状态卡 → 当前角色/世界状态（每轮更新）
   *   2. L6 → 一生纵览（最远框架）
   *   3. L4 → 纪元记忆（数百轮范围）
   *   4. L3 → 远距离记忆（百轮范围）
   *   5. L2 → 中距离记忆（数十轮范围）
   *   6. L1 → 近距离记忆（最近2条摘要）
   *   7. 检索命中 → 按需注入
   *   8. L0 → 最近N轮原文（短期完整记忆）
   *
   * 共5个压缩层级 + L0原文 + 状态卡 + 检索命中
   *
   * @param subsystemSummaries 子系统状态文本
   * @param recentNarratives 最近原始叙事
   * @param compressedSummaries 压缩摘要全量数据
   * @returns 富Prompt上下文
   */
  buildRichPrompt(
    subsystemSummaries: string,
    recentNarratives: string[],
    compressedSummaries: {
      summaries: Array<{ level: number; content: string }>,
    },
  ): RichPromptContext {
    // 检索命中
    const queryText = recentNarratives.length > 0
      ? recentNarratives[recentNarratives.length - 1]
      : ''
    const retrievalHits = this.retrieveFromIndex(queryText,)

    // 提取各层级摘要（按时间排序取最近N条）
    const summaries = compressedSummaries.summaries

    const l1s = summaries
      .filter((s,) => s.level === 1,)
      .slice(-2,) // 最近2条L1
      .map((s,) => s.content,)

    const l2Recent = summaries
      .filter((s,) => s.level === 2,)
      .slice(-1,)[0] // 最近1条L2

    const l3Recent = summaries
      .filter((s,) => s.level === 3,)
      .slice(-1,)[0] // 最近1条L3

    const l4Recent = summaries
      .filter((s,) => s.level === 4,)
      .slice(-1,)[0] // 最近1条L4

    return {
      stateCard: subsystemSummaries,
      recentNarratives: recentNarratives.slice(-RECENT_NARRATIVE_WINDOW,),
      l1Summaries: l1s,
      l2Summary: l2Recent?.content || '',
      l3Summary: l3Recent?.content || '',
      l4Summary: l4Recent?.content || '',
      historyOutline: this.extractHistoryOutline(compressedSummaries,),
      retrievalHits,
    }
  }

  /**
   * 将富Prompt上下文格式化为注入文本
   *
   * 顺序设计原则：
   *   - 历史框架在前 → AI先建立"时代认知"
   *   - 状态在中 → 然后理解"当前处境"
   *   - 近期记忆在后 → 最后参考"最近发生了什么"
   *   - 检索命中穿插 → "突然想起来的往事"
   */
  formatRichPromptForInjection(context: RichPromptContext,): string {
    const parts: string[] = []

    // 1. 历史纲要（L6，一生纵览）
    if (context.historyOutline) {
      parts.push('【一生纵览】',)
      parts.push(context.historyOutline,)
    }

    // 2. 纪元记忆（L4，数百轮范围）
    if (context.l4Summary) {
      parts.push('',)
      parts.push('【纪元概览】',)
      parts.push(context.l4Summary,)
    }

    // 3. 远距离记忆（L3，百轮范围）
    if (context.l3Summary) {
      parts.push('',)
      parts.push('【远距记忆】',)
      parts.push(context.l3Summary,)
    }

    // 4. 中距离记忆（L2，数十轮范围）
    if (context.l2Summary) {
      parts.push('',)
      parts.push('【中距记忆】',)
      parts.push(context.l2Summary,)
    }

    // 5. 状态卡（当前角色/世界状态）
    if (context.stateCard) {
      parts.push('',)
      parts.push('【当前状态】',)
      parts.push(context.stateCard,)
    }

    // 6. 检索命中（"突然想起来的往事"）
    if (context.retrievalHits.length > 0) {
      parts.push('',)
      parts.push('【记忆回溯】',)
      parts.push(context.retrievalHits.join('\n',))
    }

    // 7. 近距离记忆（L1，最近2条摘要）
    if (context.l1Summaries.length > 0) {
      parts.push('',)
      parts.push('【近期摘要】',)
      parts.push(context.l1Summaries.join('\n---\n',))
    }

    // 8. 最新发展（L0原文，短期完整记忆）
    if (context.recentNarratives.length > 0) {
      parts.push('',)
      parts.push('【最新发展】',)
      parts.push('以下是已发生事实的原始记录，只用于延续人物、关系、因果和线索；不得模仿其中的叙述人称、措辞或段落结构。',)
      parts.push(context.recentNarratives.join('\n---\n',))
    }

    return parts.join('\n',)
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 获取L6历史纲要从摘要中包含的文本
   */
  extractHistoryOutline(compressedSummaries: {
    summaries: Array<{ level: number; content: string }>
  },): string {
    const l6Summaries = compressedSummaries.summaries.filter((s,) => s.level === 6,)
    if (l6Summaries.length === 0) {
      // 退化为查找最高层级
      for (let level = 5; level >= 2; level--) {
        const found = compressedSummaries.summaries.filter((s,) => s.level === level,)
        if (found.length > 0) {
          return found.map((s,) => s.content,).join('\n',)
        }
      }
      return ''
    }
    return l6Summaries.map((s,) => s.content,).join('\n',)
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
      aiImportanceMap: this.aiImportanceMap,
      aiArcStatusMap: this.aiArcStatusMap,
      aiArcTypeMap: this.aiArcTypeMap,
      aiEntityMap: this.aiEntityMap,
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
      aiImportanceMap?: Map<number, EventImportance>
      aiArcStatusMap?: Map<number, 'start' | 'ongoing' | 'end'>
      aiArcTypeMap?: Map<number, ClosureType>
      aiEntityMap?: Map<number, string[]>
    }
    if (value.taggedEvents) this.taggedEvents = structuredClone(value.taggedEvents)
    if (value.searchIndex) this.searchIndex = structuredClone(value.searchIndex)
    if (value.activeClosure) this.activeClosure = value.activeClosure
    if (value.rawEvents) this.rawEvents = structuredClone(value.rawEvents)
    if (value.aggregatedEvents) this.aggregatedEvents = structuredClone(value.aggregatedEvents)
    if (value.stats) this.stats = structuredClone(value.stats)
    if (value.aiImportanceMap) this.aiImportanceMap = structuredClone(value.aiImportanceMap)
    if (value.aiArcStatusMap) this.aiArcStatusMap = structuredClone(value.aiArcStatusMap)
    if (value.aiArcTypeMap) this.aiArcTypeMap = structuredClone(value.aiArcTypeMap)
    if (value.aiEntityMap) this.aiEntityMap = structuredClone(value.aiEntityMap)
  }

  reset(): void {
    this.taggedEvents = []
    this.searchIndex = []
    this.activeClosure = 'none'
    this.rawEvents = []
    this.aggregatedEvents = []
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
