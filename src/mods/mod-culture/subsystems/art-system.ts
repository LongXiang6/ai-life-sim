/**
 * @module ArtSystem
 * @description 艺术子系统：艺术流派涌现、艺术作品创作、艺术声望与创新演化、随机事件
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { ArtState, Artwork, ArtForm } from '../types'

import {
  ART_STYLE_POOL, ART_FORM_LABELS,
  WORLDVIEW_STYLE_POOLS, DEFAULT_STYLE_EVOLUTION, STYLE_CHINESE_LABELS,
} from '../constants'
import { round, clamp, pickRandom } from '../utils'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

const ART_FORMS: ArtForm[] = ['literature', 'painting', 'music', 'sculpture', 'architecture', 'theater', 'dance']

/** 声望档位 */
const PRESTIGE_TIERS: { max: number; label: string }[] = [
  { max: 10, label: '默默无闻' },
  { max: 30, label: '地方知名' },
  { max: 60, label: '全国闻名' },
  { max: 90, label: '国际声誉' },
  { max: 100, label: '文化灯塔' },
]

/** 获取世界观对应的风格序列 */
function getStyleSequence(worldview: string): readonly string[] {
  const key = resolveStaticPoolWorldviewKey(worldview)
  return WORLDVIEW_STYLE_POOLS[key] ?? DEFAULT_STYLE_EVOLUTION
}

/** 将风格 ID 转为中文名 */
function styleLabel(styleId: string): string {
  return STYLE_CHINESE_LABELS[styleId] ?? styleId
}

