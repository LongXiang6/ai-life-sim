/**
 * @module LanguageNamingSystem
 * @description 语言命名子系统：多语言生态模拟、声望演化、方言分化、势力命名生成
 * @mod mod-politics
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { LanguageNamingState, LanguageProfile } from '../types'

import {
  NAME_PREFIX_POOL,
  NAME_INFIX_POOL,
  NAME_SUFFIX_POOL,
  getLanguageInitForWorldview,
  generateFactionName,
  pickRandom,
  randomInRange,
} from '../constants'

export class LanguageNamingSystem implements ISubSystem {
  readonly id = 'language-naming' as const
  readonly mod = 'mod-politics' as const
  readonly label = '语言命名' as const
  readonly description = '管理多语言生态、声望演化、方言分化、势力命名生成' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): LanguageNamingState {
    return {
      dominantLanguage: '通用语',
      profiles: [],
      languageVariants: [],
      namePrefixes: [...NAME_PREFIX_POOL],
      nameInfixes: [...NAME_INFIX_POOL],
      nameSuffixes: [...NAME_SUFFIX_POOL],
      specialRules: {},
    }
  }

  /** 根据世界观初始化语言生态 */
  initForWorldview(worldview: string): void {
    const langConfigs = getLanguageInitForWorldview(worldview)
    const profiles: LanguageProfile[] = langConfigs.map((cfg, i) => ({
      name: cfg.name,
      prestige: cfg.prestige,
      speakers: cfg.speakers,
      dialects: [],
      isDead: false,
      phonemePool: cfg.phonemePool,
      isDominant: i === 0,
    }))

    // 首个语言设为主导语言
    if (profiles.length > 0) {
      profiles[0].isDominant = true
    }

    this.state.profiles = profiles
    this.state.dominantLanguage = profiles[0]?.name ?? '通用语'

    // 初始化语言变体列表
    this.state.languageVariants = profiles.map((p) => p.name)
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
    this.advanceLanguage()
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

    if (c.adaptationType === 'language-init' && typeof c.worldview === 'string') {
      this.initForWorldview(c.worldview)
      return
    }

    if (typeof c.dominantLanguage === 'string') {
      this.state.dominantLanguage = c.dominantLanguage
      // 同步更新 profiles 中的 isDominant
      for (const p of this.state.profiles) {
        p.isDominant = p.name === c.dominantLanguage
      }
    }
    if (Array.isArray(c.languageVariants)) {
      this.state.languageVariants = c.languageVariants.filter((v): v is string => typeof v === 'string')
    }
    if (Array.isArray(c.namePrefixes)) {
      this.state.namePrefixes = c.namePrefixes.filter((v): v is string => typeof v === 'string')
    }
    if (Array.isArray(c.nameInfixes)) {
      this.state.nameInfixes = c.nameInfixes.filter((v): v is string => typeof v === 'string')
    }
    if (Array.isArray(c.nameSuffixes)) {
      this.state.nameSuffixes = c.nameSuffixes.filter((v): v is string => typeof v === 'string')
    }
    if (c.specialRules && typeof c.specialRules === 'object' && !Array.isArray(c.specialRules)) {
      this.state.specialRules = c.specialRules as Record<string, string>
    }

    // 直接设置语言档案
    if (Array.isArray(c.profiles)) {
      this.state.profiles = c.profiles as LanguageProfile[]
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceLanguage(): void {
    // 遍历每种语言的演化
    for (const profile of this.state.profiles) {
      if (profile.isDead) continue

      // 1. 声望漂移 ±3
      profile.prestige = Math.max(0, Math.min(100, profile.prestige + randomInRange(-3, 3)))

      // 2. 使用人数变动（年均 -2.5%~+7.5%）
      const growthFactor = 1 + (Math.random() * 0.1 - 0.025)
      profile.speakers = Math.max(100, Math.round(profile.speakers * growthFactor))

      // 3. 语言消亡检测：声望 < 20 且非主导语言
      if (profile.prestige < 20 && !profile.isDominant && Math.random() < 0.1) {
        profile.isDead = true
        profile.speakers = 0
        continue
      }

      // 4. 方言分化：每 8 回合 15% 概率产生新方言
      if (this._lastProcessedRound % 8 === 0 && Math.random() < 0.15 && profile.dialects.length < 5) {
        const phoneme = profile.phonemePool[Math.floor(Math.random() * profile.phonemePool.length)]
        const dialectName = `${profile.name}方言（${phoneme}口音）`
        if (!profile.dialects.includes(dialectName)) {
          profile.dialects.push(dialectName)
        }
      }
    }

    // 5. 变体列表同步（仅保留存活语言 + 方言）
    const variantSet = new Set<string>()
    for (const profile of this.state.profiles) {
      if (!profile.isDead) {
        variantSet.add(profile.name)
        for (const d of profile.dialects) {
          variantSet.add(d)
        }
      }
    }
    this.state.languageVariants = Array.from(variantSet)
  }

  // ─── 领域方法 ───

  /** 基于前缀+中缀+后缀池随机组合生成名称 */
  generateName(): string {
    const prefix = pickRandom(this.state.namePrefixes)
    const infix = pickRandom(this.state.nameInfixes)
    const suffix = pickRandom(this.state.nameSuffixes)
    return `${prefix}${infix}${suffix}`
  }

  /** 根据世界观和现有名称生成不重复的势力名 */
  generateFactionName(worldview: string, existingNames: string[]): string {
    return generateFactionName(worldview, existingNames)
  }

  /** 格式化语言生态信息供 AI Prompt 使用 */
  formatForPrompt(): string {
    const lines: string[] = []

    const aliveProfiles = this.state.profiles.filter((p) => !p.isDead)
    const deadProfiles = this.state.profiles.filter((p) => p.isDead)

    if (aliveProfiles.length === 0) {
      return '【语言】无存活语言'
    }

    for (const profile of aliveProfiles) {
      const dominantMark = profile.isDominant ? ' ★主导' : ''
      const prestigeStars = profile.prestige >= 80 ? '🌟高' : profile.prestige >= 50 ? '⭐中' : '🌙低'
      const dialectInfo = profile.dialects.length > 0 ? `，方言：${profile.dialects.join('、')}` : ''
      lines.push(`${profile.name}${dominantMark} | 声望：${prestigeStars}(${profile.prestige}) | 使用人数：${profile.speakers.toLocaleString()}${dialectInfo}`)
    }

    if (deadProfiles.length > 0) {
      lines.push(`已消亡语言：${deadProfiles.map((p) => p.name).join('、')}`)
    }

    return lines.join('\n')
  }

  private getSummaryText(): string {
    const aliveCount = this.state.profiles.filter((p) => !p.isDead).length
    const deadCount = this.state.profiles.filter((p) => p.isDead).length
    const dialectCount = this.state.profiles.reduce((s, p) => s + p.dialects.length, 0)
    let summary = `【${this.label}】主导：${this.state.dominantLanguage}，活语言：${aliveCount}`
    if (deadCount > 0) summary += `，已消亡：${deadCount}`
    if (dialectCount > 0) summary += `，方言：${dialectCount}`
    return summary
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
