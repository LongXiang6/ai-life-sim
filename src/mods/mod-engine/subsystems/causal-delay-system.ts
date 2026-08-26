/**
 * Purpose: Own delayed causal commitments from registration through narrative delivery and resolution.
 * Owner: mod-engine
 * Responsibility: Stateful causal lifecycle and persistence only; data contracts and labels live downstream.
 *
 * @module causal-delay-system.ts
 * @description 延迟因果系统 —— 保存叙事承诺并按规范时间确定性进入待兑现状态
 * @mod mod-engine
 *
 * 设计理念：
 *   因果系统记录角色一生中的叙事承诺（恩情、仇恨、承诺、债务），
 *   按规范全局基础点确定性进入待兑现状态。与长期记忆引擎和记忆遗忘系统联动。
 *
 * 核心机制：
 *   - 记录重大事件类型：恩情(kindness)、仇恨(grudge)、承诺(promise)、债务(debt)
 *   - 每轮按作用域检查是否有因果事项到期
 *   - 新事项使用全局累计基础点；旧存档保留原始回合调度
 *   - 与记忆遗忘系统联动：因果标记的事件永不遗忘
 *   - 与长期记忆引擎联动：共享事件数据
 */

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import { basePointsFromCalendarDays, calendarDaysFromBasePoints } from '@/foundation'

import {
  MemoryLifecycleSystem,
  memoryLifecycle,
} from './memory-lifecycle-system'
import {
  buildCausalEventFingerprint,
  CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION,
  CAUSAL_SEVERITY_DESCRIPTIONS,
  CAUSAL_TYPE_DESCRIPTIONS,
  DEFAULT_CAUSAL_CONFIG,
  LEGACY_COMPAT_TRIGGER_DELAY_ROUNDS,
} from './causal-delay-system/contracts'
import type {
  CausalConfig,
  CausalDelaySnapshotV2,
  CausalDispositionInput,
  CausalEvent,
  CausalEventRegistration,
  CausalEventScope,
  CausalEventType,
  CausalSeverity,
  CausalTriggerCheckOptions,
  CausalTriggerCommitOptions,
  CausalTriggerResult,
} from './causal-delay-system/contracts'

export { buildCausalEventFingerprint } from './causal-delay-system/contracts'
export type {
  CausalConfig,
  CausalDispositionInput,
  CausalEvent,
  CausalEventRegistration,
  CausalEventScope,
  CausalEventType,
  CausalSchedule,
  CausalSeverity,
  CausalTriggerCheckOptions,
  CausalTriggerCommitOptions,
  CausalTriggerResult,
} from './causal-delay-system/contracts'

const SEVERITIES = ['minor', 'normal', 'major', 'critical'] as const

function toBasePoints(basePoints: number | undefined, totalDays: number | undefined): number | undefined {
  if (basePoints !== undefined) return basePoints
  return totalDays === undefined ? undefined : basePointsFromCalendarDays(totalDays)
}

function normalizeBasePointDelay(basePoints: number | undefined, days: number | undefined): number | undefined {
  const resolved = toBasePoints(basePoints, days)
  return resolved === undefined ? undefined : Math.max(0, Math.floor(resolved))
}

function withCalendarSnapshot(event: CausalEvent): CausalEvent {
  return {
    ...event,
    ...(event.createdBasePoints === undefined
      ? {}
      : { createdTotalDays: calendarDaysFromBasePoints(event.createdBasePoints) }),
    ...(event.dueBasePoints === undefined
      ? {}
      : { dueTotalDays: calendarDaysFromBasePoints(event.dueBasePoints) }),
    ...(event.triggeredBasePoints === undefined
      ? {}
      : { triggeredTotalDays: calendarDaysFromBasePoints(event.triggeredBasePoints) }),
  }
}

// ============================================================
// CausalDelaySystem
// ============================================================

