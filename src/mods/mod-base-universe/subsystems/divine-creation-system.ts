/**
 * @module DivineCreationSystem
 * @description 神创世界子系统 —— 管理神明体系：活跃神祇管理、神恩增减、干预概率 + 按世界观神祇池启用
 * @mod mod-base-universe
 */
import { getRoundSequence } from '@/foundation'

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import type { DivineState, DeityPool, DeityEffect } from '../types'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

import { round } from '../utils'

// ========== 常量 ==========

const MIN_INITIAL_DEITIES = 3
const MAX_INITIAL_DEITIES = 5
const FAVOR_INITIAL = 50
const FAVOR_MIN = 0
const FAVOR_MAX = 100
const HIGH_FAITH_THRESHOLD = 70
const LOW_FAITH_THRESHOLD = 20
const INTERVENTION_BASE_MULTIPLIER = 0.3
const EFFECT_TYPES = ['blessing', 'curse', 'omen', 'revelation'] as const

// ========== 神祇池配置 ==========

const DEFAULT_BLESSINGS: DeityEffect[] = [
  { text: '赐下丰收之雨，作物将获得丰收', luckMod: 1, healthMod: 1 },
  { text: '降下治愈之光，伤病将加速恢复', luckMod: 0, healthMod: 2 },
  { text: '赐予幸运之星，近期运势上升', luckMod: 2, healthMod: 0 },
  { text: '降福于虔诚者，一切顺遂如意', luckMod: 1, healthMod: 1 },
]

const DEFAULT_CURSES: DeityEffect[] = [
  { text: '降下灾厄之云，厄运将笼罩大地', luckMod: -1, healthMod: -1 },
  { text: '散播疫病之息，疾病将在人群中蔓延', luckMod: 0, healthMod: -2 },
  { text: '收回庇护之力，霉运接踵而至', luckMod: -2, healthMod: 0 },
]

const DEFAULT_OMENS: DeityEffect[] = [
  { text: '天降异象，预示着重大变局即将来临', luckMod: 0, healthMod: 0 },
  { text: '星辰移位，暗示世界格局将发生剧变', luckMod: 0, healthMod: 0 },
  { text: '先兆显现，提醒世人警惕未来的危机', luckMod: 0, healthMod: 0 },
]

const DEFAULT_REVELATIONS: DeityEffect[] = [
  { text: '启示降临，知识的火炬被点燃', luckMod: 0, healthMod: 0 },
  { text: '神谕显现，隐藏的真理被揭示', luckMod: 0, healthMod: 0 },
  { text: '灵光乍现，文明因此获得新的突破', luckMod: 0, healthMod: 0 },
]

