/**
 * @module EconomySystem
 * @description 经济子系统：市场周期推进、货币演化、商路更新、税率与通胀计算
 * @mod mod-economy
 */
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { EconomyState, TradeRouteState, CurrencyType, EconomicAsset, EconomicDebt, MarketCyclePhase } from '../types'

import {
  DEFAULT_CURRENCY,
  INITIAL_WEALTH,
  TAX_RANGE,
  MARKET_PHASE_ORDER,
  MARKET_PHASE_DURATION,
  MARKET_PHASE_LABELS,
  MARKET_PHASE_HINT,
  PHASE_TRANSITION_PROBABILITIES,
  SEASONAL_PRICE_MODIFIERS,
  DIFFICULTY_MULTIPLIERS,
  CURRENCY_LABELS,
  TRADE_ROUTE_STATUS_BLOCKED_MAX,
  TRADE_ROUTE_STATUS_DECLINING_MAX,
  TRADE_ROUTE_STATUS_FLOURISHING_MIN,
  TRADE_ROUTE_STATUS_LABELS,
  getCurrencyTypeForStability,
  CURRENCY_STABILITY_MIN,
  CURRENCY_STABILITY_MAX,
  round,
  clamp,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const ECONOMY_TAG_MAP: AttrTagMap = {
  '财富': 'playerWealth', '收入': 'playerWealth', '资产': 'playerWealth',
  'GDP': 'totalCirculation', '经济总量': 'totalCirculation',
  '通胀': 'inflation', '通货膨胀': 'inflation',
  '税收': 'taxRate', '税率': 'taxRate',
  '基尼系数': 'giniCoefficient', '贫富差距': 'giniCoefficient',
}

/** 月份 → 季节映射 */
function monthToSeason(month: number): string {
  if (month >= 1 && month <= 3) return 'spring'
  if (month >= 4 && month <= 6) return 'summer'
  if (month >= 7 && month <= 9) return 'autumn'
  return 'winter'
}

/** 按概率表投骰选择下一阶段 */
function rollNextPhase(current: string, probabilities: Record<string, number[]>): string {
  const idx = MARKET_PHASE_ORDER.indexOf(current as MarketCyclePhase)
  if (idx < 0) return current
  const probs = probabilities[current]
  if (!probs || probs.length !== MARKET_PHASE_ORDER.length) return current
  const roll = Math.random()
  let cumulative = 0
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i]
    if (roll < cumulative) return MARKET_PHASE_ORDER[i]
  }
  return MARKET_PHASE_ORDER[MARKET_PHASE_ORDER.length - 1]
}

export class EconomySystem implements ISubSystem {
  readonly id = 'economy' as const
  readonly mod = 'mod-economy' as const
  readonly label = '经济系统' as const
  readonly description = '管理市场周期推进、货币演化、商路更新、税率与通胀计算' as const

  private state: EconomyState = this.createInitialState()
  private _lastProcessedRound = -1
  /** 当前市场周期阶段已持续回合数 */
  private _phaseElapsed = 0
  /** 不足 1 年的模拟量累积 */
  private _simYearAccumulator = 0
  /** 最近一次已知的总人口（容忍子系统收集顺序：population 在 economy 之后才更新时回退至此值） */
  private _lastKnownPopulation: number | undefined = undefined

  private createInitialState(): EconomyState {
    return {
      initialized: false,
      currency: {
        type: DEFAULT_CURRENCY,
        name: CURRENCY_LABELS[DEFAULT_CURRENCY],
        playerWealth: INITIAL_WEALTH,
        totalCirculation: 10000,
        inflation: 0,
        stabilityIndex: 80,
      },
      assets: [],
      debts: [],
      tradeRoutes: [
        { id: 'tr-default', name: '主干商路', from: '都城', to: '边镇', prosperity: 50, status: 'normal', dangerLevel: 20, goods: ['粮食', '布匹'] },
      ],
      marketPhase: 'normal',
      marketCycleProgress: 0,
      priceIndex: 100,
      taxRate: 10,
      giniCoefficient: 0.35,
      recentEvents: [],
      difficultyMultiplier: 1.0,
    }
  }

