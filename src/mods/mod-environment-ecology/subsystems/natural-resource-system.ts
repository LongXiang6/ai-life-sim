/** P3 natural-resource owner: node-scoped quantities with deterministic day-based advance. */

import { BaseSubsystem } from '@/core'
import type {
  NaturalResourceDeposit,
  NaturalResourceDepositInput,
  NaturalResourcePersistenceState,
  NaturalResourceTransaction,
  NaturalResourceTransactionInput,
  ResourceDepositStatus,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { getFormulaModifier } from '@/mods/mod-world'
import {
  assertWorldSpatialNode,
  contextHasCapability,
  listWorldContexts,
} from '@/mods/mod-world'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`)
  return value.trim()
}

function requireFinite(value: unknown, label: string, min = -Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error(`${label} 数值无效`)
  return value
}

function requireTotalDays(value: unknown, label: string): number {
  const result = requireFinite(value, label, 0)
  if (!Number.isInteger(result)) throw new Error(`${label} 必须是非负整数`)
  return result
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} 必须是非空字符串数组`)
  }
  return [...new Set(value.map((item) => (item as string).trim()))]
}

function statusFor(quantity: number, capacity: number): ResourceDepositStatus {
  if (quantity <= 0) return 'depleted'
  return quantity / capacity <= 0.2 ? 'strained' : 'available'
}

function depositId(contextId: string, nodeId: string, resourceTypeId: string): string {
  return `resource:${encodeURIComponent(contextId)}:${encodeURIComponent(nodeId)}:${encodeURIComponent(resourceTypeId)}`
}

function validateEvidence(eventIds: readonly string[], contextId: string): void {
  for (const eventId of eventIds) {
    const event = getHistoricalEvent(eventId)
    if (!event || (event.status !== 'occurred' && event.status !== 'resolved')) {
      throw new Error(`资源变化依据不是已发生或已解决的历史事件：${eventId}`)
    }
    if (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId)) {
      throw new Error(`资源变化依据不属于目标上下文：${eventId}`)
    }
  }
}

function normalizeDeposit(value: unknown, index: number): NaturalResourceDeposit {
  if (!isRecord(value)) throw new Error(`deposits[${index}] 必须是对象`)
  const contextId = requireString(value.contextId, `deposits[${index}].contextId`)
  const nodeId = requireString(value.nodeId, `deposits[${index}].nodeId`)
  assertWorldSpatialNode(contextId, nodeId)
  const quantity = requireFinite(value.quantity, `deposits[${index}].quantity`, 0)
  const capacity = requireFinite(value.capacity, `deposits[${index}].capacity`, Number.EPSILON)
  if (quantity > capacity) throw new Error(`deposits[${index}] 储量超过容量`)
  const expectedStatus = statusFor(quantity, capacity)
  if (value.status !== expectedStatus) throw new Error(`deposits[${index}] 危机状态与储量不一致`)
  return {
    depositId: requireString(value.depositId, `deposits[${index}].depositId`),
    contextId,
    nodeId,
    resourceTypeId: requireString(value.resourceTypeId, `deposits[${index}].resourceTypeId`),
    displayName: requireString(value.displayName, `deposits[${index}].displayName`),
    unit: requireString(value.unit, `deposits[${index}].unit`),
    quantity,
    capacity,
    renewable: typeof value.renewable === 'boolean' ? value.renewable : (() => { throw new Error(`deposits[${index}].renewable 无效`) })(),
    regenerationPerDay: requireFinite(value.regenerationPerDay, `deposits[${index}].regenerationPerDay`, 0),
    baselineConsumptionPerDay: requireFinite(value.baselineConsumptionPerDay, `deposits[${index}].baselineConsumptionPerDay`, 0),
    status: expectedStatus,
    traitTags: stringList(value.traitTags, `deposits[${index}].traitTags`),
    sourceEventIds: stringList(value.sourceEventIds, `deposits[${index}].sourceEventIds`),
    updatedAtTotalDays: requireTotalDays(value.updatedAtTotalDays, `deposits[${index}].updatedAtTotalDays`),
  }
}

