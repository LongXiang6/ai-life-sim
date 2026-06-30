/**
 * @module CultureTechSystem
 * @description 文化技术子系统：技术等级 1-10 + 6 大类 54 思潮触发/消退 + 知识/工作质量加成
 * @mod mod-tech-level
 */
import { getRoundSequence, consumeSimulationYears } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { CultureTechState, CultureTrend, CultureTrendCategory } from '../types'

import {
  TECH_LEVEL_MIN,
  TECH_LEVEL_MAX,
  TECH_BREAKTHROUGH_PROBABILITY,
  BASE_TECH_PROGRESS,
  TRADE_BOOST_MULTIPLIER,
  KNOWLEDGE_BOOST_MAX,
  KNOWLEDGE_DIVISOR,
  WAR_TECH_PENALTY,
  MAX_ACTIVE_TRENDS,
  CULTURE_TREND_DURATION_MIN,
  CULTURE_TREND_DURATION_MAX,
  KNOWLEDGE_BONUS_PER_LEVEL,
  WORK_QUALITY_PER_TREND,
  CULTURE_TREND_POOL,
  TREND_CATEGORY_LABELS,
} from '../constants'
import {
  round,
  pickRandom,
  clamp,
} from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'

const CULTURE_TECH_TAG_MAP: AttrTagMap = {
  '技术水平': 'techLevel', '科技': 'techLevel', '技术': 'techLevel',
  '技术进步': 'techProgress', '科技进度': 'techProgress',
}

export class CultureTechSystem implements ISubSystem {
  readonly id = 'culture-tech' as const
  readonly mod = 'mod-tech-level' as const
  readonly label = '文化技术' as const
  readonly description = '管理技术等级 1-10 逐年积累、6 类 54 思潮触发消退、知识加成与工作质量加成' as const

  private state: CultureTechState = this.createInitialState()
  private _lastProcessedRound = -1
  private _simYearAccumulator = { value: 0 }

  private createInitialState(): CultureTechState {
    return {
      techLevel: 3,
      techProgress: 0,
      activeTrends: [],
      knowledgeBonus: 0,
      workQualityBonus: 0,
      lastUpdateEraYear: 0,
      activeEvents: [],
    }
  }

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: this.getSummaryText(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  /** Round 2：读取 education.innovationMod 后推进（Round 1 同轮不可跨读） */
  collectStateUpdate(context: RoundContext): SubSystemState | null {
    if (getRoundSequence(context) === this._lastProcessedRound) return null
    this._lastProcessedRound = getRoundSequence(context)

    const eduData = context.subsystemStates['education']?.data as {
      innovationMod?: number
      knowledgeTotal?: number
    } | undefined
    const innovationMod = typeof eduData?.innovationMod === 'number' ? eduData.innovationMod : 1
    const knowledgeTotal = typeof eduData?.knowledgeTotal === 'number' ? eduData.knowledgeTotal : 10

    const years = consumeSimulationYears(this._simYearAccumulator, context, () => {
      this.advanceCultureTech(1, 0.5, knowledgeTotal, false, innovationMod)
    })
    if (years > 0 && years < 1) {
      this.advanceCultureTech(years, 0.5, knowledgeTotal, false, innovationMod)
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

    // ——— AI 适配分支：思潮名称适配 ———
    if (c.adaptationType === 'trend-names' && c.trendNames && typeof c.trendNames === 'object') {
      // AI 适配 6 类思潮的名称 → 覆盖默认名池（降级为 CULTURE_TREND_POOL）
      // 预留接口，当前直接使用 CULTURE_TREND_POOL 默认名池
      return
    }

    // ——— 推进 ———
    if (typeof c.yearsAdvanced === 'number') {
      this.advanceCultureTech(
        c.yearsAdvanced,
        typeof c.tradeActivity === 'number' ? c.tradeActivity : 0.5,
        typeof c.knowledgeTotal === 'number' ? c.knowledgeTotal : 10,
        c.warActive === true,
        1,
      )
    }

    // ——— 直接设置 ———
    if (typeof c.techLevel === 'number') {
      this.state.techLevel = Math.min(Math.max(c.techLevel, TECH_LEVEL_MIN), TECH_LEVEL_MAX)
    }
    if (typeof c.techProgress === 'number') this.state.techProgress = c.techProgress
    if (typeof c.techProgressDelta === 'number') {
      this.state.techProgress = round(clamp(
        this.state.techProgress + (c.techProgressDelta as number),
        0,
        1,
      ))
    }

    // P2 降级：AI JSON 未显式声明文化技术变化时，从 description 中补偿提取
    const hasExplicit = typeof c.techLevel === 'number' || typeof c.techProgress === 'number' ||
      typeof c.yearsAdvanced === 'number'
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, CULTURE_TECH_TAG_MAP)
      if (extracted) {
        if (typeof extracted.techLevel === 'number') {
          this.state.techLevel = clamp(
            Math.floor(this.state.techLevel + extracted.techLevel),
            TECH_LEVEL_MIN, TECH_LEVEL_MAX,
          )
        }
        if (typeof extracted.techProgress === 'number') {
          this.state.techProgress = round(clamp(
            this.state.techProgress + extracted.techProgress, 0, 1,
          ))
        }
      }
    }
  }

