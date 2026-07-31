import { BaseSubsystem } from '@/core'
import {
  CHARACTER_DAYS_PER_YEAR,
  LIFESPAN_SYSTEM_OPERATION_FIELDS,
  type LifespanAdjustment,
  type LifespanRuleProfile,
  type LifespanSystemInstructionOperation,
  type LifespanSystemPersistenceState,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { getFormulaModifier } from '@/mods/mod-world'

import { RACE_LIFESPAN } from '../constants'
import { useCharacterStore } from '../store'
import {
  assertEntityVisible,
  assertKnownKeys,
  clone,
  isRecord,
  requireAttributeModifiers,
  requireClockMode,
  requireInteger,
  requireString,
  requireStringList,
  validateEvidence,
} from './life-cycle-validation'

const OPERATIONS = new Set<LifespanSystemInstructionOperation>(['adjust-maximum', 'set-rule'])
const PROFILE_SOURCES = new Set<LifespanRuleProfile['source']>([
  'character-creation',
  'world-rule',
  'confirmed-event',
])

function validateStoredEvidence(value: unknown, label: string): string[] {
  const eventIds = requireStringList(value, label)
  for (const eventId of eventIds) {
    const event = getHistoricalEvent(eventId)
    if (!event || (event.status !== 'occurred' && event.status !== 'resolved')) {
      throw new Error(`${label}引用的历史事件不存在或尚未发生：${eventId}`)
    }
  }
  return eventIds
}

function validateProfile(value: unknown, index: number): LifespanRuleProfile {
  if (!isRecord(value)) throw new Error(`profiles[${index}]必须是对象`)
  assertKnownKeys(value, [
    'entityId', 'raceId', 'displayName', 'clockMode', 'baseLifespanDays',
    'maximumLifespanDays', 'attrBaselines', 'source', 'sourceEventIds',
    'updatedAtTotalDays',
  ], `profiles[${index}]`)
  const entityId = requireString(value.entityId, `profiles[${index}].entityId`)
  const source = requireString(value.source, `profiles[${index}].source`) as LifespanRuleProfile['source']
  if (!PROFILE_SOURCES.has(source)) throw new Error(`profiles[${index}].source 无效`)
  return {
    entityId,
    raceId: requireString(value.raceId, `profiles[${index}].raceId`),
    displayName: requireString(value.displayName, `profiles[${index}].displayName`),
    clockMode: requireClockMode(value.clockMode, `profiles[${index}].clockMode`),
    baseLifespanDays: requireInteger(value.baseLifespanDays, `profiles[${index}].baseLifespanDays`, 1, Number.MAX_SAFE_INTEGER),
    maximumLifespanDays: requireInteger(value.maximumLifespanDays, `profiles[${index}].maximumLifespanDays`, 1, Number.MAX_SAFE_INTEGER),
    attrBaselines: requireAttributeModifiers(value.attrBaselines, `profiles[${index}].attrBaselines`),
    source,
    sourceEventIds: validateStoredEvidence(value.sourceEventIds, `profiles[${index}].sourceEventIds`),
    updatedAtTotalDays: requireInteger(value.updatedAtTotalDays, `profiles[${index}].updatedAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
  }
}

function validateAdjustment(value: unknown, index: number): LifespanAdjustment {
  if (!isRecord(value)) throw new Error(`adjustments[${index}]必须是对象`)
  assertKnownKeys(value, [
    'adjustmentId', 'entityId', 'deltaDays', 'operation', 'description',
    'occurredAtTotalDays', 'evidenceEventIds',
  ], `adjustments[${index}]`)
  const operation = requireString(value.operation, `adjustments[${index}].operation`) as LifespanSystemInstructionOperation
  if (!OPERATIONS.has(operation)) throw new Error(`adjustments[${index}].operation 无效`)
  return {
    adjustmentId: requireString(value.adjustmentId, `adjustments[${index}].adjustmentId`),
    entityId: requireString(value.entityId, `adjustments[${index}].entityId`),
    deltaDays: requireInteger(value.deltaDays, `adjustments[${index}].deltaDays`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    operation,
    description: requireString(value.description, `adjustments[${index}].description`),
    occurredAtTotalDays: requireInteger(value.occurredAtTotalDays, `adjustments[${index}].occurredAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
    evidenceEventIds: validateStoredEvidence(value.evidenceEventIds, `adjustments[${index}].evidenceEventIds`),
  }
}

function validatePersistenceState(value: unknown): LifespanSystemPersistenceState {
  if (!isRecord(value)) throw new Error('寿命持久化快照必须是对象')
  assertKnownKeys(value, ['schemaVersion', 'profiles', 'adjustments'], '寿命持久化快照')
  if (value.schemaVersion !== 1 || !Array.isArray(value.profiles) || !Array.isArray(value.adjustments)) {
    throw new Error('寿命持久化快照结构无效')
  }
  const profiles = value.profiles.map(validateProfile)
  const adjustments = value.adjustments.map(validateAdjustment)
  if (new Set(profiles.map((item) => item.entityId)).size !== profiles.length) {
    throw new Error('寿命人物档案重复')
  }
  if (new Set(adjustments.map((item) => item.adjustmentId)).size !== adjustments.length) {
    throw new Error('寿命调整 ID 重复')
  }
  const profileIds = new Set(profiles.map((item) => item.entityId))
  if (adjustments.some((item) => !profileIds.has(item.entityId))) {
    throw new Error('寿命调整引用未知人物档案')
  }
  return { schemaVersion: 1, profiles, adjustments }
}

function validatePayload(
  operation: LifespanSystemInstructionOperation,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('寿命系统指令变更必须是对象')
  assertKnownKeys(value, LIFESPAN_SYSTEM_OPERATION_FIELDS[operation], `寿命操作 ${operation}`)
  return value
}

export class LifespanSystem extends BaseSubsystem {
  readonly id = 'lifespan' as const
  readonly mod = 'mod-character' as const
  readonly label = '寿命规则' as const
  readonly description = '按人物实体拥有显式生物钟、种族基线、寿命上限与有历史依据的寿命调整' as const

  private state: LifespanSystemPersistenceState = {
    schemaVersion: 1,
    profiles: [],
    adjustments: [],
  }

  advance(context: RoundContext): void {
    this.ensureCharacterCreationProfile(context)
  }

  collectState(context: RoundContext): SubSystemState {
    this.ensureCharacterCreationProfile(context)
    const profile = this.getProfile(context.characterId)
    const adjustments = this.listAdjustments(context.characterId)
    const maximumYears = profile ? Math.round(profile.maximumLifespanDays / CHARACTER_DAYS_PER_YEAR) : 0
    return {
      id: this.id,
      summary: profile
        ? `【${this.label}】${profile.displayName}；生物钟 ${profile.clockMode}；寿命上限 ${maximumYears} 年；已确认调整 ${adjustments.length} 次`
        : '',
      data: structuredClone({
        entityId: context.characterId,
        profile,
        adjustments,
      }),
    }
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || changes.id !== this.id) throw new Error('寿命系统指令目标不匹配')
    if (!changes.description?.trim()) throw new Error('寿命系统指令说明不能为空')
    if (changes.targetContextId !== context.contextId) throw new Error('寿命系统目标上下文不是当前上下文')
    const operation = changes.operation as LifespanSystemInstructionOperation
    if (!OPERATIONS.has(operation)) throw new Error(`寿命系统操作无效：${changes.operation ?? ''}`)
    const payload = validatePayload(operation, changes.changes)
    const targetObjectId = requireString(changes.targetObjectId, '寿命目标对象')
    assertEntityVisible(targetObjectId, context.contextId)
    validateEvidence(changes.evidenceEventIds, context.contextId, '寿命依据事件')

    if (operation === 'set-rule') {
      requireString(payload.raceId, '种族 ID')
      requireString(payload.raceDisplayName, '种族显示名')
      requireClockMode(payload.clockMode, '生物钟模式')
      requireInteger(payload.baseLifespanDays, '基础寿命天数', 1, Number.MAX_SAFE_INTEGER)
      requireInteger(payload.maximumLifespanDays, '寿命上限天数', 1, Number.MAX_SAFE_INTEGER)
      requireAttributeModifiers(payload.attrBaselines, '种族属性基线')
      return
    }

    const profile = this.state.profiles.find((item) => item.entityId === targetObjectId)
    if (!profile) throw new Error(`寿命人物档案不存在：${targetObjectId}`)
    const delta = requireInteger(payload.maximumDaysDelta, '寿命上限变化天数', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    if (delta === 0) throw new Error('寿命上限变化不能为 0')
    requireInteger(profile.maximumLifespanDays + delta, '调整后寿命上限天数', 1, Number.MAX_SAFE_INTEGER)
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error('寿命系统指令必须是对象')
    if (changes.id !== this.id) throw new Error('寿命系统指令目标不匹配')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('寿命系统指令变更必须是对象')
    }
    if (!changes.description || changes.description.trim() === '') throw new Error('寿命系统指令说明不能为空')
    const payload = changes.changes
    this.preflightChanges(changes, context)
    const operation = changes.operation as LifespanSystemInstructionOperation
    const targetObjectId = changes.targetObjectId as string
    const evidenceEventIds = [...(changes.evidenceEventIds ?? [])]

    if (operation === 'set-rule') {
      const existingIndex = this.state.profiles.findIndex((item) => item.entityId === targetObjectId)
      const previousMaximum = existingIndex < 0 ? 0 : this.state.profiles[existingIndex].maximumLifespanDays
      const profile: LifespanRuleProfile = {
        entityId: targetObjectId,
        raceId: (payload.raceId as string).trim(),
        displayName: (payload.raceDisplayName as string).trim(),
        clockMode: payload.clockMode as LifespanRuleProfile['clockMode'],
        baseLifespanDays: payload.baseLifespanDays as number,
        maximumLifespanDays: payload.maximumLifespanDays as number,
        attrBaselines: clone(payload.attrBaselines as LifespanRuleProfile['attrBaselines']),
        source: evidenceEventIds.length > 0 ? 'confirmed-event' : 'character-creation',
        sourceEventIds: evidenceEventIds,
        updatedAtTotalDays: context.totalDays,
      }
      if (existingIndex < 0) this.state.profiles.push(profile)
      else this.state.profiles[existingIndex] = profile
      if (previousMaximum > 0 && previousMaximum !== profile.maximumLifespanDays) {
        this.recordAdjustment(targetObjectId, profile.maximumLifespanDays - previousMaximum, operation, changes, context)
      }
      return
    }

    const profileIndex = this.state.profiles.findIndex((item) => item.entityId === targetObjectId)
    const current = this.state.profiles[profileIndex]
    const deltaDays = payload.maximumDaysDelta as number
    this.state.profiles[profileIndex] = {
      ...current,
      maximumLifespanDays: current.maximumLifespanDays + deltaDays,
      source: evidenceEventIds.length > 0 ? 'confirmed-event' : current.source,
      sourceEventIds: [...new Set([...current.sourceEventIds, ...evidenceEventIds])],
      updatedAtTotalDays: context.totalDays,
    }
    this.recordAdjustment(targetObjectId, deltaDays, operation, changes, context)
  }

  getProfile(entityId: string): LifespanRuleProfile | undefined {
    const profile = this.state.profiles.find((item) => item.entityId === entityId)
    return profile ? clone(profile) : undefined
  }

  listAdjustments(entityId: string): LifespanAdjustment[] {
    return clone(this.state.adjustments.filter((item) => item.entityId === entityId))
  }

  capturePersistenceState(): LifespanSystemPersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, profiles: [], adjustments: [] }
      : validatePersistenceState(snapshot)
  }

  capturePreviewState(): LifespanSystemPersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, profiles: [], adjustments: [] }
  }

  private ensureCharacterCreationProfile(context: RoundContext): void {
    if (!context.characterId || this.state.profiles.some((item) => item.entityId === context.characterId)) return
    const draft = useCharacterStore.getState().lifespanDraft
    const race = draft?.race ?? RACE_LIFESPAN.human
    if (!race) throw new Error('角色创建缺少有效种族寿命规则')
    const maximumYears = draft?.maximumLifespanYears ?? race.baseLifespanYears
    const lifespanModifier = getFormulaModifier('lifespanModifier', 1, context.contextId)
    this.state.profiles.push({
      entityId: context.characterId,
      raceId: draft?.raceId || 'human',
      displayName: race.name,
      clockMode: race.clockMode,
      baseLifespanDays: Math.max(1, Math.round(race.baseLifespanYears * CHARACTER_DAYS_PER_YEAR)),
      maximumLifespanDays: Math.max(1, Math.round(maximumYears * CHARACTER_DAYS_PER_YEAR * lifespanModifier)),
      attrBaselines: clone(race.attrBaselines ?? {}),
      source: 'character-creation',
      sourceEventIds: [],
      updatedAtTotalDays: context.totalDays,
    })
  }

  private recordAdjustment(
    entityId: string,
    deltaDays: number,
    operation: LifespanSystemInstructionOperation,
    changes: SubSystemChanges,
    context: RoundContext,
  ): void {
    this.state.adjustments.push({
      adjustmentId: `lifespan-adjustment:${encodeURIComponent(entityId)}:${context.totalDays}:${this.state.adjustments.length}`,
      entityId,
      deltaDays,
      operation,
      description: changes.description.trim(),
      occurredAtTotalDays: context.totalDays,
      evidenceEventIds: [...(changes.evidenceEventIds ?? [])],
    })
  }
}

let runtimeLifespanSystem: LifespanSystem | undefined

export function getLifespanSystem(): LifespanSystem {
  runtimeLifespanSystem ??= new LifespanSystem()
  return runtimeLifespanSystem
}
