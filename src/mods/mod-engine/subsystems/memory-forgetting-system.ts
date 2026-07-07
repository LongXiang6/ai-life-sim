/**
 * @module memory-forgetting-system.ts
 * @description 记忆遗忘机制 —— 智能过滤不重要信息，保留关键记忆
 * @mod mod-engine
 *
 * 设计理念：
 *   遗忘可以减少 token 消耗，但不应导致剧情断裂。
 *   小事不应遗忘——正是这些小事组成了一个人。
 *
 * 核心机制：
 *   - 触发时机：在 L2 压缩时触发（每 25 轮检查一次），避免太频繁
 *   - 遗忘对象：L1 摘要中的重复事件、无意义日常
 *   - 保留规则：重大事件、人物关系变化、关键转折不遗忘
 *   - 小事保留：随机保留 10% 的日常小事，形成人物性格记忆
 *   - 因果联动：因果标记的事件永不遗忘
 */

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
  CompressedSummaries,
} from '@/foundation'

import { coreMemory } from './core-memory-system'
import { extractEntities } from '../helpers/digest-ledger'

import {
  COMPRESS_L2_MERGE_INTERVAL,
} from '../constants'

// ============================================================
// 类型定义
// ============================================================

/** 遗忘检查结果 */
export interface ForgettingCheckResult {
  /** 是否触发遗忘 */
  triggered: boolean
  /** 遗忘的摘要索引列表 */
  forgottenIndices: number[]
  /** 保留的摘要列表 */
  retainedSummaries: Array<{ level: number; startRound: number; endRound: number; content: string }>
  /** 遗忘原因统计 */
  reasons: {
    repetitive: number
    trivial: number
    retainedImportant: number
    retainedSmall: number
    retainedCausal: number,
  }
}

/** 遗忘配置 */
export interface ForgettingConfig {
  /** 遗忘触发间隔（轮次） */
  triggerInterval: number
  /** 重复事件遗忘阈值（相似度 > 此值则遗忘） */
  repetitiveThreshold: number
  /** 小事保留比例（0-1） */
  smallEventRetentionRate: number
  /** 最大遗忘比例（每次最多遗忘多少比例的摘要） */
  maxForgettingRate: number,
}

/** 因果标记事件 */
export interface CausalMarkedEvent {
  /** 事件轮次 */
  round: number
  /** 事件类型 */
  type: 'kindness' | 'grudge' | 'promise' | 'debt' | 'foreshadow'
  /** 事件描述 */
  description: string
  /** 严重程度 */
  severity: 'minor' | 'normal' | 'major' | 'critical'
  /** 是否已触发回报 */
  resolved: boolean,
}

// ============================================================
// 常量
// ============================================================

/** 默认遗忘配置 */
const DEFAULT_FORGETTING_CONFIG: ForgettingConfig = {
  triggerInterval: COMPRESS_L2_MERGE_INTERVAL, // 25轮触发一次
  repetitiveThreshold: 0.7, // 相似度 > 70% 则遗忘
  smallEventRetentionRate: 0.1, // 保留 10% 小事
  maxForgettingRate: 0.3, // 每次最多遗忘 30%,
}

/** 重大事件关键词（永不遗忘） */
const IMPORTANT_KEYWORDS = [
  '出生', '死亡', '结婚', '离婚', '生子', '丧亲',
  '继承', '登基', '退位', '篡位', '叛乱', '战争',
  '突破', '觉醒', '觉醒', '顿悟', '入魔', '陨落',
  '获得', '失去', '发现', '发明', '创造', '毁灭',
  '结盟', '背叛', '复仇', '救赎', '牺牲', '拯救',
  '晋升', '降职', '封爵', '贬谪', '流放', '召回',
  '契约', '誓言', '诅咒', '祝福', '预言', '命运',
]

/** 人物关系关键词（永不遗忘） */
const RELATIONSHIP_KEYWORDS = [
  '相识', '结识', '成为朋友', '成为敌人', '结为', '订婚',
  '相爱', '分手', '和解', '决裂', '重逢', '离别',
  '收养', '认亲', '认祖', '认主', '收徒', '拜师',
  '救命', '恩人', '仇人', '宿敌', '挚友', '知己',
]

/** 日常小事关键词（可遗忘，但随机保留） */
const TRIVIAL_KEYWORDS = [
  '日常', '生活', '吃饭', '睡觉', '散步', '闲聊',
  '看书', '练习', '修炼', '打坐', '冥想', '休息',
  '逛街', '购物', '游玩', '散步', '闲逛', '漫步',
  '整理', '打扫', '清洗', '维护', '检查', '巡视',
  '重复', '日复一日', '一如既往', '平淡', '寻常',
]

