/**
 * Purpose: Validate and atomically commit dispositions for the candidates delivered in one round.
 * Owner: mod-history-dynamics
 * Responsibility: Build ledger append data for candidate outcomes; the ledger remains the state owner.
 */

import type {
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateDispositionBatch,
  HistoricalEventCandidateDispositionResult,
  HistoricalEventCreateInput,
  HistoricalEventEvidenceInput,
  HistoricalEventPreparedAppend,
  HistoricalEventValidationContext,
  RoundContext,
} from '@/foundation'

import {
  cloneValue,
  createLedgerId,
  isPlainRecord,
  nonEmptyText,
} from '../../utils'
import type { HistoricalEventLedgerSystem } from '../historical-event-ledger-system'
import {
  getDueCandidatesRuntime,
  toHistoricalValidationContext,
} from './candidate-due-runtime'

function emptyResult(errors: string[]): HistoricalEventCandidateDispositionResult {
  return { ok: false, errors, eventIds: [], candidateAudits: [] }
}

export function commitCandidateDispositionsRuntime(
  ledger: HistoricalEventLedgerSystem,
  batch: HistoricalEventCandidateDispositionBatch,
  rawContext: RoundContext | HistoricalEventValidationContext,
): HistoricalEventCandidateDispositionResult {
  const context = toHistoricalValidationContext(rawContext)
  const errors: string[] = []
  ledger['validateValidationContext'](context, errors)
  if (!isPlainRecord(batch?.source)) {
    errors.push('候选处置批次缺少 source')
  } else {
    ledger['validateSource'](batch.source, errors, '候选处置来源')
  }
  if (!Array.isArray(batch?.dispositions)) errors.push('候选处置必须是数组')
  if (!Array.isArray(batch?.deliveredCandidateIds)) errors.push('候选处置缺少实际投递编号数组')
  if (errors.length > 0) return emptyResult(errors)

  const allDueById = new Map(
    getDueCandidatesRuntime(ledger, rawContext).map((audit) => [audit.candidateId, audit]),
  )
  const deliveredIds = new Set<string>()
  for (const [index, rawCandidateId] of batch.deliveredCandidateIds.entries()) {
    const candidateId = nonEmptyText(rawCandidateId)
    if (!candidateId) {
      errors.push(`deliveredCandidateIds[${index}] 必须是非空字符串`)
      continue
    }
    if (deliveredIds.has(candidateId)) {
      errors.push(`deliveredCandidateIds[${index}] 重复: ${candidateId}`)
    }
    if (!allDueById.has(candidateId)) {
      errors.push(`实际投递候选在接纳回合并未到期或已经终结: ${candidateId}`)
    }
    deliveredIds.add(candidateId)
  }
  const dueById = new Map(
    [...deliveredIds].flatMap((candidateId) => {
      const audit = allDueById.get(candidateId)
      return audit ? [[candidateId, audit] as const] : []
    }),
  )
  const receivedIds = new Set<string>()
  for (const [index, disposition] of batch.dispositions.entries()) {
    const path = `dispositions[${index}]`
    if (!isPlainRecord(disposition)) {
      errors.push(`${path} 必须是对象`)
      continue
    }
    const candidateId = nonEmptyText(disposition.candidateId)
    const reason = nonEmptyText(disposition.reason)
    if (!candidateId) errors.push(`${path}.candidateId 不能为空`)
    if (!reason) errors.push(`${path}.reason 不能为空`)
    if (!['accepted', 'continuing', 'rejected', 'expired'].includes(String(disposition.status))) {
      errors.push(`${path}.status 无效`)
    }
    if (candidateId && receivedIds.has(candidateId)) {
      errors.push(`${path}.candidateId 重复: ${candidateId}`)
    }
    if (candidateId && !dueById.has(candidateId)) {
      errors.push(`${path} 引用了本轮未到期或不可用候选: ${candidateId}`)
    }
    if (candidateId) receivedIds.add(candidateId)
  }
  for (const candidateId of deliveredIds) {
    if (!receivedIds.has(candidateId)) errors.push(`到期候选必须逐项处置: ${candidateId}`)
  }
  if (errors.length > 0) return emptyResult(errors)
  if (deliveredIds.size === 0) return { ok: true, errors: [], eventIds: [], candidateAudits: [] }

  const eventInputs: HistoricalEventCreateInput[] = []
  const evidenceInputs: HistoricalEventEvidenceInput[] = []
  const candidateAudits: HistoricalEventCandidateAudit[] = []
  for (const disposition of batch.dispositions) {
    const latest = dueById.get(disposition.candidateId)!
    const candidate = latest.candidate
    ledger['validateCandidate'](candidate, errors, `candidate[${candidate.candidateId}]`, {
      mode: 'new-write',
      validationContext: context,
    })
    if (disposition.status === 'accepted') {
      const eventId = createLedgerId('event')
      eventInputs.push({
        eventId,
        eventType: candidate.eventType,
        title: candidate.title,
        description: disposition.reason.trim(),
        scope: cloneValue(candidate.scope),
        status: 'occurred',
        participants: cloneValue(candidate.participants),
        locations: cloneValue(candidate.locations),
        tags: [...new Set([...candidate.tags, 'candidate-accepted'])],
        metadata: {
          ...cloneValue(candidate.metadata),
          acceptedCandidate: {
            candidateId: candidate.candidateId,
            originalDescription: candidate.description,
            triggerConditionLabel: candidate.triggerConditionLabel,
            schedule: candidate.schedule ? cloneValue(candidate.schedule) : undefined,
          },
        },
      })
      evidenceInputs.push({
        evidenceId: createLedgerId('evidence'),
        eventId,
        kind: 'narrative',
        description: `到期候选由本轮已接纳故事确认：${disposition.reason.trim()}`,
        sourceId: batch.source.sourceId,
        contextId: context.contextId,
        payload: { candidate: cloneValue(candidate), disposition: cloneValue(disposition) },
      })
      candidateAudits.push(ledger['candidateProvider'].prepareDecision(
        candidate,
        'accepted',
        disposition.reason.trim(),
        context,
        eventId,
      ))
    } else if (disposition.status === 'continuing') {
      candidateAudits.push(ledger['candidateProvider'].prepareContinuation(
        candidate,
        disposition.reason.trim(),
        context,
      ))
    } else {
      candidateAudits.push(ledger['candidateProvider'].prepareDecision(
        candidate,
        disposition.status,
        disposition.reason.trim(),
        context,
      ))
    }
  }
  if (errors.length > 0) return emptyResult(errors)

  const batchId = createLedgerId('candidate-disposition-batch')
  let prepared: HistoricalEventPreparedAppend = {
    batchId,
    events: [],
    transitions: [],
    evidence: [],
    causalEdges: [],
    candidateAudits: [],
    migrationMetadata: [],
  }
  if (eventInputs.length > 0) {
    const preflight = ledger['preflightBatch']({
      batchId,
      source: batch.source,
      events: eventInputs,
      evidence: evidenceInputs,
    }, rawContext)
    if (!preflight.ok || !preflight.prepared) return emptyResult(preflight.errors)
    prepared = preflight.prepared
  }
  prepared.candidateAudits.push(...candidateAudits)
  const commit = ledger['commitPrepared']({ ok: true, errors: [], prepared })
  if (!commit.ok) return emptyResult(commit.errors)
  return {
    ok: true,
    errors: [],
    eventIds: commit.eventIds,
    candidateAudits: cloneValue(candidateAudits),
  }
}
