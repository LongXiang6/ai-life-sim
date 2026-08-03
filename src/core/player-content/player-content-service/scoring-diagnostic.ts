/**
 * Purpose: Record non-blocking score verification diagnostics for player-content projections.
 * Owner: core:player-content
 * Responsibility: Development diagnostics only; score verification and projections retain their owners.
 */

import type { CloudGameRecord } from '@/core/account/account-contract'
import { appendDevelopmentSystemEvents } from '@/core/logger/development-system-diagnostic.server'
import type { verifyStoredLifeScore } from '@/core/scoring/life-scoring'

export function recordScoringVerification(
  record: CloudGameRecord,
  operation: 'leaderboard-projection' | 'portrait-queue',
  verification: ReturnType<typeof verifyStoredLifeScore>,
): void {
  void appendDevelopmentSystemEvents([{
    schemaVersion: 1,
    timestamp: Date.now(),
    system: 'life-scoring',
    event: operation,
    status: verification.valid ? 'ok' : 'error',
    ...(record.scoring?.audit?.lifeRunId ? { lifeRunId: record.scoring.audit.lifeRunId } : {}),
    ...(record.rounds > 0 ? { round: record.rounds } : {}),
    details: {
      recordId: record.recordId,
      score: record.overallScore,
      verificationReasons: verification.reasons,
    },
  }]).catch((error) => {
    console.error('[player-content] 开发评分诊断写入失败', error)
  })
}
