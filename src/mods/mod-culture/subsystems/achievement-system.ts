/**
 * @module AchievementSystem
 * @description 成就系统：成就进度检测 + 解锁条件判定 + 成就点累计
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { AchievementState, Achievement, AchievementRarity } from '../types'

import { ACHIEVEMENT_TEMPLATES } from '../constants'

const RARITY_LABEL: Record<AchievementRarity, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}

export class AchievementSystem implements ISubSystem {
  readonly id = 'achievement' as const
  readonly mod = 'mod-culture' as const
  readonly label = '成就' as const
  readonly description = '管理成就系统、成就进度检测、解锁条件判定与成就点累计' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): AchievementState {
    const achievements: Achievement[] = ACHIEVEMENT_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      unlocked: false,
      unlockedYear: -1,
      points: t.points,
      category: t.category,
      rarity: t.rarity,
      icon: t.icon,
    }))
    return {
      achievements,
      totalPoints: 0,
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
    return {
      id: this.id,
      summary: this.getSummaryText(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
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

    if (c.adaptationType === 'achievement-init' && Array.isArray(c.customAchievements)) {
      const customs = (c.customAchievements as unknown[]).filter(
        (a): a is Record<string, unknown> =>
          a !== null && typeof a === 'object' && typeof (a as Record<string, unknown>).id === 'string',
      )
      for (const ca of customs) {
        if (!this.state.achievements.find((a) => a.id === ca.id)) {
          this.state.achievements.push({
            id: ca.id as string,
            name: typeof ca.name === 'string' ? ca.name : ca.id as string,
            description: typeof ca.description === 'string' ? ca.description : '',
            unlocked: false,
            unlockedYear: -1,
            points: typeof ca.points === 'number' ? ca.points : 10,
            category: (typeof ca.category === 'string' ? ca.category : 'personal') as Achievement['category'],
            rarity: (typeof ca.rarity === 'string' && ['common', 'rare', 'epic', 'legendary'].includes(ca.rarity) ? ca.rarity : 'common') as AchievementRarity,
            icon: typeof ca.icon === 'string' ? ca.icon : '🏆',
          })
        }
      }
      return
    }

    // 直接解锁指定成就
    if (typeof c.achievementId === 'string' && c.unlocked === true) {
      const ach = this.state.achievements.find((a) => a.id === c.achievementId)
      if (ach && !ach.unlocked) {
        ach.unlocked = true
        ach.unlockedYear = context.round.year
        this.state.totalPoints += ach.points
      }
      return
    }
  }

  // ─── 领域方法 ───

  /** 根据条件检测并解锁符合条件的成就，返回本轮新解锁的成就列表 */
  checkAndUnlock(conditions: Record<string, number | boolean>, currentYear: number): string[] {
    const newlyUnlocked: string[] = []
    for (const ach of this.state.achievements) {
      if (ach.unlocked) continue
      const template = ACHIEVEMENT_TEMPLATES.find((t) => t.id === ach.id)
      if (template && template.evaluate(conditions)) {
        ach.unlocked = true
        ach.unlockedYear = currentYear
        this.state.totalPoints += ach.points
        newlyUnlocked.push(ach.name)
      }
    }
    return newlyUnlocked
  }

  /** 获取该成就的模板条件函数（供外部主动检查） */
  evaluateCondition(achievementId: string, conditions: Record<string, number | boolean>): boolean {
    const template = ACHIEVEMENT_TEMPLATES.find((t) => t.id === achievementId)
    if (!template) return false
    return template.evaluate(conditions)
  }

  getUnlockedCount(): number {
    return this.state.achievements.filter((a) => a.unlocked).length
  }

  getUnlockedAchievements(): Achievement[] {
    return this.state.achievements.filter((a) => a.unlocked)
  }

  formatForPrompt(): string {
    const lines: string[] = []
    lines.push(`【成就系统】已解锁 ${this.getUnlockedCount()}/${this.state.achievements.length}，总点数：${this.state.totalPoints}`)
    lines.push('')
    const unlocked = this.getUnlockedAchievements()
    if (unlocked.length === 0) {
      lines.push('尚未解锁任何成就。')
    } else {
      lines.push('已解锁成就：')
      for (const ach of unlocked) {
        const rarityInfo = `${ach.icon}${RARITY_LABEL[ach.rarity]}`
        lines.push(`  ${ach.name}（${rarityInfo}，${ach.unlockedYear > 0 ? `第 ${ach.unlockedYear} 年解锁` : '手动解锁'}，+${ach.points}点）`)
      }
    }
    lines.push('')
    const locked = this.state.achievements.filter((a) => !a.unlocked)
    if (locked.length > 0) {
      lines.push('未达成成就：')
      for (const ach of locked) {
        const template = ACHIEVEMENT_TEMPLATES.find((t) => t.id === ach.id)
        lines.push(`  ${ach.icon}${ach.name}（${RARITY_LABEL[ach.rarity]}）— ${template?.description ?? ach.description}`)
      }
    }
    return lines.join('\n')
  }

  private getSummaryText(): string {
    const unlockedCount = this.state.achievements.filter((a) => a.unlocked).length
    const total = this.state.achievements.length
    return `【${this.label}】已解锁：${unlockedCount}/${total}，总点数：${this.state.totalPoints}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
