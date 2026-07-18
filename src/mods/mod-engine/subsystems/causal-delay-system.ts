/**
 * @module causal-delay-system.ts
 * @description 因果触发系统 —— 记录重大事件，若干年后触发因果回报
 * @mod mod-engine
 *
 * 设计理念：
 *   因果系统记录角色一生中的重大事件（恩情、仇恨、承诺、债务），
 *   在若干年后触发因果回报。与长期记忆引擎和记忆遗忘系统联动。
 *
 * 核心机制：
 *   - 记录重大事件类型：恩情(kindness)、仇恨(grudge)、承诺(promise)、债务(debt)
 *   - 每轮检查是否有因果事件需要触发
 *   - 触发条件：时间延迟 + 事件严重程度
 *   - 与记忆遗忘系统联动：因果标记的事件永不遗忘
 *   - 与长期记忆引擎联动：共享事件数据
 */

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'

import { memoryForgetting } from './memory-forgetting-system'

// ============================================================
// 类型定义
// ============================================================

/** 因果事件类型 */
export type CausalEventType = 'kindness' | 'grudge' | 'promise' | 'debt'

/** 因果事件严重程度 */
export type CausalSeverity = 'minor' | 'normal' | 'major' | 'critical'

/** 因果事件记录 */
export interface CausalEvent {
  /** 事件唯一ID */
  id: string
  /** 事件类型 */
  type: CausalEventType
  /** 严重程度 */
  severity: CausalSeverity
  /** 发生轮次 */
  round: number
  /** 发生年龄 */
  age: number
  /** 事件描述 */
  description: string
  /** 相关人物 */
  relatedPerson?: string
  /** 相关势力 */
  relatedFaction?: string
  /** 触发延迟（轮次） */
  triggerDelay: number
  /** 是否已触发 */
  triggered: boolean
  /** 触发轮次 */
  triggeredRound?: number
  /** 触发结果描述 */
  triggerResult?: string
}

/** 因果触发结果 */
export interface CausalTriggerResult {
  /** 是否有触发 */
  hasTriggered: boolean
  /** 触发的因果事件列表 */
  triggeredEvents: CausalEvent[]
  /** 触发叙事文本 */
  narrativeText: string,
}

/** 因果系统配置 */
export interface CausalConfig {
  /** 最小触发延迟（轮次） */
  minTriggerDelay: number
  /** 最大触发延迟（轮次） */
  maxTriggerDelay: number
  /** 严重程度对应的延迟倍数 */
  severityDelayMultipliers: Record<CausalSeverity, number>
  /** 每轮最大触发事件数 */
  maxTriggerPerRound: number,
}

// ============================================================
// 常量
// ============================================================

/** 默认因果配置 */
const DEFAULT_CAUSAL_CONFIG: CausalConfig = {
  minTriggerDelay: 5, // 最少5轮后触发
  maxTriggerDelay: 100, // 最多100轮后触发
  severityDelayMultipliers: {
    minor: 1,
    normal: 2,
    major: 3,
    critical: 5,
  },
  maxTriggerPerRound: 2, // 每轮最多触发2个因果事件,
}

/** 因果事件类型描述 */
const CAUSAL_TYPE_DESCRIPTIONS: Record<CausalEventType, string> = {
  kindness: '恩情',
  grudge: '仇恨',
  promise: '承诺',
  debt: '债务',
}

const CAUSAL_SEVERITY_DESCRIPTIONS: Record<CausalSeverity, string> = {
  minor: '轻微',
  normal: '普通',
  major: '重大',
  critical: '关键',
}

// ============================================================
// CausalDelaySystem
// ============================================================

export class CausalDelaySystem implements ISubSystem {
  readonly id = 'causal-delay' as const
  readonly mod = 'mod-engine' as const
  readonly label = '因果触发' as const
  readonly description = '记录重大事件，若干年后触发因果回报，与长期记忆引擎联动' as const

  /** 因果配置 */
  private config: CausalConfig = DEFAULT_CAUSAL_CONFIG

  /** 因果事件列表 */
  private causalEvents: CausalEvent[] = []

  /** 统计 */
  private stats = {
    totalRecorded: 0,
    totalTriggered: 0,
    pendingEvents: 0,
    lastTriggerAt: 0,
  }

  // ---- 公共方法 ----

  /** 获取配置 */
  getConfig(): CausalConfig {
    return { ...this.config }
  }

