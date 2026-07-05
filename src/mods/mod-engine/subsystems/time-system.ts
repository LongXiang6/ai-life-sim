/**
 * @module time-system.ts
 * @description 时间子系统 —— 365天真实公历历法时间推进
 * @mod mod-engine
 *
 * 历法：12月真实公历分布（31/28/31/30/31/30/31/31/30/31/30/31） = 365天
 *
 * 季节推进流程：
 *   春(month 0-2, 90天) → 夏(month 3-5, 91天) → 秋(month 6-8, 92天) → 冬(month 9-11, 92天) → 春(下一年)
 *
 * 日期系统：
 *   day 0 表示每月第1天，day N-1 表示每月第N天
 *   dayOfYear 1-365：当年第几天
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { TimeStep, RoundInfo } from '../types'

import {
  CALENDAR,
  DEFAULT_ENGINE_CONFIG,
  SEASONS,
  SEASON_NAMES,
  MONTH_ZH,
  ERA_SPAN,
  ERA_NAME_POOL,
  REIGN_TITLES,
  REIGN_DURATION,
} from '../constants'

/** 根据绝对年份推算纪元/年号信息（无限世代） */
function resolveDisplayEra(year: number): Pick<RoundInfo, 'eraName' | 'eraYear' | 'reignTitle' | 'reignYear'> {
  // year 从 1 开始推算（year=0 为出生年，无纪元信息，fallback 到 year=1）
  const safeYear = Math.max(1, year)
  const eraIndex = Math.max(0, Math.floor((safeYear - 1) / ERA_SPAN))
  const eraName = ERA_NAME_POOL[eraIndex % ERA_NAME_POOL.length]
  const eraStartYear = eraIndex * ERA_SPAN
  const eraYear = safeYear - eraStartYear

  const reignIndex = Math.floor((safeYear - 1) / REIGN_DURATION) % REIGN_TITLES.length
  const reignTitle = REIGN_TITLES[reignIndex]
  const reignYear = ((safeYear - 1) % REIGN_DURATION) + 1

  return { eraName, eraYear, reignTitle, reignYear }
}

/** 初始回合（year=0 为出生年，首次 advance 后 year=1 对应 0岁） */
function createInitialRound(): RoundInfo {
  return {
    year: 0,
    season: SEASONS.SPRING,
    month: 0,
    day: 0,
    dayOfYear: 1,
    totalDays: 0,
    ...resolveDisplayEra(0),
  }
}

function createDefaultTimeStep(): TimeStep {
  return { ...DEFAULT_ENGINE_CONFIG.timeStep }
}

function normalizeTimeStep(step: Partial<TimeStep> | undefined): TimeStep {
  const rawValue = typeof step?.value === 'number' ? step.value : Number(step?.value)
  const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 1

  switch (step?.unit) {
    case 'day':
    case 'month':
    case 'season':
    case 'year':
      return { unit: step.unit, value }
    default:
      return createDefaultTimeStep()
  }
}

const TIME_STEP_UNIT_ORDER: Record<TimeStep['unit'], number> = {
  day: 0,
  month: 1,
  season: 2,
  year: 3,
}

/** 粗粒度切到细粒度时，下一轮应从已叙事周期之后开始。 */
export function shouldAlignTimeStepTransition(
  prevUnit: TimeStep['unit'],
  newUnit: TimeStep['unit'],
): boolean {
  return TIME_STEP_UNIT_ORDER[prevUnit] > TIME_STEP_UNIT_ORDER[newUnit]
}

/**
 * 周期边界对齐（纯函数，无副作用）。
 *
 * 注意：玩家交互式切换 timeStep 本身不调用该函数。若已经存在上一轮叙事，
 * 下一次 advance 可调用该对齐逻辑；开局切换步长不会被动跳过时间。
 *
 * 当从粗粒度切换到细粒度时，粗粒度的叙事已覆盖当前整个周期，
 * 细粒度应从下一个粗周期开始，避免时间倒流到已叙事过的时段。
 *
 * @returns 对齐后的新 RoundInfo（不修改入参 round）
 */
