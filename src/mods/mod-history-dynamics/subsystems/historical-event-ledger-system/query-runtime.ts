/**
 * Purpose: Execute bounded read queries against the validated historical-event ledger index.
 * Owner: mod-history-dynamics
 * Responsibility: Read projection only; validation, candidate writes, and persistence remain with the ledger owner.
 */

import type {
  HistoricalCausalEdge,
  HistoricalCausalEdgeQuery,
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateQuery,
  HistoricalEventDetails,
  HistoricalEventDetailsQuery,
  HistoricalEventEvidence,
  HistoricalEventEvidenceQuery,
  HistoricalEventMigrationMetadata,
  HistoricalEventMigrationQuery,
  HistoricalEventQuery,
  HistoricalEventScope,
  HistoricalEventTransition,
  HistoricalEventTransitionQuery,
  HistoricalEventView,
  HistoricalQueryWindow,
} from '@/foundation'
import { cloneValue } from '../../utils'
import type { HistoricalEventLedgerSystem } from '../historical-event-ledger-system'

const DEFAULT_QUERY_LIMIT = 100
const MAX_QUERY_LIMIT = 500

export function isRelevantHistoricalScope(
  scope: HistoricalEventScope,
  contextId: string,
): boolean {
  if (scope.kind === 'global') return true
  return scope.contextIds.includes(contextId)
}

function resolveQueryWindow(
  query: HistoricalQueryWindow,
  path = 'query',
): { offset: number; limit: number } {
  const offset = query.offset ?? 0
  const limit = query.limit ?? DEFAULT_QUERY_LIMIT
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`${path}.offset 必须是非负整数`)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
    throw new Error(`${path}.limit 必须是 1-${MAX_QUERY_LIMIT} 的整数`)
  }
  return { offset, limit }
}

function collectBounded<T, R>(
  source: Iterable<T>,
  query: HistoricalQueryWindow,
  predicate: (item: T) => boolean,
  project: (item: T) => R,
): R[] {
  const { offset, limit } = resolveQueryWindow(query)
  const result: R[] = []
  let matched = 0
  for (const item of source) {
    if (!predicate(item)) continue
    if (matched < offset) {
      matched += 1
      continue
    }
    result.push(project(item))
    if (result.length >= limit) break
    matched += 1
  }
  return result
}

export function getHistoricalEventRuntime(
  ledger: HistoricalEventLedgerSystem,
  eventId: string,
): HistoricalEventView | undefined {
  const index = ledger['getLedgerIndex']()
  const event = index.eventById.get(eventId)
  return event ? ledger['toView'](event, index) : undefined
}

export function queryHistoricalEventsRuntime(
  ledger: HistoricalEventLedgerSystem,
  query: HistoricalEventQuery = {},
): HistoricalEventView[] {
  const index = ledger['getLedgerIndex']()
  const eventIds = query.eventIds ? new Set(query.eventIds) : undefined
  const scopeKinds = query.scopeKinds ? new Set(query.scopeKinds) : undefined
  const statuses = query.statuses ? new Set(query.statuses) : undefined
  const eventTypes = query.eventTypes ? new Set(query.eventTypes) : undefined
  const entityIds = query.entityIds ? new Set(query.entityIds) : undefined
  const labels = query.labels ? new Set(query.labels) : undefined
  const locationNodeIds = query.locationNodeIds ? new Set(query.locationNodeIds) : undefined
  const tags = query.tags ? new Set(query.tags) : undefined
  return collectBounded(index.state.events, query, (event) => {
    const status = index.statusByEventId.get(event.eventId) ?? event.initialStatus
    if (eventIds && !eventIds.has(event.eventId)) return false
    if (query.contextId && !isRelevantHistoricalScope(event.scope, query.contextId)) return false
    if (scopeKinds && !scopeKinds.has(event.scope.kind)) return false
    if (statuses && !statuses.has(status)) return false
    if (eventTypes && !eventTypes.has(event.eventType)) return false
    if (entityIds && !event.participants.some((item) => item.entityId && entityIds.has(item.entityId))) return false
    if (
      labels
      && !event.participants.some((item) => item.label && labels.has(item.label))
      && !event.locations.some((item) => item.label && labels.has(item.label))
    ) return false
    if (locationNodeIds && !event.locations.some((item) => item.nodeId && locationNodeIds.has(item.nodeId))) return false
    if (tags && !event.tags.some((tag) => tags.has(tag))) return false
    return !query.scheduledOnly || Boolean(event.schedule)
  }, (event) => ledger['toView'](event, index))
}

export function queryHistoricalEvidenceRuntime(
  ledger: HistoricalEventLedgerSystem,
  query: HistoricalEventEvidenceQuery = {},
): HistoricalEventEvidence[] {
  const index = ledger['getLedgerIndex']()
  const evidenceIds = query.evidenceIds ? new Set(query.evidenceIds) : undefined
  const eventIds = query.eventIds ? new Set(query.eventIds) : undefined
  const kinds = query.kinds ? new Set(query.kinds) : undefined
  return collectBounded(index.state.evidence, query, (item) => (
    (!evidenceIds || evidenceIds.has(item.evidenceId))
    && (!eventIds || eventIds.has(item.eventId))
    && (!kinds || kinds.has(item.kind))
    && (!query.contextId || item.contextId === query.contextId)
  ), cloneValue)
}

