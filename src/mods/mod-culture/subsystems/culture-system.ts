/**
 * @module CultureSystem
 * @description 文化子系统：传统强度+改革动力学、文化价值偏移、世界观分层习俗、周期性触发、艺术繁荣度
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { CultureState, CulturalValue, Custom, Festival, Ritual, Taboo } from '../types'

import {
  CULTURAL_VALUE_LABELS,
  CUSTOM_TEMPLATES,
  FESTIVAL_TEMPLATES,
  RITUAL_TEMPLATES,
  TABOO_TEMPLATES,
  REFORM_PRESSURE_CRASH,
  REFORM_PRESSURE_REVIVAL,
  REFORM_PRESSURE_CONSOLIDATE,
  REFORM_RESISTANCE_WEIGHT,
  INERTIA_WEIGHT,
  REFORM_CRASH_DROP,
  REFORM_REVIVAL_BOOST,
  REFORM_CONSOLIDATE_BOOST,
  TRADITION_NATURAL_DECAY,
  CUSTOMS_TRIGGER_COOLDOWN,
  round,
  clamp,
} from '../constants'

const ALL_CULTURAL_VALUES: CulturalValue[] = [
  'collectivism', 'individualism', 'hierarchy', 'egalitarianism',
  'militarism', 'pacifism', 'spiritualism', 'materialism',
]

const CULTURE_TAG_MAP: AttrTagMap = {
  '传统': 'traditionStrength', '传统强度': 'traditionStrength',
  '艺术': 'artProsperity', '艺术繁荣': 'artProsperity', '文艺': 'artProsperity',
}

/** 按世界观筛选习俗 */
function filterByWorldview<T extends { worldTypes?: string[] }>(items: readonly T[], worldview: string): T[] {
  return items.filter((item) => {
    if (!item.worldTypes || item.worldTypes.length === 0) return true // 通用
    return item.worldTypes.includes(worldview)
  }) as T[]
}

