/**
 * @module PersonalAbilitySystem
 * @description 个人能力子系统：技能经验/升级/衰退 + 知识遗忘/复习，合并技能与知识管理
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { PersonalAbilityState, SkillEntry, KnowledgeEntry, KnowledgeCategory } from '../types'

import {
  BASE_SKILL_CAP,
  BASE_SKILL_DECAY,
  BASE_KNOWLEDGE_FORGET_RATE,
  DEFAULT_ATTRIBUTE_VALUES,
  getSkillLevelLabel,
  getKnowledgeAccuracyLabel,
  clamp,
} from '../constants'

export class PersonalAbilitySystem implements ISubSystem {
  readonly id = 'personal-ability' as const
  readonly mod = 'mod-culture' as const
  readonly label = '个人能力' as const
  readonly description = '管理技能经验/升级/衰退、知识遗忘/复习、技能上限' as const

  private state: PersonalAbilityState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): PersonalAbilityState {
    return {
      skills: {},
      knowledge: {},
      skillCap: BASE_SKILL_CAP,
      attributes: { ...DEFAULT_ATTRIBUTE_VALUES },
    }
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

    // 每轮自动推进：技能衰退 + 知识遗忘
    this.advanceAbilities(context)

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

    // 学习新技能
    if (typeof c.learnSkill === 'string') {
      this.learnSkill(c.learnSkill)
    }

    // 获得技能经验
    if (typeof c.skillName === 'string' && typeof c.xpGain === 'number') {
      this.gainSkillXp(c.skillName, c.xpGain)
    }

    // 获得知识
    if (typeof c.knowledgeTopic === 'string' && typeof c.knowledgeMastery === 'number') {
      this.gainKnowledge(
        c.knowledgeTopic,
        c.knowledgeMastery,
        c.knowledgeCategory as KnowledgeCategory | undefined,
        typeof c.knowledgeAccuracy === 'number' ? c.knowledgeAccuracy : undefined,
      )
    }

    // 复习知识（防遗忘）
    if (typeof c.reviewTopic === 'string') {
      this.reviewKnowledge(c.reviewTopic)
    }

    // 回忆已遗忘的知识
    if (typeof c.recallTopic === 'string') {
      this.recallKnowledge(c.recallTopic)
    }

    // 直接设置技能容量
    if (typeof c.skillCap === 'number') {
      this.state.skillCap = clamp(c.skillCap, 1, 50)
    }

    // 设置角色属性
    if (c.attributes && typeof c.attributes === 'object') {
      const attr = c.attributes as Record<string, number>
      for (const key of Object.keys(attr)) {
        if (typeof attr[key] === 'number') {
          this.state.attributes[key] = clamp(attr[key], 0, 100)
        }
      }
    }

    // 设置单一属性
    if (typeof c.attributeKey === 'string' && typeof c.attributeValue === 'number') {
      this.state.attributes[c.attributeKey] = clamp(c.attributeValue, 0, 100)
    }

    // 遗忘某个技能
    if (typeof c.forgetSkill === 'string') {
      delete this.state.skills[c.forgetSkill]
    }

    // 直接设置技能列表（AI 适配）
    if (c.skills && typeof c.skills === 'object') {
      this.state.skills = c.skills as Record<string, SkillEntry>
    }
    if (c.knowledge && typeof c.knowledge === 'object') {
      this.state.knowledge = c.knowledge as Record<string, KnowledgeEntry>
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceAbilities(context: RoundContext): void {
    const years = getAgeYearsDelta(context)
    if (years <= 0) return

    // 技能衰退：每项技能根据 decayRate 下降 XP
    for (const [name, skill] of Object.entries(this.state.skills)) {
      const yearsSinceUsed = context.round.year - skill.lastUsedYear
      if (yearsSinceUsed <= 0) continue

      const effectiveDecay = skill.decayRate * (1 + yearsSinceUsed * 0.05)
      const totalDecay = effectiveDecay * years
      skill.xp = clamp(skill.xp - totalDecay, 0, 100)

      // XP 归零则降级，降级到 0 则遗忘
      if (skill.xp <= 0) {
        skill.level = clamp(skill.level - 1, 0, 100)
        if (skill.level <= 0) {
          delete this.state.skills[name]
          continue
        }
        skill.xp = 50 // 降级后给一半经验
      }
    }

    // 知识遗忘
    for (const [, knowledge] of Object.entries(this.state.knowledge)) {
      const yearsSinceReview = context.round.year - knowledge.lastReviewedYear
      if (yearsSinceReview <= 0) continue

      const effectiveForget = knowledge.forgetRate * (1 + yearsSinceReview * 0.02)
      const totalForget = effectiveForget * years
      knowledge.mastery = clamp(knowledge.mastery - totalForget, 0, 100)

      if (knowledge.mastery <= 0 && !knowledge.isForgotten) {
        knowledge.isForgotten = true
      }
    }
  }

  private learnSkill(skillName: string): void {
    const skillCount = Object.keys(this.state.skills).length
    if (skillCount >= this.state.skillCap) return
    if (this.state.skills[skillName]) return

    this.state.skills[skillName] = {
      name: skillName,
      level: 1,
      xp: 0,
      lastUsedYear: this._lastProcessedRound,
      decayRate: BASE_SKILL_DECAY,
    }
  }

  private gainSkillXp(skillName: string, xpGain: number): void {
    let skill = this.state.skills[skillName]
    if (!skill) {
      // 自动学习
      const skillCount = Object.keys(this.state.skills).length
      if (skillCount >= this.state.skillCap) return
      skill = {
        name: skillName,
        level: 1,
        xp: 0,
        lastUsedYear: this._lastProcessedRound,
        decayRate: BASE_SKILL_DECAY,
      }
      this.state.skills[skillName] = skill
    }

    // 属性影响学习速率
    const modifier = this.getLearningRateModifier()
    const adjustedGain = Math.round(xpGain * modifier)
    skill.xp = clamp(skill.xp + Math.max(adjustedGain, 1), 0, 100)
    skill.lastUsedYear = this._lastProcessedRound

    // XP 满则升级
    while (skill.xp >= 100 && skill.level < 100) {
      skill.level += 1
      skill.xp -= 100
    }
  }

  private gainKnowledge(topic: string, mastery: number, category?: KnowledgeCategory, accuracy?: number): void {
    const existing = this.state.knowledge[topic]
    if (existing) {
      existing.mastery = clamp(existing.mastery + mastery, 0, 100)
      existing.lastReviewedYear = this._lastProcessedRound
      existing.isForgotten = false
      if (category !== undefined) existing.category = category
      if (accuracy !== undefined) existing.accuracy = clamp(accuracy, 0, 100)
    } else {
      this.state.knowledge[topic] = {
        topic,
        mastery: clamp(mastery, 0, 100),
        lastReviewedYear: this._lastProcessedRound,
        forgetRate: BASE_KNOWLEDGE_FORGET_RATE,
        category: category ?? 'event',
        accuracy: accuracy !== undefined ? clamp(accuracy, 0, 100) : 50,
        isForgotten: false,
      }
    }
  }

  private reviewKnowledge(topic: string): void {
    const knowledge = this.state.knowledge[topic]
    if (knowledge) {
      knowledge.lastReviewedYear = this._lastProcessedRound
      knowledge.isForgotten = false
      knowledge.mastery = clamp(knowledge.mastery + 2, 0, 100)
    }
  }

  /** 回忆已遗忘的知识 */
  private recallKnowledge(topic: string): void {
    const knowledge = this.state.knowledge[topic]
    if (knowledge && knowledge.isForgotten) {
      knowledge.isForgotten = false
      knowledge.lastReviewedYear = this._lastProcessedRound
      knowledge.mastery = clamp(Math.max(knowledge.mastery, 10), 0, 100)
    }
  }

  // ─── 领域方法 ───

  /** 获取技能数量 */
  getSkillCount(): number {
    return Object.keys(this.state.skills).length
  }

  /** 获取技能容量 */
  getSkillCap(): number {
    return this.state.skillCap
  }

  /** 获取所有技能 */
  getSkills(): Record<string, SkillEntry> {
    return this.state.skills
  }

  /** 获取所有知识 */
  getKnowledge(): Record<string, KnowledgeEntry> {
    return this.state.knowledge
  }

  /** 获取指定技能等级 */
  getSkillLevel(skillName: string): number {
    return this.state.skills[skillName]?.level ?? 0
  }

  /** 获取指定技能叙事标签 */
  getSkillLevelLabel(skillName: string): string {
    const level = this.state.skills[skillName]?.level ?? 0
    return getSkillLevelLabel(level)
  }

  /** 获取指定知识掌握度 */
  getKnowledgeMastery(topic: string): number {
    return this.state.knowledge[topic]?.mastery ?? 0
  }

  /** 获取角色属性值 */
  getAttribute(key: string): number {
    return this.state.attributes[key] ?? 50
  }

  /** 获取所有属性 */
  getAttributes(): Record<string, number> {
    return { ...this.state.attributes }
  }

  /** 计算学习速率乘数（基于属性平均值，范围 0.5 ~ 1.5） */
  getLearningRateModifier(): number {
    const attrs = this.state.attributes
    const keys = Object.keys(attrs)
    if (keys.length === 0) return 1.0
    const avg = keys.reduce((sum, k) => sum + (attrs[k] ?? 50), 0) / keys.length
    return 0.5 + (avg / 100) * 1.0
  }

  /** 计算动态属性值（知识平均准确度×40% + 技能平均等级×60%，用于跨系统联动） */
  getDynamicAttrValue(): number {
    const knowledgeEntries = Object.values(this.state.knowledge)
    const skillEntries = Object.values(this.state.skills)

    let knowledgeAvg = 0
    if (knowledgeEntries.length > 0) {
      knowledgeAvg = knowledgeEntries.reduce((sum, k) => sum + k.accuracy, 0) / knowledgeEntries.length
    }

    let skillAvg = 0
    if (skillEntries.length > 0) {
      skillAvg = skillEntries.reduce((sum, s) => sum + s.level, 0) / skillEntries.length
    }

    return Math.round(knowledgeAvg * 0.4 + skillAvg * 0.6)
  }

  /** 格式化状态供 AI Prompt 使用（已知知识 + 遗忘中的知识 + 技能） */
  formatForPrompt(): string {
    const parts: string[] = []

    // 技能输出
    const skillEntries = Object.values(this.state.skills)
    if (skillEntries.length > 0) {
      const skillLines = skillEntries
        .sort((a, b) => b.level - a.level)
        .map(s => `${s.name}(${getSkillLevelLabel(s.level)},Lv${s.level},XP${s.xp})`)
      parts.push(`【已掌握技能】${skillLines.join('、')}`)
    }

    // 已知知识输出
    const knownKnowledge = Object.values(this.state.knowledge).filter(k => !k.isForgotten)
    if (knownKnowledge.length > 0) {
      const knownLines = knownKnowledge
        .sort((a, b) => b.mastery - a.mastery)
        .map(k => `${k.topic}(${getKnowledgeAccuracyLabel(k.accuracy)},掌握度${k.mastery})`)
      parts.push(`【已知信息】${knownLines.join('、')}`)
    }

    // 遗忘中的知识输出
    const forgottenKnowledge = Object.values(this.state.knowledge).filter(k => k.isForgotten)
    if (forgottenKnowledge.length > 0) {
      const forgottenLines = forgottenKnowledge
        .map(k => `${k.topic}(${getKnowledgeAccuracyLabel(k.accuracy)})`)
      parts.push(`【遗忘中的信息】${forgottenLines.join('、')}`)
    }

    // 属性输出
    const attrLines = Object.entries(this.state.attributes)
      .map(([key, val]) => `${key}:${val}`)
    if (attrLines.length > 0) {
      parts.push(`【基础属性】${attrLines.join(', ')}`)
    }

    return parts.length > 0 ? `【${this.label}】${parts.join(' | ')}` : `【${this.label}】暂无能力信息`
  }

  private getSummaryText(): string {
    const skillCount = Object.keys(this.state.skills).length
    const knowledgeCount = Object.keys(this.state.knowledge).length
    return `【${this.label}】技能数: ${skillCount}, 知识数: ${knowledgeCount}, 技能上限: ${this.state.skillCap}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
