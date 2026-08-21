/**
 * Purpose: Merge post-story structured commit counts into one accepted narrative transition audit.
 * Owner: mod-engine
 * Responsibility: Transition-audit projection only; business commits remain with their owning runtimes.
 */

import { useEngineStore } from '../../store'
import type { OrchestratorSystem } from '../orchestrator-system'

export function updateNarrativeTransitionAuditRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
  counts: { requestedChangeCount: number; committedChangeCount: number },
): void {
  const prepared = orchestrator['acceptedNarrativeRecords'].get(narrativeId)
  if (!prepared) throw new Error(`找不到待更新审计的正文：${narrativeId}`)
  prepared.transitionAudit = {
    ...prepared.transitionAudit,
    structuredDataPresent: true,
    structuredDataAccepted: true,
    historicalCommitPassed: true,
    requestedChangeCount: prepared.transitionAudit.requestedChangeCount + counts.requestedChangeCount,
    committedChangeCount: prepared.transitionAudit.committedChangeCount + counts.committedChangeCount,
    trusted: true,
    reasons: [],
  }
  const projectAudit = (entry: (typeof orchestrator['state']['narrativeHistory'])[number]) => (
    entry.id === narrativeId
      ? { ...entry, transitionAudit: structuredClone(prepared.transitionAudit) }
      : entry
  )
  orchestrator['state'].narrativeHistory = orchestrator['state'].narrativeHistory.map(projectAudit)
  useEngineStore.setState((state) => ({
    narrativeHistory: state.narrativeHistory.map(projectAudit),
  }))
}