export class CultureSystem implements ISubSystem {
  readonly id = 'culture' as const
  readonly mod = 'mod-culture' as const
  readonly label = '文化' as const
  readonly description = '管理文化名称、传统三维动力学、文化价值取向、世界观分层习俗、艺术繁荣度' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(worldview?: string): CultureState {
    const values = {} as Record<CulturalValue, number>
    for (const v of ALL_CULTURAL_VALUES) {
      values[v] = 50
    }
    // 按世界观筛选习俗
    const wv = worldview ?? ''
    return {
      cultureName: '初始文明',
      traditionStrength: 60,
      reformResistance: 42, // = 60*0.7 + 0*0.3
      culturalInertia: 30,
      reformPressure: 10,
      values,
      festivals: filterByWorldview(FESTIVAL_TEMPLATES, wv).map((f) => ({ ...f, lastTriggeredYear: 0 })),
      rituals: filterByWorldview(RITUAL_TEMPLATES, wv).map((r) => ({ ...r, category: r.category as Ritual['category'] })),
      taboos: filterByWorldview(TABOO_TEMPLATES, wv).map((t) => ({ ...t })),
      customs: filterByWorldview(CUSTOM_TEMPLATES, wv).map((c) => ({ ...c, lastTriggeredYear: 0 })),
      notableEvents: [],
      artProsperity: 30,
    }
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.buildSummary(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    this.advanceCulture(context)

    return {
      id: this.id,
      summary: this.buildSummary(),
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

    // 文化初始化（含 worldview 分层）
    if (c.adaptationType === 'culture-init' && typeof c.worldview === 'string') {
      this.state = this.createInitialState(c.worldview as string)
      return
    }

    // 设置文化名
    if (typeof c.cultureName === 'string') {
      this.state.cultureName = c.cultureName
    }

    // 设置传统强度
    if (typeof c.traditionStrength === 'number') {
      this.state.traditionStrength = clamp(c.traditionStrength, 0, 100)
    }

    // 设置改革压力
    if (typeof c.reformPressure === 'number') {
      this.state.reformPressure = clamp(c.reformPressure, 0, 100)
    }

    // 设置艺术繁荣度
    if (typeof c.artProsperity === 'number') {
      this.state.artProsperity = clamp(c.artProsperity, 0, 100)
    }

    // 调整文化价值
    if (c.values && typeof c.values === 'object' && !Array.isArray(c.values)) {
      const v = c.values as Record<string, number>
      for (const [key, val] of Object.entries(v)) {
        if (typeof val === 'number' && key in this.state.values) {
          this.state.values[key as CulturalValue] = clamp(val, 0, 100)
        }
      }
    }

    // 添加节日
    if (Array.isArray(c.addFestivals)) {
      for (const f of c.addFestivals as Partial<Festival>[]) {
        if (f.name && f.date) {
          this.state.festivals.push({
            name: f.name,
            date: f.date,
            description: f.description ?? '',
            importance: clamp(f.importance ?? 3, 1, 5),
            frequencyYears: f.frequencyYears,
            lastTriggeredYear: 0,
            effects: f.effects,
          })
        }
      }
    }

    // 添加仪式
    if (Array.isArray(c.addRituals)) {
      for (const r of c.addRituals as Partial<Ritual>[]) {
        if (r.name && r.category) {
          this.state.rituals.push({
            name: r.name,
            category: r.category as Ritual['category'],
            description: r.description ?? '',
            triggerCondition: r.triggerCondition,
            traditionImpact: r.traditionImpact,
          })
        }
      }
    }

    // 添加禁忌
    if (Array.isArray(c.addTaboos)) {
      for (const t of c.addTaboos as Partial<Taboo>[]) {
        if (t.action) {
          this.state.taboos.push({
            action: t.action,
            severity: t.severity ?? 'moderate',
            consequence: t.consequence ?? '',
            traditionImpactOnViolation: t.traditionImpactOnViolation,
          })
        }
      }
    }

    // 添加习俗
    if (Array.isArray(c.addCustoms)) {
      for (const ct of c.addCustoms as Partial<Custom>[]) {
        if (ct.name && ct.category) {
          this.state.customs.push({
            name: ct.name,
            category: ct.category as Custom['category'],
            description: ct.description ?? '',
            worldTypes: ct.worldTypes,
            frequencyYears: ct.frequencyYears,
            lastTriggeredYear: ct.lastTriggeredYear ?? 0,
            effects: ct.effects,
            traditionImpact: ct.traditionImpact,
          })
        }
      }
    }

    // 删除节日/仪式/禁忌/习俗
    if (Array.isArray(c.removeFestivalNames)) {
      const removeSet = new Set(c.removeFestivalNames as string[])
      this.state.festivals = this.state.festivals.filter((f) => !removeSet.has(f.name))
    }
    if (Array.isArray(c.removeRitualNames)) {
      const removeSet = new Set(c.removeRitualNames as string[])
      this.state.rituals = this.state.rituals.filter((r) => !removeSet.has(r.name))
    }
    if (Array.isArray(c.removeTabooActions)) {
      const removeSet = new Set(c.removeTabooActions as string[])
      this.state.taboos = this.state.taboos.filter((t) => !removeSet.has(t.action))
    }
    if (Array.isArray(c.removeCustomNames)) {
      const removeSet = new Set(c.removeCustomNames as string[])
      this.state.customs = this.state.customs.filter((cst) => !removeSet.has(cst.name))
    }

    // P2 降级：AI JSON 未显式声明文化变化时，从 description 中补偿提取
    const hasExplicit = typeof c.cultureName === 'string' || typeof c.traditionStrength === 'number' ||
      typeof c.artProsperity === 'number' || c.values || c.addFestivals || c.addRituals ||
      c.addTaboos || c.removeFestivalNames || c.removeRitualNames || c.removeTabooActions ||
      c.addCustoms || c.removeCustomNames ||
      typeof c.reformPressure === 'number'
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, CULTURE_TAG_MAP)
      if (extracted) {
        if (typeof extracted.traditionStrength === 'number') {
          this.state.traditionStrength = clamp(this.state.traditionStrength + extracted.traditionStrength, 0, 100)
        }
        if (typeof extracted.artProsperity === 'number') {
          this.state.artProsperity = clamp(this.state.artProsperity + extracted.artProsperity, 0, 100)
        }
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }

  // ─── 内部推进逻辑 ───

  private advanceCulture(context: RoundContext): void {
    const { traditionStrength, culturalInertia } = this.state
    const year = context.round.year

    // ── 三维改革动力学模型 ──
    // 改革阻力 = strength*0.7 + inertia*0.3
    const newResistance = clamp(round(traditionStrength * REFORM_RESISTANCE_WEIGHT + culturalInertia * INERTIA_WEIGHT), 0, 100)
    // 文化惯性 = (strength + resistance) / 2
    const newInertia = clamp(round((traditionStrength + newResistance) / 2), 0, 100)

    const reformPressure = this.state.reformPressure

    let traditionDelta = TRADITION_NATURAL_DECAY // 正常：每年-0.1
    if (reformPressure > REFORM_PRESSURE_CRASH) {
      traditionDelta = REFORM_CRASH_DROP        // 压力>90：崩盘 -30
    } else if (reformPressure > REFORM_PRESSURE_REVIVAL) {
      traditionDelta = REFORM_REVIVAL_BOOST       // 压力>70：文艺复兴 +15
    } else if (reformPressure < REFORM_PRESSURE_CONSOLIDATE) {
      traditionDelta = REFORM_CONSOLIDATE_BOOST   // 压力<30：巩固 +1
    }

    this.state.traditionStrength = clamp(round(traditionStrength + traditionDelta), 0, 100)
    this.state.reformResistance = newResistance
    this.state.culturalInertia = newInertia

    // 改革压力自然衰减（向 10 回归）
    this.state.reformPressure = clamp(round(reformPressure + (10 - reformPressure) * 0.01), 0, 100)

    // ── 艺术繁荣度自然变化 ──
    const artDrift = (this.state.artProsperity < 50 ? 0.1 : -0.05)
    this.state.artProsperity = clamp(round(this.state.artProsperity + artDrift), 0, 100)

    // ── 清空本轮 NotableEvent（确保每轮只产出一次） ──
    this.state.notableEvents = []

    // ── 习俗周期性触发 + NotableEvent 产出 ──
    for (const custom of this.state.customs) {
      const freq = custom.frequencyYears ?? 1
      const lastTriggered = custom.lastTriggeredYear ?? 0
      if (lastTriggered === 0 || (year - lastTriggered >= freq && year - lastTriggered >= CUSTOMS_TRIGGER_COOLDOWN)) {
        custom.lastTriggeredYear = year
        const impact: Record<string, number> = { ...custom.effects }
        if (custom.traditionImpact) {
          impact.traditionStrength = custom.traditionImpact
        }
        this.state.notableEvents.push({
          year,
          type: 'custom',
          customCategory: custom.category,
          name: custom.name,
          description: custom.description,
          impact,
        })
      }
    }

    // ── 文化价值偏移 ──
    for (const key of ALL_CULTURAL_VALUES) {
      const current = this.state.values[key]
      const randomShift = (Math.random() - 0.5) * 0.3
      const regression = (50 - current) * 0.002
      this.state.values[key] = clamp(round(current + randomShift + regression), 0, 100)
    }

    // ── 习俗周期性触发（节日） ──
    for (const festival of this.state.festivals) {
      const freq = festival.frequencyYears ?? 1
      const lastTriggered = festival.lastTriggeredYear ?? 0
      if (lastTriggered === 0 || (year - lastTriggered >= freq && year - lastTriggered >= CUSTOMS_TRIGGER_COOLDOWN)) {
        festival.lastTriggeredYear = year
      }
    }

    // ── 节日重要性缓慢衰减 ──
    for (const f of this.state.festivals) {
      f.importance = clamp(f.importance - 0.001, 1, 5)
    }
  }

  // ─── 领域方法 ───

  getValuesByDominance(): { value: CulturalValue; score: number }[] {
    return ALL_CULTURAL_VALUES
      .map((v) => ({ value: v, score: this.state.values[v] }))
      .sort((a, b) => b.score - a.score)
  }

  getFestivalCount(): number {
    return this.state.festivals.length
  }

  /** 改革可行性（0-1，越高越可能成功） */
  getReformViability(): number {
    return clamp(1 - this.state.reformResistance / 100 * 0.8, 0, 1)
  }

  /** 社会稳定系数（传统强度影响，0.5~2.0） */
  getSocialStabilityMod(): number {
    return 0.5 + ((this.state.traditionStrength + this.state.reformResistance) / 2) / 100 * 1.5
  }

  /** 本月是否触发了节日 */
  getCurrentFestival(month: number): Festival | null {
    const monthStr = `${month}`
    for (const f of this.state.festivals) {
      if (f.date.startsWith(monthStr + '-') || f.date === `${month}`) {
        const year = this._lastProcessedRound
        if (f.lastTriggeredYear === year) return f
      }
    }
    return null
  }

  formatForPrompt(): string {
    const { cultureName, traditionStrength, reformResistance, culturalInertia, reformPressure, festivals, rituals, taboos, customs, notableEvents, artProsperity } = this.state
    const topValues = this.getValuesByDominance()
      .map((v) => `${CULTURAL_VALUE_LABELS[v.value]}(${v.score})`)
      .join('、')
    const reformViability = (this.getReformViability() * 100).toFixed(0)
    const stability = this.getSocialStabilityMod().toFixed(2)

    const year = this._lastProcessedRound
    const triggeredFestivals = festivals.filter((f) => f.lastTriggeredYear === year)

    const lines = [
      `文化：${cultureName}`,
      `传统强度：${traditionStrength}，改革阻力：${reformResistance}，文化惯性：${culturalInertia}`,
      `改革压力：${reformPressure}，改革可行性：${reformViability}%，社会稳定系数：×${stability}`,
      `核心价值：${topValues}`,
      `节日：${festivals.length}个，仪式：${rituals.length}个，禁忌：${taboos.length}个，习俗：${customs.length}个`,
      `艺术繁荣度：${artProsperity}`,
    ]
    if (triggeredFestivals.length > 0) {
      lines.push(`正在庆祝：${triggeredFestivals.map((f) => `${f.name}（${f.description}）`).join('、')}`)
    }
    if (notableEvents.length > 0) {
      lines.push(`值得关注：${notableEvents.map((n) => `${n.name}（${n.description}）`).join('、')}`)
    }
    return lines.join('\n')
  }

  // ─── 摘要构建 ───

  private buildSummary(): string {
    const topValues = this.getValuesByDominance()
      .map((v) => CULTURAL_VALUE_LABELS[v.value])
      .join('、')
    const triggeredCount = this.state.festivals.filter((f) => f.lastTriggeredYear === this._lastProcessedRound).length
    const notableCount = this.state.notableEvents.length
    let text = `【${this.label}】文化名: ${this.state.cultureName}, 传统强度: ${this.state.traditionStrength}, 核心价值: ${topValues}, 节日: ${this.state.festivals.length}个, 习俗: ${this.state.customs.length}个`
    if (this.state.reformPressure > 70) text += `, 改革压力高`
    if (triggeredCount > 0) text += `, 庆祝中: ${triggeredCount}个节日`
    if (notableCount > 0) text += `, 习俗事件: ${notableCount}条`
    return text
  }
}