function validatePersistenceState(value: unknown): NaturalResourcePersistenceState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.deposits) || !Array.isArray(value.transactions) || !isRecord(value.lastAdvancedTotalDaysByContext)) {
    throw new Error('自然资源持久化快照结构无效')
  }
  const deposits = value.deposits.map(normalizeDeposit)
  const depositsById = new Map<string, NaturalResourceDeposit>()
  for (const deposit of deposits) {
    if (depositsById.has(deposit.depositId)) throw new Error(`资源矿藏 ID 重复：${deposit.depositId}`)
    depositsById.set(deposit.depositId, deposit)
  }
  const transactionIds = new Set<string>()
  const transactions = value.transactions.map((item, index): NaturalResourceTransaction => {
    if (!isRecord(item)) throw new Error(`transactions[${index}] 必须是对象`)
    const transactionId = requireString(item.transactionId, `transactions[${index}].transactionId`)
    if (transactionIds.has(transactionId)) throw new Error(`资源交易 ID 重复：${transactionId}`)
    transactionIds.add(transactionId)
    const id = requireString(item.depositId, `transactions[${index}].depositId`)
    const deposit = depositsById.get(id)
    if (!deposit) throw new Error(`资源交易引用未知矿藏：${id}`)
    const source = item.source
    if (!['initialization', 'regeneration', 'consumption', 'event'].includes(String(source))) {
      throw new Error(`transactions[${index}].source 无效`)
    }
    return {
      transactionId,
      depositId: id,
      contextId: deposit.contextId,
      nodeId: deposit.nodeId,
      delta: requireFinite(item.delta, `transactions[${index}].delta`),
      reason: requireString(item.reason, `transactions[${index}].reason`),
      occurredAtTotalDays: requireTotalDays(item.occurredAtTotalDays, `transactions[${index}].occurredAtTotalDays`),
      evidenceEventIds: stringList(item.evidenceEventIds, `transactions[${index}].evidenceEventIds`),
      source: source as NaturalResourceTransaction['source'],
    }
  })
  const lastAdvancedTotalDaysByContext = Object.fromEntries(
    Object.entries(value.lastAdvancedTotalDaysByContext).map(([contextId, totalDays]) => [
      requireString(contextId, '资源推进上下文 ID'),
      requireTotalDays(totalDays, `资源推进时间 ${contextId}`),
    ]),
  )
  return { schemaVersion: 1, deposits, transactions, lastAdvancedTotalDaysByContext }
}

export class NaturalResourceSystem extends BaseSubsystem {
  readonly id = 'natural-resource' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '自然资源系统' as const
  readonly description = '按世界上下文和空间节点拥有资源分布、储量、再生、消耗与耗竭状态' as const

  private state: NaturalResourcePersistenceState = {
    schemaVersion: 1,
    deposits: [],
    transactions: [],
    lastAdvancedTotalDaysByContext: {},
  }

  advance(context: RoundContext): void {
    this.initializeFromWorldContexts(context.totalDays)
    for (const instance of listWorldContexts()) {
      const contextId = instance.record.id
      if (!contextHasCapability(contextId, 'space')) continue
      const previous = this.state.lastAdvancedTotalDaysByContext[contextId] ?? context.totalDays
      const elapsedGlobalDays = Math.max(0, context.totalDays - previous)
      const canAdvance = instance.scope.scope === 'active'
        || (instance.scope.scope === 'background' && !instance.record.localCalendar.pausedWhenInactive)
      const elapsedDays = canAdvance
        ? elapsedGlobalDays * instance.record.localCalendar.timeScale
        : 0
      if (elapsedDays > 0) this.advanceContext(contextId, elapsedDays, context.totalDays)
      this.state.lastAdvancedTotalDaysByContext[contextId] = context.totalDays
    }
  }

