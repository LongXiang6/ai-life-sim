/**
 * Purpose: Own player base attributes and the compact character narrative status.
 * Owner: mod-character / character-base
 * Responsibility: Attribute bounds, age and stage progression, health, fortune, and death binding.
 */

import { BaseSubsystem } from '@/core'
import {
  CHARACTER_BASE_OPERATION_FIELDS,
  type CharacterNarrativeStatus,
  type PendingCharacterDeath,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { clampCharacterAttributeDelta } from '@/core/shared'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { getCurrentWorldContext } from '@/mods/mod-world'

import {
  ATTR_HARD_CAP,
  ATTR_KEYS,
  MAX_ATTRIBUTE_VALUE,
  MIN_ATTRIBUTE_VALUE,
  TRANSCENDENT_ATTR_KEYS,
} from '../constants'
import { useCharacterStore } from '../store'
import type { AttributeModifiers, BaseAttributes, CharacterBaseState } from '../types'
import { round } from '../utils'
import { getAttrSemantic } from '../utils/attr-tiers'
import { sanitizeCharacterBaseState } from '../utils/character-state-migration'
import {
  advanceCharacterNarrativeStatus,
  createCharacterNarrativeStatus,
  findCurrentLifeStage,
  refreshCharacterGuidance,
} from './character-status-runtime'
import { applyCharacterStatusUpdate } from './character-status-update'

function emptyCharacterBaseState(): CharacterBaseState {
  return {
    base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    contextModifiers: {},
    startingAge: 0,
  }
}

function assertAllowedFields(operation: keyof typeof CHARACTER_BASE_OPERATION_FIELDS, payload: Record<string, unknown>): void {
  const allowed = new Set<string>(CHARACTER_BASE_OPERATION_FIELDS[operation])
  const unexpected = Object.keys(payload).filter((field) => !allowed.has(field))
  if (unexpected.length > 0) throw new Error(`角色操作 ${operation} 含未知字段：${unexpected.join('、')}`)
}

export class CharacterBaseSystem extends BaseSubsystem {
  readonly id = 'character-base' as const
  readonly mod = 'mod-character' as const
  readonly label = '角色状态' as const
  readonly description = '统一管理基础属性、生命阶段、健康、气运与死亡' as const
  readonly alwaysRelevant = true

  private state: CharacterBaseState = emptyCharacterBaseState()
  private pendingDeath?: PendingCharacterDeath

  advance(context: RoundContext): void {
    const status = this.ensureStatus(context)
    this.state.status = advanceCharacterNarrativeStatus(status, this.state.startingAge, context.totalBasePoints)
  }

  collectState(context: RoundContext): SubSystemState {
    this.advance(context)
    this.aggregateModifiers(context)
    this.recalculateCurrent()
    const status = this.state.status!
    const stage = findCurrentLifeStage(status)
    const attributes = ATTR_KEYS.map((key) => {
      const modifier = this.state.modifiers[key]
      const suffix = modifier === 0 ? '' : `(${modifier > 0 ? '+' : ''}${modifier})`
      return `${this.getAttrKeyLabel(key, this.state.base[key])}${suffix}：${getAttrSemantic(key, this.state.base[key])}`
    })
    return {
      id: this.id,
      summary: [
        `【${this.label}】${attributes.join(' | ')}`,
        `年龄 ${Math.floor(status.ageDays / 365)} 岁；阶段 ${stage?.displayName ?? '未定义'}`,
        ...status.guidance,
      ].join('\n'),
      data: structuredClone({ contextId: context.contextId, ...this.state }),
    }
  }

  collectStateUpdate(context: RoundContext): SubSystemState {
    return this.collectState(context)
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || changes.id !== this.id) throw new Error('角色状态指令目标不匹配')
    if (!changes.description?.trim()) throw new Error('角色状态指令说明不能为空')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('角色状态指令变更必须是对象')
    }
    if (changes.targetContextId && changes.targetContextId !== context.contextId) {
      throw new Error('角色状态目标上下文不是当前上下文')
    }
    const operation = changes.operation as keyof typeof CHARACTER_BASE_OPERATION_FIELDS
    if (!(operation in CHARACTER_BASE_OPERATION_FIELDS)) throw new Error(`角色状态操作无效：${changes.operation ?? ''}`)
    assertAllowedFields(operation, changes.changes)
    if (changes.targetObjectId && !['player:current', context.characterId].includes(changes.targetObjectId)) {
      throw new Error('角色状态操作只能指向当前玩家')
    }
    if (operation === 'adjust-attributes') {
      this.validateAttributePayload(changes.changes, context)
      return
    }
    const candidate = structuredClone(this.state.status ?? this.buildInitialStatus(context))
    applyCharacterStatusUpdate({
      status: candidate,
      payload: changes.changes,
      contextId: context.contextId,
      totalBasePoints: context.totalBasePoints,
      totalDays: context.totalDays,
      evidenceEventIds: changes.evidenceEventIds ?? [],
    })
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    this.preflightChanges(changes, context)
    const operation = changes.operation as keyof typeof CHARACTER_BASE_OPERATION_FIELDS
    if (operation === 'adjust-attributes') {
      for (const key of ATTR_KEYS) {
        const raw = changes.changes[`${key}Delta`]
        if (typeof raw !== 'number') continue
        const delta = clampCharacterAttributeDelta(raw, key, context.basePointsPassed)
        this.state.base[key] = round(this.clampAttr(key, this.state.base[key] + delta))
      }
      this.recalculateCurrent()
      return
    }
    const status = this.ensureStatus(context)
    this.pendingDeath = applyCharacterStatusUpdate({
      status,
      payload: changes.changes,
      contextId: context.contextId,
      totalBasePoints: context.totalBasePoints,
      totalDays: context.totalDays,
      evidenceEventIds: changes.evidenceEventIds ?? [],
    }) ?? this.pendingDeath
    this.state.status = status
  }

  onHistoricalEventsCommitted(eventIds: string[], context: RoundContext): void {
    const pending = this.pendingDeath
    const status = this.state.status
    if (!pending || !status || pending.contextId !== context.contextId) return
    const historicalEventId = [...eventIds].reverse().find((eventId) => {
      const event = getHistoricalEvent(eventId)
      return event?.eventType === 'character-death'
        && event.participants.some((participant) => participant.entityId === pending.entityId)
    })
    if (!historicalEventId) throw new Error('角色死亡缺少本轮已提交的历史事件')
    status.health.death = {
      deathId: `death:${encodeURIComponent(pending.entityId)}:${encodeURIComponent(historicalEventId)}`,
      ...pending,
      historicalEventId,
    }
    status.health.alive = false
    this.pendingDeath = undefined
    this.state.status = refreshCharacterGuidance(status)
  }

  getPendingDeath(entityId: string): PendingCharacterDeath | undefined {
    return this.pendingDeath?.entityId === entityId ? structuredClone(this.pendingDeath) : undefined
  }

  hydrateFromStore(): void {
    this.restoreCollectedState(useCharacterStore.getState().characterBase)
  }

  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    this.state = sanitizeCharacterBaseState(snapshot)
    this.pendingDeath = undefined
  }

  capturePersistenceState(): CharacterBaseState {
    if (this.pendingDeath) throw new Error('角色存在尚未绑定历史事件的死亡，不能持久化')
    return structuredClone(this.state)
  }

  captureTransactionState(): { state: CharacterBaseState; pendingDeath?: PendingCharacterDeath } {
    return structuredClone({
      state: this.state,
      ...(this.pendingDeath ? { pendingDeath: this.pendingDeath } : {}),
    })
  }

  restoreTransactionState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('角色状态事务快照无效')
    }
    const value = snapshot as { state?: unknown; pendingDeath?: PendingCharacterDeath }
    this.state = sanitizeCharacterBaseState(value.state)
    this.pendingDeath = value.pendingDeath ? structuredClone(value.pendingDeath) : undefined
    useCharacterStore.setState({ characterBase: structuredClone(this.state) })
  }

  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) this.reset()
    else this.restoreCollectedState(snapshot)
  }

  reset(): void {
    this.state = emptyCharacterBaseState()
    this.pendingDeath = undefined
  }

  getCurrent(): BaseAttributes {
    return { ...this.state.current }
  }

  getStartingAge(): number {
    return this.state.startingAge
  }

  getStatus(): CharacterNarrativeStatus | undefined {
    return this.state.status ? structuredClone(this.state.status) : undefined
  }

  setContextModifier(contextId: string, sourceId: string, modifiers: Partial<AttributeModifiers>): void {
    if (!contextId.trim() || !sourceId.trim()) throw new Error('上下文修正必须提供 contextId 和 sourceId')
    this.state.contextModifiers = {
      ...this.state.contextModifiers,
      [contextId]: { ...(this.state.contextModifiers[contextId] ?? {}), [sourceId]: structuredClone(modifiers) },
    }
  }

  clearContextModifier(contextId: string, sourceId: string): void {
    const sources = { ...(this.state.contextModifiers[contextId] ?? {}) }
    delete sources[sourceId]
    this.state.contextModifiers = { ...this.state.contextModifiers, [contextId]: sources }
  }

  private buildInitialStatus(context: RoundContext): CharacterNarrativeStatus {
    const store = useCharacterStore.getState()
    return createCharacterNarrativeStatus({
      entityId: context.characterId || store.characterId || undefined,
      startingAgeYears: this.state.startingAge,
      totalBasePoints: context.totalBasePoints,
      totalDays: context.totalDays,
      lifespanDraft: store.lifespanDraft,
      lifeStageTemplate: getCurrentWorldContext()?.worldConfig.lifeStageTemplate,
    })
  }

  private ensureStatus(context: RoundContext): CharacterNarrativeStatus {
    if (!this.state.status || (this.state.status.entityId && this.state.status.entityId !== context.characterId)) {
      this.state.status = this.buildInitialStatus(context)
    } else if (!this.state.status.entityId && context.characterId) {
      this.state.status.entityId = context.characterId
    }
    return this.state.status
  }

  private validateAttributePayload(payload: Record<string, unknown>, context: RoundContext): void {
    const entries = ATTR_KEYS.flatMap((key) => {
      const value = payload[`${key}Delta`]
      return value === undefined ? [] : [[key, value] as const]
    })
    if (entries.length === 0) throw new Error('基础属性操作至少需要一个变化字段')
    for (const [key, value] of entries) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value === 0) {
        throw new Error(`${key}变化必须是非零整数`)
      }
      clampCharacterAttributeDelta(value, key, context.basePointsPassed)
    }
  }

  private aggregateModifiers(context: RoundContext): void {
    const modifiers: AttributeModifiers = { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 }
    const raceBaseline = useCharacterStore.getState().lifespanDraft.race.attrBaselines
    for (const key of ATTR_KEYS) modifiers[key] += raceBaseline?.[key] ?? 0
    const patterns = (context.subsystemStates['destiny-pattern']?.data as {
      patterns?: Array<{ attrBonus?: Partial<AttributeModifiers> }>
    } | undefined)?.patterns ?? []
    for (const pattern of patterns) {
      for (const key of ATTR_KEYS) modifiers[key] += pattern.attrBonus?.[key] ?? 0
    }
    for (const source of Object.values(this.state.contextModifiers[context.contextId] ?? {})) {
      for (const key of ATTR_KEYS) modifiers[key] += source[key] ?? 0
    }
    for (const key of ATTR_KEYS) modifiers[key] = round(modifiers[key])
    this.state.modifiers = modifiers
  }

  private clampAttr(key: string, value: number): number {
    return (TRANSCENDENT_ATTR_KEYS as readonly string[]).includes(key)
      ? Math.max(-ATTR_HARD_CAP, Math.min(ATTR_HARD_CAP, value))
      : Math.max(MIN_ATTRIBUTE_VALUE, Math.min(MAX_ATTRIBUTE_VALUE, value))
  }

  private recalculateCurrent(): void {
    for (const key of ATTR_KEYS) {
      this.state.current[key] = round(this.clampAttr(key, this.state.base[key] + this.state.modifiers[key]))
    }
  }

  private getAttrKeyLabel(key: string, value: number): string {
    const names: Record<string, string> = { physique: '体魄', mind: '心智', talentAptitude: '悟性', charisma: '魅力' }
    return `${names[key] ?? key}${value}`
  }
}

let runtimeCharacterBaseSystem: CharacterBaseSystem | undefined

export function getCharacterBaseSystem(): CharacterBaseSystem {
  runtimeCharacterBaseSystem ??= new CharacterBaseSystem()
  return runtimeCharacterBaseSystem
}
