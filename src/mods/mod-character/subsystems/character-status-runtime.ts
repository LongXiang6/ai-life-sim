/**
 * Purpose: Build, normalize, advance, and guide the compact character narrative status.
 * Owner: mod-character / character-base
 * Responsibility: Deterministic status calculations only; AI transport and historical commits stay outside.
 */

import {
  CHARACTER_DAYS_PER_YEAR,
  resolveCharacterAgeDays,
  resolveInitialAgeAnchorTotalDays,
  type CharacterConditionState,
  type CharacterFortuneLevel,
  type CharacterLifeStageDefinition,
  type CharacterMoralityLevel,
  type CharacterNarrativeStatus,
} from '@/foundation'
import type { LifespanDraftState } from '../types'
import {
  DEFAULT_MAX_VITALITY,
  DEFAULT_SPIRIT,
  DEFAULT_STAMINA,
  DEFAULT_VITALITY,
} from '../constants'

const DEFAULT_LIFE_STAGES: CharacterLifeStageDefinition[] = [
  { stageId: 'life-stage-1', displayName: '幼儿期', description: '依赖照料并快速认识世界', minAgeDays: 0, maxAgeDays: 6 * CHARACTER_DAYS_PER_YEAR, guidance: '按幼儿的认知、体能和依赖关系推进剧情' },
  { stageId: 'life-stage-2', displayName: '成长期', description: '学习、探索并形成稳定性格', minAgeDays: 6 * CHARACTER_DAYS_PER_YEAR, maxAgeDays: 18 * CHARACTER_DAYS_PER_YEAR, guidance: '按成长中的能力、身份和社会关系推进剧情' },
  { stageId: 'life-stage-3', displayName: '成年期', description: '拥有较完整的自主行动能力', minAgeDays: 18 * CHARACTER_DAYS_PER_YEAR, maxAgeDays: 60 * CHARACTER_DAYS_PER_YEAR, guidance: '按成年角色的能力、责任与长期选择推进剧情' },
  { stageId: 'life-stage-4', displayName: '晚年期', description: '经验深厚且生命风险逐渐升高', minAgeDays: 60 * CHARACTER_DAYS_PER_YEAR, guidance: '体现阅历、身体变化与人生收束可能性，但不强制触发结局' },
]

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function fortuneLevel(value: number): CharacterFortuneLevel {
  if (value <= -60) return 'very-unlucky'
  if (value <= -20) return 'unlucky'
  if (value < 20) return 'ordinary'
  if (value < 60) return 'lucky'
  return 'very-lucky'
}

function fortuneGuidance(level: CharacterFortuneLevel): string {
  const guidance: Record<CharacterFortuneLevel, string> = {
    'very-unlucky': '角色当前非常容易遭遇不利巧合，坏情况有很高概率出现',
    unlucky: '角色当前偏向倒霉，事件更容易出现不利分支',
    ordinary: '角色当前气运普通，事件按既有因果自然发展',
    lucky: '角色当前较为走运，合理机会更容易出现',
    'very-lucky': '角色当前气运极佳，重大机会有较高概率以合理方式出现',
  }
  return guidance[level]
}

function moralityLevel(value: number): CharacterMoralityLevel {
  if (value >= 80) return 'supremeGood'
  if (value >= 50) return 'greatGood'
  if (value >= 20) return 'good'
  if (value > -20) return 'balanced'
  if (value > -50) return 'evilLeaning'
  if (value > -80) return 'greatEvil'
  return 'supremeEvil'
}

function moralityGuidance(level: CharacterMoralityLevel): string {
  const guidance: Record<CharacterMoralityLevel, string> = {
    supremeGood: '角色道德立场极其坚定，通常会主动保护他人并承担代价',
    greatGood: '角色行事明显偏善，通常重视承诺、公平与他人处境',
    good: '角色整体偏善，但仍会结合现实利益作出选择',
    balanced: '角色道德倾向中性，行为主要由处境、关系与目标决定',
    evilLeaning: '角色行事偏狠辣自利，更愿意牺牲他人利益达成目标',
    greatEvil: '角色道德水平很低，常以控制、伤害或背叛解决问题',
    supremeEvil: '角色几乎不受道德约束，行为会优先追求自身意志与结果',
  }
  return guidance[level]
}

function mapStageBoundary(days: number, targetMax: number, referenceMax: number): number {
  const anchor = Math.min(18 * CHARACTER_DAYS_PER_YEAR, targetMax, referenceMax)
  if (days <= anchor || referenceMax <= anchor || targetMax <= anchor) return Math.min(days, targetMax)
  return Math.round(anchor + ((days - anchor) * (targetMax - anchor)) / (referenceMax - anchor))
}

export function scaleLifeStages(
  template: readonly CharacterLifeStageDefinition[] | undefined,
  maximumLifespanDays: number,
): CharacterLifeStageDefinition[] {
  const source = [...(template?.length ? template : DEFAULT_LIFE_STAGES)]
    .sort((left, right) => left.minAgeDays - right.minAgeDays)
  const terminal = source[source.length - 1]!
  const finiteMax = Math.max(
    ...source.flatMap((stage) => stage.maxAgeDays === undefined ? [] : [stage.maxAgeDays]),
    terminal.minAgeDays + 10 * CHARACTER_DAYS_PER_YEAR,
  )
  const mapped = source.map((stage) => ({
    ...structuredClone(stage),
    minAgeDays: mapStageBoundary(stage.minAgeDays, maximumLifespanDays, finiteMax),
    maxAgeDays: stage.maxAgeDays === undefined
      ? undefined
      : mapStageBoundary(stage.maxAgeDays, maximumLifespanDays, finiteMax),
  }))
  const normalized: CharacterLifeStageDefinition[] = []
  for (const stage of mapped) {
    const previous = normalized[normalized.length - 1]
    const minAgeDays = previous ? Math.max(previous.minAgeDays + 1, stage.minAgeDays) : 0
    if (minAgeDays >= maximumLifespanDays && normalized.length > 0) continue
    if (previous) previous.maxAgeDays = minAgeDays
    normalized.push({ ...stage, minAgeDays, maxAgeDays: undefined })
  }
  return normalized
}

