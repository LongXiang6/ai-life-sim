/**
 * @module time-system.ts
 * @description 时间子系统 —— 365天真实公历历法时间推进
 * @mod mod-engine
 *
 * 历法：12月真实公历分布（31/28/31/30/31/30/31/31/30/31/30/31） = 365天
 *
 * 季节推进流程：
 *   春(month 0-2, 90天) → 夏(month 3-5, 92天) → 秋(month 6-8, 92天) → 冬(month 9-11, 92天) → 春(下一年)
 *
 * 日期系统：
 *   day 0 表示每月第1天，day N-1 表示每月第N天
 *   dayOfYear 1-365：当年第几天
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { TimeStep, RoundInfo } from '../types'

import { CALENDAR, SEASONS, SEASON_NAMES, MONTH_ZH, ERA_SPAN, ERA_NAME_POOL, REIGN_TITLES, REIGN_DURATION } from '../constants'

/** 根据绝对年份推算纪元/年号信息（无限世代） */
function resolveDisplayEra(year: number): Pick<RoundInfo, 'eraName' | 'eraYear' | 'reignTitle' | 'reignYear'> {
  const eraIndex = Math.max(0, Math.floor((year - 1) / ERA_SPAN))
  const eraName = ERA_NAME_POOL[eraIndex % ERA_NAME_POOL.length]
  const eraStartYear = eraIndex * ERA_SPAN
  const eraYear = year - eraStartYear

  const reignIndex = Math.floor((year - 1) / REIGN_DURATION) % REIGN_TITLES.length
  const reignTitle = REIGN_TITLES[reignIndex]
  const reignYear = ((year - 1) % REIGN_DURATION) + 1

  return { eraName, eraYear, reignTitle, reignYear }
}

/** 初始回合 */
function createInitialRound(): RoundInfo {
  return {
    year: 1,
    season: SEASONS.SPRING,
    month: 0,
    day: 0,
    dayOfYear: 1,
    ...resolveDisplayEra(1),
  }
}

export class TimeSystem implements ISubSystem {
  readonly id = 'time' as const
  readonly mod = 'mod-engine' as const
  readonly label = '时间系统' as const
  readonly description = '365天真实公历历法时间推进（12月不均等分布）' as const

  private round: RoundInfo = createInitialRound()
  private timeStep: TimeStep = { unit: 'month', value: 1 }

  getRound(): RoundInfo {
    return { ...this.round }
  }

  setTimeStep(step: TimeStep): void {
    this.timeStep = step
  }

  getSeasonName(): string {
    return SEASON_NAMES[this.round.season]
  }

  /**
   * 公共 API：根据绝对年份推算纪元名称、纪元内年数、年号、年号内年数
   * 可在外部直接调用（如用于 YearEvent 构建）
   */
  static resolveDisplayEra(year: number): Pick<RoundInfo, 'eraName' | 'eraYear' | 'reignTitle' | 'reignYear'> {
    return resolveDisplayEra(year)
  }

  /**
   * 同步纪元/年号字段到当前 round（每次 year 变化后调用）
   */
  private syncEraFields(): void {
    const era = resolveDisplayEra(this.round.year)
    this.round.eraName = era.eraName
    this.round.eraYear = era.eraYear
    this.round.reignTitle = era.reignTitle
    this.round.reignYear = era.reignYear
  }

  /**
   * 时间快进：跳过 N 年到春天第一天
   * 用于 AI 叙事中的"十年后"类场景——一次调用完成跳跃，无需循环
   * 来源：废案 calendar.ts 的 timeSkipYears 功能
   */
  skipYears(n: number): RoundInfo {
    this.round.year += n
    this.round.season = SEASONS.SPRING
    this.round.month = 0
    this.round.day = 0
    this.round.dayOfYear = 1
    this.syncEraFields()
    return this.getRound()
  }

  /**
   * 推进时间
   * 返回新回合信息
   *
   * 支持的时间步长（对齐废弃项目 E12）：
   *   日步进：day × 1
   *   月步进：month × 1
   *   季步进：season × 1
   *   年步进：year × 1/3/5/10/50/100/200/500/1000
   */
  advance(): RoundInfo {
    switch (this.timeStep.unit) {
      case 'day': return this.advanceDays(this.timeStep.value)
      case 'month': return this.advanceMonths(this.timeStep.value)
      case 'season': return this.advanceSeasons(this.timeStep.value)
      case 'year': return this.advanceYears(this.timeStep.value)
    }
  }

  // === 日推进 ===

  /**
   * 日推进：推进指定天数
   */
  private advanceDays(count: number): RoundInfo {
    for (let i = 0; i < count; i++) {
      this.advanceOneDay()
    }
    return this.getRound()
  }

  private advanceOneDay(): RoundInfo {
    const r = this.round

    // 月末判断：当月最后一天
    const daysInCurrentMonth = CALENDAR.DAYS_IN_MONTH[r.month]
    if (r.day >= daysInCurrentMonth - 1) {
      r.day = 0
      r.month++
      // 年末判断：12月最后一天
      if (r.month >= CALENDAR.MONTHS_PER_YEAR) {
        r.month = 0
        r.year++
        r.dayOfYear = 1
        this.syncEraFields()
        r.season = 0 // 春天
        return this.getRound()
      }
    } else {
      r.day++
    }
    r.dayOfYear++
    r.season = Math.floor(r.month / CALENDAR.MONTHS_PER_SEASON)
    return this.getRound()
  }

