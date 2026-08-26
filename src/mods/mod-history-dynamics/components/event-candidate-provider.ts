/**
 * Purpose: Build historical event candidate projections from confirmed inputs.
 * Owner: mod-history-dynamics
 * Responsibility: Candidate shaping only; selection, validation, and persistence stay with the ledger.
 *
 * @module event-candidate-provider.ts
 * @description P1 内部事件候选提供器；无 ISubSystem、无独立 Store、无事实所有权
 * @mod mod-history-dynamics
 */

import type {
  HistoricalEventCandidate,
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateAuditStatus,
  HistoricalEventCandidateInput,
  HistoricalEventCandidateSubmission,
  HistoricalEventValidationContext,
} from '@/foundation'
import { basePointsFromCalendarDays, calendarDaysFromBasePoints } from '@/foundation'

import { cloneValue, createLedgerId } from '../utils'

/**
 * 只把显式候选写成审计记录。它不包含题材模板、不读正文、不随机触发，
 * 也不能把候选直接当成已经发生的历史事实。
 */
export class EventCandidateProvider {
  prepareSubmission(
    submission: HistoricalEventCandidateSubmission,
    context: HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit[] {
    const basePoints = context.totalBasePoints
      ?? basePointsFromCalendarDays(context.totalDays)
    return submission.candidates.map((input) => {
      const candidate = this.normalizeCandidate(input, submission, context)
      return {
        auditId: createLedgerId('candidate-audit'),
        candidateId: candidate.candidateId,
        status: 'available',
        candidate,
        reason: '候选已登记，尚未成为历史事实',
        roundSequence: context.roundSequence,
        basePoints,
        totalDays: calendarDaysFromBasePoints(basePoints),
      }
    })
  }

  prepareDecision(
    candidate: HistoricalEventCandidate,
    status: Exclude<HistoricalEventCandidateAuditStatus, 'available'>,
    reason: string,
    context: HistoricalEventValidationContext,
    promotedEventId?: string,
  ): HistoricalEventCandidateAudit {
    const basePoints = context.totalBasePoints
      ?? basePointsFromCalendarDays(context.totalDays)
    return {
      auditId: createLedgerId('candidate-audit'),
      candidateId: candidate.candidateId,
      status,
      candidate: cloneValue(candidate),
      reason,
      promotedEventId,
      roundSequence: context.roundSequence,
      basePoints,
      totalDays: calendarDaysFromBasePoints(basePoints),
    }
  }

  prepareContinuation(
    candidate: HistoricalEventCandidate,
    reason: string,
    context: HistoricalEventValidationContext,
  ): HistoricalEventCandidateAudit {
    const basePoints = context.totalBasePoints
      ?? basePointsFromCalendarDays(context.totalDays)
    return {
      auditId: createLedgerId('candidate-audit'),
      candidateId: candidate.candidateId,
      status: 'available',
      candidate: cloneValue(candidate),
      reason,
      roundSequence: context.roundSequence,
      basePoints,
      totalDays: calendarDaysFromBasePoints(basePoints),
    }
  }

  latestCandidates(
    audits: readonly HistoricalEventCandidateAudit[],
  ): Map<string, HistoricalEventCandidateAudit> {
    const latest = new Map<string, HistoricalEventCandidateAudit>()
    for (const audit of audits) latest.set(audit.candidateId, audit)
    return latest
  }

  private normalizeCandidate(
    input: HistoricalEventCandidateInput,
    submission: HistoricalEventCandidateSubmission,
    _context: HistoricalEventValidationContext,
  ): HistoricalEventCandidate {
    const schedule = input.schedule ? cloneValue(input.schedule) : undefined
    if (schedule) {
      schedule.dueBasePoints ??= schedule.dueTotalDays === undefined
        ? undefined
        : basePointsFromCalendarDays(schedule.dueTotalDays)
      if (schedule.dueBasePoints !== undefined) {
        schedule.dueTotalDays = calendarDaysFromBasePoints(schedule.dueBasePoints)
      }
    }
    return {
      candidateId: typeof input.candidateId === 'string' && input.candidateId.trim()
        ? input.candidateId.trim()
        : createLedgerId('candidate'),
      eventType: typeof input.eventType === 'string' ? input.eventType.trim() : '',
      title: typeof input.title === 'string' ? input.title.trim() : '',
      description: typeof input.description === 'string' ? input.description.trim() : '',
      scope: cloneValue(input.scope),
      participants: cloneValue(input.participants ?? []),
      locations: cloneValue(input.locations ?? []),
      schedule,
      triggerConditionLabel: typeof input.triggerConditionLabel === 'string'
        ? input.triggerConditionLabel.trim() || undefined
        : undefined,
      requiredCapabilities: Array.isArray(input.requiredCapabilities)
        ? [...new Set(input.requiredCapabilities)].sort()
        : [],
      tags: cloneValue(input.tags ?? []),
      source: cloneValue(submission.source),
      metadata: cloneValue(input.metadata ?? {}),
    }
  }
}