export function findCurrentLifeStage(status: CharacterNarrativeStatus): CharacterLifeStageDefinition | undefined {
  return [...status.lifeStages].reverse().find((stage) => status.ageDays >= stage.minAgeDays)
}

function endRisk(status: CharacterNarrativeStatus): number {
  if (status.clockMode !== 'aging') return 0
  const riskStart = Math.round(status.maximumLifespanDays * 0.8)
  if (status.ageDays <= riskStart) return 0
  const span = Math.max(1, status.maximumLifespanDays - riskStart)
  return clampInteger(((status.ageDays - riskStart) / span) * 100, 0, 100)
}

export function refreshCharacterGuidance(status: CharacterNarrativeStatus): CharacterNarrativeStatus {
  const stage = findCurrentLifeStage(status)
  const activeConditions = status.health.conditions.filter((condition) => condition.status !== 'resolved')
  const healthGuidance = status.health.alive
    ? activeConditions.length > 0
      ? `角色当前存在健康问题：${activeConditions.map((item) => `${item.name}（严重度${item.severity}）`).join('、')}`
      : `角色当前生命状态 ${status.health.vitality}/${status.health.maxVitality}，体力 ${status.health.stamina}，精神 ${status.health.spirit}`
    : `角色已经死亡：${status.health.death?.causeLabel ?? '等待历史事实确认'}`
  const riskGuidance = status.endRisk > 0
    ? `角色已接近叙事寿命上限，终局风险为 ${status.endRisk}%；可以合理触发衰老、告别或人生结局，但不因到龄自动死亡`
    : undefined
  return {
    ...status,
    currentStageId: stage?.stageId,
    guidance: [stage?.guidance, healthGuidance, status.fortune.guidance, status.morality.guidance, riskGuidance]
      .filter((item): item is string => Boolean(item)),
  }
}

export function createCharacterNarrativeStatus(input: {
  entityId?: string
  startingAgeYears: number
  totalDays: number
  lifespanDraft: LifespanDraftState
  lifeStageTemplate?: CharacterLifeStageDefinition[]
}): CharacterNarrativeStatus {
  const maximumLifespanDays = Math.max(1, Math.round(input.lifespanDraft.maximumLifespanYears * CHARACTER_DAYS_PER_YEAR))
  const fortune = { value: 0, level: 'ordinary' as const, guidance: fortuneGuidance('ordinary') }
  const morality = { value: 0, level: 'balanced' as const, roundDelta: 0, guidance: moralityGuidance('balanced') }
  const status: CharacterNarrativeStatus = {
    ...(input.entityId ? { entityId: input.entityId } : {}),
    raceId: input.lifespanDraft.raceId,
    raceName: input.lifespanDraft.race.name,
    clockMode: input.lifespanDraft.race.clockMode,
    ageAnchorTotalDays: resolveInitialAgeAnchorTotalDays(input.totalDays),
    ageDays: Math.max(0, Math.round(input.startingAgeYears * CHARACTER_DAYS_PER_YEAR)),
    maximumLifespanDays,
    lifeStages: scaleLifeStages(input.lifeStageTemplate, maximumLifespanDays),
    endRisk: 0,
    health: {
      vitality: DEFAULT_VITALITY,
      maxVitality: DEFAULT_MAX_VITALITY,
      stamina: DEFAULT_STAMINA,
      spirit: DEFAULT_SPIRIT,
      alive: true,
      conditions: [],
      updatedAtTotalDays: input.totalDays,
    },
    fortune,
    morality,
    guidance: [],
    lastAnalyzedAtTotalDays: input.totalDays,
  }
  status.endRisk = endRisk(status)
  return refreshCharacterGuidance(status)
}

export function advanceCharacterNarrativeStatus(
  status: CharacterNarrativeStatus,
  startingAgeYears: number,
  totalDays: number,
): CharacterNarrativeStatus {
  const next = structuredClone(status)
  next.ageDays = resolveCharacterAgeDays(startingAgeYears, totalDays, next.ageAnchorTotalDays)
  next.endRisk = endRisk(next)
  next.morality.roundDelta = 0
  return refreshCharacterGuidance(next)
}

export function updateFortune(status: CharacterNarrativeStatus, delta: number): void {
  status.fortune.value = clampInteger(status.fortune.value + delta, -100, 100)
  status.fortune.level = fortuneLevel(status.fortune.value)
  status.fortune.guidance = fortuneGuidance(status.fortune.level)
}

export function updateMorality(status: CharacterNarrativeStatus, delta: number): void {
  const rounded = clampInteger(delta, -20, 20)
  status.morality.value = clampInteger(status.morality.value + rounded, -100, 100)
  status.morality.roundDelta += rounded
  status.morality.level = moralityLevel(status.morality.value)
  status.morality.guidance = moralityGuidance(status.morality.level)
}

export function upsertCondition(
  status: CharacterNarrativeStatus,
  condition: CharacterConditionState,
): void {
  const index = status.health.conditions.findIndex((item) => item.conditionId === condition.conditionId)
  if (index >= 0) status.health.conditions[index] = structuredClone(condition)
  else status.health.conditions.push(structuredClone(condition))
}