  collectState(context: RoundContext): SubSystemState {
    // Round 1 中 population 还未收集本轮状态，这里只使用上一轮人口；
    // Round 2 会用已收集的当前 population 重新生成 summary。
    const populationState = context.subsystemStates?.['population']
    const contextPopulation = (populationState?.data as { totalPopulation?: number } | undefined)?.totalPopulation
    if (contextPopulation !== undefined) {
      this._lastKnownPopulation = contextPopulation
    }
    const totalPopulation = contextPopulation ?? this._lastKnownPopulation

    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(totalPopulation),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    const years = getAgeYearsDelta(context)
    if (years > 0) {
      this.advanceEconomy(years, false, context)
    }
    this.state.initialized = true

    return {
      id: this.id,
      summary: this.getSummaryText(totalPopulation),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  collectStateUpdate(context: RoundContext): SubSystemState | null {
    const populationState = context.subsystemStates?.['population']
    const totalPopulation = (populationState?.data as { totalPopulation?: number } | undefined)?.totalPopulation
    if (totalPopulation === undefined) return null

    this._lastKnownPopulation = totalPopulation
    return {
      id: this.id,
      summary: this.getSummaryText(totalPopulation),
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
      const warActive = c.warActive === true
      this.advanceEconomy(c.yearsAdvanced, warActive, _context)
    }

    if (typeof c.wealthDelta === 'number') {
      this.state.currency.playerWealth = clamp(
        this.state.currency.playerWealth + (c.wealthDelta as number), 0, Infinity,
      )
    }

    if (typeof c.inflationDelta === 'number') {
      this.state.currency.inflation = clamp(this.state.currency.inflation + c.inflationDelta, -20, 50)
    }

    if (typeof c.setTaxRate === 'number') {
      this.state.taxRate = clamp(c.setTaxRate, TAX_RANGE.min, TAX_RANGE.max)
    }

    // 添加资产
    if (c.addAsset === true && c.asset && typeof c.asset === 'object') {
      const a = c.asset as Record<string, unknown>
      this.state.assets.push({
        id: (a.id as string) || `asset-${Date.now()}`,
        name: (a.name as string) || '新资产',
        incomePerRound: typeof a.incomePerRound === 'number' ? a.incomePerRound : 0,
        cost: typeof a.cost === 'number' ? a.cost : 0,
        acquiredYear: typeof a.acquiredYear === 'number' ? a.acquiredYear : _context.round.year,
      })
    }

    // 移除资产
    if (c.removeAsset === true && typeof c.assetId === 'string') {
      this.state.assets = this.state.assets.filter((a) => a.id !== c.assetId)
    }

    // 添加债务
    if (c.addDebt === true && c.debt && typeof c.debt === 'object') {
      const d = c.debt as Record<string, unknown>
      this.state.debts.push({
        id: (d.id as string) || `debt-${Date.now()}`,
        name: (d.name as string) || '新债务',
        interestPerRound: typeof d.interestPerRound === 'number' ? d.interestPerRound : 0,
        principal: typeof d.principal === 'number' ? d.principal : 0,
        remainingTerms: typeof d.remainingTerms === 'number' ? d.remainingTerms : 10,
        borrowedYear: typeof d.borrowedYear === 'number' ? d.borrowedYear : _context.round.year,
      })
    }

    // 偿还债务
    if (c.repayDebt === true && typeof c.debtId === 'string') {
      this.state.debts = this.state.debts.filter((d) => d.id !== c.debtId)
    }

    if (c.addTradeRoute === true && c.tradeRoute && typeof c.tradeRoute === 'object') {
      const tr = c.tradeRoute as Record<string, unknown>
      const prosperity = typeof tr.prosperity === 'number' ? clamp(tr.prosperity, 0, 100) : 30
      let status: TradeRouteState['status']
      if (prosperity <= TRADE_ROUTE_STATUS_BLOCKED_MAX) status = 'blocked'
      else if (prosperity <= TRADE_ROUTE_STATUS_DECLINING_MAX) status = 'declining'
      else if (prosperity >= TRADE_ROUTE_STATUS_FLOURISHING_MIN) status = 'flourishing'
      else status = 'normal'
      const newRoute: TradeRouteState = {
        id: (tr.id as string) || `tr-gen-${Date.now()}`,
        name: (tr.name as string) || '新商路',
        from: (tr.from as string) || '未知',
        to: (tr.to as string) || '未知',
        prosperity,
        status,
        dangerLevel: typeof tr.dangerLevel === 'number' ? clamp(tr.dangerLevel, 0, 100) : 20,
        goods: Array.isArray(tr.goods) ? (tr.goods as string[]) : ['杂货'],
      }
      this.state.tradeRoutes.push(newRoute)
    }

    if (c.removeTradeRoute === true && typeof c.tradeRouteId === 'string') {
      this.state.tradeRoutes = this.state.tradeRoutes.filter((r) => r.id !== c.tradeRouteId)
    }

    if (c.setCurrency === true && typeof c.currencyType === 'string') {
      const currencyType = c.currencyType as CurrencyType
      this.state.currency.type = currencyType
      this.state.currency.name = CURRENCY_LABELS[currencyType] || currencyType
    }

    if (typeof c.difficulty === 'string') {
      this.state.difficultyMultiplier = DIFFICULTY_MULTIPLIERS[c.difficulty] ?? 1.0
    }

    // P2 降级：AI JSON 未显式声明经济变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || typeof c.setTaxRate === 'number' ||
      c.addTradeRoute === true || c.removeTradeRoute === true || c.setCurrency === true ||
      c.addAsset === true || c.removeAsset === true || c.addDebt === true || c.repayDebt === true
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, ECONOMY_TAG_MAP)
      if (extracted) {
        if (typeof extracted.playerWealth === 'number') {
          this.state.currency.playerWealth = clamp(this.state.currency.playerWealth + extracted.playerWealth, 0, Infinity)
        }
        if (typeof extracted.totalCirculation === 'number') {
          this.state.currency.totalCirculation = Math.max(100, this.state.currency.totalCirculation + extracted.totalCirculation)
        }
        if (typeof extracted.inflation === 'number') {
          this.state.currency.inflation = clamp(this.state.currency.inflation + extracted.inflation, -20, 50)
        }
        if (typeof extracted.taxRate === 'number') {
          this.state.taxRate = clamp(this.state.taxRate + extracted.taxRate, TAX_RANGE.min, TAX_RANGE.max)
        }
        if (typeof extracted.giniCoefficient === 'number') {
          this.state.giniCoefficient = clamp(this.state.giniCoefficient + extracted.giniCoefficient, 0, 1)
        }
      }
    }
  }

