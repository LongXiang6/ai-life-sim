/**
 * Purpose: Project missing transition-audit facts for life settlement.
 * Owner: mod-pages/game-over
 * Responsibility: Pure display and audit projection only.
 */

import type { NarrativeTransitionAuditSnapshot } from '@/foundation'

export function missingTransitionAudit(
  round: number,
  narrativeId: string,
): NarrativeTransitionAuditSnapshot {
  return {
    schemaVersion: 1,
    round,
    narrativeId,
    validatedWritePath: false,
    interceptorPassed: false,
    intentValidationPassed: false,
    historicalCommitPassed: false,
    structuredDataPresent: false,
    structuredDataAccepted: false,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: false,
    validationClean: false,
    reasons: ['missing-transition-audit'],
  }
}
