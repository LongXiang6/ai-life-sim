/**
 * @module SkillSystem
 * @description 技能动态生成子系统 —— AI 根据角色经历动态创建技能，存储到 Store
 * @mod mod-power-system
 *
 * 创意 #13：角色技能动态生成
 *
 * 数据流：
 *   AI 生成叙事 → parseAndDistribute() → 检测 newSkills[]
 *   → SkillSystem.applyChanges → 校验 → 存入 usePowerSystemStore
 *   → UI 技能面板展示
 *
 * 技能创建完全依赖 AI 判断，非确定性。
 * 同一角色两次运行可能获得不同技能。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { DynamicSkill, SkillEffect, SkillState } from '../types'

/** 默认最大技能数 */
const DEFAULT_MAX_SKILLS = 20

/** 技能名称黑名单（禁止出现的无意义名称） */
const BLOCKED_SKILL_NAMES = new Set(['skill', 'ability', '未知技能', '新技能'])

/** 技能效果属性白名单 */
const VALID_ATTRS = new Set([
  'physique', 'mind', 'talentAptitude', 'charisma',
  'combatPower', 'luck', 'health', 'stamina', 'spirit',
  'attack', 'defense', 'speed', 'cultivation',
])

export class SkillSystem implements ISubSystem {
  readonly id = 'skill' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '技能系统' as const
  readonly description = 'AI 根据角色经历动态生成技能，存储技能列表并校验' as const

  private data: SkillState = {
    skills: [],
    maxSkills: DEFAULT_MAX_SKILLS,
    lastAcquiredSkillId: null,
  }

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: this._buildSummary(),
      data: structuredClone(this.data) as unknown as Record<string, unknown>,
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    // Guard: 输入校验
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Invalid changes`);
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`);
    if (!changes.changes || typeof changes.changes !== 'object') throw new Error(`[${this.id}] Invalid changes.changes`);
    if (!changes.description || changes.description.trim() === '') throw new Error(`[${this.id}] Missing changes.description`);

    const c = changes.changes

    // 新增技能
    if (c.newSkills && Array.isArray(c.newSkills)) {
      for (const rawSkill of c.newSkills) {
        const skill = this._validateAndCreateSkill(rawSkill)
        if (skill && this.data.skills.length < this.data.maxSkills) {
          // 检查重名
          const exists = this.data.skills.some((s) => s.name === skill.name)
          if (!exists) {
            this.data.skills.push(skill)
            this.data.lastAcquiredSkillId = skill.id
          }
        }
      }
    }

    // 移除技能（如技能被遗忘/失效）
    if (c.removeSkillId && typeof c.removeSkillId === 'string') {
      this.data.skills = this.data.skills.filter((s) => s.id !== c.removeSkillId)
      if (this.data.lastAcquiredSkillId === c.removeSkillId) {
        this.data.lastAcquiredSkillId = null
      }
    }

    // 更新最大技能数
    if (typeof c.maxSkills === 'number' && c.maxSkills > 0) {
      this.data.maxSkills = Math.min(c.maxSkills, 50)
    }
  }

  reset(): void {
    this.data = {
      skills: [],
      maxSkills: DEFAULT_MAX_SKILLS,
      lastAcquiredSkillId: null,
    }
  }

  /** 获取当前技能列表（供 UI 使用） */
  getSkills(): DynamicSkill[] {
    return this.data.skills
  }

  /** 获取最近获得的技能 */
  getLastAcquired(): DynamicSkill | null {
    if (!this.data.lastAcquiredSkillId) return null
    return this.data.skills.find((s) => s.id === this.data.lastAcquiredSkillId) ?? null
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private _validateAndCreateSkill(raw: Record<string, unknown>): DynamicSkill | null {
    // 验证名称
    if (!raw.name || typeof raw.name !== 'string' || raw.name.trim().length === 0) return null
    const name = raw.name.trim()
    if (name.length > 30) return null
    if (BLOCKED_SKILL_NAMES.has(name)) return null

    // 验证描述
    const description = typeof raw.description === 'string' ? raw.description.trim() : ''
    if (description.length > 200) return null

    // 验证效果
    const effects: SkillEffect[] = []
    if (raw.effects && Array.isArray(raw.effects)) {
      for (const ef of raw.effects) {
        if (!ef || typeof ef !== 'object') continue
        const eff = ef as Record<string, unknown>
        if (typeof eff.attr !== 'string' || !VALID_ATTRS.has(eff.attr)) continue
        if (typeof eff.value !== 'number' || Math.abs(eff.value) > 100) continue
        effects.push({ attr: eff.attr, value: eff.value })
      }
    }

    // 生成唯一 ID
    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    return {
      id,
      name,
      description: description || `${name}（AI 动态生成技能）`,
      effects,
      originEvent: typeof raw.originEvent === 'string' ? raw.originEvent : '未知事件',
      createdYear: typeof raw.createdYear === 'number' ? raw.createdYear : 1,
    }
  }

  private _buildSummary(): string {
    const count = this.data.skills.length
    if (count === 0) return '【技能】尚未获得任何技能'
    const latest = this.getLastAcquired()
    const latestStr = latest ? `，最近获得：${latest.name}` : ''
    return `【技能】共 ${count} 个技能${latestStr}`
  }
}
