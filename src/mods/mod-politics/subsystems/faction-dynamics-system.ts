/**
 * @module FactionDynamicsSystem
 * @description 派系动态子系统：派系影响力变化、派系间关系网、玩家加入/贡献晋升、新派系涌现、涨跌状态追踪
 * @mod mod-politics
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, consumeSimulationYears } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { FactionState, Faction, FactionStatus } from '../types'

import {
  MAX_FACTIONS,
  FACTION_TYPE_LABELS,
  FACTION_STATUS_LABELS,
  FACTION_RANKS,
  WORLDVIEW_FACTION_TEMPLATES,
  DEFAULT_FACTION_TEMPLATES,
  FACTION_RIVAL_PROBABILITY,
  FACTION_ALLY_PROBABILITY,
  round,
  clamp,
  pickRandom,
  randomInRange,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const FACTION_TYPES = Object.keys(FACTION_TYPE_LABELS) as Array<'political' | 'military' | 'religious' | 'commercial' | 'academic' | 'secret'>

const FACTION_NAME_PREFIXES: readonly string[] = [
  '铁血', '天机', '紫微', '星辰', '苍龙', '白虎', '朱雀', '玄武',
  '青云', '碧落', '幽兰', '烈焰', '寒冰', '雷霆', '风暴', '光明',
]

const FACTION_NAME_SUFFIXES: readonly string[] = [
  '盟', '会', '派', '门', '阁', '院', '堂', '社',
  '阵线', '同盟', '教', '团', '府', '司', '局', '帮',
]

const FACTION_GOALS: readonly string[] = [
  '掌控朝政', '扩张军力', '传播信仰', '垄断商路',
  '弘扬学术', '暗中支配', '推翻朝廷', '建立新秩序',
  '守护传统', '改革体制', '获取财富', '扩张领地',
]

let _factionIdCounter = 0

const FACTION_TAG_MAP: AttrTagMap = {
  '派系': 'influence', '影响力': 'influence', '势力': 'influence',
  '态度': 'attitude',
}

export class FactionDynamicsSystem implements ISubSystem {
  readonly id = 'faction-dynamics' as const
  readonly mod = 'mod-politics' as const
  readonly label = '派系动态' as const
  readonly description = '管理派系影响力变化、派系间关系网、玩家加入派系与贡献晋升、新派系涌现与涨跌状态' as const

  private state: FactionState = this.createInitialState()
  private _lastProcessedRound = -1
  private _simYearAccumulator = { value: 0 }
  private _worldview = ''

  /** 设置世界观（影响初始派系模板选择） */
  setWorldview(wv: string): void {
    this._worldview = wv
    if (this._lastProcessedRound < 0) {
      this.state = this.createInitialState()
    }
  }

  private createInitialState(): FactionState {
    return {
      factions: this.generateInitialFactions(),
      playerFactionId: null,
      playerContribution: 0,
      playerRank: 0,
    }
  }

  private generateInitialFactions(): Faction[] {
    const templates = this._worldview
      ? (WORLDVIEW_FACTION_TEMPLATES[this._worldview] ?? DEFAULT_FACTION_TEMPLATES)
      : DEFAULT_FACTION_TEMPLATES

    const factions: Faction[] = []
    for (const tpl of templates) {
      factions.push(this.createFactionFromTemplate(tpl.name, tpl.type, tpl.goal))
    }

    this.initializeRelationships(factions)

    return factions
  }

  private createFactionFromTemplate(name: string, type: string, goal: string): Faction {
    const influence = randomInRange(10, 60)
    return {
      id: `faction-${++_factionIdCounter}`,
      name,
      type: type as Faction['type'],
      memberCount: randomInRange(100, 5000),
      influence,
      goal,
      attitudeToPlayer: randomInRange(-20, 40),
      rivals: [],
      allies: [],
      status: pickRandom(['rising', 'stable', 'declining'] as FactionStatus[]),
      lastInfluence: influence,
    }
  }

  /** 在派系间建立初始同盟/敌对关系 */
  private initializeRelationships(factions: Faction[]): void {
    for (let i = 0; i < factions.length; i++) {
      for (let j = i + 1; j < factions.length; j++) {
        const roll = Math.random()
        if (roll < FACTION_RIVAL_PROBABILITY) {
          factions[i].rivals.push(factions[j].id)
          factions[j].rivals.push(factions[i].id)
        } else if (roll < FACTION_RIVAL_PROBABILITY + FACTION_ALLY_PROBABILITY) {
          factions[i].allies.push(factions[j].id)
          factions[j].allies.push(factions[i].id)
        }
      }
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

    const years = consumeSimulationYears(this._simYearAccumulator, context, () => {
      this.advanceFactions(1)
    })
    if (years > 0 && years < 1) {
      this.advanceFactionsPartial(years)
    }

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

    if (typeof c.yearsAdvanced === 'number') {
      this.advanceFactions(c.yearsAdvanced)
    }

    // 玩家加入派系
    if (typeof c.joinFaction === 'string') {
      this.joinFaction(c.joinFaction)
    }

    // 玩家脱离派系
    if (c.leaveFaction === true) {
      this.leaveFaction()
    }

    // 增加贡献
    if (typeof c.addContribution === 'number') {
      this.addContribution(c.addContribution)
    }

    // AI 创建新派系
    if (c.addFaction === true && c.faction && typeof c.faction === 'object') {
      if (this.state.factions.length >= MAX_FACTIONS) {
        return
      }
      const f = c.faction as Record<string, unknown>
      const influence = typeof f.influence === 'number' ? clamp(f.influence, 0, 100) : 20
      const faction: Faction = {
        id: (f.id as string) || `faction-${++_factionIdCounter}`,
        name: (f.name as string) || '新派系',
        type: (f.type as Faction['type']) || 'political',
        memberCount: typeof f.memberCount === 'number' ? f.memberCount : 100,
        influence,
        goal: (f.goal as string) || '未公开',
        attitudeToPlayer: typeof f.attitudeToPlayer === 'number' ? clamp(f.attitudeToPlayer, -100, 100) : 0,
        rivals: Array.isArray(f.rivals) ? f.rivals as string[] : [],
        allies: Array.isArray(f.allies) ? f.allies as string[] : [],
        status: (f.status as FactionStatus) || (pickRandom(['rising', 'stable', 'declining'] as FactionStatus[])),
        lastInfluence: influence,
      }
      this.state.factions.push(faction)
    }

    if (c.removeFaction === true && typeof c.factionId === 'string') {
      this.state.factions = this.state.factions.filter((f) => f.id !== c.factionId)
    }

    if (typeof c.adjustAttitude === 'number' && typeof c.factionId === 'string') {
      const faction = this.state.factions.find((f) => f.id === c.factionId)
      if (faction) {
        faction.attitudeToPlayer = round(clamp(
          faction.attitudeToPlayer + c.adjustAttitude,
          -100,
          100,
        ))
      }
    }

    if (typeof c.setInfluence === 'number' && typeof c.factionId === 'string') {
      const faction = this.state.factions.find((f) => f.id === c.factionId)
      if (faction) {
        faction.lastInfluence = faction.influence
        faction.influence = round(clamp(c.setInfluence, 0, 100))
      }
    }

    // P2 降级：AI JSON 未显式声明派系变化时，从 description 中补偿提取
    const hasExplicit = typeof c.yearsAdvanced === 'number' || c.addFaction === true ||
      c.removeFaction === true || typeof c.adjustAttitude === 'number' || typeof c.setInfluence === 'number'
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, FACTION_TAG_MAP)
      if (extracted && this.state.factions.length > 0) {
        const firstFaction = this.state.factions[0]
        if (typeof extracted.influence === 'number') {
          firstFaction.lastInfluence = firstFaction.influence
          firstFaction.influence = clamp(firstFaction.influence + extracted.influence, 0, 100)
        }
        if (typeof extracted.attitude === 'number') {
          firstFaction.attitudeToPlayer = clamp(firstFaction.attitudeToPlayer + extracted.attitude, -100, 100)
        }
      }
    }
  }

  // ─── 内部逻辑 ───

  private advanceFactionsPartial(years: number): void {
    for (const faction of this.state.factions) {
      faction.lastInfluence = faction.influence
      const allyBonus = faction.allies.length * 0.2
      const rivalPenalty = faction.rivals.length * 0.3
      const memberFactor = Math.log10(Math.max(10, faction.memberCount)) * 0.5
      faction.influence = round(clamp(
        faction.influence + ((Math.random() - 0.5) * 3 + memberFactor + allyBonus - rivalPenalty) * years,
        0,
        100,
      ))
    }
  }

  private advanceFactions(years: number): void {
    for (let y = 0; y < years; y++) {
      for (const faction of this.state.factions) {
        // 保存上一轮影响力
        faction.lastInfluence = faction.influence

        // 影响力波动：基础随机 + 同盟增强 + 敌对削弱 + 成员规模
        const allyBonus = faction.allies.length * 0.2
        const rivalPenalty = faction.rivals.length * 0.3
        const memberFactor = Math.log10(Math.max(10, faction.memberCount)) * 0.5
        faction.influence = round(clamp(
          faction.influence + (Math.random() - 0.5) * 3 + memberFactor + allyBonus - rivalPenalty,
          0,
          100,
        ))

        // 成员数变化
        const memberDelta = Math.round(
          faction.memberCount * ((Math.random() - 0.48) * 0.02 + faction.influence * 0.0001),
        )
        faction.memberCount = Math.max(10, faction.memberCount + memberDelta)

        // 对玩家态度随机漂移
        faction.attitudeToPlayer = round(clamp(
          faction.attitudeToPlayer + (Math.random() - 0.5) * 2,
          -100,
          100,
        ))

        // 更新涨跌状态
        if (faction.influence > faction.lastInfluence + 0.5) {
          faction.status = 'rising'
        } else if (faction.influence < faction.lastInfluence - 0.5) {
          faction.status = 'declining'
        } else {
          faction.status = 'stable'
        }
      }

      // 新派系涌现
      if (this.state.factions.length < MAX_FACTIONS && Math.random() < 0.03 * getFormulaModifier('factionEmergenceModifier')) {
        const name = pickRandom(FACTION_NAME_PREFIXES) + pickRandom(FACTION_NAME_SUFFIXES)
        const influence = randomInRange(5, 30)
        const newFaction: Faction = {
          id: `faction-${++_factionIdCounter}`,
          name,
          type: pickRandom(FACTION_TYPES),
          memberCount: randomInRange(50, 2000),
          influence,
          goal: pickRandom(FACTION_GOALS),
          attitudeToPlayer: randomInRange(-10, 30),
          rivals: [],
          allies: [],
          status: 'rising',
          lastInfluence: influence,
        }
        this.state.factions.push(newFaction)
      }
    }
  }

  // ─── 领域方法 ───

  getFactionCount(): number {
    return this.state.factions.length
  }

  getAllFactions(): Faction[] {
    return this.state.factions
  }

  getFaction(id: string): Faction | undefined {
    return this.state.factions.find((f) => f.id === id)
  }

  /** 玩家加入派系 */
  joinFaction(factionId: string): boolean {
    const faction = this.state.factions.find((f) => f.id === factionId)
    if (!faction) return false
    this.state.playerFactionId = factionId
    this.state.playerContribution = 0
    this.state.playerRank = 0
    return true
  }

  /** 玩家脱离派系 */
  leaveFaction(): void {
    this.state.playerFactionId = null
    this.state.playerContribution = 0
    this.state.playerRank = 0
  }

  /** 增加贡献值（触发自动晋升） */
  addContribution(amount: number): void {
    if (!this.state.playerFactionId) return
    this.state.playerContribution += Math.max(0, amount)

    // 自动晋升：从高到低匹配
    let newRank = 0
    for (let i = FACTION_RANKS.length - 1; i >= 0; i--) {
      if (this.state.playerContribution >= FACTION_RANKS[i].contributionRequired) {
        newRank = i
        break
      }
    }
    this.state.playerRank = newRank
  }

  /** 获取玩家当前等级标签 */
  getPlayerRankLabel(): string {
    if (!this.state.playerFactionId) return '未加入派系'
    return FACTION_RANKS[this.state.playerRank]?.name ?? '成员'
  }

  /** 获取玩家所属派系名 */
  getPlayerFactionName(): string {
    if (!this.state.playerFactionId) return ''
    const faction = this.state.factions.find((f) => f.id === this.state.playerFactionId)
    return faction?.name ?? ''
  }

  // ─── AI Prompt 格式化输出 ───

  formatForPrompt(): string {
    const lines: string[] = ['【派系动态概况】']

    // 玩家所属
    if (this.state.playerFactionId) {
      const factionName = this.getPlayerFactionName()
      const rankLabel = this.getPlayerRankLabel()
      lines.push(`玩家所属：${factionName}（等级：${rankLabel}，贡献值：${this.state.playerContribution}）`)
    }

    lines.push(`总览：${this.state.factions.length}/${MAX_FACTIONS} 个派系活跃`)
    lines.push('')

    for (const f of this.state.factions) {
      const typeLabel = FACTION_TYPE_LABELS[f.type] ?? f.type
      const statusLabel = FACTION_STATUS_LABELS[f.status] ?? f.status
      const attitudeLabel = f.attitudeToPlayer > 20 ? '友善' : f.attitudeToPlayer < -20 ? '敌对' : '中立'
      const parts = [
        `${f.name} [${typeLabel}] ${statusLabel}`,
        `影响力：${f.influence} | 成员：${f.memberCount}`,
        `目标：${f.goal}`,
        `对玩家：${attitudeLabel}(${f.attitudeToPlayer > 0 ? '+' : ''}${f.attitudeToPlayer})`,
      ]
      if (f.allies.length > 0) {
        const allyNames = f.allies.map((id) => {
          const a = this.state.factions.find((x) => x.id === id)
          return a?.name ?? '?'
        }).filter(Boolean)
        if (allyNames.length > 0) parts.push(`同盟：${allyNames.join('、')}`)
      }
      if (f.rivals.length > 0) {
        const rivalNames = f.rivals.map((id) => {
          const r = this.state.factions.find((x) => x.id === id)
          return r?.name ?? '?'
        }).filter(Boolean)
        if (rivalNames.length > 0) parts.push(`敌对：${rivalNames.join('、')}`)
      }
      lines.push(`  · ${parts.join(' | ')}`)
    }

    return lines.join('\n')
  }

  // ─── 摘要构建 ───

  private buildSummary(): string {
    const count = this.state.factions.length
    const topFactions = [...this.state.factions]
      .sort((a, b) => b.influence - a.influence)
      .slice(0, 3)
      .map((f) => `${f.name}（${FACTION_STATUS_LABELS[f.status]}·${f.influence}）`)
      .join('、')

    let playerInfo = ''
    if (this.state.playerFactionId) {
      playerInfo = ` | ${this.getPlayerFactionName()}·${this.getPlayerRankLabel()}`
    }

    return `【${this.label}】派系数：${count}/${MAX_FACTIONS}${topFactions ? ` · 主力：${topFactions}` : ''}${playerInfo}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    _factionIdCounter = 0
  }
}
