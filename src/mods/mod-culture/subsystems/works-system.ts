/**
 * @module WorksSystem
 * @description 著作子系统：创作/进度累积/世界观标签/死后评分联动
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { WorksEntry, WorksState, WorkCategory } from '../types'

import {
  getWorksLabels,
  WORKS_EFFORT_DEFAULT,
  clamp,
} from '../constants'

export class WorksSystem implements ISubSystem {
  readonly id = 'works' as const
  readonly mod = 'mod-culture' as const
  readonly label = '著作' as const
  readonly description = '管理角色的创作作品、进度推进、世界观标签化输出' as const

  private state: WorksState = this.createInitialState()
  private _lastProcessedRound = -1
  private _worldview = 'historical'

  /** 设置世界观（影响作品分类标签的翻译） */
  setWorldview(wv: string): void {
    this._worldview = wv
  }

  private createInitialState(): WorksState {
    return {
      works: [],
      nextId: 1,
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
    this.advanceWorks(getAgeYearsDelta(context))
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

    // 添加新作品
    if (c.adaptationType === 'add-work' && typeof c.title === 'string') {
      const category = this.isValidCategory(c.category as string) ? c.category as WorkCategory : 'treatise'
      const newWork: WorksEntry = {
        id: `work_${this.state.nextId}`,
        title: c.title,
        category,
        status: 'in_progress',
        progress: 0,
        startEraYear: context.round.year,
        fame: 0,
      }
      this.state.works.push(newWork)
      this.state.nextId++
      return
    }

    // 直接覆盖作品列表（AI 注入）
    if (Array.isArray(c.works)) {
      const newWorks: WorksEntry[] = []
      for (const w of c.works as unknown[]) {
        if (w && typeof w === 'object') {
          const item = w as Record<string, unknown>
          if (typeof item.title === 'string') {
            const category = this.isValidCategory(item.category as string)
              ? item.category as WorkCategory
              : 'treatise'
            const statusStr = item.status as string
            newWorks.push({
              id: typeof item.id === 'string' ? item.id : `work_${this.state.nextId + newWorks.length}`,
              title: item.title,
              category,
              status: this.isValidStatus(statusStr) ? statusStr : 'in_progress',
              progress: typeof item.progress === 'number' ? clamp(item.progress, 0, 100) : 0,
              startEraYear: typeof item.startEraYear === 'number' ? item.startEraYear : context.round.year,
              completedEraYear: typeof item.completedEraYear === 'number' ? item.completedEraYear : undefined,
              fame: typeof item.fame === 'number' ? clamp(item.fame, 0, 100) : 0,
            })
          }
        }
      }
      if (newWorks.length > 0) {
        this.state.works = newWorks
        this.state.nextId = newWorks.reduce((max, w) => {
          const numId = parseInt(w.id.replace('work_', ''), 10)
          return isNaN(numId) ? max : Math.max(max, numId + 1)
        }, this.state.nextId)
      }
      return
    }

    // 设置世界观（works 层面的）——用于 AI 注入时调整输出标签
    if (typeof c.worldview === 'string') {
      this._worldview = c.worldview
    }
  }

  // ─── 内部推进逻辑 ───

  /** 每年推进所有进行中作品的进度，并为已完作品累积名声 */
  private advanceWorks(yearsElapsed: number): void {
    if (yearsElapsed <= 0) return
    const iterations = yearsElapsed < 1 ? 1 : Math.floor(yearsElapsed)
    const scale = yearsElapsed < 1 ? yearsElapsed : 1
    for (let y = 0; y < iterations; y++) {
      for (const work of this.state.works) {
        if (work.status === 'in_progress') {
          const progressGain = Math.min(40, (WORKS_EFFORT_DEFAULT + Math.floor(work.fame * 0.1)) * scale)
          work.progress = Math.min(100, work.progress + progressGain)

          // 完成检测
          if (work.progress >= 100) {
            work.status = 'completed'
            work.completedEraYear = this._lastProcessedRound >= 0 ? this._lastProcessedRound : 0
            work.fame = Math.min(100, work.fame + (10 + Math.floor(Math.random() * 15)) * scale)
          }
        } else if (work.status === 'completed') {
          work.fame = Math.min(100, work.fame + (1 + Math.floor(Math.random() * 3)) * scale)
        }
      }
    }
  }

  // ─── 领域方法 ───

  /** 添加新创作 */
  addWork(title: string, category: WorkCategory, currentYear: number): WorksEntry {
    const work: WorksEntry = {
      id: `work_${this.state.nextId}`,
      title,
      category,
      status: 'in_progress',
      progress: 0,
      startEraYear: currentYear,
      fame: 0,
    }
    this.state.works.push(work)
    this.state.nextId++
    return work
  }

  /** 获取已完成作品的名声奖励（死后评分联动用） */
  getCompletedWorks(): WorksEntry[] {
    return this.state.works.filter(w => w.status === 'completed')
  }

  /** 获取死后名声加成（已完成作品 fame/20 之和） */
  getPosthumousFameBonus(): number {
    const completed = this.getCompletedWorks()
    return completed.reduce((sum, w) => sum + w.fame / 20, 0)
  }

  formatForPrompt(): string {
    const labels = getWorksLabels(this._worldview)
    const inProgress = this.state.works.filter(w => w.status === 'in_progress')
    const completed = this.state.works.filter(w => w.status === 'completed')

    const parts: string[] = []

    if (inProgress.length > 0) {
      const inProgressStr = inProgress.map(
        w => `《${w.title}》（${labels[w.category] ?? w.category}、进度${w.progress}%）`,
      ).join('、')
      parts.push(`创作中：${inProgressStr}`)
    }

    if (completed.length > 0) {
      const completedStr = completed.map(
        w => `《${w.title}》（${labels[w.category] ?? w.category}、名声${w.fame}）`,
      ).join('、')
      parts.push(`已完成：${completedStr}`)
    }

    if (parts.length === 0) {
      return '暂无著作'
    }

    return parts.join('；')
  }

  private getSummaryText(): string {
    const count = this.state.works.length
    const completedCount = this.state.works.filter(w => w.status === 'completed').length
    if (count === 0) return '【著作】暂无作品'
    return `【著作】共${count}部（已完成${completedCount}部）`
  }

  // ─── 校验 ───

  private isValidCategory(cat: string): cat is WorkCategory {
    return ['biography', 'novel', 'treatise', 'poetry', 'art', 'craft', 'code', 'paper', 'holo'].includes(cat)
  }

  private isValidStatus(st: string): st is 'in_progress' | 'completed' | 'lost' {
    return ['in_progress', 'completed', 'lost'].includes(st)
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    this._worldview = 'historical'
  }
}
