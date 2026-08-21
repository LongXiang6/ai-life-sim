/**
 * Purpose: Resolve the active narrative-memory scope from world context state.
 * Owner: mod-engine
 * Responsibility: Build the read-only scope view used by prompt projection.
 */

import { useWorldStore } from '@/mods/mod-world/world-runtime-api'

import type { NarrativeScopeView } from '../../helpers/narrative-context-scope'
import type { OrchestratorSystem } from '../orchestrator-system'

export function getNarrativeScopeViewRuntime(
  orchestrator: OrchestratorSystem,
): NarrativeScopeView {
  const worldState = useWorldStore.getState()
  const closedContextIds = new Set(
    Object.values(worldState.contexts)
      .filter((instance) => (
        instance.scope.scope === 'closed' || instance.record.lifecycle === 'closed'
      ))
      .map((instance) => instance.record.id),
  )
  return {
    currentContextId: orchestrator['worldSetting']?.contextId,
    closedContextIds,
  }
}
