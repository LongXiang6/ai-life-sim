/**
 * Purpose: Regress the P1 historical-event ledger across one stateful migration and commit scenario.
 * Owner: quality:mod
 * Responsibility: Historical-event smoke fixtures and sequential assertions only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import {
  expireHistoricalEventCandidate,
  getHistoricalEventDetails,
  getHistoricalEventLedgerSystem,
  queryHistoricalEventCandidates,
  queryHistoricalEventEvidence,
  queryHistoricalEventMigrations,
  queryHistoricalEvents,
  rejectHistoricalEventCandidate,
} from '../../../../src/mods/mod-history-dynamics/historical-event-api.ts'
import {
  migrateHistoryDynamicsState,
  useHistoryDynamicsStore,
} from '../../../../src/mods/mod-history-dynamics/store.ts'
import {
  narrativeParser,
  validateNarrativeEventMetadataForNarrative,
} from '../../../../src/mods/mod-engine/subsystems/narrative-parser-system.ts'
import { orchestrator } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'
import {
  translateNarrativeAIDataAnalysis,
  translateNarrativeAIEventRecognition,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { causalDelay } from '../../../../src/mods/mod-engine/subsystems/causal-delay-system.ts'
import { memoryLifecycle } from '../../../../src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'
import { plotStructure } from '../../../../src/mods/mod-engine/subsystems/plot-structure-system.ts'
import { foreshadowing } from '../../../../src/mods/mod-engine/subsystems/foreshadowing-system.ts'
import { coreMemory } from '../../../../src/mods/mod-engine/subsystems/core-memory-system.ts'
import { digestLedger } from '../../../../src/mods/mod-engine/helpers/digest-ledger.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import { getMoralitySystem } from '../../../../src/mods/mod-character/subsystems/morality-system.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { getCharacterBaseSystem } from '../../../../src/mods/mod-character/subsystems/character-base-system.ts'
import {
  applyGameSave,
  collectGameSavePayload,
  ensureOrchestratorContextFromStores,
} from '../../../../src/mods/mod-engine/helpers/save-restore.ts'
import {
  isMvpSystemInstructionSubsystem,
  MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS,
} from '../../../../src/mods/mod-engine/helpers/mvp-runtime-policy.ts'
import { useGlobalStore } from '../../../../src/core/global-store/global-store.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

function sameStringSet(left, right) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort())
}

function parsedNarrative(body, digest, data = {}) {
  const systemInstructions = data.系统指令 ?? []
  const registeredEvents = data.注册事件 ?? data.关键事件 ?? []
  const {
    系统指令: _systemInstructions,
    关键事件: _legacyKeyEvents,
    注册事件: _registeredEvents,
    ...eventMetadata
  } = data
  const allowedEvidenceEventIds = systemInstructions.flatMap((instruction) => instruction.依据事件 ?? [])
  const narrative = narrativeParser.parse(`⟦正文⟧${body}`)
  const dataChanges = translateNarrativeAIDataAnalysis(
    { 系统操作: systemInstructions },
    {
      allowedEvidenceEventIds,
      allowedSubsystemIds: [...MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS]
        .filter(isMvpSystemInstructionSubsystem),
    },
  )
  const roundContext = orchestrator.getRoundContextSnapshot()
  const eventRecognition = translateNarrativeAIEventRecognition({
    回合事件: {
      摘要: digest,
      ...eventMetadata,
      注册事件: registeredEvents,
    },
    待触发事件: [],
  }, {
    currentContextId: roundContext.contextId,
    currentTotalDays: roundContext.totalDays,
  })
  validateNarrativeEventMetadataForNarrative(narrative, eventRecognition.metadata)
  return {
    narrative,
    dataChanges,
    eventMetadata: eventRecognition.metadata,
  }
}

async function submitNarrative(bundle, candidates = [], options = {}) {
  const accepted = orchestrator.acceptNarrativeResponse(bundle.narrative)
  const dataWork = Promise.resolve({ changes: bundle.dataChanges })
  orchestrator.launchNarrativeBackgroundAnalysis({
    kind: 'data-analysis',
    narrativeId: accepted.narrativeId,
    userSegments: [`⟦测试数据分析⟧${accepted.narrativeId}`],
    work: () => dataWork,
  })

  let resolveEvent
  let rejectEvent
  const eventWork = new Promise((resolve, reject) => {
    resolveEvent = resolve
    rejectEvent = reject
  })
  orchestrator.launchNarrativeBackgroundAnalysis({
    kind: 'event-recognition',
    narrativeId: accepted.narrativeId,
    userSegments: [`⟦测试事件识别⟧${accepted.narrativeId}`],
    work: () => eventWork,
  })

  await dataWork
  await Promise.resolve()
  orchestrator.consumeNarrativeBackgroundResults()
  options.afterDataCommit?.()

  if (options.eventFailure) {
    rejectEvent(options.eventFailure)
  } else {
    resolveEvent({
      metadata: bundle.eventMetadata,
      candidates,
    })
  }
  await Promise.allSettled([eventWork])
  await Promise.resolve()
  orchestrator.consumeNarrativeBackgroundResults()
  return {
    ...accepted,
    changes: bundle.dataChanges,
  }
}

function fixtureContext(contextId, name, entityId, nodeId, capabilities, scope) {
  const worldConfig = {
    name,
    eraName: '测试纪元',
    eraStartYear: 1,
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}的完整测试设定。`,
    worldType: 'mixed',
  }
  return {
    record: {
      id: contextId,
      name,
      description: worldConfig.description,
      kind: 'world',
      rootSpatialNodeId: nodeId,
      lifecycle: scope === 'dormant' ? 'dormant' : 'open',
      createdAtGlobalDay: 0,
      localCalendar: {
        calendarId: 'canonical-365',
        displayName: '测试纪元',
        daysPerYear: 365,
        monthsPerYear: 12,
        timeScale: 1,
        pausedWhenInactive: true,
      },
      localClock: { totalLocalDays: 0, lastGlobalTotalDays: 0 },
    },
    capabilityProfile: {
      contextId,
      capabilities,
      enabledSubsystemIds: ['historical-event-ledger'],
      backgroundSubsystemIds: [],
      derivedFrom: 'confirmed-facts',
    },
    scope: { contextId, scope },
    entities: [{ id: entityId, name: '同名人物' }],
    spatialGraph: {
      contextId,
      rootNodeId: nodeId,
      nodes: {
        [nodeId]: {
          id: nodeId,
          contextId,
          kind: 'scene',
          name: `${name}地点`,
          attributes: {},
        },
      },
      edges: {},
      entityLocations: {
        [entityId]: {
          entityId,
          contextId,
          nodeId,
          updatedAtGlobalDay: 0,
        },
      },
    },
    worldConfig,
    worldCode: contextId === contextA ? 101 : contextId === contextB ? 102 : 103,
    initialized: true,
    regions: [],
    tags: {},
    worldTags: [],
    currentYear: 0,
    eraStartYear: 1,
    eraName: '测试纪元',
    calibration: null,
    destinyPatternModifiers: {},
    worldInitAIStatus: null,
  }
}

const contextA = 'ctx_history_a'
const contextB = 'ctx_history_b'
const contextC = 'ctx_history_c'
const entityA = 'ctx_history_a:entity:same-name'
const entityB = 'ctx_history_b:entity:same-name'
const entityC = 'ctx_history_c:entity:scope-probe'
const nodeA = 'ctx_history_a:space:root'
const nodeB = 'ctx_history_b:space:root'
const nodeC = 'ctx_history_c:space:root'
const fixtureA = fixtureContext(contextA, '世界甲', entityA, nodeA, ['life', 'technology'], 'active')
const fixtureB = fixtureContext(contextB, '世界乙', entityB, nodeB, ['space'], 'background')
const fixtureC = fixtureContext(contextC, '世界丙', entityC, nodeC, ['life'], 'dormant')

useWorldStore.setState({
  contexts: {
    [contextA]: fixtureA,
    [contextB]: fixtureB,
    [contextC]: fixtureC,
  },
  currentContextId: contextA,
  worldConfig: fixtureA.worldConfig,
  entities: fixtureA.entities,
  initialized: true,
  worldCode: fixtureA.worldCode,
  currentYear: fixtureA.currentYear,
  worldTags: fixtureA.worldTags,
  eraStartYear: fixtureA.eraStartYear,
  eraName: fixtureA.eraName,
  calibration: fixtureA.calibration,
  destinyPatternModifiers: fixtureA.destinyPatternModifiers,
  worldInitAIStatus: fixtureA.worldInitAIStatus,
})

function activateContext(contextId) {
  useWorldStore.setState((state) => ({
    currentContextId: contextId,
    contexts: Object.fromEntries(Object.entries(state.contexts).map(([id, instance]) => [
      id,
      {
        ...instance,
        record: {
          ...instance.record,
          lifecycle: id === contextId
            ? 'open'
            : id === state.currentContextId
              ? 'open'
              : instance.record.lifecycle,
        },
        scope: {
          ...instance.scope,
          scope: id === contextId
            ? 'active'
            : id === state.currentContextId
              ? 'background'
              : instance.scope.scope,
        },
      },
    ])),
  }))
}

const validation = {
  contextId: contextA,
  roundSequence: 8,
  totalDays: 800,
}
const roundContext = {
  ...validation,
  characterId: entityA,
  contextScope: 'active',
  worldId: contextA,
  round: { year: 3, season: 1, month: 1 },
  timeStep: { unit: 'year', value: 1 },
  difficulty: 'normal',
  subsystemStates: {},
  daysPassed: 365,
}

const ledger = getHistoricalEventLedgerSystem()
ledger.reset()

// 显式 validation context 不能伪造角色身份；畸形候选也必须可控拒绝且零写入。
for (const [label, submission, context] of [
  [
    'self-reported characterId',
    {
      source: { kind: 'system', sourceId: 'spoofed-character-smoke' },
      candidates: [{
        eventType: 'test',
        title: '伪造角色候选',
        description: '不得写入。',
        scope: { kind: 'context', contextIds: [contextA] },
      }],
    },
    { ...validation, characterId: entityA },
  ],
  [
    'malformed candidate',
    {
      source: { kind: 'system', sourceId: 'malformed-candidate-smoke' },
      candidates: [{ eventType: 'test', scope: { kind: 'context', contextIds: [contextA] } }],
    },
    validation,
  ],
]) {
  const before = JSON.stringify(ledger.capturePersistenceState())
  let rejected = false
  try {
    ledger.submitCandidates(submission, context)
  } catch (error) {
    rejected = error instanceof Error && !error.message.includes('trim')
  }
  assertOk(rejected, `${label} must produce a controlled rejection`)
  assertOk(JSON.stringify(ledger.capturePersistenceState()) === before, `${label} must make zero writes`)
}

// 能力要求为空时保持任意世界观；非空时逐个 scoped context 校验并持久化规范化要求。
for (const [label, candidate] of [
  ['missing context capability', {
    candidateId: 'candidate:missing-capability',
    eventType: 'test',
    title: '能力不足候选',
    description: '世界乙没有 life 能力。',
    scope: { kind: 'travel', contextIds: [contextA, contextB] },
    requiredCapabilities: ['life'],
  }],
  ['global capability requirement', {
    candidateId: 'candidate:global-capability',
    eventType: 'test',
    title: '错误全局能力候选',
    description: 'global 候选不得绑定题材能力。',
    scope: { kind: 'global', contextIds: [] },
    requiredCapabilities: ['technology'],
  }],
  ['global dormant reference', {
    candidateId: 'candidate:global-dormant-reference',
    eventType: 'test',
    title: '错误休眠引用候选',
    description: 'global 不能绕过休眠上下文写入门禁。',
    scope: { kind: 'global', contextIds: [] },
    participants: [{ entityId: entityC, contextId: contextC }],
  }],
]) {
  const before = JSON.stringify(ledger.capturePersistenceState())
  let rejected = false
  try {
    ledger.submitCandidates({
      source: { kind: 'system', sourceId: 'candidate-capability-smoke' },
      candidates: [candidate],
    }, validation)
  } catch {
    rejected = true
  }
  assertOk(rejected, `${label} must be rejected by the candidate owner`)
  assertOk(JSON.stringify(ledger.capturePersistenceState()) === before, `${label} must make zero writes`)
}

// 候选只进入候选审计，不能静默成为事实。
const submitted = ledger.submitCandidates({
  source: { kind: 'system', sourceId: 'candidate-smoke' },
  candidates: [{
    candidateId: 'candidate:weather-change',
    eventType: 'world-change',
    title: '可能发生的变化',
    description: '只是一条显式候选。',
    scope: { kind: 'context', contextIds: [contextA] },
    participants: [{ label: '尚未建档的观察者' }],
    requiredCapabilities: ['technology', 'life', 'life'],
  }],
}, validation)
assertOk(submitted[0]?.status === 'available', 'submitted candidate must enter the available lifecycle')
assertOk(ledger.queryEvents().length === 0, 'candidate must not be recorded as a historical fact')
assertOk(ledger.queryCandidates()[0]?.candidate.participants[0]?.entityId === undefined, 'unknown labels must not receive fabricated entity IDs')
assertOk(
  submitted[0]?.candidate.requiredCapabilities.join(',') === 'life,technology',
  'accepted candidate audits must preserve a deduplicated, stable capability requirement list',
)

ledger.submitCandidates({
  source: { kind: 'system', sourceId: 'candidate-terminal-smoke' },
  candidates: [
    {
      candidateId: 'candidate:reject-me',
      eventType: 'test',
      title: '待拒绝候选',
      description: '必须保留 rejected 审计。',
      scope: { kind: 'context', contextIds: [contextA] },
    },
    {
      candidateId: 'candidate:expire-me',
      eventType: 'test',
      title: '待过期候选',
      description: '必须保留 expired 审计。',
      scope: { kind: 'context', contextIds: [contextA] },
    },
    {
      candidateId: 'candidate:generic-global',
      eventType: 'generic',
      title: '通用全局候选',
      description: '空能力要求可适配任意世界观。',
      scope: { kind: 'global', contextIds: [] },
      requiredCapabilities: [],
    },
  ],
}, validation)
rejectHistoricalEventCandidate('candidate:reject-me', '拥有系统明确拒绝', validation)
expireHistoricalEventCandidate('candidate:expire-me', '候选条件已过期', validation)
assertOk(
  ledger.queryCandidates({ candidateIds: ['candidate:reject-me'] })[0]?.status === 'rejected'
    && ledger.queryCandidates({ candidateIds: ['candidate:expire-me'] })[0]?.status === 'expired',
  'candidate owner must expose explicit rejected and expired terminal decisions',
)
assertOk(
  queryHistoricalEventCandidates({
    candidateIds: ['candidate:reject-me', 'candidate:expire-me'],
    latestOnly: false,
  }).length === 4,
  'latestOnly:false must return each complete append-only candidate audit chain',
)
assertOk(
  ledger.queryCandidates({ latestOnly: false, limit: 1 }).length === 1
    && ledger.queryCandidates({ latestOnly: false, offset: 1, limit: 1 }).length === 1,
  'candidate audit retrieval must remain bounded and pageable without deleting history',
)

// 事务测试使用持久化状态导出作为本地断言基线，不调用运行时预览或回退入口。
const transactionBaseline = JSON.stringify(ledger.capturePersistenceState())
const transactionEventA = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'transaction-id-smoke' },
  events: [{
    eventType: 'same-name-transaction',
    title: '同名事务事件',
    description: '世界甲的临时事务事件。',
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
  }],
}, validation)
activateContext(contextB)
const validationB = { ...validation, contextId: contextB }
const transactionEventB = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'transaction-id-smoke' },
  events: [{
    eventType: 'same-name-transaction',
    title: '同名事务事件',
    description: '世界乙的临时事务事件。',
    scope: { kind: 'context', contextIds: [contextB] },
    status: 'resolved',
  }],
}, validationB)
activateContext(contextA)
const transactionEvents = {
  ok: transactionEventA.ok && transactionEventB.ok,
  eventIds: [...transactionEventA.eventIds, ...transactionEventB.eventIds],
}
assertOk(transactionEvents.ok, 'transaction must be able to create valid temporary facts in each active context')
assertOk(
  transactionEvents.eventIds.length === 2 && new Set(transactionEvents.eventIds).size === 2,
  'ledger-assigned IDs for same-name cross-world events must not collide',
)
ledger.submitCandidates({
  source: { kind: 'system', sourceId: 'transaction-candidate-smoke' },
  candidates: [{
    candidateId: 'candidate:transaction-only',
    eventType: 'transaction-candidate',
    title: '事务候选',
    description: '仅用于事务状态断言。',
    scope: { kind: 'context', contextIds: [contextA] },
  }],
}, validation)
const transactionEdge = ledger.commitCrossContextEdge({
  edgeId: 'edge:transaction-only',
  fromEventId: transactionEvents.eventIds[0],
  toEventId: transactionEvents.eventIds[1],
  relation: 'propagates',
  scope: { kind: 'cross-context', contextIds: [contextA, contextB] },
}, validation)
assertOk(transactionEdge.ok, 'transaction must be able to create a valid temporary causal edge')
assertOk(
  ledger.queryEvents().length === 2
    && ledger.queryCandidates({ candidateIds: ['candidate:transaction-only'] }).length === 1
    && ledger.queryCausalEdges({ eventId: transactionEvents.eventIds[0] }).length === 1,
  'transaction mutations must be observable before restoration',
)
ledger.restorePersistenceState(JSON.parse(transactionBaseline))
assertOk(JSON.stringify(ledger.capturePersistenceState()) === transactionBaseline, 'persistence restore must recover the complete transaction baseline exactly')
assertOk(
  transactionEvents.eventIds.every((eventId) => ledger.getEvent(eventId) === undefined)
    && ledger.queryCandidates({ candidateIds: ['candidate:transaction-only'] }).length === 0
    && ledger.queryCausalEdges({ eventId: transactionEvents.eventIds[0] }).length === 0,
  'persistence restore must remove temporary facts, candidates, and causal edges',
)

// 候选只有通过拥有系统提升后才成为唯一事实，并留下 accepted 审计。
const promotedCandidate = ledger.promoteCandidate('candidate:weather-change', {
  eventType: 'world-change',
  title: '已经确认的变化',
  description: '候选经过预检后才成为事实。',
  scope: { kind: 'context', contextIds: [contextA] },
  status: 'resolved',
}, validation)
assertOk(promotedCandidate.ok && promotedCandidate.eventIds.length === 1, 'available candidate must promote into exactly one fact')
const acceptedCandidate = ledger.queryCandidates({ candidateIds: ['candidate:weather-change'] })[0]
assertOk(
  acceptedCandidate?.status === 'accepted'
    && acceptedCandidate.promotedEventId === promotedCandidate.eventIds[0]
    && ledger.queryEvents({ eventIds: promotedCandidate.eventIds }).length === 1,
  'candidate promotion must append accepted audit evidence linked to the unique promoted fact',
)

// 合法事件与非法因果端点混合时必须整包零写入。
const beforeInvalid = JSON.stringify(ledger.capturePersistenceState())
const invalidBatch = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'invalid-batch-smoke' },
  events: [{
    eventId: 'event:must-not-commit',
    eventType: 'test',
    title: '合法事件',
    description: '本条本身合法，但同批因果端点非法。',
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
    locations: [{ contextId: contextA, nodeId: nodeA }],
  }],
  causalEdges: [{
    edgeId: 'edge:invalid-endpoint',
    fromEventId: 'event:must-not-commit',
    toEventId: 'event:missing',
    relation: 'causes',
    scope: { kind: 'context', contextIds: [contextA] },
  }],
}, validation)
assertOk(!invalidBatch.ok, 'batch with an invalid causal endpoint must be rejected')
assertOk(JSON.stringify(ledger.capturePersistenceState()) === beforeInvalid, 'rejected batch must make zero writes')

// 状态机和作用域基数必须由拥有系统严格拒绝，且每个失败批次都保持零写入。
const invalidContractBatches = [
  {
    label: 'unknown event status',
    batch: {
      source: { kind: 'system', sourceId: 'invalid-status-smoke' },
      events: [{
        eventId: 'event:invalid-status',
        eventType: 'test',
        title: '非法状态',
        description: '不得写入。',
        scope: { kind: 'context', contextIds: [contextA] },
        status: 'unknown-status',
      }],
    },
  },
  {
    label: 'context scope without one context',
    batch: {
      source: { kind: 'system', sourceId: 'invalid-context-empty-smoke' },
      events: [{
        eventId: 'event:invalid-context-empty',
        eventType: 'test',
        title: '空当地作用域',
        description: '不得写入。',
        scope: { kind: 'context', contextIds: [] },
        status: 'occurred',
      }],
    },
  },
  {
    label: 'context scope with multiple contexts',
    batch: {
      source: { kind: 'system', sourceId: 'invalid-context-many-smoke' },
      events: [{
        eventId: 'event:invalid-context-many',
        eventType: 'test',
        title: '多上下文当地作用域',
        description: '不得写入。',
        scope: { kind: 'context', contextIds: [contextA, contextB] },
        status: 'occurred',
      }],
    },
  },
  {
    label: 'local write to a non-current context',
    batch: {
      source: { kind: 'system', sourceId: 'invalid-foreign-local-smoke' },
      events: [{
        eventId: 'event:invalid-foreign-local',
        eventType: 'test',
        title: '错误世界当地事实',
        description: 'context 事实只能写入当前 active/open 世界。',
        scope: { kind: 'context', contextIds: [contextB] },
        status: 'occurred',
      }],
    },
  },
  {
    label: 'global write referencing dormant context',
    batch: {
      source: { kind: 'system', sourceId: 'invalid-global-dormant-smoke' },
      events: [{
        eventId: 'event:invalid-global-dormant',
        eventType: 'test',
        title: '错误全局休眠事实',
        description: 'global 不能绕过休眠上下文生命周期。',
        scope: { kind: 'global', contextIds: [] },
        status: 'occurred',
        participants: [{ entityId: entityC, contextId: contextC }],
      }],
    },
  },
  ...(['travel', 'cross-context'].map((kind) => ({
    label: `${kind} scope with fewer than two contexts`,
    batch: {
      source: { kind: 'system', sourceId: `invalid-${kind}-smoke` },
      events: [{
        eventId: `event:invalid-${kind}`,
        eventType: 'test',
        title: '缺少跨界端点',
        description: '不得写入。',
        scope: { kind, contextIds: [contextA] },
        status: 'occurred',
      }],
    },
  }))),
  {
    label: 'illegal resolved-to-active transition',
    batch: {
      source: { kind: 'system', sourceId: 'invalid-transition-smoke' },
      transitions: [{
        eventId: promotedCandidate.eventIds[0],
        toStatus: 'active',
        reason: 'resolved 事实不得重新进入 active',
      }],
    },
  },
]
for (const { label, batch } of invalidContractBatches) {
  const before = JSON.stringify(ledger.capturePersistenceState())
  const result = ledger.commitBatch(batch, validation)
  assertOk(!result.ok, `${label} must be rejected`)
  assertOk(JSON.stringify(ledger.capturePersistenceState()) === before, `${label} must make zero writes`)
}

// 两个世界允许同名事实，但稳定事件/实体/地点 ID 不得冲突。
const committedA = ledger.commitBatch({
  batchId: 'batch:world-a',
  source: { kind: 'system', sourceId: 'cross-world-smoke' },
  events: [{
    eventId: 'event:world-a:festival',
    eventType: 'local-event',
    title: '同名庆典',
    description: '世界甲的庆典。',
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
    participants: [{ entityId: entityA, contextId: contextA, label: '同名人物' }, { label: '未建档旅者' }],
    locations: [{ contextId: contextA, nodeId: nodeA }],
    tags: ['festival', 'harbor'],
  }],
  evidence: [{
    evidenceId: 'evidence:world-a:festival',
    eventId: 'event:world-a:festival',
    kind: 'system-commit',
    description: '测试系统已确认事实。',
    sourceId: 'cross-world-smoke',
    contextId: contextA,
  }],
}, validation)
activateContext(contextB)
const committedB = ledger.commitBatch({
  batchId: 'batch:world-b',
  source: { kind: 'system', sourceId: 'cross-world-smoke' },
  events: [{
    eventId: 'event:world-b:festival',
    eventType: 'local-event',
    title: '同名庆典',
    description: '世界乙的庆典。',
    scope: { kind: 'context', contextIds: [contextB] },
    status: 'resolved',
    participants: [{ entityId: entityB, contextId: contextB, label: '同名人物' }],
    locations: [{ contextId: contextB, nodeId: nodeB }],
  }],
}, validationB)
activateContext(contextA)
const committedEdge = ledger.commitBatch({
  batchId: 'batch:cross-world-edge',
  source: { kind: 'system', sourceId: 'cross-world-smoke' },
  causalEdges: [{
    edgeId: 'edge:festival-propagates',
    fromEventId: 'event:world-a:festival',
    toEventId: 'event:world-b:festival',
    relation: 'propagates',
    scope: { kind: 'cross-context', contextIds: [contextA, contextB] },
    evidenceIds: ['evidence:world-a:festival'],
  }],
}, validation)
const committed = {
  ok: committedA.ok && committedB.ok && committedEdge.ok,
  eventIds: [...committedA.eventIds, ...committedB.eventIds],
}
assertOk(committed.ok, 'valid cross-world event batch must commit')
assertOk(new Set(committed.eventIds).size === 2, 'same-name events in different worlds must keep distinct stable IDs')
assertOk(ledger.queryCausalEdges({ relations: ['propagates'] }).length === 1, 'explicit causal edge must be queryable by relation')
assertOk(
  ledger.getEvent('event:world-a:festival')?.participants[1]?.entityId === undefined,
  'accepted unknown participant label must remain label-only',
)
assertOk(
  queryHistoricalEvents({ entityIds: [entityA] })[0]?.eventId === 'event:world-a:festival'
    && ledger.queryEvents({ labels: ['未建档旅者'] })[0]?.eventId === 'event:world-a:festival'
    && ledger.queryEvents({ locationNodeIds: [nodeA] })[0]?.eventId === 'event:world-a:festival'
    && ledger.queryEvents({ tags: ['harbor'] })[0]?.eventId === 'event:world-a:festival',
  'event queries must support stable entity, unresolved label, location node, and tag selectors',
)
const festivalDetails = getHistoricalEventDetails('event:world-a:festival', {
  evidence: { limit: 1 },
  outgoingCausalEdges: { limit: 1 },
})
assertOk(
  festivalDetails?.evidence[0]?.evidenceId === 'evidence:world-a:festival'
    && festivalDetails.outgoingCausalEdges[0]?.edgeId === 'edge:festival-propagates'
    && festivalDetails.relatedCounts.evidence === 1
    && festivalDetails.relatedCounts.outgoingCausalEdges === 1,
  'bounded event details must expose evidence and causal links together with complete related counts',
)

const wrongCrossScope = ledger.preflightCrossContextEdge({
  fromEventId: 'event:world-a:festival',
  toEventId: 'event:world-b:festival',
  relation: 'propagates',
  scope: { kind: 'travel', contextIds: [contextA, contextB] },
}, validation)
assertOk(!wrongCrossScope.ok, 'cross-world causal API must require explicit cross-context scope')
const uncoveredEndpointScope = ledger.preflightCrossContextEdge({
  fromEventId: 'event:world-a:festival',
  toEventId: 'event:world-b:festival',
  relation: 'propagates',
  scope: { kind: 'cross-context', contextIds: [contextA, contextC] },
}, validation)
assertOk(!uncoveredEndpointScope.ok, 'cross-world causal scope must explicitly cover every endpoint context')

const directCommitmentSource = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'direct-causal-commitment-smoke' },
  events: [{
    eventId: 'event:commitment:source-a',
    eventType: 'commitment',
    title: '跨界承诺等待兑现',
    description: '来源事实位于世界甲。',
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'scheduled',
    schedule: { dueTotalDays: 850 },
  }],
}, validation)
const directCommitment = ledger.commitCausalCommitment({
  commitmentId: 'commitment:cross-world-owner-smoke',
  sourceEventId: 'event:commitment:source-a',
  resultEvent: {
    eventId: 'event:commitment:result-a-b',
    eventType: 'commitment-resolution',
    title: '跨界承诺已经兑现',
    description: '兑现事实同时覆盖世界甲与世界乙。',
    scope: { kind: 'cross-context', contextIds: [contextA, contextB] },
    status: 'occurred',
  },
}, validation)
const directCommitmentEdge = ledger.queryCausalEdges({
  fromEventIds: ['event:commitment:source-a'],
  toEventIds: ['event:commitment:result-a-b'],
})[0]
assertOk(
  directCommitmentSource.ok
    && directCommitment.ok
    && ledger.getEvent('event:commitment:source-a')?.status === 'resolved'
    && ledger.queryTransitions({ eventIds: ['event:commitment:source-a'] }).length === 2,
  'owner commitment must resolve scheduled sources through scheduled -> active -> resolved in one batch',
)
assertOk(
  directCommitmentEdge?.scope.kind === 'cross-context'
    && sameStringSet(directCommitmentEdge.scope.contextIds, [contextA, contextB]),
  'owner commitment must infer an explicit cross-context edge from source and result scopes',
)

// collectState 只带 active/scheduled 当前相关视图；occurred/resolved 只保留统计。
const scheduledCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'scheduled-smoke' },
  events: [{
    eventId: 'event:global:scheduled',
    eventType: 'scheduled-test',
    title: '待处理事项',
    description: '未来需要处理。',
    scope: { kind: 'global', contextIds: [] },
    status: 'scheduled',
    schedule: { dueTotalDays: 900 },
  }],
}, validation)
assertOk(scheduledCommit.ok, 'valid scheduled event must commit')
const scheduledTransition = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'scheduled-transition-smoke' },
  transitions: [{
    transitionId: 'transition:global:scheduled-to-active',
    eventId: 'event:global:scheduled',
    toStatus: 'active',
    reason: '规范时间进入处理窗口',
  }],
}, { ...validation, roundSequence: 9, totalDays: 900 })
assertOk(scheduledTransition.ok, 'legal scheduled-to-active transition must append')
assertOk(
  ledger.capturePersistenceState().events.find((event) => event.eventId === 'event:global:scheduled')?.initialStatus === 'scheduled'
    && ledger.getEvent('event:global:scheduled')?.status === 'active'
    && ledger.getEvent('event:global:scheduled')?.latestTransition?.transitionId === 'transition:global:scheduled-to-active',
  'status changes must append transitions without overwriting the original event fact',
)
const collected = ledger.collectState(roundContext).data
assertOk(collected.relevantEvents.length === 1, 'collectState must not clone occurred/resolved history into the round view')
assertOk(collected.relevantEvents[0]?.eventId === 'event:global:scheduled', 'collectState must retain relevant active or scheduled facts')
assertOk(collected.counts.events === 6, 'collectState must expose full-history counts without cloning full history')
assertOk(
  queryHistoricalEventEvidence({ eventIds: ['event:world-a:festival'], limit: 1 })[0]?.evidenceId
    === 'evidence:world-a:festival'
    && ledger.queryTransitions({ eventIds: ['event:global:scheduled'], limit: 1 })[0]?.transitionId
      === 'transition:global:scheduled-to-active',
  'evidence and transition selectors must return bounded, event-linked history',
)

const travelCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'travel-scope-smoke' },
  events: [{
    eventId: 'event:travel:a-b',
    eventType: 'travel-test',
    title: '甲乙之间的旅途事项',
    description: '只与世界甲和世界乙相关。',
    scope: { kind: 'travel', contextIds: [contextA, contextB] },
    status: 'scheduled',
    schedule: { conditionLabel: '旅途继续时处理' },
  }],
}, validation)
assertOk(travelCommit.ok, 'travel event covering the current context and one open peer must commit')
assertOk(
  ledger.queryEvents({ contextId: contextC, eventIds: ['event:travel:a-b'] }).length === 0
    && !ledger.collectState({ ...roundContext, contextId: contextC, worldId: contextC, characterId: entityC })
      .data.relevantEvents.some((event) => event.eventId === 'event:travel:a-b'),
  'A-B travel history must not leak into unrelated context C queries or collected state',
)
activateContext(contextB)
const offScopeEdge = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'edge-scope-collection-smoke' },
  causalEdges: [{
    edgeId: 'edge:b-c:off-current-scope',
    fromEventId: 'event:global:scheduled',
    toEventId: 'event:world-b:festival',
    relation: 'propagates',
    scope: { kind: 'cross-context', contextIds: [contextB, contextC] },
  }],
}, validationB)
activateContext(contextA)
assertOk(offScopeEdge.ok, 'B-C scoped causal edge must commit while B is active and C is not closed')
assertOk(
  !ledger.collectState(roundContext).data.relevantCausalEdges.some((edge) => (
    edge.edgeId === 'edge:b-c:off-current-scope'
  )),
  'collectState must not expose an off-scope B-C edge merely because one endpoint is global and pending',
)

// 运行提交必须与 strict restore 闭合：不能写入随后无法恢复的空 contextId 或重复 evidenceIds。
const roundTripEvidenceId = ledger.capturePersistenceState().evidence[0]?.evidenceId
assertOk(Boolean(roundTripEvidenceId), 'round-trip validation setup must have one accepted evidence ID')
for (const [label, batch] of [
  ['empty evidence contextId', {
    source: { kind: 'system', sourceId: 'invalid-evidence-context-smoke' },
    evidence: [{
      evidenceId: 'evidence:empty-context',
      eventId: 'event:global:scheduled',
      kind: 'system-commit',
      description: '空上下文不得写入。',
      sourceId: 'invalid-evidence-context-smoke',
      contextId: '',
    }],
  }],
  ['duplicate transition evidenceIds', {
    source: { kind: 'system', sourceId: 'duplicate-transition-evidence-smoke' },
    transitions: [{
      transitionId: 'transition:duplicate-evidence',
      eventId: 'event:global:scheduled',
      toStatus: 'resolved',
      reason: '重复证据编号不得写入。',
      evidenceIds: [roundTripEvidenceId, roundTripEvidenceId],
    }],
  }],
  ['duplicate causal edge evidenceIds', {
    source: { kind: 'system', sourceId: 'duplicate-edge-evidence-smoke' },
    causalEdges: [{
      edgeId: 'edge:duplicate-evidence',
      fromEventId: 'event:global:scheduled',
      toEventId: 'event:world-a:festival',
      relation: 'enables',
      scope: { kind: 'context', contextIds: [contextA] },
      evidenceIds: [roundTripEvidenceId, roundTripEvidenceId],
    }],
  }],
]) {
  const before = JSON.stringify(ledger.capturePersistenceState())
  const result = ledger.commitBatch(batch, validation)
  assertOk(!result.ok, `${label} must be rejected before the first write`)
  assertOk(JSON.stringify(ledger.capturePersistenceState()) === before, `${label} must make zero writes`)
}

// 完整快照 JSON 往返；缺少 P1 状态的旧存档必须清空浏览器残留。
const serialized = JSON.parse(JSON.stringify(ledger.capturePersistenceState()))
ledger.reset()
ledger.restorePersistenceState(serialized)
assertOk(JSON.stringify(ledger.capturePersistenceState()) === JSON.stringify(serialized), 'JSON persistence round-trip must preserve the complete ledger')

// Zustand 当前版本和未来版本的畸形持久化状态不得静默降级为空账本。
for (const [label, payload, version] of [
  ['malformed v2 migration payload', { schemaVersion: 2, events: 'not-an-array' }, 2],
  ['unsupported future migration payload', serialized, 3],
]) {
  let rejected = false
  try {
    migrateHistoryDynamicsState(payload, version, contextA)
  } catch {
    rejected = true
  }
  assertOk(rejected, `${label} must reject instead of silently erasing history`)
}

// 真实浏览器 Store v2 水合也必须走严格校验；损坏数据保留供诊断，但不得进入查询或运行。
const corruptedHydration = JSON.parse(JSON.stringify(serialized))
corruptedHydration.events.push(JSON.parse(JSON.stringify(corruptedHydration.events[0])))
useHistoryDynamicsStore.getState().replacePersistenceState(corruptedHydration)
let corruptHydrationRejected = false
try {
  ledger.hydrateFromStore()
} catch {
  corruptHydrationRejected = true
}
let corruptHydrationQueryRejected = false
try {
  ledger.queryEvents()
} catch {
  corruptHydrationQueryRejected = true
}
assertOk(corruptHydrationRejected, 'browser Store v2 hydration must reject duplicate event IDs')
assertOk(corruptHydrationQueryRejected, 'rejected browser Store v2 must remain quarantined from runtime queries')
assertOk(
  useHistoryDynamicsStore.getState().getPersistenceState().events.length === corruptedHydration.events.length,
  'rejected browser Store v2 must not be silently reset or rewritten',
)
ledger.restorePersistenceState(serialized)

const inactiveHistorySnapshot = JSON.parse(JSON.stringify(serialized))
inactiveHistorySnapshot.events.push({
  eventId: 'event:inactive-context-history',
  eventType: 'migration-history',
  title: '休眠世界既有历史',
  description: '这是上下文休眠前已经成立的事实。',
  scope: { kind: 'context', contextIds: [contextC] },
  initialStatus: 'occurred',
  participants: [{ entityId: entityC, contextId: contextC }],
  locations: [{ nodeId: nodeC, contextId: contextC }],
  tags: ['migration-history'],
  source: { kind: 'migration', sourceId: 'inactive-history-smoke' },
  createdRoundSequence: 0,
  createdTotalDays: 0,
  metadata: {},
})
inactiveHistorySnapshot.candidateAudits.push({
  auditId: 'audit:inactive-context-expired',
  candidateId: 'candidate:inactive-context-expired',
  status: 'expired',
  candidate: {
    candidateId: 'candidate:inactive-context-expired',
    eventType: 'migration-candidate',
    title: '休眠世界旧候选',
    description: '迁移时已经过期。',
    scope: { kind: 'context', contextIds: [contextC] },
    participants: [],
    locations: [],
    requiredCapabilities: [],
    tags: ['migration-history'],
    source: { kind: 'migration', sourceId: 'inactive-history-smoke' },
    metadata: {},
  },
  reason: '迁移前已经过期',
  roundSequence: 0,
  totalDays: 0,
})
let dormantHistoryRestored = true
try {
  ledger.restorePersistenceState(inactiveHistorySnapshot)
} catch {
  dormantHistoryRestored = false
}
assertOk(dormantHistoryRestored, 'restore must preserve existing history from a dormant context')
useWorldStore.setState((state) => ({
  contexts: {
    ...state.contexts,
    [contextC]: {
      ...state.contexts[contextC],
      record: { ...state.contexts[contextC].record, lifecycle: 'closed' },
      scope: { ...state.contexts[contextC].scope, scope: 'closed' },
    },
  },
}))
let closedHistoryRestored = true
try {
  ledger.restorePersistenceState(inactiveHistorySnapshot)
} catch {
  closedHistoryRestored = false
}
assertOk(closedHistoryRestored, 'restore must preserve existing history from a closed context')
ledger.restorePersistenceState(serialized)

// 损坏 v2 必须在替换 owning Store 前严格拒绝，既有游戏账本保持原样。
for (const [label, mutate] of [
  ['duplicate event ID', (snapshot) => {
    snapshot.events.push(JSON.parse(JSON.stringify(snapshot.events[0])))
  }],
  ['dangling transition event', (snapshot) => {
    snapshot.transitions.push({
      transitionId: 'transition:dangling',
      eventId: 'event:missing',
      fromStatus: 'scheduled',
      toStatus: 'active',
      reason: '损坏快照',
      evidenceIds: [],
      source: { kind: 'system', sourceId: 'corrupt-smoke' },
      roundSequence: 1,
      totalDays: 1,
    })
  }],
  ['invalid event status', (snapshot) => {
    snapshot.events[0].initialStatus = 'not-a-status'
  }],
  ['missing world context', (snapshot) => {
    snapshot.events.find((event) => event.eventId === 'event:world-a:festival').scope = {
      kind: 'context',
      contextIds: ['ctx:missing'],
    }
  }],
  ['missing stable entity', (snapshot) => {
    snapshot.events.find((event) => event.eventId === 'event:world-a:festival').participants[0].entityId = 'entity:missing'
  }],
  ['missing spatial node', (snapshot) => {
    snapshot.events.find((event) => event.eventId === 'event:world-a:festival').locations[0].nodeId = 'node:missing'
  }],
  ['scope-reference mismatch', (snapshot) => {
    snapshot.events.find((event) => event.eventId === 'event:world-a:festival').participants[0].contextId = contextB
  }],
  ['dangling causal endpoint', (snapshot) => {
    snapshot.causalEdges[0].toEventId = 'event:missing'
  }],
  ['candidate terminal chain contradiction', (snapshot) => {
    const first = snapshot.candidateAudits.find((audit) => audit.candidateId === 'candidate:reject-me')
    snapshot.candidateAudits.push({ ...JSON.parse(JSON.stringify(first)), auditId: 'audit:contradictory-available' })
  }],
  ['accepted candidate without promoted fact', (snapshot) => {
    snapshot.candidateAudits.find((audit) => audit.status === 'accepted').promotedEventId = 'event:missing'
  }],
]) {
  const before = JSON.stringify(ledger.capturePersistenceState())
  const corrupted = JSON.parse(JSON.stringify(serialized))
  mutate(corrupted)
  let rejected = false
  try {
    ledger.restorePersistenceState(corrupted)
  } catch {
    rejected = true
  }
  assertOk(rejected, `corrupt v2 snapshot must reject ${label}`)
  assertOk(JSON.stringify(ledger.capturePersistenceState()) === before, `rejected ${label} must preserve the previous ledger`)
}
ledger.restorePersistenceState(undefined)
assertOk(ledger.capturePersistenceState().events.length === 0, 'restoring an old save without P1 state must initialize an empty ledger')

// v1 触发事实、未触发/过期候选、pending/resolved 因果全部迁移并保留原 payload。
const legacy = {
  eventPool: {
    entries: [
      { id: 'triggered', name: '已发生', description: '事实', source: 'ai', triggered: true, triggeredYear: 5, expired: true, extra: 'keep-me' },
      { id: 'available', name: '未触发', description: '候选', source: 'preset', triggered: false, expired: false },
      { id: 'expired', name: '过期', description: '旧候选', source: 'preset', triggered: false, expired: true },
    ],
    presetUsedIndices: [1, 2, 3],
    lastCleanupYear: 9,
  },
  causalSimulation: {
    queue: {
      pending: [{ id: 'pending-causal', actionType: 'opaque-old-type', captureDescription: '待处理因果', initiator: '未知甲', target: '未知乙', captureYear: 4, triggerYear: 10, resolved: false }],
      resolved: [{ id: 'resolved-causal', actionType: 'opaque-old-type', captureDescription: '已处理因果', initiator: '旧人物', target: '旧组织', captureYear: 2, triggerYear: 3, consequence: '旧结果', resolved: true }],
      recentDecadeCount: 1,
      recent30YearCount: 2,
    },
    lastProcessYear: 10,
  },
}
const migrated = migrateHistoryDynamicsState(legacy, 1, contextA)
assertOk(migrated.events.length === 3, 'v1 triggered fact plus pending/resolved causality must migrate as facts')
assertOk(migrated.events.some((event) => event.initialStatus === 'scheduled'), 'v1 pending causal item must remain scheduled, not auto-resolve')
assertOk(migrated.candidateAudits.filter((audit) => audit.status === 'available').length === 1, 'v1 untriggered candidate must remain available')
assertOk(migrated.candidateAudits.filter((audit) => audit.status === 'expired').length === 1, 'v1 expired candidate must remain auditable')
assertOk(JSON.stringify(migrated.migrationMetadata[0]?.legacyPayload) === JSON.stringify(legacy), 'v1 unknown fields must remain losslessly available in migration metadata')
assertOk(
  migrated.events.every((event) => event.scope.kind === 'context' && event.scope.contextIds[0] === contextA)
    && migrated.candidateAudits.every((audit) => audit.candidate.scope.contextIds[0] === contextA),
  'v1 single-world history must bind to that save currentContextId instead of becoming global',
)

// 模拟 history 先于 world 水合：初始 null 产生的迁移期 global 必须在运行注册后一次性重绑。
useWorldStore.setState({ currentContextId: null })
const nullFirstHydration = migrateHistoryDynamicsState(legacy, 1, undefined)
useHistoryDynamicsStore.getState().replacePersistenceState(nullFirstHydration)
useWorldStore.setState({ currentContextId: contextA })
ledger.hydrateFromStore()
assertOk(
  ledger.capturePersistenceState().events.every((event) => event.scope.contextIds[0] === contextA)
    && ledger.queryEvents({ contextId: contextB }).length === 0
    && ledger.queryCandidates({ contextId: contextB, latestOnly: false }).length === 0,
  'null-first persisted hydration must rebind v1 history before a second world can consume it',
)

ledger.reset()
assertOk(!ledger.importLegacyCollectedStates({}), 'legacy collected import must return false when no source state exists')
assertOk(ledger.importLegacyCollectedStates({
  'event-pool': { id: 'event-pool', summary: '', data: legacy.eventPool },
  'causal-simulation': { id: 'causal-simulation', summary: '', data: legacy.causalSimulation },
}), 'legacy collected import must return true when old states exist')
const firstLegacyImport = JSON.stringify(ledger.capturePersistenceState())
assertOk(ledger.importLegacyCollectedStates({
  'event-pool': { id: 'event-pool', summary: '', data: legacy.eventPool },
  'causal-simulation': { id: 'causal-simulation', summary: '', data: legacy.causalSimulation },
}), 'repeated legacy import should be an idempotent success')
assertOk(JSON.stringify(ledger.capturePersistenceState()) === firstLegacyImport, 'repeated legacy import must not duplicate facts')
const migratedRoundTrip = JSON.parse(JSON.stringify(ledger.capturePersistenceState()))
ledger.reset()
ledger.restorePersistenceState(migratedRoundTrip)
assertOk(
  JSON.stringify(ledger.capturePersistenceState()) === JSON.stringify(migratedRoundTrip),
  'JSON persistence round-trip must preserve migration metadata together with migrated facts and audits',
)
assertOk(
  JSON.stringify(ledger.capturePersistenceState().migrationMetadata[0]?.legacyPayload)
    === JSON.stringify(legacy),
  'migration metadata must retain the complete legacy payload after JSON restoration',
)
assertOk(
  queryHistoricalEventMigrations({ sourceSystemIds: ['event-pool'], limit: 1 }).length === 1,
  'migration metadata must be available through a bounded source-system selector',
)

// 运行态提交超过旧 50 条阈值后仍须完整保留首尾和全部事实。
ledger.reset()
const longHistoryEvents = Array.from({ length: 128 }, (_, index) => ({
  eventId: `event:long-history:${index}`,
  eventType: 'long-history-smoke',
  title: `长期事实 ${index}`,
  description: `第 ${index} 条完整历史事实。`,
  scope: { kind: 'global', contextIds: [] },
  status: 'occurred',
}))
const longHistoryCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'long-history-smoke' },
  events: longHistoryEvents,
}, validation)
const retainedLongHistory = ledger.capturePersistenceState().events
assertOk(longHistoryCommit.ok, 'a history batch larger than the old capacity must commit')
assertOk(retainedLongHistory.length === 128, 'the complete long history must remain stored without capacity eviction')
assertOk(
  retainedLongHistory[0]?.description === '第 0 条完整历史事实。'
    && retainedLongHistory[127]?.description === '第 127 条完整历史事实。',
  'long-history retention must preserve both earliest and latest complete facts',
)
assertOk(
  ledger.queryEvents().length === 100
    && ledger.queryEvents({ limit: 500 }).length === 128
    && ledger.queryEvents({ offset: 127, limit: 1 })[0]?.eventId === 'event:long-history:127',
  'default queries must be bounded while explicit paging can retrieve every retained fact',
)
let oversizedQueryRejected = false
try {
  ledger.queryEvents({ limit: 501 })
} catch {
  oversizedQueryRejected = true
}
assertOk(oversizedQueryRejected, 'query limit above the public bound must be rejected explicitly')

// 真实主叙事提交链：中文 META 必须创建账本事实，并把同一批事件 ID 交给连续性消费者。
const morality = getMoralitySystem()
const characterBase = getCharacterBaseSystem()
orchestrator.clearExternalSubsystems()
orchestrator.reset()
useEngineStore.getState().reset()
useCharacterStore.getState().reset()
ledger.reset()
morality.reset()
characterBase.reset()
characterBase.hydrateFromStore()
orchestrator.registerSubsystem(characterBase)
orchestrator.registerSubsystem(morality)
orchestrator.registerSubsystem(ledger)
assertOk(
  orchestrator.getSubsystemBindings().some((binding) => binding.id === 'historical-event-ledger')
    && orchestrator.getSubsystemBindings().some((binding) => binding.id === 'morality'),
  'orchestrator main-chain smoke requires the live ledger and one ordinary writable subsystem',
)

const seededEngineRound = {
  ...useEngineStore.getState().round,
  year: 3,
  month: 2,
  day: 10,
  dayOfYear: 70,
  totalDays: 800,
}
useEngineStore.setState({
  status: 'idle',
  round: seededEngineRound,
  timeStep: { unit: 'year', value: 1 },
  totalRounds: 3,
  narrativeHistory: [],
  currentNarrative: '',
  compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, lastAt: 0 },
  compressedSummaries: { summaries: [] },
  lastAutoSaveRound: 0,
  characterCreations: [],
  narrativeError: null,
})
orchestrator.hydrateFromEngineStore()
orchestrator.setContext({
  contextId: contextA,
  contextKind: 'world',
  simulationScope: 'active',
  capabilityProfile: {
    contextId: contextA,
    capabilities: ['life'],
    enabledSubsystemIds: ['character-base', 'morality', 'historical-event-ledger'],
    derivedFrom: 'explicit',
  },
  name: '主链测试世界',
  description: '用于验证历史与因果主链的中立世界。',
  era: '测试纪元',
  config: {
    difficulty: 'normal',
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    eraStartYear: 1,
  },
}, {
  characterId: entityA,
  name: '主链测试者',
  age: 20,
  gender: '未指定',
  background: '用于确定性回归的角色。',
  attributes: {},
})

const mainDigest = '你救下林舟、与他结盟，并承诺三十天后护送他离港。'
const mainData = {
  系统指令: [{
    系统: '道德',
    目标对象: entityA,
    目标上下文: contextA,
    操作: '增量',
    说明: '你冒险保护了林舟。',
    变更: { 道德变化: 1 },
    依据事件: [],
  }],
  原创内容: [{
    名称: '潮汐结绳',
    说明: '利用潮差快速固定船只的技法。',
    类别: '技法',
  }],
  新伏笔: [{
    类型: '誓言',
    说明: '无潮港的钟声将见证护送承诺。',
    优先级: 8,
  }],
  重要程度: '高',
  注册事件: [{
    内容: '你在无潮港救下林舟并立下护送承诺。',
    重要度: 92,
    涉及实体: ['林舟', '无潮港'],
  }],
  情节状态: '开始',
  语义信号: {
    事件类型: '关系',
    冲突强度: 35,
    张力变化: 3,
    行动规模: '中',
    不可逆: false,
    影响范围: '关系圈',
    叙事语域: '生活',
    语域理由: '一次具体救援建立了新的长期关系。',
    情节类型: '关系',
    关系变化: [{ 姓名: '林舟', 类型: '结盟', 说明: '林舟开始信任并协助你。' }],
  },
  新延迟因果: [{
    类型: '承诺',
    严重程度: '轻微',
    已成立事实: '三十天后护送林舟离开无潮港。',
    相关人物: '林舟',
  }],
}
const mainBody = [
  '你跃上湿滑的码头，把林舟从断裂的缆绳下拖了出来。',
  '追赶者的灯火逼近时，你与林舟并肩推船入水，他终于答应与你共同离港。',
  '港口钟声落下第三响，你承诺三十天后回来护送他穿过封锁。',
].join('\n\n')
const mainResult = await submitNarrative(
  parsedNarrative(mainBody, mainDigest, mainData),
  [{
    eventType: 'promise-fulfillment',
    title: '三十天后护送林舟离港',
    description: '护送承诺已经成立，但护送行动尚未发生。',
    scope: { kind: 'context', contextIds: [contextA] },
    participants: [{ label: '林舟', contextId: contextA, role: 'related-person' }],
    locations: [{ label: '无潮港', contextId: contextA, role: 'related-location' }],
    triggerConditionLabel: '三十天后返回无潮港并与林舟会合。',
    requiredCapabilities: ['life'],
    tags: ['承诺', '护送'],
  }],
)
const mainLedgerEvents = ledger.queryEvents()
const acceptedMainEventIds = mainLedgerEvents.map((event) => event.eventId)
const mainCandidateAudit = ledger.queryCandidates({
  statuses: ['available'],
  latestOnly: true,
}).find((audit) => audit.candidate.title === '三十天后护送林舟离港')
const mainNarrativeId = orchestrator.getState().narrativeHistory.at(-1)?.id
const deferredLedgerEvent = mainLedgerEvents.find((event) => event.tags.includes('deferred-causality'))
const registeredCausal = causalDelay.getCausalEvents().find((event) => (
  event.description === '三十天后护送林舟离开无潮港。'
))
memoryLifecycle.scoreImportance(
  mainResult.narrative,
  3,
  orchestrator.getState().round.year,
  contextA,
)
const taggedMainMemory = memoryLifecycle.getTaggedEvents().find((event) => event.round === 3)
const plantedMainForeshadowing = foreshadowing.getState().active.find((record) => (
  record.description === '无潮港的钟声将见证护送承诺。'
))
const mainNpcInteraction = coreMemory.getNpcMap().get('林舟')?.find((record) => record.round === 3)
assertOk(
  mainCandidateAudit?.status === 'available'
    && mainCandidateAudit.candidate.metadata.recognition?.roundSequence === 3
    && mainCandidateAudit.candidate.metadata.recognition?.narrativeId === mainNarrativeId
    && JSON.stringify(mainCandidateAudit.candidate.metadata.recognition?.historicalEventIds) === JSON.stringify(acceptedMainEventIds),
  'recognized future event must register as an available candidate bound to the round narrative and committed history ids',
)

assertOk(mainResult.changes.length === 1 && mainResult.changes[0]?.id === 'morality', 'valid Chinese META must commit ordinary subsystem changes')
assertOk(mainLedgerEvents.length === 2, 'key event plus deferred causality must become one atomic historical batch')
assertOk(
  acceptedMainEventIds.length === 2
    && sameStringSet(plotStructure.getState().lastHistoricalEventIds, acceptedMainEventIds)
    && sameStringSet(taggedMainMemory?.historicalEventIds ?? [], acceptedMainEventIds)
    && sameStringSet(plantedMainForeshadowing?.plantedFromEventIds ?? [], acceptedMainEventIds)
    && sameStringSet(mainNpcInteraction?.historicalEventIds ?? [], acceptedMainEventIds),
  'plot, tagged memory, foreshadowing, and core NPC memory must retain the accepted historical event IDs',
)
assertOk(
  morality.collectState(orchestrator.getRoundContextSnapshot()).data.value === 1
    && orchestrator.getState().characterCreations.some((creation) => creation.name === '潮汐结绳'),
  'valid main-chain META must preserve ordinary state and accepted original creations',
)
assertOk(
  registeredCausal?.schedule === 'canonical-days'
    && registeredCausal.createdTotalDays === 800
    && registeredCausal.dueTotalDays === 830
    && registeredCausal.originEventId === deferredLedgerEvent?.eventId
    && deferredLedgerEvent?.status === 'scheduled',
  'new deferred causality must use canonical days and point to its committed scheduled historical event',
)

function moveOrchestratorClock(roundSequence, totalDays) {
  const snapshot = orchestrator.exportPersistenceState()
  const nextRound = {
    ...snapshot.state.round,
    year: Math.floor(totalDays / 365),
    totalDays,
  }
  snapshot.state.totalRounds = roundSequence
  snapshot.state.round = nextRound
  snapshot.timeRound = nextRound
  orchestrator.importPersistenceState(snapshot)
}

// 到期检查只把事项送进 Prompt；没有完整语义数据时不得提前写 resolutionEventId。
moveOrchestratorClock(4, 830)
await orchestrator.collectAllSubsystemStates(false)
const duePrompt = orchestrator.assemblePromptContext()
assertOk(
  duePrompt.causalChainHint?.includes('三十天后护送林舟离开无潮港。'),
  'canonical-day due matter must enter the current Prompt as an established pending fact',
)
const ledgerCountBeforeBodyOnly = ledger.queryEvents().length
const bodyOnlyDigest = '你听见港口钟声，但这一轮没有提交完整的结构化兑现结果。'
const bodyOnlyResult = await submitNarrative(parsedNarrative(
  [
    '钟声从雾里传来，你停在通往码头的石阶上。',
    '林舟的船影仍在远处，眼前的巡逻迫使你先藏进仓房。',
    '你记得承诺已经到期，却还没有完成护送。',
  ].join('\n\n'),
  bodyOnlyDigest,
), [], { eventFailure: new Error('injected event-recognition failure') })
const causalAfterBodyOnly = causalDelay.getCausalEvents().find((event) => event.id === registeredCausal?.id)
assertOk(
  bodyOnlyResult.narrative.includes('你记得承诺已经到期')
    && ledger.queryEvents().length === ledgerCountBeforeBodyOnly
    && causalAfterBodyOnly?.id === registeredCausal?.id
    && causalAfterBodyOnly?.triggered === false
    && causalAfterBodyOnly.resolutionEventId === undefined
    && causalAfterBodyOnly.deliveryState === 'continuing'
    && (causalAfterBodyOnly.dueTotalDays ?? 0) > 830
    && causalAfterBodyOnly.presentedNarrativeId === undefined,
  'event-recognition failure must preserve prose, retain the stable causal ID, and locally reschedule it without duplicate resolution',
)

const rescheduledDueTotalDays = causalAfterBodyOnly?.dueTotalDays ?? 0
moveOrchestratorClock(5, rescheduledDueTotalDays)
await orchestrator.collectAllSubsystemStates(false)
const rescheduledPrompt = orchestrator.assemblePromptContext()
assertOk(
  rescheduledPrompt.causalChainHint?.includes('三十天后护送林舟离开无潮港。'),
  'the same causal matter must become deliverable again only after its local reschedule point',
)

const resolutionDigest = '你按期护送林舟穿过封锁，三十天前的承诺正式兑现。'
const resolutionResult = await submitNarrative(parsedNarrative(
  [
    '你从仓房后门冲向码头，林舟已经解开最后一根缆绳。',
    '巡逻船合围之前，你掌舵穿过暗礁水道，让载着众人的船驶出封锁。',
    '天亮时林舟在甲板上向你点头，三十天前的承诺终于完成。',
  ].join('\n\n'),
  resolutionDigest,
  {
    重要程度: '高',
    注册事件: [{
      内容: '你按期护送林舟离开无潮港。',
      重要度: 95,
      涉及实体: ['林舟', '无潮港'],
    }],
    情节状态: '结束',
    语义信号: {
      事件类型: '成就',
      冲突强度: 55,
      张力变化: -3,
      行动规模: '中',
      不可逆: true,
      影响范围: '关系圈',
      叙事语域: '命运',
      语域理由: '长期承诺已经通过具体行动完成。',
      情节类型: '任务',
    },
    到期因果判定: [{
      因果编号: registeredCausal?.id ?? 'missing-causal-id',
      状态: '已解决',
      判定理由: '你已经完成护送，原承诺得到明确兑现。',
    }],
  },
), [])
const resolvedCausal = causalDelay.getCausalEvents().find((event) => event.id === registeredCausal?.id)
const resolutionLedgerEvent = resolvedCausal?.resolutionEventId
  ? ledger.getEvent(resolvedCausal.resolutionEventId)
  : undefined
const resolvedOriginEvent = deferredLedgerEvent ? ledger.getEvent(deferredLedgerEvent.eventId) : undefined
assertOk(
  resolutionResult.narrative.includes('三十天前的承诺终于完成')
    && resolvedCausal?.triggered === true
    && resolvedCausal.triggeredTotalDays === rescheduledDueTotalDays
    && Boolean(resolvedCausal.resolutionEventId)
    && resolutionLedgerEvent?.metadata.causalDelayId === resolvedCausal.id,
  'complete semantic submission must commit a historical resolution event before confirming the due causal trigger',
)
assertOk(
  resolvedOriginEvent?.status === 'resolved'
    && ledger.queryCausalEdges({
      eventId: deferredLedgerEvent?.eventId,
      relations: ['resolves'],
    }).some((edge) => edge.toEventId === resolvedCausal?.resolutionEventId),
  'causal resolution must transition the origin fact and link it to the committed resolution event',
)

// 事件识别所有者注入下游失败时，不恢复运行时快照；正文和已经写入的局部结果保持可见。
moveOrchestratorClock(6, rescheduledDueTotalDays + 1)
const rollbackMoralityValue = morality.collectState(orchestrator.getRoundContextSnapshot()).data.value
const rollbackHistoryLength = orchestrator.getState().narrativeHistory.length
const failureDigest = '本轮正文有效，但注入的下游故障使事件识别提前终止。'
let eventOwnerBaseline
const originalResolveForeshadowing = foreshadowing.resolveForeshadowing
foreshadowing.resolveForeshadowing = () => {
  throw new Error('injected downstream continuity failure')
}
let rollbackError
try {
  await submitNarrative(parsedNarrative(
    [
      '你在外海发现一座没有航标的小岛，并记下了潮汐入口。',
      '林舟提议立刻登岛，你则先把受伤的水手安置到安全船舱。',
      '新的航线已经出现，但所有后续影响必须等待完整提交。',
    ].join('\n\n'),
    failureDigest,
    {
      系统指令: [{
        系统: '道德',
        目标对象: entityA,
        目标上下文: contextA,
        操作: '增量',
        说明: '你优先保护受伤水手。',
        变更: { 道德变化: 1 },
        依据事件: [],
      }],
      原创内容: [{
        名称: '外海潮图',
        说明: '记录未知岛屿潮汐入口的完整航图。',
        类别: '物品',
      }],
      新伏笔: [{
        类型: '神秘物品',
        说明: '岛上石门与潮图的刻痕完全一致。',
        优先级: 7,
      }],
      重要程度: '高',
      注册事件: [{
        内容: '你发现未知岛屿并绘制外海潮图。',
        重要度: 87,
        涉及实体: ['未知岛屿', '外海潮图'],
      }],
      情节状态: '开始',
      语义信号: {
        事件类型: '发现',
        冲突强度: 28,
        张力变化: 4,
        行动规模: '中',
        不可逆: false,
        影响范围: '社群',
        叙事语域: '生活',
        语域理由: '新地点与新关系尚处于探索起点。',
        情节类型: '旅程',
        关系变化: [{ 姓名: '林舟', 类型: '结盟', 说明: '林舟同意先保护伤员再探索。' }],
      },
      新延迟因果: [{
        类型: '债务',
        严重程度: '普通',
        已成立事实: '获救水手承诺未来归还修船物资。',
        相关人物: '获救水手',
      }],
    },
  ), [{
    eventType: 'future-debt',
    title: '获救水手归还修船物资',
    description: '水手已经许诺归还物资，但归还尚未发生。',
    scope: { kind: 'context', contextIds: [contextA] },
    participants: [{ label: '获救水手', contextId: contextA, role: 'related-person' }],
    triggerConditionLabel: '获救水手再次抵达无潮港并备齐修船物资。',
    requiredCapabilities: ['life'],
    tags: ['债务', '修船物资'],
  }], {
    afterDataCommit: () => {
      eventOwnerBaseline = {
        ledger: ledger.capturePersistenceState(),
        causal: causalDelay.capturePersistenceState(),
        plot: plotStructure.capturePersistenceState(),
        foreshadowing: foreshadowing.capturePersistenceState(),
        memory: memoryLifecycle.capturePersistenceState(),
        coreMemory: coreMemory.capturePersistenceState(),
        characterCreations: structuredClone(orchestrator.getState().characterCreations),
      }
    },
  })
} catch (error) {
  rollbackError = error
} finally {
  foreshadowing.resolveForeshadowing = originalResolveForeshadowing
}

assertOk(
  morality.collectState(orchestrator.getRoundContextSnapshot()).data.value === rollbackMoralityValue + 1,
  'successful data-analysis owner commit must survive an independent event-recognition failure',
)
assertOk(
  eventOwnerBaseline
    && JSON.stringify(ledger.capturePersistenceState()) !== JSON.stringify(eventOwnerBaseline.ledger),
  'event-recognition failure must not restore the runtime historical-ledger state',
)
assertOk(
  eventOwnerBaseline
    && JSON.stringify(causalDelay.capturePersistenceState()) !== JSON.stringify(eventOwnerBaseline.causal),
  'event-recognition failure must not restore newly registered causal state',
)
assertOk(
  eventOwnerBaseline
    && JSON.stringify(plotStructure.capturePersistenceState()) !== JSON.stringify(eventOwnerBaseline.plot),
  'event-recognition failure must keep already-recorded plot signals',
)
assertOk(
  eventOwnerBaseline
    && JSON.stringify(foreshadowing.capturePersistenceState()) !== JSON.stringify(eventOwnerBaseline.foreshadowing),
  'event-recognition failure must keep already-recorded foreshadowing changes',
)
assertOk(
  eventOwnerBaseline
    && JSON.stringify(orchestrator.getState().characterCreations) !== JSON.stringify(eventOwnerBaseline.characterCreations),
  'event-recognition failure must keep already-recorded character creations',
)
assertOk(
  rollbackError === undefined
    && orchestrator.getState().narrativeHistory.length === rollbackHistoryLength + 1
    && orchestrator.getState().narrativeHistory.at(-1)?.text.includes('新的航线已经出现')
    && !digestLedger.getEntries().some((entry) => entry.round === 6 && entry.digest === failureDigest)
    && orchestrator.getState().characterCreations.some((creation) => creation.name === '外海潮图')
    && causalDelay.getCausalEvents().some((event) => event.description === '获救水手承诺未来归还修船物资。'),
  'event-recognition commit failure must remain non-blocking, retain the body, and avoid restoring an earlier round',
)

// 真实 applyGameSave：账本 v2 恢复失败时 engine/character/world/orchestrator/ledger 整包回滚。
orchestrator.clearExternalSubsystems()
for (const id of MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS) {
  if (id === 'historical-event-ledger') {
    orchestrator.registerSubsystem(ledger)
    continue
  }
  orchestrator.registerSubsystem({
    id,
    mod: 'mod-world',
    label: `测试子系统:${id}`,
    description: 'P1 save/restore focused binding',
    collectState: () => ({ id, summary: '', data: {} }),
    applyChanges: () => {},
  })
}
activateContext(contextA)
const savePlayerEntityId = 'player:history-save-rollback'
useWorldStore.setState({
  entityReferences: {},
  worldConfig: fixtureA.worldConfig,
  entities: fixtureA.entities,
  initialized: true,
  worldCode: fixtureA.worldCode,
  currentYear: fixtureA.currentYear,
  worldTags: fixtureA.worldTags,
  eraStartYear: fixtureA.eraStartYear,
  eraName: fixtureA.eraName,
  calibration: fixtureA.calibration,
  destinyPatternModifiers: fixtureA.destinyPatternModifiers,
  worldInitAIStatus: fixtureA.worldInitAIStatus,
})
useCharacterStore.setState({
  // 存档回滚夹具中的玩家必须与世界历史实体分离，避免严格实体种类契约冲突。
  characterId: savePlayerEntityId,
  name: '账本存档回滚角色',
  background: '用于损坏 P1 快照原子回滚验证。',
  worldCode: fixtureA.worldCode,
})
useGlobalStore.getState().setAllModsLoaded(true)
assertOk(ensureOrchestratorContextFromStores(), 'P1 save rollback setup must inject the current world')
useGlobalStore.getState().setGamePhase('world_build')
const validGameSave = JSON.parse(JSON.stringify(collectGameSavePayload()))
const corruptedGameSave = JSON.parse(JSON.stringify(validGameSave))
const persistedLedger = corruptedGameSave.orchestrator
  ?.persistentSubsystemStates?.['historical-event-ledger']
persistedLedger.events.push(JSON.parse(JSON.stringify(persistedLedger.events[0])))
const beforeRejectedGameSave = JSON.stringify(collectGameSavePayload())
let corruptGameSaveRejectedByLedger = false
try {
  await applyGameSave(corruptedGameSave)
} catch (error) {
  corruptGameSaveRejectedByLedger = error instanceof Error
    && error.message.includes('历史事件账本持久化快照不一致')
}
assertOk(
  corruptGameSaveRejectedByLedger,
  'applyGameSave must reach and reject the corrupt ledger persistence snapshot',
)
assertOk(
  JSON.stringify(collectGameSavePayload()) === beforeRejectedGameSave,
  'failed ledger restore must keep engine, character, world, orchestrator, and ledger unchanged',
)
assertOk(
  useGlobalStore.getState().gamePhase === 'world_build',
  'failed ledger restore must not advance the player into simulation',
)

// 旧节点只允许作为内部文件名和迁移来源，不得继续独立注册或拥有队列语义。
const root = process.cwd()
const manifestSource = fs.readFileSync(path.join(root, 'src/mods/mod-history-dynamics/manifest.ts'), 'utf8')
const candidateSource = fs.readFileSync(path.join(root, 'src/mods/mod-history-dynamics/components/event-candidate-provider.ts'), 'utf8')
const causalSource = fs.readFileSync(path.join(root, 'src/mods/mod-history-dynamics/components/causal-graph-component.ts'), 'utf8')
assertOk(manifestSource.includes("subsystems: ['HistoricalEventLedgerSystem']"), 'manifest must declare only HistoricalEventLedgerSystem')
assertOk(!manifestSource.includes("'event-pool'") && !manifestSource.includes("'causal-simulation'"), 'manifest must not provide or register old subsystem IDs')
assertOk(!candidateSource.includes('extends BaseSubsystem') && !candidateSource.includes('readonly id'), 'candidate provider must not be an independent subsystem')
assertOk(!causalSource.includes('extends BaseSubsystem') && !causalSource.includes('readonly id'), 'causal graph must not be an independent subsystem')

const moduleSource = fs.readdirSync(path.join(root, 'src/mods/mod-history-dynamics'), { recursive: true })
  .filter((entry) => typeof entry === 'string' && entry.endsWith('.ts'))
  .map((entry) => fs.readFileSync(path.join(root, 'src/mods/mod-history-dynamics', entry), 'utf8'))
  .join('\n')
for (const forbidden of [
  'Math.random',
  'RegExp',
  'PRESET_EVENT_POOL',
  'CAUSAL_REGEX_RULES',
  'MAX_EVENT_POOL_SIZE',
  'MAX_CAUSAL_PER',
  '.slice(',
  '.shift(',
  '.splice(',
]) {
  assertOk(!moduleSource.includes(forbidden), `history ledger must not retain random/regex/capacity behavior: ${forbidden}`)
}

useHistoryDynamicsStore.getState().reset()
if (failed > 0) process.exit(1)
console.log('PASS: historical-event-p1-smoke')