  private initializeFromWorldContexts(totalDays: number): void {
    const known = new Set(this.state.deposits.map((deposit) => deposit.depositId))
    for (const instance of listWorldContexts()) {
      if (!contextHasCapability(instance.record.id, 'space')) continue
      this.state.lastAdvancedTotalDaysByContext[instance.record.id] ??= totalDays
      for (const region of instance.regions) {
        for (const [resourceTypeId, rawQuantity] of Object.entries(region.resourceDistribution ?? {})) {
          if (typeof rawQuantity !== 'number' || !Number.isFinite(rawQuantity) || rawQuantity <= 0) continue
          const id = depositId(instance.record.id, region.id, resourceTypeId)
          if (known.has(id)) continue
          const quantity = Math.max(0, rawQuantity)
          const deposit: NaturalResourceDeposit = {
            depositId: id,
            contextId: instance.record.id,
            nodeId: region.id,
            resourceTypeId,
            displayName: resourceTypeId,
            unit: 'relative-unit',
            quantity,
            capacity: Math.max(1, quantity),
            renewable: false,
            regenerationPerDay: 0,
            baselineConsumptionPerDay: 0,
            status: statusFor(quantity, Math.max(1, quantity)),
            traitTags: [],
            sourceEventIds: [],
            updatedAtTotalDays: totalDays,
          }
          this.state.deposits.push(deposit)
          this.state.transactions.push({
            transactionId: `resource-init:${encodeURIComponent(id)}:${totalDays}`,
            depositId: id,
            contextId: deposit.contextId,
            nodeId: deposit.nodeId,
            delta: quantity,
            reason: '世界初始化结构化资源分布',
            occurredAtTotalDays: totalDays,
            evidenceEventIds: [],
            source: 'initialization',
          })
          known.add(id)
        }
      }
    }
  }

  private advanceContext(contextId: string, elapsedDays: number, totalDays: number): void {
    const consumptionModifier = getFormulaModifier('resourceConsumptionModifier', 1, contextId)
    for (let index = 0; index < this.state.deposits.length; index++) {
      const current = this.state.deposits[index]
      if (current.contextId !== contextId) continue
      const regeneration = current.renewable ? current.regenerationPerDay * elapsedDays : 0
      const consumption = current.baselineConsumptionPerDay * elapsedDays * consumptionModifier
      const nextQuantity = Math.max(0, Math.min(current.capacity, current.quantity + regeneration - consumption))
      const delta = nextQuantity - current.quantity
      if (delta === 0) continue
      const next = { ...current, quantity: nextQuantity, status: statusFor(nextQuantity, current.capacity), updatedAtTotalDays: totalDays }
      this.state.deposits[index] = next
      this.state.transactions.push({
        transactionId: `resource-advance:${encodeURIComponent(current.depositId)}:${totalDays}`,
        depositId: current.depositId,
        contextId,
        nodeId: current.nodeId,
        delta,
        reason: '按规范经过天数结算再生与基础消耗',
        occurredAtTotalDays: totalDays,
        evidenceEventIds: [],
        source: delta > 0 ? 'regeneration' : 'consumption',
      })
    }
  }

