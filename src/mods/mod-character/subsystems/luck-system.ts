/**
 * @module LuckSystem
 * @description 气运子系统（隐藏基础属性，用户不可见）：运气值 → 四项全局修正系数，供 AI 读写与 CelestialSystem 等引用
 * @mod mod-character
 */

import { getRoundSequence } from '@/foundation'
import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { LuckState, LuckModifiers } from '../types'

import {
  LUCK_DISEASE_AVOIDANCE_PER_POINT,
  LUCK_DEATH_AVOID_CHANCE_PER_POINT,
  LUCK_EVENT_WEIGHT_PER_POINT,
  LUCK_AGE_DECAY_MODIFIER_PER_POINT,
  MIN_LUCK,
  MAX_LUCK,
  LUCK_MAJOR_CHANGE_THRESHOLD,
  LUCK_NOTIFICATION_DURATION,
} from '../constants'
import { round } from '../utils'
import { clamp } from '@/core/shared'

import { getFormulaModifier } from '@/mods/mod-world'
import { usePowerSystemStore } from '@/mods/mod-power-system'

const ZERO_LUCK_MODIFIERS: LuckModifiers = {
  diseaseAvoidance: 0,
  deathAvoidChance: 0,
  eventWeightBias: 0,
  ageDecayModifier: 0,
}

export class LuckSystem implements ISubSystem {
  readonly id = 'luck' as const
  readonly mod = 'mod-character' as const
  readonly label = '气运' as const
  readonly description = '运气值 → 四项全局修正系数：疾病躲避、死亡回避、事件权重偏移、衰老衰减' as const

  private state: LuckState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): LuckState {
    return {
      luck: 0,
      modifiers: { ...ZERO_LUCK_MODIFIERS },
      luckNotificationRounds: 0,
      luckNotificationText: '',
    }
  }

  private computeModifiers(luck: number): LuckModifiers {
    const clampedLuck = clamp(luck, MIN_LUCK, MAX_LUCK)
    const mod = getFormulaModifier('luckPointModifier')
    return {
      diseaseAvoidance: round(clampedLuck * LUCK_DISEASE_AVOIDANCE_PER_POINT * mod, 4),
      deathAvoidChance: round(clampedLuck * LUCK_DEATH_AVOID_CHANCE_PER_POINT * mod, 4),
      eventWeightBias: round(clampedLuck * LUCK_EVENT_WEIGHT_PER_POINT * mod, 4),
      ageDecayModifier: round(clampedLuck * LUCK_AGE_DECAY_MODIFIER_PER_POINT * mod, 4),
    }
  }

  collectState(context: RoundContext): SubSystemState {
    const currentRound = getRoundSequence(context)
    if (currentRound !== this._lastProcessedRound) {
      this._lastProcessedRound = currentRound
      // 天象跨域效果与通知衰减每个真实回合只执行一次；重复 collect/预生成不得重复消费。
      this._applyCelestialLuckEffect(context)
      if (this.state.luckNotificationRounds > 0) {
        this.state.luckNotificationRounds--
      }
    }

    return {
      id: this.id,
      summary: `【${this.label}】${this.state.luck} 点（${MIN_LUCK}~${MAX_LUCK}）${this.getModifierSummary()}`,
      data: structuredClone({ ...this.state, contextId: context.contextId }),
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
    const newLuck = clamp(rawLuck, MIN_LUCK, MAX_LUCK)
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
        const newLuck = clamp(this.state.luck + effect.value, MIN_LUCK, MAX_LUCK)
        this.state.luck = newLuck
        this.state.modifiers = this.computeModifiers(newLuck)
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }

  hydrateFromStore(): void {
    this.restoreCollectedState(usePowerSystemStore.getState().luck)
  }

  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as Partial<LuckState>
    if (
      typeof value.luck !== 'number'
      || !value.modifiers
      || typeof value.luckNotificationRounds !== 'number'
      || typeof value.luckNotificationText !== 'string'
    ) return
    this.state = structuredClone({
      luck: value.luck,
      modifiers: value.modifiers,
      luckNotificationRounds: value.luckNotificationRounds,
      luckNotificationText: value.luckNotificationText,
    })
    this._lastProcessedRound = -1
  }

  capturePreviewState(): unknown {
    return structuredClone({ state: this.state, lastProcessedRound: this._lastProcessedRound })
  }

  restorePreviewState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as { state?: LuckState; lastProcessedRound?: number }
    this.restoreCollectedState(value.state)
    if (typeof value.lastProcessedRound === 'number') this._lastProcessedRound = value.lastProcessedRound
  }
}

let runtimeLuckSystem: LuckSystem | undefined

/** Loader 与引擎共享的懒加载气运单例。 */
export function getLuckSystem(): LuckSystem {
  runtimeLuckSystem ??= new LuckSystem()
  return runtimeLuckSystem
}