  // ─── 经济推进逻辑 ───

  private advanceEconomy(yearsAdvanced: number, warActive: boolean, context: RoundContext): void {
    if (yearsAdvanced <= 0) return
    this._simYearAccumulator += yearsAdvanced
    while (this._simYearAccumulator >= 1) {
      this._advanceEconomyOneYear(warActive, context)
      this._simYearAccumulator -= 1
    }
  }

  private _advanceEconomyOneYear(warActive: boolean, context: RoundContext): void {
    const events: string[] = []
    let { marketPhase, marketCycleProgress, tradeRoutes } = this.state
    const { currency, taxRate } = this.state
    let phaseElapsed = this._phaseElapsed

    // 季节修正
    const season = monthToSeason(context.round.month)
    const seasonalModifier = SEASONAL_PRICE_MODIFIERS[season] ?? 1.0

    // ── 市场周期推进（概率跳转） ──
    phaseElapsed++
      const phaseDurationRange = MARKET_PHASE_DURATION[marketPhase]
      const phaseTarget = phaseDurationRange[0] + Math.floor(Math.random() * (phaseDurationRange[1] - phaseDurationRange[0] + 1))

      if (phaseElapsed >= phaseTarget) {
        const newPhase = rollNextPhase(marketPhase, PHASE_TRANSITION_PROBABILITIES) as MarketCyclePhase
        if (newPhase !== marketPhase) {
          events.push(`市场周期从${MARKET_PHASE_LABELS[marketPhase]}转为${MARKET_PHASE_LABELS[newPhase]}`)
        }
        marketPhase = newPhase
        phaseElapsed = 0
      }

      marketCycleProgress = clamp((phaseElapsed / phaseTarget) * 100, -Infinity, 100)

      // ── 通胀变化 ──
      const inflationDelta =
        (marketPhase === 'boom' ? 0.8 :
        marketPhase === 'depression' ? -1.5 :
        marketPhase === 'recovery' ? -0.3 : 0.2) * getFormulaModifier('inflationModifier')
      const warInflation = warActive ? 1.0 : 0
      currency.inflation = round(clamp(currency.inflation + inflationDelta + warInflation + (Math.random() - 0.5) * 0.4, -20, 50))

      // 货币总量受通胀影响
      currency.totalCirculation = round(Math.max(100, currency.totalCirculation * (1 + currency.inflation / 100)))

      // ── 稳定性指数计算 ──
      const stabilityBefore = currency.stabilityIndex
      currency.stabilityIndex = round(clamp(
        100 - Math.abs(currency.inflation) * 5 - Math.random() * 5,
        0, 100,
      ))

      // 自动演化：稳定性阈值跨越检测
      const evolvedType = getCurrencyTypeForStability(currency.stabilityIndex)
      if (evolvedType !== currency.type) {
        const oldLabel = CURRENCY_LABELS[currency.type] ?? currency.type
        const newLabel = CURRENCY_LABELS[evolvedType] ?? evolvedType
        events.push(`货币演化：${oldLabel}→${newLabel}（稳定性指数 ${stabilityBefore}→${currency.stabilityIndex}）`)
        currency.type = evolvedType
        currency.name = newLabel
      }

      // ── 季节修正后的物价影响财富 ──
      const seasonalEffect = seasonalModifier - 1.0  // -0.15 ~ +0.10

      // ── 资产收入 ──
      let assetIncome = 0
      for (const asset of this.state.assets) {
        assetIncome += asset.incomePerRound
      }

      // ── 债务利息 ──
      let debtInterest = 0
      this.state.debts = this.state.debts.filter((d) => {
        debtInterest += d.interestPerRound
        d.remainingTerms--
        return d.remainingTerms > 0
      })

      // ── 玩家财富计算 ──
      const phaseMultiplier =
        marketPhase === 'boom' ? 1.05 :
        marketPhase === 'recession' ? 0.95 :
        marketPhase === 'depression' ? 0.88 : 1.0
      const taxDrain = (taxRate / 100) * 0.5
      const difficultyFactor = this.state.difficultyMultiplier
      // 财富变化 = (基础乘数 - 税率抽水 - 季节修正 - 难度因子) + 资产收入 - 债务利息 + 随机波动
      const wealthMultiplier = clamp(phaseMultiplier - taxDrain + seasonalEffect - (difficultyFactor - 1) * 0.1, 0, Infinity)
      currency.playerWealth = round(clamp(
        currency.playerWealth * wealthMultiplier + assetIncome - debtInterest + (Math.random() - 0.5) * 2,
        0, Infinity,
      ))

      // 商路繁荣度变化 + 状态更新 + 危险等级 + 事件
      const oldRouteStatuses: Record<string, string> = {}
      tradeRoutes = tradeRoutes.map((route) => {
        const prosperityChange = (marketPhase === 'boom' ? 3 : marketPhase === 'depression' ? -3 : Math.random() * 2 - 1)
        const warPenalty = warActive ? -2 : 0
        oldRouteStatuses[route.id] = route.status
        const newProsperity = round(clamp(route.prosperity + prosperityChange + warPenalty, 0, 100))

        // 状态判定
        let newStatus: string
        if (newProsperity <= TRADE_ROUTE_STATUS_BLOCKED_MAX) newStatus = 'blocked'
        else if (newProsperity <= TRADE_ROUTE_STATUS_DECLINING_MAX) newStatus = 'declining'
        else if (newProsperity >= TRADE_ROUTE_STATUS_FLOURISHING_MIN) newStatus = 'flourishing'
        else newStatus = 'normal'

        // 状态变更事件
        if (newStatus !== oldRouteStatuses[route.id] && oldRouteStatuses[route.id]) {
          const oldLabel = TRADE_ROUTE_STATUS_LABELS[oldRouteStatuses[route.id]] ?? oldRouteStatuses[route.id]
          const newLabel = TRADE_ROUTE_STATUS_LABELS[newStatus] ?? newStatus
          events.push(`商路「${route.name}」状态变化：${oldLabel}→${newLabel}`)
        }

        // 危险等级：战争+5，灾害期+3，繁华期自动衰减
        const dangerChange = warActive ? 5 : marketPhase === 'depression' ? 3 : -1
        const newDanger = clamp(route.dangerLevel + dangerChange, 0, 100)

        return {
          ...route,
          prosperity: newProsperity,
          status: newStatus as TradeRouteState['status'],
          dangerLevel: newDanger,
        }
      })

      // 基尼系数小幅波动
    this.state.giniCoefficient = round(clamp(
      this.state.giniCoefficient + (Math.random() - 0.5) * 0.01,
      0,
      1,
    ))

    this.state.marketPhase = marketPhase
    this.state.marketCycleProgress = round(marketCycleProgress)
    this.state.priceIndex = round(clamp(100 + currency.inflation * 2, 20, 300))
    this.state.currency = currency
    this.state.tradeRoutes = tradeRoutes
    this.state.taxRate = taxRate
    this.state.recentEvents = events.slice(-5)
    this._phaseElapsed = phaseElapsed
  }