  // === 月推进 ===

  /**
   * 月推进：推进指定月数
   */
  private advanceMonths(count: number): RoundInfo {
    for (let i = 0; i < count; i++) {
      this.advanceOneMonth()
    }
    return this.getRound()
  }

  private advanceOneMonth(): RoundInfo {
    const r = this.round

    // 当前月天数
    const daysInCurrentMonth = CALENDAR.DAYS_IN_MONTH[r.month]

    // 绝对天数：从第 1 年第 1 天开始计数（0-based）
    const totalDays = (r.year - 1) * CALENDAR.DAYS_PER_YEAR + r.dayOfYear - 1

    // 推进当前月的实际天数
    const newTotal = totalDays + daysInCurrentMonth

    // 从绝对天数反算年份和年内天数
    r.year = Math.floor(newTotal / CALENDAR.DAYS_PER_YEAR) + 1
    r.dayOfYear = (newTotal % CALENDAR.DAYS_PER_YEAR) + 1

    this.applyDayOfYearToRound(r)
    this.syncEraFields()
    return this.getRound()
  }

  /**
   * 根据 dayOfYear（1-365）同步 month/day/season
   * 按每月实际天数累计定位。
   */
  private applyDayOfYearToRound(r: RoundInfo): void {
    let remaining = r.dayOfYear - 1 // 0-based

    for (let m = 0; m < CALENDAR.MONTHS_PER_YEAR; m++) {
      const dim = CALENDAR.DAYS_IN_MONTH[m]
      if (remaining < dim) {
        r.month = m
        r.day = remaining
        r.season = Math.floor(m / CALENDAR.MONTHS_PER_SEASON)
        return
      }
      remaining -= dim
    }
  }

  // === 季推进 ===

  /**
   * 季推进：推进指定季数
   */
  private advanceSeasons(count: number): RoundInfo {
    for (let i = 0; i < count; i++) {
      this.advanceOneSeason()
    }
    return this.getRound()
  }

  private advanceOneSeason(): RoundInfo {
    const r = this.round

    // 当前季三个月的实际天数之和
    const startMonth = r.season * CALENDAR.MONTHS_PER_SEASON
    let seasonDays = 0
    for (let i = 0; i < CALENDAR.MONTHS_PER_SEASON; i++) {
      seasonDays += CALENDAR.DAYS_IN_MONTH[startMonth + i]
    }

    const oldSeason = r.season
    r.season = (r.season + 1) % CALENDAR.SEASONS_PER_YEAR
    r.dayOfYear += seasonDays

    // 是否触发新年
    if (r.season <= oldSeason) {
      // 从冬→春，跨年了
      r.year++
      r.dayOfYear = 1
      this.syncEraFields()
    }

    // 计算日和月：新季节从该季第一个月第 0 天开始
    r.month = r.season * CALENDAR.MONTHS_PER_SEASON
    r.day = 0

    return this.getRound()
  }

  // === 年推进（支持多年跨越） ===

  /**
   * 年推进：推进指定年数（支持 1/3/5/10/50/100/200/500/1000 年）
   *
   * 多年跨越时，每年仍会推进经济系统和人口系统的计算，
   * 但只在最后一年生成叙事 Prompt（中间年份使用快速推演）。
   */
  private advanceYears(count: number): RoundInfo {
    for (let i = 0; i < count; i++) {
      this.round.year++
      this.round.season = SEASONS.SPRING
      this.round.month = 0
      this.round.day = 0
      this.round.dayOfYear = 1
    }
    this.syncEraFields()
    return this.getRound()
  }

  // === ISubSystem 实现 ===

  collectState(_context: RoundContext): SubSystemState {
    const r = this.round
    const monthName = MONTH_ZH[r.month]
    const summary = `${r.eraName}${r.eraYear}年（${r.reignTitle}${r.reignYear}年）${this.getSeasonName()}季 ${monthName} 第${r.day + 1}日`
    return {
      id: this.id,
      summary,
      data: structuredClone({
        round: this.round,
        timeStep: this.timeStep,
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
    if (c.round) {
      Object.assign(this.round, c.round)
      this.syncEraFields()
    }
    if (c.timeStep) {
      this.timeStep = c.timeStep as unknown as TimeStep
    }
  }

  reset(): void {
    this.round = createInitialRound()
    this.timeStep = { unit: 'month', value: 1 }
  }

  /** 导出当前历法状态（预生成快照用） */
  exportRound(): RoundInfo {
    return structuredClone(this.round)
  }

  /** 恢复历法状态（预生成快照用） */
  importRound(round: RoundInfo): void {
    this.round = structuredClone(round)
    this.syncEraFields()
  }
}

/** 单例 */
export const timeSystem = new TimeSystem()