export class CausalDelaySystem implements ISubSystem {
  readonly id = 'causal-delay' as const
  readonly mod = 'mod-engine' as const
  readonly label = '延迟因果' as const
  readonly description = '保存叙事承诺，按规范时间确定性到期，并在完整叙事提交后确认兑现' as const

  constructor(
    private readonly memoryLifecycleRuntime: MemoryLifecycleSystem = memoryLifecycle,
  ) {}

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
    const legacyDelayBasePoints = newConfig.delayDaysBySeverity
      ? Object.fromEntries(
          SEVERITIES.map((severity) => [
            severity,
            basePointsFromCalendarDays(
              newConfig.delayDaysBySeverity?.[severity] ?? this.config.delayDaysBySeverity[severity],
            ),
          ]),
        ) as CausalConfig['delayBasePointsBySeverity']
      : undefined
    const delayBasePointsBySeverity = {
      ...this.config.delayBasePointsBySeverity,
      ...(legacyDelayBasePoints ?? {}),
      ...(newConfig.delayBasePointsBySeverity ?? {}),
    }
    for (const severity of SEVERITIES) {
      const delayBasePoints = delayBasePointsBySeverity[severity]
      if (!Number.isSafeInteger(delayBasePoints) || delayBasePoints < 0) {
        throw new Error(`[${this.id}] Invalid delayBasePointsBySeverity.${severity}`)
      }
    }

