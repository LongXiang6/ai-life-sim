/**
 * @module EraSystem
 * @description 纪元子系统 —— 二分查找定位时代 + 四阶段判定（opening/mid/late/transition）+ AI 术语适配 + 世界观差异化提示文本 + 纪元回望 + 更替事件
 * @mod mod-base-universe
 */

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import type { EraEntry, EraState, EraPhase, EraHints, } from '../types'

import {
  ERA_OPENING_YEARS,
  ERA_TRANSITION_YEARS,
  ERA_LATE_RATIO,
  ERA_DEFAULT_SPAN,
  ERA_HINTS_ANCIENT,
  ERA_HINTS_BY_WORLDVIEW,
} from '../constants'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

/** 纯判定结果——无副作用，可直接单元测试 */
export interface EraAdvanceResult {
  currentEraName: string
  currentEraStart: number
  yearsIntoEra: number
  nextEraName: string | null
  yearsUntilNext: number | null
  phase: EraPhase
  hint: string,
}

export class EraSystem implements ISubSystem {
  readonly id = 'era' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '纪元' as const
  readonly description = '根据纪元时间线定位当前时代，判定阶段并生成差异化提示文本' as const

  private _state: EraState = {
    currentEraName: '蛮荒时代',
    currentEraStart: 0,
    yearsIntoEra: 0,
    nextEraName: null,
    yearsUntilNext: null,
    phase: 'opening',
    hint: '蛮荒时代元年初立',
    history: [{ name: '蛮荒时代', startAnchorYear: 0, endedYear: null, }],
    speedMultiplier: 1,
  }

  /** AI 适配的提示文本（覆盖默认） */
  private _adaptedHints: EraHints | null = null

  /** 上一回合的纪元名（用于检测纪元更替） */
  private _previousEraName = '蛮荒时代'

  /** 是否使用日历纪年摘要（现代/西幻等无 timeline 时） */
  private _calendarEraMode = false

