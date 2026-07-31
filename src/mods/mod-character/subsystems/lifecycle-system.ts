import { BaseSubsystem } from '@/core'
import {
  resolveCharacterAgeDays,
  resolveInitialAgeAnchorTotalDays,
  type BiologicalClockMode,
  type EntityLifecycleState,
  type LifecycleNarrativeArchetype,
  type LifecycleRuleProfile,
  type LifecycleStageDefinition,
  type LifecycleSystemPersistenceState,
  type LifecycleTransitionRecord,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'

import { getCharacterBaseSystem } from './character-base-system'
import { getLifespanSystem } from './lifespan-system'
import {
  assertKnownKeys,
  clone,
  isRecord,
  requireAttributeModifiers,
  requireClockMode,
  requireFinite,
  requireInteger,
  requireString,
  requireStringList,
} from './life-cycle-validation'

const ARCHETYPES = new Set<LifecycleNarrativeArchetype>([
  'routine', 'danger', 'opportunity', 'social', 'exploration', 'rumor', 'mystery',
])
const PROFILE_SOURCES = new Set<LifecycleRuleProfile['source']>([
  'lifespan-rule', 'world-rule', 'confirmed-event',
])
const ALL_ARCHETYPES: LifecycleNarrativeArchetype[] = [
  'routine', 'danger', 'opportunity', 'social', 'exploration', 'rumor', 'mystery',
]

function stage(
  stageId: string,
  displayName: string,
  description: string,
  minAgeDays: number,
  maxAgeDays: number | undefined,
  nextStageIds: string[],
  coefficients: LifecycleStageDefinition['coefficients'],
  attributeModifiers: LifecycleStageDefinition['attributeModifiers'],
  allowedArchetypes: LifecycleNarrativeArchetype[],
  terminal = false,
): LifecycleStageDefinition {
  return {
    stageId,
    displayName,
    description,
    minAgeDays,
    ...(maxAgeDays === undefined ? {} : { maxAgeDays }),
    requiredConditionTags: [],
    nextStageIds,
    coefficients,
    attributeModifiers,
    allowedArchetypes,
    terminal,
  }
}

function scaledBoundary(maximumDays: number, ratio: number, previous: number): number {
  return Math.min(maximumDays, Math.max(previous + 1, Math.round(maximumDays * ratio)))
}

function buildAgingStages(maximumDays: number): LifecycleStageDefinition[] {
  const earlyEnd = scaledBoundary(maximumDays, 0.12, 0)
  const formingEnd = scaledBoundary(maximumDays, 0.2, earlyEnd)
  const primeEnd = scaledBoundary(maximumDays, 0.55, formingEnd)
  const matureEnd = scaledBoundary(maximumDays, 0.78, primeEnd)
  return [
    stage('early-life', '早期生命', '身体与心智仍在形成，照护和学习比独立承担风险更重要。', 0, earlyEnd, ['forming-life'], { vitality: 0.6, learning: 1.4, social: 0.7 }, { physique: -2, mind: -1, charisma: -1 }, ['routine', 'social', 'opportunity']),
    stage('forming-life', '成长阶段', '能力、身份与社会关系快速成形，学习和探索空间较大。', earlyEnd, formingEnd, ['prime-life'], { vitality: 0.9, learning: 1.5, social: 1 }, { physique: -1 }, ['routine', 'opportunity', 'social', 'exploration', 'mystery']),
    stage('prime-life', '盛年阶段', '生理机能与行动能力处于稳定高位，可完整承担各类人生事件。', formingEnd, primeEnd, ['mature-life'], { vitality: 1.1, learning: 1.1, social: 1.1 }, {}, ALL_ARCHETYPES),
    stage('mature-life', '成熟阶段', '经验和社会积累占据优势，恢复能力开始缓慢下降。', primeEnd, matureEnd, ['late-life'], { vitality: 0.9, learning: 0.9, social: 1.2 }, { physique: -1, mind: 1 }, ALL_ARCHETYPES),
    stage('late-life', '晚期生命', '剩余寿命收紧，身体负担增大，但经验仍能支撑判断与关系。', matureEnd, maximumDays, ['lifespan-limit'], { vitality: 0.55, learning: 0.65, social: 0.9 }, { physique: -3, mind: -1, talentAptitude: -1 }, ['routine', 'danger', 'social', 'rumor', 'mystery']),
    stage('lifespan-limit', '寿命边界', '规范生物钟已经抵达当前寿命上限，死亡结果由健康系统确认。', maximumDays, undefined, [], { vitality: 0, learning: 0, social: 0 }, { physique: -5, mind: -2, talentAptitude: -2, charisma: -1 }, ['routine'], true),
  ]
}

function buildStableStages(mode: 'ageless' | 'external'): LifecycleStageDefinition[] {
  return [stage(
    mode === 'ageless' ? 'ageless-stable' : 'externally-maintained',
    mode === 'ageless' ? '恒常生命' : '外部维持',
    mode === 'ageless'
      ? '时间继续流逝，但生物状态不按年龄自动衰退。'
      : '生命状态由外部规则维持，不随规范时间自动增长或衰老。',
    0,
    undefined,
    [],
    { vitality: 1, learning: 1, social: 1 },
    {},
    ALL_ARCHETYPES,
  )]
}

function buildCyclicStages(cycleDays: number): LifecycleStageDefinition[] {
  const phase = Math.max(1, Math.round(cycleDays / 4))
  return [
    stage('cycle-renewal', '复苏期', '生命循环重新展开，恢复与学习活跃。', 0, phase, ['cycle-flourish'], { vitality: 0.9, learning: 1.3, social: 0.9 }, {}, ['routine', 'opportunity', 'social', 'exploration']),
    stage('cycle-flourish', '繁盛期', '循环处于充盈状态，行动和社会活动达到高点。', phase, phase * 2, ['cycle-wane'], { vitality: 1.2, learning: 1, social: 1.2 }, { physique: 1 }, ALL_ARCHETYPES),
    stage('cycle-wane', '衰退期', '循环能量回落，风险承受和恢复能力下降。', phase * 2, phase * 3, ['cycle-rest'], { vitality: 0.7, learning: 0.8, social: 0.8 }, { physique: -1 }, ['routine', 'danger', 'social', 'rumor', 'mystery']),
    stage('cycle-rest', '休眠期', '本轮生命循环接近静止，等待下一次复苏。', phase * 3, cycleDays, ['cycle-renewal'], { vitality: 0.4, learning: 0.5, social: 0.4 }, { physique: -2, charisma: -1 }, ['routine', 'mystery']),
  ]
}

function buildStages(mode: BiologicalClockMode, baseDays: number, maximumDays: number): LifecycleStageDefinition[] {
  if (mode === 'aging') return buildAgingStages(maximumDays)
  if (mode === 'cyclic') return buildCyclicStages(Math.max(4, baseDays))
  return buildStableStages(mode)
}

function validateStage(value: unknown, label: string): LifecycleStageDefinition {
  if (!isRecord(value)) throw new Error(`${label}必须是对象`)
  assertKnownKeys(value, [
    'stageId', 'displayName', 'description', 'minAgeDays', 'maxAgeDays',
    'requiredConditionTags', 'nextStageIds', 'coefficients', 'attributeModifiers',
    'allowedArchetypes', 'terminal',
  ], label)
  if (!isRecord(value.coefficients)) throw new Error(`${label}.coefficients 必须是对象`)
  assertKnownKeys(value.coefficients, ['vitality', 'learning', 'social'], `${label}.coefficients`)
  const allowedArchetypes = requireStringList(value.allowedArchetypes, `${label}.allowedArchetypes`) as LifecycleNarrativeArchetype[]
  if (allowedArchetypes.some((item) => !ARCHETYPES.has(item))) throw new Error(`${label}.allowedArchetypes 含无效类型`)
  if (typeof value.terminal !== 'boolean') throw new Error(`${label}.terminal 必须是布尔值`)
  const minAgeDays = requireInteger(value.minAgeDays, `${label}.minAgeDays`, 0, Number.MAX_SAFE_INTEGER)
  const maxAgeDays = value.maxAgeDays === undefined
    ? undefined
    : requireInteger(value.maxAgeDays, `${label}.maxAgeDays`, minAgeDays + 1, Number.MAX_SAFE_INTEGER)
  return {
    stageId: requireString(value.stageId, `${label}.stageId`),
    displayName: requireString(value.displayName, `${label}.displayName`),
    description: requireString(value.description, `${label}.description`),
    minAgeDays,
    ...(maxAgeDays === undefined ? {} : { maxAgeDays }),
    requiredConditionTags: requireStringList(value.requiredConditionTags, `${label}.requiredConditionTags`),
    nextStageIds: requireStringList(value.nextStageIds, `${label}.nextStageIds`),
    coefficients: {
      vitality: requireFinite(value.coefficients.vitality, `${label}.coefficients.vitality`, 0, 10),
      learning: requireFinite(value.coefficients.learning, `${label}.coefficients.learning`, 0, 10),
      social: requireFinite(value.coefficients.social, `${label}.coefficients.social`, 0, 10),
    },
    attributeModifiers: requireAttributeModifiers(value.attributeModifiers, `${label}.attributeModifiers`),
    allowedArchetypes,
    terminal: value.terminal,
  }
}

function validateProfile(value: unknown, index: number): LifecycleRuleProfile {
  if (!isRecord(value)) throw new Error(`profiles[${index}]必须是对象`)
  assertKnownKeys(value, [
    'profileId', 'entityId', 'clockMode', 'stages', 'source', 'sourceEventIds',
    'updatedAtTotalDays',
  ], `profiles[${index}]`)
  if (!Array.isArray(value.stages) || value.stages.length === 0) throw new Error(`profiles[${index}].stages 不能为空`)
  const stages = value.stages.map((item, stageIndex) => validateStage(item, `profiles[${index}].stages[${stageIndex}]`))
  const stageIds = new Set(stages.map((item) => item.stageId))
  if (stageIds.size !== stages.length) throw new Error(`profiles[${index}]阶段 ID 重复`)
  for (const item of stages) {
    if (item.nextStageIds.some((stageId) => !stageIds.has(stageId))) throw new Error(`profiles[${index}]阶段引用未知后继`)
  }
  const source = requireString(value.source, `profiles[${index}].source`) as LifecycleRuleProfile['source']
  if (!PROFILE_SOURCES.has(source)) throw new Error(`profiles[${index}].source 无效`)
  return {
    profileId: requireString(value.profileId, `profiles[${index}].profileId`),
    entityId: requireString(value.entityId, `profiles[${index}].entityId`),
    clockMode: requireClockMode(value.clockMode, `profiles[${index}].clockMode`),
    stages,
    source,
    sourceEventIds: requireStringList(value.sourceEventIds, `profiles[${index}].sourceEventIds`),
    updatedAtTotalDays: requireInteger(value.updatedAtTotalDays, `profiles[${index}].updatedAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
  }
}

function validateEntity(value: unknown, index: number): EntityLifecycleState {
  if (!isRecord(value)) throw new Error(`entities[${index}]必须是对象`)
  assertKnownKeys(value, [
    'entityId', 'profileId', 'currentStageId', 'startingAgeDays',
    'ageAnchorTotalDays', 'ageDays', 'conditionTags', 'attributeModifiers',
    'updatedAtTotalDays',
  ], `entities[${index}]`)
  return {
    entityId: requireString(value.entityId, `entities[${index}].entityId`),
    profileId: requireString(value.profileId, `entities[${index}].profileId`),
    currentStageId: requireString(value.currentStageId, `entities[${index}].currentStageId`),
    startingAgeDays: requireInteger(value.startingAgeDays, `entities[${index}].startingAgeDays`, 0, Number.MAX_SAFE_INTEGER),
    ageAnchorTotalDays: requireInteger(value.ageAnchorTotalDays, `entities[${index}].ageAnchorTotalDays`, 0, Number.MAX_SAFE_INTEGER),
    ageDays: requireInteger(value.ageDays, `entities[${index}].ageDays`, 0, Number.MAX_SAFE_INTEGER),
    conditionTags: requireStringList(value.conditionTags, `entities[${index}].conditionTags`),
    attributeModifiers: requireAttributeModifiers(value.attributeModifiers, `entities[${index}].attributeModifiers`),
    updatedAtTotalDays: requireInteger(value.updatedAtTotalDays, `entities[${index}].updatedAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
  }
}

function validateTransition(value: unknown, index: number): LifecycleTransitionRecord {
  if (!isRecord(value)) throw new Error(`transitions[${index}]必须是对象`)
  assertKnownKeys(value, [
    'transitionId', 'entityId', 'profileId', 'fromStageId', 'toStageId',
    'occurredAtTotalDays', 'reason', 'historicalEventId',
  ], `transitions[${index}]`)
  return {
    transitionId: requireString(value.transitionId, `transitions[${index}].transitionId`),
    entityId: requireString(value.entityId, `transitions[${index}].entityId`),
    profileId: requireString(value.profileId, `transitions[${index}].profileId`),
    fromStageId: requireString(value.fromStageId, `transitions[${index}].fromStageId`),
    toStageId: requireString(value.toStageId, `transitions[${index}].toStageId`),
    occurredAtTotalDays: requireInteger(value.occurredAtTotalDays, `transitions[${index}].occurredAtTotalDays`, 0, Number.MAX_SAFE_INTEGER),
    reason: requireString(value.reason, `transitions[${index}].reason`),
    ...(value.historicalEventId === undefined ? {} : {
      historicalEventId: requireString(value.historicalEventId, `transitions[${index}].historicalEventId`),
    }),
  }
}

function validatePersistenceState(value: unknown): LifecycleSystemPersistenceState {
  if (!isRecord(value)) throw new Error('生命周期持久化快照必须是对象')
  assertKnownKeys(value, ['schemaVersion', 'profiles', 'entities', 'transitions'], '生命周期持久化快照')
  if (value.schemaVersion !== 1 || !Array.isArray(value.profiles) || !Array.isArray(value.entities) || !Array.isArray(value.transitions)) {
    throw new Error('生命周期持久化快照结构无效')
  }
  const profiles = value.profiles.map(validateProfile)
  const entities = value.entities.map(validateEntity)
  const transitions = value.transitions.map(validateTransition)
  if (new Set(profiles.map((item) => item.profileId)).size !== profiles.length) throw new Error('生命周期档案 ID 重复')
  if (new Set(entities.map((item) => item.entityId)).size !== entities.length) throw new Error('生命周期人物状态重复')
  if (new Set(transitions.map((item) => item.transitionId)).size !== transitions.length) throw new Error('生命周期转换 ID 重复')
  const profileMap = new Map(profiles.map((item) => [item.profileId, item]))
  for (const entity of entities) {
    const profile = profileMap.get(entity.profileId)
    if (!profile || profile.entityId !== entity.entityId) throw new Error('生命周期人物引用未知档案')
    const currentStage = profile.stages.find((item) => item.stageId === entity.currentStageId)
    if (!currentStage) throw new Error('生命周期人物引用未知阶段')
    if (JSON.stringify(currentStage.attributeModifiers) !== JSON.stringify(entity.attributeModifiers)) {
      throw new Error('生命周期属性修正不是当前阶段的派生值')
    }
  }
  for (const transition of transitions) {
    const profile = profileMap.get(transition.profileId)
    if (!profile || profile.entityId !== transition.entityId) throw new Error('生命周期转换引用未知档案')
    const stageIds = new Set(profile.stages.map((item) => item.stageId))
    if (!stageIds.has(transition.fromStageId) || !stageIds.has(transition.toStageId)) {
      throw new Error('生命周期转换引用未知阶段')
    }
  }
  return { schemaVersion: 1, profiles, entities, transitions }
}

export class LifecycleSystem extends BaseSubsystem {
  readonly id = 'lifecycle-system' as const
  readonly mod = 'mod-character' as const
  readonly label = '生命周期' as const
  readonly description = '从人物寿命规则与规范总天数派生阶段、当前年龄和非累计属性修正' as const

  private state: LifecycleSystemPersistenceState = {
    schemaVersion: 1,
    profiles: [],
    entities: [],
    transitions: [],
  }

  advance(context: RoundContext): void {
    this.refreshEntity(context)
  }

  collectState(context: RoundContext): SubSystemState {
    this.refreshEntity(context)
    const entity = this.getEntity(context.characterId)
    const profile = entity ? this.state.profiles.find((item) => item.profileId === entity.profileId) : undefined
    const currentStage = entity && profile
      ? profile.stages.find((item) => item.stageId === entity.currentStageId)
      : undefined
    return {
      id: this.id,
      summary: entity && currentStage
        ? `【${this.label}】${currentStage.displayName}；年龄 ${Math.floor(entity.ageDays / 365)} 岁；${currentStage.description}`
        : '',
      data: structuredClone({
        entity,
        profile,
        currentStage,
        transitions: this.state.transitions.filter((item) => item.entityId === context.characterId),
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    void changes
    throw new Error('[lifecycle-system] 生命周期只从寿命规则、规范时间和条件标签派生，不接受直接写入')
  }

  getEntity(entityId: string): EntityLifecycleState | undefined {
    const entity = this.state.entities.find((item) => item.entityId === entityId)
    return entity ? clone(entity) : undefined
  }

  getCurrentStage(entityId: string): LifecycleStageDefinition | undefined {
    const entity = this.state.entities.find((item) => item.entityId === entityId)
    const profile = entity ? this.state.profiles.find((item) => item.profileId === entity.profileId) : undefined
    const current = profile?.stages.find((item) => item.stageId === entity?.currentStageId)
    return current ? clone(current) : undefined
  }

  capturePersistenceState(): LifecycleSystemPersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, profiles: [], entities: [], transitions: [] }
      : validatePersistenceState(snapshot)
  }

  capturePreviewState(): LifecycleSystemPersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, profiles: [], entities: [], transitions: [] }
  }

  private refreshEntity(context: RoundContext): void {
    if (!context.characterId) return
    const lifespan = getLifespanSystem().getProfile(context.characterId)
    if (!lifespan) return
    const profileId = [
      'lifecycle-profile',
      encodeURIComponent(lifespan.entityId),
      lifespan.clockMode,
      lifespan.baseLifespanDays,
      lifespan.maximumLifespanDays,
    ].join(':')
    let profile = this.state.profiles.find((item) => item.profileId === profileId)
    if (!profile) {
      profile = {
        profileId,
        entityId: lifespan.entityId,
        clockMode: lifespan.clockMode,
        stages: buildStages(lifespan.clockMode, lifespan.baseLifespanDays, lifespan.maximumLifespanDays),
        source: lifespan.source === 'confirmed-event' ? 'confirmed-event' : 'lifespan-rule',
        sourceEventIds: [...lifespan.sourceEventIds],
        updatedAtTotalDays: context.totalDays,
      }
      this.state.profiles.push(profile)
    }

    const entityIndex = this.state.entities.findIndex((item) => item.entityId === context.characterId)
    const existing = entityIndex < 0 ? undefined : this.state.entities[entityIndex]
    const startingAgeDays = existing?.startingAgeDays
      ?? Math.max(0, Math.round(getCharacterBaseSystem().getStartingAge() * 365))
    const ageAnchorTotalDays = existing?.ageAnchorTotalDays
      ?? resolveInitialAgeAnchorTotalDays(context.totalDays)
    const ageDays = lifespan.clockMode === 'external'
      ? startingAgeDays
      : resolveCharacterAgeDays(startingAgeDays / 365, context.totalDays, ageAnchorTotalDays)
    const stageAgeDays = lifespan.clockMode === 'cyclic'
      ? Math.max(0, ageDays - startingAgeDays) % Math.max(4, lifespan.baseLifespanDays)
      : ageDays
    const currentStage = this.selectStage(profile, stageAgeDays)
    const next: EntityLifecycleState = {
      entityId: context.characterId,
      profileId: profile.profileId,
      currentStageId: currentStage.stageId,
      startingAgeDays,
      ageAnchorTotalDays,
      ageDays,
      conditionTags: existing?.conditionTags ?? [],
      attributeModifiers: clone(currentStage.attributeModifiers),
      updatedAtTotalDays: context.totalDays,
    }

    if (
      existing
      && existing.profileId === next.profileId
      && existing.currentStageId !== next.currentStageId
    ) {
      this.state.transitions.push({
        transitionId: `lifecycle-transition:${encodeURIComponent(context.characterId)}:${context.totalDays}:${this.state.transitions.length}`,
        entityId: context.characterId,
        profileId: profile.profileId,
        fromStageId: existing.currentStageId,
        toStageId: next.currentStageId,
        occurredAtTotalDays: context.totalDays,
        reason: '规范年龄跨越阶段边界',
        ...(profile.sourceEventIds.at(-1) ? { historicalEventId: profile.sourceEventIds.at(-1) } : {}),
      })
    }
    if (entityIndex < 0) this.state.entities.push(next)
    else this.state.entities[entityIndex] = next
  }

  private selectStage(profile: LifecycleRuleProfile, ageDays: number): LifecycleStageDefinition {
    return profile.stages.find((item) => (
      ageDays >= item.minAgeDays
      && (item.maxAgeDays === undefined || ageDays < item.maxAgeDays)
    )) ?? profile.stages[profile.stages.length - 1]
  }
}

let runtimeLifecycleSystem: LifecycleSystem | undefined

export function getLifecycleSystem(): LifecycleSystem {
  runtimeLifecycleSystem ??= new LifecycleSystem()
  return runtimeLifecycleSystem
}