  // ─── 内部推进逻辑 ───
  private advanceCultureTech(
    yearsAdvanced: number,
    tradeActivity: number,
    knowledgeTotal: number,
    warActive: boolean,
    educationInnovationMod = 1,
  ): void {
    const innovationMod = Math.max(0.01, educationInnovationMod)
    const events: string[] = []
    let { techLevel, techProgress, activeTrends } = this.state

    const isFractional = yearsAdvanced < 1
    const iterations = isFractional ? 1 : Math.floor(yearsAdvanced)
    const yearScale = isFractional ? yearsAdvanced : 1

    for (let y = 0; y < iterations; y++) {
      const tradeBoost = tradeActivity * TRADE_BOOST_MULTIPLIER
      const knowledgeBoost = Math.min(KNOWLEDGE_BOOST_MAX, knowledgeTotal * KNOWLEDGE_DIVISOR)
      const warPenalty = warActive ? WAR_TECH_PENALTY : 0
      const baseProgress = (BASE_TECH_PROGRESS + tradeBoost + knowledgeBoost + warPenalty + (Math.random() - 0.5) * 0.03)
        * getFormulaModifier('techProgressModifier')
        * innovationMod
        * yearScale
      techProgress += clamp(baseProgress, 0, Infinity)

      if (techProgress >= 1 && techLevel < TECH_LEVEL_MAX) {
        techLevel++
        techProgress = 0
        events.push(`技术突破：文明技术水平提升至第${techLevel}级`)
      }

      // 思潮触发
      if (activeTrends.length < MAX_ACTIVE_TRENDS && Math.random() < TECH_BREAKTHROUGH_PROBABILITY * getFormulaModifier('techBreakthroughModifier') * innovationMod * yearScale) {
        const categories = Object.keys(CULTURE_TREND_POOL) as CultureTrendCategory[]
        const cat = pickRandom(categories)
        const name = pickRandom(CULTURE_TREND_POOL[cat])
        const duration = CULTURE_TREND_DURATION_MIN +
          Math.floor(Math.random() * (CULTURE_TREND_DURATION_MAX - CULTURE_TREND_DURATION_MIN))
        activeTrends = [
          ...activeTrends,
          {
            type: cat,
            name,
            intensity: 50 + Math.floor(Math.random() * 50),
            remainingYears: duration,
            originRegion: '本地',
          },
        ]
        events.push(`${name}思潮兴起（${TREND_CATEGORY_LABELS[cat]}，持续${duration}年）`)
      }
    }

    // 思潮老化/消退
    activeTrends = activeTrends
      .map((t) => ({ ...t, remainingYears: t.remainingYears - yearsAdvanced }))
      .filter((t) => {
        if (t.remainingYears <= 0) {
          events.push(`${t.name}思潮消退`)
          return false
        }
        return true
      })

    // 放回活跃趋势（移除 map 对 intensity 的引用保留）
    this.state.techLevel = techLevel
    this.state.techProgress = round(techProgress)
    this.state.activeTrends = activeTrends.map(({ type, name, intensity, remainingYears, originRegion }) => ({
      type, name, intensity, remainingYears, originRegion,
    }))
    this.state.knowledgeBonus = round(techLevel * KNOWLEDGE_BONUS_PER_LEVEL)
    this.state.workQualityBonus = round(
      activeTrends.filter((t) => t.type === 'art' || t.type === 'philosophy').length * WORK_QUALITY_PER_TREND,
    )
    this.state.lastUpdateEraYear += yearsAdvanced
    this.state.activeEvents = events.slice(-8)
  }

  // ─── 领域方法 ───

  /** 获取当前技术等级 */
  getTechLevel(): number {
    return this.state.techLevel
  }

  /** 获取知识加成系数 */
  getKnowledgeBonus(): number {
    return this.state.knowledgeBonus
  }

  /** 获取工作质量加成系数 */
  getWorkQualityBonus(): number {
    return this.state.workQualityBonus
  }

  /** 获取活跃思潮列表 */
  getActiveTrends(): CultureTrend[] {
    return this.state.activeTrends
  }

  /** 格式化为 AI prompt 文本 */
  formatForPrompt(): string {
    const trendParts = this.state.activeTrends.map(
      (t) => `${t.name}（${TREND_CATEGORY_LABELS[t.type]}，余${t.remainingYears}年）`,
    )
    const events = this.state.activeEvents.length > 0
      ? `事件：${this.state.activeEvents.slice(-3).join('；')}`
      : ''
    const trendText = trendParts.length > 0 ? `思潮：${trendParts.join('、')}。` : '思潮：暂无。'
    return `技术水平：${this.state.techLevel}级（进度${Math.round(this.state.techProgress * 100)}%），${trendText}${events}`
  }

  private getSummaryText(): string {
    const trendNames = this.state.activeTrends.map((t) => t.name).join('、')
    const base = `Lv.${this.state.techLevel} · 进度 ${Math.round(this.state.techProgress * 100)}% · 思潮 ${this.state.activeTrends.length}/3${trendNames ? `：${trendNames}` : ''}`
    return base
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
