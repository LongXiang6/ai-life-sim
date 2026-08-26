/**
 * Purpose: Project the one-shot player action for the next story turn.
 * Owner: mod-engine
 * Responsibility: Player action only; other local hints are not story-AI input.
 */

import type { LuckNarrativeGuidance } from '@/foundation'
import { buildPlayerRoundActionProjection } from '../../helpers/player-round-action'
import type { OrchestratorSystem } from '../orchestrator-system'

export function buildRoundGuidanceInputRuntime(
  orchestrator: OrchestratorSystem,
  _luckNarrativeGuidance?: LuckNarrativeGuidance,
): {
  roundSystemGuidanceText?: string
  playerBranchIntent?: Record<string, unknown>
} {
  const action = orchestrator['lastPlayerChoice']?.trim()
  const playerBranchIntent = buildPlayerRoundActionProjection(action)
  return {
    ...(playerBranchIntent ? { playerBranchIntent } : {}),
  }
}
