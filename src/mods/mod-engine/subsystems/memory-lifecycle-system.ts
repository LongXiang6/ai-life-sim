/**
 * @module memory-lifecycle-system.ts
 * @description 记忆生命周期系统 —— 三层记忆分离 + 重要度分层 + 事件闭环驱动 + 事件聚合
 * @mod mod-engine
 *
 * 四方案融合设计：
 *   A. 三层记忆分离：状态卡(始终在)+叙事窗(L0近期)+历史纲(L6)，L2-L5转为检索索引
 *   B. 重要度分层：每轮叙事评分为HIGH/NORMAL/LOW，差异化压缩保留
 *   C. 事件闭环驱动：检测叙事弧完成后再触发压缩，避免语义断裂
 *   D. 事件聚合（合并自 span-event-aggregator）：严重度排序 + 因果链合并 + 比例限制 + 数量上限
 *
 * 架构：
 *   L0原始叙事 → 重要性评分 → 事件闭环检测 → 事件聚合(严重度排序+因果合并+比例限制) → 差异化压缩 → 检索索引 → Prompt注入
 *
 * 每轮Prompt注入内容（精简到极致）：
 *   1. 状态卡（subsystem summaries，结构化当前状态）
 *   2. 最近5轮L0原文（细节完整的短期记忆）
 *   3. L6历史纲要（一生纵览，长期记忆框架）
 *   4. 检索命中摘要（L2-L5中匹配当前关键字的内容，"突然想起来的往事"）
 *   5. 聚合事件（严重事件优先，因果链合并，比例控制）
 *
 * 重要性评分规则：
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

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'

// Uses pattern matching via patternManager; USE_PATTERN_MANAGER feature flag managed centrally

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
  matchedKeywords: string[]
  isClosure: boolean
  closureType: ClosureType,
}

/** 单个L0事件的完整标记 */
export interface TaggedEvent {
  /** 轮次 */
  round: number
  /** 叙事文本 */
  narrative: string
  /** 重要度 */
  importance: EventImportance
  /** 是否闭环 */
  isClosure: boolean
  /** 闭环类型 */
  closureType: ClosureType
  /** 标记的检索关键词 */
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
  /** 索引关键词 */
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
const CAUSAL_SIMILARITY_THRESHOLD = 0.6

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
  /** 最近N轮原文 */
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
  /** 检索命中（从L2-L5关键词匹配） */
  retrievalHits: string[],
}

// ============================================================
// 常量
// ============================================================

/** 重要性关键词 - HIGH */
const HIGH_KEYWORDS: string[] = [
  '死亡', '阵亡', '牺牲', '战死', '去世',
  '突破', '觉醒', '飞升', '入魔', '涅槃',
  '背叛', '复仇', '决裂', '血战', '大捷',
  '结婚', '生子', '诞子', '继承', '登基',
  '婚约', '订婚', '成亲', '大婚',
  '发现', '发明', '创造', '毁灭', '拯救',
  '契约', '诅咒', '预言', '命运', '天机',
  '折寿', '减寿', '禁术', '寿元',
  '重伤', '濒死', '重生', '转世', '升仙',
]

/** 重要性关键词 - NORMAL */
const NORMAL_KEYWORDS: string[] = [
  '相识', '结识', '成为朋友', '结盟',  '合作',
  '迁移', '旅行', '远行', '搬迁', '抵达',
  '学习', '拜师', '收徒', '传授', '习得',
  '晋升', '升职', '任职', '离职', '转行',
  '获得', '得到', '发现', '接收', '赠与',
  '经商', '交易', '出售', '购买', '投资',
  '冲突', '争吵', '不和', '矛盾', '分歧',
  '和解', '和好', '原谅', '释怀', '放下',
]

/** 重要性关键词 - LOW */
const LOW_KEYWORDS: string[] = [
  '日常', '生活', '吃饭', '睡觉', '散步',
  '看书', '练习', '修炼', '打坐', '冥想',
  '逛街', '闲逛', '漫步', '休整', '调整',
  '整理', '打扫', '清洗', '维护', '检查',
  '闲聊', '闲谈', '应酬', '寒暄', '客套',
  '重复', '日复一日', '一如既往', '平淡', '寻常',
]

