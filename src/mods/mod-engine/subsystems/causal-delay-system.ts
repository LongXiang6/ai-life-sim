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

/** 因果触发模板 */
const CAUSAL_TRIGGER_TEMPLATES: Record<CausalEventType, Record<CausalSeverity, string[]>> = {
  kindness: {
    minor: ['善有善报，当初的善意如今得到了回报。', '曾经的帮助，如今换来了意想不到的收获。'],
    normal: ['当初的恩情，如今得到了回报，对方前来相助。', '善行终有报，当初的帮助如今换来了重要的支持。'],
    major: ['大恩必有回报，当初的善举如今改变了命运。', '曾经的救命之恩，如今换来了命运的转折。'],
    critical: ['因果循环，当初的恩德如今成为了人生的转折点。', '善报终至，当初的重大善举如今换来了命运的眷顾。'],
  },
  grudge: {
    minor: ['旧怨未消，当初的矛盾如今又浮现心头。', '曾经的冲突，如今换来了新的麻烦。'],
    normal: ['仇怨未了，当初的仇恨如今引发了新的冲突。', '旧恨难消，当初的敌意如今换来了报复。'],
    major: ['大仇必报，当初的仇恨如今引发了重大事件。', '仇恨终有报，当初的重大冲突如今换来了命运的转折。'],
    critical: ['因果循环，当初的仇恨如今成为了人生的转折点。', '恶报终至，当初的重大仇恨如今换来了命运的审判。'],
  },
  promise: {
    minor: ['当初的承诺，如今到了兑现的时候。', '曾经的约定，如今需要履行。'],
    normal: ['承诺终需兑现，当初的约定如今引发了新的事件。', '约定未忘，当初的承诺如今换来了新的机遇。'],
    major: ['重大承诺，如今到了兑现的关键时刻。', '当初的重要约定，如今成为了命运的转折点。'],
    critical: ['命运之约，当初的承诺如今决定了人生的走向。', '关键承诺，当初的约定如今换来了命运的抉择。'],
  },
  debt: {
    minor: ['旧债未清，当初的债务如今需要偿还。', '曾经的欠债，如今换来了新的压力。'],
    normal: ['债务终需偿还，当初的欠债如今引发了新的事件。', '欠债未忘，当初的债务如今换来了新的麻烦。'],
    major: ['重大债务，如今到了偿还的关键时刻。', '当初的重要欠债，如今成为了命运的转折点。'],
    critical: ['命运之债，当初的债务如今决定了人生的走向。', '关键债务，当初的欠债如今换来了命运的审判。'],
  },
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

    // 标记为已触发
    for (const event of toTrigger) {
      event.triggered = true
      event.triggeredRound = currentRound
      this.stats.totalTriggered++
      this.stats.pendingEvents--

      // 同步到记忆遗忘系统（标记为已解决）
      memoryForgetting.resolveCausalMark(event.round, event.type)
    }

    // 构建叙事文本
    const narrativeText = this.buildTriggerNarrative(toTrigger)

    this.stats.lastTriggerAt = Date.now()

    console.debug(`[CausalDelay] 触发${toTrigger.length}个因果事件：${toTrigger.map((e) => CAUSAL_TYPE_DESCRIPTIONS[e.type]).join('、')}`)

    return {
      hasTriggered: true,
      triggeredEvents: toTrigger,
      narrativeText,
    }
  }

  /**
   * 构建触发叙事文本
   */
  private buildTriggerNarrative(events: CausalEvent[]): string {
    const parts: string[] = []

    for (const event of events) {
      const templates = CAUSAL_TRIGGER_TEMPLATES[event.type][event.severity]
      const template = templates[Math.floor(Math.random() * templates.length)]

      // 构建完整叙事
      let narrative = template

      // 添加相关人物信息
      if (event.relatedPerson) {
        narrative += `（与${event.relatedPerson}相关）`
      }

      // 添加相关势力信息
      if (event.relatedFaction) {
        narrative += `（涉及${event.relatedFaction}）`
      }

      // 添加原始事件描述
      narrative += `——当初的事件：${event.description}`

      parts.push(narrative)
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

  /**
   * 清理已触发的旧事件
   */
  cleanupOldTriggeredEvents(maxAge: number = 100): void {
    this.causalEvents = this.causalEvents.filter((e) => {
      // 保留未触发的事件
      if (!e.triggered) return true
      // 保留最近触发的重大事件
      if (e.severity === 'critical' || e.severity === 'major') return true
      // 清理旧的已触发事件
      const ageSinceTrigger = e.triggeredRound ? Date.now() - e.triggeredRound : 0
      return ageSinceTrigger < maxAge
    })
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