export function alignRoundToNextPeriod(
  prevUnit: TimeStep['unit'],
  newUnit: TimeStep['unit'],
  round: RoundInfo,
): RoundInfo {
  // 粗→细才需要对齐；细→粗或同级不做额外跳转
  if (!shouldAlignTimeStepTransition(prevUnit, newUnit)) {
    return { ...round }
  }

  // 计算基础 totalDays：当前 totalDays + 已覆盖周期的天数
  let { year, season, month, day, dayOfYear, totalDays } = round

  switch (prevUnit) {
    case 'year': {
      // 年叙事已覆盖全年 → 跳到下一年春天
      totalDays += CALENDAR.DAYS_PER_YEAR
      year++
      season = SEASONS.SPRING
      month = 0
      day = 0
      dayOfYear = 1
      break
    }
    case 'season': {
      // 季叙事已覆盖整季 → 跳到下一季第一天
      const startMonth = season * CALENDAR.MONTHS_PER_SEASON
      let seasonDays = 0
      for (let i = 0; i < CALENDAR.MONTHS_PER_SEASON; i++) {
        seasonDays += CALENDAR.DAYS_IN_MONTH[startMonth + i]
      }
      totalDays += seasonDays
      season = (season + 1) % CALENDAR.SEASONS_PER_YEAR
      if (season === 0) year++
      month = season * CALENDAR.MONTHS_PER_SEASON
      day = 0
      // 反算 dayOfYear
      dayOfYear = 1
      for (let m = 0; m < month; m++) {
        dayOfYear += CALENDAR.DAYS_IN_MONTH[m]
      }
      break
    }
    case 'month': {
      // 月叙事已覆盖整月 → 跳到下个月第一天
      totalDays += CALENDAR.DAYS_IN_MONTH[month]
      month++
      if (month >= CALENDAR.MONTHS_PER_YEAR) {
        month = 0
        year++
        dayOfYear = 1
      } else {
        dayOfYear += CALENDAR.DAYS_IN_MONTH[month - 1]
      }
      day = 0
      season = Math.floor(month / CALENDAR.MONTHS_PER_SEASON)
      break
    }
  }

  const era = resolveDisplayEra(year)
  return { year, season, month, day, dayOfYear, totalDays, ...era }
}

export class TimeSystem implements ISubSystem {
  readonly id = 'time' as const
  readonly mod = 'mod-engine' as const
  readonly label = '时间系统' as const
  readonly description = '365天真实公历历法时间推进（12月不均等分布）' as const

  private round: RoundInfo = createInitialRound()
  private timeStep: TimeStep = createDefaultTimeStep()

  /**
   * 本轮推进的天数增量（最近一次 advance/skipYears 使 totalDays 增加的量）。
   * 由 orchestrator 注入 RoundContext.daysPassed 供子系统读取（唯一时间增量源）。
   */
  private lastDaysPassed = 0

  getRound(): RoundInfo {
    return { ...this.round }
  }

  /** 本轮推进天数（最近一次 advance/skipYears 的 totalDays 增量，供 RoundContext.daysPassed 使用） */
  getDaysPassed(): number {
    return this.lastDaysPassed
  }

  /** 设置叙事推进步长。切换本身不推进时间，只影响下一次 advance。 */
  setTimeStep(step: TimeStep): void {
    this.timeStep = normalizeTimeStep(step)
  }

