/**
 * @module attribute-decay-system.ts
 * @description 属性衰减子系统
 * @mod mod-character
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { AttributeDecayState } from '../types'

import {
  AGE_DECAY_RATES,
  AGE_GROWTH_RATES,
  DEFAULT_PRIME_AGE_START,
  DEFAULT_PRIME_AGE_END,
  MIND_EXPERIENCE_BONUS,
  DECAY_CLAMP_RANGE,
  BASE_HUMAN_LIFESPAN,
  RACE_LIFESPAN,
} from '../constants'
import { round } from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'

export class AttributeDecaySystem implements ISubSystem {
  readonly id = 'attribute-decay' as const
  readonly mod = 'mod-character' as const
  readonly label = '年龄衰减' as const
  readonly description = '管理四属性（体魄 / 心智 / 悟性 / 魅力）的黄金年龄前后增减' as const

  private state: AttributeDecayState = {
    modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    goldenAgeRange: [DEFAULT_PRIME_AGE_START, DEFAULT_PRIME_AGE_END],
    isDecaying: false,
    stageHint: '幼年',
  }

  /** 上次处理衰减的轮次（防止 collectState 被同一轮多次调用时重复累加） */
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    const age = this.getCharacterAge(context)
    const maxAge = this.getMaxAge(context)
    const [primeStart, primeEnd] = this.computeGoldenAge(context)
    this.state.goldenAgeRange = [primeStart, primeEnd]
    this.state.isDecaying = age > primeEnd
    this.state.stageHint = this.getLifeStageHint(age, maxAge)

    // 仅在新轮次时应用增减（幂等保护）
    const currentRound = getRoundSequence(context)
    if (currentRound !== this._lastProcessedRound) {
      this._lastProcessedRound = currentRound
      this.applyAgeChange(age, primeStart, primeEnd, context)
    }

    const s = this.state
    const direction = s.isDecaying ? '衰减中' : age < primeStart ? '增长中' : '黄金年龄'

    return {
      id: this.id,
      summary: `【${this.label}】黄金年龄 ${primeStart}-${primeEnd} | ${s.stageHint} | 当前：${direction}(${age}岁/${maxAge}岁上限) | 修正：体魄${this.formatMod(s.modifiers.physique)} 心智${this.formatMod(s.modifiers.mind)} 悟性${this.formatMod(s.modifiers.talentAptitude)} 魅力${this.formatMod(s.modifiers.charisma)}`,
      data: structuredClone({
        modifiers: s.modifiers,
        goldenAgeRange: [primeStart, primeEnd],
        isDecaying: s.isDecaying,
        stageHint: s.stageHint,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
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
    const c = changes.changes
    // 衰减系统一般不接收外部变更，自然推进
    void c
  }

  reset(): void {
    this.state = {
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      goldenAgeRange: [DEFAULT_PRIME_AGE_START, DEFAULT_PRIME_AGE_END],
      isDecaying: false,
      stageHint: '幼年',
    }
    this._lastProcessedRound = -1
  }

  // -------- 内部方法 --------

  /** 应用一回合的年龄增减 */
  private applyAgeChange(
    age: number,
    primeStart: number,
    primeEnd: number,
    context: RoundContext,
  ): void {
    const raceId = this.getRaceId(context)
    const rates = this.getEffectiveRates(raceId, age < primeStart)

    const keys = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

    for (const key of keys) {
      const rate = rates[key] ?? 0
      let change = rate

      // 心智经验补偿（对齐废弃项目 +0.05/年，衰减阶段仍生效）
      if (key === 'mind') {
        change += MIND_EXPERIENCE_BONUS
      }

      this.state.modifiers[key] = round(
        Math.max(
          DECAY_CLAMP_RANGE[0],
          Math.min(DECAY_CLAMP_RANGE[1], this.state.modifiers[key] + change)
        )
      )
    }
  }

  /** 计算黄金年龄区间（按 maxAge 比例缩放） */
  private computeGoldenAge(context: RoundContext): [number, number] {
    const maxAge = this.getMaxAge(context)
    const scale = maxAge / 100
    return [
      Math.round(DEFAULT_PRIME_AGE_START * scale),
      Math.round(DEFAULT_PRIME_AGE_END * scale),
    ]
  }

  /** 从 lifespan 子系统获取当前种族的最大寿命 */
  private getMaxAge(context: RoundContext): number {
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data) {
      const race = (lifespan.data as Record<string, unknown>).race as Record<string, unknown> | undefined
      if (race?.baseMaxAge && typeof race.baseMaxAge === 'number') {
        return race.baseMaxAge
      }
    }
    return BASE_HUMAN_LIFESPAN
  }

  /** 8 级寿命阶段提示（对齐废弃项目 getLifeExpectancyHint 比例阈值） */
  private getLifeStageHint(age: number, maxAge: number): string {
    const ratio = maxAge > 0 ? age / maxAge : 0
    const pct = Math.round(ratio * 100)
    if (ratio < 0.1) return `幼年(${pct}%寿命)`
    if (ratio < 0.25) return `少年(${pct}%寿命)`
    if (ratio < 0.4) return `青年(${pct}%寿命)`
    if (ratio < 0.55) return `壮年(${pct}%寿命)`
    if (ratio < 0.7) return `中年(${pct}%寿命)`
    if (ratio < 0.85) return `老年(${pct}%寿命)`
    if (ratio < 0.95) return `暮年(${pct}%寿命)`
    return `垂暮(${pct}%寿命)`
  }

  /** 获取有效衰减 / 增长率（fallback 为 human） */
  private getEffectiveRates(raceId: string, isGrowing: boolean): Record<string, number> {
    if (isGrowing) {
      return AGE_GROWTH_RATES[raceId] ?? AGE_GROWTH_RATES['human'] ?? {}
    }
    // 衰减时应用种族乘数（对齐废弃项目 RACE_LIFESPAN.decayMultiplier）
    const baseRates = AGE_DECAY_RATES[raceId] ?? AGE_DECAY_RATES['human'] ?? {}
    const multiplier = (RACE_LIFESPAN[raceId]?.decayMultiplier ?? 1) * getFormulaModifier('attributeDecayModifier')
    if (multiplier === 1 && getFormulaModifier('attributeDecayModifier') === 1) return baseRates
    const scaled: Record<string, number> = {}
    for (const key of Object.keys(baseRates)) {
      scaled[key] = round(baseRates[key] * multiplier)
    }
    return scaled
  }

  private getRaceId(context: RoundContext): string {
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data) {
      const race = (lifespan.data as Record<string, unknown>).race as Record<string, unknown> | undefined
      if (race?.name && typeof race.name === 'string') {
        // 反向查找 race ID（按 name 匹配 RACE_LIFESPAN）
        for (const [raceId, config] of Object.entries(RACE_LIFESPAN)) {
          if (config.name === race.name) {
            return raceId
          }
        }
      }
    }
    return 'human'
  }

  private getCharacterAge(context: RoundContext): number {
    return context.round.year
  }

  private formatMod(value: number): string {
    if (value === 0) return '0'
    return value > 0 ? `+${value}` : `${value}`
  }
}
