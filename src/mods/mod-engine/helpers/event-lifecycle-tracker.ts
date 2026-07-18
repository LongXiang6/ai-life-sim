/**
 * @module event-lifecycle-tracker.ts
 * @description 事件生命周期追踪器 —— 检测 14 维度子系统显著变化，跟踪事件 new/ongoing/ending 状态并注入 AI Prompt
 * @mod mod-engine
 *
 * 来源：废案 orchestrator-v2.ts 的 buildEventInjectionText() + EventLifecycleTracker
 *
 * 功能：
 *   - 14 维度事件检测（10 宏观 + 4 角色驱动）
 *   - 宏观维度：市场/势力/气候/人口/生态/国家/贵族/贸易/文化/角色经济
 *   - 角色驱动维度：英雄陨落/道德引领/继承动荡/超凡入圣
 *   - 事件生命周期追踪（new → ongoing → ending，5 轮后清除）
 *   - 生成注入 AI Prompt 的事件文本
 */

// ============================================================
// 类型定义
// ============================================================

/** 系统事件通知（原始检测结果） */
export interface SystemEventNotice {
  eventType: string
  severity: number
  dataChange: string
  statusDesc: string,
}

/** 单条事件的生命周期记录 */
export interface EventLifecycleRecord {
  eventType: string
  firstSeenRound: number
  lastSeenRound: number
  consecutiveRounds: number
  peakSeverity: number
  peakDataChange: string
  status: 'new' | 'ongoing' | 'ending',
}

/** 事件生命周期追踪器（eventType → 生命周期记录） */
export type EventLifecycleTracker = Record<string, EventLifecycleRecord>

// ============================================================
// 子系统状态快照类型（检测所需字段）
// ============================================================

export interface DetectionStates {
  marketState?: { priceIndex?: number; inflationRate?: number; volatility?: number }
  factionState?: { factions?: Array<{ name: string; power: number }> }
  climateState?: { activeDisasters?: Array<{ type: string }> }
  populationState?: { total?: number; growthRate?: number; migrationDirection?: string; consecutiveDeclineYears?: number; consecutiveGrowthYears?: number }
  ecosystemState?: { biodiversity?: number; currentPhase?: string; overexploitationYears?: number }
  nationState?: { relations?: Array<{ status: string }> }
  nobleHouseState?: { houses?: Array<{ name: string; prosperity: number }> }
  tradeRouteState?: { globalTradeMultiplier?: number; routes?: Array<{ status?: string }> }
  cultureTechState?: { techProgress?: number; techLevel?: number; activeEvents?: string[] }
  economyState?: { currency?: Record<string, number>; debts?: Array<{ amount: number }> }
  // === 角色驱动事件字段（key 对应子系统 id） ===
  health?: { hp?: number; isDead?: boolean }
  morality?: { value?: number; level?: string }
  'combat-power'?: { mainStage?: number; powerValue?: number }
  lifespan?: { maxAge?: number }
  'character-base'?: { age?: number }
  reputation?: { fame?: number; globalReputation?: number }
  faith?: { devotionLevel?: number }
  luck?: { luck?: number }
}

// ============================================================
// 10 维度事件检测
// ============================================================

/** 恢复阈值（各事件类型对应的恢复条件） */
type RecoveryThresholds = Record<string, () => boolean>

/**
 * 从子系统状态中检测本轮显著事件
 * @returns 原始事件列表 + 恢复阈值配置
 */
