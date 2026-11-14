/**
 * Purpose: Build and validate deterministic destiny-pattern growth choices.
 * Owner: mod-character
 * Responsibility: Stable lineage, strict development-stage choices, and pure resolution only.
 */

import type {
  DestinyPattern,
  DestinyPatternGrowthDirection,
  DestinyPatternGrowthAssessment,
  DestinyPatternGrowthEvidence,
  DestinyPatternGrowthHistoryEntry,
  DestinyPatternGrowthOption,
  DestinyPatternGrowthRoute,
  DestinyPatternAptitudeTier,
  DestinyPatternDevelopmentStage,
  DestinyPatternState,
  PendingDestinyPatternGrowth,
  ReincarnationTalent,
  DestinyPatternGrowthSource,
} from './types'
import { basePointsToCalendarDays } from '@/foundation'
import { DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER } from './constants'

/** 每条天赋的属性净加成与负值绝对总和按资质阶位分别封顶。 */
export const DESTINY_PATTERN_ATTRIBUTE_CAPS: Readonly<Record<DestinyPatternAptitudeTier, number>> = {
  1: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER,
  2: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 2,
  3: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 3,
  4: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 4,
  5: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 5,
  6: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 6,
  7: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 7,
  8: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 8,
  9: DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER * 9,
}

/** 局内命格成长开始进入资格判断的最低年龄。 */
export const DESTINY_PATTERN_GROWTH_MINIMUM_AGE = 16

export function isDestinyPatternGrowthAgeEligible(age: number): boolean {
  return Number.isFinite(age)
    && Math.max(0, Math.floor(age)) >= DESTINY_PATTERN_GROWTH_MINIMUM_AGE
}

const DESTINY_PATTERN_ATTRIBUTE_KEYS = ['mind', 'physique', 'charisma', 'familyBackground', 'luck'] as const

/**
 * 校验一组完整属性加成，不做静默截断。
 * 净分配与负属性绝对值分别受资质阶位上限约束，允许不使用满额点数。
 */
export function validateDestinyPatternAttrBonusForAptitude(
  bonus: Partial<Record<(typeof DESTINY_PATTERN_ATTRIBUTE_KEYS)[number], number>> | undefined,
  aptitudeTier: DestinyPatternAptitudeTier,
): boolean {
  const cap = DESTINY_PATTERN_ATTRIBUTE_CAPS[aptitudeTier]
  if (!Number.isSafeInteger(cap) || !bonus || typeof bonus !== 'object' || Array.isArray(bonus)) return false
  let net = 0
  let negativeTotal = 0
  for (const [key, rawValue] of Object.entries(bonus ?? {})) {
    if (!(DESTINY_PATTERN_ATTRIBUTE_KEYS as readonly string[]).includes(key)) return false
    if (typeof rawValue !== 'number' || !Number.isSafeInteger(rawValue)) return false
    if (rawValue === 0) return false
    net += rawValue
    if (rawValue < 0) negativeTotal += Math.abs(rawValue)
  }
  return net <= cap && negativeTotal <= cap && net >= -cap
}

