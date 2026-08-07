/**
 * Purpose: Keep complete subsystem snapshots while selecting active prompt state.
 * Owner: mod-engine / subsystem-relevance
 * Responsibility: Non-destructive prompt relevance and change indexing only; business state remains with each subsystem.
 */

import type {
  ISubSystem,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import {
  isMvpPromptSubsystem,
  MVP_PROMPT_SUBSYSTEM_IDS,
} from '../helpers/mvp-runtime-policy'

const SLIDING_WINDOW_SIZE = 3
const ALWAYS_RELEVANT = new Set([
  'character-base',
  'spatial-graph',
  'historical-event-ledger',
])

interface SystemStateSnapshot {
  round: number
  state: SubSystemState
}

interface SystemChangeRecord {
  subsystemId: string
  round: number
  changeSummary: string
}

export type InfluenceScope = 'personal' | 'town' | 'region' | 'continent' | 'world'

const INFLUENCE_THRESHOLDS: Record<InfluenceScope, { minScore: number; label: string }> = {
  personal: { minScore: 0, label: '个人' },
  town: { minScore: 25, label: '聚落' },
  region: { minScore: 50, label: '区域' },
  continent: { minScore: 75, label: '大范围' },
  world: { minScore: 90, label: '世界' },
}

export class SubsystemRelevanceSystem implements ISubSystem {
  readonly id = 'subsystem-relevance' as const
  readonly mod = 'mod-engine' as const
  readonly label = '子系统相关性过滤' as const
  readonly description = '保留完整状态并按活动 Prompt 白名单与变化窗口选择叙事上下文' as const

  private stateHistory: Record<string, SystemStateSnapshot[]> = {}
  private changeRecords: SystemChangeRecord[] = []
  private currentRound = 0

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】完整快照×${Object.keys(this.stateHistory).length} | 最近${SLIDING_WINDOW_SIZE}轮变化×${this.changeRecords.filter((item) => item.round >= this.currentRound - SLIDING_WINDOW_SIZE).length}`,
      data: structuredClone({
        trackedSystems: Object.keys(this.stateHistory).length,
        recentChanges: this.changeRecords.filter((item) => item.round >= this.currentRound - SLIDING_WINDOW_SIZE).length,
        windowSize: SLIDING_WINDOW_SIZE,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || changes.id !== this.id) throw new Error(`[${this.id}] 变更目标不匹配`)
    if (!changes.description?.trim()) throw new Error(`[${this.id}] 变更说明不能为空`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] 变更数据必须是对象`)
    }
  }

  reset(): void {
    this.stateHistory = {}
    this.changeRecords = []
    this.currentRound = 0
  }

  capturePersistenceState(): unknown {
    return structuredClone({
      stateHistory: this.stateHistory,
      changeRecords: this.changeRecords,
      currentRound: this.currentRound,
    })
  }

  restorePersistenceState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as {
      stateHistory?: Record<string, SystemStateSnapshot[]>
      changeRecords?: SystemChangeRecord[]
      currentRound?: number
    }
    this.stateHistory = value.stateHistory ? structuredClone(value.stateHistory) : {}
    this.changeRecords = value.changeRecords ? structuredClone(value.changeRecords) : []
    this.currentRound = typeof value.currentRound === 'number' ? Math.max(0, value.currentRound) : 0
  }

  setRound(round: number): void {
    if (Number.isFinite(round)) this.currentRound = Math.max(this.currentRound, Math.floor(round))
  }

  recordState(subsystemId: string, state: SubSystemState, round: number): void {
    this.setRound(round)
    const history = this.stateHistory[subsystemId] ?? []
    history.push({ round, state: structuredClone(state) })
    this.stateHistory[subsystemId] = history
  }

  recordChange(subsystemId: string, round: number, changeSummary: string): void {
    this.setRound(round)
    this.changeRecords.push({ subsystemId, round, changeSummary })
  }

  isRelevant(subsystemId: string, _context: RoundContext): boolean {
    return isMvpPromptSubsystem(subsystemId)
  }

  getMemoryRelevantStates(
    allStates: Record<string, SubSystemState>,
    context: RoundContext,
  ): Record<string, SubSystemState> {
    return Object.fromEntries(
      Object.entries(allStates).filter(([subsystemId]) => this.isRelevant(subsystemId, context)),
    )
  }

  getRelevantStates(
    allStates: Record<string, SubSystemState>,
    context: RoundContext,
  ): Record<string, SubSystemState> {
    const relevant: Record<string, SubSystemState> = {}
    for (const [subsystemId, state] of Object.entries(allStates)) {
      if (!this.isRelevant(subsystemId, context)) continue
      if (ALWAYS_RELEVANT.has(subsystemId) || this.hasRecentChange(subsystemId, this.currentRound)) {
        relevant[subsystemId] = state
      }
    }
    return relevant
  }

  hasRecentChange(subsystemId: string, currentRound = this.currentRound): boolean {
    return this.changeRecords.some((item) => (
      item.subsystemId === subsystemId
      && item.round >= currentRound - SLIDING_WINDOW_SIZE
      && item.round <= currentRound
    ))
  }

  getChangeSummary(subsystemId: string, currentRound = this.currentRound): string | undefined {
    return [...this.changeRecords].reverse().find((item) => (
      item.subsystemId === subsystemId && item.round === currentRound
    ))?.changeSummary
  }

  buildSlidingWindowSummary(currentRound = this.currentRound): string {
    const recent = this.changeRecords.filter((item) => (
      item.round >= currentRound - SLIDING_WINDOW_SIZE && item.round <= currentRound
    ))
    if (recent.length === 0) return ''
    const byRound = new Map<number, SystemChangeRecord[]>()
    for (const item of recent) byRound.set(item.round, [...(byRound.get(item.round) ?? []), item])
    const lines = ['【最近变化】']
    for (const round of [...byRound.keys()].sort((a, b) => b - a)) {
      const label = round === currentRound ? '本轮' : `第${round}轮`
      lines.push(`${label}：${byRound.get(round)!.map((item) => `${item.subsystemId}: ${item.changeSummary}`).join('；')}`)
    }
    return lines.join('\n')
  }

  getIrrelevantSystems(
    allStates: Record<string, SubSystemState>,
    context: RoundContext,
  ): string[] {
    return Object.keys(allStates).filter((subsystemId) => !this.isRelevant(subsystemId, context))
  }

  calculateInfluenceScore(subsystemStates: Record<string, SubSystemState>): number {
    const combat = subsystemStates['combat-power']?.data as {
      framework?: { enabled?: boolean; ranks?: Array<{ index?: number }> }
      rankIndex?: number
      subStage?: number
    } | undefined
    const ranks = Array.isArray(combat?.framework?.ranks) ? combat.framework.ranks : []
    const rankIndex = typeof combat?.rankIndex === 'number' ? combat.rankIndex : 0
    const subStage = typeof combat?.subStage === 'number' ? combat.subStage : 1
    const combatScore = combat?.framework?.enabled && ranks.length > 0
      ? ((Math.max(0, rankIndex - 1) + Math.max(0, Math.min(5, subStage) - 1) / 5) / ranks.length) * 100
      : 0
    const cultivation = subsystemStates.cultivation?.data as { realmIndex?: number } | undefined
    const cultivationScore = typeof cultivation?.realmIndex === 'number' && ranks.length > 0
      ? (Math.max(0, cultivation.realmIndex - 1) / ranks.length) * 100
      : 0
    return Math.round(Math.max(combatScore, cultivationScore))
  }

  getInfluenceScope(influenceScore: number): InfluenceScope {
    if (influenceScore >= INFLUENCE_THRESHOLDS.world.minScore) return 'world'
    if (influenceScore >= INFLUENCE_THRESHOLDS.continent.minScore) return 'continent'
    if (influenceScore >= INFLUENCE_THRESHOLDS.region.minScore) return 'region'
    if (influenceScore >= INFLUENCE_THRESHOLDS.town.minScore) return 'town'
    return 'personal'
  }

  getInfluenceAllowedSystems(_scope: InfluenceScope): Set<string> {
    return new Set(MVP_PROMPT_SUBSYSTEM_IDS)
  }

  buildInfluenceText(scope: InfluenceScope): string {
    return `【角色影响范围】${INFLUENCE_THRESHOLDS[scope].label}`
  }
}

export const subsystemRelevance = new SubsystemRelevanceSystem()
