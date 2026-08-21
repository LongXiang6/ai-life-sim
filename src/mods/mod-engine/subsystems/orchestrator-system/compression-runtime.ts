/**
 * Purpose: Project complete narrative history into year events for prompt consumers.
 * Owner: mod-engine
 * Responsibility: Build a read-only history view; compression state stays with summary-compressor.
 */

import type { YearEvent } from '@/foundation'
import type { OrchestratorSystem } from '../orchestrator-system'

export function buildYearEventsRuntime(
  orchestrator: OrchestratorSystem,
): YearEvent[] {
  const fallbackRound = orchestrator['state'].round
  const fallbackAge = orchestrator['computeNarrativeAge'](orchestrator['buildRoundContext']())
  const fallbackTimeLabel = `${fallbackRound.eraName}${fallbackRound.eraYear}年`
  const firstRound = Math.max(
    1,
    orchestrator['state'].totalRounds - orchestrator['state'].narrativeHistory.length + 1,
  )

  return orchestrator['state'].narrativeHistory.map((n, i) => {
    const round = firstRound + i
    const age = n.displayAge ?? fallbackAge
    const timeLabel = n.displayTimeLabel?.trim() || fallbackTimeLabel

    return {
      id: round,
      contextId: n.contextId ?? orchestrator['worldSetting']?.contextId,
      totalDays: n.totalDays,
      age,
      totalMonths: Math.max(0, Math.round(age * 12)),
      eraYear: fallbackRound.eraYear,
      eraName: '',
      narrative: n.text,
      timeLabel,
      ...(n.isBranchPoint
        ? {
            isBranchPoint: true,
            branchTitle: n.branchTitle,
            branchOptions: n.branchOptions,
          }
        : {}),
      ...(n.resolvedChoice
        ? {
            resolvedChoice: n.resolvedChoice,
            resolvedChoiceRound: n.resolvedChoiceRound,
          }
        : {}),
    }
  })
}
