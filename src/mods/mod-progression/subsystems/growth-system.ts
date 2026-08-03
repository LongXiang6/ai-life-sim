import { BaseSubsystem } from '@/core'
import {
  GROWTH_SYSTEM_OPERATION_FIELDS,
  type AbilityStatus,
  type GrowthRecord,
  type GrowthSkill,
  type GrowthSystemInstructionOperation,
  type GrowthSystemPersistenceState,
  type ProgressionScope,
  type RoundContext,
  type SkillMastery,
  type StableAbility,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'

import {
  assertEntityVisible,
  assertKnownKeys,
  clone,
  isRecord,
  normalizeProgressionScope,
  optionalStringList,
  requireInteger,
  requireString,
  requireStringList,
  requireTotalDays,
  validateEvidence,
  validateStoredProgressionScope,
} from '../utils'

const OPERATIONS = new Set<GrowthSystemInstructionOperation>([
  'learn-skill',
  'practice-skill',
  'gain-ability',
  'adjust-ability',
])
const ABILITY_STATUSES = new Set<AbilityStatus>(['latent', 'active', 'lost'])
const MASTERY_LEVELS = new Set<SkillMastery>(['novice', 'practiced', 'proficient', 'expert', 'master'])

function scopeKey(scope: ProgressionScope): string {
  return `${scope.kind}:${[...scope.contextIds].sort().join(',')}`
}

function stableId(kind: 'skill' | 'ability', entityId: string, name: string, scope: ProgressionScope): string {
  return `growth-${kind}:${encodeURIComponent(entityId)}:${encodeURIComponent(scopeKey(scope))}:${encodeURIComponent(name.trim().toLowerCase())}`
}

function masteryFor(experience: number, potentialCap: number): SkillMastery {
  const ratio = potentialCap <= 0 ? 0 : experience / potentialCap
  if (ratio >= 1) return 'master'
  if (ratio >= 0.75) return 'expert'
  if (ratio >= 0.5) return 'proficient'
  if (ratio >= 0.25) return 'practiced'
  return 'novice'
}

function validatePayload(
  operation: GrowthSystemInstructionOperation,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('成长系统指令变更必须是对象')
  assertKnownKeys(value, GROWTH_SYSTEM_OPERATION_FIELDS[operation], `成长操作 ${operation}`)
  return value
}

function validateSkill(value: unknown, index: number): GrowthSkill {
  if (!isRecord(value)) throw new Error(`skills[${index}]必须是对象`)
  assertKnownKeys(value, [
    'skillId', 'entityId', 'name', 'category', 'description', 'scope', 'experience',
    'useCount', 'potentialCap', 'mastery', 'learnedAtTotalDays', 'sourceEventIds',
  ], `skills[${index}]`)
  const potentialCap = requireInteger(value.potentialCap, `skills[${index}].potentialCap`, 1, 100000)
  const experience = requireInteger(value.experience, `skills[${index}].experience`, 0, potentialCap)
  const mastery = requireString(value.mastery, `skills[${index}].mastery`) as SkillMastery
  if (!MASTERY_LEVELS.has(mastery) || mastery !== masteryFor(experience, potentialCap)) {
    throw new Error(`skills[${index}].mastery 与经验不一致`)
  }
  return {
    skillId: requireString(value.skillId, `skills[${index}].skillId`),
    entityId: requireString(value.entityId, `skills[${index}].entityId`),
    name: requireString(value.name, `skills[${index}].name`),
    category: requireString(value.category, `skills[${index}].category`),
    description: requireString(value.description, `skills[${index}].description`),
    scope: validateStoredProgressionScope(value.scope, `skills[${index}].scope`),
    experience,
    useCount: requireInteger(value.useCount, `skills[${index}].useCount`, 0, Number.MAX_SAFE_INTEGER),
    potentialCap,
    mastery,
    learnedAtTotalDays: requireTotalDays(value.learnedAtTotalDays, `skills[${index}].learnedAtTotalDays`),
    sourceEventIds: requireStringList(value.sourceEventIds, `skills[${index}].sourceEventIds`),
  }
}

function validateAbility(value: unknown, index: number): StableAbility {
  if (!isRecord(value)) throw new Error(`abilities[${index}]必须是对象`)
  assertKnownKeys(value, [
    'abilityId', 'entityId', 'name', 'description', 'scope', 'potential',
    'learningConstraints', 'status', 'acquiredAtTotalDays', 'sourceEventIds',
  ], `abilities[${index}]`)
  const status = requireString(value.status, `abilities[${index}].status`) as AbilityStatus
  if (!ABILITY_STATUSES.has(status)) throw new Error(`abilities[${index}].status 无效`)
  return {
    abilityId: requireString(value.abilityId, `abilities[${index}].abilityId`),
    entityId: requireString(value.entityId, `abilities[${index}].entityId`),
    name: requireString(value.name, `abilities[${index}].name`),
    description: requireString(value.description, `abilities[${index}].description`),
    scope: validateStoredProgressionScope(value.scope, `abilities[${index}].scope`),
    potential: requireInteger(value.potential, `abilities[${index}].potential`, 0, 100),
    learningConstraints: requireStringList(value.learningConstraints, `abilities[${index}].learningConstraints`),
    status,
    acquiredAtTotalDays: requireTotalDays(value.acquiredAtTotalDays, `abilities[${index}].acquiredAtTotalDays`),
    sourceEventIds: requireStringList(value.sourceEventIds, `abilities[${index}].sourceEventIds`),
  }
}

function validateRecord(value: unknown, index: number): GrowthRecord {
  if (!isRecord(value)) throw new Error(`records[${index}]必须是对象`)
  assertKnownKeys(value, [
    'growthRecordId', 'entityId', 'targetId', 'operation', 'experienceDelta',
    'potentialDelta', 'description', 'occurredAtTotalDays', 'evidenceEventIds',
  ], `records[${index}]`)
  const operation = requireString(value.operation, `records[${index}].operation`) as GrowthSystemInstructionOperation
  if (!OPERATIONS.has(operation)) throw new Error(`records[${index}].operation 无效`)
  return {
    growthRecordId: requireString(value.growthRecordId, `records[${index}].growthRecordId`),
    entityId: requireString(value.entityId, `records[${index}].entityId`),
    targetId: requireString(value.targetId, `records[${index}].targetId`),
    operation,
    experienceDelta: requireInteger(value.experienceDelta, `records[${index}].experienceDelta`, 0, 100000),
    potentialDelta: requireInteger(value.potentialDelta, `records[${index}].potentialDelta`, -100, 100),
    description: requireString(value.description, `records[${index}].description`),
    occurredAtTotalDays: requireTotalDays(value.occurredAtTotalDays, `records[${index}].occurredAtTotalDays`),
    evidenceEventIds: requireStringList(value.evidenceEventIds, `records[${index}].evidenceEventIds`),
  }
}

function validatePersistenceState(value: unknown): GrowthSystemPersistenceState {
  if (!isRecord(value)) throw new Error('成长系统持久化快照必须是对象')
  assertKnownKeys(value, ['schemaVersion', 'skills', 'abilities', 'records'], '成长系统持久化快照')
  if (value.schemaVersion !== 1 || !Array.isArray(value.skills) || !Array.isArray(value.abilities) || !Array.isArray(value.records)) {
    throw new Error('成长系统持久化快照结构无效')
  }
  const skills = value.skills.map(validateSkill)
  const abilities = value.abilities.map(validateAbility)
  const records = value.records.map(validateRecord)
  for (const [label, ids] of [
    ['技能', skills.map((item) => item.skillId)],
    ['能力', abilities.map((item) => item.abilityId)],
    ['成长记录', records.map((item) => item.growthRecordId)],
  ] as const) {
    if (new Set(ids).size !== ids.length) throw new Error(`${label} ID 重复`)
  }
  return { schemaVersion: 1, skills, abilities, records }
}

function relevant(scope: ProgressionScope, contextId: string): boolean {
  return scope.kind === 'global' || scope.contextIds.includes(contextId)
}

export class GrowthSystem extends BaseSubsystem {
  readonly id = 'growth-system' as const
  readonly mod = 'mod-progression' as const
  readonly label = '通用成长' as const
  readonly description = '按稳定实体与世界作用域拥有技能经验、稳定能力及可审计成长记录' as const

  private state: GrowthSystemPersistenceState = { schemaVersion: 1, skills: [], abilities: [], records: [] }

  collectState(context: RoundContext): SubSystemState {
    const skills = this.state.skills.filter((item) => item.entityId === context.characterId && relevant(item.scope, context.contextId))
    const abilities = this.state.abilities.filter((item) => item.entityId === context.characterId && relevant(item.scope, context.contextId))
    const records = this.state.records.filter((item) => item.entityId === context.characterId).slice(-20)
    const skillText = skills.slice(0, 6).map((item) => `${item.name}:${item.mastery}`).join('、')
    const abilityText = abilities.filter((item) => item.status !== 'lost').slice(0, 4).map((item) => item.name).join('、')
    return {
      id: this.id,
      summary: `【${this.label}】技能 ${skills.length}${skillText ? `（${skillText}）` : ''}；有效能力 ${abilities.filter((item) => item.status !== 'lost').length}${abilityText ? `（${abilityText}）` : ''}`,
      data: structuredClone({
        contextId: context.contextId,
        entityId: context.characterId,
        skills,
        abilities,
        records,
      }),
    }
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || changes.id !== this.id) throw new Error('成长系统指令目标不匹配')
    if (!changes.description?.trim()) throw new Error('成长系统指令说明不能为空')
    if (changes.targetContextId !== context.contextId) throw new Error('成长系统目标上下文不是当前上下文')
    const operation = changes.operation as GrowthSystemInstructionOperation
    if (!OPERATIONS.has(operation)) throw new Error(`成长系统操作无效：${changes.operation ?? ''}`)
    const payload = validatePayload(operation, changes.changes)
    const targetObjectId = requireString(changes.targetObjectId, '成长目标对象')
    validateEvidence(changes.evidenceEventIds, context.contextId, '成长依据事件')

    if (operation === 'learn-skill' || operation === 'gain-ability') {
      assertEntityVisible(targetObjectId, context.contextId)
      const name = requireString(payload.name, '成长名称')
      const scope = normalizeProgressionScope(payload.scopeKind, payload.scopeContextIds, context.contextId)
      const id = stableId(operation === 'learn-skill' ? 'skill' : 'ability', targetObjectId, name, scope)
      const exists = operation === 'learn-skill'
        ? this.state.skills.some((item) => item.skillId === id)
        : this.state.abilities.some((item) => item.abilityId === id)
      if (exists) throw new Error(`成长条目已经存在：${id}`)
      requireString(payload.description, '成长描述')
      if (operation === 'learn-skill') {
        requireString(payload.category, '技能类别')
        requireInteger(payload.potentialCap, '技能潜力上限', 1, 100000)
      } else {
        requireInteger(payload.potential, '能力潜力', 0, 100)
        optionalStringList(payload.learningConstraints, '能力学习约束')
      }
      return
    }

    if (operation === 'practice-skill') {
      const skill = this.state.skills.find((item) => item.skillId === targetObjectId)
      if (!skill) throw new Error(`技能不存在：${targetObjectId}`)
      assertEntityVisible(skill.entityId, context.contextId)
      if (!relevant(skill.scope, context.contextId)) throw new Error('技能不属于当前上下文')
      requireInteger(payload.experienceDelta, '技能经验变化', 1, 10000)
      requireInteger(payload.useCountDelta, '技能使用次数变化', 1, 1000)
      return
    }

    const ability = this.state.abilities.find((item) => item.abilityId === targetObjectId)
    if (!ability) throw new Error(`能力不存在：${targetObjectId}`)
    assertEntityVisible(ability.entityId, context.contextId)
    if (!relevant(ability.scope, context.contextId)) throw new Error('能力不属于当前上下文')
    if (payload.potentialDelta === undefined && payload.abilityStatus === undefined) {
      throw new Error('能力调整至少需要潜力变化或状态')
    }
    if (payload.potentialDelta !== undefined) {
      const delta = requireInteger(payload.potentialDelta, '能力潜力变化', -100, 100)
      requireInteger(ability.potential + delta, '调整后能力潜力', 0, 100)
    }
    if (payload.abilityStatus !== undefined && !ABILITY_STATUSES.has(payload.abilityStatus as AbilityStatus)) {
      throw new Error('能力状态无效')
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error('成长系统指令必须是对象')
    if (changes.id !== this.id) throw new Error('成长系统指令目标不匹配')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('成长系统指令变更必须是对象')
    }
    if (!changes.description || changes.description.trim() === '') throw new Error('成长系统指令说明不能为空')
    const payload = changes.changes
    this.preflightChanges(changes, context)
    const operation = changes.operation as GrowthSystemInstructionOperation
    const targetObjectId = changes.targetObjectId as string
    const evidenceEventIds = [...(changes.evidenceEventIds ?? [])]
    let entityId = targetObjectId
    let targetId = targetObjectId
    let experienceDelta = 0
    let potentialDelta = 0

    if (operation === 'learn-skill') {
      const scope = normalizeProgressionScope(payload.scopeKind, payload.scopeContextIds, context.contextId)
      const potentialCap = payload.potentialCap as number
      const skill: GrowthSkill = {
        skillId: stableId('skill', targetObjectId, payload.name as string, scope),
        entityId: targetObjectId,
        name: (payload.name as string).trim(),
        category: (payload.category as string).trim(),
        description: (payload.description as string).trim(),
        scope,
        experience: 0,
        useCount: 0,
        potentialCap,
        mastery: 'novice',
        learnedAtTotalDays: context.totalDays,
        sourceEventIds: evidenceEventIds,
      }
      this.state.skills.push(skill)
      targetId = skill.skillId
    } else if (operation === 'practice-skill') {
      const index = this.state.skills.findIndex((item) => item.skillId === targetObjectId)
      const current = this.state.skills[index]
      experienceDelta = payload.experienceDelta as number
      const experience = Math.min(current.potentialCap, current.experience + experienceDelta)
      this.state.skills[index] = {
        ...current,
        experience,
        useCount: current.useCount + (payload.useCountDelta as number),
        mastery: masteryFor(experience, current.potentialCap),
        sourceEventIds: [...new Set([...current.sourceEventIds, ...evidenceEventIds])],
      }
      entityId = current.entityId
    } else if (operation === 'gain-ability') {
      const scope = normalizeProgressionScope(payload.scopeKind, payload.scopeContextIds, context.contextId)
      const ability: StableAbility = {
        abilityId: stableId('ability', targetObjectId, payload.name as string, scope),
        entityId: targetObjectId,
        name: (payload.name as string).trim(),
        description: (payload.description as string).trim(),
        scope,
        potential: payload.potential as number,
        learningConstraints: optionalStringList(payload.learningConstraints, '能力学习约束'),
        status: 'active',
        acquiredAtTotalDays: context.totalDays,
        sourceEventIds: evidenceEventIds,
      }
      this.state.abilities.push(ability)
      targetId = ability.abilityId
    } else {
      const index = this.state.abilities.findIndex((item) => item.abilityId === targetObjectId)
      const current = this.state.abilities[index]
      potentialDelta = payload.potentialDelta === undefined ? 0 : payload.potentialDelta as number
      this.state.abilities[index] = {
        ...current,
        potential: current.potential + potentialDelta,
        status: (payload.abilityStatus as AbilityStatus | undefined) ?? current.status,
        sourceEventIds: [...new Set([...current.sourceEventIds, ...evidenceEventIds])],
      }
      entityId = current.entityId
    }

    this.state.records.push({
      growthRecordId: `growth-record:${encodeURIComponent(targetId)}:${context.totalDays}:${this.state.records.length}`,
      entityId,
      targetId,
      operation,
      experienceDelta,
      potentialDelta,
      description: changes.description.trim(),
      occurredAtTotalDays: context.totalDays,
      evidenceEventIds,
    })
  }

  listSkills(entityId: string): GrowthSkill[] {
    return clone(this.state.skills.filter((item) => item.entityId === entityId))
  }

  listAbilities(entityId: string): StableAbility[] {
    return clone(this.state.abilities.filter((item) => item.entityId === entityId))
  }

  capturePersistenceState(): GrowthSystemPersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, skills: [], abilities: [], records: [] }
      : validatePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, skills: [], abilities: [], records: [] }
  }
}

let runtimeGrowthSystem: GrowthSystem | undefined

export function getGrowthSystem(): GrowthSystem {
  runtimeGrowthSystem ??= new GrowthSystem()
  return runtimeGrowthSystem
}
