/**
 * @module causal-delay-system.ts
 * @description 延迟因果系统 —— 保存叙事承诺并按规范时间确定性进入待兑现状态
 * @mod mod-engine
 *
 * 设计理念：
 *   因果系统记录角色一生中的叙事承诺（恩情、仇恨、承诺、债务），
 *   按规范全局天数确定性进入待兑现状态。与长期记忆引擎和记忆遗忘系统联动。
 *
 * 核心机制：
 *   - 记录重大事件类型：恩情(kindness)、仇恨(grudge)、承诺(promise)、债务(debt)
 *   - 每轮按作用域检查是否有因果事项到期
 *   - 新事项使用全局累计天数；旧存档保留原始回合调度
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

/** 因果事项的叙事可见作用域 */
export type CausalEventScope = 'global' | 'context' | 'travel'

/**
 * canonical-days 使用 TimeSystem 的全局累计天数；legacy-round 只用于旧存档和
 * 尚未传入规范天数的兼容调用。两者不得互相粗略换算。
 */
export type CausalSchedule = 'canonical-days' | 'legacy-round'

/** 新事项的登记上下文；拥有系统可把历史事件账本编号作为来源证据传入。 */
export interface CausalEventRegistration {
  scope: CausalEventScope
  contextId?: string
  createdTotalDays?: number
  originEventId?: string
}

/** 到期检查上下文。显式 scope 用于区分全局、当地和旅行叙事。 */
export interface CausalTriggerCheckOptions {
  currentTotalDays?: number
  scope?: CausalEventScope
  contextId?: string
}

/** 完整叙事提交成功后附加的兑现证据。 */
export interface CausalTriggerCommitOptions {
  currentTotalDays?: number
  resolutionEventId?: string
}

/** 因果事件记录 */
export interface CausalEvent {
  /** 事件唯一ID */
  id: string
  /** 旧无版本快照出现重复 ID 时保留的原始编号，仅用于迁移审计。 */
  legacyId?: string
  /** 作用域：全局、当地上下文或旅行中 */
  scope: CausalEventScope
  /** 当地作用域绑定的上下文 */
  contextId?: string
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
  /** 调度权威；旧存档缺少规范天数字段时明确保留 legacy-round */
  schedule: CausalSchedule
  /** 规范全局创建天数（仅 canonical-days） */
  createdTotalDays?: number
  /** 规范全局到期天数（仅 canonical-days） */
  dueTotalDays?: number
  /** 旧回合调度的原始延迟（仅 legacy-round，不换算为天数） */
  triggerDelay?: number
  /** 形成该延期承诺的历史事件编号 */
  originEventId?: string
  /** 是否已触发 */
  triggered: boolean
  /** 触发轮次 */
  triggeredRound?: number
  /** 兑现时的规范全局天数 */
  triggeredTotalDays?: number
  /** 兑现该延期承诺的历史事件编号 */
  resolutionEventId?: string
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
  /** 本地确定性调度策略；拥有系统可配置，不进入 AI 协议。 */
  delayDaysBySeverity: Record<CausalSeverity, number>
  /** 每轮最多送入叙事的到期事项数；只分批，不删除或消费其余事项。 */
  maxTriggerPerRound: number,
}

// ============================================================
// 常量
// ============================================================

/** 默认因果配置 */
const DEFAULT_CAUSAL_CONFIG: CausalConfig = {
  delayDaysBySeverity: {
    minor: 30,
    normal: 90,
    major: 180,
    critical: 365,
  },
  maxTriggerPerRound: 2,
}

/**
 * 仅供未传 createdTotalDays 的旧调用继续工作。它不是天数换算，也不会用于迁移
 * 旧存档；旧存档始终保留自身原始 triggerDelay。
 */
const LEGACY_COMPAT_TRIGGER_DELAY_ROUNDS: Record<CausalSeverity, number> = {
  minor: 5,
  normal: 10,
  major: 15,
  critical: 25,
}