  // ─── 领域方法 ───

  getMarketPhase() {
    return this.state.marketPhase
  }

  getPlayerWealth(): number {
    return this.state.currency.playerWealth
  }

  getTaxRate(): number {
    return this.state.taxRate
  }

  getTradeRoutes(): TradeRouteState[] {
    return this.state.tradeRoutes
  }

  /** 获取全局贸易乘数 */
  getTradeIncomeMultiplier(): number {
    const routes = this.state.tradeRoutes
    if (routes.length === 0) return 0.6
    const avgProsperity = routes.reduce((s, r) => s + r.prosperity, 0) / routes.length
    return round(clamp((0.6 + (avgProsperity / 100) * 0.8) * getFormulaModifier('tradeMultiplierModifier'), 0.3, 1.5), 3)
  }

  /** 获取货币稳定性乘数 */
  getCurrencyStabilityMultiplier(): number {
    const ratio = this.state.currency.stabilityIndex / 100
    return round(CURRENCY_STABILITY_MIN + ratio * (CURRENCY_STABILITY_MAX - CURRENCY_STABILITY_MIN), 3)
  }

  getAssets(): EconomicAsset[] {
    return [...this.state.assets]
  }

  getDebts(): EconomicDebt[] {
    return [...this.state.debts]
  }

