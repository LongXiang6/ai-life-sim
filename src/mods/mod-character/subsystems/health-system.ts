/**
 * Purpose: Own character vitality, conditions, death facts, and epilogue generation.
 * Owner: mod-character
 * Responsibility: Health business state and validation only; canonical time and historical evidence remain externally owned.
 */

import { BaseSubsystem, callAI } from '@/core'
import {
  HEALTH_SYSTEM_OPERATION_FIELDS,
  stringifyPrompt,
  type AIModelConfig,
  type ContextHealthRule,
  type DeathCauseKind,
  type DeathOutcome,
  type EntityHealthState,
  type HealthCondition,
  type HealthConditionKind,
  type HealthConditionStatus,
  type HealthSystemInstructionOperation,
  type HealthSystemPersistenceState,
  type PendingDeathFact,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import { useSettingsStore } from '@/mods/mod-settings'
import { getFormulaModifier } from '@/mods/mod-world'

import {
  DEFAULT_HEALTH_RECOVERY_PER_DAY,
  DEFAULT_MAX_VITALITY,
  DEFAULT_SPIRIT,
  DEFAULT_SPIRIT_RECOVERY_PER_DAY,
  DEFAULT_STAMINA,
  DEFAULT_STAMINA_RECOVERY_PER_DAY,
  DEFAULT_VITALITY,
} from '../constants'
import { getLifecycleSystem } from './lifecycle-system'
import { getLifespanSystem } from './lifespan-system'
import {
  assertEntityVisible,
  assertKnownContext,
  assertKnownKeys,
  clone,
  isRecord,
  requireAttributeModifiers,
  requireFinite,
  requireInteger,
  requireString,
  requireStringList,
  validateEvidence,
} from './life-cycle-validation'

const OPERATIONS = new Set<HealthSystemInstructionOperation>([
  'adjust-vitals', 'add-condition', 'resolve-condition',
])
const CONDITION_KINDS = new Set<HealthConditionKind>(['disease', 'injury', 'systemic', 'other'])
const CONDITION_STATUSES = new Set<HealthConditionStatus>(['active', 'recovering', 'resolved'])
const DEATH_CAUSES = new Set<DeathCauseKind>(['condition', 'trauma', 'old-age', 'vitality-collapse'])
const CONDITION_VITALITY_DAMAGE_PER_SEVERITY = 5

const EPILOGUE_SYSTEM_PROMPT = stringifyPrompt({
  role: '身后叙事编纂者。人物已经走完一生，请依据已确认事实写成庄重、克制的一生回顾。',
  requirements: [
    '使用第二人称叙事',
    '依次写出生平概述、关键转折、留下的影响与尾声寄语',
    '只使用输入中的既有事实，不虚构新的重大事件',
    '保持完整连贯，不输出 JSON 或系统说明',
  ],
  outputFormat: '纯文本，使用【生平概述】【关键转折】【留下的影响】【尾声寄语】作为段落标题。',
})

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

function validateDeath(value: unknown, label: string): DeathOutcome {
  if (!isRecord(value)) throw new Error(`${label}必须是对象`)
  assertKnownKeys(value, [
    'deathId', 'entityId', 'contextId', 'causeKind', 'causeLabel',
    'occurredAtTotalDays', 'finalAgeDays', 'historicalEventId',
    'epilogueStatus', 'epilogueText',
  ], label)
  const causeKind = requireString(value.causeKind, `${label}.causeKind`) as DeathCauseKind
  if (!DEATH_CAUSES.has(causeKind)) throw new Error(`${label}.causeKind 无效`)
  if (value.epilogueStatus !== 'pending' && value.epilogueStatus !== 'ready') {
    throw new Error(`${label}.epilogueStatus 无效`)
  }
  const epilogueText = value.epilogueText === undefined
    ? undefined
    : requireString(value.epilogueText, `${label}.epilogueText`)
  if (value.epilogueStatus === 'ready' && !epilogueText) throw new Error(`${label}已完成尾声但缺少正文`)
  if (value.epilogueStatus === 'pending' && epilogueText) throw new Error(`${label}待生成尾声不能已有正文`)
  const historicalEventId = requireString(value.historicalEventId, `${label}.historicalEventId`)
  const event = getHistoricalEvent(historicalEventId)
  if (!event || (event.status !== 'occurred' && event.status !== 'resolved')) {
    throw new Error(`${label}引用的死亡历史事件不存在或尚未发生`)
  }
  return {
    deathId: requireString(value.deathId, `${label}.deathId`),
    entityId: requireString(value.entityId, `${label}.entityId`),
    contextId: requireString(value.contextId, `${label}.contextId`),
    causeKind,
    causeLabel: requireString(value.causeLabel, `${label}.causeLabel`),
    occurredAtTotalDays: requireInteger(value.occurredAtTotalDays, `${label}.occurredAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
    finalAgeDays: requireInteger(value.finalAgeDays, `${label}.finalAgeDays`, 0, Number.MAX_SAFE_INTEGER),
    historicalEventId,
    epilogueStatus: value.epilogueStatus,
    ...(epilogueText ? { epilogueText } : {}),
  }
}

function validateEntity(value: unknown, index: number, allowPending = false): EntityHealthState {
  if (!isRecord(value)) throw new Error(`entities[${index}]必须是对象`)
  assertKnownKeys(value, [
    'entityId', 'vitality', 'maxVitality', 'stamina', 'spirit', 'alive',
    'conditionIds', 'death', 'updatedAtTotalDays',
  ], `entities[${index}]`)
  if (typeof value.alive !== 'boolean') throw new Error(`entities[${index}].alive 必须是布尔值`)
  const maxVitality = requireInteger(value.maxVitality, `entities[${index}].maxVitality`, 1, 100000)
  const death = value.death === undefined ? undefined : validateDeath(value.death, `entities[${index}].death`)
  if (!allowPending && value.alive === Boolean(death)) throw new Error(`entities[${index}]存活状态与死亡结果不一致`)
  return {
    entityId: requireString(value.entityId, `entities[${index}].entityId`),
    vitality: requireInteger(value.vitality, `entities[${index}].vitality`, 0, maxVitality),
    maxVitality,
    stamina: requireInteger(value.stamina, `entities[${index}].stamina`, 0, 100),
    spirit: requireInteger(value.spirit, `entities[${index}].spirit`, 0, 100),
    alive: value.alive,
    conditionIds: requireStringList(value.conditionIds, `entities[${index}].conditionIds`),
    ...(death ? { death } : {}),
    updatedAtTotalDays: requireInteger(value.updatedAtTotalDays, `entities[${index}].updatedAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
  }
}

function validateCondition(value: unknown, index: number): HealthCondition {
  if (!isRecord(value)) throw new Error(`conditions[${index}]必须是对象`)
  assertKnownKeys(value, [
    'conditionId', 'entityId', 'contextId', 'kind', 'name', 'bodyPart',
    'severity', 'status', 'onsetTotalDays', 'remainingDays',
    'attributeModifiers', 'traitTags', 'evidenceEventIds',
  ], `conditions[${index}]`)
  const kind = requireString(value.kind, `conditions[${index}].kind`) as HealthConditionKind
  const status = requireString(value.status, `conditions[${index}].status`) as HealthConditionStatus
  if (!CONDITION_KINDS.has(kind)) throw new Error(`conditions[${index}].kind 无效`)
  if (!CONDITION_STATUSES.has(status)) throw new Error(`conditions[${index}].status 无效`)
  const remainingDays = requireInteger(value.remainingDays, `conditions[${index}].remainingDays`, 0, Number.MAX_SAFE_INTEGER)
  if (status === 'resolved' && remainingDays !== 0) throw new Error(`conditions[${index}]已解决但剩余天数不为 0`)
  if (status !== 'resolved' && remainingDays === 0) throw new Error(`conditions[${index}]未解决但剩余天数为 0`)
  return {
    conditionId: requireString(value.conditionId, `conditions[${index}].conditionId`),
    entityId: requireString(value.entityId, `conditions[${index}].entityId`),
    contextId: requireString(value.contextId, `conditions[${index}].contextId`),
    kind,
    name: requireString(value.name, `conditions[${index}].name`),
    ...(value.bodyPart === undefined ? {} : { bodyPart: requireString(value.bodyPart, `conditions[${index}].bodyPart`) }),
    severity: requireInteger(value.severity, `conditions[${index}].severity`, 1, 10),
    status,
    onsetTotalDays: requireInteger(value.onsetTotalDays, `conditions[${index}].onsetTotalDays`, 0, Number.MAX_SAFE_INTEGER),
    remainingDays,
    attributeModifiers: requireAttributeModifiers(value.attributeModifiers, `conditions[${index}].attributeModifiers`),
    traitTags: requireStringList(value.traitTags, `conditions[${index}].traitTags`),
    evidenceEventIds: validateStoredEvidence(value.evidenceEventIds, `conditions[${index}].evidenceEventIds`),
  }
}

function validateContextRule(value: unknown, index: number): ContextHealthRule {
  if (!isRecord(value)) throw new Error(`contextRules[${index}]必须是对象`)
  assertKnownKeys(value, [
    'contextId', 'recoveryPerDay', 'conditionProgressionMultiplier',
    'staminaRecoveryPerDay', 'spiritRecoveryPerDay', 'medicalTags', 'sourceEventIds',
  ], `contextRules[${index}]`)
  const contextId = requireString(value.contextId, `contextRules[${index}].contextId`)
  assertKnownContext(contextId)
  return {
    contextId,
    recoveryPerDay: requireFinite(value.recoveryPerDay, `contextRules[${index}].recoveryPerDay`, 0, 10000),
    conditionProgressionMultiplier: requireFinite(value.conditionProgressionMultiplier, `contextRules[${index}].conditionProgressionMultiplier`, 0.01, 10000),
    staminaRecoveryPerDay: requireFinite(value.staminaRecoveryPerDay, `contextRules[${index}].staminaRecoveryPerDay`, 0, 10000),
    spiritRecoveryPerDay: requireFinite(value.spiritRecoveryPerDay, `contextRules[${index}].spiritRecoveryPerDay`, 0, 10000),
    medicalTags: requireStringList(value.medicalTags, `contextRules[${index}].medicalTags`),
    sourceEventIds: validateStoredEvidence(value.sourceEventIds, `contextRules[${index}].sourceEventIds`),
  }
}

function validatePersistenceState(value: unknown, allowPending = false): HealthSystemPersistenceState {
  if (!isRecord(value)) throw new Error('健康持久化快照必须是对象')
  assertKnownKeys(value, ['schemaVersion', 'entities', 'conditions', 'contextRules'], '健康持久化快照')
  if (value.schemaVersion !== 1 || !Array.isArray(value.entities) || !Array.isArray(value.conditions) || !Array.isArray(value.contextRules)) {
    throw new Error('健康持久化快照结构无效')
  }
  const entities = value.entities.map((item, index) => validateEntity(item, index, allowPending))
  const conditions = value.conditions.map(validateCondition)
  const contextRules = value.contextRules.map(validateContextRule)
  if (new Set(entities.map((item) => item.entityId)).size !== entities.length) throw new Error('健康人物状态重复')
  if (new Set(conditions.map((item) => item.conditionId)).size !== conditions.length) throw new Error('伤病条件 ID 重复')
  if (new Set(contextRules.map((item) => item.contextId)).size !== contextRules.length) throw new Error('健康上下文规则重复')
  const conditionMap = new Map(conditions.map((item) => [item.conditionId, item]))
  for (const entity of entities) {
    for (const conditionId of entity.conditionIds) {
      const condition = conditionMap.get(conditionId)
      if (!condition || condition.entityId !== entity.entityId || condition.status === 'resolved') {
        throw new Error('健康人物引用未知、已解决或属于其他人物的伤病')
      }
    }
    if (entity.death && entity.death.entityId !== entity.entityId) throw new Error('死亡结果人物不一致')
  }
  return { schemaVersion: 1, entities, conditions, contextRules }
}

function validatePayload(
  operation: HealthSystemInstructionOperation,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('健康系统指令变更必须是对象')
  assertKnownKeys(value, HEALTH_SYSTEM_OPERATION_FIELDS[operation], `健康操作 ${operation}`)
  return value
}

export class HealthSystem extends BaseSubsystem {
  readonly id = 'health' as const
  readonly mod = 'mod-character' as const
  readonly label = '健康' as const
  readonly description = '按人物拥有生命状态、体力、精神、按天伤病、死亡事实绑定与条件尾声' as const

  private state: HealthSystemPersistenceState = {
    schemaVersion: 1,
    entities: [],
    conditions: [],
    contextRules: [],
  }

  private pendingDeaths: PendingDeathFact[] = []

  advance(context: RoundContext): void {
    const entity = this.ensureEntity(context)
    const rule = this.ensureContextRule(context)
    if (!entity.alive) return
    const daysPassed = this.getDaysPassed(context)
    if (daysPassed < 0) throw new Error('健康推进天数不能为负数')

    if (daysPassed > 0) {
      const conditionProgress = Math.max(1, Math.round(
        daysPassed * rule.recoveryPerDay / rule.conditionProgressionMultiplier,
      ))
      for (const conditionId of [...entity.conditionIds]) {
        const condition = this.state.conditions.find((item) => item.conditionId === conditionId)
        if (!condition || condition.status === 'resolved') continue
        condition.remainingDays = Math.max(0, condition.remainingDays - conditionProgress)
        condition.status = condition.remainingDays === 0 ? 'resolved' : 'recovering'
      }
      entity.conditionIds = entity.conditionIds.filter((conditionId) => (
        this.state.conditions.find((item) => item.conditionId === conditionId)?.status !== 'resolved'
      ))
      entity.vitality = this.clampInteger(entity.vitality + Math.round(rule.recoveryPerDay * daysPassed), 0, entity.maxVitality)
      entity.stamina = this.clampInteger(entity.stamina + Math.round(rule.staminaRecoveryPerDay * daysPassed), 0, 100)
      entity.spirit = this.clampInteger(entity.spirit + Math.round(rule.spiritRecoveryPerDay * daysPassed), 0, 100)
      entity.updatedAtTotalDays = context.totalDays
    }

    const lifespan = getLifespanSystem().getProfile(entity.entityId)
    const lifecycle = getLifecycleSystem().getEntity(entity.entityId)
    if (
      lifespan?.clockMode === 'aging'
      && lifecycle
      && lifecycle.ageDays >= lifespan.maximumLifespanDays
    ) {
      entity.vitality = 0
      this.markPendingDeath(entity, context, 'old-age', '寿命边界已至')
    } else if (entity.vitality <= 0) {
      this.markPendingDeath(entity, context, 'vitality-collapse', '生命状态衰竭')
    }
  }

  collectState(context: RoundContext): SubSystemState {
    const entity = this.ensureEntity(context)
    const conditions = this.listActiveConditions(entity.entityId)
    const conditionSummary = conditions.length > 0
      ? `；伤病 ${conditions.map((item) => `${item.name}(${item.severity}级/${item.remainingDays}天)`).join('、')}`
      : ''
    return {
      id: this.id,
      summary: entity.alive
        ? `【${this.label}】生命 ${entity.vitality}/${entity.maxVitality}；体力 ${entity.stamina}/100；精神 ${entity.spirit}/100${conditionSummary}`
        : `【${this.label}】已死亡：${entity.death?.causeLabel ?? this.pendingDeaths.find((item) => item.entityId === entity.entityId)?.causeLabel ?? '等待历史事实确认'}`,
      data: structuredClone({
        entityId: entity.entityId,
        vitality: entity.vitality,
        maxVitality: entity.maxVitality,
        stamina: entity.stamina,
        spirit: entity.spirit,
        alive: entity.alive,
        conditions,
        death: entity.death,
      }),
    }
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || changes.id !== this.id) throw new Error('健康系统指令目标不匹配')
    if (!changes.description?.trim()) throw new Error('健康系统指令说明不能为空')
    if (changes.targetContextId !== context.contextId) throw new Error('健康系统目标上下文不是当前上下文')
    const operation = changes.operation as HealthSystemInstructionOperation
    if (!OPERATIONS.has(operation)) throw new Error(`健康系统操作无效：${changes.operation ?? ''}`)
    const payload = validatePayload(operation, changes.changes)
    const targetObjectId = requireString(changes.targetObjectId, '健康目标对象')
    validateEvidence(changes.evidenceEventIds, context.contextId, '健康依据事件')

    if (operation === 'resolve-condition') {
      const condition = this.state.conditions.find((item) => item.conditionId === targetObjectId)
      if (!condition || condition.status === 'resolved') throw new Error(`待解决伤病不存在：${targetObjectId}`)
      if (condition.contextId !== context.contextId) throw new Error('待解决伤病不属于当前上下文')
      assertEntityVisible(condition.entityId, context.contextId)
      requireString(payload.resolution, '伤病解决说明')
      return
    }

    assertEntityVisible(targetObjectId, context.contextId)
    const entity = this.state.entities.find((item) => item.entityId === targetObjectId)
    if (entity && !entity.alive) throw new Error('死亡人物不能再接受健康变更')

    if (operation === 'adjust-vitals') {
      const fields = ['vitalityDelta', 'staminaDelta', 'spiritDelta'] as const
      if (fields.every((field) => payload[field] === undefined)) throw new Error('生命状态调整至少需要一个变化字段')
      for (const field of fields) {
        if (payload[field] !== undefined) requireInteger(payload[field], field, -100000, 100000)
      }
      return
    }

    const kind = requireString(payload.conditionKind, '伤病类型') as HealthConditionKind
    if (!CONDITION_KINDS.has(kind)) throw new Error('伤病类型无效')
    requireString(payload.conditionName, '伤病名称')
    if (payload.bodyPart !== undefined) requireString(payload.bodyPart, '伤病部位')
    requireInteger(payload.severity, '伤病严重度', 1, 10)
    requireInteger(payload.recoveryDays, '伤病恢复天数', 1, Number.MAX_SAFE_INTEGER)
    requireAttributeModifiers(payload.attributeModifiers, '伤病属性修正')
    requireStringList(payload.conditionTags, '伤病标签')
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error('健康系统指令必须是对象')
    if (changes.id !== this.id) throw new Error('健康系统指令目标不匹配')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('健康系统指令变更必须是对象')
    }
    if (!changes.description || changes.description.trim() === '') throw new Error('健康系统指令说明不能为空')
    const payload = changes.changes
    this.ensureEntity(context)
    this.ensureContextRule(context)
    this.preflightChanges(changes, context)
    const operation = changes.operation as HealthSystemInstructionOperation

    if (operation === 'resolve-condition') {
      const condition = this.state.conditions.find((item) => item.conditionId === changes.targetObjectId)!
      condition.status = 'resolved'
      condition.remainingDays = 0
      condition.evidenceEventIds = [...new Set([...condition.evidenceEventIds, ...(changes.evidenceEventIds ?? [])])]
      const entity = this.state.entities.find((item) => item.entityId === condition.entityId)!
      entity.conditionIds = entity.conditionIds.filter((conditionId) => conditionId !== condition.conditionId)
      entity.updatedAtTotalDays = context.totalDays
      return
    }

    const entity = this.state.entities.find((item) => item.entityId === changes.targetObjectId)!
    if (operation === 'adjust-vitals') {
      entity.vitality = this.clampInteger(entity.vitality + (payload.vitalityDelta as number | undefined ?? 0), 0, entity.maxVitality)
      entity.stamina = this.clampInteger(entity.stamina + (payload.staminaDelta as number | undefined ?? 0), 0, 100)
      entity.spirit = this.clampInteger(entity.spirit + (payload.spiritDelta as number | undefined ?? 0), 0, 100)
      entity.updatedAtTotalDays = context.totalDays
      if (entity.vitality === 0) this.markPendingDeath(entity, context, 'vitality-collapse', '生命状态衰竭')
      return
    }

    const kind = payload.conditionKind as HealthConditionKind
    const condition: HealthCondition = {
      conditionId: `health-condition:${encodeURIComponent(entity.entityId)}:${encodeURIComponent(context.contextId)}:${context.totalDays}:${this.state.conditions.length}`,
      entityId: entity.entityId,
      contextId: context.contextId,
      kind,
      name: (payload.conditionName as string).trim(),
      ...(payload.bodyPart === undefined ? {} : { bodyPart: (payload.bodyPart as string).trim() }),
      severity: payload.severity as number,
      status: 'active',
      onsetTotalDays: context.totalDays,
      remainingDays: payload.recoveryDays as number,
      attributeModifiers: clone(payload.attributeModifiers as HealthCondition['attributeModifiers']),
      traitTags: clone(payload.conditionTags as string[]),
      evidenceEventIds: [...(changes.evidenceEventIds ?? [])],
    }
    this.state.conditions.push(condition)
    entity.conditionIds.push(condition.conditionId)
    entity.vitality = this.clampInteger(
      entity.vitality - condition.severity * CONDITION_VITALITY_DAMAGE_PER_SEVERITY,
      0,
      entity.maxVitality,
    )
    entity.updatedAtTotalDays = context.totalDays
    if (entity.vitality === 0) {
      this.markPendingDeath(
        entity,
        context,
        kind === 'injury' ? 'trauma' : 'condition',
        kind === 'injury' ? `致命伤势：${condition.name}` : `致命伤病：${condition.name}`,
      )
    }
  }

  onHistoricalEventsCommitted(eventIds: string[], context: RoundContext): void {
    const pending = this.pendingDeaths.filter((item) => item.contextId === context.contextId)
    for (const item of pending) {
      const matchingEventId = [...eventIds].reverse().find((eventId) => {
        const event = getHistoricalEvent(eventId)
        return event?.eventType === 'character-death'
          && event.participants.some((participant) => participant.entityId === item.entityId)
      })
      if (!matchingEventId) throw new Error(`人物 ${item.entityId} 的死亡缺少本轮已提交历史事件`)
      const entity = this.state.entities.find((candidate) => candidate.entityId === item.entityId)
      if (!entity) throw new Error(`死亡人物健康状态不存在：${item.entityId}`)
      entity.death = {
        deathId: `death:${encodeURIComponent(item.entityId)}:${encodeURIComponent(matchingEventId)}`,
        entityId: item.entityId,
        contextId: item.contextId,
        causeKind: item.causeKind,
        causeLabel: item.causeLabel,
        occurredAtTotalDays: item.occurredAtTotalDays,
        finalAgeDays: item.finalAgeDays,
        historicalEventId: matchingEventId,
        epilogueStatus: 'pending',
      }
    }
    const committed = new Set(pending.map((item) => `${item.contextId}\u0000${item.entityId}`))
    this.pendingDeaths = this.pendingDeaths.filter((item) => !committed.has(`${item.contextId}\u0000${item.entityId}`))
  }

  hasEpilogue(entityId: string): boolean {
    return this.state.entities.find((item) => item.entityId === entityId)?.death?.epilogueStatus === 'ready'
  }

  getPendingDeath(entityId: string): PendingDeathFact | undefined {
    const pending = this.pendingDeaths.find((item) => item.entityId === entityId)
    return pending ? clone(pending) : undefined
  }

  async generateEpilogue(
    context: RoundContext,
    aiConfig: AIModelConfig,
    narrativeHistory: string[],
    sessionId?: string,
  ): Promise<string> {
    const entity = this.state.entities.find((item) => item.entityId === context.characterId)
    const death = entity?.death
    if (!entity || entity.alive || !death) throw new Error('健康系统没有可生成尾声的已确认死亡结果')
    if (death.epilogueStatus === 'ready' && death.epilogueText) return death.epilogueText
    const lifecycle = getLifecycleSystem().getCurrentStage(entity.entityId)
    const lifespan = getLifespanSystem().getProfile(entity.entityId)
    const conditions = this.state.conditions
      .filter((item) => item.entityId === entity.entityId)
      .map((item) => ({ name: item.name, kind: item.kind, severity: item.severity, status: item.status }))
    const userPrompt = stringifyPrompt({
      characterId: entity.entityId,
      contextId: context.contextId,
      finalAgeYears: Math.floor(death.finalAgeDays / 365),
      death: {
        cause: death.causeLabel,
        historicalEventId: death.historicalEventId,
        occurredAtTotalDays: death.occurredAtTotalDays,
      },
      lifecycleStage: lifecycle ? { name: lifecycle.displayName, description: lifecycle.description } : undefined,
      lifespan: lifespan ? {
        race: lifespan.displayName,
        clockMode: lifespan.clockMode,
        maximumLifespanDays: lifespan.maximumLifespanDays,
      } : undefined,
      conditions,
      lifeEvents: narrativeHistory,
    })
    const settings = useSettingsStore.getState()
    const model = settings.customModel || aiConfig.model
    const epilogueText = (await callAI(EPILOGUE_SYSTEM_PROMPT, userPrompt, {
      config: { ...aiConfig, model },
      pool: 'lowFrequency',
      logCategory: 'epilogue',
      sessionId,
      providerId: settings.provider,
      customBaseUrl: settings.customUrl || undefined,
      customModel: model,
      apiKey: settings.customKey || undefined,
      overrideTemperature: 0.8,
      logContext: {
        round: context.round.year,
        age: Math.floor(death.finalAgeDays / 365),
        callKind: 'epilogue',
        pool: 'lowFrequency',
        model,
        sessionId,
      },
    })).trim()
    if (!epilogueText) throw new Error('尾声生成返回空文本')
    entity.death = { ...death, epilogueStatus: 'ready', epilogueText }
    return epilogueText
  }

  listActiveConditions(entityId: string): HealthCondition[] {
    const activeIds = new Set(
      this.state.entities.find((item) => item.entityId === entityId)?.conditionIds ?? [],
    )
    return clone(this.state.conditions.filter((item) => activeIds.has(item.conditionId)))
  }

  capturePersistenceState(): HealthSystemPersistenceState {
    if (this.pendingDeaths.length > 0) throw new Error('健康系统存在尚未绑定历史事件的死亡，不能持久化')
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, entities: [], conditions: [], contextRules: [] }
      : validatePersistenceState(snapshot)
    this.pendingDeaths = []
  }

  reset(): void {
    this.state = { schemaVersion: 1, entities: [], conditions: [], contextRules: [] }
    this.pendingDeaths = []
  }

  private ensureEntity(context: RoundContext): EntityHealthState {
    let entity = this.state.entities.find((item) => item.entityId === context.characterId)
    if (entity) return entity
    if (!context.characterId) throw new Error('健康系统缺少当前人物实体 ID')
    entity = {
      entityId: context.characterId,
      vitality: DEFAULT_VITALITY,
      maxVitality: DEFAULT_MAX_VITALITY,
      stamina: DEFAULT_STAMINA,
      spirit: DEFAULT_SPIRIT,
      alive: true,
      conditionIds: [],
      updatedAtTotalDays: context.totalDays,
    }
    this.state.entities.push(entity)
    return entity
  }

  private ensureContextRule(context: RoundContext): ContextHealthRule {
    let rule = this.state.contextRules.find((item) => item.contextId === context.contextId)
    if (rule) return rule
    if (!context.contextId) throw new Error('健康系统缺少当前世界上下文 ID')
    rule = {
      contextId: context.contextId,
      recoveryPerDay: DEFAULT_HEALTH_RECOVERY_PER_DAY * getFormulaModifier('vitalityRecoveryModifier', 1, context.contextId),
      conditionProgressionMultiplier: getFormulaModifier('conditionProgressionModifier', 1, context.contextId),
      staminaRecoveryPerDay: DEFAULT_STAMINA_RECOVERY_PER_DAY * getFormulaModifier('staminaRecoveryModifier', 1, context.contextId),
      spiritRecoveryPerDay: DEFAULT_SPIRIT_RECOVERY_PER_DAY * getFormulaModifier('spiritRecoveryModifier', 1, context.contextId),
      medicalTags: [],
      sourceEventIds: [],
    }
    this.state.contextRules.push(rule)
    return rule
  }

  private markPendingDeath(
    entity: EntityHealthState,
    context: RoundContext,
    causeKind: DeathCauseKind,
    causeLabel: string,
  ): void {
    if (!entity.alive || entity.death || this.pendingDeaths.some((item) => item.entityId === entity.entityId)) return
    const lifecycle = getLifecycleSystem().getEntity(entity.entityId)
    entity.alive = false
    entity.vitality = 0
    entity.updatedAtTotalDays = context.totalDays
    this.pendingDeaths.push({
      entityId: entity.entityId,
      contextId: context.contextId,
      causeKind,
      causeLabel,
      occurredAtTotalDays: context.totalDays,
      finalAgeDays: lifecycle?.ageDays ?? 0,
    })
  }

  private clampInteger(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)))
  }
}

let runtimeHealthSystem: HealthSystem | undefined

export function getHealthSystem(): HealthSystem {
  runtimeHealthSystem ??= new HealthSystem()
  return runtimeHealthSystem
}
