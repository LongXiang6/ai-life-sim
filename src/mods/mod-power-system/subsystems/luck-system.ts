/**
 * @module LuckSystem
 * @description 气运子系统：运气值 → 四项全局修正系数，供 CelestialSystem 等引用
 * @mod mod-power-system
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { LuckState, LuckModifiers } from '../types'

import {
  LUCK_DISEASE_AVOIDANCE_PER_POINT,
  LUCK_DEATH_AVOID_CHANCE_PER_POINT,
  LUCK_EVENT_WEIGHT_PER_POINT,
  LUCK_AGE_DECAY_MODIFIER_PER_POINT,
  LUCK_MIN,
  LUCK_MAX,
  LUCK_MAJOR_CHANGE_THRESHOLD,
  LUCK_NOTIFICATION_DURATION,
  round,
  clampNumber,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const ZERO_LUCK_MODIFIERS: LuckModifiers = {
  diseaseAvoidance: 0,
  deathAvoidChance: 0,
  eventWeightBias: 0,
  ageDecayModifier: 0,
}

export class LuckSystem implements ISubSystem {
  readonly id = 'luck' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '气运' as const
  readonly description = '运气值 → 四项全局修正系数：疾病躲避、死亡回避、事件权重偏移、衰老衰减' as const

  private state: LuckState = this.createInitialState()

  private createInitialState(): LuckState {
    return {
      luck: 0,
      modifiers: { ...ZERO_LUCK_MODIFIERS },
      luckNotificationRounds: 0,
      luckNotificationText: '',
    }
  }

  private computeModifiers(luck: number): LuckModifiers {
    const clampedLuck = clampNumber(luck, LUCK_MIN, LUCK_MAX)
    const mod = getFormulaModifier('luckPointModifier')
    return {
      diseaseAvoidance: round(clampedLuck * LUCK_DISEASE_AVOIDANCE_PER_POINT * mod, 4),
      deathAvoidChance: round(clampedLuck * LUCK_DEATH_AVOID_CHANCE_PER_POINT * mod, 4),
      eventWeightBias: round(clampedLuck * LUCK_EVENT_WEIGHT_PER_POINT * mod, 4),
      ageDecayModifier: round(clampedLuck * LUCK_AGE_DECAY_MODIFIER_PER_POINT * mod, 4),
    }
  }

  collectState(context: RoundContext): SubSystemState {
    // 天象跨域效果：吉兆带来额外运势
    this._applyCelestialLuckEffect(context)

    // 衰减通知轮数
    if (this.state.luckNotificationRounds > 0) {
      this.state.luckNotificationRounds--
    }

    return {
      id: this.id,
      summary: `【${this.label}】${this.state.luck}/10 点${this.getModifierSummary()}`,
      data: structuredClone(this.state as unknown as Record<string, unknown>),
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

    const c = changes.changes as Record<string, unknown>

    // ——— AI 适配分支：气运初始值 ———
    if (c.adaptationType === 'luck-value' && typeof c.luck === 'number') {
      this._applyLuckChange(c.luck)
      return
    }

    // ——— 直接设置运气值 ———
    if (typeof c.luck === 'number') {
      this._applyLuckChange(c.luck)
    }
  }

  // ─── 领域方法 ───

  /** 获取当前气运修正系数 */
  getModifiers(): LuckModifiers {
    return { ...this.state.modifiers }
  }

  /** 格式化气运为 AI prompt 文本 */
  formatForPrompt(): string {
    const parts: string[] = []
    const m = this.state.modifiers
    if (m.diseaseAvoidance > 0.05) parts.push(`疾病回避+${Math.round(m.diseaseAvoidance * 100)}%`)
    if (m.deathAvoidChance > 0.02) parts.push(`死亡回避+${Math.round(m.deathAvoidChance * 100)}%`)
    if (m.ageDecayModifier > 0.01) parts.push(`衰老加速+${Math.round(m.ageDecayModifier * 100)}%`)
    if (parts.length === 0) parts.push('运势平平')

    // 附加大幅变化通知
    if (this.state.luckNotificationRounds > 0 && this.state.luckNotificationText) {
      parts.push(this.state.luckNotificationText)
    }

    return `运气状态：${parts.join('、')}`
  }

  /** 应用运气变更并检测大幅变化 */
  private _applyLuckChange(rawLuck: number): void {
    const newLuck = clampNumber(rawLuck, LUCK_MIN, LUCK_MAX)
    const oldLuck = this.state.luck
    this.state.luck = newLuck
    this.state.modifiers = this.computeModifiers(newLuck)

    const diff = newLuck - oldLuck
    if (Math.abs(diff) >= LUCK_MAJOR_CHANGE_THRESHOLD) {
      this.state.luckNotificationRounds = LUCK_NOTIFICATION_DURATION
      this.state.luckNotificationText = diff > 0 ? '气运大幅上升' : '气运急转直下'
    }
  }

  private getModifierSummary(): string {
    const m = this.state.modifiers
    const parts: string[] = []
    if (m.diseaseAvoidance > 0) parts.push(`疾病回避+${Math.round(m.diseaseAvoidance * 100)}%`)
    if (m.deathAvoidChance > 0) parts.push(`死亡回避+${Math.round(m.deathAvoidChance * 100)}%`)
    if (m.eventWeightBias !== 0) parts.push(`机遇偏移${m.eventWeightBias > 0 ? '+' : ''}${Math.round(m.eventWeightBias * 100)}%`)
    return parts.length > 0 ? ` | ${parts.join('、')}` : ''
  }

  /** 读取天象跨域效果 → 应用于运势值 */
  private _applyCelestialLuckEffect(context: RoundContext): void {
    const celestial = context.subsystemStates['celestial']
    if (!celestial?.data) return
    const data = celestial.data as Record<string, unknown>
    const crossEffects = data.crossEffects as Array<{ targetSystem: string; effectType: string; value: number }> | undefined
    if (!crossEffects || !Array.isArray(crossEffects)) return

    for (const effect of crossEffects) {
      if (effect.targetSystem === 'luck' && effect.effectType === 'luck_boost') {
        const newLuck = clampNumber(this.state.luck + effect.value, LUCK_MIN, LUCK_MAX)
        this.state.luck = newLuck
        this.state.modifiers = this.computeModifiers(newLuck)
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState()
  }
}
