/**
 * Purpose: Project an already published narrative state into the UI Store.
 * Owner: mod-engine:orchestrator
 * Responsibility: Preserve resolved branch choices while replacing the visible engine projection.
 */

import type { EngineState } from '../../types'
import { useEngineStore } from '../../store'

export function publishNarrativeStateToStore(engineState: EngineState): void {
  useEngineStore.setState((store) => {
    const resolvedChoices = new Map(
      store.narrativeHistory.flatMap((entry) => (
        entry.id && entry.resolvedChoice
          ? [[entry.id, {
              choice: entry.resolvedChoice,
              round: entry.resolvedChoiceRound,
            }] as const]
          : []
      )),
    )
    const narrativeHistory = engineState.narrativeHistory.map((entry) => {
      const resolved = entry.id ? resolvedChoices.get(entry.id) : undefined
      return resolved
        ? {
            ...structuredClone(entry),
            resolvedChoice: resolved.choice,
            resolvedChoiceRound: resolved.round,
          }
        : structuredClone(entry)
    })
    return {
      lifeRunId: engineState.lifeRunId,
      status: engineState.status,
      round: { ...engineState.round },
      totalRounds: engineState.totalRounds,
      narrativeHistory,
      currentNarrative: engineState.currentNarrative,
      storyRepetitionStats: structuredClone(engineState.storyRepetitionStats),
    }
  })
}