const APTITUDE_ORDER: readonly DestinyPatternAptitudeTier[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function sourceMatches(
  source: DestinyPatternGrowthSource,
  pending: PendingDestinyPatternGrowth,
): boolean {
  return source.lineageId === pending.lineageId
    && source.id === pending.source.id
    && source.version === pending.source.version
    && source.aptitudeTier === pending.source.aptitudeTier
    && source.developmentStage === pending.source.developmentStage
}

function isReincarnationGrowthSource(
  source: DestinyPatternGrowthSource,
): source is ReincarnationTalent {
  return 'apexStrengthenLevel' in source
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

function mergeEvidenceText(previous: string | undefined, next: string): string {
  const normalized = normalizeText(next)
  if (!previous) return normalized
  if (!normalized || previous.includes(normalized)) return previous
  return `${previous}；${normalized}`
}

function hashIdentity(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function createDestinyPatternLineageId(seed?: string): string {
  const normalizedSeed = seed?.trim()
  if (normalizedSeed) return `destiny-lineage-${hashIdentity(normalizedSeed)}`
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `destiny-lineage-${randomId}`
}

export function withInitialDestinyPatternGrowthIdentity(
  pattern: Omit<DestinyPattern, 'lineageId' | 'version'>,
  seed?: string,
): DestinyPattern {
  return {
    ...pattern,
    lineageId: createDestinyPatternLineageId(seed),
    version: 1,
  }
}

export function getNextDestinyPatternAptitudeTier(
  aptitudeTier: DestinyPatternAptitudeTier,
): DestinyPatternAptitudeTier | null {
  const index = APTITUDE_ORDER.indexOf(aptitudeTier)
  return index >= 0 && index < APTITUDE_ORDER.length - 1
    ? APTITUDE_ORDER[index + 1]!
    : null
}

export function getNextDestinyPatternDevelopmentStage(
  developmentStage: DestinyPatternDevelopmentStage,
): DestinyPatternDevelopmentStage | null {
  if (developmentStage === 'awakening') return 'mastery'
  if (developmentStage === 'mastery') return 'complete'
  return null
}

function normalizeDirection(
  direction: DestinyPatternGrowthDirection,
  index: number,
  aptitudeTier: DestinyPatternAptitudeTier,
): DestinyPatternGrowthDirection {
  const route = direction.route
  const name = normalizeText(direction.name)
  const description = normalizeText(direction.description)
  const effect = normalizeText(direction.effect)
  if (!['深度强化', '广度强化', '转变强化'].includes(route)) {
    throw new Error(`天赋成长方向 ${index + 1} 路线无效`)
  }
  if (Array.from(name).length < 2 || Array.from(name).length > 6 || !description || !effect) {
    throw new Error(`天赋成长方向 ${index + 1} 缺少合规名称、详细介绍或效果描述`)
  }
  const attrBonus = { ...direction.attrBonus }
  if (!validateDestinyPatternAttrBonusForAptitude(attrBonus, aptitudeTier)) {
    throw new Error(`天赋成长方向 ${index + 1} 的属性加成超过资质${aptitudeTier}阶边界或包含无效值`)
  }
  return { route, name, description, effect, attrBonus }
}

export function createPendingDestinyPatternGrowth(input: {
  narrativeId: string
  roundSequence: number
  source: DestinyPatternGrowthSource
  directions: readonly DestinyPatternGrowthDirection[]
}): PendingDestinyPatternGrowth {
  const narrativeId = input.narrativeId.trim()
  if (!narrativeId) throw new Error('天赋成长缺少对应故事编号')
  if (!Number.isSafeInteger(input.roundSequence) || input.roundSequence < 1) {
    throw new Error('天赋成长回合编号无效')
  }
  if (!input.source.lineageId.trim() || !Number.isSafeInteger(input.source.version) || input.source.version < 1) {
    throw new Error('天赋成长来源缺少稳定血脉身份或版本')
  }
  const targetDevelopmentStage = getNextDestinyPatternDevelopmentStage(input.source.developmentStage)
  if (!targetDevelopmentStage) throw new Error('该天赋已圆满，不能继续局内成长')
  if (input.directions.length !== 3) throw new Error('天赋成长必须提供深度强化、广度强化、转变强化三个下一阶方向')

  const directions = input.directions.map((direction, index) => normalizeDirection(
    direction,
    index,
    input.source.aptitudeTier,
  )) as [
    DestinyPatternGrowthDirection,
    DestinyPatternGrowthDirection,
    DestinyPatternGrowthDirection,
  ]
  const routes: readonly DestinyPatternGrowthRoute[] = ['深度强化', '广度强化', '转变强化']
  if (directions.some((direction, index) => direction.route !== routes[index])) {
    throw new Error('天赋成长路线必须按深度强化、广度强化、转变强化固定顺序返回')
  }
  const names = directions.map((direction) => normalizeText(direction.name).toLocaleLowerCase())
  if (new Set(names).size !== names.length) {
    throw new Error('天赋成长的三条路线不能同名')
  }
  const nextVersion = input.source.version + 1
  const choiceId = `destiny-growth:${narrativeId}:${input.source.lineageId}:v${nextVersion}`
  const options = directions.map((direction, index): DestinyPatternGrowthOption => ({
    optionId: `${choiceId}:option-${index + 1}`,
    route: direction.route,
    pattern: {
      ...input.source,
      id: `${input.source.lineageId}:v${nextVersion}:option-${index + 1}`,
      version: nextVersion,
      developmentStage: targetDevelopmentStage,
      name: direction.name,
      description: direction.description,
      effect: direction.effect,
      attrBonus: { ...direction.attrBonus },
    } as DestinyPatternGrowthSource,
  })) as [DestinyPatternGrowthOption, DestinyPatternGrowthOption, DestinyPatternGrowthOption]

  return {
    choiceId,
    narrativeId,
    roundSequence: input.roundSequence,
    lineageId: input.source.lineageId,
    source: structuredClone(input.source),
    options,
  }
}

export function resolvePendingDestinyPatternGrowth(
  pending: PendingDestinyPatternGrowth,
  optionId: string,
  committedAt = Date.now(),
  totalBasePoints = 0,
): DestinyPatternGrowthHistoryEntry {
  const selected = pending.options.find((option) => option.optionId === optionId)
  if (!selected) throw new Error('天赋成长方向无效或已经失效')
  if (selected.pattern.lineageId !== pending.lineageId) {
    throw new Error('天赋成长方向与来源血脉不一致')
  }
  if (selected.pattern.version !== pending.source.version + 1) {
    throw new Error('天赋成长方向版本不连续')
  }
  if (selected.pattern.aptitudeTier !== pending.source.aptitudeTier) {
    throw new Error('天赋成长方向改变了固定资质阶位')
  }
  if (selected.pattern.developmentStage !== getNextDestinyPatternDevelopmentStage(pending.source.developmentStage)) {
    throw new Error('天赋成长方向没有推进到下一开发阶段')
  }
  return {
    choiceId: pending.choiceId,
    narrativeId: pending.narrativeId,
    roundSequence: pending.roundSequence,
    lineageId: pending.lineageId,
    selectedOptionId: selected.optionId,
    source: structuredClone(pending.source),
    result: structuredClone(selected.pattern),
    committedAt,
    totalBasePoints: Math.max(0, Math.floor(totalBasePoints)),
    totalDays: basePointsToCalendarDays(totalBasePoints),
  }
}

function recountAptitude(
  patterns: readonly DestinyPattern[],
): DestinyPatternState['aptitudeCount'] {
  const aptitudeCount: DestinyPatternState['aptitudeCount'] = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  }
  for (const pattern of patterns) aptitudeCount[pattern.aptitudeTier] += 1
  return aptitudeCount
}

export function registerPendingDestinyPatternGrowthInState(
  state: DestinyPatternState,
  pending: PendingDestinyPatternGrowth,
  currentAge: number,
  reincarnationTalents: readonly ReincarnationTalent[] = [],
): DestinyPatternState {
  if (!isDestinyPatternGrowthAgeEligible(currentAge)) {
    throw new Error(`角色未满 ${DESTINY_PATTERN_GROWTH_MINIMUM_AGE} 岁，不能登记天赋成长`)
  }
  if (state.pendingGrowth) throw new Error('已有天赋成长等待选择')
  const source = isReincarnationGrowthSource(pending.source)
    ? reincarnationTalents.find((talent) => sourceMatches(talent, pending))
    : state.patterns.find((pattern) => sourceMatches(pattern, pending))
  if (!source) {
    throw new Error('天赋成长来源已不属于当前角色或版本已经变化')
  }
  return {
    ...state,
    pendingGrowth: structuredClone(pending),
  }
}

export function resolvePendingDestinyPatternGrowthInState(
  state: DestinyPatternState,
  optionId: string,
  committedAt = Date.now(),
  totalBasePoints = 0,
  reincarnationTalents: readonly ReincarnationTalent[] = [],
): {
  state: DestinyPatternState
  historyEntry: DestinyPatternGrowthHistoryEntry
  reincarnationTalents?: ReincarnationTalent[]
} {
  const pending = state.pendingGrowth
  if (!pending) throw new Error('当前没有等待选择的天赋成长')
  const historyEntry = resolvePendingDestinyPatternGrowth(pending, optionId, committedAt, totalBasePoints)
  const sourceIsReincarnation = isReincarnationGrowthSource(pending.source)
  const sourceIndex = sourceIsReincarnation
    ? -1
    : state.patterns.findIndex((pattern) => sourceMatches(pattern, pending))
  const reincarnationIndex = sourceIsReincarnation
    ? reincarnationTalents.findIndex((talent) => sourceMatches(talent, pending))
    : -1
  if (sourceIndex < 0 && reincarnationIndex < 0) {
    throw new Error('天赋成长来源已不属于当前角色或版本已经变化')
  }
  const patterns = sourceIndex >= 0
    ? state.patterns.map((pattern, index) => (
        index === sourceIndex ? structuredClone(historyEntry.result as DestinyPattern) : pattern
      ))
    : state.patterns
  const nextReincarnationTalents = reincarnationIndex >= 0
    ? reincarnationTalents.map((talent, index) => (
        index === reincarnationIndex
          ? structuredClone(historyEntry.result as ReincarnationTalent)
          : talent
      ))
    : undefined
  return {
    state: {
      ...state,
      patterns,
      aptitudeCount: recountAptitude(patterns),
      pendingGrowth: null,
      growthHistory: [...state.growthHistory, historyEntry],
    },
    historyEntry,
    ...(nextReincarnationTalents ? { reincarnationTalents: nextReincarnationTalents } : {}),
  }
}

export function recordDestinyPatternGrowthEvidenceInState(
  state: DestinyPatternState,
  evidence: readonly DestinyPatternGrowthEvidence[],
  reincarnationTalents: readonly ReincarnationTalent[] = [],
): DestinyPatternState {
  if (evidence.length === 0) return state
  const patterns = new Set([
    ...state.patterns.map((pattern) => pattern.lineageId),
    ...reincarnationTalents.map((talent) => talent.lineageId),
  ])
  const merged = new Map<string, DestinyPatternGrowthEvidence>(
    state.growthEvidence.map((entry) => [`${entry.lineageId}:${entry.sourceRound}`, structuredClone(entry)] as const),
  )
  for (const item of evidence) {
    if (
      !patterns.has(item.lineageId)
      || !Number.isSafeInteger(item.sourceRound)
      || item.sourceRound < 1
      || !item.result.trim()
    ) continue
    const key = `${item.lineageId}:${item.sourceRound}`
    const previous = merged.get(key)
    const usage = item.usage?.trim()
      ? mergeEvidenceText(previous?.usage, item.usage)
      : previous?.usage
    merged.set(key, {
      lineageId: item.lineageId,
      sourceRound: item.sourceRound,
      ...(usage ? { usage } : {}),
      result: mergeEvidenceText(previous?.result, item.result),
      ...(previous?.breakthrough || !item.breakthrough?.trim()
        ? (previous?.breakthrough ? { breakthrough: previous.breakthrough } : {})
        : { breakthrough: item.breakthrough.trim() }),
    })
  }
  return {
    ...state,
    growthEvidence: [...merged.values()].sort((left, right) => (
      left.sourceRound - right.sourceRound || left.lineageId.localeCompare(right.lineageId)
    )),
  }
}

export function recordDestinyPatternGrowthAssessmentsInState(
  state: DestinyPatternState,
  assessments: readonly DestinyPatternGrowthAssessment[],
): DestinyPatternState {
  if (assessments.length === 0) return state
  const latest = new Map(
    state.growthAssessments.map((entry) => [entry.lineageId, structuredClone(entry)] as const),
  )
  for (const item of assessments) {
    if (
      !item.lineageId.trim()
      || !Number.isSafeInteger(item.evaluatedThroughRound)
      || item.evaluatedThroughRound < 1
    ) continue
    const previous = latest.get(item.lineageId)
    if (previous && previous.evaluatedThroughRound > item.evaluatedThroughRound) continue
    latest.set(item.lineageId, {
      lineageId: item.lineageId,
      evaluatedThroughRound: item.evaluatedThroughRound,
      ...(item.evaluatedBreakthroughRound !== undefined
        ? { evaluatedBreakthroughRound: item.evaluatedBreakthroughRound }
        : previous?.evaluatedBreakthroughRound !== undefined
          ? { evaluatedBreakthroughRound: previous.evaluatedBreakthroughRound }
          : {}),
    })
  }
  return {
    ...state,
    growthAssessments: [...latest.values()],
  }
}
