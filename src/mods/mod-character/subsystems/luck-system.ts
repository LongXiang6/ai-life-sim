import { BaseSubsystem } from '@/core'
import type {
  LuckNarrativeDirection,
  LuckNarrativeGuidance,
  LuckModifiers,
  LuckPersistenceState,
  LuckState,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import {
  BASE_BAD_LUCK_DIRECTION_PERCENT,
  BASE_GOOD_LUCK_DIRECTION_PERCENT,
  BASE_NEUTRAL_LUCK_DIRECTION_PERCENT,
  INITIAL_LUCK_MAX,
  INITIAL_LUCK_MIN,
  LUCK_DIRECTION_PERCENT_PER_POINT,
  LUCK_DISEASE_AVOIDANCE_PER_POINT,
  LUCK_DEATH_AVOID_CHANCE_PER_POINT,
  LUCK_EVENT_WEIGHT_PER_POINT,
  MAX_LUCK,
  MIN_LUCK,
} from '../constants'
import { getFormulaModifier } from '@/mods/mod-world'

export interface LuckDirectionProbabilities {
  badProbabilityPercent: number
  neutralProbabilityPercent: number
  goodProbabilityPercent: number
}

function clampLuck(value: number): number {
  return Math.max(MIN_LUCK, Math.min(MAX_LUCK, Math.round(value)))
}

function normalizeRandomUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(0.999999999, value))
}

/** 本地随机源；不读取 AI、Prompt 或任何玩家可写 Store。 */
function localRandomUnit(): number {
  const cryptoSource = globalThis.crypto
  if (cryptoSource?.getRandomValues) {
    const bucket = new Uint32Array(1)
    cryptoSource.getRandomValues(bucket)
    return bucket[0] / 0x1_0000_0000
  }
  return Math.random()
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2))
}

function rollPercentFromUnit(randomUnit: number): number {
  return Math.floor(normalizeRandomUnit(randomUnit) * 10000) / 100
}

export function rollInitialLuck(randomUnit = localRandomUnit()): number {
  const range = INITIAL_LUCK_MAX - INITIAL_LUCK_MIN + 1
  return INITIAL_LUCK_MIN + Math.floor(normalizeRandomUnit(randomUnit) * range)
}

/**
 * 将气运映射到坏/无干扰/好三个区间。
 * 零气运为 25/50/25；每点从中性区和相反方向各转移 2.5 个百分点，
 * 因而 +10 为 0/25/75，-10 为 75/25/0。
 */
export function resolveLuckDirectionProbabilities(luck: number): LuckDirectionProbabilities {
  const value = clampLuck(luck)
  const directionBias = Math.abs(value) * LUCK_DIRECTION_PERCENT_PER_POINT
  const oppositeShift = directionBias / 2
  if (value >= 0) {
    return {
      badProbabilityPercent: roundPercent(BASE_BAD_LUCK_DIRECTION_PERCENT - oppositeShift),
      neutralProbabilityPercent: roundPercent(BASE_NEUTRAL_LUCK_DIRECTION_PERCENT - oppositeShift),
      goodProbabilityPercent: roundPercent(BASE_GOOD_LUCK_DIRECTION_PERCENT + directionBias),
    }
  }
  return {
    badProbabilityPercent: roundPercent(BASE_BAD_LUCK_DIRECTION_PERCENT + directionBias),
    neutralProbabilityPercent: roundPercent(BASE_NEUTRAL_LUCK_DIRECTION_PERCENT - oppositeShift),
    goodProbabilityPercent: roundPercent(BASE_GOOD_LUCK_DIRECTION_PERCENT - oppositeShift),
  }
}

export function classifyLuckDirection(
  luck: number,
  rollPercent: number,
): LuckNarrativeDirection {
  const probabilities = resolveLuckDirectionProbabilities(luck)
  const roll = Math.max(0, Math.min(99.999999, Number.isFinite(rollPercent) ? rollPercent : 0))
  if (roll < probabilities.badProbabilityPercent) return 'bad'
  if (roll < probabilities.badProbabilityPercent + probabilities.neutralProbabilityPercent) return 'neutral'
  return 'good'
}

export function createLuckNarrativeGuidance(
  luck: number,
  generatedAtRound: number,
  generatedAtTotalDays: number,
  randomUnit = localRandomUnit(),
): LuckNarrativeGuidance {
  const normalizedLuck = clampLuck(luck)
  const probabilities = resolveLuckDirectionProbabilities(normalizedLuck)
  const roll = rollPercentFromUnit(randomUnit)
  return {
    direction: classifyLuckDirection(normalizedLuck, roll),
    roll,
    ...probabilities,
    luck: normalizedLuck,
    generatedAtRound,
    generatedAtTotalDays,
  }
}

function buildModifiers(luck: number): LuckModifiers {
  const value = clampLuck(luck)
  const factor = getFormulaModifier('luckPointModifier', 1)
  return {
    diseaseAvoidance: Number((value * LUCK_DISEASE_AVOIDANCE_PER_POINT * factor).toFixed(4)),
    deathAvoidChance: Number((value * LUCK_DEATH_AVOID_CHANCE_PER_POINT * factor).toFixed(4)),
    eventWeightBias: Number((value * LUCK_EVENT_WEIGHT_PER_POINT * factor).toFixed(4)),
  }
}

