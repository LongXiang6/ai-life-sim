/**
 * Purpose: Assemble the one main-story PromptContext after local round preparation.
 * Owner: mod-engine
 * Responsibility: Player action and PromptContext assembly only.
 */

import type { OrchestratorSystem } from '../subsystems/orchestrator-system'

export function prepareNarrativeRoundPromptContext(
  owner: OrchestratorSystem,
  eventInjectionText?: string,
): {
  promptContext: ReturnType<OrchestratorSystem['assemblePromptContext']>
  playerChoice?: string
  legendaryEncounterInjected: boolean
} {
  const playerChoice = owner.getPendingPlayerChoice()
  return {
    promptContext: owner.assemblePromptContext(eventInjectionText),
    ...(playerChoice ? { playerChoice } : {}),
    legendaryEncounterInjected: false,
  }
}