const DEITY_POOLS_BY_WORLDVIEW: Record<string, DeityPool> = {
  materialist: {
    deities: [],
    newDeities: [],
    blessings: [],
    curses: [],
    omens: [],
    revelations: [],
  },

  cultivation: {
    deities: ['天道', '大地之母', '战争之神', '智慧之神', '死亡之神', '生命之神', '火神', '水神', '风神', '命运之神', '自然之灵', '先祖之魂'],
    newDeities: ['知识之神', '文明之神', '商业之神', '守护之神', '月亮女神', '太阳之神', '雷电之神', '丰收之神'],
    blessings: DEFAULT_BLESSINGS,
    curses: DEFAULT_CURSES,
    omens: DEFAULT_OMENS,
    revelations: DEFAULT_REVELATIONS,
  },

  eastern_fantasy: {
    deities: ['天道', '大地之母', '战争之神', '智慧之神', '火神', '水神', '风神', '命运之神', '自然之灵', '先祖之魂'],
    newDeities: ['知识之神', '文明之神', '守护之神', '月亮女神', '太阳之神', '雷电之神', '丰收之神'],
    blessings: DEFAULT_BLESSINGS,
    curses: DEFAULT_CURSES,
    omens: DEFAULT_OMENS,
    revelations: DEFAULT_REVELATIONS,
  },

  western_fantasy: {
    deities: ['光明之神', '暗影之神', '大地母神', '战争之神', '智慧女神', '元素领主', '生命女神', '死灵之主', '命运编织者'],
    newDeities: ['商业之神', '旅者之神', '锻造之神', '狩猎之神', '酒神', '诗歌之神'],
    blessings: [
      { text: '光明之神赐福，金色光辉笼罩大地', luckMod: 2, healthMod: 1 },
      { text: '大地的恩赐降临，万物丰饶', luckMod: 1, healthMod: 2 },
      { text: '智慧女神点拨，灵感如泉涌', luckMod: 1, healthMod: 0 },
    ],
    curses: [
      { text: '暗影之神降怒，黑暗笼罩', luckMod: -2, healthMod: -1 },
      { text: '死灵之主的诅咒降临', luckMod: -1, healthMod: -2 },
      { text: '元素失衡，世界动荡', luckMod: -1, healthMod: -1 },
    ],
    omens: [
      { text: '龙星闪烁，远古契约将被唤醒', luckMod: 0, healthMod: 0 },
      { text: '世界树的枝叶摇曳，命运的分叉点将至', luckMod: 0, healthMod: 0 },
    ],
    revelations: [
      { text: '失落的奥术知识重现人间', luckMod: 0, healthMod: 0 },
      { text: '先贤之灵显现，指引文明前路', luckMod: 0, healthMod: 0 },
    ],
  },

  scifi: {
    deities: ['宇宙意识', '机械之神', '数据之神', '进化之主', '熵增之神'],
    newDeities: ['量子之神', '银河意志', '文明之灵', '网络之神'],
    blessings: [
      { text: '宇宙意识投下注视，能量充盈', luckMod: 2, healthMod: 1 },
      { text: '进化之主恩赐，基因优化加速', luckMod: 1, healthMod: 2 },
    ],
    curses: [
      { text: '熵增之神降下寂灭，一切归于混沌', luckMod: -2, healthMod: -2 },
      { text: '机械之神冷漠，科技倒退', luckMod: -1, healthMod: -1 },
    ],
    omens: [
      { text: '维度信号异常，宇宙格局即将重写', luckMod: 0, healthMod: 0 },
    ],
    revelations: [
      { text: '数据之神解禁，失落科技重见天日', luckMod: 0, healthMod: 0 },
      { text: '宇宙意识的碎片降临，文明获得启示', luckMod: 0, healthMod: 0 },
    ],
  },

  post_apocalyptic: {
    deities: ['旧日支配者', '深渊之主', '疫病之神', '疯狂之源'],
    newDeities: [],
    blessings: [],
    curses: [
      { text: '深渊之主的目光扫过，恐惧蔓延', luckMod: -2, healthMod: -2 },
      { text: '疫病之神释放新的瘟疫', luckMod: -1, healthMod: -3 },
    ],
    omens: [
      { text: '旧日支配者的低语在废土回荡', luckMod: -1, healthMod: 0 },
    ],
    revelations: [
      { text: '疯狂之源展现真理的边缘', luckMod: 1, healthMod: -2 },
    ],
  },

  survival_horror: {
    deities: ['旧日支配者', '深渊之主', '疫病之神', '疯狂之源'],
    newDeities: [],
    blessings: [],
    curses: [
      { text: '深渊之主的目光扫过，恐惧蔓延', luckMod: -2, healthMod: -2 },
      { text: '疫病之神释放新的瘟疫', luckMod: -1, healthMod: -3 },
    ],
    omens: [
      { text: '旧日支配者的低语在废土回荡', luckMod: -1, healthMod: 0 },
    ],
    revelations: [
      { text: '疯狂之源展现真理的边缘', luckMod: 1, healthMod: -2 },
    ],
  },
}

// ========== 工具函数 ==========

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickRandomN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, shuffled.length))
}

function getDeityPool(worldview?: string): DeityPool {
  const key = resolveStaticPoolWorldviewKey(worldview ?? '')
  if (key === 'default') return DEITY_POOLS_BY_WORLDVIEW['materialist']
  return DEITY_POOLS_BY_WORLDVIEW[key] ?? DEITY_POOLS_BY_WORLDVIEW['materialist']
}

/** 神恩等级标签（4级语义化标签，供 AI Prompt 直接消费） */
function getFavorLabel(favor: number): string {
  if (favor >= 80) return '极受崇敬'
  if (favor >= 60) return '备受敬仰'
  if (favor <= 20) return '信仰凋零'
  if (favor <= 40) return '渐被遗忘'
  return '信众稳定'
}

// ========== 子系统 ==========

export class DivineCreationSystem implements ISubSystem {
  readonly id = 'divine-creation' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '神创世界' as const
  readonly description = '管理神明体系：活跃神祇、神恩值、干预概率，按世界观神祇池自动启用/禁用' as const

