/**
 * Purpose: Validate that event recognition disposes exactly the historical candidates delivered to it.
 * Owner: mod-engine
 * Responsibility: Candidate-set validation only; parsing and ledger writes remain with their owners.
 */

import type { HistoricalEventCandidateAudit } from '@/foundation'

export function assertDeliveredHistoricalCandidateDispositions(input: {
  dueCandidates: readonly HistoricalEventCandidateAudit[]
  dispositions: readonly { candidateId: string }[]
}): void {
  const expectedIds = new Set(input.dueCandidates.map((audit) => audit.candidateId))
  const returnedIds = new Set<string>()
  for (const disposition of input.dispositions) {
    if (!expectedIds.has(disposition.candidateId)) {
      throw new Error(`到期候选判定引用了未投递编号：${disposition.candidateId}`)
    }
    if (returnedIds.has(disposition.candidateId)) {
      throw new Error(`到期候选判定重复提交编号：${disposition.candidateId}`)
    }
    returnedIds.add(disposition.candidateId)
  }
  for (const candidateId of expectedIds) {
    if (!returnedIds.has(candidateId)) throw new Error(`到期候选必须逐项判定：${candidateId}`)
  }
  if (expectedIds.size === 0 && input.dispositions.length > 0) {
    throw new Error('本轮没有投递到期候选，事件识别不得提交到期候选判定')
  }
}