/** 闭环检测模式 */
const CLOSURE_PATTERNS: Record<ClosureType, { start: RegExp; end: RegExp }> = {
  battle: {
    start: /战斗|开战|出击|交[战锋]|厮杀|决战/,
    end: /胜利|凯旋|战败|撤退|击退|歼灭|平定|终[结战]|结束.*(战斗|战役|战争)/,
  },
  journey: {
    start: /出发|启程|动身|踏上|前往|离家|出行/,
    end: /抵达|到达|返回|归来|回到|到达.*(目的地|终点)/,
  },
  task: {
    start: /接受.*(任务|委托|请求)|答应|承诺|约定/,
    end: /完成.*(任务|委托|请求)|兑现|实现.*(承诺|约定)/,
  },
  relationship: {
    start: /相识|结识|认识|遇见|相遇/,
    end: /成为.*(朋友|敌人|师徒|伴侣|夫妻)|结盟|决裂|和解|订婚/,
  },
  life_stage: {
    start: /年幼|童年|少年|青年|壮年|中年|老年|暮年/,
    end: /成年|及冠|及笄|弱冠|而立|不惑|知天命/,
  },
  none: { start: /$^/, end: /$^/, }, // 永不匹配,
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

/** 检索关键词索引最大条目数 */
const MAX_INDEX_ENTRIES = 50

/** 每轮检索命中最大注入量 */
const MAX_RETRIEVAL_HITS = 3

// ============================================================
// MemoryLifecycleSystem
// ============================================================

export class MemoryLifecycleSystem implements ISubSystem {
  readonly id = 'memory-lifecycle' as const
  readonly mod = 'mod-engine' as const
  readonly label = '记忆生命周期' as const
  readonly description = '三层记忆分离+重要度分层+事件闭环驱动，精简Prompt注入' as const

  // ---- 状态 ----

  /** 当前块中已标记的事件（尚未压缩） */
  private taggedEvents: TaggedEvent[] = []

  /** 检索索引（L2-L5摘要的关键词索引） */
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

  /** 设置 AI 标注的轮次重要性（在 handleNarrativeResponse 中调用） */
  setAIRoundImportance(round: number, importance: 'HIGH' | 'NORMAL' | 'LOW'): void {
    this.aiImportanceMap.set(round, importance)
  }

  // ============================================================
  // 核心方法0：重要性评分（简化版，返回 0-1 分数供压缩决策使用）
  // 设计：基于关键词命中计算 0-1 重要性分数
  //   - HIGH 关键词命中 → 0.8-1.0
  //   - NORMAL 关键词命中 → 0.3-0.7
  //   - LOW / 无命中 → 0.0-0.2
  // ============================================================

  /**
   * 评估叙事片段的语义重要性（0-1 分数）
   *
   * 用途：供压缩系统按重要性加权分配 Token 预算
   *   高分事件：保留更多细节（更高 token budget）
   *   低分事件：可更激进压缩（节省 token）
   *
   * @param narrative 叙事文本
   * @returns 0-1 重要性分数
   */
  rateImportance(narrative: string): number {
    let hitCount = 0

    // 检查 HIGH 关键词（权重最高）
    for (const kw of HIGH_KEYWORDS) {
      if (narrative.includes(kw)) {
        hitCount++
      }
    }

    // 上限检查：HIGH 命中即高分段
    if (hitCount > 0) {
      return Math.min(1.0, 0.7 + hitCount * 0.1)
    }

    // 检查 NORMAL 关键词
    for (const kw of NORMAL_KEYWORDS) {
      if (narrative.includes(kw)) {
        hitCount++
      }
    }

    if (hitCount > 0) {
      return Math.min(0.7, 0.2 + hitCount * 0.1)
    }

    // 检查 LOW 关键词
    for (const kw of LOW_KEYWORDS) {
      if (narrative.includes(kw)) {
        hitCount++
      }
    }

    // 无匹配关键词：最低分（日常流水）
    return Math.min(0.2, hitCount * 0.05)
  }

  // ============================================================
  // 核心方法1：重要性评分 + 闭环检测
  // ============================================================

  /**
 * 分析一轮叙事的重要性并检测是否闭环
 *
 * 判定策略：最高命中等级制
 *   - 只要命中一个HIGH关键词 → HIGH（日常再多也无法淹没重要事件）
 *   - 命中NORMAL关键词（且无HIGH） → NORMAL
 *   - 什么都没有命中 → LOW
 *
 * @param narrative 本轮叙事文本
 * @param round 轮次
 * @returns 评分结果
 */
scoreImportance(narrative: string, round: number,): ImportanceResult {
  const matchedKeywords: string[] = []

  // ⭐ F1：优先参考 AI 标注的重要性（辅助关键词匹配，不替代）
  const aiImportance = this.aiImportanceMap.get(round)
  const aiBoost = aiImportance === 'HIGH' ? 2 : aiImportance === 'NORMAL' ? 0 : -1

  // 检查HIGH关键词（优先级最高，只要命中就是HIGH）
  for (const kw of HIGH_KEYWORDS) {
    if (narrative.includes(kw,)) {
      matchedKeywords.push(kw,)
    }
  }

  if (matchedKeywords.length > 0) {
    // 命中HIGH关键词 → 直接判定为HIGH
    const result: ImportanceResult = {
      importance: 'HIGH',
      score: matchedKeywords.length * 3,
      matchedKeywords,
      isClosure: false,
      closureType: 'none',
    }

    // 检测事件闭环
    const closureInfo = this.detectClosure(narrative,)
    result.isClosure = closureInfo.detected
    result.closureType = closureInfo.type

    // 存入已标记事件
    this.taggedEvents.push({
      round,
      narrative,
      importance: 'HIGH',
      isClosure: result.isClosure,
      closureType: result.closureType,
      tags: matchedKeywords,
    },)

    this.stats.totalScored++
    this.stats.totalHigh++

    return result
  }

  // 检查NORMAL关键词
  const normalHits: string[] = []
  for (const kw of NORMAL_KEYWORDS) {
    if (narrative.includes(kw,)) {
      normalHits.push(kw,)
    }
  }

  if (normalHits.length > 0) {
    // 命中NORMAL关键词 → 但 AI 标注 HIGH 时升级
    const effectiveImportance: EventImportance = aiBoost >= 2 ? 'HIGH' : 'NORMAL'
    const result: ImportanceResult = {
      importance: effectiveImportance,
      score: normalHits.length * 2 + aiBoost,
      matchedKeywords: normalHits,
      isClosure: false,
      closureType: 'none',
    }

    const closureInfo = this.detectClosure(narrative,)
    result.isClosure = closureInfo.detected
    result.closureType = closureInfo.type

    this.taggedEvents.push({
      round,
      narrative,
      importance: effectiveImportance,
      isClosure: result.isClosure,
      closureType: result.closureType,
      tags: normalHits,
    },)

    this.stats.totalScored++
    if (effectiveImportance === 'HIGH') {
      this.stats.totalHigh++
    } else {
      this.stats.totalNormal++
    }

    return result
  }

  // 无 HIGH/NORMAL 匹配 → 检查 LOW 关键词 + AI 标注
  const lowHits: string[] = []
  for (const kw of LOW_KEYWORDS) {
    if (narrative.includes(kw,)) {
      lowHits.push(kw,)
    }
  }

  const closureInfo = this.detectClosure(narrative,)

  // AI 标注可升级 LOW → NORMAL/HIGH（AI 判断"这很重要"但关键词没覆盖）
  const effectiveLowImportance: EventImportance =
    aiBoost >= 2 ? 'HIGH' : aiBoost >= 0 ? 'NORMAL' : 'LOW'

  this.taggedEvents.push({
    round,
    narrative,
    importance: effectiveLowImportance,
    isClosure: closureInfo.detected,
    closureType: closureInfo.type,
    tags: lowHits,
  },)

  this.stats.totalScored++
  if (effectiveLowImportance === 'HIGH') {
    this.stats.totalHigh++
  } else if (effectiveLowImportance === 'NORMAL') {
    this.stats.totalNormal++
  } else {
    this.stats.totalLow++
  }

  return {
    importance: effectiveLowImportance,
    score: lowHits.length + aiBoost,
    matchedKeywords: lowHits,
    isClosure: closureInfo.detected,
    closureType: closureInfo.type,
  }
}

  /**
   * 检测叙事中是否发生了事件闭环
   */
  private detectClosure(narrative: string,): { detected: boolean; type: ClosureType } {
    // 检查当前活跃的闭环类型
    if (this.activeClosure !== 'none') {
      const pattern = CLOSURE_PATTERNS[this.activeClosure]
      if (pattern.end.test(narrative,)) {
        // 闭环结束
        const closed = this.activeClosure
        this.activeClosure = 'none'
        return { detected: true, type: closed, }
      }
      // 正在战斗中/任务中，未闭合
      return { detected: false, type: this.activeClosure, }
    }

    // 检查是否有新的闭环开始
    for (const [type, patterns,] of Object.entries(CLOSURE_PATTERNS,)) {
      if (type === 'none') continue
      if (patterns.start.test(narrative,)) {
        // 新闭环开始
        this.activeClosure = type as ClosureType
        // 同时检查是否在同轮内完成闭环
        if (patterns.end.test(narrative,)) {
          this.activeClosure = 'none'
          return { detected: true, type: type as ClosureType, }
        }
        return { detected: false, type: type as ClosureType, }
      }
    }

    return { detected: false, type: 'none', }
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
      prompt += `【日常流水（保留10%关键词）】\n`
      prompt += lowEvents.map((e,) => `第${e.round}轮[LOW]：${e.narrative}`,).join('\n',)
    }

    return prompt
  }

  /** 压缩完成后清空已标记事件 */
  clearTaggedEvents(): void {
    this.stats.totalCompressions++
    this.taggedEvents = []
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
    if (events.length <= 1) return events

    const merged: RawEvent[] = []
    const usedIndices = new Set<number>()

    for (let i = 0; i < events.length; i++) {
      if (usedIndices.has(i,)) continue

      const current = events[i]
      const mergedEvent = { ...current, }

      for (let j = i + 1; j < events.length; j++) {
        if (usedIndices.has(j,)) continue

        const other = events[j]
        if (current.effect && other.cause && this.areCausallyLinked(current.effect, other.cause,)) {
          mergedEvent.description += ` → ${other.description}`
          usedIndices.add(j,)
        } else if (current.cause && other.effect && this.areCausallyLinked(other.effect, current.cause,)) {
          mergedEvent.description = `${other.description} → ${mergedEvent.description}`
          mergedEvent.title = other.title
          mergedEvent.severity = SEVERITY_WEIGHT[current.severity] >= SEVERITY_WEIGHT[other.severity]
            ? current.severity : other.severity
          usedIndices.add(j,)
        }
      }

      merged.push(mergedEvent,)
      usedIndices.add(i,)
    }

    return merged
  }

  private areCausallyLinked(effect: string, cause: string,): boolean {
    const effectWords = effect.toLowerCase().split(/\s+/,)
    const causeWords = cause.toLowerCase().split(/\s+/,)
    let matches = 0
    for (const word of effectWords) {
      if (causeWords.includes(word,)) matches++
    }
    return matches / Math.max(effectWords.length, causeWords.length,) >= CAUSAL_SIMILARITY_THRESHOLD
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
   * L2-L5摘要不注入Prompt，而是存入索引。
   * 当后续叙事中出现匹配关键词时，按需检索并临时注入。
   */
  addToIndex(
    level: number,
    startRound: number,
    endRound: number,
    content: string,
    events: TaggedEvent[],
  ): void {
    // 从原始事件中提取关键词
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

    this.searchIndex.push(entry,)

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
   * 按需检索：给定叙事文本，从索引中检索匹配的摘要
   *
   * 检索策略（替代动态多层级地图）：
   *   1. 关键词匹配：叙事文本中的词与索引标签匹配
   *   2. 重要度加成：HIGH 事件优先，NORMAL 次之
   *   3. 区域感知：如果叙事中提到地点/区域名，额外加成该区域的条目
   *
   * 设计理念：不创建动态多层级地图系统，而是利用已有的检索索引机制。
   * 当角色移动到新的区域时，叙事中会自然提到该区域的名字，
   * 检索引擎会自动从索引中调取该区域的叙事历史，实现"区域感知"。
   *
   * 这等价于：L0=角色当前位置的叙事，L1=城镇级摘要，L2=区域级摘要，
   * L3=大陆级摘要，L4+=世界级摘要。检索引擎按关键词匹配自动选择
   * 相关层级的摘要注入 Prompt，无需手动管理地图层级。
   *
   * @param queryText 当前叙事（用于关键词匹配）
   * @returns 匹配的摘要内容列表
   */
  retrieveFromIndex(queryText: string,): string[] {
    if (this.searchIndex.length === 0) return []

    // 提取叙事中的地点/区域关键词
    const regionKeywords = this.extractRegionKeywords(queryText,)

    const results: Array<{ entry: IndexEntry; score: number }> = []

    for (const entry of this.searchIndex) {
      let score = 0

      // 0. 重要性基础分（娱乐性优先：HIGH 条目不应依赖关键词才出现）
      if (entry.maxImportance === 'HIGH') score += 4
      else if (entry.maxImportance === 'NORMAL') score += 2

      // 0b. AI 标注重要性加成（F1：跨轮次 AI importance 参与排序）
      for (let r = entry.startRound; r <= entry.endRound; r++) {
        const aiImp = this.aiImportanceMap.get(r)
        if (aiImp === 'HIGH') { score += 4; break }
        if (aiImp === 'NORMAL') score += 2
      }

      // 1. 关键词匹配
      for (const tag of entry.tags) {
        if (queryText.includes(tag,)) {
          score += 1
        }
      }

      // 2. 区域感知加成：如果叙事中提到该条目所在区域，额外加分
      for (const region of regionKeywords) {
        if (entry.tags.includes(region,)) {
          score += 2 // 区域匹配权重较高
        }
        // 区域名也匹配内容中的文本
        if (entry.content.includes(region,)) {
          score += 1
        }
      }

      // 3. 重要度加成
    if (entry.maxImportance === 'HIGH') score *= 2
    else if (entry.maxImportance === 'NORMAL') score *= 1.5

    // 4. HIGH 保底：重要记忆即使无关键词也应进入候选（娱乐性 > token）
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

  /**
   * 从叙事文本中提取地点/区域关键词
   *
   * 策略：匹配常见的地点模式（XX城、XX国、XX大陆、XX山脉等）
   *
   * @param text 叙事文本
   * @returns 提取到的区域关键词列表
   */
  private extractRegionKeywords(text: string,): string[] {
    const regionPatterns = [
      /([\u4e00-\u9fa5]{1,6}(?:城|镇|村|庄|堡|寨))/g,
      /([\u4e00-\u9fa5]{1,6}(?:国|邦|帝国|王国|共和国))/g,
      /([\u4e00-\u9fa5]{1,6}(?:大陆|洲|岛屿|半岛))/g,
      /([\u4e00-\u9fa5]{1,6}(?:山脉|河流|湖泊|森林|沙漠|草原|海洋))/g,
      /([\u4e00-\u9fa5]{1,6}(?:秘境|禁地|圣地|遗迹|战场))/g,
    ]

    const keywords = new Set<string>()
    for (const pattern of regionPatterns) {
      const matches = text.match(pattern,)
      if (matches) {
        for (const match of matches) {
          keywords.add(match,)
        }
      }
    }

    return [...keywords,]
  }

  // ============================================================
  // 核心方法4：富Prompt组装（4压缩层级+L0，适配1M上下文）
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
   * 共4个压缩层级 + L0原文 + 状态卡 + 检索命中
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
      recentNarratives: recentNarratives.slice(-5,),
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