  private _state: DivineState = {
    initialized: false,
    enabled: false,
    activeDeities: [],
    divineFavor: {},
    interventionProbability: 0,
    worldview: undefined,
  }

  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return this._buildResult()
    }
    this._lastProcessedRound = getRoundSequence(context)

    const worldview = this._resolveWorldview(context)
    this._advance(worldview, context)
    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return

    const c = changes.changes

    // P0-2: 校验 activeDeities 元素是否为合法字符串
    if (Array.isArray(c.activeDeities)) {
      const validDeities = (c.activeDeities as unknown[]).filter(
        (d): d is string => typeof d === 'string' && d.length > 0,
      )
      this._state.activeDeities = validDeities
    }

    // P0-2: 校验 divineFavor 值是否在 [0, 100] 范围
    if (typeof c.divineFavor === 'object' && c.divineFavor !== null && !Array.isArray(c.divineFavor)) {
      const rawFavor = c.divineFavor as Record<string, unknown>
      const validFavor: Record<string, number> = {}
      for (const [key, val] of Object.entries(rawFavor)) {
        if (typeof val === 'number' && !isNaN(val)) {
          validFavor[key] = clamp(val, 0, 100)
        }
      }
      if (Object.keys(validFavor).length > 0) {
        this._state.divineFavor = validFavor
      }
    }

    if (typeof c.enabled === 'boolean') {
      this._state.enabled = c.enabled
    }
  }

  reset(): void {
    this._state = {
      initialized: false,
      enabled: false,
      activeDeities: [],
      divineFavor: {},
      interventionProbability: 0,
      worldview: undefined,
    }
    this._lastProcessedRound = -1
  }

  // ========== 公开方法 ==========

  /** 获取当前世界观的神祇池 */
  getDeityPoolForWorldview(worldview?: string): DeityPool {
    return getDeityPool(worldview)
  }

  /** 判断指定世界观是否启用神明系统 */
  isEnabledForWorldview(worldview?: string): boolean {
    const pool = getDeityPool(worldview)
    return pool.deities.length > 0
  }

  /** 神明干预掷骰 */
  rollDivineIntervention(worldview?: string): DivineInterventionResult {
    if (!this._state.enabled || this._state.activeDeities.length === 0) {
      return { intervened: false, deity: '', effect: '', luckMod: 0, healthMod: 0 }
    }
    if (Math.random() >= this._state.interventionProbability) {
      return { intervened: false, deity: '', effect: '', luckMod: 0, healthMod: 0 }
    }

    const pool = getDeityPool(worldview)
    const deity = pickRandom(this._state.activeDeities)
    const effectType = pickRandom(EFFECT_TYPES)

    let effectPool: DeityEffect[] = []
    switch (effectType) {
      case 'blessing': effectPool = pool.blessings; break
      case 'curse': effectPool = pool.curses; break
      case 'omen': effectPool = pool.omens; break
      case 'revelation': effectPool = pool.revelations; break
    }

    if (effectPool.length === 0) {
      return { intervened: false, deity: '', effect: '', luckMod: 0, healthMod: 0 }
    }

    const effect = pickRandom(effectPool)
    return {
      intervened: true,
      deity,
      effect: `${deity}${effect.text}`,
      luckMod: effect.luckMod,
      healthMod: effect.healthMod,
    }
  }

  // ========== 私有方法 ==========

  private _resolveWorldview(context: RoundContext): string | undefined {
    if (this._state.worldview) return this._state.worldview

    const celestial = context.subsystemStates['celestial']
    if (celestial?.data) {
      const worldview = (celestial.data as Record<string, unknown>).worldview
      if (typeof worldview === 'string') {
        this._state.worldview = worldview
        return worldview
      }
    }
    return undefined
  }

  private _advance(worldview: string | undefined, context: RoundContext): void {
    const pool = getDeityPool(worldview)
    if (pool.deities.length === 0) {
      this._state.enabled = false
      this._state.initialized = true
      return
    }

    this._state.enabled = true

    // 首次初始化
    if (!this._state.initialized) {
      const count = MIN_INITIAL_DEITIES +
        Math.floor(Math.random() * (MAX_INITIAL_DEITIES - MIN_INITIAL_DEITIES + 1))
      this._state.activeDeities = pickRandomN(pool.deities, count)
      const divineFavor: Record<string, number> = {}
      for (const deity of this._state.activeDeities) {
        divineFavor[deity] = FAVOR_INITIAL
      }
      this._state.divineFavor = divineFavor
      this._state.initialized = true
    }

    // 从 FaithSystem 读取信仰等级（无信仰则为 50 中值）
    const faithData = context.subsystemStates['faith']?.data as { devotionLevel?: number } | undefined
    const faithLevel = clamp(
      typeof faithData?.devotionLevel === 'number' ? faithData.devotionLevel : 50,
      0, 100,
    )

    // 新神出现：信仰 > 70 → 10%/年
    if (faithLevel > HIGH_FAITH_THRESHOLD && Math.random() < 0.1) {
      const candidates = pool.newDeities.filter((d) => !this._state.activeDeities.includes(d))
      if (candidates.length > 0) {
        const newDeity = pickRandom(candidates)
        this._state.activeDeities = [...this._state.activeDeities, newDeity]
        this._state.divineFavor = { ...this._state.divineFavor, [newDeity]: round(faithLevel * 0.8) }
      }
    }

    // 旧神离去：信仰 < 20 → 8%/年，最少保持 3 个
    if (faithLevel < LOW_FAITH_THRESHOLD && this._state.activeDeities.length > MIN_INITIAL_DEITIES) {
      if (Math.random() < 0.08) {
        const toRemove = this._state.activeDeities[this._state.activeDeities.length - 1]
        this._state.activeDeities = this._state.activeDeities.filter((d) => d !== toRemove)
        const newDivineFavor: Record<string, number> = {}
        for (const d of this._state.activeDeities) {
          newDivineFavor[d] = this._state.divineFavor[d] ?? FAVOR_INITIAL
        }
        this._state.divineFavor = newDivineFavor
      }
    }

    // 神恩波动
    const newDivineFavor: Record<string, number> = {}
    for (const deity of this._state.activeDeities) {
      const change = pickRandom([-3, -2, -1, 1, 2, 3])
      let newFavor = (this._state.divineFavor[deity] ?? FAVOR_INITIAL) + change

      if (faithLevel > HIGH_FAITH_THRESHOLD) newFavor += 1
      else if (faithLevel < LOW_FAITH_THRESHOLD) newFavor -= 1

      newDivineFavor[deity] = clamp(newFavor, FAVOR_MIN, FAVOR_MAX)
    }
    this._state.divineFavor = newDivineFavor

    // 干预概率
    this._state.interventionProbability =
      round(clamp((faithLevel / 100) * INTERVENTION_BASE_MULTIPLIER, 0, INTERVENTION_BASE_MULTIPLIER), 4)
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    const summary = this._buildSummary()
    return {
      id: this.id,
      summary,
      data: structuredClone(s as unknown as Record<string, unknown>),
    }
  }

  private _buildSummary(): string {
    const s = this._state
    if (!s.enabled || s.activeDeities.length === 0) return ''

    const sorted = [...s.activeDeities].sort(
      (a, b) => (s.divineFavor[b] ?? 0) - (s.divineFavor[a] ?? 0),
    )

    // 逐神祇状态标签
    const deityLines = sorted.map((d) => {
      const favor = s.divineFavor[d] ?? FAVOR_INITIAL
      const label = getFavorLabel(favor)
      return `【${d}】神恩${favor}(${label})`
    })

    const parts: string[] = []

    // 全体状态概述
    const highFavorDeities = sorted.filter((d) => (s.divineFavor[d] ?? 0) >= HIGH_FAITH_THRESHOLD)
    const lowFavorDeities = sorted.filter((d) => (s.divineFavor[d] ?? 0) <= LOW_FAITH_THRESHOLD)

    // 神战/神恩竞争检测
    if (highFavorDeities.length >= 2) {
      parts.push(`⚠️神恩竞争：${highFavorDeities.join('、')}神恩高涨，可能引发信徒冲突或神战`)
    }

    // 信仰危机检测
    if (lowFavorDeities.length === sorted.length) {
      parts.push('⚠️信仰危机：所有神明神恩低迷，神明可能遗弃此世界')
    }

    // 逐神祇详情
    parts.push(`神祇状态：${deityLines.join('；')}`)

    // 干预概率
    parts.push(`干预概率：${Math.round(s.interventionProbability * 100)}%`)

    return parts.join(' | ')
  }
}

// ========== 类型导出 ==========

export interface DivineInterventionResult {
  intervened: boolean
  deity: string
  effect: string
  luckMod: number
  healthMod: number,
}
