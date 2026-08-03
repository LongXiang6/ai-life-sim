/**
 * Purpose: Merge post-story structured commit counts into one accepted narrative transition audit.
 * Owner: mod-engine
 * Responsibility: Transition-audit projection only; business commits remain with their owning runtimes.
 */

import type { OrchestratorSystem } from '../orchestrator-system'

export function updateNarrativeTransitionAuditRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
  counts: { requestedChangeCount: number; committedChangeCount: number },
): void {
  const chunk = orchestrator['state'].narrativeHistory.find((entry) => entry.id === narrativeId)
  if (!chunk?.transitionAudit) return
  chunk.transitionAudit = {
    ...chunk.transitionAudit,
    structuredDataPresent: true,
    requestedChangeCount: chunk.transitionAudit.requestedChangeCount + counts.requestedChangeCount,
    committedChangeCount: chunk.transitionAudit.committedChangeCount + counts.committedChangeCount,
  }
}
