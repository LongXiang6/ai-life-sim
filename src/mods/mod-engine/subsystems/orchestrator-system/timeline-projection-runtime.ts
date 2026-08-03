/**
 * Purpose: Build the deterministic timeline-memory projection used by the main narrative prompt.
 * Owner: mod-engine
 * Responsibility: Merge recent facts, compressed summaries, creations, recalls, and historical entries in time order.
 */

import type { NarrativeChunk } from '../../orchestrator-shared'
import {
  RECENT_NARRATIVE_WINDOW,
  coreMemory,
  digestLedger,
  memoryLifecycle,
  summaryCompressor,
} from '../../orchestrator-shared'
import {
  formatNarrativeTimelineEntries,
  formatNarrativeTimelineForPrompt,
  type NarrativeTimelineEntry,
} from '../../helpers/timeline-memory'
import type { OrchestratorSystem } from '../orchestrator-system'

export function buildPromptTimelineMemoryRuntime(
  orchestrator: OrchestratorSystem,
): string | undefined {
  const scopeView = orchestrator['getNarrativeScopeView']()
  const latestCompletedRound = Math.max(0, orchestrator['state'].totalRounds - 1)
  const recentTimelineEntries = digestLedger.selectRecentFactsForNarrativeTimeline(
    latestCompletedRound,
    RECENT_NARRATIVE_WINDOW,
    scopeView.currentContextId,
    scopeView.closedContextIds,
  ).map((event) => orchestrator['projectRoundMemoryEvent'](
    event.round,
    event.text,
    event.contextId,
  ))
  const timelineProjection = memoryLifecycle.buildNarrativeTimelineProjection(
    recentTimelineEntries,
    summaryCompressor.getSummaries(),
    scopeView.currentContextId,
    scopeView.closedContextIds,
    orchestrator['state'].totalRounds,
  )

  const ledgerEntries = digestLedger.selectForNarrativeTimeline(
    orchestrator['state'].totalRounds,
    scopeView.currentContextId,
    scopeView.closedContextIds,
    {
      excludeRoundsAtOrAfter: Math.max(
        1,
        latestCompletedRound - RECENT_NARRATIVE_WINDOW + 1,
      ),
    },
  ).map((event) => orchestrator['projectRoundMemoryEvent'](
    event.round,
    event.text,
    event.contextId,
  ))
  const creationEntries = coreMemory.buildCreationTimelineEntries(
    orchestrator['state'].characterCreations,
    (round) => orchestrator['resolveNarrativeRoundTime'](round),
  )
  const timelineMemory = formatNarrativeTimelineForPrompt([
    ...timelineProjection.timelineEntries,
    ...creationEntries,
    ...orchestrator['narrativeMemoryRecall'],
    ...ledgerEntries,
  ])

  return timelineMemory || undefined
}

export function resolveNarrativeRoundTimeRuntime(
  orchestrator: OrchestratorSystem,
  round: number): {
  displayTimeLabel?: string
  displayAge?: number
  totalDays?: number
} | undefined {
  const firstRound = Math.max(
    1,
    orchestrator['state'].totalRounds - orchestrator['state'].narrativeHistory.length + 1,
  )
  const entry = orchestrator['state'].narrativeHistory.find(
    (candidate) => candidate.transitionAudit?.round === round,
  ) ?? orchestrator['state'].narrativeHistory[round - firstRound]
  if (!entry) return undefined
  return {
    displayTimeLabel: entry.displayTimeLabel,
    displayAge: entry.displayAge,
    totalDays: entry.totalDays,
  }
}

export function projectRoundMemoryEventRuntime(
  orchestrator: OrchestratorSystem,
  
  round: number,
  text: string,
  contextId?: string,
): NarrativeTimelineEntry {
  const time = orchestrator['resolveNarrativeRoundTime'](round)
  const roundLabel = `第${round}轮`
  const timeLabel = time?.displayTimeLabel?.trim() || roundLabel
  const ageLabel = time?.displayAge === undefined ? undefined : `角色${time.displayAge}岁`
  const contextLabel = contextId === orchestrator['worldSetting']?.contextId
    ? orchestrator['worldSetting']?.name ?? contextId
    : contextId
  return {
    timeSpan: timeLabel,
    occurrenceTime: [timeLabel, ageLabel].filter(Boolean).join(' · '),
    text: contextLabel ? `【发生上下文：${contextLabel}】\n${text}` : text,
    sortRound: round,
    sortTotalDays: time?.totalDays,
  }
}

export function projectNarrativeHistoryEntryRuntime(
  orchestrator: OrchestratorSystem,
  
  entry: NarrativeChunk,
  round: number,
): NarrativeTimelineEntry {
  const contextLabel = entry.contextName || entry.contextId
  const narrative = entry.text.replace(/^⟦正文⟧(?:\r?\n)*/u, '').trim()
  const roundLabel = `第${round}轮`
  const timeLabel = entry.displayTimeLabel?.trim() || roundLabel
  const ageLabel = entry.displayAge === undefined ? undefined : `角色${entry.displayAge}岁`
  return {
    timeSpan: timeLabel,
    occurrenceTime: [timeLabel, ageLabel].filter(Boolean).join(' · '),
    text: contextLabel ? `【发生上下文：${contextLabel}】\n${narrative}` : narrative,
    sortRound: round,
    sortTotalDays: entry.totalDays,
  }
}

export function formatNarrativeHistoryEntryRuntime(
  orchestrator: OrchestratorSystem,
  entry: NarrativeChunk, round: number): string {
  return formatNarrativeTimelineEntries([orchestrator['projectNarrativeHistoryEntry'](entry, round)])
}
