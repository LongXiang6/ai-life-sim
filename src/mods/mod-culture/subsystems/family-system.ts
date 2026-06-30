/**
 * @module FamilySystem
 * @description 家族子系统：成员增龄、生育概率、成员死亡、配偶关系质量、子女里程碑
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { FamilyState, FamilyMember, FamilyRole, SpouseStatus } from '../types'

import {
  BIRTH_PROBABILITY,
  MAX_CHILDREN,
  FAMILY_ROLE_LABELS,
  SPOUSE_STATUS_LABELS,
  MARRIAGE_SATISFACTION_DECAY,
  MARRIAGE_CONFLICT_WEALTH_THRESHOLD,
  MARRIAGE_REPAIR_PROBABILITY,
  MARRIAGE_REPAIR_AMOUNT,
  MILESTONE_SCHOOL_AGE,
  MILESTONE_ADULT_AGE,
  MILESTONE_MARRIAGE_AGE,
  CHILD_MARRIAGE_PROBABILITY,
  CHILD_INDEPENDENT_PROBABILITY,
  round,
  clamp,
  randomInRange,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const EFFECTIVE_BIRTH_MIN = 0.001
const EFFECTIVE_BIRTH_MAX = 0.5

const MALE_NAMES: readonly string[] = ['子轩', '子墨', '子涵', '子睿', '子昊', '子烨', '子铭', '子辰']
const FEMALE_NAMES: readonly string[] = ['若兰', '若曦', '若云', '若雪', '若汐', '若嫣', '若瑶', '若琳']

let _memberIdCounter = 0

export class FamilySystem implements ISubSystem {
  readonly id = 'family' as const
  readonly mod = 'mod-culture' as const
  readonly label = '家族系统' as const
  readonly description = '管理家族成员增龄、生育概率、成员死亡、配偶关系质量与子女里程碑' as const

  private state: FamilyState = this.createInitialState()
  private _lastProcessedRound = -1
  /** 种族最大寿命（从 lifespan 子系统读取） */
  private _maxAge = 100

  private createInitialState(): FamilyState {
    return {
      familyName: '无名氏',
      familyReputation: 20,
      familyWealth: 500,
      members: [],
      history: [],
    }
  }

  collectState(context: RoundContext): SubSystemState {
    // 从 lifespan 子系统读取种族最大寿命（用于死亡概率比率计算）
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data && typeof (lifespan.data as Record<string, unknown>).maxAge === 'number') {
      this._maxAge = (lifespan.data as Record<string, unknown>).maxAge as number
    }

    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    this.advanceFamily(getAgeYearsDelta(context), context.round.year)

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

    if (typeof c.yearsAdvanced === 'number') {
      this.advanceFamily(
        c.yearsAdvanced,
        typeof c.currentYear === 'number' ? c.currentYear : 0,
      )
    }

    if (typeof c.setFamilyName === 'string') {
      this.state.familyName = c.setFamilyName
    }

    if (typeof c.addFamilyReputation === 'number') {
      this.state.familyReputation = round(clamp(
        this.state.familyReputation + c.addFamilyReputation,
        0,
        100,
      ))
    }

    if (typeof c.addFamilyWealth === 'number') {
      this.state.familyWealth = round(Math.max(0, this.state.familyWealth + c.addFamilyWealth))
    }

    if (c.addMember === true && c.member && typeof c.member === 'object') {
      const m = c.member as Record<string, unknown>
      const member: FamilyMember = {
        id: (m.id as string) || `fam-${++_memberIdCounter}`,
        name: (m.name as string) || '新成员',
        role: (m.role as FamilyRole) || 'sibling',
        age: typeof m.age === 'number' ? m.age : 0,
        alive: m.alive !== false,
        ability: typeof m.ability === 'number' ? clamp(m.ability, 0, 100) : 30,
        affinity: typeof m.affinity === 'number' ? clamp(m.affinity, -100, 100) : 50,
        notes: (m.notes as string) || '',
      }
      // 初始化可选字段
      if (member.role === 'spouse') {
        member.relationshipQuality = typeof m.relationshipQuality === 'number'
          ? clamp(m.relationshipQuality, 0, 100) : 80
        member.spouseStatus = (m.spouseStatus as SpouseStatus) || 'happy'
      }
      if (member.role === 'child') {
        member.independent = m.independent === true
        member.married = m.married === true
        if (m.spouseName && typeof m.spouseName === 'string') {
          member.spouseName = m.spouseName
        }
      }
      this.state.members.push(member)
    }

    if (c.updateMember === true && typeof c.memberId === 'string') {
      const target = this.state.members.find((m) => m.id === c.memberId)
      if (target) {
        const updates = c.updates as Record<string, unknown> | undefined
        if (updates) {
          if (typeof updates.relationshipQuality === 'number') {
            target.relationshipQuality = clamp(updates.relationshipQuality, 0, 100)
          }
          if (typeof updates.spouseStatus === 'string') {
            target.spouseStatus = updates.spouseStatus as SpouseStatus
          }
          if (typeof updates.married === 'boolean') {
            target.married = updates.married
          }
          if (typeof updates.independent === 'boolean') {
            target.independent = updates.independent
          }
          if (typeof updates.spouseName === 'string') {
            target.spouseName = updates.spouseName
          }
          if (typeof updates.ability === 'number') {
            target.ability = clamp(updates.ability, 0, 100)
          }
          if (typeof updates.affinity === 'number') {
            target.affinity = clamp(updates.affinity, -100, 100)
          }
          if (typeof updates.notes === 'string') {
            target.notes = updates.notes
          }
        }
      }
    }

    if (c.removeMember === true && typeof c.memberId === 'string') {
      this.state.members = this.state.members.filter((m) => m.id !== c.memberId)
    }
  }

  // ─── 内部逻辑 ───

  private advanceFamily(years: number, currentYear: number): void {
    const events: string[] = []

    for (let y = 0; y < years; y++) {
      // ── 成员增龄 ──
      for (const member of this.state.members) {
        if (!member.alive) continue
        member.age++
        // 死亡概率 —— 基于寿命比例（等效人类年龄）
        const equivalentAge = (member.age / this._maxAge) * 100
        const deathProbability = equivalentAge > 60
          ? 0.03 * Math.pow(1.08, equivalentAge - 60)
          : 0.001 * Math.pow(1.05, equivalentAge)
        if (Math.random() < deathProbability) {
          member.alive = false
          // 如果是配偶去世，标记为丧偶
          if (member.role === 'spouse') {
            member.spouseStatus = 'widowed'
          }
          events.push(`家族成员${member.name}（${FAMILY_ROLE_LABELS[member.role]}）去世，享年${member.age}岁`)
        }
      }

      // ── 配偶关系质量 ──
      const spouse = this.state.members.find((m) => m.role === 'spouse' && m.alive)
      if (spouse) {
        // 初始化配偶关系字段
        if (spouse.relationshipQuality === undefined) spouse.relationshipQuality = 80
        if (spouse.spouseStatus === undefined) spouse.spouseStatus = 'happy'

        // 自然衰减
        spouse.relationshipQuality = round(clamp(
          spouse.relationshipQuality - MARRIAGE_SATISFACTION_DECAY,
          0,
          100,
        ))

        // 家境拮据导致冲突概率增加
        if (this.state.familyWealth < MARRIAGE_CONFLICT_WEALTH_THRESHOLD) {
          const conflictProb = 0.1 + (1 - this.state.familyWealth / MARRIAGE_CONFLICT_WEALTH_THRESHOLD) * 0.15
          if (Math.random() < conflictProb) {
            spouse.relationshipQuality = round(clamp(
              spouse.relationshipQuality - 5,
              0,
              100,
            ))
            events.push(`因家境拮据，与配偶${spouse.name}的关系出现裂痕`)
          }
        }

        // 家境好转后有概率修复关系
        if (this.state.familyWealth >= MARRIAGE_CONFLICT_WEALTH_THRESHOLD && spouse.relationshipQuality < 70) {
          if (Math.random() < MARRIAGE_REPAIR_PROBABILITY) {
            spouse.relationshipQuality = round(clamp(
              spouse.relationshipQuality + MARRIAGE_REPAIR_AMOUNT,
              0,
              100,
            ))
            events.push(`家境改善后，与配偶${spouse.name}的关系有所修复`)
          }
        }

        // 根据质量更新关系状态
        if (spouse.relationshipQuality >= 70) {
          if (spouse.spouseStatus !== 'happy') {
            spouse.spouseStatus = 'happy'
            events.push(`与配偶${spouse.name}的关系重归和睦`)
          }
        } else if (spouse.relationshipQuality >= 30) {
          if (spouse.spouseStatus === 'happy') {
            spouse.spouseStatus = 'strained'
            events.push(`与配偶${spouse.name}的关系变得紧张`)
          }
        } else {
          if (spouse.spouseStatus !== 'estranged' && spouse.spouseStatus !== 'widowed') {
            spouse.spouseStatus = 'estranged'
            events.push(`与配偶${spouse.name}的关系十分疏远`)
          }
        }
      }

      // ── 子女里程碑 ──
      for (const member of this.state.members) {
        if (!member.alive || member.role !== 'child') continue

        // 初始化可选字段
        if (member.independent === undefined) member.independent = false
        if (member.married === undefined) member.married = false

        // 入学年龄里程碑
        if (member.age === MILESTONE_SCHOOL_AGE) {
          events.push(`子女${member.name}年满${MILESTONE_SCHOOL_AGE}岁，到了入学年龄`)
        }

        // 成年里程碑
        if (member.age === MILESTONE_ADULT_AGE) {
          events.push(`子女${member.name}年满${MILESTONE_ADULT_AGE}岁，正式成年`)
        }

        // 婚嫁（成年后每年概率）
        if (member.age >= MILESTONE_MARRIAGE_AGE && !member.married && !member.independent) {
          if (Math.random() < CHILD_MARRIAGE_PROBABILITY) {
            member.married = true
            const spouseName = Math.random() > 0.5 ? `${member.name}之配` : `${member.name}之君`
            member.spouseName = spouseName
            events.push(`子女${member.name}婚配成家`)
          }
        }

        // 婚后独立（每年概率）
        if (member.married && !member.independent) {
          if (Math.random() < CHILD_INDEPENDENT_PROBABILITY) {
            member.independent = true
            events.push(`子女${member.name}婚后独立，搬离了家族`)
          }
        }
      }

      // ── 生育概率 ──
      const spouseAlive = this.state.members.find((m) => m.role === 'spouse' && m.alive)
      const childrenCount = this.state.members.filter((m) => m.role === 'child' && m.alive).length
      if (spouseAlive && childrenCount < MAX_CHILDREN && Math.random() < this._effectiveBirthProbability()) {
        const isMale = Math.random() > 0.5
        const namePool = isMale ? MALE_NAMES : FEMALE_NAMES
        const name = namePool[randomInRange(0, namePool.length - 1)]
        const child: FamilyMember = {
          id: `fam-${++_memberIdCounter}`,
          name,
          role: 'child',
          age: 0,
          alive: true,
          ability: randomInRange(10, 80),
          affinity: randomInRange(60, 100),
          notes: `${currentYear + y}年出生`,
          independent: false,
          married: false,
        }
        this.state.members.push(child)
        events.push(`家族迎来新生儿：${name}`)
      }
    }

    // 家族声望和财富随成员数量与状态波动
    const aliveCount = this.state.members.filter((m) => m.alive).length
    this.state.familyReputation = round(clamp(
      this.state.familyReputation + aliveCount * 0.5 - years * 0.3,
      0,
      100,
    ))

    if (events.length > 0) {
      this.state.history = [...this.state.history, ...events].slice(-20)
    }
  }

  // ─── 领域方法 ───

  /** fertilityModifier 仅影响玩家家族生育（Phase 7B 方案 B；macro birthRateModifier 管 population） */
  private _effectiveBirthProbability(): number {
    return clamp(
      BIRTH_PROBABILITY * getFormulaModifier('fertilityModifier'),
      EFFECTIVE_BIRTH_MIN,
      EFFECTIVE_BIRTH_MAX,
    )
  }

  getFamilyName(): string {
    return this.state.familyName
  }

  getAliveMembers(): FamilyMember[] {
    return this.state.members.filter((m) => m.alive)
  }

  getMemberCount(): number {
    return this.getAliveMembers().length
  }

  getFamilyReputation(): number {
    return this.state.familyReputation
  }

  /** AI Prompt 用格式化家族状态文本 */
  formatForPrompt(): string {
    const sb: string[] = []
    sb.push(`【${this.state.familyName}家族】`)
    sb.push(`声望：${this.state.familyReputation} · 财富：${this.state.familyWealth}`)

    const aliveMembers = this.getAliveMembers()
    if (aliveMembers.length === 0) {
      sb.push('无在世家族成员')
      return sb.join('\n')
    }

    sb.push('── 在世成员 ──')
    for (const m of aliveMembers) {
      const roleLabel = FAMILY_ROLE_LABELS[m.role]
      let info = `${m.name}（${roleLabel}，${m.age}岁）`
      if (m.role === 'spouse' && m.spouseStatus) {
        info += ` · 关系：${SPOUSE_STATUS_LABELS[m.spouseStatus] || m.spouseStatus}（满意度：${m.relationshipQuality}）`
      }
      if (m.role === 'child') {
        if (m.married) {
          info += ` · 已婚${m.spouseName ? '（配偶：' + m.spouseName + '）' : ''}`
        }
        if (m.independent) info += ' · 已独立'
      }
      sb.push(`  ${info}`)
    }

    if (this.state.history.length > 0) {
      sb.push('── 近期事件 ──')
      for (const h of this.state.history.slice(-5)) {
        sb.push(`  · ${h}`)
      }
    }

    return sb.join('\n')
  }

  private getSummaryText(): string {
    const aliveCount = this.getMemberCount()
    const totalCount = this.state.members.length
    const spouse = this.state.members.find((m) => m.role === 'spouse' && m.alive)
    let spouseInfo = ''
    if (spouse && spouse.spouseStatus && spouse.spouseStatus !== 'widowed') {
      spouseInfo = ` · 婚姻：${SPOUSE_STATUS_LABELS[spouse.spouseStatus]}（${spouse.relationshipQuality}）`
    } else if (spouse && spouse.spouseStatus === 'widowed') {
      spouseInfo = ` · 丧偶`
    }
    const childCount = this.state.members.filter((m) => m.role === 'child' && m.alive).length
    return `【${this.label}】${this.state.familyName} · 成员：${aliveCount}人（共${totalCount}人） · 声望：${this.state.familyReputation} · 财富：${this.state.familyWealth}${spouseInfo} · 子女：${childCount}人`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