  collectState(context: RoundContext): SubSystemState {
    const deposits = this.listDeposits(context.contextId)
    const strained = deposits.filter((deposit) => deposit.status !== 'available')
    return {
      id: this.id,
      summary: deposits.length === 0 ? '' : `【${this.label}】${deposits.length} 处节点资源；紧张 ${strained.filter((item) => item.status === 'strained').length}；耗竭 ${strained.filter((item) => item.status === 'depleted').length}`,
      data: { contextId: context.contextId, deposits },
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    void changes
    throw new Error('[natural-resource] 只接受拥有系统校验后的资源事件，不接受叙事 AI 直接写入')
  }

  registerDeposit(input: NaturalResourceDepositInput): NaturalResourceDeposit {
    assertWorldSpatialNode(input.contextId, input.nodeId)
    if (!Number.isInteger(input.totalDays) || input.totalDays < 0) throw new Error('资源登记时间无效')
    if (input.evidenceEventIds?.length) validateEvidence(input.evidenceEventIds, input.contextId)
    const id = input.depositId?.trim() || depositId(input.contextId, input.nodeId, input.resourceTypeId)
    if (this.state.deposits.some((deposit) => deposit.depositId === id)) throw new Error(`资源矿藏已存在：${id}`)
    const capacity = requireFinite(input.capacity, '资源容量', Number.EPSILON)
    const quantity = requireFinite(input.quantity, '资源储量', 0)
    if (quantity > capacity) throw new Error('资源储量不能超过容量')
    const deposit: NaturalResourceDeposit = {
      depositId: id,
      contextId: input.contextId,
      nodeId: input.nodeId,
      resourceTypeId: requireString(input.resourceTypeId, '资源类型'),
      displayName: requireString(input.displayName, '资源显示名'),
      unit: requireString(input.unit, '资源单位'),
      quantity,
      capacity,
      renewable: input.renewable,
      regenerationPerDay: requireFinite(input.regenerationPerDay ?? 0, '每日再生', 0),
      baselineConsumptionPerDay: requireFinite(input.baselineConsumptionPerDay ?? 0, '每日基础消耗', 0),
      status: statusFor(quantity, capacity),
      traitTags: [...new Set(input.traitTags ?? [])],
      sourceEventIds: [...new Set(input.evidenceEventIds ?? [])],
      updatedAtTotalDays: input.totalDays,
    }
    this.state.deposits.push(deposit)
    this.state.transactions.push({
      transactionId: `resource-init:${encodeURIComponent(id)}:${input.totalDays}`,
      depositId: id,
      contextId: input.contextId,
      nodeId: input.nodeId,
      delta: quantity,
      reason: '登记空间节点资源',
      occurredAtTotalDays: input.totalDays,
      evidenceEventIds: [...(input.evidenceEventIds ?? [])],
      source: 'initialization',
    })
    return clone(deposit)
  }

  recordTransaction(input: NaturalResourceTransactionInput): NaturalResourceDeposit {
    const index = this.state.deposits.findIndex((deposit) => deposit.depositId === input.depositId)
    if (index < 0) throw new Error(`资源矿藏不存在：${input.depositId}`)
    const current = this.state.deposits[index]
    if (input.evidenceEventIds.length === 0) throw new Error('资源事件变化必须引用已发生的历史事件')
    validateEvidence(input.evidenceEventIds, current.contextId)
    if (!Number.isInteger(input.totalDays) || input.totalDays < current.updatedAtTotalDays) throw new Error('资源事件时间无效或倒退')
    const nextQuantity = Math.max(0, Math.min(current.capacity, current.quantity + requireFinite(input.delta, '资源变化量')))
    const actualDelta = nextQuantity - current.quantity
    const next: NaturalResourceDeposit = {
      ...current,
      quantity: nextQuantity,
      status: statusFor(nextQuantity, current.capacity),
      sourceEventIds: [...new Set([...current.sourceEventIds, ...input.evidenceEventIds])],
      updatedAtTotalDays: input.totalDays,
    }
    this.state.deposits[index] = next
    this.state.transactions.push({
      transactionId: `resource-event:${encodeURIComponent(current.depositId)}:${input.totalDays}:${this.state.transactions.length}`,
      depositId: current.depositId,
      contextId: current.contextId,
      nodeId: current.nodeId,
      delta: actualDelta,
      reason: requireString(input.reason, '资源变化原因'),
      occurredAtTotalDays: input.totalDays,
      evidenceEventIds: [...input.evidenceEventIds],
      source: 'event',
    })
    return clone(next)
  }

  listDeposits(contextId: string, nodeId?: string): NaturalResourceDeposit[] {
    return clone(this.state.deposits.filter((deposit) => deposit.contextId === contextId && (!nodeId || deposit.nodeId === nodeId)))
  }

  capturePersistenceState(): NaturalResourcePersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, deposits: [], transactions: [], lastAdvancedTotalDaysByContext: {} }
      : validatePersistenceState(snapshot)
  }

  capturePreviewState(): NaturalResourcePersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, deposits: [], transactions: [], lastAdvancedTotalDaysByContext: {} }
  }
}

let runtimeNaturalResourceSystem: NaturalResourceSystem | undefined

export function getNaturalResourceSystem(): NaturalResourceSystem {
  runtimeNaturalResourceSystem ??= new NaturalResourceSystem()
  return runtimeNaturalResourceSystem
}
