/**
 * Purpose: Build deterministic timeline projections for continuity and historical records.
 * Owner: mod-engine
 * Responsibility: Project committed narrative rounds into the existing continuity timeline.
 */

import { RECENT_NARRATIVE_WINDOW, type NarrativeChunk } from '../../orchestrator-shared'
import { isNarrativeRecordVisible } from '../../helpers/narrative-context-scope'
import {
  formatNarrativeTimelineEntries,
  formatNarrativeTimelineForPrompt,
  projectNarrativeResultForPrompt,
  type NarrativeTimelineEntry,
} from '../../helpers/timeline-memory'
import type { OrchestratorSystem } from '../orchestrator-system'

export function buildPromptTimelineMemoryRuntime(
  orchestrator: OrchestratorSystem,
): string[] | undefined {
  const scopeView = orchestrator['getNarrativeScopeView']()
  const { memoryLifecycle, summaryCompressor } = orchestrator.getRuntimeDependencies()
  const history = orchestrator['state'].narrativeHistory
  const firstCommittedRound = Math.max(1, orchestrator['state'].totalRounds - history.length)
  const firstDetailedIndex = Math.max(0, history.length - RECENT_NARRATIVE_WINDOW)
  const compressedRounds = new Set(
    summaryCompressor.getSummaries().summaries.map((summary) => summary.sourceRound),
  )
  const uncompressedHistoricalEntries = history.flatMap((entry, index) => {
    if (index >= firstDetailedIndex) return []
    if (!isNarrativeRecordVisible(entry, scopeView)) return []
    const round = entry.transitionAudit?.round ?? firstCommittedRound + index
    if (compressedRounds.has(round)) return []
    return [orchestrator['projectNarrativeHistoryEntry'](entry, round)]
  })
  const timelineProjection = memoryLifecycle.buildNarrativeTimelineProjection(
    uncompressedHistoricalEntries,
    summaryCompressor.getSummaries(),
    scopeView,
  )
  const timelineMemory = formatNarrativeTimelineForPrompt(
    timelineProjection.timelineEntries.map((entry) => ({
      ...entry,
      displayAge: entry.displayAge
        ?? orchestrator['resolveNarrativeRoundTime'](entry.sortRound)?.displayAge,
    })),
  )
  return timelineMemory.length > 0 ? timelineMemory : undefined
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
    displayAge: time?.displayAge,
    sortTotalDays: time?.totalDays,
  }
}

export function projectNarrativeHistoryEntryRuntime(
  orchestrator: OrchestratorSystem,
  
  entry: NarrativeChunk,
  round: number,
): NarrativeTimelineEntry {
  const contextLabel = entry.contextName || entry.contextId
  const narrative = projectNarrativeResultForPrompt({
    text: entry.text,
  })
  const roundLabel = `第${round}轮`
  const timeLabel = entry.displayTimeLabel?.trim() || roundLabel
  const ageLabel = entry.displayAge === undefined ? undefined : `角色${entry.displayAge}岁`
  return {
    timeSpan: timeLabel,
    occurrenceTime: [timeLabel, ageLabel].filter(Boolean).join(' · '),
    text: contextLabel ? `【发生上下文：${contextLabel}】\n${narrative}` : narrative,
    sortRound: round,
    displayAge: entry.displayAge,
    sortTotalDays: entry.totalDays,
  }
}

export function formatNarrativeHistoryEntryRuntime(
  orchestrator: OrchestratorSystem,
  entry: NarrativeChunk, round: number): string {
  return formatNarrativeTimelineEntries([orchestrator['projectNarrativeHistoryEntry'](entry, round)])
}
