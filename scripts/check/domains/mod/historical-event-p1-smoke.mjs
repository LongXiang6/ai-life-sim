/**
 * Purpose: Verify historical facts, candidates, causal links, and persistence.
 * Owner: quality:mod
 * Responsibility: One sequential historical-ledger acceptance scenario.
 */

import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import { buildWorldContextInstance } from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import { buildDefaultCalibration } from '../../../../src/mods/mod-world/utils/calibration-clamp.ts'
import { WORLDVIEW_TAG_DEFAULTS } from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import {
  expireHistoricalEventCandidate,
  getHistoricalEventDetails,
  getHistoricalEventLedgerSystem,
  queryHistoricalEventCandidates,
  queryHistoricalEventEvidence,
  rejectHistoricalEventCandidate,
} from '../../../../src/mods/mod-history-dynamics/historical-event-api.ts'
import {
  migrateHistoryDynamicsState,
  useHistoryDynamicsStore,
} from '../../../../src/mods/mod-history-dynamics/store.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

function worldConfig(name) {
  return {
    name,
    eraName: '测试纪元',
    eraStartYear: 1,
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerFramework: {
      id: 'fixture:power',
      label: '无超常力量体系',
      enabled: false,
      progression: 'bounded',
      ranks: [],
      source: 'world-default',
    },
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}的历史事件验收设定。`,
    festivalScope: 'china',
    worldType: 'mixed',
  }
}

function region(name) {
  return {
    id: 'main',
    name,
    summary: `${name}区域概况`,
    climate: '温和',
    ecology: '河谷生态',
    resources: ['淡水'],
    pollution: '低',
    economy: '地方贸易',
    population: '人口适中',
    settlement: '镇落',
    culture: '地方传统',
    education: '基础教育',
    socialStructure: '熟人社会',
    factions: '无稳定派系',
    law: '习惯法为主',
    updatedAtGlobalDay: 0,
    templateType: '测试区域',
    terrainTag: 'plains',
  }
}

function contextFixture(contextId, name, scope, capabilities) {
  const config = worldConfig(name)
  return buildWorldContextInstance({
    contextId,
    config,
    snapshot: {
      contextId,
      rootSpatialNodeId: `${contextId}:space:root`,
      worldConfig: config,
      regions: [region(`${name}主区域`)],
      tags: WORLDVIEW_TAG_DEFAULTS.mixed,
    },
    worldCode: contextId === 'ctx_history_a' ? 301 : 302,
    calibration: buildDefaultCalibration(config),
    capabilities,
    scope,
  })
}

function activateContext(contextId) {
  useWorldStore.setState((state) => ({
    currentContextId: contextId,
    contexts: Object.fromEntries(Object.entries(state.contexts).map(([id, instance]) => [
      id,
      {
        ...instance,
        record: { ...instance.record, lifecycle: id === contextId || instance.scope.scope === 'background' ? 'open' : 'dormant' },
        scope: {
          ...instance.scope,
          scope: id === contextId ? 'active' : id === state.currentContextId ? 'background' : instance.scope.scope,
        },
      },
    ])),
  }))
}

function roundContext(contextId, characterId, totalDays = 800) {
  return {
    contextId,
    contextScope: 'active',
    worldId: contextId,
    characterId,
    round: { year: 3, season: 1, month: 2 },
    timeStep: { unit: 'year', value: 1 },
    difficulty: 'normal',
    subsystemStates: {},
    roundSequence: 8,
    daysPassed: 365,
    totalDays,
  }
}

const contextA = 'ctx_history_a'
const contextB = 'ctx_history_b'
const characterId = 'character:history-player'
const instanceA = contextFixture(contextA, '世界甲', 'active', ['life', 'technology'])
const instanceB = contextFixture(contextB, '世界乙', 'background', ['space'])
const nodeA = instanceA.spatialGraph.currentRegionId
const nodeB = instanceB.spatialGraph.currentRegionId

useWorldStore.getState().reset()
useWorldStore.getState().registerContext(instanceA, true)
useWorldStore.getState().registerContext(instanceB, false)
useCharacterStore.getState().reset()
useCharacterStore.setState({ characterId, name: '历史验收角色', background: '验证历史与状态证据。' })

const validation = { contextId: contextA, roundSequence: 8, totalDays: 800 }
const ledger = getHistoricalEventLedgerSystem()
ledger.reset()

let missingCapabilityRejected = false
try {
  ledger.submitCandidates({
    source: { kind: 'system', sourceId: 'candidate-capability-smoke' },
    candidates: [{
      candidateId: 'candidate:missing-capability',
      eventType: 'travel',
      title: '跨界候选',
      description: '世界乙没有 life 能力。',
      scope: { kind: 'travel', contextIds: [contextA, contextB] },
      requiredCapabilities: ['life'],
    }],
  }, validation)
} catch {
  missingCapabilityRejected = true
}
assertOk(missingCapabilityRejected, 'candidate owner must reject missing context capabilities')
assertOk(ledger.queryCandidates().length === 0, 'rejected candidates must make zero writes')

const submitted = ledger.submitCandidates({
  source: { kind: 'system', sourceId: 'candidate-smoke' },
  candidates: [{
    candidateId: 'candidate:harbor-change',
    eventType: 'world-change',
    title: '港口可能开放',
    description: '这仍是候选，不是已发生事实。',
    scope: { kind: 'context', contextIds: [contextA] },
    participants: [{ label: '林舟' }],
    requiredCapabilities: ['technology', 'life', 'life'],
  }],
}, validation)
assertOk(submitted[0]?.status === 'available', 'submitted candidate must enter the available lifecycle')
assertOk(ledger.queryEvents().length === 0, 'candidate must not become a historical fact before promotion')
assertOk(submitted[0]?.candidate.requiredCapabilities.join(',') === 'life,technology', 'candidate capabilities must be normalized deterministically')

ledger.submitCandidates({
  source: { kind: 'system', sourceId: 'candidate-terminal-smoke' },
  candidates: [
    { candidateId: 'candidate:reject', eventType: 'test', title: '待拒绝', description: '保留拒绝审计。', scope: { kind: 'context', contextIds: [contextA] } },
    { candidateId: 'candidate:expire', eventType: 'test', title: '待过期', description: '保留过期审计。', scope: { kind: 'context', contextIds: [contextA] } },
  ],
}, validation)
rejectHistoricalEventCandidate('candidate:reject', '条件不成立', validation)
expireHistoricalEventCandidate('candidate:expire', '时间窗口结束', validation)
assertOk(
  ledger.queryCandidates({ candidateIds: ['candidate:reject'] })[0]?.status === 'rejected'
    && ledger.queryCandidates({ candidateIds: ['candidate:expire'] })[0]?.status === 'expired',
  'candidate owner must expose explicit rejected and expired terminal states',
)
assertOk(
  queryHistoricalEventCandidates({ candidateIds: ['candidate:reject', 'candidate:expire'], latestOnly: false }).length === 4,
  'candidate audit history must remain append-only',
)

const promoted = ledger.promoteCandidate('candidate:harbor-change', {
  eventType: 'world-change',
  title: '港口已经开放',
  description: '候选经过拥有系统确认后成为事实。',
  scope: { kind: 'context', contextIds: [contextA] },
  status: 'resolved',
}, validation)
assertOk(promoted.ok && promoted.eventIds.length === 1, 'available candidate must promote into one fact')

const bulkDueCandidates = Array.from({ length: 512 }, (_, index) => ({
  candidateId: `candidate:bulk-due:${index}`,
  eventType: 'bulk-due-test',
  title: `同轮到期候选 ${index}`,
  description: `第 ${index} 个候选已经到达处理节点。`,
  scope: { kind: 'context', contextIds: [contextA] },
  schedule: { dueTotalDays: 800 },
  triggerConditionLabel: '规范时间到达第 800 天',
}))
ledger.submitCandidates({
  source: { kind: 'system', sourceId: 'bulk-due-candidate-smoke' },
  candidates: [
    ...bulkDueCandidates,
    {
      candidateId: 'candidate:future-only',
      eventType: 'future-test',
      title: '尚未到期候选',
      description: '第 801 天才可进入主叙事。',
      scope: { kind: 'context', contextIds: [contextA] },
      schedule: { dueTotalDays: 801 },
    },
  ],
}, validation)
const roundAt800 = roundContext(contextA, characterId, 800)
const dueAt800 = ledger.getDueCandidates(roundAt800)
assertOk(
  dueAt800.length === bulkDueCandidates.length
    && dueAt800.every((audit) => audit.candidateId.startsWith('candidate:bulk-due:')),
  'all due candidates beyond the former 500-item query page must be returned without a hidden total cap',
)
assertOk(
  ledger.queryCandidates({
    candidateIds: bulkDueCandidates.map((candidate) => candidate.candidateId),
  }).length === bulkDueCandidates.length,
  'candidate queries must return the complete match set when no explicit read window is requested',
)
assertOk(
  ledger.collectState(roundAt800).data.dueCandidates.length === bulkDueCandidates.length,
  'collectState must project every due candidate and exclude future candidates',
)

const dispositions = bulkDueCandidates.map((candidate, index) => ({
  candidateId: candidate.candidateId,
  status: index === 0
    ? 'accepted'
    : index === 1
      ? 'continuing'
      : index === 2
        ? 'rejected'
        : 'expired',
  reason: index === 0
    ? '正文已经确认第一个候选事件发生。'
    : index === 1
      ? '正文确认触发条件仍未完全满足。'
      : index === 2
        ? '正文确认该候选与当前事实冲突。'
        : '正文确认该候选的有效时机已经过去。',
}))
const auditCountBeforeIncomplete = ledger.queryCandidates({ latestOnly: false }).length
const incompleteDisposition = ledger.commitCandidateDispositions({
  source: { kind: 'narrative', sourceId: 'bulk-due-disposition-incomplete' },
  deliveredCandidateIds: bulkDueCandidates.map((candidate) => candidate.candidateId),
  dispositions: dispositions.slice(1),
}, roundAt800)
assertOk(
  !incompleteDisposition.ok
    && ledger.queryCandidates({ latestOnly: false }).length === auditCountBeforeIncomplete,
  'missing one delivered candidate disposition must reject the complete decision package without partial writes',
)
const dispositionResult = ledger.commitCandidateDispositions({
  source: { kind: 'narrative', sourceId: 'bulk-due-disposition-complete' },
  deliveredCandidateIds: bulkDueCandidates.map((candidate) => candidate.candidateId),
  dispositions,
}, roundAt800)
assertOk(
  dispositionResult.ok
    && dispositionResult.candidateAudits.length === bulkDueCandidates.length
    && dispositionResult.eventIds.length === 1,
  'all delivered candidate dispositions must commit in one complete batch without a quantity limit',
)
assertOk(
  ledger.queryCandidates({ candidateIds: ['candidate:bulk-due:0'] })[0]?.status === 'accepted'
    && ledger.queryCandidates({ candidateIds: ['candidate:bulk-due:1'] })[0]?.status === 'available'
    && ledger.queryCandidates({ candidateIds: ['candidate:bulk-due:2'] })[0]?.status === 'rejected'
    && ledger.getEvent(dispositionResult.eventIds[0])?.status === 'occurred',
  'accepted, continuing, and rejected candidate decisions must produce the correct latest lifecycle state',
)

ledger.submitCandidates({
  source: { kind: 'narrative', sourceId: 'narrative-story-continuity:delivery-marker-smoke' },
  candidates: [{
    candidateId: 'candidate:narrative-delivery-marker',
    eventType: 'delivery-marker-test',
    title: '正文已经投递的候选',
    description: '候选仍保留在账本，但不应再次进入故事 Prompt。',
    scope: { kind: 'context', contextIds: [contextA] },
    schedule: { dueTotalDays: 800 },
  }],
}, roundAt800)
const deliveryMarkerResult = ledger.commitCandidateDispositions({
  source: { kind: 'narrative', sourceId: 'narrative-delivery:narrative-marker-smoke' },
  deliveredCandidateIds: ['candidate:narrative-delivery-marker'],
  dispositions: [{
    candidateId: 'candidate:narrative-delivery-marker',
    status: 'continuing',
    reason: '[mod-engine:narrative-delivery] 正文已发布；候选仍保留在本地账本，不再重复投影。',
  }],
}, roundAt800)
assertOk(
  deliveryMarkerResult.ok
    && ledger.queryCandidates({ candidateIds: ['candidate:narrative-delivery-marker'] })[0]?.status === 'available'
    && !ledger.getDueCandidates(roundAt800).some((audit) => audit.candidateId === 'candidate:narrative-delivery-marker'),
  'narrative delivery marker must keep a candidate available while preventing repeat due projection',
)

const exactDescription = `完整历史正文：${'潮声与灯火。'.repeat(600)}`
const committedA = ledger.commitBatch({
  batchId: 'batch:world-a',
  source: { kind: 'system', sourceId: 'historical-event-p1-smoke' },
  events: [{
    eventId: 'event:world-a:festival',
    eventType: 'local-event',
    title: '同名庆典',
    description: exactDescription,
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
    participants: [{ entityId: characterId, contextId: contextA, role: 'actor' }, { label: '林舟' }],
    locations: [{ contextId: contextA, nodeId: nodeA }],
    tags: ['festival', 'harbor'],
  }],
  evidence: [{
    evidenceId: 'evidence:world-a:festival',
    eventId: 'event:world-a:festival',
    kind: 'system-commit',
    description: '测试系统确认事实。',
    sourceId: 'historical-event-p1-smoke',
    contextId: contextA,
  }],
}, validation)
activateContext(contextB)
const validationB = { ...validation, contextId: contextB }
const committedB = ledger.commitBatch({
  batchId: 'batch:world-b',
  source: { kind: 'system', sourceId: 'historical-event-p1-smoke' },
  events: [{
    eventId: 'event:world-b:festival',
    eventType: 'local-event',
    title: '同名庆典',
    description: '世界乙的庆典。',
    scope: { kind: 'context', contextIds: [contextB] },
    status: 'resolved',
    participants: [{ label: '林舟' }],
    locations: [{ contextId: contextB, nodeId: nodeB }],
  }],
}, validationB)
activateContext(contextA)
const committedEdge = ledger.commitCrossContextEdge({
  edgeId: 'edge:festival-propagates',
  fromEventId: 'event:world-a:festival',
  toEventId: 'event:world-b:festival',
  relation: 'propagates',
  scope: { kind: 'cross-context', contextIds: [contextA, contextB] },
  evidenceIds: ['evidence:world-a:festival'],
}, validation)
assertOk(committedA.ok && committedB.ok && committedEdge.ok, 'valid cross-world history and causal edge must commit')
assertOk(ledger.getEvent('event:world-a:festival')?.description === exactDescription, 'historical descriptions must remain complete without truncation')
assertOk(
  ledger.queryEvents({ entityIds: [characterId] })[0]?.eventId === 'event:world-a:festival'
    && ledger.queryEvents({ labels: ['林舟'] }).length >= 2
    && ledger.queryEvents({ locationNodeIds: [nodeA] })[0]?.eventId === 'event:world-a:festival',
  'history queries must support stable character, narrative label, and region selectors',
)
const details = getHistoricalEventDetails('event:world-a:festival', {
  evidence: { limit: 1 },
  outgoingCausalEdges: { limit: 1 },
})
assertOk(
  details?.evidence[0]?.evidenceId === 'evidence:world-a:festival'
    && details.outgoingCausalEdges[0]?.edgeId === 'edge:festival-propagates',
  'bounded event details must expose evidence and causal links',
)
assertOk(queryHistoricalEventEvidence({ eventIds: ['event:world-a:festival'] }).length === 1, 'evidence must remain queryable by event')

const scheduled = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'scheduled-smoke' },
  events: [{
    eventId: 'event:global:scheduled',
    eventType: 'scheduled-test',
    title: '待处理事项',
    description: '未来需要继续处理。',
    scope: { kind: 'global', contextIds: [] },
    status: 'scheduled',
    schedule: { dueTotalDays: 900 },
  }],
}, validation)
assertOk(
  !ledger.collectState(roundContext(contextA, characterId, 800)).data.relevantEvents
    .some((event) => event.eventId === 'event:global:scheduled'),
  'scheduled historical events must stay outside the main narrative before every declared time condition is due',
)
const activated = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'scheduled-transition-smoke' },
  transitions: [{ eventId: 'event:global:scheduled', toStatus: 'active', reason: '进入处理窗口' }],
}, { ...validation, roundSequence: 9, totalDays: 900 })
const round = roundContext(contextA, characterId, 900)
assertOk(scheduled.ok && activated.ok, 'scheduled fact and legal transition must append')
assertOk(
  ledger.collectState(round).data.relevantEvents.some((event) => event.eventId === 'event:global:scheduled'),
  'collectState must expose only current relevant pending history plus aggregate counts',
)

const beforeLongHistory = ledger.queryEvents({ limit: 500 }).length
const longHistory = Array.from({ length: 128 }, (_, index) => ({
  eventId: `event:long-history:${index}`,
  eventType: 'retention-test',
  title: `长期历史 ${index}`,
  description: `第 ${index} 条完整历史事实。`,
  scope: { kind: 'global', contextIds: [] },
  status: 'occurred',
}))
const longCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'long-history-smoke' },
  events: longHistory,
}, validation)
const retained = ledger.queryEvents({ offset: beforeLongHistory, limit: 500 })
assertOk(longCommit.ok && retained.length === 128, 'history larger than the old capacity must remain stored')
assertOk(
  retained[0]?.description === '第 0 条完整历史事实。'
    && retained[127]?.description === '第 127 条完整历史事实。',
  'long-history retention must preserve earliest and latest complete facts',
)

const serialized = JSON.parse(JSON.stringify(ledger.capturePersistenceState()))
ledger.reset()
ledger.restorePersistenceState(serialized)
assertOk(JSON.stringify(ledger.capturePersistenceState()) === JSON.stringify(serialized), 'JSON persistence round-trip must preserve the complete ledger')
const corrupted = JSON.parse(JSON.stringify(serialized))
corrupted.events.push(JSON.parse(JSON.stringify(corrupted.events[0])))
let corruptedRejected = false
try {
  ledger.restorePersistenceState(corrupted)
} catch {
  corruptedRejected = true
}
assertOk(corruptedRejected, 'duplicate historical IDs must be rejected during strict restore')

const legacyPayload = {
  eventPool: {
    entries: [{ id: 'legacy-weather', name: '旧天气事件', description: exactDescription, triggered: true, source: 'legacy-event-pool' }],
  },
  causalSimulation: {
    queue: { pending: [{ id: 'legacy-causal', captureDescription: '旧承诺', triggerYear: 4 }], resolved: [] },
  },
  unknownLegacyField: { complete: true },
}
const migrated = migrateHistoryDynamicsState(legacyPayload, 1, contextA)
assertOk(migrated.events.length === 2 && migrated.events[0]?.description === exactDescription, 'legacy facts must migrate without shortening their content')
assertOk(
  migrated.migrationMetadata[0]?.legacyPayload.unknownLegacyField.complete === true,
  'legacy migration metadata must retain the complete original payload',
)

// 预生成历史投影必须只读本地深拷贝，不能水合、替换或追加正式账本 Store。
const formalLedgerStateBeforeProjection = useHistoryDynamicsStore.getState()
const formalLedgerRefs = {
  events: formalLedgerStateBeforeProjection.events,
  transitions: formalLedgerStateBeforeProjection.transitions,
  evidence: formalLedgerStateBeforeProjection.evidence,
  causalEdges: formalLedgerStateBeforeProjection.causalEdges,
  candidateAudits: formalLedgerStateBeforeProjection.candidateAudits,
  migrationMetadata: formalLedgerStateBeforeProjection.migrationMetadata,
}
const formalLedgerJsonBeforeProjection = JSON.stringify(ledger.capturePersistenceState())
const projection = ledger.createReadOnlyProjection()
const assertFormalLedgerUnchanged = (label) => {
  const state = useHistoryDynamicsStore.getState()
  assertOk(
    state.events === formalLedgerRefs.events
      && state.transitions === formalLedgerRefs.transitions
      && state.evidence === formalLedgerRefs.evidence
      && state.causalEdges === formalLedgerRefs.causalEdges
      && state.candidateAudits === formalLedgerRefs.candidateAudits
      && state.migrationMetadata === formalLedgerRefs.migrationMetadata,
    `${label} must preserve formal ledger array references`,
  )
  assertOk(
    JSON.stringify(ledger.capturePersistenceState()) === formalLedgerJsonBeforeProjection,
    `${label} must preserve formal ledger contents`,
  )
}

assertFormalLedgerUnchanged('creating the read-only ledger projection')
projection.collectState(round)
projection.queryCandidates({ latestOnly: false })
projection.queryEvents?.()
projection.getDueCandidates(round)
assertFormalLedgerUnchanged('querying the read-only ledger projection')
projection.reset()
assertFormalLedgerUnchanged('resetting the read-only ledger projection')

let projectionWriteRejected = false
try {
  projection.commitBatch({
    source: { kind: 'system', sourceId: 'projection-write-guard' },
    events: [{
      eventId: 'event:projection-write-guard',
      eventType: 'projection-write-guard',
      title: '投影写入守卫',
      description: '投影不得向正式账本追加事实。',
      scope: { kind: 'context', contextIds: [contextA] },
      status: 'occurred',
    }],
  }, round)
} catch {
  projectionWriteRejected = true
}
assertOk(projectionWriteRejected, 'read-only ledger projection must reject writes')
assertFormalLedgerUnchanged('attempting a write through the read-only ledger projection')

if (failed > 0) {
  console.error(`historical-event-p1-smoke failed: ${failed}`)
  process.exit(1)
}

console.log('PASS: historical-event-p1-smoke')
