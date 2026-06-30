/**
 * @module health-system.ts
 * @description 健康子系统
 * @mod mod-character
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'

import { DIFFICULTY_MULTIPLIERS_HEALTH } from '@/foundation'
// 统一使用 shared/ 的 clamp 替代内联 Math.max/Math.min
import { clamp } from '@/core/shared'

import { getFormulaModifier } from '@/mods/mod-world'

import type { Disease, Injury, HealthState } from '../types'

import {
  DEFAULT_MAX_HP,
  DEFAULT_STAMINA,
  DEFAULT_SPIRIT,
  SPIRIT_BALANCE_POINT,
  SPIRIT_DRIFT_RATE_BASE,
  SPIRIT_CHARISMA_BONUS,
  STAMINA_PHYSIQUE_MULTIPLIER,
  HP_RECOVERY_PHYSIQUE_MULT,
  HP_RECOVERY_PHYSIQUE_MULT_SAFE,
  HP_LOW_PENALTY_THRESHOLD_1,
  HP_LOW_PENALTY_THRESHOLD_2,
  HP_LOW_PENALTY_MULT_1,
  HP_LOW_PENALTY_MULT_2,
  CRITICAL_HP_MENTAL_DECAY_MULT,
  CRITICAL_HP_MENTAL_THRESHOLD,
  AUTO_INJURY_DAMAGE_MULTIPLIER,
  DEATH_CAUSE_LABELS,
} from '../constants'
import { round, inferDeathCause } from '../utils'

export class HealthSystem implements ISubSystem {
  readonly id = 'health' as const
  readonly mod = 'mod-character' as const
  readonly label = '健康' as const
  readonly description = '管理 HP / 体力 / 精神 + 疾病 / 伤势列表 + 自动恢复 + 死亡检测' as const

  private state: HealthState = {
    hp: DEFAULT_MAX_HP,
    maxHp: DEFAULT_MAX_HP,
    stamina: DEFAULT_STAMINA,
    spirit: DEFAULT_SPIRIT,
    diseases: [],
    injuries: [],
    isDead: false,
  }

  /** 上次推进健康的轮次（防止 collectState 被同一轮多次调用时重复推进） */
  private _lastProcessedRound = -1

  /** 上次死亡时的叙事文本（用于死因推断） */
  private _deathNarrative = ''

  collectState(context: RoundContext): SubSystemState {
    if (this.state.isDead) {
      return {
        id: this.id,
        summary: `【${this.label}】已死亡${this.state.deathCause ? `：${this.state.deathCause}` : ''}`,
        data: structuredClone({
        hp: this.state.hp, maxHp: this.state.maxHp, stamina: this.state.stamina,
        spirit: this.state.spirit, diseases: this.state.diseases,
        injuries: this.state.injuries, isDead: this.state.isDead,
        deathCause: this.state.deathCause,
      }),
      }
    }

    // 每轮自动推进（幂等保护：同轮多次调用不重复推进）
    const currentRound = getRoundSequence(context)
    if (currentRound !== this._lastProcessedRound) {
      this._lastProcessedRound = currentRound
      this.advanceHealth(context)
    }

    const s = this.state
    const parts: string[] = [
      `HP ${s.hp}/${s.maxHp}`,
      `体力 ${s.stamina}/100`,
      `精神 ${s.spirit}/100`,
    ]
    if (s.diseases.length > 0) {
      parts.push(`疾病：${s.diseases.map((d) => `${d.name}(${d.severity}级,${d.remainingRounds}轮)`).join(' ')}`)
    }
    if (s.injuries.length > 0) {
      parts.push(`伤势：${s.injuries.map((i) => `${i.name}(${i.severity}级,${i.remainingRecoveryRounds}轮)`).join(' ')}`)
    }

    return {
      id: this.id,
      summary: `【${this.label}】${parts.join(' | ')}`,
      data: structuredClone({
        hp: s.hp, maxHp: s.maxHp, stamina: s.stamina, spirit: s.spirit,
        diseases: s.diseases, injuries: s.injuries,
        isDead: s.isDead, deathCause: s.deathCause,
        activeEffects: this.collectActiveEffects(),
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return
    const ch = changes.changes

    // 保存叙事文本用于死因推断
    this._deathNarrative = changes.description

    // 检查是否有显式声明
    const hasExplicit =
      typeof ch.hpDelta === 'number' ||
      typeof ch.staminaDelta === 'number' ||
      typeof ch.spiritDelta === 'number' ||
      Array.isArray(ch.addDiseases) ||
      Array.isArray(ch.addInjuries) ||
      Array.isArray(ch.diseases) ||
      Array.isArray(ch.injuries)

    if (hasExplicit) {
      this.applyExplicitChanges(ch)
    } else {
      // P2 降级：AI JSON 未显式声明健康变化时，从 description 中补偿提取
      const extracted = this.parseHealthFromNarrative(changes.description)
      if (extracted) {
        if (typeof extracted.hpDelta === 'number') {
          this.state.hp = round(clamp(this.state.hp + extracted.hpDelta, 0, this.state.maxHp))
          this.checkDeath()
        }
      }
    }
  }

  reset(): void {
    this.state = {
      hp: DEFAULT_MAX_HP, maxHp: DEFAULT_MAX_HP, stamina: DEFAULT_STAMINA,
      spirit: DEFAULT_SPIRIT, diseases: [], injuries: [], isDead: false,
    }
    this._lastProcessedRound = -1
    this._deathNarrative = ''
  }

  /**
   * P2 降级：从叙事文本中补偿提取健康变化
   * 三级关键词匹配，复刻废案 extractHealthChanges
   *
   * 减损检测（14 关键词）：危重 > 重伤 > 轻症
   * 恢复检测（11 关键词）：痊愈 > 好转 > 休养
   */
  parseHealthFromNarrative(narrative: string): { hpDelta?: number } | null {
    // 减损检测
    const criticalDamage = ['身患重病', '命悬一线', '奄奄一息', '绝症']
    const severeDamage = ['重伤', '卧床不起', '骨折', '失血过多', '中毒']
    const minorDamage = ['受伤', '生病', '风寒', '扭伤', '擦伤']

    if (criticalDamage.some((kw) => narrative.includes(kw))) return { hpDelta: -25 }
    if (severeDamage.some((kw) => narrative.includes(kw))) return { hpDelta: -15 }
    if (minorDamage.some((kw) => narrative.includes(kw))) return { hpDelta: -5 }

    // 恢复检测
    const fullRecovery = ['痊愈', '康复出院', '完全恢复', '彻底痊愈']
    const partialRecovery = ['好转', '恢复中', '治疗有效', '逐渐康复']
    const slightRecovery = ['休养', '调理', '养生']

    if (fullRecovery.some((kw) => narrative.includes(kw))) return { hpDelta: 20 }
    if (partialRecovery.some((kw) => narrative.includes(kw))) return { hpDelta: 10 }
    if (slightRecovery.some((kw) => narrative.includes(kw))) return { hpDelta: 3 }

    return null
  }

  // -------- 内部方法 --------

  /** 应用显式声明的健康变化 */
  private applyExplicitChanges(ch: Record<string, unknown>): void {
    // HP 直接变化
    if (typeof ch.hpDelta === 'number') {
      this.state.hp = round(Math.max(0, Math.min(this.state.maxHp, this.state.hp + (ch.hpDelta as number))))
      this.checkDeath()
    }

    // 体力直接变化
    if (typeof ch.staminaDelta === 'number') {
      // 体力变化限制在 [0, 100]
    this.state.stamina = round(clamp(this.state.stamina + (ch.staminaDelta as number), 0, 100))
    }

    // 精神直接变化
    if (typeof ch.spiritDelta === 'number') {
      // 精神值变化限制在 [0, 100]
    this.state.spirit = round(clamp(this.state.spirit + (ch.spiritDelta as number), 0, 100))
    }

    // 添加伤病（对齐废弃项目：添加时自动扣血 severity × 1.5）
    if (Array.isArray(ch.addDiseases)) {
      const diseases = ch.addDiseases as Disease[]
      this.state.diseases.push(...diseases)
      const diseaseDmg = diseases.reduce((sum, d) => sum + d.severity * AUTO_INJURY_DAMAGE_MULTIPLIER, 0)
      if (diseaseDmg > 0) {
        this.state.hp = round(clamp(this.state.hp - diseaseDmg, 0, Infinity))
        this.checkDeath()
      }
    }
    if (Array.isArray(ch.addInjuries)) {
      const injuries = ch.addInjuries as Injury[]
      this.state.injuries.push(...injuries)
      const injuryDmg = injuries.reduce((sum, i) => sum + i.severity * AUTO_INJURY_DAMAGE_MULTIPLIER, 0)
      if (injuryDmg > 0) {
        this.state.hp = round(clamp(this.state.hp - injuryDmg, 0, Infinity))
        this.checkDeath()
      }
    }

    // 直接设置 disease/injury 列表
    if (Array.isArray(ch.diseases)) {
      this.state.diseases = ch.diseases as Disease[]
    }
    if (Array.isArray(ch.injuries)) {
      this.state.injuries = ch.injuries as Injury[]
    }
  }

  /** 每轮自动推进（对齐废弃项目 advanceHealthRound） */
  private advanceHealth(context: RoundContext): void {
    const s = this.state
    if (s.isDead) return

    // 读取体魄
    let physique = 5
    const charBase = context.subsystemStates['character-base']
    if (charBase?.data) {
      const cur = (charBase.data as Record<string, unknown>).current as Record<string, number> | undefined
      if (cur && typeof cur.physique === 'number') {
        physique = cur.physique
      }
    }

    const diffMult = DIFFICULTY_MULTIPLIERS_HEALTH[context.difficulty] ?? 1
    const hpMod = getFormulaModifier('hpRecoveryModifier')
    const staminaMod = getFormulaModifier('staminaRecoveryModifier')

    // 低 HP 惩罚（作用于体力恢复，对齐废弃项目 advanceHealthRound L77-80）
    const healthPenaltyMultiplier =
      s.hp < HP_LOW_PENALTY_THRESHOLD_1 ? HP_LOW_PENALTY_MULT_1
        : s.hp < HP_LOW_PENALTY_THRESHOLD_2 ? HP_LOW_PENALTY_MULT_2
        : 1

    // 体力恢复 = max(1, round(体魄 * 2 * diffMult)) × 低HP惩罚
    const staminaRecovery = round(Math.max(1, physique * STAMINA_PHYSIQUE_MULTIPLIER * diffMult * staminaMod) * healthPenaltyMultiplier)
    s.stamina = round(clamp(s.stamina + staminaRecovery, -Infinity, 100))

    // HP 恢复 = max(physique*0.3, physique*0.8*diffMod)，无低HP惩罚（对齐废弃项目）
    const hpRecovery = round(Math.max(
      round(physique * HP_RECOVERY_PHYSIQUE_MULT * diffMult * hpMod),
      round(physique * HP_RECOVERY_PHYSIQUE_MULT_SAFE * diffMult * hpMod)
    ))
    s.hp = round(Math.min(s.maxHp, s.hp + hpRecovery))

    // 天象跨域效果：异象伤害健康度
    this._applyCelestialHealthEffect(context)

    // 精神漂移
    const charisma = this.getCurrentCharisma(context)
    let driftRate = Math.max(0.5, SPIRIT_DRIFT_RATE_BASE + charisma * SPIRIT_CHARISMA_BONUS)
    // 重伤时精神加速恶化（对齐废弃项目：HP < 15 时精神以 2 倍速率向 0 漂移）
    if (s.hp < CRITICAL_HP_MENTAL_THRESHOLD) {
      driftRate *= CRITICAL_HP_MENTAL_DECAY_MULT
    }
    if (s.spirit > SPIRIT_BALANCE_POINT) {
      s.spirit = round(Math.max(SPIRIT_BALANCE_POINT, s.spirit - driftRate))
    } else if (s.spirit < SPIRIT_BALANCE_POINT) {
      s.spirit = round(Math.min(SPIRIT_BALANCE_POINT, s.spirit + driftRate))
    }

    // 疾病推进
    s.diseases = s.diseases
      .map((d) => ({ ...d, remainingRounds: d.remainingRounds - 1 }))
      .filter((d) => d.remainingRounds > 0)

    // 伤势推进
    s.injuries = s.injuries
      .map((i) => ({ ...i, remainingRecoveryRounds: i.remainingRecoveryRounds - 1 }))
      .filter((i) => i.remainingRecoveryRounds > 0 || i.permanentScar)

    this.checkDeath()
  }

  private getCurrentCharisma(context: RoundContext): number {
    const charBase = context.subsystemStates['character-base']
    if (charBase?.data) {
      const cur = (charBase.data as Record<string, unknown>).current as Record<string, number> | undefined
      if (cur && typeof cur.charisma === 'number') {
        return cur.charisma
      }
    }
    return 0
  }

  private checkDeath(): void {
    if (this.state.hp <= 0 && !this.state.isDead) {
      this.state.isDead = true
      // 优先使用叙事文本推断死因，否则尝试从年龄推断
      if (this._deathNarrative) {
        this.state.deathCause = DEATH_CAUSE_LABELS[
          inferDeathCause(this._deathNarrative, 0, 0, 100)
        ] ?? '寿终正寝'
      } else {
        this.state.deathCause = '生命值归零'
      }
    }
  }

  /** 聚合所有伤病 effect 供外部使用 */
  private collectActiveEffects(): Array<{ name: string; effects: Partial<Record<string, number>> }> {
    const effects: Array<{ name: string; effects: Partial<Record<string, number>> }> = []
    for (const d of this.state.diseases) {
      if (d.attrEffects && Object.keys(d.attrEffects).length > 0) {
        effects.push({ name: d.name, effects: d.attrEffects as Partial<Record<string, number>> })
      }
    }
    for (const i of this.state.injuries) {
      if (i.attrEffects && Object.keys(i.attrEffects).length > 0) {
        effects.push({ name: i.name, effects: i.attrEffects as Partial<Record<string, number>> })
      }
    }
    return effects
  }

  /** 读取天象跨域效果 → 应用于 HP */
  private _applyCelestialHealthEffect(context: RoundContext): void {
    const celestial = context.subsystemStates['celestial']
    if (!celestial?.data) return
    const data = celestial.data as Record<string, unknown>
    const crossEffects = data.crossEffects as Array<{ targetSystem: string; effectType: string; value: number }> | undefined
    if (!crossEffects || !Array.isArray(crossEffects)) return

    for (const effect of crossEffects) {
      if (effect.targetSystem === 'health' && effect.effectType === 'health_damage') {
        this.state.hp = round(clamp(this.state.hp + effect.value, 0, Infinity))
      }
    }
  }
}
