/**
 * @module life-stage-system.ts
 * @description 生命阶段子系统
 * @mod mod-character
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { LifeStageId, LifeStageConfig, LifeStageState } from '../types'

import {
  DEFAULT_LIFE_STAGES,
  DEFAULT_STAGE_DISPLAY_NAMES,
  BASE_HUMAN_LIFESPAN,
} from '../constants'
import {
  getLifeStagePoolForWorldview,
  formatStageEventsForPrompt,
  type LifeStagePools,
} from '../life-stage-pools'

export class LifeStageSystem implements ISubSystem {
  readonly id = 'life-stage' as const
  readonly mod = 'mod-character' as const
  readonly label = '生命阶段' as const
  readonly description = '根据年龄判定 8 个生命阶段 + 阶段系数 + AI 术语适配' as const

  private state: LifeStageState = {
    currentStage: 'infant',
    stages: this.buildDefaultStages(),
    adapted: false,
  }

  /** 当前加载的世界观事件池（AI 适配前自动填充 stage 的 eventPool/avoidancePool） */
  private worldviewPools?: LifeStagePools

  collectState(context: RoundContext): SubSystemState {
    const age = this.getCharacterAge(context)
    const maxAge = this.getMaxAge(context)

    // 判定当前阶段
    this.state.currentStage = this.determineStage(age, maxAge)

    const stage = this.state.stages[this.state.currentStage]
    const s = stage ?? this.state.stages.infant!

    // 构建含事件池的 summary（对齐废弃项目 formatLifeStageForPrompt）
    const eventsText = formatStageEventsForPrompt(this.state.currentStage,
      this.worldviewPools
        ? this.worldviewPools
        : undefined)
    const eventsPart = eventsText ? ` | ${eventsText}` : ''

    return {
      id: this.id,
      summary: `【${this.label}】${s.displayName}（${age}岁/${maxAge}岁）| 活力系数 ${s.coefficients.vitality} | 学习系数 ${s.coefficients.learning} | 社交系数 ${s.coefficients.social}${eventsPart}`,
      data: structuredClone({
        currentStage: this.state.currentStage,
        stage: {
          id: s.id,
          displayName: s.displayName,
          ageRange: s.ageRange,
          coefficients: s.coefficients,
          eventPool: s.eventPool,
          avoidancePool: s.avoidancePool,
        },
        adapted: this.state.adapted,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return
    const ch = changes.changes

    // 世界观事件池加载（生命周期参数，AI 适配前自动填充预设池）
    if (typeof ch.worldview === 'string') {
      this.loadWorldviewPools(ch.worldview)
    }

    // AI 适配后的阶段配置
    if (Array.isArray(ch.adaptedStages)) {
      const adapted = ch.adaptedStages as Array<{
        id: string
        displayName: string
        eventPool?: string[]
        avoidancePool?: string[]
      }>
      for (const item of adapted) {
        const stageId = item.id as LifeStageId
        if (this.state.stages[stageId]) {
          this.state.stages[stageId]!.displayName = item.displayName
          if (Array.isArray(item.eventPool)) {
            this.state.stages[stageId]!.eventPool = item.eventPool
          }
          if (Array.isArray(item.avoidancePool)) {
            this.state.stages[stageId]!.avoidancePool = item.avoidancePool
          }
        }
      }
      this.state.adapted = true
    }
  }

  reset(): void {
    this.state = {
      currentStage: 'infant',
      stages: this.buildDefaultStages(),
      adapted: false,
    }
    this.worldviewPools = undefined
  }

  // -------- 公共方法 --------

  /** 获取当前阶段配置 */
  getCurrentStage(): LifeStageConfig {
    return this.state.stages[this.state.currentStage] ?? this.state.stages.infant!
  }

  /** 查询任意阶段的完整配置（对齐废弃项目 getLifeStageProfile，用于 UI 展示完整人生阶段图） */
  getStageProfile(stageId: LifeStageId): LifeStageConfig | undefined {
    return this.state.stages[stageId]
  }

  // -------- 内部方法 --------

  private determineStage(age: number, maxAge: number): LifeStageId {
    const stageIds: LifeStageId[] = [
      'infant', 'child', 'teenager', 'young_adult', 'adult', 'middle_age', 'elder', 'deceased',
    ]

    for (const id of stageIds) {
      const def = DEFAULT_LIFE_STAGES[id]
      if (!def) continue

      const [start, end] = def.ageRange

      // 动态阶段（范围 = [0, 0]）根据 maxAge 比例计算
      if (start === 0 && end === 0 && id !== 'deceased') {
        const computed = this.getStageRange(id, maxAge)
        if (age >= computed[0] && age < computed[1]) {
          return id
        }
      } else if (start === 0 && end === 0 && id === 'deceased') {
        return 'deceased'
      } else if (age >= start && age < end) {
        return id
      }
    }

    return 'adult'
  }

  private getStageRange(id: LifeStageId, maxAge: number): [number, number] {
    const scale = maxAge / 100
    switch (id) {
      case 'young_adult': return [Math.round(18 * scale), Math.round(20 * scale)]
      case 'adult':       return [Math.round(20 * scale), Math.round(50 * scale)]
      case 'middle_age':  return [Math.round(50 * scale), Math.round(75 * scale)]
      case 'elder':       return [Math.round(75 * scale), maxAge]
      default:            return [0, 0]
    }
  }

  private buildDefaultStages(): Record<LifeStageId, LifeStageConfig> {
    const stages = {} as Record<LifeStageId, LifeStageConfig>
    const ids: LifeStageId[] = [
      'infant', 'child', 'teenager', 'young_adult', 'adult', 'middle_age', 'elder', 'deceased',
    ]
    for (const id of ids) {
      const def = DEFAULT_LIFE_STAGES[id]!
      stages[id] = {
        ...def,
        displayName: DEFAULT_STAGE_DISPLAY_NAMES[id] ?? id,
        eventPool: [],
        avoidancePool: [],
      }
    }
    return stages
  }

  private getCharacterAge(context: RoundContext): number {
    return context.round.year
  }

  private getMaxAge(context: RoundContext): number {
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data && typeof (lifespan.data as Record<string, unknown>).maxAge === 'number') {
      return (lifespan.data as Record<string, unknown>).maxAge as number
    }
    return BASE_HUMAN_LIFESPAN
  }

  /** 根据世界观加载预设事件池（AI 适配前默认填充 stage 的 eventPool/avoidancePool） */
  private loadWorldviewPools(worldview: string): void {
    const pools = getLifeStagePoolForWorldview(worldview)
    this.worldviewPools = pools

    for (const id of Object.keys(pools) as LifeStageId[]) {
      const entry = pools[id]
      if (!entry) continue
      const stage = this.state.stages[id]
      if (stage) {
        // 仅当事件池为空时填充（保留 AI 已适配的内容）
        if (stage.eventPool.length === 0) {
          stage.eventPool = [...entry.pool]
        }
        if (stage.avoidancePool.length === 0) {
          stage.avoidancePool = [...entry.avoid]
        }
      }
    }
  }
}