  collectState(context: RoundContext,): SubSystemState {
    this._determineEra(context,)

    return {
      id: this.id,
      summary: this._buildSummary(),
      data: {
        ...structuredClone(this._state as unknown as Record<string, unknown>,),
        eraTransitioned: this._state.currentEraName !== this._previousEraName,
      },
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext,): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`,)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch: expected ${this.id}, got ${changes.id}`,)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes,)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`,)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`,)
    }

    const c = changes.changes

    // AI 接触点：时代术语适配
    if (c.adaptationType === 'era-terms' && Array.isArray(c.hints,) && c.hints.length === 5) {
      const [opening, mid, late, transition, transition_no_next,] = c.hints as string[]
      this._adaptedHints = { opening, mid, late, transition, transition_no_next, }
      this._state.hint = this._buildHint(this._state.currentEraName, this._state.nextEraName,)
    } else {
      // 直接控制：时间线覆盖
      if (c.timelineOverride && Array.isArray(c.timelineOverride,)) {
        this._state = {
          ...this._state,
          currentEraName: String((c.timelineOverride as EraEntry[])[0]?.name || this._state.currentEraName,),
          currentEraStart: Number((c.timelineOverride as EraEntry[])[0]?.startAnchorYear || this._state.currentEraStart,),
        }
      }
      if (typeof c.viewOverride === 'string') {
        this._adaptedHints = null
      }
      // 纪元速度控制
      if (typeof c.speedMultiplier === 'number' && c.speedMultiplier > 0) {
        this._state.speedMultiplier = c.speedMultiplier
      }
    }
  }

  reset(): void {
    this._state = {
      currentEraName: '蛮荒时代',
      currentEraStart: 0,
      yearsIntoEra: 0,
      nextEraName: null,
      yearsUntilNext: null,
      phase: 'opening',
      hint: '蛮荒时代元年初立',
      history: [{ name: '蛮荒时代', startAnchorYear: 0, endedYear: null, }],
      speedMultiplier: 1,
    }
    this._adaptedHints = null
    this._previousEraName = '蛮荒时代'
  }

  // ============================================================
  // 公共 API
  // ============================================================

  /** 将纪元状态格式化为 AI 可消费的叙事文本（含纪元回望） */
  formatForPrompt(context?: RoundContext,): string {
    if (context) this._determineEra(context,)

    const s = this._state
    const phaseLabel: Record<EraPhase, string> = {
      opening: '开国期',
      mid: '盛期',
      late: '末期',
      transition: '更替期',
    }
    let text = `【纪元】当前为${s.currentEraName}（开国第 ${s.yearsIntoEra} 年），处于${phaseLabel[s.phase]}。${s.hint}`

    if (s.nextEraName) {
      text += ` 下一纪元「${s.nextEraName}」将在 ${s.yearsUntilNext} 年后到来。`
    } else {
      text += ' 这是时间线上的最终纪元。'
    }

    // 纪元回望
    const pastEras = s.history.filter(h => h.endedYear !== null,)
    if (pastEras.length > 0) {
      text += ` 已历纪元：${pastEras.map(h => `${h.name}（${h.startAnchorYear}-${h.endedYear}年）`,).join(' → ',)}。`
    }

    return text
  }

  // ============================================================
  // 纯函数（独立可测试）
  // ============================================================

  /** 纯判定：根据时间线和年份计算纪元状态（无副作用，不依赖实例状态） */
  static _pureAdvance(timeline: EraEntry[], eraYear: number, hints: EraHints,): EraAdvanceResult {
    // 二分查找定位
    const index = EraSystem._binarySearchEra(timeline, eraYear,)
    const entry = timeline[index]
    const yearsIntoEra = eraYear - entry.startAnchorYear
    const nextEntry = timeline[index + 1] || null
    const totalSpan = nextEntry
      ? nextEntry.startAnchorYear - entry.startAnchorYear
      : ERA_DEFAULT_SPAN
    const yearsUntilNext = nextEntry
      ? nextEntry.startAnchorYear - eraYear
      : null
    const phase = EraSystem._determinePhase(yearsIntoEra, yearsUntilNext, totalSpan,)
    const hint = EraSystem._buildPureHint(
      entry.name,
      nextEntry?.name ?? null,
      phase,
      hints,
    )

    return {
      currentEraName: entry.name,
      currentEraStart: entry.startAnchorYear,
      yearsIntoEra,
      nextEraName: nextEntry?.name ?? null,
      yearsUntilNext,
      phase,
      hint,
    }
  }

  /** 纯函数：二分查找 startAnchorYear <= eraYear 的最大索引 */
  static _binarySearchEra(timeline: readonly EraEntry[], eraYear: number,): number {
    let low = 0
    let high = timeline.length - 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2,)
      if (timeline[mid].startAnchorYear <= eraYear) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return Math.max(0, high,)
  }

  /** 纯函数：四阶段判定 */
  static _determinePhase(
    yearsIntoEra: number,
    yearsUntilNext: number | null,
    totalSpan: number,
  ): EraPhase {
    if (yearsIntoEra <= ERA_OPENING_YEARS) return 'opening'
    if (yearsUntilNext !== null && yearsUntilNext <= ERA_TRANSITION_YEARS) return 'transition'
    if (yearsIntoEra >= totalSpan * ERA_LATE_RATIO) return 'late'
    return 'mid'
  }

  /** 纯函数：根据阶段和提示模板构建提示文本 */
  static _buildPureHint(
    eraName: string,
    nextName: string | null,
    phase: EraPhase,
    hints: EraHints,
  ): string {
    let text: string
    if (phase === 'transition' && nextName === null) {
      text = hints.transition_no_next
    } else {
      text = hints[phase]
    }
    text = text.replace('{name}', eraName,)
    if (nextName) {
      text = text.replace('{current}', eraName,).replace('{next}', nextName,)
    }
    return text
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /** 判定纪元状态（数据提取 + 纯判定 + 副作用写入） */
  private _determineEra(context: RoundContext,): void {
    const timeline = this._getTimeline(context,)
    const calendarMode = this._isCalendarAnchoredWorld(context)

    if (timeline.length === 0) {
      this._calendarEraMode = calendarMode
      if (calendarMode && (context.eraStartYear ?? 0) !== 0) {
        const calendarYear = (context.birthEraYear ?? context.eraStartYear ?? 0)
          + Math.max(0, context.round.year - 1)
        Object.assign(this._state, {
          currentEraName: `${calendarYear}年`,
          currentEraStart: context.eraStartYear ?? 0,
          yearsIntoEra: Math.max(0, context.round.year - 1),
          nextEraName: null,
          yearsUntilNext: null,
          phase: 'mid' as EraPhase,
          hint: `当前纪年${calendarYear}年`,
        })
      }
      return
    }

    this._calendarEraMode = false
    const eraYear = context.eraStartYear && context.eraStartYear !== 0
      ? (context.birthEraYear ?? context.eraStartYear) + Math.max(0, context.round.year - 1)
      : context.round.year

    const worldview = this._getWorldview(context,)
    const hintKey = resolveStaticPoolWorldviewKey(worldview)
    const hints = this._adaptedHints ?? ERA_HINTS_BY_WORLDVIEW[hintKey] ?? ERA_HINTS_ANCIENT

    const result = EraSystem._pureAdvance(timeline, eraYear, hints,)

    // 检测纪元更替
    if (result.currentEraName !== this._previousEraName) {
      this._onEraTransition(this._previousEraName, result.currentEraName, result.currentEraStart, eraYear,)
    }

    // 写入状态
    Object.assign(this._state, {
      currentEraName: result.currentEraName,
      currentEraStart: result.currentEraStart,
      yearsIntoEra: result.yearsIntoEra,
      nextEraName: result.nextEraName,
      yearsUntilNext: result.yearsUntilNext,
      phase: result.phase,
      hint: result.hint,
    },)
  }

  /** 获取时间线（含排序防御） */
  private _getTimeline(context: RoundContext,): EraEntry[] {
    const worldTimeline = context.subsystemStates['world-timeline']
    if (
      worldTimeline?.data
      && Array.isArray((worldTimeline.data as Record<string, unknown>).timeline,)
    ) {
      // 副本排序：防御世界时间线数据乱序
      const timeline = (worldTimeline.data as Record<string, unknown>).timeline as EraEntry[]
      return [...timeline,].sort((a, b,) => a.startAnchorYear - b.startAnchorYear,)
    }
    return []
  }

  /** 现代/西幻等：有锚定年且无修仙 timeline 时走日历纪年 */
  private _isCalendarAnchoredWorld(context: RoundContext): boolean {
    if ((context.eraStartYear ?? 0) === 0) return false
    const tag = (context.essenceTag ?? '').toLowerCase()
    if (!tag) return true
    const calendarTags = ['modern', 'western-fantasy', 'westernfantasy', 'scifi', 'mixed', 'idealist']
    return calendarTags.some((t) => tag.includes(t))
  }

  /** 获取世界观（从 world-init 子系统） */
  private _getWorldview(context: RoundContext,): string {
    const worldInit = context.subsystemStates['world-init']
    if (worldInit?.data && typeof (worldInit.data as Record<string, unknown>).worldview === 'string') {
      return (worldInit.data as Record<string, unknown>).worldview as string
    }
    return 'default'
  }

  /** 实例方法版 buildHint（复用纯函数） */
  private _buildHint(eraName: string, nextName: string | null,): string {
    const hints = this._getHints()
    return EraSystem._buildPureHint(eraName, nextName, this._state.phase, hints,)
  }

  /** 获取提示文本（AI 适配优先 → 世界观匹配 → 默认古代） */
  private _getHints(): EraHints {
    if (this._adaptedHints) return this._adaptedHints
    // worldview 选择由 _determineEra 在调用 _pureAdvance 时已完成；
    // 此方法作为 fallback 供 _buildHint 在 applyChanges 中调用
    return ERA_HINTS_ANCIENT
  }

  /** 纪元更替处理：更新历史 + 生成更替事件 */
  private _onEraTransition(
    oldName: string,
    newName: string,
    newStartYear: number,
    _eraYear: number,
  ): void {
    // 关上前一纪元
    const prevEntry = this._state.history.find(h => h.name === oldName && h.endedYear === null,)
    if (prevEntry) {
      prevEntry.endedYear = newStartYear - 1
    }

    // 记录新纪元
    this._state.history.push({
      name: newName,
      startAnchorYear: newStartYear,
      endedYear: null,
    },)

    // 限制历史长度（保留最近 20 条）
    if (this._state.history.length > 20) {
      this._state.history = this._state.history.slice(-20,)
    }

    this._previousEraName = newName
  }

  private _buildSummary(): string {
    const s = this._state
    if (this._calendarEraMode) {
      return `【纪元】${s.currentEraName} | ${s.hint}`
    }
    const phaseLabel: Record<EraPhase, string> = {
      opening: '开国期',
      mid: '盛期',
      late: '末期',
      transition: '更替期',
    }
    let summary = `【纪元】${s.currentEraName}（开国第 ${s.yearsIntoEra} 年）`
    if (s.nextEraName) {
      summary += ` | 距下一纪元"${s.nextEraName}"还有 ${s.yearsUntilNext} 年`
    }
    summary += ` | 阶段：${phaseLabel[s.phase]}`
    if (s.speedMultiplier !== 1) {
      summary += ` | 速度：${s.speedMultiplier}×`
    }
    return summary
  }
}