export class ArtSystem implements ISubSystem {
  readonly id = 'art' as const
  readonly mod = 'mod-culture' as const
  readonly label = '艺术' as const
  readonly description = '管理艺术流派、著名作品、艺术声望与创新指数' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): ArtState {
    return {
      currentStyles: [],
      notableWorks: [],
      patronageLevel: 30,
      prestige: 10,
      innovationIndex: 5,
      worldview: '',
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

    this.advanceArt(context)

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

    // 艺术系统初始化（世界观注入）
    if (c.adaptationType === 'art-init' && typeof c.worldview === 'string') {
      const worldview = c.worldview as string
      this.state.worldview = worldview
      const seq = getStyleSequence(worldview)
      if (seq.length > 0) {
        this.state.currentStyles = [seq[0]]
      }
      return
    }

    // 添加艺术流派
    if (Array.isArray(c.addStyles)) {
      for (const style of c.addStyles as string[]) {
        if (typeof style === 'string' && !this.state.currentStyles.includes(style)) {
          this.state.currentStyles.push(style)
        }
      }
    }

    // 删除艺术流派（衰退）
    if (Array.isArray(c.removeStyles)) {
      const removeSet = new Set(c.removeStyles as string[])
      this.state.currentStyles = this.state.currentStyles.filter((s) => !removeSet.has(s))
    }

    // 添加艺术作品
    if (Array.isArray(c.addWorks)) {
      for (const work of c.addWorks as Partial<Artwork>[]) {
        if (work.id && work.name) {
          const idx = this.state.notableWorks.findIndex((w) => w.id === work.id)
          if (idx >= 0) {
            this.state.notableWorks[idx] = { ...this.state.notableWorks[idx], ...work }
          } else {
            this.state.notableWorks.push({
              id: work.id,
              name: work.name,
              form: work.form ?? 'literature',
              creator: work.creator ?? '佚名',
              quality: clamp(work.quality ?? 50, 0, 100),
              influence: clamp(work.influence ?? 30, 0, 100),
              yearCreated: work.yearCreated ?? 0,
            })
          }
        }
      }
    }

    // 设置赞助水平
    if (typeof c.patronageLevel === 'number') {
      this.state.patronageLevel = clamp(c.patronageLevel, 0, 100)
    }

    // 赞助水平增量
    if (typeof c.patronageDelta === 'number') {
      this.state.patronageLevel = clamp(
        round(this.state.patronageLevel + c.patronageDelta),
        0,
        100,
      )
    }

    // 作品影响力变化
    if (typeof c.workId === 'string' && typeof c.influence === 'number') {
      const work = this.state.notableWorks.find((w) => w.id === c.workId)
      if (work) {
        work.influence = clamp(c.influence, 0, 100)
      }
    }

    // 设置声望
    if (typeof c.prestige === 'number') {
      this.state.prestige = clamp(c.prestige, 0, 100)
    }

    // 设置创新指数
    if (typeof c.innovationIndex === 'number') {
      this.state.innovationIndex = clamp(c.innovationIndex, 0, 100)
    }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }

  // ─── 内部推进逻辑 ───

  private advanceArt(context: RoundContext): void {
    const { patronageLevel, worldview } = this.state

    // ── 声望演进 ──
    if (patronageLevel > 50) {
      const growth = 0.3 * (patronageLevel / 100)
      this.state.prestige = clamp(round(this.state.prestige + growth), 0, 100)
    } else if (patronageLevel < 20) {
      this.state.prestige = clamp(round(this.state.prestige - 0.2), 0, 100)
    } else {
      const drift = (patronageLevel / 100 * 60 - this.state.prestige) * 0.01
      this.state.prestige = clamp(round(this.state.prestige + drift), 0, 100)
    }

    // ── 创新指数演进 ──
    if (this.state.prestige > 50) {
      this.state.innovationIndex = clamp(round(this.state.innovationIndex + 0.1 * (this.state.prestige / 100)), 0, 100)
    } else {
      this.state.innovationIndex = clamp(round(this.state.innovationIndex + 0.1 * 0.2), 0, 100)
    }

    // ── 赞助水平自然波动 ──
    const patronageDrift = (Math.random() - 0.48) * 1
    this.state.patronageLevel = clamp(round(patronageLevel + patronageDrift), 0, 100)

    // ── 世界观分层风格涌现 ──
    const seq = getStyleSequence(worldview)
    const canEmerge = Math.random() < this.state.prestige / 500
    if (canEmerge) {
      const nextStyle = seq.find((s) => !this.state.currentStyles.includes(s))
      if (nextStyle) {
        this.state.currentStyles.push(nextStyle)
      } else {
        const fallback = ART_STYLE_POOL.filter((s) => !this.state.currentStyles.includes(s))
        if (fallback.length > 0) {
          this.state.currentStyles.push(pickRandom(fallback))
        }
      }
    }

    // ── 随机艺术事件（3% 概率） ──
    if (Math.random() < 0.03) {
      const eventRoll = Math.random()
      if (eventRoll < 0.4) {
        this.state.innovationIndex = clamp(round(this.state.innovationIndex + 12), 0, 100)
      } else if (eventRoll < 0.7) {
        this.state.prestige = clamp(round(this.state.prestige + 8), 0, 100)
      } else {
        this.state.innovationIndex = clamp(round(this.state.innovationIndex + 6), 0, 100)
        this.state.prestige = clamp(round(this.state.prestige + 6), 0, 100)
      }
    }

    // ── 艺术作品创作 ──
    if (Math.random() < patronageLevel / 600) {
      const form = pickRandom(ART_FORMS)
      const styleInfluence = this.state.currentStyles.length > 0
        ? styleLabel(pickRandom(this.state.currentStyles))
        : '古典风格'
      const id = `artwork_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const quality = Math.min(90, 30 + Math.floor(patronageLevel * 0.5) + Math.floor(Math.random() * 20))
      this.state.notableWorks.push({
        id,
        name: `${styleInfluence}·${ART_FORM_LABELS[form]}作品${this.state.notableWorks.length + 1}`,
        form,
        creator: `艺术家_${context.round.year}`,
        quality,
        influence: Math.min(80, Math.floor(quality * 0.7)),
        yearCreated: context.round.year,
      })
    }

    // ── 作品影响力衰减 ──
    for (const work of this.state.notableWorks) {
      work.influence = clamp(round(work.influence - 0.05), 0, 100)
    }
  }

  // ─── 领域方法 ───

  getCurrentStyles(): string[] {
    return this.state.currentStyles
  }

  getNotableWorkCount(): number {
    return this.state.notableWorks.length
  }

  getWorksByQuality(): Artwork[] {
    return [...this.state.notableWorks]
      .sort((a, b) => b.quality - a.quality)
  }

  /** 获取声望中文标签 */
  getPrestigeLabel(): string {
    const p = this.state.prestige
    for (const tier of PRESTIGE_TIERS) {
      if (p <= tier.max) return tier.label
    }
    return '文化灯塔'
  }

  /** 跨系统文化修正值（0.5~2.0） */
  getCultureMod(): number {
    return 0.5 + (this.state.prestige / 100) * 1.5
  }

  formatForPrompt(): string {
    const lines: string[] = []
    lines.push('【艺术文化概况】')

    const prestigeLabel = this.getPrestigeLabel()
    lines.push(`艺术声望：${prestigeLabel}（${this.state.prestige}）`)
    lines.push(`创新指数：${this.state.innovationIndex}`)
    lines.push(`赞助水平：${this.state.patronageLevel}`)
    lines.push('')

    if (this.state.currentStyles.length > 0) {
      const styleNames = this.state.currentStyles.map((s) => styleLabel(s)).join('、')
      lines.push(`活跃流派：${styleNames}`)
    } else {
      lines.push('活跃流派：尚未形成')
    }
    lines.push('')

    if (this.state.notableWorks.length > 0) {
      lines.push(`著名作品（共 ${this.state.notableWorks.length} 件）：`)
      const worksByQuality = this.getWorksByQuality()
      for (const w of worksByQuality) {
        lines.push(`  ·《${w.name}》— ${w.creator}，品质 ${w.quality}，影响力 ${w.influence}`)
      }
    } else {
      lines.push('尚无著名作品。')
    }

    return lines.join('\n')
  }

  // ─── 摘要构建 ───

  private buildSummary(): string {
    const styles = this.state.currentStyles.length > 0
      ? this.state.currentStyles.map((s) => styleLabel(s)).join('、')
      : '无'
    return `【${this.label}】流派: ${styles}, 名作: ${this.state.notableWorks.length}件, 赞助: ${this.state.patronageLevel}, 声望: ${this.state.prestige}`
  }
}