function detectRawEvents(states: DetectionStates): {
  rawEvents: SystemEventNotice[]
  recoveryThresholds: RecoveryThresholds
} {
  const rawEvents: SystemEventNotice[] = []
  const thresholds: RecoveryThresholds = {}

  // 1. 市场事件
  const market = states.marketState
  if (market) {
    if ((market.priceIndex ?? 0) >= 150 && (market.priceIndex ?? 0) < 200) {
      rawEvents.push({ eventType: '市场动荡', severity: 0.4, dataChange: `物价指数${market.priceIndex}`, statusDesc: '物价持续上涨，市集交易冷清' })
      thresholds['市场动荡'] = () => (states.marketState?.priceIndex ?? 0) < 110
    } else if ((market.priceIndex ?? 0) >= 200) {
      rawEvents.push({ eventType: '市场崩溃', severity: 0.7, dataChange: `物价指数${market.priceIndex}`, statusDesc: '物价飙升，百姓买不起粮' })
      thresholds['市场崩溃'] = () => (states.marketState?.priceIndex ?? 0) < 150
    } else if ((market.priceIndex ?? 0) <= 60) {
      rawEvents.push({ eventType: '市场萧条', severity: 0.5, dataChange: `物价指数${market.priceIndex}`, statusDesc: '物价暴跌，商贩血本无归' })
      thresholds['市场萧条'] = () => (states.marketState?.priceIndex ?? 0) > 90
    }
    if ((market.inflationRate ?? 0) >= 0.15) {
      rawEvents.push({ eventType: '通货膨胀', severity: 0.5, dataChange: `通胀率${((market.inflationRate ?? 0) * 100).toFixed(0)}%`, statusDesc: '钱不值钱，物价一天一个样' })
      thresholds['通货膨胀'] = () => (states.marketState?.inflationRate ?? 0) < 0.08
    }
  }

  // 2. 势力事件
  const faction = states.factionState
  if (faction && faction.factions && faction.factions.length > 0) {
    const sorted = [...faction.factions].sort((a, b) => b.power - a.power)
    const topFaction = sorted[0]
    const bottomFaction = sorted[sorted.length - 1]
    if (topFaction && topFaction.power >= 80) {
      rawEvents.push({ eventType: '势力崛起', severity: 0.5, dataChange: `${topFaction.name}势力${topFaction.power}`, statusDesc: `${topFaction.name}如日中天，掌控大半资源` })
      thresholds['势力崛起'] = () => {
        const top = [...(states.factionState?.factions || [])].sort((a, b) => b.power - a.power)[0]
        return !top || top.power < 60
      }
    }
    if (bottomFaction && bottomFaction.power <= 15 && sorted.length >= 3) {
      rawEvents.push({ eventType: '势力衰落', severity: 0.4, dataChange: `${bottomFaction.name}势力${bottomFaction.power}`, statusDesc: `${bottomFaction.name}日薄西山，随时可能覆灭` })
      thresholds['势力衰落'] = () => {
        const bot = [...(states.factionState?.factions || [])].sort((a, b) => a.power - b.power)[0]
        return !bot || bot.power > 25
      }
    }
  }

  // 3. 气候事件
  const disasterLabels: Record<string, string> = { drought: '干旱', severe_winter: '严寒', flood: '洪涝', radiation_storm: '辐射风暴', heaven_drought: '天旱' }
  const climate = states.climateState
  if (climate && climate.activeDisasters && climate.activeDisasters.length > 0) {
    for (const d of climate.activeDisasters) {
      const label = disasterLabels[d.type] || '天灾'
      rawEvents.push({ eventType: label, severity: 0.6, dataChange: '持续中', statusDesc: '极端气候影响，民生艰难' })
      thresholds[label] = () => !(states.climateState?.activeDisasters || []).some((dd) => (disasterLabels[dd.type] || '天灾') === label)
    }
  }

  // 4. 人口事件
  const pop = states.populationState
  if (pop) {
    if (pop.migrationDirection === 'exodus' && (pop.consecutiveDeclineYears ?? 0) >= 2) {
      rawEvents.push({ eventType: '人口流失', severity: 0.4, dataChange: `连续${pop.consecutiveDeclineYears}年减少`, statusDesc: '大量居民逃离，街巷日渐空旷' })
      thresholds['人口流失'] = () => (states.populationState?.migrationDirection || 'neutral') !== 'exodus'
    } else if (pop.migrationDirection === 'influx' && (pop.consecutiveGrowthYears ?? 0) >= 3) {
      rawEvents.push({ eventType: '人口涌入', severity: 0.3, dataChange: `连续${pop.consecutiveGrowthYears}年增长`, statusDesc: '外来人口涌入，城镇日渐繁荣' })
      thresholds['人口涌入'] = () => (states.populationState?.migrationDirection || 'neutral') !== 'influx'
    }
  }

  // 5. 生态事件
  const eco = states.ecosystemState
  if (eco) {
    if (eco.currentPhase === 'collapse') {
      rawEvents.push({ eventType: '生态崩溃', severity: 0.8, dataChange: `生物多样性${eco.biodiversity}`, statusDesc: '森林消失，河川干涸，土地荒芜' })
      thresholds['生态崩溃'] = () => (states.ecosystemState?.currentPhase || 'stable') !== 'collapse' && (states.ecosystemState?.currentPhase || 'stable') !== 'declining'
    } else if (eco.currentPhase === 'declining') {
      rawEvents.push({ eventType: '生态恶化', severity: 0.5, dataChange: `生物多样性${eco.biodiversity}→趋势下降`, statusDesc: '森林退化，兽群南迁觅食' })
      thresholds['生态恶化'] = () => (states.ecosystemState?.currentPhase || 'stable') === 'stable' || (states.ecosystemState?.currentPhase || 'stable') === 'thriving'
    }
    if ((eco.overexploitationYears ?? 0) >= 3) {
      rawEvents.push({ eventType: '过度开发', severity: 0.4, dataChange: `已持续${eco.overexploitationYears}年`, statusDesc: '资源开采过度，自然恢复跟不上' })
      thresholds['过度开发'] = () => (states.ecosystemState?.overexploitationYears || 0) < 2
    }
  }

  // 6. 国家关系事件
  const nation = states.nationState
  if (nation) {
    const warRelations = nation.relations?.filter((r) => r.status === 'WAR') || []
    if (warRelations.length > 0) {
      rawEvents.push({ eventType: '边境冲突', severity: 0.7, dataChange: `${warRelations.length}条战线`, statusDesc: '烽火连天，征兵令下达至各城镇' })
      thresholds['边境冲突'] = () => (states.nationState?.relations || []).filter((r) => r.status === 'WAR').length === 0
    }
    const tensionRelations = nation.relations?.filter((r) => r.status === 'HOSTILE') || []
    if (tensionRelations.length >= 2) {
      rawEvents.push({ eventType: '国际紧张', severity: 0.4, dataChange: `${tensionRelations.length}国关系紧张`, statusDesc: '外交摩擦频发，贸易受限' })
      thresholds['国际紧张'] = () => (states.nationState?.relations || []).filter((r) => r.status === 'HOSTILE').length < 2
    }
  }

  // 7. 贵族家族事件
  const noble = states.nobleHouseState
  if (noble && noble.houses && noble.houses.length > 0) {
    const declining = noble.houses.filter((h) => h.prosperity < 20)
    if (declining.length >= 2) {
      rawEvents.push({ eventType: '世家没落', severity: 0.4, dataChange: `${declining.length}个家族衰落`, statusDesc: '老牌世家凋零，地方权力格局重组' })
      thresholds['世家没落'] = () => (states.nobleHouseState?.houses || []).filter((h) => h.prosperity < 20).length < 2
    }
    const rising = noble.houses.filter((h) => h.prosperity >= 80)
    if (rising.length > 0) {
      rawEvents.push({ eventType: '家族崛起', severity: 0.3, dataChange: `${rising[0].name}势力增强`, statusDesc: `${rising[0].name}声望日隆，门客络绎不绝` })
      thresholds['家族崛起'] = () => (states.nobleHouseState?.houses || []).filter((h) => h.prosperity >= 80).length === 0
    }
  }

  // 8. 贸易路线事件
  const trade = states.tradeRouteState
  if (trade) {
    if ((trade.globalTradeMultiplier ?? 1) <= 0.5) {
      rawEvents.push({ eventType: '贸易萎缩', severity: 0.5, dataChange: `贸易活跃度${((trade.globalTradeMultiplier ?? 1) * 100).toFixed(0)}%`, statusDesc: '商路受阻，货物短缺，物价上涨' })
      thresholds['贸易萎缩'] = () => (states.tradeRouteState?.globalTradeMultiplier ?? 1) > 0.7
    }
    const disruptedRoutes = trade.routes?.filter((r) => r.status === 'disrupted') || []
    if (disruptedRoutes.length > 0) {
      rawEvents.push({ eventType: '商路中断', severity: 0.5, dataChange: `${disruptedRoutes.length}条商路中断`, statusDesc: '重要商道被切断，货物无法流通' })
      thresholds['商路中断'] = () => (states.tradeRouteState?.routes || []).filter((r) => r.status === 'disrupted').length === 0
    }
  }

  // 9. 文化科技事件
  const culture = states.cultureTechState
  if (culture) {
    if ((culture.techProgress ?? 0) >= 90) {
      rawEvents.push({ eventType: '技术突破', severity: 0.5, dataChange: `科技进度${culture.techProgress}`, statusDesc: '一项重大技术即将改变世界' })
      thresholds['技术突破'] = () => (states.cultureTechState?.techProgress ?? 0) < 90
    }
    if (culture.activeEvents && culture.activeEvents.length > 0) {
      const recentEvent = culture.activeEvents[culture.activeEvents.length - 1]
      rawEvents.push({ eventType: '文化变革', severity: 0.3, dataChange: recentEvent || '新思潮涌动', statusDesc: '新思潮在人群中传播，旧观念受冲击' })
      thresholds['文化变革'] = () => (states.cultureTechState?.activeEvents?.length || 0) === 0
    }
  }

  // 10. 角色经济事件
  const roleEcon = states.economyState
  if (roleEcon) {
    const money = Number(roleEcon.currency?.['money'] ?? roleEcon.currency?.['金钱'] ?? 0)
    const debt = roleEcon.debts?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0
    if (debt > money && debt > 500) {
      rawEvents.push({ eventType: '债务危机', severity: 0.6, dataChange: `负债${debt} | 现金${money}`, statusDesc: '债台高筑，催债人随时可能上门' })
      thresholds['债务危机'] = () => {
        const m = Number(states.economyState?.currency?.['money'] ?? states.economyState?.currency?.['金钱'] ?? 0)
        const d = states.economyState?.debts?.reduce((sum, dd) => sum + (dd.amount || 0), 0) || 0
        return d <= m || d <= 500
      }
    }
  }

  // === 角色驱动事件维度（11-14） ===

  // 11. 英雄陨落 — HP 极低且具备一定战力时触发（蓝图: HP<20 且战力>50）
  const health = states.health
  const combatPower11 = states['combat-power']
  const hasCombatPower = (combatPower11?.mainStage ?? 0) >= 4  // mainStage ≥ 4 ≈ 战力>50
  if (health && !health.isDead && hasCombatPower) {
    if ((health.hp ?? 100) < 20) {
      rawEvents.push({
        eventType: '英雄陨落',
        severity: 0.7,
        dataChange: `HP ${health.hp} | 战力 ${combatPower11?.mainStage}阶`,
        statusDesc: '英雄气若游丝，命悬一线，天下震动',
      })
      thresholds['英雄陨落'] = () => (states.health?.hp ?? 100) >= 50
    }
  }

  // 12. 道德引领 — 极善或极恶时触发
  const morality = states.morality
  if (morality) {
    const moralValue = morality.value ?? 0
    if (moralValue > 80) {
      rawEvents.push({
        eventType: '道德引领',
        severity: 0.4,
        dataChange: `善恶值 ${moralValue}`,
        statusDesc: '大善之人的言行正在改变社会的道德风向',
      })
      thresholds['道德引领'] = () => Math.abs(states.morality?.value ?? 0) < 60
    } else if (moralValue < -80) {
      rawEvents.push({
        eventType: '道德引领',
        severity: 0.6,
        dataChange: `善恶值 ${moralValue}`,
        statusDesc: '极恶之人的所作所为让社会陷入恐慌和混乱',
      })
      thresholds['道德引领'] = () => Math.abs(states.morality?.value ?? 0) < 60
    }
  }

  // 13. 继承动荡 — HP 低且寿命将尽时触发
  const lifespan = states.lifespan
  const charBase = states['character-base']
  if (health && lifespan && charBase) {
    const hp = health.hp ?? 100
    const maxAge = lifespan.maxAge ?? 100
    const age = charBase.age ?? 0
    if (!health.isDead && hp < 30 && age > 0 && (maxAge - age) < 5) {
      rawEvents.push({
        eventType: '继承动荡',
        severity: 0.6,
        dataChange: `寿命剩余 ${maxAge - age} 年 | HP ${hp}`,
        statusDesc: '大限将至，各方势力蠢蠢欲动，继承权之争一触即发',
      })
      thresholds['继承动荡'] = () => {
        const h = states.health?.hp ?? 100
        const la = states.lifespan?.maxAge ?? 100
        const a = (states as Record<string, unknown>)['character-base'] as { age?: number } | undefined
        return h >= 50 || (la - (a?.age ?? 0)) >= 10
      }
    }
  }

  // 14. 超凡入圣 — 修炼至高阶或信仰极深时触发
  const combatPower = states['combat-power']
  const faith = states.faith
  if (combatPower || faith) {
    const mainStage = combatPower?.mainStage ?? 0
    const devotion = faith?.devotionLevel ?? 0
    if (mainStage >= 7 || devotion >= 90) {
      const source = mainStage >= 7 ? `修炼 ${mainStage} 阶` : `信仰 ${devotion}`
      rawEvents.push({
        eventType: '超凡入圣',
        severity: 0.5,
        dataChange: source,
        statusDesc: '超凡者的存在本身就在重塑天地的规则',
      })
      thresholds['超凡入圣'] = () => {
        const ms = states['combat-power']?.mainStage ?? 0
        const dv = states.faith?.devotionLevel ?? 0
        return ms < 5 && dv < 70
      }
    }
  }

  return { rawEvents, recoveryThresholds: thresholds }
}