function createState(context: RoundContext): LuckState {
  const luck = rollInitialLuck()
  return {
    contextId: context.contextId,
    luck,
    modifiers: buildModifiers(luck),
    luckNotificationRounds: 0,
    luckNotificationText: '',
    narrativeGuidance: null,
  }
}

function isSameGuidanceRound(guidance: LuckNarrativeGuidance, context: RoundContext): boolean {
  return guidance.generatedAtRound === (context.roundSequence ?? 0)
    && guidance.generatedAtTotalDays === context.totalDays
}

function validateGuidance(
  guidance: LuckNarrativeGuidance,
  state: LuckState,
  context: RoundContext,
): void {
  if (!isSameGuidanceRound(guidance, context)) {
    throw new Error('气运引导与当前回合时间线不一致')
  }
  if (guidance.luck !== state.luck) {
    throw new Error('气运引导与当前气运点数不一致')
  }
  if (!Number.isFinite(guidance.roll) || guidance.roll < 0 || guidance.roll >= 100) {
    throw new Error('气运引导随机刻度无效')
  }
  const expected = resolveLuckDirectionProbabilities(state.luck)
  if (
    guidance.badProbabilityPercent !== expected.badProbabilityPercent
    || guidance.neutralProbabilityPercent !== expected.neutralProbabilityPercent
    || guidance.goodProbabilityPercent !== expected.goodProbabilityPercent
    || classifyLuckDirection(state.luck, guidance.roll) !== guidance.direction
  ) {
    throw new Error('气运引导区间数据无效')
  }
}

export class LuckSystem extends BaseSubsystem {
  readonly id = 'luck' as const
  readonly mod = 'mod-character' as const
  readonly label = '气运' as const
  readonly description = '按角色所在上下文保存本地气运点数与叙事方向引导，不读取超凡插件 Store' as const
  private states: Record<string, LuckState> = {}

  private ensure(context: RoundContext): LuckState {
    return this.states[context.contextId] ??= createState(context)
  }

  advance(context: RoundContext): void {
    const state = this.ensure(context)
    state.modifiers = buildModifiers(state.luck)
    state.luckNotificationRounds = Math.max(0, state.luckNotificationRounds - 1)
  }

  collectState(context: RoundContext): SubSystemState {
    const state = this.ensure(context)
    return {
      id: this.id,
      summary: `【气运】${state.luck}（${MIN_LUCK}~${MAX_LUCK}）`,
      data: { ...structuredClone(state), contextId: context.contextId },
    }
  }

  /** 在第一次叙事调用前本地只投掷一次；预生成可传入已缓存的同一结果。 */
  prepareNarrativeGuidance(
    context: RoundContext,
    prefetched?: LuckNarrativeGuidance,
  ): LuckNarrativeGuidance {
    const state = this.ensure(context)
    if (prefetched) {
      validateGuidance(prefetched, state, context)
      state.narrativeGuidance = structuredClone(prefetched)
      return structuredClone(prefetched)
    }
    if (state.narrativeGuidance && isSameGuidanceRound(state.narrativeGuidance, context)) {
      return structuredClone(state.narrativeGuidance)
    }
    const guidance = createLuckNarrativeGuidance(
      state.luck,
      context.roundSequence ?? 0,
      context.totalDays,
    )
    state.narrativeGuidance = guidance
    return structuredClone(guidance)
  }

  getNarrativeGuidance(contextId: string): LuckNarrativeGuidance | null {
    const guidance = this.states[contextId]?.narrativeGuidance
    return guidance ? structuredClone(guidance) : null
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    throw new Error(`[${changes.id}] 气运由本地随机系统维护，叙事系统不得直接写入`)
  }

  getModifiers(contextId?: string): LuckModifiers {
    return structuredClone(
      this.states[contextId ?? Object.keys(this.states)[0]]?.modifiers ?? buildModifiers(0),
    )
  }

  formatForPrompt(context?: RoundContext): string {
    const state = this.states[context?.contextId ?? Object.keys(this.states)[0]]
    return state
      ? `气运状态：${state.luck}；疾病回避 ${Math.round(state.modifiers.diseaseAvoidance * 100)}%`
      : '气运状态：普通'
  }

  capturePersistenceState(): LuckPersistenceState {
    return { schemaVersion: 1, contexts: structuredClone(this.states) }
  }

  restorePersistenceState(snapshot: unknown): void {
    if (snapshot === undefined) {
      this.states = {}
      return
    }
    const value = snapshot as LuckPersistenceState
    if (value.schemaVersion !== 1 || !value.contexts || typeof value.contexts !== 'object') {
      throw new Error('气运持久化快照无效')
    }
    this.states = structuredClone(value.contexts)
  }

  reset(): void {
    this.states = {}
  }
}

let runtimeLuckSystem: LuckSystem | undefined
export function getLuckSystem(): LuckSystem {
  return runtimeLuckSystem ??= new LuckSystem()
}
