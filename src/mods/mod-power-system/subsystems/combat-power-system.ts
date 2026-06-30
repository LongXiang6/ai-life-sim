/**
 * @module CombatPowerSystem
 * @description 战力子系统：23 阶可达体系 + 动态无限阶 + 修炼衰减 + 突破 + 顿悟 + AI 名称适配
 * @mod mod-power-system
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { CombatPowerState, SubStageIndex } from '../types'
import { configStore } from '@/core'

import {
  RATING_DESCRIPTIONS,
  INSIGHT_MULTIPLIER,
  INSIGHT_DURATION,
  MAX_POWER_CEILING,
  MAX_REACHABLE_STAGE,
  MONSTER_MODIFIER_MIN,
  MONSTER_MODIFIER_MAX,
  generateNextStage,
} from '../constants'
import {
  getStageDecay,
  getSubStageThreshold,
  getUnitName,
  getSubStageLabel,
  formatCombatPower,
  isUltimateStage,
  isBeyondReachable,
  round,
  clamp,
} from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'

export class CombatPowerSystem implements ISubSystem {
  readonly id = 'combat-power' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '战力体系' as const
  readonly description = '23 阶可达体系 + 动态无限阶，管理修炼推进、衰减、突破与阶段名称映射' as const

  private state: CombatPowerState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): CombatPowerState {
    // 尝试从 localStorage 加载玩家预设的力量上限
    const storedCeiling = this.loadStoredPowerCeiling()
    return {
      initialized: false,
      mainStage: 1,
      subStage: 1 as SubStageIndex,
      powerValue: 1,
      combatSkills: {},
      powerCeiling: storedCeiling ?? MAX_POWER_CEILING,
      powerCeilingLabel: `${storedCeiling ?? MAX_POWER_CEILING}阶`,
      insightRemaining: 0,
      stageNames: {},
    }
  }

  /** 从持久化加载玩家预设的力量上限 */
  private loadStoredPowerCeiling(): number | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = configStore.get<string>('mod-power-system', 'power-ceiling')
      if (!raw) return null
      const value = Number(raw)
      return Number.isFinite(value) && value >= 1 && value <= MAX_POWER_CEILING ? value : null
    } catch {
      return null
    }
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: `【${this.label}】${formatCombatPower(this.state.mainStage, this.state.subStage, this.state.powerValue)}`,
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    const stageName = this.state.stageNames[this.state.mainStage]
      ?? getUnitName(this.state.mainStage)
    const subLabel = getSubStageLabel(this.state.subStage)
    const displayPower = formatCombatPower(this.state.mainStage, this.state.subStage, this.state.powerValue)

    const summaryParts: string[] = [`战力：${displayPower}`]
    if (stageName && stageName !== getUnitName(this.state.mainStage)) {
      summaryParts.push(`（${stageName}·${subLabel}）`)
    }
    if (this.state.insightRemaining > 0) {
      summaryParts.push(`顿悟中（剩 ${this.state.insightRemaining} 次）`)
    }
    if (isUltimateStage(this.state.mainStage)) {
      summaryParts.push('终极境界，修炼几近失效')
    }
    if (isBeyondReachable(this.state.mainStage)) {
      const stage = generateNextStage(this.state.mainStage - 1)
      summaryParts.push(`动态无限阶：${stage.name}`)
    }

    return {
      id: this.id,
      summary: `【${this.label}】${summaryParts.join(' | ')}`,
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

    // ——— AI 适配分支：阶段名称映射 ———
    if (c.adaptationType === 'stage-names' && c.stageNames && typeof c.stageNames === 'object') {
      const names = c.stageNames as Record<string, unknown>
      const parsedNames: Record<number, string> = {}
      for (const [key, value] of Object.entries(names)) {
        const stageNum = parseInt(key, 10)
        if (!isNaN(stageNum) && typeof value === 'string' && value.trim() !== '') {
          parsedNames[stageNum] = value.trim()
        }
      }
      if (Object.keys(parsedNames).length > 0) {
        this.state.stageNames = { ...this.state.stageNames, ...parsedNames }
      }
      return
    }

    // ——— 力量上限设置 ———
    if (typeof c.powerCeiling === 'number') {
      this.state.powerCeiling = clamp(c.powerCeiling, 1, MAX_REACHABLE_STAGE)
      this.state.powerCeilingLabel = `${this.state.powerCeiling}阶`
    }

    // ——— 修炼推进（advance） ———
    if (typeof c.baseGain === 'number') {
      this.advancePowerValue(c.baseGain)
    }

    // ——— 突破事件 ———
    if (typeof c.breakthroughPower === 'number') {
      this.breakthrough(c.breakthroughPower)
    }

    // ——— 直接设置状态 ———
    if (typeof c.mainStage === 'number') this.state.mainStage = clamp(c.mainStage, 1, MAX_POWER_CEILING)
    if (typeof c.subStage === 'number') this.state.subStage = clamp(c.subStage, 1, 5) as SubStageIndex
    if (typeof c.powerValue === 'number') this.state.powerValue = clamp(c.powerValue, 1, 9999)
    if (c.combatSkills && typeof c.combatSkills === 'object') {
      this.state.combatSkills = { ...c.combatSkills } as Record<string, number>
    }
    if (typeof c.initialized === 'boolean') this.state.initialized = c.initialized
  }

  // ─── 内部修炼推进逻辑 ───

  private advancePowerValue(baseGain: number): void {
    if (isBeyondReachable(this.state.mainStage)) {
      // 动态无限阶：修炼仍有效，但衰减趋近于 0
    }

    const decay = getStageDecay(this.state.mainStage)
    let effectiveGain = baseGain * decay * getFormulaModifier('cultivationSpeedModifier')

    if (this.state.insightRemaining > 0) {
      effectiveGain *= INSIGHT_MULTIPLIER
      this.state.insightRemaining -= 1
    }

    this.state.powerValue += effectiveGain

    while (this.state.powerValue >= getSubStageThreshold(this.state.subStage) && this.state.subStage < 5) {
      this.state.subStage = (this.state.subStage + 1) as SubStageIndex
      this.state.insightRemaining = INSIGHT_DURATION
    }

    // 固定阶位突破（1→23）
    while (this.state.powerValue >= 10000 && this.state.mainStage < MAX_REACHABLE_STAGE) {
      this.state.mainStage += 1
      this.state.subStage = 1 as SubStageIndex
      this.state.powerValue -= 10000
      this.state.insightRemaining = INSIGHT_DURATION
    }

    // 动态无限阶突破（23→24→25→...）
    while (this.state.powerValue >= 10000 && this.state.mainStage >= MAX_REACHABLE_STAGE) {
      this.state.mainStage += 1
      this.state.subStage = 1 as SubStageIndex
      this.state.powerValue -= 10000
      this.state.insightRemaining = INSIGHT_DURATION
    }

    if (this.state.powerValue < 1) this.state.powerValue = 1
    this.state.initialized = true
  }

  private breakthrough(eventPower: number): void {
    if (isBeyondReachable(this.state.mainStage)) {
      // 动态无限阶仍可突破
    }

    this.state.powerValue += eventPower

    while (this.state.powerValue >= getSubStageThreshold(this.state.subStage) && this.state.subStage < 5) {
      this.state.subStage = (this.state.subStage + 1) as SubStageIndex
      this.state.insightRemaining = INSIGHT_DURATION
    }

    while (this.state.powerValue >= 10000 && this.state.mainStage < MAX_REACHABLE_STAGE) {
      this.state.mainStage += 1
      this.state.subStage = 1 as SubStageIndex
      this.state.powerValue -= 10000
      this.state.insightRemaining = INSIGHT_DURATION
    }

    // 动态无限阶突破
    while (this.state.powerValue >= 10000 && this.state.mainStage >= MAX_REACHABLE_STAGE) {
      this.state.mainStage += 1
      this.state.subStage = 1 as SubStageIndex
      this.state.powerValue -= 10000
      this.state.insightRemaining = INSIGHT_DURATION
    }

    if (this.state.powerValue < 1) this.state.powerValue = 1
    this.state.initialized = true
  }

  // ─── 领域方法 ───

  /** 战力比较：-1 = b胜, 0 = 平局, 1 = a胜 */
  comparePower(a: CombatPowerState, b: CombatPowerState): number {
    if (isBeyondReachable(a.mainStage) && !isBeyondReachable(b.mainStage)) return 1
    if (isBeyondReachable(b.mainStage) && !isBeyondReachable(a.mainStage)) return -1

    if (a.mainStage !== b.mainStage) return a.mainStage - b.mainStage
    if (a.subStage !== b.subStage) {
      const ratio = Math.pow(2.0, a.subStage - b.subStage)
      return round(ratio * a.powerValue - b.powerValue)
    }
    return a.powerValue - b.powerValue
  }

  /** 计算对战怪物修正系数 0.3-2.0 */
  getCombatPowerVsMonsterModifier(monsterThreat: number): number {
    const safeThreat = Math.max(monsterThreat, 0.5)
    const effectiveLevel = this.state.mainStage + (this.state.subStage - 1) * 0.25
    const ratio = effectiveLevel / safeThreat
    return round(clamp(ratio, MONSTER_MODIFIER_MIN, MONSTER_MODIFIER_MAX), 2)
  }

  /** 格式化战力为 AI prompt 文本 */
  formatForPrompt(): string {
    const lines: string[] = []
    lines.push('【战力评估】')
    lines.push(`战力评级：${formatCombatPower(this.state.mainStage, this.state.subStage, this.state.powerValue)}`)
    lines.push(`主阶段：${this.state.mainStage}阶（${getUnitName(this.state.mainStage)}）`)
    lines.push(`子阶段：${getSubStageLabel(this.state.subStage)}`)
    lines.push(`进度值：${Math.round(this.state.powerValue)}`)

    const desc = RATING_DESCRIPTIONS[this.state.mainStage]
    if (desc) lines.push(`战力表现：${desc}`)
    if (this.state.powerCeilingLabel) lines.push(`世界力量上限：${this.state.powerCeilingLabel}`)

    if (isBeyondReachable(this.state.mainStage)) {
      const stage = generateNextStage(this.state.mainStage - 1)
      lines.push(`动态阶位：${stage.name}`)
      lines.push(`修炼衰减：${(stage.decay * 100).toFixed(3)}%`)
    }

    const stageName = this.state.stageNames[this.state.mainStage]
    if (stageName) lines.push(`阶段名称：${stageName}（AI 适配）`)

    const entries = Object.entries(this.state.combatSkills)
    if (entries.length > 0) {
      lines.push('战斗技能：')
      for (const [name, level] of entries) lines.push(`  - ${name}：Lv.${level}`)
    }

    if (this.state.insightRemaining > 0) {
      lines.push(`当前状态：顿悟中（剩余 ${this.state.insightRemaining} 次修炼加速）`)
    }
    if (isUltimateStage(this.state.mainStage)) {
      lines.push('【终极提示】此角色已达终极境界，修炼几近失效。力量增长主要通过突破事件（奇遇/天劫/道劫）驱动。')
    }
    if (isBeyondReachable(this.state.mainStage)) {
      lines.push('【无限方向】此角色已超越所有已知阶位，进入动态无限。修炼永不停止，但真正的"无限"永远在前方。')
    }

    return lines.join('\n')
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