export function queryHistoricalTransitionsRuntime(
  ledger: HistoricalEventLedgerSystem,
  query: HistoricalEventTransitionQuery = {},
): HistoricalEventTransition[] {
  const index = ledger['getLedgerIndex']()
  const transitionIds = query.transitionIds ? new Set(query.transitionIds) : undefined
  const eventIds = query.eventIds ? new Set(query.eventIds) : undefined
  const fromStatuses = query.fromStatuses ? new Set(query.fromStatuses) : undefined
  const toStatuses = query.toStatuses ? new Set(query.toStatuses) : undefined
  return collectBounded(index.state.transitions, query, (item) => (
    (!transitionIds || transitionIds.has(item.transitionId))
    && (!eventIds || eventIds.has(item.eventId))
    && (!fromStatuses || fromStatuses.has(item.fromStatus))
    && (!toStatuses || toStatuses.has(item.toStatus))
  ), cloneValue)
}

export function queryHistoricalMigrationRuntime(
  ledger: HistoricalEventLedgerSystem,
  query: HistoricalEventMigrationQuery = {},
): HistoricalEventMigrationMetadata[] {
  const index = ledger['getLedgerIndex']()
  const migrationIds = query.migrationIds ? new Set(query.migrationIds) : undefined
  const fromVersions = query.fromVersions ? new Set(query.fromVersions) : undefined
  const sourceSystemIds = query.sourceSystemIds ? new Set(query.sourceSystemIds) : undefined
  return collectBounded(index.state.migrationMetadata, query, (item) => (
    (!migrationIds || migrationIds.has(item.migrationId))
    && (!fromVersions || fromVersions.has(item.fromVersion))
    && (!sourceSystemIds || item.sourceSystemIds.some((id) => sourceSystemIds.has(id)))
  ), cloneValue)
}

export function getHistoricalEventDetailsRuntime(
  ledger: HistoricalEventLedgerSystem,
  eventId: string,
  query: HistoricalEventDetailsQuery = {},
): HistoricalEventDetails | undefined {
  const index = ledger['getLedgerIndex']()
  const record = index.eventById.get(eventId)
  if (!record) return undefined
  const transitions = index.transitionsByEventId.get(eventId) ?? []
  const evidence = index.evidenceByEventId.get(eventId) ?? []
  const incoming = index.incomingEdgesByEventId.get(eventId) ?? []
  const outgoing = index.outgoingEdgesByEventId.get(eventId) ?? []
  return {
    event: ledger['toView'](record, index),
    transitions: collectBounded(transitions, query.transitions ?? {}, () => true, cloneValue),
    evidence: collectBounded(evidence, query.evidence ?? {}, () => true, cloneValue),
    incomingCausalEdges: collectBounded(incoming, query.incomingCausalEdges ?? {}, () => true, cloneValue),
    outgoingCausalEdges: collectBounded(outgoing, query.outgoingCausalEdges ?? {}, () => true, cloneValue),
    relatedCounts: {
      transitions: transitions.length,
      evidence: evidence.length,
      incomingCausalEdges: incoming.length,
      outgoingCausalEdges: outgoing.length,
    },
  }
}

export function queryHistoricalCausalEdgesRuntime(
  ledger: HistoricalEventLedgerSystem,
  query: HistoricalCausalEdgeQuery = {},
): HistoricalCausalEdge[] {
  const index = ledger['getLedgerIndex']()
  const edgeIds = query.edgeIds ? new Set(query.edgeIds) : undefined
  const fromEventIds = query.fromEventIds ? new Set(query.fromEventIds) : undefined
  const toEventIds = query.toEventIds ? new Set(query.toEventIds) : undefined
  const relations = query.relations ? new Set(query.relations) : undefined
  return collectBounded(index.state.causalEdges, query, (edge) => (
    (!edgeIds || edgeIds.has(edge.edgeId))
    && (!query.eventId || edge.fromEventId === query.eventId || edge.toEventId === query.eventId)
    && (!fromEventIds || fromEventIds.has(edge.fromEventId))
    && (!toEventIds || toEventIds.has(edge.toEventId))
    && (!query.contextId || isRelevantHistoricalScope(edge.scope, query.contextId))
    && (!relations || relations.has(edge.relation))
  ), cloneValue)
}

export function queryHistoricalCandidatesRuntime(
  ledger: HistoricalEventLedgerSystem,
  query: HistoricalEventCandidateQuery = {},
): HistoricalEventCandidateAudit[] {
  const index = ledger['getLedgerIndex']()
  const source = query.latestOnly === false
    ? index.state.candidateAudits
    : index.latestCandidateById.values()
  const candidateIds = query.candidateIds ? new Set(query.candidateIds) : undefined
  const statuses = query.statuses ? new Set(query.statuses) : undefined
  return collectBounded(source, query, (audit) => (
    (!candidateIds || candidateIds.has(audit.candidateId))
    && (!query.contextId || isRelevantHistoricalScope(audit.candidate.scope, query.contextId))
    && (!statuses || statuses.has(audit.status))
  ), cloneValue)
}
