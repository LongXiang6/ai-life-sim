/**
 * @module memory-engine-system.ts
 * @description 长期记忆引擎 —— 从 AI 叙事中自动提取结构化记忆，双通道提取（叙事文本+数值属性）
 * @mod mod-engine
 *
 * 设计理念：从 AI 叙事中自动提取结构化记忆，让角色有"人生履历"
 *
 * 双通道提取：
 *   1. 叙事文本通道：通过 40+ 条正则规则从叙事文本中提取信息
 *   2. 数值属性通道：从子系统状态中提取数值变化
 *
 * 三层世界观覆盖：
 *   1. 基础人际关系（父母、配偶、子女、朋友、敌人）
 *   2. 身份与地位（头衔、派系、职位）
 *   3. 财富与资源（财富等级、资产、声誉）
 *
 * 重构说明：
 *   引入统一模式管理层（PatternManager）作为可选项，
 *   通过 USE_PATTERN_MANAGER 特性开关控制是否使用新模式。
 *   默认关闭，确保向后兼容。
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { LongTermMemory } from '@/foundation/types/narrative.types'
import { patternManager } from '../patterns'

// ============================================================
// 特性开关
// ============================================================

/** 是否使用统一模式管理层（默认关闭，确保向后兼容） */
let USE_PATTERN_MANAGER = false

/**
 * 启用统一模式管理器
 */
export function enablePatternManager(): void {
  USE_PATTERN_MANAGER = true
}

/**
 * 禁用统一模式管理器
 */
export function disablePatternManager(): void {
  USE_PATTERN_MANAGER = false
}

/**
 * 获取模式管理器启用状态
 * @returns 是否启用统一模式管理器
 */
export function isPatternManagerEnabled(): boolean {
  return USE_PATTERN_MANAGER
}

// ============================================================
// 正则提取规则（40+条，对齐废弃项目 memory.ts）
// ============================================================

/** 人际关系提取规则 */
const RELATIONSHIP_PATTERNS = [
  // 配偶关系
  { pattern: /(娶|嫁|成婚|结婚|配偶|伴侣)(.+?)[，。！]/, type: 'spouse' as const },
  { pattern: /与(.+?)结为夫妻/, type: 'spouse' as const },
  { pattern: /与(.+?)喜结连理/, type: 'spouse' as const },

  // 父母关系
  { pattern: /父亲(.+?)(?:，|。|的)/, type: 'father' as const },
  { pattern: /母亲(.+?)(?:，|。|的)/, type: 'mother' as const },
  { pattern: /父母(.+?)(?:，|。)/, type: 'parents' as const },

  // 子女关系
  { pattern: /生下(.+?)[，。]/, type: 'child' as const },
  { pattern: /诞下(.+?)[，。]/, type: 'child' as const },
  { pattern: /得子(.+?)[，。]/, type: 'child' as const },
  { pattern: /女儿(.+?)(?:，|。|的)/, type: 'child' as const },

  // 朋友关系
  { pattern: /与(.+?)成为好友/, type: 'friend' as const },
  { pattern: /结识(.+?)，成为知己/, type: 'friend' as const },
  { pattern: /和(.+?)是好友/, type: 'friend' as const },

  // 敌人关系
  { pattern: /与(.+?)反目成仇/, type: 'enemy' as const },
  { pattern: /视(.+?)为仇敌/, type: 'enemy' as const },
  { pattern: /与(.+?)结下梁子/, type: 'enemy' as const },

  // 师徒关系
  { pattern: /拜(.+?)为师/, type: 'master' as const },
  { pattern: /收(.+?)为徒/, type: 'disciple' as const },

  // 亲属关系
  { pattern: /兄(.+?)(?:，|。|的)/, type: 'brother' as const },
  { pattern: /弟(.+?)(?:，|。|的)/, type: 'brother' as const },
  { pattern: /姐(.+?)(?:，|。|的)/, type: 'sister' as const },
  { pattern: /妹(.+?)(?:，|。|的)/, type: 'sister' as const },
]