// ============================================================
// 生命周期对比 + 注入文本生成
// ============================================================

/**
 * 对比本轮检测事件与上轮生命周期，生成注入 AI Prompt 的事件文本
 *
 * @param states 子系统状态快照
 * @param lastLifecycle 上轮生命周期追踪器
 * @param currentRound 当前回合数
 * @returns 注入文本 + 新生命周期追踪器
 */
export function buildEventInjectionText(
  states: DetectionStates,
  lastLifecycle?: EventLifecycleTracker,
  currentRound?: number,
): { eventInjectionText: string; newLifecycle: EventLifecycleTracker } {
  const round = currentRound ?? 0
  const { rawEvents, recoveryThresholds } = detectRawEvents(states)

  if (rawEvents.length === 0) {
    return { eventInjectionText: '', newLifecycle: lastLifecycle || {} }
  }

  const newLifecycle: EventLifecycleTracker = {}
  const prev = lastLifecycle || {}
  const injectedLines: string[] = []

  // 当前活跃事件类型集合
  const activeTypes = new Set(rawEvents.map((e) => e.eventType))

  // 1) 当前活跃事件：new / ongoing。所有达到明确触发阈值的事件都进入本轮组件；
  // 未达到阈值的状态不装载，已经触发的事实不得再按固定条数省略。
  rawEvents.sort((a, b) => b.severity - a.severity)

  rawEvents.forEach((e) => {
    const existing = prev[e.eventType]
    if (existing) {
      // 持续中
      const newRec: EventLifecycleRecord = {
        eventType: e.eventType,
        firstSeenRound: existing.firstSeenRound,
        lastSeenRound: round,
        consecutiveRounds: existing.consecutiveRounds + 1,
        peakSeverity: Math.max(existing.peakSeverity, e.severity),
        peakDataChange: e.severity >= existing.peakSeverity ? e.dataChange : existing.peakDataChange,
        status: 'ongoing',
      }
      newLifecycle[e.eventType] = newRec
      injectedLines.push(`  ${e.eventType}(持续第${newRec.consecutiveRounds}轮·${e.severity.toFixed(1)}) | ${e.dataChange} | ${e.statusDesc}`)
    } else {
      // 新发生
      const newRec: EventLifecycleRecord = {
        eventType: e.eventType,
        firstSeenRound: round,
        lastSeenRound: round,
        consecutiveRounds: 1,
        peakSeverity: e.severity,
        peakDataChange: e.dataChange,
        status: 'new',
      }
      newLifecycle[e.eventType] = newRec
      injectedLines.push(`  ${e.eventType}(新发生·${e.severity.toFixed(1)}) | ${e.dataChange} | ${e.statusDesc}`)
    }
  })

  // 2) 旧事件不再活跃 → ending
  for (const [eventType, record] of Object.entries(prev)) {
    if (record.status === 'ending') {
      const roundsSinceEnded = round - record.lastSeenRound
      if (roundsSinceEnded < 5) {
        newLifecycle[eventType] = record
        injectedLines.push(`  ${eventType}(已结束) | ${record.peakDataChange} | 事件影响逐渐消退`)
      }
      continue
    }
    if (activeTypes.has(eventType)) continue
    const recoveryFn = recoveryThresholds[eventType]
    if (!recoveryFn || recoveryFn()) {
      const endingRec: EventLifecycleRecord = { ...record, status: 'ending', lastSeenRound: round }
      newLifecycle[eventType] = endingRec
      const prevData = record.peakDataChange || '无数据'
      injectedLines.push(`  ${eventType}(已结束) | 此前${prevData} | 情况好转，事件影响逐渐消退`)
    } else {
      // 未达恢复阈值，保持 ongoing（悬挂状态）
      const hangRec: EventLifecycleRecord = { ...record, status: 'ongoing', lastSeenRound: round }
      newLifecycle[eventType] = hangRec
    }
  }

  if (injectedLines.length === 0) return { eventInjectionText: '', newLifecycle }

  injectedLines.unshift('【本轮系统事件】')
  return { eventInjectionText: injectedLines.join('\n'), newLifecycle }
}