  /**
   * 将当前 round 对齐到上一轮粗粒度叙事覆盖周期之后。
   * 用于“年→季 / 季→月 / 月→日”等粗到细切换后的下一次推进。
   */
  alignToNextPeriod(prevUnit: TimeStep['unit'], newUnit: TimeStep['unit']): RoundInfo {
    const beforeTotalDays = this.round.totalDays
    const aligned = alignRoundToNextPeriod(prevUnit, newUnit, this.round)

    this.round = structuredClone(aligned)
    this.lastDaysPassed = aligned.totalDays - beforeTotalDays
    this.syncEraFields()

    if (aligned.totalDays <= beforeTotalDays) {
      console.error(
        `[TimeSystem] 对齐后 totalDays 未递增! ${beforeTotalDays} → ${aligned.totalDays} (transition=${prevUnit}->${newUnit})`,
      )
    }

    return this.getRound()
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
    const added = n * CALENDAR.DAYS_PER_YEAR
    this.round.totalDays += added
    this.lastDaysPassed = added
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
    const beforeTotalDays = this.round.totalDays

    let result: RoundInfo
    switch (this.timeStep.unit) {
      case 'day':
        result = this.advanceDays(this.timeStep.value)
        break
      case 'month':
        result = this.advanceMonths(this.timeStep.value)
        break
      case 'season':
        result = this.advanceSeasons(this.timeStep.value)
        break
      case 'year':
        result = this.advanceYears(this.timeStep.value)
        break
    }

    // 本轮天数增量（供 RoundContext.daysPassed）
    this.lastDaysPassed = result.totalDays - beforeTotalDays

    // 单调性安全网：推进后 totalDays 必须严格递增
    if (result.totalDays <= beforeTotalDays) {
      console.error(
        `[TimeSystem] totalDays 未递增! ${beforeTotalDays} → ${result.totalDays} (step=${this.timeStep.unit}:${this.timeStep.value})`,
      )
    }
    return result
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
    r.totalDays++

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
    r.totalDays += daysInCurrentMonth

    // 绝对天数：从 epoch 起点（year=0, day=1）开始计数（0-based）
    const totalDays = r.year * CALENDAR.DAYS_PER_YEAR + r.dayOfYear - 1

    // 推进当前月的实际天数
    const newTotal = totalDays + daysInCurrentMonth

    // 从绝对天数反算年份和年内天数
    r.year = Math.floor(newTotal / CALENDAR.DAYS_PER_YEAR)
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

  private getContinuousMonthDays(startMonth: number, monthCount: number): number {
    let days = 0
    for (let i = 0; i < monthCount; i++) {
      const month = (startMonth + i) % CALENDAR.MONTHS_PER_YEAR
      days += CALENDAR.DAYS_IN_MONTH[month]
    }
    return days
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

    // 季/季度推进：从当前月份起连续推进 3 个真实月份，不按固定春夏秋冬边界回跳。
    const seasonDays = this.getContinuousMonthDays(r.month, CALENDAR.MONTHS_PER_SEASON)
    const currentAbsoluteDay = r.year * CALENDAR.DAYS_PER_YEAR + r.dayOfYear - 1
    const newAbsoluteDay = currentAbsoluteDay + seasonDays

    r.totalDays = newAbsoluteDay
    r.year = Math.floor(newAbsoluteDay / CALENDAR.DAYS_PER_YEAR)
    r.dayOfYear = (newAbsoluteDay % CALENDAR.DAYS_PER_YEAR) + 1
    this.applyDayOfYearToRound(r)
    this.syncEraFields()

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
      this.round.totalDays += CALENDAR.DAYS_PER_YEAR
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
    const summary = `【${this.label}】${r.eraName}${r.eraYear}年（${r.reignTitle}${r.reignYear}年）${this.getSeasonName()}季 ${monthName} 第${r.day + 1}日`
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
      this.setTimeStep(c.timeStep as unknown as TimeStep)
    }
  }

  reset(): void {
    this.round = createInitialRound()
    this.timeStep = createDefaultTimeStep()
    this.lastDaysPassed = 0
  }

  /** 导出当前历法状态（预生成快照用） */
  exportRound(): RoundInfo {
    return structuredClone(this.round)
  }

  /** 恢复历法状态（预生成快照用）。快照恢复不算一次推进，daysPassed 归零。 */
  importRound(round: RoundInfo): void {
    this.round = structuredClone(round)
    this.lastDaysPassed = 0
    this.syncEraFields()
  }
}

/** 单例 */
export const timeSystem = new TimeSystem()