/** 身份地位提取规则 */
const STATUS_PATTERNS = [
  // 头衔
  { pattern: /获得称号「(.+?)」/, type: 'title' as const },
  { pattern: /被封为(.+?)[，。]/, type: 'title' as const },
  { pattern: /称号「(.+?)」/, type: 'title' as const },

  // 派系/组织
  { pattern: /加入(.+?)[门|派|教|帮|盟]/, type: 'faction' as const },
  { pattern: /成为(.+?)的一员/, type: 'faction' as const },
  { pattern: /加入(.+?)组织/, type: 'faction' as const },

  // 职位
  { pattern: /担任(.+?)一职/, type: 'position' as const },
  { pattern: /被任命为(.+?)[，。]/, type: 'position' as const },
  { pattern: /晋升为(.+?)[，。]/, type: 'position' as const },

  // 爵位
  { pattern: /封为(.+?)[公|侯|伯|子|男]/, type: 'noble' as const },
  { pattern: /晋封(.+?)[，。]/, type: 'noble' as const },
]

/** 财富资源提取规则 */
const WEALTH_PATTERNS = [
  // 财富获得
  { pattern: /获得(.+?)金币/, type: 'wealth_gold' as const },
  { pattern: /得到(.+?)银两/, type: 'wealth_silver' as const },
  { pattern: /意外之财/, type: 'wealth_windfall' as const },
  { pattern: /富可敌国/, type: 'wealth_extreme' as const },

  // 资产
  { pattern: /购置(.+?)房产/, type: 'asset_property' as const },
  { pattern: /拥有(.+?)店铺/, type: 'asset_shop' as const },
  { pattern: /买下(.+?)庄园/, type: 'asset_manor' as const },

  // 声誉
  { pattern: /名满天下/, type: 'reputation_famous' as const },
  { pattern: /声名远播/, type: 'reputation_wide' as const },
  { pattern: /臭名昭著/, type: 'reputation_bad' as const },
]

/** 地点提取规则 */
const LOCATION_PATTERNS = [
  { pattern: /来到(.+?)[城|镇|村|府|宫|殿]/, type: 'location' as const },
  { pattern: /抵达(.+?)[，。]/, type: 'location' as const },
  { pattern: /前往(.+?)[，。]/, type: 'location' as const },
  { pattern: /定居(.+?)[，。]/, type: 'location' as const },
]

/** 重大事件提取规则 */
const EVENT_PATTERNS = [
  { pattern: /突破(.+?)境界/, type: 'breakthrough' as const },
  { pattern: /修炼至(.+?)[，。]/, type: 'cultivation' as const },
  { pattern: /战胜(.+?)[，。]/, type: 'victory' as const },
  { pattern: /大败于(.+?)[，。]/, type: 'defeat' as const },
  { pattern: /奇遇(.+?)[，。]/, type: 'adventure' as const },
  { pattern: /发现(.+?)[，。]/, type: 'discovery' as const },
  { pattern: /获得(.+?)[宝|器|丹|书]/, type: 'treasure' as const },
]

// ============================================================
// 长期记忆引擎子系统
// ============================================================

export class MemoryEngineSystem implements ISubSystem {
  readonly id = 'memory-engine' as const
  readonly mod = 'mod-engine' as const
  readonly label = '长期记忆引擎' as const
  readonly description = '从 AI 叙事中自动提取结构化记忆，双通道提取（叙事文本+数值属性），让角色有完整的人生履历' as const

  private memory: LongTermMemory = {
    majorEvents: [],
    relationships: [],
  }

  private lastExtractedRound = 0