    this.config = {
      delayBasePointsBySeverity,
      delayDaysBySeverity: Object.fromEntries(
        SEVERITIES.map((severity) => [severity, calendarDaysFromBasePoints(delayBasePointsBySeverity[severity])]),
      ) as CausalConfig['delayDaysBySeverity'],
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

  assertCausalEventRegistrationAvailable(input: {
    type: CausalEventType
    description: string
    relatedPerson?: string
    relatedFaction?: string
    registration: CausalEventRegistration
  }): string {
    const fingerprint = buildCausalEventFingerprint({
      type: input.type,
      scope: input.registration.scope,
      contextId: input.registration.contextId,
      description: input.description,
      relatedPerson: input.relatedPerson,
      relatedFaction: input.relatedFaction,
      originEventId: input.registration.originEventId,
      originNarrativeId: input.registration.originNarrativeId,
    })
    if (this.causalEvents.some((event) => event.fingerprint === fingerprint)) {
      throw new Error(`[${this.id}] Duplicate causal event registration`)
    }
    return fingerprint
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
   * @param registration 作用域、规范创建基础点和可选来源事件编号
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
    const createdBasePoints = toBasePoints(registration.createdBasePoints, registration.createdTotalDays)
    if (createdBasePoints !== undefined
      && (!Number.isSafeInteger(createdBasePoints) || createdBasePoints < 0)) {
      throw new Error(`[${this.id}] Invalid createdBasePoints`)
    }

    const fingerprint = this.assertCausalEventRegistrationAvailable({
      type,
      description,
      relatedPerson,
      relatedFaction,
      registration,
    })

    const delayBasePoints = this.config.delayBasePointsBySeverity[severity]
    const dueBasePoints = createdBasePoints === undefined
      ? undefined
      : createdBasePoints + delayBasePoints
    if (dueBasePoints !== undefined && !Number.isSafeInteger(dueBasePoints)) {
      throw new Error(`[${this.id}] dueBasePoints exceeds the canonical time range`)
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
      schedule: createdBasePoints === undefined ? 'legacy-round' : 'canonical-points',
      createdBasePoints,
      dueBasePoints,
      createdTotalDays: createdBasePoints === undefined ? undefined : calendarDaysFromBasePoints(createdBasePoints),
      dueTotalDays: dueBasePoints === undefined ? undefined : calendarDaysFromBasePoints(dueBasePoints),
      triggerDelay: createdBasePoints === undefined
        ? LEGACY_COMPAT_TRIGGER_DELAY_ROUNDS[severity]
        : undefined,
      originEventId: registration.originEventId?.trim() || undefined,
      originNarrativeId: registration.originNarrativeId?.trim() || undefined,
      fingerprint,
      deliveryState: 'pending',
      triggered: false,
    }

    // 存入列表
    this.causalEvents.push(event)
    this.stats.totalRecorded++
    this.stats.pendingEvents++

    // 统一记忆生命周期保护未兑现的因果事件。
    this.memoryLifecycleRuntime.addCausalMark({
      round,
      type,
      description,
      severity,
      resolved: false,
      contextId: registration.contextId,
    })

    const scheduleDescription = event.schedule === 'canonical-points'
      ? `全局第${event.dueBasePoints}基础点到期`
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

    const currentBasePoints = toBasePoints(options.currentBasePoints, options.currentTotalDays)
    if (currentBasePoints !== undefined
      && (!Number.isSafeInteger(currentBasePoints) || currentBasePoints < 0)) {
      throw new Error(`[${this.id}] Invalid currentBasePoints`)
    }

    // 找出待触发的事件
    const pendingEvents = this.causalEvents.filter((event) => {
      if (event.triggered) return false
      if (event.deliveryState === 'presented' || event.deliveryState === 'pending-recognition') {
        return false
      }
      if (event.scope === 'global') return true
      if (event.scope === 'travel') return options.scope !== 'global'
      return Boolean(options.contextId && event.contextId === options.contextId)
    })

    // canonical-points 只读基础点；legacy-round 只读原始回合延迟。
    const readyEvents = pendingEvents.filter((event) => {
      if (event.schedule === 'canonical-points' || event.schedule === 'canonical-days') {
        const dueBasePoints = event.dueBasePoints
          ?? toBasePoints(undefined, event.dueTotalDays)
        return currentBasePoints !== undefined
          && dueBasePoints !== undefined
          && currentBasePoints >= dueBasePoints
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
      const aDue = a.schedule === 'canonical-points' || a.schedule === 'canonical-days'
        ? (a.dueBasePoints ?? toBasePoints(undefined, a.dueTotalDays) ?? Number.POSITIVE_INFINITY)
        : a.round + (a.triggerDelay ?? Number.POSITIVE_INFINITY)
      const bDue = b.schedule === 'canonical-points' || b.schedule === 'canonical-days'
        ? (b.dueBasePoints ?? toBasePoints(undefined, b.dueTotalDays) ?? Number.POSITIVE_INFINITY)
        : b.round + (b.triggerDelay ?? Number.POSITIVE_INFINITY)
      return aDue - bDue || a.id.localeCompare(b.id)
    })

    if (readyEvents.length === 0) {
      return {
        hasTriggered: false,
        triggeredEvents: [],
        narrativeText: '',
      }
    }

    // 此处仅返回本轮到期事项，不提前消费。只有主叙事完整协议与状态提交
    // 均通过后，orchestrator 才调用 commitCausalTriggers() 确认兑现。
    const narrativeText = this.buildTriggerNarrative(readyEvents)

    return {
      hasTriggered: true,
      triggeredEvents: structuredClone(readyEvents.map((event) => ({
        ...withCalendarSnapshot(event),
        deliveryState: 'presented' as const,
      }))),
      narrativeText,
    }
  }

  markCausalEventsPresented(
    eventIds: readonly string[],
    narrativeId: string,
    currentRound: number,
  ): CausalEvent[] {
    if (!narrativeId.trim()) throw new Error(`[${this.id}] Presented causal events require narrativeId`)
    const idSet = new Set(eventIds)
    const presented: CausalEvent[] = []
    for (const event of this.causalEvents) {
      if (!idSet.has(event.id)) continue
      if (event.triggered || event.deliveryState === 'resolved') {
        throw new Error(`[${this.id}] Resolved causal event cannot be presented: ${event.id}`)
      }
      if (event.presentedNarrativeId && event.presentedNarrativeId !== narrativeId) {
        throw new Error(`[${this.id}] Causal event already belongs to another narrative: ${event.id}`)
      }
      event.deliveryState = 'presented'
      event.presentedNarrativeId = narrativeId
      event.presentedRound = currentRound
      presented.push(structuredClone(event))
    }
    if (presented.length !== idSet.size) {
      throw new Error(`[${this.id}] Presented causal event set is incomplete`)
    }
    return presented
  }

  markCausalEventsPendingRecognition(
    eventIds: readonly string[],
    narrativeId: string,
  ): CausalEvent[] {
    const idSet = new Set(eventIds)
    const pending: CausalEvent[] = []
    for (const event of this.causalEvents) {
      if (!idSet.has(event.id)) continue
      if (event.presentedNarrativeId !== narrativeId || event.deliveryState !== 'presented') {
        throw new Error(`[${this.id}] Causal event is not presented to this narrative: ${event.id}`)
      }
      event.deliveryState = 'pending-recognition'
      pending.push(structuredClone(event))
    }
    if (pending.length !== idSet.size) {
      throw new Error(`[${this.id}] Pending-recognition causal event set is incomplete`)
    }
    return pending
  }

  /** 事件识别失败不阻塞回合；保留原因果编号，并按所属严重度重新排期。 */
  deferCausalEventsAfterRecognitionFailure(
    eventIds: readonly string[],
    narrativeId: string,
    currentBasePoints: number,
  ): CausalEvent[] {
    if (!Number.isSafeInteger(currentBasePoints) || currentBasePoints < 0) {
      throw new Error(`[${this.id}] Invalid recognition failure currentBasePoints`)
    }
    const idSet = new Set(eventIds)
    const matching = this.causalEvents.filter((event) => idSet.has(event.id))
    if (matching.length !== idSet.size) {
      throw new Error(`[${this.id}] Recognition failure causal event set is incomplete`)
    }
    for (const event of matching) {
      if (
        event.presentedNarrativeId !== narrativeId
        || (event.deliveryState !== 'presented' && event.deliveryState !== 'pending-recognition')
      ) {
        throw new Error(`[${this.id}] Recognition failure does not match pending narrative: ${event.id}`)
      }
    }

    return matching.map((event) => {
      const delayBasePoints = Math.max(1, this.config.delayBasePointsBySeverity[event.severity])
      event.schedule = 'canonical-points'
      event.createdBasePoints = currentBasePoints
      event.dueBasePoints = currentBasePoints + delayBasePoints
      event.createdTotalDays = calendarDaysFromBasePoints(currentBasePoints)
      event.dueTotalDays = calendarDaysFromBasePoints(event.dueBasePoints)
      event.triggerDelay = undefined
      event.deliveryState = 'continuing'
      event.presentedNarrativeId = undefined
      event.presentedRound = undefined
      event.triggerResult = '事件识别未完成，因果事项按本地规则重新排期'
      event.resolutionEventId = undefined
      return structuredClone(event)
    })
  }

  commitCausalDispositions(
    dispositions: readonly CausalDispositionInput[],
    narrativeId: string,
    currentRound: number,
    currentBasePoints: number,
  ): CausalEvent[] {
    if (!Number.isSafeInteger(currentBasePoints) || currentBasePoints < 0) {
      throw new Error(`[${this.id}] Invalid disposition currentBasePoints`)
    }
    const ids = new Set<string>()
    for (const disposition of dispositions) {
      if (ids.has(disposition.causalId)) {
        throw new Error(`[${this.id}] Duplicate causal disposition: ${disposition.causalId}`)
      }
      ids.add(disposition.causalId)
      const event = this.causalEvents.find((candidate) => candidate.id === disposition.causalId)
      if (!event) throw new Error(`[${this.id}] Unknown causal disposition: ${disposition.causalId}`)
      if (
        event.presentedNarrativeId !== narrativeId
        || event.deliveryState !== 'pending-recognition'
      ) {
        throw new Error(`[${this.id}] Causal disposition does not match pending narrative: ${event.id}`)
      }
      if (!disposition.reason.trim()) {
        throw new Error(`[${this.id}] Causal disposition requires reason: ${event.id}`)
      }
      if (disposition.status !== 'resolved') {
        const delayBasePoints = normalizeBasePointDelay(
          disposition.continuationDelayBasePoints,
          disposition.continuationDelayDays,
        )
        if (!Number.isSafeInteger(delayBasePoints) || (delayBasePoints as number) <= 0) {
          throw new Error(`[${this.id}] Continuing causal event requires positive delay base points: ${event.id}`)
        }
        const dueBasePoints = currentBasePoints + (delayBasePoints as number)
        if (!Number.isSafeInteger(dueBasePoints) || dueBasePoints <= currentBasePoints) {
          throw new Error(`[${this.id}] Continuing causal event has invalid future base point: ${event.id}`)
        }
      }
    }

    const committed: CausalEvent[] = []
    for (const disposition of dispositions) {
      const event = this.causalEvents.find((candidate) => candidate.id === disposition.causalId)!
      if (disposition.status === 'resolved') {
        event.triggered = true
        event.triggeredRound = currentRound
        event.triggeredBasePoints = currentBasePoints
        event.triggeredTotalDays = calendarDaysFromBasePoints(currentBasePoints)
        event.resolutionEventId = disposition.resolutionEventId?.trim() || undefined
        event.triggerResult = disposition.reason.trim()
        event.deliveryState = 'resolved'
        this.stats.totalTriggered++
        this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1)
        this.memoryLifecycleRuntime.resolveCausalMark(event.round, event.type, event.contextId)
      } else {
        const delayBasePoints = normalizeBasePointDelay(
          disposition.continuationDelayBasePoints,
          disposition.continuationDelayDays,
        )!
        event.schedule = 'canonical-points'
        event.createdBasePoints = currentBasePoints
        event.dueBasePoints = currentBasePoints + delayBasePoints
        event.createdTotalDays = calendarDaysFromBasePoints(currentBasePoints)
        event.dueTotalDays = calendarDaysFromBasePoints(event.dueBasePoints)
        event.triggerDelay = undefined
        event.deliveryState = disposition.status === 'continuing' ? 'continuing' : 'pending'
        event.presentedNarrativeId = undefined
        event.presentedRound = undefined
        event.triggerResult = disposition.reason.trim()
        event.resolutionEventId = undefined
      }
      committed.push(structuredClone(event))
    }
    if (committed.some((event) => event.deliveryState === 'resolved')) {
      this.stats.lastTriggerAt = Date.now()
    }
    return committed
  }

  /** 主叙事有效提交后，确认本轮已经兑现的因果事项。 */
  commitCausalTriggers(
    eventIds: readonly string[],
    currentRound: number,
    triggerResult?: string,
    options: CausalTriggerCommitOptions = {},
  ): CausalEvent[] {
    const currentBasePoints = toBasePoints(options.currentBasePoints, options.currentTotalDays)
    if (currentBasePoints !== undefined
      && (!Number.isSafeInteger(currentBasePoints) || currentBasePoints < 0)) {
      throw new Error(`[${this.id}] Invalid currentBasePoints`)
    }
    const idSet = new Set(eventIds)
    if (idSet.size === 0) return []

    if (idSet.size !== eventIds.length) {
      throw new Error(`[${this.id}] Duplicate causal trigger id`)
    }
    const matching = this.causalEvents.filter((event) => idSet.has(event.id))
    if (matching.length !== idSet.size) {
      throw new Error(`[${this.id}] Causal trigger set is incomplete`)
    }
    for (const event of matching) {
      if (event.triggered || event.deliveryState === 'resolved') {
        throw new Error(`[${this.id}] Causal event is already resolved: ${event.id}`)
      }
    }

    const committed: CausalEvent[] = []
    for (const event of matching) {
      event.triggered = true
      event.triggeredRound = currentRound
      event.triggeredBasePoints = currentBasePoints
      event.triggeredTotalDays = currentBasePoints === undefined
        ? undefined
        : calendarDaysFromBasePoints(currentBasePoints)
      event.resolutionEventId = options.resolutionEventId?.trim() || undefined
      event.triggerResult = triggerResult?.trim() || undefined
      event.deliveryState = 'resolved'
      this.stats.totalTriggered++
      this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1)
      this.memoryLifecycleRuntime.resolveCausalMark(event.round, event.type, event.contextId)
      committed.push(structuredClone(event))
    }

    if (committed.length !== eventIds.length) {
      throw new Error(`[${this.id}] Causal trigger commit is incomplete`)
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
      '【本轮到期因果；可采用的已确认事实】',
      '以下只陈述已经成立并到达处理节点的事实，不预设必须成为本轮主线，也不预设必然成功、报恩、复仇或清偿结果；故事 AI 可依据当前世界、人物能力、关系与阻力直接采用、合理改写其表现、暂留背景或安排后续合理处理。只有正文实际写出的结果进入状态提取与兑现。',
    ]

    for (const event of events) {
      const fields = [
        `类型：${CAUSAL_TYPE_DESCRIPTIONS[event.type]}`,
        `严重程度：${CAUSAL_SEVERITY_DESCRIPTIONS[event.severity]}`,
        `成立于第${event.round}轮、${event.age}岁时`,
        event.schedule === 'canonical-points' || event.schedule === 'canonical-days'
          ? `规范时间：全局第${event.createdBasePoints ?? toBasePoints(undefined, event.createdTotalDays)}基础点成立，第${event.dueBasePoints ?? toBasePoints(undefined, event.dueTotalDays)}基础点到期`
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
        createdBasePoints,
        createdTotalDays,
        originEventId,
        originNarrativeId,
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
          createdBasePoints?: number
          createdTotalDays?: number
          originEventId?: string
          originNarrativeId?: string
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
          // New callers already have the canonical point clock in context.
          // Only an explicit legacy day field is migrated at this boundary;
          // the derived calendar snapshot must never become the business time source.
          createdBasePoints: createdBasePoints !== undefined
            ? createdBasePoints
            : createdTotalDays !== undefined
              ? toBasePoints(undefined, createdTotalDays)
              : context.totalBasePoints,
          originEventId,
          originNarrativeId,
        },
      )
    }
  }

  capturePersistenceState(): CausalDelaySnapshotV2 {
    return structuredClone({
      schemaVersion: CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION,
      config: this.config,
      causalEvents: this.causalEvents,
      stats: this.stats,
      idSequence: this.idSequence,
    })
  }

  restorePersistenceState(snapshot: unknown): void {
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

    if (schemaVersion !== undefined && ![1, 2, CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION].includes(schemaVersion as number)) {
      throw new Error(`[${this.id}] Unsupported causal snapshot schemaVersion: ${String(schemaVersion)}`)
    }

    let nextConfig = structuredClone(this.config)
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const next = config as Record<string, unknown>
      const restoredDelayBasePoints = next.delayBasePointsBySeverity
      const restoredDelayDays = next.delayDaysBySeverity
      const delayBasePointsBySeverity = structuredClone(DEFAULT_CAUSAL_CONFIG.delayBasePointsBySeverity)
      if (restoredDelayBasePoints && typeof restoredDelayBasePoints === 'object' && !Array.isArray(restoredDelayBasePoints)) {
        for (const severity of SEVERITIES) {
          const value = (restoredDelayBasePoints as Record<string, unknown>)[severity]
          if (Number.isSafeInteger(value) && (value as number) >= 0) delayBasePointsBySeverity[severity] = value as number
        }
      } else if (restoredDelayDays && typeof restoredDelayDays === 'object' && !Array.isArray(restoredDelayDays)) {
        for (const severity of SEVERITIES) {
          const value = (restoredDelayDays as Record<string, unknown>)[severity]
          if (Number.isSafeInteger(value) && (value as number) >= 0) {
            delayBasePointsBySeverity[severity] = basePointsFromCalendarDays(value as number)
          }
        }
      }
      nextConfig = {
        delayBasePointsBySeverity,
        delayDaysBySeverity: Object.fromEntries(
          SEVERITIES.map((severity) => [severity, calendarDaysFromBasePoints(delayBasePointsBySeverity[severity])]),
        ) as CausalConfig['delayDaysBySeverity'],
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

      if (schemaVersion === 1 || schemaVersion === 2 || schemaVersion === CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION) {
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
        const createdBasePoints = Number.isSafeInteger(event.createdBasePoints)
          ? event.createdBasePoints
          : toBasePoints(undefined, event.createdTotalDays)
        const dueBasePoints = Number.isSafeInteger(event.dueBasePoints)
          ? event.dueBasePoints
          : toBasePoints(undefined, event.dueTotalDays)
        const hasCanonicalSchedule = Number.isSafeInteger(createdBasePoints)
          && Number.isSafeInteger(dueBasePoints)
        const scope = event.scope ?? 'global'
        const fingerprint = event.fingerprint || buildCausalEventFingerprint({
          type: event.type,
          scope,
          contextId: event.contextId,
          description: event.description,
          relatedPerson: event.relatedPerson,
          relatedFaction: event.relatedFaction,
          originEventId: event.originEventId,
          originNarrativeId: event.originNarrativeId,
        })
        const deliveryState = event.triggered
          ? 'resolved'
          : ['pending', 'presented', 'pending-recognition', 'continuing'].includes(event.deliveryState)
            ? event.deliveryState
            : 'pending'
        const retainsPresentation = deliveryState === 'presented' || deliveryState === 'pending-recognition'
        if (
          (schemaVersion === 2 || schemaVersion === CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION)
          && (
            !event.fingerprint?.trim()
            || !['pending', 'presented', 'pending-recognition', 'continuing', 'resolved'].includes(event.deliveryState)
            || (retainsPresentation && (!event.presentedNarrativeId?.trim() || !Number.isSafeInteger(event.presentedRound)))
          )
        ) {
          throw new Error(`[${this.id}] Invalid causal delivery state in versioned snapshot: ${event.id}`)
        }
        return {
          ...event,
          scope,
          fingerprint,
          deliveryState,
          presentedNarrativeId: retainsPresentation
            ? event.presentedNarrativeId?.trim() || undefined
            : undefined,
          presentedRound: retainsPresentation && Number.isSafeInteger(event.presentedRound)
            ? event.presentedRound
            : undefined,
          createdBasePoints,
          dueBasePoints,
          createdTotalDays: createdBasePoints === undefined ? event.createdTotalDays : calendarDaysFromBasePoints(createdBasePoints),
          dueTotalDays: dueBasePoints === undefined ? event.dueTotalDays : calendarDaysFromBasePoints(dueBasePoints),
          triggeredBasePoints: Number.isSafeInteger(event.triggeredBasePoints)
            ? event.triggeredBasePoints
            : toBasePoints(undefined, event.triggeredTotalDays),
          triggeredTotalDays: Number.isSafeInteger(event.triggeredBasePoints)
            ? calendarDaysFromBasePoints(event.triggeredBasePoints!)
            : event.triggeredTotalDays,
          // 旧存档没有规范基础点字段时，先将旧天数迁移；无法迁移则保留原始 round + triggerDelay。
          schedule: (event.schedule === 'canonical-points' || event.schedule === 'canonical-days') && hasCanonicalSchedule
            ? 'canonical-points'
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