  /** 设置配置 */
  setConfig(newConfig: Partial<CausalConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /** 获取所有因果事件 */
  getCausalEvents(): CausalEvent[] {
    return [...this.causalEvents]
  }

  /** 获取待触发事件 */
  getPendingEvents(): CausalEvent[] {
    return this.causalEvents.filter((e) => !e.triggered)
  }

  /** 获取已触发事件 */
  getTriggeredEvents(): CausalEvent[] {
    return this.causalEvents.filter((e) => e.triggered)
  }

  /** 获取统计 */
  getStats() {
    return { ...this.stats }
  }

  // ============================================================
  // 核心方法：记录因果事件
  // ============================================================

  /**
   * 记录因果事件
   *
   * @param type 事件类型
   * @param severity 严重程度
   * @param round 发生轮次
   * @param age 发生年龄
   * @param description 事件描述
   * @param relatedPerson 相关人物
   * @param relatedFaction 相关势力
   * @returns 因果事件ID
   */
  recordCausalEvent(
    type: CausalEventType,
    severity: CausalSeverity,
    round: number,
    age: number,
    description: string,
    relatedPerson?: string,
    relatedFaction?: string,
  ): string {
    // 计算触发延迟
    const baseDelay = this.config.minTriggerDelay + Math.floor(
      Math.random() * (this.config.maxTriggerDelay - this.config.minTriggerDelay),
    )
    const multiplier = this.config.severityDelayMultipliers[severity]
    const triggerDelay = Math.round(baseDelay * multiplier)

    // 生成唯一ID
    const id = `causal-${type}-${round}-${Date.now()}`

    // 创建因果事件
    const event: CausalEvent = {
      id,
      type,
      severity,
      round,
      age,
      description,
      relatedPerson,
      relatedFaction,
      triggerDelay,
      triggered: false,
    }

    // 存入列表
    this.causalEvents.push(event)
    this.stats.totalRecorded++
    this.stats.pendingEvents++

    // 同步到记忆遗忘系统（标记为因果事件，永不遗忘）
    memoryForgetting.addCausalMark({
      round,
      type,
      description,
      severity,
      resolved: false,
    })

    console.debug(`[CausalDelay] 记录因果事件：${CAUSAL_TYPE_DESCRIPTIONS[type]}（${severity}），延迟${triggerDelay}轮触发`)

    return id
  }

  // ============================================================
  // 核心方法：检查触发
  // ============================================================

  /**
   * 检查因果触发
   *
   * @param currentRound 当前轮次
   * @returns 因果触发结果
   */
  checkCausalTrigger(currentRound: number): CausalTriggerResult {
    // 找出待触发的事件
    const pendingEvents = this.causalEvents.filter((e) => !e.triggered)

    // 检查每个事件是否达到触发条件
    const readyEvents = pendingEvents.filter((e) => {
      const elapsedRounds = currentRound - e.round
      return elapsedRounds >= e.triggerDelay
    })

    // 按严重程度排序（critical > major > normal > minor）
    const severityOrder: Record<CausalSeverity, number> = {
      critical: 4,
      major: 3,
      normal: 2,
      minor: 1,
    }
    readyEvents.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])

    // 限制每轮触发数量
    const toTrigger = readyEvents.slice(0, this.config.maxTriggerPerRound)

    if (toTrigger.length === 0) {
      return {
        hasTriggered: false,
        triggeredEvents: [],
        narrativeText: '',
      }
    }

    // 此处仅返回本轮到期事项，不提前消费。只有主叙事完整协议与状态提交
    // 均通过后，orchestrator 才调用 commitCausalTriggers() 确认兑现。
    const narrativeText = this.buildTriggerNarrative(toTrigger)