  // 统一模式管理器（受 USE_PATTERN_MANAGER 特性开关控制，默认关闭）
  private getPatternManager(): typeof patternManager {
    return patternManager
  }

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext): SubSystemState {
    const eventCount = this.memory.majorEvents.length
    const relationCount = this.memory.relationships.length
    return {
      id: this.id,
      summary: `【${this.label}】记忆条目: 事件×${eventCount} | 关系×${relationCount}`,
      data: structuredClone(this.memory) as unknown as Record<string, unknown>,
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return

    const ch = changes.changes as Partial<LongTermMemory>
    const desc = changes.description ?? '';
    void desc;
    if (ch.spouse) this.memory.spouse = ch.spouse
    if (ch.children) this.memory.children = ch.children
    if (ch.parents) this.memory.parents = ch.parents
    if (ch.faction) this.memory.faction = ch.faction
    if (ch.titles) this.memory.titles = ch.titles
    if (ch.locations) this.memory.locations = ch.locations
    if (ch.wealth) this.memory.wealth = ch.wealth
    if (ch.reputation) this.memory.reputation = ch.reputation
  }

  reset(): void {
    this.memory = {
      majorEvents: [],
      relationships: [],
    }
    this.lastExtractedRound = 0
  }

  // ============================================================
  // 公共方法
  // ============================================================

  /** 获取当前长期记忆 */
  getMemory(): LongTermMemory {
    return { ...this.memory }
  }

  /**
   * 从叙事文本中提取记忆
   * @param narrative 叙事文本
   * @param round 当前回合
   */
  extractFromNarrative(narrative: string, round: number): void {
    if (!narrative || narrative.trim() === '') return
    if (round <= this.lastExtractedRound) return

    this.lastExtractedRound = round

    // 提取人际关系
    this.extractRelationships(narrative, round)

    // 提取身份地位
    this.extractStatus(narrative, round)

    // 提取财富资源
    this.extractWealth(narrative, round)

    // 提取地点
    this.extractLocations(narrative)

    // 提取重大事件
    this.extractEvents(narrative, round)
  }

  /**
   * 从子系统状态中提取数值属性变化
   * @param subsystemStates 所有子系统状态
   * @param round 当前回合
   */
  extractFromAttr(subsystemStates: Record<string, SubSystemState>, _round: number): void {
    // 从 character-base 提取属性变化
    const charBase = subsystemStates['character-base']
    if (charBase?.data) {
      const data = charBase.data as Record<string, unknown>
      if (data.current) {
        const attrs = data.current as Record<string, number>
        this.updateReputationFromAttrs(attrs)
      }
    }

    // 从 economy 提取财富
    const economy = subsystemStates['economy']
    if (economy?.data) {
      const data = economy.data as Record<string, unknown>
      if (typeof data.wealth === 'number') {
        this.memory.wealth = {
          description: this.getWealthDescription(data.wealth as number),
          level: Math.min(10, Math.floor((data.wealth as number) / 1000)),
        }
      }
    }

    // 从 reputation 提取声望
    const reputation = subsystemStates['reputation']
    if (reputation?.data) {
      const data = reputation.data as Record<string, unknown>
      if (typeof data.score === 'number') {
        if (!this.memory.reputation) this.memory.reputation = {}
        this.memory.reputation['general'] = data.score as number
      }
    }
  }

  /** 构建记忆摘要文本（用于注入 Prompt） */
  buildMemorySummary(): string {
    const parts: string[] = []

    if (this.memory.spouse) {
      parts.push(`配偶：${this.memory.spouse.name}`)
    }

    if (this.memory.children?.length) {
      const children = this.memory.children.map(c => c.name).join('、')
      parts.push(`子女：${children}`)
    }

    if (this.memory.parents) {
      const parentNames = []
      if (this.memory.parents.father) parentNames.push(`父：${this.memory.parents.father.name}`)
      if (this.memory.parents.mother) parentNames.push(`母：${this.memory.parents.mother.name}`)
      if (parentNames.length) parts.push(parentNames.join('，'))
    }

    if (this.memory.faction) {
      parts.push(`势力：${this.memory.faction.name}（${this.memory.faction.role}）`)
    }

    if (this.memory.titles?.length) {
      parts.push(`头衔：${this.memory.titles.join('、')}`)
    }

    if (this.memory.wealth) {
      parts.push(`财富：${this.memory.wealth.description}`)
    }

    if (this.memory.locations?.length) {
      parts.push(`曾到过：${this.memory.locations.join('、')}`)
    }

    // 最近重大事件
    if (this.memory.majorEvents.length) {
      const recentEvents = this.memory.majorEvents.slice(-3)
      parts.push(`近期事件：${recentEvents.map(e => e.description).join('；')}`)
    }

    if (parts.length === 0) {
      return '尚无特殊记忆'
    }

    return `【记忆档案】\n${parts.join('\n')}`
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 提取人际关系
   *
   * 如果启用了模式管理器，优先使用模式管理器提取。
   * 否则使用传统的正则匹配方式。
   */
  private extractRelationships(narrative: string, round: number): void {
    if (USE_PATTERN_MANAGER) {
      this.extractRelationshipsWithPatternManager(narrative, round)
    } else {
      this.extractRelationshipsWithLegacy(narrative, round)
    }
  }

  /**
   * 使用模式管理器提取人际关系
   */
  private extractRelationshipsWithPatternManager(narrative: string, round: number): void {
    const pm = this.getPatternManager() as { extractRelationships: (text: string) => Array<{ type?: string; name?: string }> } | null
    if (!pm) {
      // 降级到传统方式
      this.extractRelationshipsWithLegacy(narrative, round)
      return
    }

    const relationships = pm.extractRelationships(narrative)

    for (const rel of relationships) {
      if (!rel || !rel.type) continue

      const name = (rel.name as string) || ''
      const type = rel.type as string

      switch (type) {
        case 'spouse':
          this.memory.spouse = { name, sinceRound: round, relationQuality: 80 }
          this.addRelationship(name, '配偶', 80)
          this.addMajorEvent(round, `与${name}结为伴侣`, 'relationship')
          break

        case 'father':
          if (!this.memory.parents) this.memory.parents = {}
          this.memory.parents.father = { name, age: 0, isAlive: true }
          this.addRelationship(name, '父亲', 90)
          break

        case 'mother':
          if (!this.memory.parents) this.memory.parents = {}
          this.memory.parents.mother = { name, age: 0, isAlive: true }
          this.addRelationship(name, '母亲', 90)
          break

        case 'child':
          if (!this.memory.children) this.memory.children = []
          this.memory.children.push({ name, age: 0, gender: 'unknown' })
          this.addRelationship(name, '子女', 95)
          this.addMajorEvent(round, `生下${name}`, 'family')
          break

        case 'friend':
          this.addRelationship(name, '好友', 70)
          this.addMajorEvent(round, `与${name}成为好友`, 'relationship')
          break

        case 'enemy':
          this.addRelationship(name, '仇敌', -50)
          this.addMajorEvent(round, `与${name}反目成仇`, 'conflict')
          break

        case 'master':
          this.addRelationship(name, '师父', 85)
          this.addMajorEvent(round, `拜${name}为师`, 'relationship')
          break

        case 'disciple':
          this.addRelationship(name, '弟子', 75)
          this.addMajorEvent(round, `收${name}为徒`, 'relationship')
          break

        case 'brother':
          this.addRelationship(name, '兄弟', 80)
          break

        case 'sister':
          this.addRelationship(name, '姐妹', 80)
          break
      }
    }
  }

  /**
   * 使用传统正则匹配提取人际关系
   */
  private extractRelationshipsWithLegacy(narrative: string, round: number): void {
    for (const { pattern, type } of RELATIONSHIP_PATTERNS) {
      const match = narrative.match(pattern)
      if (match) {
        const name = match[1].trim()

        switch (type) {
          case 'spouse':
            this.memory.spouse = { name, sinceRound: round, relationQuality: 80 }
            this.addRelationship(name, '配偶', 80)
            this.addMajorEvent(round, `与${name}结为伴侣`, 'relationship')
            break

          case 'father':
            if (!this.memory.parents) this.memory.parents = {}
            this.memory.parents.father = { name, age: 0, isAlive: true }
            this.addRelationship(name, '父亲', 90)
            break

          case 'mother':
            if (!this.memory.parents) this.memory.parents = {}
            this.memory.parents.mother = { name, age: 0, isAlive: true }
            this.addRelationship(name, '母亲', 90)
            break

          case 'parents':
            if (!this.memory.parents) this.memory.parents = {}
            this.addRelationship(name, '父母', 90)
            break

          case 'child':
            if (!this.memory.children) this.memory.children = []
            this.memory.children.push({ name, age: 0, gender: 'unknown' })
            this.addRelationship(name, '子女', 95)
            this.addMajorEvent(round, `生下${name}`, 'family')
            break

          case 'friend':
            this.addRelationship(name, '好友', 70)
            this.addMajorEvent(round, `与${name}成为好友`, 'relationship')
            break

          case 'enemy':
            this.addRelationship(name, '仇敌', -50)
            this.addMajorEvent(round, `与${name}反目成仇`, 'conflict')
            break

          case 'master':
            this.addRelationship(name, '师父', 85)
            this.addMajorEvent(round, `拜${name}为师`, 'relationship')
            break

          case 'disciple':
            this.addRelationship(name, '弟子', 75)
            this.addMajorEvent(round, `收${name}为徒`, 'relationship')
            break

          case 'brother':
            this.addRelationship(name, '兄弟', 80)
            break

          case 'sister':
            this.addRelationship(name, '姐妹', 80)
            break
        }
      }
    }
  }

  private extractStatus(narrative: string, round: number): void {
    for (const { pattern, type } of STATUS_PATTERNS) {
      const match = narrative.match(pattern)
      if (match) {
        const value = match[1].trim()

        switch (type) {
          case 'title':
            if (!this.memory.titles) this.memory.titles = []
            if (!this.memory.titles.includes(value)) {
              this.memory.titles.push(value)
              this.addMajorEvent(round, `获得称号「${value}」`, 'achievement')
            }
            break

          case 'faction':
            this.memory.faction = { name: value, role: '成员', rank: 1 }
            this.addMajorEvent(round, `加入${value}`, 'organization')
            break

          case 'position':
            this.addMajorEvent(round, `担任${value}`, 'career')
            break

          case 'noble':
            if (!this.memory.titles) this.memory.titles = []
            if (!this.memory.titles.includes(value)) {
              this.memory.titles.push(value)
              this.addMajorEvent(round, `晋封${value}`, 'achievement')
            }
            break
        }
      }
    }
  }

  private extractWealth(narrative: string, round: number): void {
    for (const { pattern, type } of WEALTH_PATTERNS) {
      const match = narrative.match(pattern)
      if (match) {
        const value = match[1]?.trim() || ''

        switch (type) {
          case 'wealth_gold':
          case 'wealth_silver':
            this.memory.wealth = {
              description: `拥有${value}财富`,
              level: this.memory.wealth?.level ? this.memory.wealth.level + 1 : 2,
            }
            this.addMajorEvent(round, `获得${value}财富`, 'wealth')
            break

          case 'wealth_windfall':
            this.memory.wealth = {
              description: '意外之财',
              level: this.memory.wealth?.level ? this.memory.wealth.level + 2 : 3,
            }
            this.addMajorEvent(round, '获得意外之财', 'wealth')
            break

          case 'wealth_extreme':
            this.memory.wealth = { description: '富可敌国', level: 10 }
            this.addMajorEvent(round, '富可敌国', 'wealth')
            break

          case 'asset_property':
          case 'asset_shop':
          case 'asset_manor':
            if (!this.memory.wealth) this.memory.wealth = { description: '', level: 1 }
            this.memory.wealth.level = Math.min(10, this.memory.wealth.level + 1)
            this.addMajorEvent(round, `购置${value}`, 'wealth')
            break

          case 'reputation_famous':
          case 'reputation_wide':
            if (!this.memory.reputation) this.memory.reputation = {}
            this.memory.reputation['general'] = (this.memory.reputation['general'] || 0) + 20
            this.addMajorEvent(round, '声名远播', 'reputation')
            break

          case 'reputation_bad':
            if (!this.memory.reputation) this.memory.reputation = {}
            this.memory.reputation['general'] = (this.memory.reputation['general'] || 0) - 30
            this.addMajorEvent(round, '声名狼藉', 'reputation')
            break
        }
      }
    }
  }

  private extractLocations(narrative: string): void {
    for (const { pattern } of LOCATION_PATTERNS) {
      const match = narrative.match(pattern)
      if (match) {
        const location = match[1].trim()
        if (!this.memory.locations) this.memory.locations = []
        if (!this.memory.locations.includes(location)) {
          this.memory.locations.push(location)
        }
      }
    }
  }

  private extractEvents(narrative: string, round: number): void {
    for (const { pattern, type } of EVENT_PATTERNS) {
      const match = narrative.match(pattern)
      if (match) {
        const value = match[1]?.trim() || ''

        switch (type) {
          case 'breakthrough':
            this.addMajorEvent(round, `突破${value}境界`, 'cultivation')
            break

          case 'cultivation':
            this.addMajorEvent(round, `修炼至${value}`, 'cultivation')
            break

          case 'victory':
            this.addMajorEvent(round, `战胜${value}`, 'combat')
            break

          case 'defeat':
            this.addMajorEvent(round, `大败于${value}`, 'combat')
            break

          case 'adventure':
            this.addMajorEvent(round, `奇遇${value}`, 'adventure')
            break

          case 'discovery':
            this.addMajorEvent(round, `发现${value}`, 'discovery')
            break

          case 'treasure':
            this.addMajorEvent(round, `获得${value}`, 'treasure')
            break
        }
      }
    }
  }

  private addRelationship(name: string, relation: string, quality: number): void {
    const existing = this.memory.relationships.find(r => r.name === name)
    if (existing) {
      existing.relation = relation
      existing.quality = quality
    } else {
      this.memory.relationships.push({ name, relation, quality })
      // 上限保护：保持最多 50 条关系记录
      if (this.memory.relationships.length > 50) {
        this.memory.relationships.shift()
      }
    }
  }

  private addMajorEvent(round: number, description: string, category: string): void {
    // 避免重复事件
    const exists = this.memory.majorEvents.some(
      e => e.round === round && e.description === description
    )
    if (!exists) {
      this.memory.majorEvents.push({ round, description, category })
      // 保持最多 50 条事件记录
      if (this.memory.majorEvents.length > 50) {
        this.memory.majorEvents.shift()
      }
    }
  }

  private updateReputationFromAttrs(attrs: Record<string, number>): void {
    // 魅力属性影响声誉
    const charisma = attrs.charisma || 0
    if (charisma !== 0) {
      if (!this.memory.reputation) this.memory.reputation = {}
      this.memory.reputation['charm'] = charisma * 10
    }
  }

  private getWealthDescription(value: number): string {
    if (value >= 1000000) return '富可敌国'
    if (value >= 100000) return '家财万贯'
    if (value >= 10000) return '家境殷实'
    if (value >= 1000) return '小有积蓄'
    if (value >= 100) return '温饱无忧'
    return '清贫度日'
  }
}

/** 单例 */
export const memoryEngine = new MemoryEngineSystem()