/** 无意义重复模式 */
const REPETITIVE_PATTERNS = [
  /日复一日/,
  /一如既往/,
  /平淡无奇/,
  /重复着/,
  /每天/,
  /每日/,
  /照常/,
  /依旧/,
  /继续/,
]

// ============================================================
// MemoryForgettingSystem
// ============================================================

export class MemoryForgettingSystem implements ISubSystem {
  readonly id = 'memory-forgetting' as const
  readonly mod = 'mod-engine' as const
  readonly label = '记忆遗忘' as const
  readonly description = '智能过滤不重要信息，保留关键记忆和因果标记事件' as const

  /** 遗忘配置 */
  private config: ForgettingConfig = DEFAULT_FORGETTING_CONFIG

  /** 因果标记事件列表 */
  private causalEvents: CausalMarkedEvent[] = []

  /** 遗忘统计 */
  private stats = {
    totalChecks: 0,
    totalForgotten: 0,
    totalRetained: 0,
    lastCheckAt: 0,
  }

  // ---- 公共方法 ----

  /** 获取配置 */
  getConfig(): ForgettingConfig {
    return { ...this.config }
  }

  /** 设置配置 */
  setConfig(newConfig: Partial<ForgettingConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /** 获取因果事件 */
  getCausalEvents(): CausalMarkedEvent[] {
    return [...this.causalEvents]
  }

  /** 添加因果标记 */
  addCausalMark(event: CausalMarkedEvent): void {
    // 去重检查
    const existing = this.causalEvents.find(
      (e) => e.round === event.round && e.type === event.type,
    )
    if (!existing) {
      this.causalEvents.push(event)
      // 上限保护：保持最多 100 条因果事件
      if (this.causalEvents.length > 100) {
        this.causalEvents.shift()
      }
    }
  }

  /** 标记因果已解决 */
  resolveCausalMark(round: number, type: CausalMarkedEvent['type']): void {
    const event = this.causalEvents.find(
      (e) => e.round === round && e.type === type,
    )
    if (event) {
      event.resolved = true
    }
  }

  /** 标记伏笔事件（永不遗忘，直到回收） */
  markForeshadowEvent(round: number, description: string): void {
    this.addCausalMark({
      round,
      type: 'foreshadow',
      description: description,
      severity: 'major',
      resolved: false,
    })
  }

  /** 标记伏笔已回收 */
  resolveForeshadowMark(round: number): void {
    this.resolveCausalMark(round, 'foreshadow')
  }

  /** 获取统计 */
  getStats() {
    return { ...this.stats }
  }

  // ============================================================
  // 核心方法：遗忘检查
  // ============================================================

  /**
   * 执行遗忘检查
   *
   * @param summaries 当前压缩摘要列表
   * @param currentRound 当前轮次
   * @returns 遗忘检查结果
   */
  checkForforgetting(
    summaries: CompressedSummaries,
    currentRound: number,
  ): ForgettingCheckResult {
    this.stats.totalChecks++
    this.stats.lastCheckAt = Date.now()

    // 检查是否触发遗忘
    if (currentRound % this.config.triggerInterval !== 0) {
      return {
        triggered: false,
        forgottenIndices: [],
        retainedSummaries: summaries.summaries,
        reasons: {
          repetitive: 0,
          trivial: 0,
          retainedImportant: 0,
          retainedSmall: 0,
          retainedCausal: 0,
        },
      }
    }

    // 只处理 L1 摘要（L2+ 已经压缩过了）
    const l1Summaries = summaries.summaries.filter((s) => s.level === 1)
    const higherLevelSummaries = summaries.summaries.filter((s) => s.level >= 2)

    // 分析每个摘要
    const analysisResults = l1Summaries.map((summary, index) =>
      this.analyzeSummary(summary, index),
    )

    // 决定遗忘哪些
    const forgottenIndices: number[] = []
    const retainedSummaries: Array<{
      level: number
      startRound: number
      endRound: number
      content: string
    }> = [...higherLevelSummaries]

    const reasons = {
      repetitive: 0,
      trivial: 0,
      retainedImportant: 0,
      retainedSmall: 0,
      retainedCausal: 0,
    }

    // 计算最大可遗忘数量
    const maxForget = Math.floor(l1Summaries.length * this.config.maxForgettingRate)

    for (const result of analysisResults) {
      // 因果标记 → 永不遗忘
      if (result.hasCausalMark) {
        retainedSummaries.push(result.summary)
        reasons.retainedCausal++
        continue
      }

      // 重大事件 → 永不遗忘
      if (result.isImportant) {
        retainedSummaries.push(result.summary)
        reasons.retainedImportant++
        continue
      }

      // 人物关系 → 永不遗忘
      if (result.hasRelationship) {
        retainedSummaries.push(result.summary)
        reasons.retainedImportant++
        continue
      }

      // CoreMemory NPC 关系网 → 永不遗忘
      if (result.mentionsProtectedNpc) {
        retainedSummaries.push(result.summary)
        reasons.retainedImportant++
        continue
      }

      // 重复事件 → 遗忘
      if (result.isRepetitive && forgottenIndices.length < maxForget) {
        forgottenIndices.push(result.originalIndex)
        reasons.repetitive++
        continue
      }

      // 日常小事 → 随机保留
      if (result.isTrivial) {
        if (Math.random() < this.config.smallEventRetentionRate) {
          retainedSummaries.push(result.summary)
          reasons.retainedSmall++
        } else if (forgottenIndices.length < maxForget) {
          forgottenIndices.push(result.originalIndex)
          reasons.trivial++
        } else {
          retainedSummaries.push(result.summary)
        }
        continue
      }

      // 其他 → 保留
      retainedSummaries.push(result.summary)
    }

    this.stats.totalForgotten += forgottenIndices.length
    this.stats.totalRetained += retainedSummaries.length - higherLevelSummaries.length

    return {
      triggered: true,
      forgottenIndices,
      retainedSummaries,
      reasons,
    }
  }

  /**
   * 分析单个摘要
   */
  private analyzeSummary(
    summary: { level: number; startRound: number; endRound: number; content: string },
    originalIndex: number,
  ) {
    const content = summary.content

    // 检查因果标记
    const hasCausalMark = this.causalEvents.some(
      (e) =>
        e.round >= summary.startRound &&
        e.round <= summary.endRound &&
        !e.resolved,
    )

    // 检查重大事件关键词
    const isImportant = IMPORTANT_KEYWORDS.some((kw) => content.includes(kw))

    // 检查人物关系关键词
    const hasRelationship = RELATIONSHIP_KEYWORDS.some((kw) => content.includes(kw))

    // 检查重复模式
    const isRepetitive = REPETITIVE_PATTERNS.some((p) => p.test(content))

    // 检查日常小事
    const isTrivial = TRIVIAL_KEYWORDS.some((kw) => content.includes(kw))

    // 娱乐性护栏：CoreMemory 已登记 NPC 相关摘要不可遗忘
    const protectedNpcNames = coreMemory.getProtectedNpcNames()
    const mentionsProtectedNpc = protectedNpcNames.some((name) => name.length > 0 && content.includes(name))

    return {
      summary,
      originalIndex,
      hasCausalMark,
      isImportant,
      hasRelationship,
      isRepetitive,
      isTrivial,
      mentionsProtectedNpc,
    }
  }

  /**
   * 计算两个摘要的相似度（用于检测重复）
   */
  private calculateSimilarity(content1: string, content2: string): number {
    // 中文没有天然空格，使用摘要账本同口径实体块计算重叠，避免整句变成一个 token。
    const words1 = [...extractEntities(content1)]
    const words2 = [...extractEntities(content2)]

    if (words1.length === 0 || words2.length === 0) return 0

    const set1 = new Set(words1)
    const set2 = new Set(words2)

    const intersection = [...set1].filter((w) => set2.has(w)).length
    const union = set1.size + set2.size - intersection

    return intersection / union
  }

  /**
   * 清理已解决的因果标记
   */
  cleanupResolvedCausalMarks(): void {
    this.causalEvents = this.causalEvents.filter((e) => !e.resolved)
  }

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】检查:${this.stats.totalChecks} 遗忘:${this.stats.totalForgotten} 保留:${this.stats.totalRetained} 因果:${this.causalEvents.length}`,
      data: structuredClone({
        config: this.config,
        causalEvents: this.causalEvents,
        stats: this.stats,
      }),
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

    // 应用配置变更
    if (changes.changes.config) {
      this.setConfig(changes.changes.config)
    }

    // 应用因果标记变更
    if (changes.changes.addCausalMark) {
      this.addCausalMark(changes.changes.addCausalMark as CausalMarkedEvent)
    }

    if (changes.changes.resolveCausalMark) {
      const { round, type } = changes.changes.resolveCausalMark as { round: number; type: CausalMarkedEvent['type'] }
      this.resolveCausalMark(round, type)
    }
  }

  reset(): void {
    this.config = DEFAULT_FORGETTING_CONFIG
    this.causalEvents = []
    this.stats = {
      totalChecks: 0,
      totalForgotten: 0,
      totalRetained: 0,
      lastCheckAt: 0,
    }
  }
}

/** 单例 */
export const memoryForgetting = new MemoryForgettingSystem()
