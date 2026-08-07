/**
 * Purpose: Resolve historical validation context and the complete set of currently due candidates.
 * Owner: mod-history-dynamics
 * Responsibility: Read due-state only; candidate disposition and persistence remain with the ledger owner.
 */

import type {
  HistoricalEventCandidateAudit,
  HistoricalEventRecord,
  HistoricalEventValidationContext,
  RoundContext,
} from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { useWorldStore } from '@/mods/mod-world'

import { cloneValue } from '../../utils'
import type { HistoricalEventLedgerSystem } from '../historical-event-ledger-system'
import { isRelevantHistoricalScope } from './query-runtime'

export interface TrustedHistoricalEventValidationContext extends HistoricalEventValidationContext {
  origin: 'round-context' | 'explicit-context'
  trustedCharacterId?: string
  reportedCharacterId?: unknown
}

export function toHistoricalValidationContext(
  context: RoundContext | HistoricalEventValidationContext,
): TrustedHistoricalEventValidationContext {
  const isRoundContext = 'subsystemStates' in context
  const raw = context as unknown as Record<string, unknown>
  return {
    contextId: context.contextId,
    roundSequence: isRoundContext ? getRoundSequence(context) : context.roundSequence,
    totalDays: context.totalDays,
    legacyYear: isRoundContext ? context.round.year : context.legacyYear,
    origin: isRoundContext ? 'round-context' : 'explicit-context',
    trustedCharacterId: isRoundContext ? context.characterId : undefined,
    reportedCharacterId: !isRoundContext && Object.hasOwn(raw, 'characterId')
      ? raw.characterId ?? null
      : undefined,
  }
}

export function isHistoricalScheduleDue(
  schedule: HistoricalEventRecord['schedule'],
  context: Pick<HistoricalEventValidationContext, 'totalDays' | 'roundSequence' | 'legacyYear'>,
): boolean {
  if (!schedule) return true
  if (schedule.dueTotalDays !== undefined && schedule.dueTotalDays > context.totalDays) return false
  if (
    schedule.dueRoundSequence !== undefined
    && schedule.dueRoundSequence > context.roundSequence
  ) return false
  if (
    schedule.legacyYear !== undefined
    && (context.legacyYear === undefined || schedule.legacyYear > context.legacyYear)
  ) return false
  return true
}

export function getDueCandidatesRuntime(
  ledger: HistoricalEventLedgerSystem,
  rawContext: RoundContext | HistoricalEventValidationContext,
): HistoricalEventCandidateAudit[] {
  const context = toHistoricalValidationContext(rawContext)
  const errors: string[] = []
  ledger['validateValidationContext'](context, errors)
  if (errors.length > 0) throw new Error(errors.join('；'))

  const currentCapabilities = new Set(
    useWorldStore.getState().contexts[context.contextId]?.capabilityProfile?.capabilities ?? [],
  )
  return [...ledger['getLedgerIndex']().latestCandidateById.values()]
    .filter((audit) => {
      const candidate = audit.candidate
      return audit.status === 'available'
        && isRelevantHistoricalScope(candidate.scope, context.contextId)
        && candidate.requiredCapabilities.every((capability) => currentCapabilities.has(capability))
        && isHistoricalScheduleDue(candidate.schedule, context)
    })
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map(cloneValue)
}
