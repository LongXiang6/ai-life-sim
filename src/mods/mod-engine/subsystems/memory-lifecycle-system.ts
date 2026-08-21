/**
 * Purpose: Preserve causal memory protections and project committed memory into the story timeline.
 * Owner: mod-engine
 * Responsibility: Causal protection state, player-created facts, and per-round compressed-memory projection only.
 */

import { BaseSubsystem } from '@/core'
import type {
  CompressedSummaryItem,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import {
  isNarrativeRecordVisible,
  type NarrativeScopeView,
} from '../helpers/narrative-context-scope'
import {
  projectSummaryToNarrativeTimeline,
  type NarrativeTimelineEntry,
} from '../helpers/timeline-memory'
import type { CharacterCreation } from '../types'
import { buildCreationTimelineEntries } from './memory-lifecycle-system/timeline-facts'
import type {
  CausalMemoryProtection,
  MemoryRoundTime,
  NarrativeTimelineProjection,
} from './memory-lifecycle-system/contracts'

export type {
  CausalMemoryProtection,
  MemoryRoundTime,
  NarrativeTimelineProjection,
} from './memory-lifecycle-system/contracts'

export class MemoryLifecycleSystem extends BaseSubsystem {
  readonly id = 'memory-lifecycle' as const
  readonly mod = 'mod-engine' as const
  readonly label = '记忆连续性' as const
  readonly description = '保存未兑现因果保护，并投影逐轮压缩记忆与玩家原创事实' as const

  private causalProtections: CausalMemoryProtection[] = []

  getCausalProtections(): CausalMemoryProtection[] {
    return structuredClone(this.causalProtections)
  }

  buildCreationTimelineEntries(
    characterCreations: readonly CharacterCreation[] = [],
    resolveRoundTime?: (round: number) => MemoryRoundTime | undefined,
  ): NarrativeTimelineEntry[] {
    return buildCreationTimelineEntries(characterCreations, resolveRoundTime)
  }

  addCausalMark(event: CausalMemoryProtection): void {
    const existing = this.causalProtections.find((candidate) => (
      candidate.round === event.round
      && candidate.type === event.type
      && candidate.contextId === event.contextId
    ))
    if (existing) {
      Object.assign(existing, structuredClone(event), { resolved: false })
      return
    }
    this.causalProtections.push(structuredClone(event))
  }

  resolveCausalMark(
    round: number,
    type: CausalMemoryProtection['type'],
    contextId?: string,
  ): void {
    const event = this.causalProtections.find((candidate) => (
      candidate.round === round
      && candidate.type === type
      && candidate.contextId === contextId
    ))
    if (event) event.resolved = true
  }

  markForeshadowEvent(round: number, description: string, contextId?: string): void {
    this.addCausalMark({
      round,
      contextId,
      type: 'foreshadow',
      description,
      severity: 'major',
      resolved: false,
    })
  }

  resolveForeshadowMark(round: number, contextId?: string): void {
    this.resolveCausalMark(round, 'foreshadow', contextId)
  }

  buildNarrativeTimelineProjection(
    recentDetailedStories: readonly NarrativeTimelineEntry[],
    compressedSummaries: { summaries: readonly CompressedSummaryItem[] },
    view: NarrativeScopeView,
  ): NarrativeTimelineProjection {
    const compressedEntries = [...compressedSummaries.summaries]
      .filter((summary) => isNarrativeRecordVisible(
        {
          contextId: summary.contextId,
          memoryScope: summary.contextId ? 'context' : 'global',
        },
        view,
      ))
      .sort((left, right) => left.sourceRound - right.sourceRound)
      .flatMap((summary) => {
        const contextLabel = summary.contextId
          ? `【发生上下文：${summary.contextId}${summary.contextId === view.currentContextId ? '·当前' : ''}】\n`
          : ''
        return projectSummaryToNarrativeTimeline(summary).map((entry) => ({
          ...entry,
          sortTotalDays: summary.totalDays,
          text: `${contextLabel}${entry.text}`,
        }))
      })

    return {
      timelineEntries: [...compressedEntries, ...recentDetailedStories],
    }
  }

  collectState(_context: RoundContext): SubSystemState {
    const activeCausalProtectionCount = this.causalProtections.filter((event) => !event.resolved).length
    return {
      id: this.id,
      summary: `【${this.label}】待兑现因果:${activeCausalProtectionCount}`,
      data: { activeCausalProtectionCount },
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    throw new Error('记忆连续性只接受所属因果系统的公开命令')
  }

  capturePersistenceState(): unknown {
    return structuredClone({ causalProtections: this.causalProtections })
  }

  restorePersistenceState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as { causalProtections?: CausalMemoryProtection[] }
    this.causalProtections = structuredClone(value.causalProtections ?? [])
  }

  reset(): void {
    this.causalProtections = []
  }
}

export const memoryLifecycle = new MemoryLifecycleSystem()