    return {
      hasTriggered: true,
      triggeredEvents: structuredClone(toTrigger),
      narrativeText,
    }
  }

  /** 主叙事有效提交后，确认本轮已经兑现的因果事项。 */
  commitCausalTriggers(
    eventIds: readonly string[],
    currentRound: number,
    triggerResult?: string,
  ): CausalEvent[] {
    const idSet = new Set(eventIds)
    if (idSet.size === 0) return []

    const committed: CausalEvent[] = []
    for (const event of this.causalEvents) {
      if (event.triggered || !idSet.has(event.id)) continue
      event.triggered = true
      event.triggeredRound = currentRound
      event.triggerResult = triggerResult?.trim() || undefined
      this.stats.totalTriggered++
      this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1)
      memoryForgetting.resolveCausalMark(event.round, event.type)
      committed.push(structuredClone(event))
    }

    if (committed.length > 0) {
      this.stats.lastTriggerAt = Date.now()
      console.debug(
        `[CausalDelay] 确认兑现${committed.length}个因果事件：${committed.map((event) => CAUSAL_TYPE_DESCRIPTIONS[event.type]).join('、')}`,
      )
    }
    return committed
  }

  /**
   * 构建触发叙事文本
   */
  private buildTriggerNarrative(events: CausalEvent[]): string {
    const parts: string[] = [
      '【本轮到期因果；必须纳入同一条剧情主线】',
      '以下只陈述已经成立并到达处理节点的事实，不预设必然成功、报恩、复仇或清偿结果；请依据当前世界、人物能力、关系与阻力裁决具体展开。',
    ]

    for (const event of events) {
      const fields = [
        `类型：${CAUSAL_TYPE_DESCRIPTIONS[event.type]}`,
        `严重程度：${CAUSAL_SEVERITY_DESCRIPTIONS[event.severity]}`,
        `成立于第${event.round}轮、${event.age}岁时`,
        `已成立事实：${event.description}`,
        event.relatedPerson ? `相关人物：${event.relatedPerson}` : undefined,
        event.relatedFaction ? `相关势力：${event.relatedFaction}` : undefined,
      ].filter((field): field is string => Boolean(field))
      parts.push(fields.join('；'))
    }

    return parts.join('\n')
  }

  /**
   * 构建因果注入文本（用于Prompt）
   */
  buildCausalInjectionText(): string {
    const pendingEvents = this.getPendingEvents()

    if (pendingEvents.length === 0) {
      return ''
    }

    const parts: string[] = ['【因果待报】']

    // 按类型分组
    const byType: Record<CausalEventType, CausalEvent[]> = {
      kindness: [],
      grudge: [],
      promise: [],
      debt: [],
    }

    for (const event of pendingEvents) {
      byType[event.type].push(event)
    }

    // 构建分组描述
    for (const [type, events] of Object.entries(byType)) {
      if (events.length > 0) {
        const typeDesc = CAUSAL_TYPE_DESCRIPTIONS[type as CausalEventType]
        const eventDescs = events.map((e) => `${e.age}岁时：${e.description}`)
        parts.push(`${typeDesc}（${events.length}件）：${eventDescs.join('；')}`)
      }
    }

    return parts.join('\n')
  }

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】记录:${this.stats.totalRecorded} 触发:${this.stats.totalTriggered} 待报:${this.stats.pendingEvents}`,
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
      this.setConfig(changes.changes.config as Partial<CausalConfig>)
    }

    // 应用新增因果事件
    if (changes.changes.recordCausalEvent) {
      const { type, severity, round, age, description, relatedPerson, relatedFaction } =
        changes.changes.recordCausalEvent as {
          type: CausalEventType
          severity: CausalSeverity
          round: number
          age: number
          description: string
          relatedPerson?: string
          relatedFaction?: string
        }
      this.recordCausalEvent(type, severity, round, age, description, relatedPerson, relatedFaction)
    }
  }

  capturePreviewState(): unknown {
    return structuredClone({
      config: this.config,
      causalEvents: this.causalEvents,
      stats: this.stats,
    })
  }

  restorePreviewState(snapshot: unknown): void {
    this.restoreCollectedState(snapshot)
  }

  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const record = snapshot as Record<string, unknown>
    const config = record.config
    const events = record.causalEvents
    const stats = record.stats

    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const next = config as Partial<CausalConfig>
      this.config = {
        ...DEFAULT_CAUSAL_CONFIG,
        ...next,
        severityDelayMultipliers: {
          ...DEFAULT_CAUSAL_CONFIG.severityDelayMultipliers,
          ...(next.severityDelayMultipliers ?? {}),
        },
      }
    }
    if (Array.isArray(events)) {
      this.causalEvents = structuredClone(events) as CausalEvent[]
    }
    if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
      this.stats = {
        ...this.stats,
        ...(stats as Partial<typeof this.stats>),
      }
    }
  }

  reset(): void {
    this.config = DEFAULT_CAUSAL_CONFIG
    this.causalEvents = []
    this.stats = {
      totalRecorded: 0,
      totalTriggered: 0,
      pendingEvents: 0,
      lastTriggerAt: 0,
    }
  }
}

/** 单例 */
export const causalDelay = new CausalDelaySystem()
