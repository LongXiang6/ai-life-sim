/**
 * @module SocialStratificationSystem
 * @description 社会分层子系统：阶层流动、世族动态、阶层人口比例变化、个人阶层流动状态机
 * @mod mod-politics
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { SocialStratificationState, SocialStratum, NobleHouse, SocialClassState } from '../types'

import {
  STRATUM_LABELS_DEFAULT,
  STRATUM_POPULATION_DEFAULT,
  SOCIAL_MOBILITY_BASE,
  STRATUM_INCOME_MULTIPLIER,
  STRATUM_REPUTATION_BONUS,
  CLASS_FLOW_CONFIRM_YEARS,
  WEALTH_CRASH_THRESHOLD,
  WEALTH_CRASH_DROP_TIERS,
  round,
  clamp,
  pickRandom,
  randomInRange,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const STURM_ORDER: SocialStratum[] = ['slave', 'peasant', 'commoner', 'gentry', 'nobility', 'royalty']

const NOBLE_HOUSE_NAMES: readonly string[] = [
  '赵氏', '钱氏', '孙氏', '李氏', '周氏', '吴氏', '郑氏', '王氏',
  '冯氏', '陈氏', '褚氏', '卫氏', '蒋氏', '沈氏', '韩氏', '杨氏',
]

const STRATIFICATION_TAG_MAP: AttrTagMap = {
  '社会流动': 'socialMobility', '流动性': 'socialMobility', '阶层流动': 'socialMobility',
}

export class SocialStratificationSystem implements ISubSystem {
  readonly id = 'social-stratification' as const
  readonly mod = 'mod-politics' as const
  readonly label = '社会分层' as const
  readonly description = '管理社会阶层流动、世族势力动态、阶层人口比例与个人阶层流动' as const

  private state: SocialStratificationState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): SocialStratificationState {
    return {
      playerStratum: 'commoner',
      socialMobility: SOCIAL_MOBILITY_BASE,
      stratumPopulation: { ...STRATUM_POPULATION_DEFAULT },
      nobleHouses: this.generateInitialNobleHouses(),
      stratumLabels: { ...STRATUM_LABELS_DEFAULT },
      playerClassState: {
        currentTier: 'commoner',
        targetTier: 'commoner',
        roundsAtTarget: 0,
        isUpwardMobile: false,
      },
      playerWealthSnapshot: 100,
    }
  }

  private generateInitialNobleHouses(): NobleHouse[] {
    const count = randomInRange(3, 6)
    const houses: NobleHouse[] = []
    const usedNames = new Set<string>()

    for (let i = 0; i < count; i++) {
      let name: string
      do {
        name = pickRandom(NOBLE_HOUSE_NAMES)
      } while (usedNames.has(name) && usedNames.size < NOBLE_HOUSE_NAMES.length)
      usedNames.add(name)

      houses.push({
        id: `noble-${i + 1}`,
        name,
        stratum: i === 0 ? 'royalty' : 'nobility',
        influence: randomInRange(20, 80),
        wealth: randomInRange(1000, 5000),
        territories: [`领地${i + 1}`],
        rivalHouses: [],
        allyHouses: [],
      })
    }

    // 建立世族间敌对/同盟关系
    for (let i = 0; i < houses.length; i++) {
      for (let j = i + 1; j < houses.length; j++) {
        if (Math.random() < 0.3) {
          houses[i].rivalHouses.push(houses[j].id)
          houses[j].rivalHouses.push(houses[i].id)
        } else if (Math.random() < 0.2) {
          houses[i].allyHouses.push(houses[j].id)
          houses[j].allyHouses.push(houses[i].id)
        }
      }
    }

    return houses
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    // 从经济系统读取玩家财富
    const economy = context.subsystemStates['economy']
    const playerWealth = economy?.data
      ? ((economy.data as Record<string, unknown>).playerWealth as number) ?? this.state.playerWealthSnapshot
      : this.state.playerWealthSnapshot

    const years = getAgeYearsDelta(context)
    if (years > 0) {
      this.advanceStratification(years, playerWealth, context.round.year)
    }

    return {
      id: this.id,
      summary: this.getSummaryText(),
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

    if (typeof c.yearsAdvanced === 'number') {
      this.advanceStratification(
        c.yearsAdvanced,
        typeof c.playerWealth === 'number' ? c.playerWealth : this.state.playerWealthSnapshot,
        typeof c.currentYear === 'number' ? c.currentYear : 0,
      )
    }

    if (typeof c.setPlayerStratum === 'string') {
      const stratum = c.setPlayerStratum as SocialStratum
      if (STURM_ORDER.includes(stratum)) {
        this.state.playerStratum = stratum
        this.state.playerClassState.currentTier = stratum
        this.state.playerClassState.targetTier = stratum
        this.state.playerClassState.roundsAtTarget = 0
      }
    }

    if (typeof c.setMobility === 'number') {
      this.state.socialMobility = clamp(c.setMobility, 0, 100)
    }

    if (c.addNobleHouse === true && c.house && typeof c.house === 'object') {
      const h = c.house as Record<string, unknown>
      const house: NobleHouse = {
        id: (h.id as string) || `noble-${Date.now()}`,
        name: (h.name as string) || '世族',
        stratum: (h.stratum as SocialStratum) || 'nobility',
        influence: typeof h.influence === 'number' ? clamp(h.influence, 0, 100) : 30,
        wealth: typeof h.wealth === 'number' ? h.wealth : 1000,
        territories: Array.isArray(h.territories) ? (h.territories as string[]) : [],
        rivalHouses: Array.isArray(h.rivalHouses) ? (h.rivalHouses as string[]) : [],
        allyHouses: Array.isArray(h.allyHouses) ? (h.allyHouses as string[]) : [],
      }
      this.state.nobleHouses.push(house)
    }

    if (c.removeNobleHouse === true && typeof c.houseId === 'string') {
      this.state.nobleHouses = this.state.nobleHouses.filter((h) => h.id !== c.houseId)
    }

    if (c.setStratumLabels === true && c.labels && typeof c.labels === 'object') {
      // P1 AI 覆盖兜底：AI 必须提供完整 6 层标签才覆盖，缺失的走默认
      const incoming = c.labels as Partial<Record<SocialStratum, string>>
      const merged: Record<string, string> = { ...this.state.stratumLabels }
      let hasValid = false
      for (const s of STURM_ORDER) {
        if (typeof incoming[s] === 'string' && incoming[s]!.trim().length > 0) {
          merged[s] = incoming[s]!.trim()
          hasValid = true
        } else {
          // 缺失的标签使用默认值兜底
          merged[s] = STRATUM_LABELS_DEFAULT[s]
        }
      }
      if (hasValid) {
        this.state.stratumLabels = merged as Record<SocialStratum, string>
      }
    }

    // P2 降级：AI JSON 未显式声明分层变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || typeof c.setPlayerStratum === 'string' ||
      typeof c.setMobility === 'number' || c.addNobleHouse === true || c.removeNobleHouse === true ||
      c.setStratumLabels === true
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, STRATIFICATION_TAG_MAP)
      if (extracted && typeof extracted.socialMobility === 'number') {
        this.state.socialMobility = clamp(this.state.socialMobility + extracted.socialMobility, 0, 100)
      }
    }
  }

  // ─── 内部逻辑 ───

  private advanceStratification(years: number, playerWealth: number, _currentYear: number): void {
    if (years <= 0) return
    this.state.playerWealthSnapshot = playerWealth

    const iterations = years < 1 ? 1 : Math.floor(years)
    const scale = years < 1 ? years : 1

    for (let y = 0; y < iterations; y++) {
      // ── 个人阶层流动状态机 ──
      this.updatePlayerClassState(playerWealth)

      // ── 阶层人口比例变化（受社会流动性影响） ──
      const mobilityRate = this.state.socialMobility / 100
      const shift = mobilityRate * 0.005 * getFormulaModifier('socialMobilityModifier') * scale

      this.state.stratumPopulation.slave = round(clamp(this.state.stratumPopulation.slave - shift, 0, 1))
      this.state.stratumPopulation.peasant = round(clamp(this.state.stratumPopulation.peasant - shift * 0.5, 0, 1))
      this.state.stratumPopulation.commoner = round(clamp(this.state.stratumPopulation.commoner + shift * 0.3, 0, 1))
      this.state.stratumPopulation.gentry = round(clamp(this.state.stratumPopulation.gentry + shift * 0.15, 0, 1))
      this.state.stratumPopulation.nobility = round(clamp(this.state.stratumPopulation.nobility + shift * 0.05, 0, 1))

      // 总比例归一化
      const total = STURM_ORDER.reduce((sum, s) => sum + this.state.stratumPopulation[s], 0)
      if (total > 0 && Math.abs(total - 1) > 0.001) {
        for (const s of STURM_ORDER) {
          this.state.stratumPopulation[s] = round(this.state.stratumPopulation[s] / total)
        }
      }

      // 社会流动性波动
      this.state.socialMobility = round(clamp(
        this.state.socialMobility + (Math.random() - 0.5) * 2 * scale,
        0,
        100,
      ))

      // 世族动态
      for (const house of this.state.nobleHouses) {
        const rivalPenalty = house.rivalHouses.length * 0.5
        const allyBonus = house.allyHouses.length * 0.3
        house.influence = round(clamp(
          house.influence + ((Math.random() - 0.5) * 4 + allyBonus - rivalPenalty) * scale,
          0,
          100,
        ))

        house.wealth = Math.max(0, house.wealth + Math.round((Math.random() - 0.45) * house.wealth * 0.05 * scale))

        if (Math.random() < mobilityRate * 0.02 && house.stratum !== 'royalty') {
          const idx = STURM_ORDER.indexOf(house.stratum)
          if (idx < STURM_ORDER.length - 1 && Math.random() > 0.5) {
            house.stratum = STURM_ORDER[idx + 1]
          } else if (idx > 0 && Math.random() > 0.7) {
            house.stratum = STURM_ORDER[idx - 1]
          }
        }
      }
    }
  }

  /** 更新个人阶层流动状态机 */
  private updatePlayerClassState(playerWealth: number): void {
    const cs = this.state.playerClassState

    // 财富暴跌降级
    if (playerWealth <= WEALTH_CRASH_THRESHOLD) {
      const currentIdx = STURM_ORDER.indexOf(cs.currentTier)
      const targetIdx = Math.max(0, currentIdx - WEALTH_CRASH_DROP_TIERS)
      const newTier = STURM_ORDER[targetIdx]
      if (newTier !== cs.currentTier) {
        cs.currentTier = newTier
        cs.targetTier = newTier
        cs.roundsAtTarget = 0
        cs.isUpwardMobile = false
        this.state.playerStratum = newTier
      }
      return
    }

    // 根据财富计算目标阶层
    const newTarget = this.getTierForWealth(playerWealth)

    if (newTarget !== cs.targetTier) {
      // 目标发生变化，重置计时器
      cs.targetTier = newTarget
      cs.roundsAtTarget = 0
      cs.isUpwardMobile = STURM_ORDER.indexOf(newTarget) > STURM_ORDER.indexOf(cs.currentTier)
    }

    if (newTarget !== cs.currentTier) {
      // 还没到目标阶层，累计停留年数
      cs.roundsAtTarget++
      if (cs.roundsAtTarget >= CLASS_FLOW_CONFIRM_YEARS) {
        // 确认流动
        cs.currentTier = newTarget
        cs.roundsAtTarget = 0
        this.state.playerStratum = newTarget
        // 流动后检查是否还可以继续向上
        const furtherTarget = this.getTierForWealth(playerWealth)
        cs.targetTier = furtherTarget
        cs.isUpwardMobile = STURM_ORDER.indexOf(furtherTarget) > STURM_ORDER.indexOf(cs.currentTier)
      }
    } else {
      // 已达目标阶层，不需要流动
      cs.roundsAtTarget = 0
    }
  }

  /** 根据财富值确定目标阶层 */
  private getTierForWealth(wealth: number): SocialStratum {
    if (wealth >= 10000) return 'royalty'
    if (wealth >= 5000) return 'nobility'
    if (wealth >= 2000) return 'gentry'
    if (wealth >= 500) return 'commoner'
    if (wealth >= 100) return 'peasant'
    return 'slave'
  }

  // ─── 领域方法 ───

  getPlayerStratum(): SocialStratum {
    return this.state.playerStratum
  }

  getPlayerStratumLabel(): string {
    return this.state.stratumLabels[this.state.playerStratum] || this.state.playerStratum
  }

  getSocialMobility(): number {
    return this.state.socialMobility
  }

  getNobleHouses(): NobleHouse[] {
    return this.state.nobleHouses
  }

  getStratumPopulation(stratum: SocialStratum): number {
    return this.state.stratumPopulation[stratum]
  }

  /** 玩家当前收入倍率（基于阶层的经济影响） */
  getPlayerIncomeMultiplier(): number {
    return STRATUM_INCOME_MULTIPLIER[this.state.playerStratum] ?? 1.0
  }

  /** 玩家当前声望加成（基于阶层的社会地位） */
  getPlayerReputationBonus(): number {
    return STRATUM_REPUTATION_BONUS[this.state.playerStratum] ?? 0
  }

  /** 个人阶层流动状态 */
  getPlayerClassState(): SocialClassState {
    return { ...this.state.playerClassState }
  }

  /** AI Prompt 用格式化分层状态文本 */
  formatForPrompt(): string {
    const sb: string[] = []
    const label = this.getPlayerStratumLabel()

    sb.push(`【社会分层】当前阶层：${label}（${this.state.playerStratum}）`)
    sb.push(`  收入倍率：×${this.getPlayerIncomeMultiplier()} · 声望加成：${this.getPlayerReputationBonus()}点`)

    // 流动状态
    const cs = this.state.playerClassState
    if (cs.currentTier !== cs.targetTier) {
      const targetLabel = this.state.stratumLabels[cs.targetTier] || cs.targetTier
      const direction = cs.isUpwardMobile ? '↑' : '↓'
      sb.push(`  流动状态：正在${direction}（目标：${targetLabel}，进度：${cs.roundsAtTarget}/${CLASS_FLOW_CONFIRM_YEARS}年）`)
    }

    // 社会结构
    sb.push('── 社会结构 ──')
    for (const s of STURM_ORDER) {
      const pct = (this.state.stratumPopulation[s] * 100).toFixed(1)
      sb.push(`  ${this.state.stratumLabels[s] || s}：${pct}%`)
    }

    // 世族
    if (this.state.nobleHouses.length > 0) {
      sb.push('── 世族势力 ──')
      for (const h of this.state.nobleHouses) {
        sb.push(`  ${h.name}（影响力：${h.influence} · 财富：${h.wealth}）`)
      }
    }

    return sb.join('\n')
  }

  private getSummaryText(): string {
    const cs = this.state.playerClassState
    let flowInfo = ''
    if (cs.currentTier !== cs.targetTier) {
      const targetLabel = this.state.stratumLabels[cs.targetTier] || cs.targetTier
      flowInfo = ` → ${targetLabel}（${cs.roundsAtTarget}/${CLASS_FLOW_CONFIRM_YEARS}）`
    }
    return `【${this.label}】玩家阶层：${this.getPlayerStratumLabel()}${flowInfo} · 收入倍率：×${this.getPlayerIncomeMultiplier()} · 流动性：${Math.round(this.state.socialMobility)} · 世族：${this.state.nobleHouses.length}家`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