  /**
   * 计算经济总量 = 人均财富 × 总人口
   *
   * @param totalPopulation 总人口数（从 population 子系统获取）
   * @returns 经济总量
   */
  getTotalEconomy(totalPopulation: number): number {
    const perCapitaWealth = this.state.currency.playerWealth
    return perCapitaWealth * totalPopulation
  }

  /**
   * 获取经济总量等级（用于 Prompt 注入）
   *
   * @param totalPopulation 总人口数
   * @returns 经济等级描述
   */
  getEconomyScale(totalPopulation: number): string {
    const total = this.getTotalEconomy(totalPopulation)
    if (total >= 1_000_000_000) return '帝国级'
    if (total >= 100_000_000) return '王国级'
    if (total >= 10_000_000) return '城邦级'
    if (total >= 1_000_000) return '城镇级'
    if (total >= 100_000) return '村落级'
    return '家庭级'
  }

  formatForPrompt(): string {
    const { currency, marketPhase, tradeRoutes, assets, debts, taxRate, giniCoefficient, recentEvents, difficultyMultiplier } = this.state
    const phaseLabel = MARKET_PHASE_LABELS[marketPhase]
    const phaseHint = MARKET_PHASE_HINT[marketPhase] ?? ''
    const lines = [
      `经济阶段：${phaseLabel}（${phaseHint}）`,
      `财富：${Math.round(currency.playerWealth)}，通胀：${currency.inflation.toFixed(1)}%`,
      `货币：${currency.name}（稳定性指数 ${currency.stabilityIndex}，乘数×${this.getCurrencyStabilityMultiplier().toFixed(2)}）`,
      `货币总量：${Math.round(currency.totalCirculation).toLocaleString()}`,
      `税率：${taxRate}%，基尼系数：${giniCoefficient.toFixed(2)}，难度：×${difficultyMultiplier.toFixed(2)}`,
    ]
    if (assets.length > 0) {
      lines.push(`资产：${assets.map((a) => `${a.name}(+${a.incomePerRound}/年)`).join('、')}`)
    }
    if (debts.length > 0) {
      lines.push(`债务：${debts.map((d) => `${d.name}(-${d.interestPerRound}/年，剩${d.remainingTerms}期)`).join('、')}`)
    }
    if (tradeRoutes.length > 0) {
      lines.push(`商路：${tradeRoutes.length}条（${tradeRoutes.slice(0, 3).map((r) => `${r.name}[${TRADE_ROUTE_STATUS_LABELS[r.status] ?? r.status}·繁荣${r.prosperity}]`).join('、')}）`)
      lines.push(`贸易乘数：×${this.getTradeIncomeMultiplier().toFixed(2)}`)
    }
    if (recentEvents.length > 0) {
      lines.push(`近期事件：${recentEvents.join('；')}`)
    }
    return lines.join('\n')
  }

  private getSummaryText(totalPopulation?: number): string {
    const marketPhase = MARKET_PHASE_LABELS[this.state.marketPhase]
    const wealth = this.state.currency.playerWealth
    const routes = this.state.tradeRoutes.length
    const tax = this.state.taxRate
    const assetCount = this.state.assets.length
    const debtCount = this.state.debts.length

    let text = `【${this.label}】市场：${marketPhase} · 财富：${Math.round(wealth)} · 商路：${routes}条 · 税率：${tax}%`
    if (assetCount > 0 || debtCount > 0) {
      text += ` · 资产${assetCount} · 债务${debtCount}`
    }

    if (totalPopulation !== undefined && totalPopulation > 0) {
      const totalEconomy = this.getTotalEconomy(totalPopulation)
      const scale = this.getEconomyScale(totalPopulation)
      text += ` · 经济总量：${Math.round(totalEconomy).toLocaleString()}（${scale}）`
    }

    return text
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    this._phaseElapsed = 0
    this._simYearAccumulator = 0
    this._lastKnownPopulation = undefined
  }
}