/**
 * P1 起因果延期快照显式版本化。带版本的快照必须满足当前唯一 ID 契约；
 * 只有无版本旧快照允许执行确定性重复 ID 迁移。
 */
const CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION = 1 as const

interface CausalDelaySnapshotV1 {
  schemaVersion: typeof CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION
  config: CausalConfig
  causalEvents: CausalEvent[]
  stats: {
    totalRecorded: number
    totalTriggered: number
    pendingEvents: number
    lastTriggerAt: number
  }
  idSequence: number
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
  readonly label = '延迟因果' as const
  readonly description = '保存叙事承诺，按规范时间确定性到期，并在完整叙事提交后确认兑现' as const

  /** 因果配置 */
  private config: CausalConfig = DEFAULT_CAUSAL_CONFIG

  /** 因果事件列表 */
  private causalEvents: CausalEvent[] = []

  /** 实例内单调序列；与随机 nonce 共同保证同轮同类型批量事项不碰撞。 */
  private idSequence = 0

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
    return structuredClone(this.config)
  }

  /** 设置配置 */
  setConfig(newConfig: Partial<CausalConfig>): void {
    const delayDaysBySeverity = {
      ...this.config.delayDaysBySeverity,
      ...(newConfig.delayDaysBySeverity ?? {}),
    }
    for (const severity of ['minor', 'normal', 'major', 'critical'] as const) {
      const delayDays = delayDaysBySeverity[severity]
      if (!Number.isSafeInteger(delayDays) || delayDays < 0) {
        throw new Error(`[${this.id}] Invalid delayDaysBySeverity.${severity}`)
      }
    }

    const maxTriggerPerRound = newConfig.maxTriggerPerRound ?? this.config.maxTriggerPerRound
    if (!Number.isSafeInteger(maxTriggerPerRound) || maxTriggerPerRound <= 0) {
      throw new Error(`[${this.id}] Invalid maxTriggerPerRound`)
    }

    this.config = {
      delayDaysBySeverity,
      maxTriggerPerRound,
    }
  }

  /** 获取所有因果事件 */
  getCausalEvents(): CausalEvent[] {
    return structuredClone(this.causalEvents)
  }

  /** 获取待触发事件 */
  getPendingEvents(): CausalEvent[] {
    return structuredClone(this.causalEvents.filter((e) => !e.triggered))
  }

  /** 获取已触发事件 */
  getTriggeredEvents(): CausalEvent[] {
    return structuredClone(this.causalEvents.filter((e) => e.triggered))
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
   * @param registration 作用域、规范创建天数和可选来源事件编号
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
    registration: CausalEventRegistration = { scope: 'global' },
  ): string {
    if (registration.scope === 'context' && !registration.contextId?.trim()) {
      throw new Error(`[${this.id}] Context-scoped causal event requires contextId`)
    }
    if (registration.createdTotalDays !== undefined
      && (!Number.isSafeInteger(registration.createdTotalDays) || registration.createdTotalDays < 0)) {
      throw new Error(`[${this.id}] Invalid createdTotalDays`)
    }

    const createdTotalDays = registration.createdTotalDays
    const delayDays = this.config.delayDaysBySeverity[severity]
    const dueTotalDays = createdTotalDays === undefined
      ? undefined
      : createdTotalDays + delayDays
    if (dueTotalDays !== undefined && !Number.isSafeInteger(dueTotalDays)) {
      throw new Error(`[${this.id}] dueTotalDays exceeds the canonical time range`)
    }

    // 本地系统分配稳定唯一 ID。仅使用 Date.now 会让同毫秒的同轮同类型事项碰撞，
    // 因而同时加入实例单调序列，并在可用时使用 randomUUID 作为跨会话 nonce。
    const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    let id: string
    do {
      this.idSequence++
      id = `causal-${type}-${round}-${nonce}-${this.idSequence.toString(36)}`
    } while (this.causalEvents.some((existing) => existing.id === id))

    // 创建因果事件
    const event: CausalEvent = {
      id,
      scope: registration.scope,
      contextId: registration.contextId?.trim() || undefined,
      type,
      severity,
      round,
      age,
      description,
      relatedPerson,
      relatedFaction,
      schedule: createdTotalDays === undefined ? 'legacy-round' : 'canonical-days',
      createdTotalDays,
      dueTotalDays,
      triggerDelay: createdTotalDays === undefined
        ? LEGACY_COMPAT_TRIGGER_DELAY_ROUNDS[severity]
        : undefined,
      originEventId: registration.originEventId?.trim() || undefined,
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
      contextId: registration.contextId,
    })

    const scheduleDescription = event.schedule === 'canonical-days'
      ? `全局第${event.dueTotalDays}天到期`
      : `兼容旧调用，延迟${event.triggerDelay}轮`
    console.debug(`[CausalDelay] 记录因果事件：${CAUSAL_TYPE_DESCRIPTIONS[type]}（${severity}），${scheduleDescription}`)

    return id
  }

  // ============================================================
  // 核心方法：检查触发
  // ============================================================

  /**
   * 检查因果触发
   *
   * @param currentRound 当前轮次
   * @param currentContextOrOptions 旧调用可继续传 contextId；新调用传规范天数与作用域
   * @param legacyCurrentTotalDays 兼容旧的 (round, contextId, totalDays) 形态
   * @returns 本批到期事项；此方法不改变事项状态
   */
  checkCausalTrigger(
    currentRound: number,
    currentContextId?: string,
    legacyCurrentTotalDays?: number,
  ): CausalTriggerResult
  checkCausalTrigger(
    currentRound: number,
    options: CausalTriggerCheckOptions,
  ): CausalTriggerResult
  checkCausalTrigger(
    currentRound: number,
    currentContextOrOptions?: string | CausalTriggerCheckOptions,
    legacyCurrentTotalDays?: number,
  ): CausalTriggerResult {
    const options: CausalTriggerCheckOptions = typeof currentContextOrOptions === 'string'
      ? {
          contextId: currentContextOrOptions,
          scope: 'context',
          currentTotalDays: legacyCurrentTotalDays,
        }
      : (currentContextOrOptions ?? {})

    if (options.currentTotalDays !== undefined
      && (!Number.isSafeInteger(options.currentTotalDays) || options.currentTotalDays < 0)) {
      throw new Error(`[${this.id}] Invalid currentTotalDays`)
    }

    // 找出待触发的事件
    const pendingEvents = this.causalEvents.filter((event) => {
      if (event.triggered) return false
      if (event.scope === 'global') return true
      if (event.scope === 'travel') return options.scope !== 'global'
      return Boolean(options.contextId && event.contextId === options.contextId)
    })

    // canonical-days 只读规范全局天数；legacy-round 只读原始回合延迟。
    const readyEvents = pendingEvents.filter((event) => {
      if (event.schedule === 'canonical-days') {
        return options.currentTotalDays !== undefined
          && event.dueTotalDays !== undefined
          && options.currentTotalDays >= event.dueTotalDays
      }
      return event.triggerDelay !== undefined
        && currentRound - event.round >= event.triggerDelay
    })

    // 按严重程度排序（critical > major > normal > minor）
    const severityOrder: Record<CausalSeverity, number> = {
      critical: 4,
      major: 3,
      normal: 2,
      minor: 1,
    }
    readyEvents.sort((a, b) => {
      const severityDifference = severityOrder[b.severity] - severityOrder[a.severity]
      if (severityDifference !== 0) return severityDifference
      const aDue = a.schedule === 'canonical-days'
        ? (a.dueTotalDays ?? Number.POSITIVE_INFINITY)
        : a.round + (a.triggerDelay ?? Number.POSITIVE_INFINITY)
      const bDue = b.schedule === 'canonical-days'
        ? (b.dueTotalDays ?? Number.POSITIVE_INFINITY)
        : b.round + (b.triggerDelay ?? Number.POSITIVE_INFINITY)
      return aDue - bDue || a.id.localeCompare(b.id)
    })

    // 这里只做非破坏性批处理：未进入本批的到期事项仍完整保留为 pending。
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
    options: CausalTriggerCommitOptions = {},
  ): CausalEvent[] {
    if (options.currentTotalDays !== undefined
      && (!Number.isSafeInteger(options.currentTotalDays) || options.currentTotalDays < 0)) {
      throw new Error(`[${this.id}] Invalid currentTotalDays`)
    }
    const idSet = new Set(eventIds)
    if (idSet.size === 0) return []

    const committed: CausalEvent[] = []
    for (const event of this.causalEvents) {
      if (event.triggered || !idSet.has(event.id)) continue
      event.triggered = true
      event.triggeredRound = currentRound
      event.triggeredTotalDays = options.currentTotalDays
      event.resolutionEventId = options.resolutionEventId?.trim() || undefined
      event.triggerResult = triggerResult?.trim() || undefined
      this.stats.totalTriggered++
      this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1)
      memoryForgetting.resolveCausalMark(event.round, event.type, event.contextId)
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
        event.schedule === 'canonical-days'
          ? `规范时间：全局第${event.createdTotalDays}天成立，第${event.dueTotalDays}天到期`
          : `调度：旧存档回合制（延迟${event.triggerDelay ?? '未知'}轮）`,
        `已成立事实：${event.description}`,
        event.relatedPerson ? `相关人物：${event.relatedPerson}` : undefined,
        event.relatedFaction ? `相关势力：${event.relatedFaction}` : undefined,
        event.originEventId ? `来源事件：${event.originEventId}` : undefined,
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
      summary: `【${this.label}：记录 ${this.stats.totalRecorded} | 触发 ${this.stats.totalTriggered} | 待报 ${this.stats.pendingEvents}】`,
      data: structuredClone({
        config: this.config,
        causalEvents: this.causalEvents,
        stats: this.stats,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
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
    const data = changes.changes

    // 应用配置变更
    if (data.config) {
      this.setConfig(data.config as Partial<CausalConfig>)
    }

    // 应用新增因果事件
    if (data.recordCausalEvent) {
      const {
        type,
        severity,
        round,
        age,
        description,
        relatedPerson,
        relatedFaction,
        scope,
        contextId,
        createdTotalDays,
        originEventId,
      } =
        data.recordCausalEvent as {
          type: CausalEventType
          severity: CausalSeverity
          round: number
          age: number
          description: string
          relatedPerson?: string
          relatedFaction?: string
          scope?: CausalEventScope
          contextId?: string
          createdTotalDays?: number
          originEventId?: string
        }
      this.recordCausalEvent(
        type,
        severity,
        round,
        age,
        description,
        relatedPerson,
        relatedFaction,
        {
          scope: scope ?? (contextId ? 'context' : 'global'),
          contextId,
          createdTotalDays: createdTotalDays ?? context.totalDays,
          originEventId,
        },
      )
    }
  }

  capturePreviewState(): CausalDelaySnapshotV1 {
    return structuredClone({
      schemaVersion: CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION,
      config: this.config,
      causalEvents: this.causalEvents,
      stats: this.stats,
      idSequence: this.idSequence,
    })
  }

  restorePreviewState(snapshot: unknown): void {
    this.restoreCollectedState(snapshot)
  }

  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const record = snapshot as Record<string, unknown>
    const schemaVersion = record.schemaVersion
    const config = record.config
    const events = record.causalEvents
    const stats = record.stats
    const idSequence = record.idSequence

    if (schemaVersion !== undefined && schemaVersion !== CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(`[${this.id}] Unsupported causal snapshot schemaVersion: ${String(schemaVersion)}`)
    }

    let nextConfig = structuredClone(this.config)
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const next = config as Record<string, unknown>
      const restoredDelayDays = next.delayDaysBySeverity
      const delayDaysBySeverity = structuredClone(DEFAULT_CAUSAL_CONFIG.delayDaysBySeverity)
      if (restoredDelayDays && typeof restoredDelayDays === 'object' && !Array.isArray(restoredDelayDays)) {
        for (const severity of ['minor', 'normal', 'major', 'critical'] as const) {
          const value = (restoredDelayDays as Record<string, unknown>)[severity]
          if (Number.isSafeInteger(value) && (value as number) >= 0) {
            delayDaysBySeverity[severity] = value as number
          }
        }
      }
      nextConfig = {
        delayDaysBySeverity,
        maxTriggerPerRound: Number.isSafeInteger(next.maxTriggerPerRound)
          && (next.maxTriggerPerRound as number) > 0
          ? next.maxTriggerPerRound as number
          : DEFAULT_CAUSAL_CONFIG.maxTriggerPerRound,
      }
    }

    let nextEvents = structuredClone(this.causalEvents)
    if (Array.isArray(events)) {
      const restoredEvents = structuredClone(events) as CausalEvent[]
      if (restoredEvents.some((event) => !event || typeof event !== 'object' || Array.isArray(event))) {
        throw new Error(`[${this.id}] Invalid causalEvents snapshot`)
      }

      const originalIds = new Set<string>()
      for (const [index, event] of restoredEvents.entries()) {
        if (typeof event.id !== 'string' || event.id.trim() === '') {
          throw new Error(`[${this.id}] Invalid causal event id at index ${index}`)
        }
        originalIds.add(event.id)
      }

      if (schemaVersion === CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION) {
        const seenIds = new Set<string>()
        for (const event of restoredEvents) {
          if (seenIds.has(event.id)) {
            throw new Error(`[${this.id}] Duplicate causal event id in versioned snapshot: ${event.id}`)
          }
          seenIds.add(event.id)
        }
      } else {
        // 无版本旧快照可能已经持有碰撞 ID。保留首个原 ID，其余按原数组顺序
        // 确定性重编号；避开所有旧原 ID，防止迁移编号占用后续合法编号。
        const usedIds = new Set<string>()
        const duplicateOrdinals = new Map<string, number>()
        for (const event of restoredEvents) {
          const legacyId = event.id
          if (!usedIds.has(legacyId)) {
            usedIds.add(legacyId)
            continue
          }

          let ordinal = (duplicateOrdinals.get(legacyId) ?? 1) + 1
          let migratedId = `${legacyId}~migrated-${ordinal}`
          while (usedIds.has(migratedId) || originalIds.has(migratedId)) {
            ordinal++
            migratedId = `${legacyId}~migrated-${ordinal}`
          }
          duplicateOrdinals.set(legacyId, ordinal)
          event.legacyId = legacyId
          event.id = migratedId
          usedIds.add(migratedId)
        }
      }

      nextEvents = restoredEvents.map((event) => {
        const hasCanonicalSchedule = Number.isSafeInteger(event.createdTotalDays)
          && Number.isSafeInteger(event.dueTotalDays)
        return {
          ...event,
          scope: event.scope ?? 'global',
          // 旧存档没有规范天数字段时，保留原始 round + triggerDelay，不猜测天数。
          schedule: event.schedule === 'canonical-days' && hasCanonicalSchedule
            ? 'canonical-days'
            : 'legacy-round',
        }
      })
    }

    let nextStats = { ...this.stats }
    if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
      nextStats = {
        ...this.stats,
        ...(stats as Partial<typeof this.stats>),
      }
    }

    const nextIdSequence = Number.isSafeInteger(idSequence) && (idSequence as number) >= 0
      ? idSequence as number
      : nextEvents.length

    // 全部预检完成后一次性替换，保证损坏快照不会留下部分恢复状态。
    this.config = nextConfig
    this.causalEvents = nextEvents
    this.stats = nextStats
    this.idSequence = nextIdSequence
  }

  reset(): void {
    this.config = structuredClone(DEFAULT_CAUSAL_CONFIG)
    this.causalEvents = []
    this.idSequence = 0
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
