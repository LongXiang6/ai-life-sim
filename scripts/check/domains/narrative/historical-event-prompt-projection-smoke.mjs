/**
 * Purpose: Regress that confirmed world facts reach the 01 story Prompt through a read-only projection.
 * Owner: quality:narrative
 * Responsibility: Keep ledger ownership local while the approved 01 messages receive readable, scoped world facts.
 */
import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { getCharacterBaseSystem } from '../../../../src/mods/mod-character/subsystems/character-base-system.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import { orchestrator } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'
import {
  HISTORICAL_EVENT_LEDGER_ID,
} from '../../../../src/mods/mod-engine/helpers/historical-event-prompt-projection.ts'
import { prepareNarrativeRoundPromptContext } from '../../../../src/mods/mod-engine/helpers/narrative-round-prompt-preparation.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

const contextA = 'ctx_prompt_active'
const contextB = 'ctx_prompt_dormant'
const contextC = 'ctx_prompt_closed'

function event({
  eventId,
  description,
  scope,
  status,
  title = eventId,
}) {
  return {
    eventId,
    eventType: 'prompt-projection-smoke',
    title,
    description,
    scope,
    initialStatus: status,
    status,
    participants: [],
    locations: [],
    tags: [],
    source: { kind: 'system', sourceId: 'historical-event-prompt-smoke' },
    createdRoundSequence: 4,
    createdTotalDays: 400,
    metadata: {},
    evidenceCount: 1,
    incomingCausalCount: 0,
    outgoingCausalCount: 0,
  }
}

function edge({ edgeId, fromEventId, toEventId, scope, relation = 'causes' }) {
  return {
    edgeId,
    fromEventId,
    toEventId,
    relation,
    scope,
    evidenceIds: [],
    source: { kind: 'system', sourceId: 'historical-event-prompt-smoke' },
    createdRoundSequence: 4,
    createdTotalDays: 400,
  }
}

const currentEvent = event({
  eventId: 'history:current:scheduled',
  title: '当前世界待续事项',
  description: '当前世界的潮门将在第七响后关闭。',
  scope: { kind: 'context', contextIds: [contextA] },
  status: 'scheduled',
})
currentEvent.schedule = { dueTotalDays: 430, conditionLabel: '潮门第七响' }

const globalEvent = event({
  eventId: 'history:global:active',
  title: '全局航标失效',
  description: '所有世界共用的远航坐标正在漂移。',
  scope: { kind: 'global', contextIds: [] },
  status: 'active',
})

const crossContextEvent = event({
  eventId: 'history:cross:active',
  title: '跨界回声',
  description: '来自休眠世界的回声已经明确抵达当前世界。',
  scope: { kind: 'cross-context', contextIds: [contextA, contextB] },
  status: 'active',
})

const dormantForeignEvent = event({
  eventId: 'history:dormant:scheduled',
  title: '休眠世界当地事项',
  description: '这句休眠世界事实绝不能泄漏到当前世界。',
  scope: { kind: 'context', contextIds: [contextB] },
  status: 'scheduled',
})

const closedForeignEvent = event({
  eventId: 'history:closed:active',
  title: '关闭世界当地事项',
  description: '这句关闭世界事实绝不能泄漏到当前世界。',
  scope: { kind: 'context', contextIds: [contextC] },
  status: 'active',
})

const resolvedCurrentEvent = event({
  eventId: 'history:current:resolved',
  title: '已经解决的当前事项',
  description: '这句已解决事实不应作为当前待续事项重复发送。',
  scope: { kind: 'context', contextIds: [contextA] },
  status: 'resolved',
})

const currentEdge = edge({
  edgeId: 'edge:current-to-global',
  fromEventId: currentEvent.eventId,
  toEventId: globalEvent.eventId,
  scope: { kind: 'global', contextIds: [] },
  relation: 'enables',
})
const crossEdge = edge({
  edgeId: 'edge:cross-to-current',
  fromEventId: crossContextEvent.eventId,
  toEventId: currentEvent.eventId,
  scope: { kind: 'cross-context', contextIds: [contextA, contextB] },
  relation: 'propagates',
})
const foreignEdge = edge({
  edgeId: 'edge:dormant-to-closed',
  fromEventId: dormantForeignEvent.eventId,
  toEventId: closedForeignEvent.eventId,
  scope: { kind: 'cross-context', contextIds: [contextB, contextC] },
  relation: 'causes',
})

const dueCandidate = {
  auditId: 'candidate-audit:prompt-due',
  candidateId: 'candidate:prompt-due',
  status: 'available',
  reason: '候选已经登记',
  roundSequence: 4,
  totalDays: 400,
  candidate: {
    candidateId: 'candidate:prompt-due',
    eventType: 'meeting',
    title: '潮门会合',
    description: '守门人已经约定在潮门第七响时会合。',
    scope: { kind: 'context', contextIds: [contextA] },
    participants: [{ label: '守门人', contextId: contextA }],
    locations: [{ label: '潮门', contextId: contextA }],
    schedule: { dueTotalDays: 430 },
    triggerConditionLabel: '潮门响至第七声',
    requiredCapabilities: [],
    tags: ['meeting'],
    source: { kind: 'system', sourceId: 'historical-event-prompt-smoke' },
    metadata: {},
  },
}

const duplicateDueCandidate = structuredClone(dueCandidate)
duplicateDueCandidate.auditId = 'candidate-audit:prompt-due-duplicate'
duplicateDueCandidate.candidateId = 'candidate:prompt-due-duplicate'
duplicateDueCandidate.candidate.candidateId = duplicateDueCandidate.candidateId
duplicateDueCandidate.candidate.title = '潮门会合'
duplicateDueCandidate.candidate.description = '守门人已经约定在潮门第七响时会合。'

const ledgerContract = {
  contextId: contextA,
  relevantEvents: [
    currentEvent,
    globalEvent,
    crossContextEvent,
    dormantForeignEvent,
    closedForeignEvent,
    resolvedCurrentEvent,
  ],
  relevantCausalEdges: [currentEdge, crossEdge, foreignEdge],
  dueCandidates: [dueCandidate],
  counts: {
    events: 6,
    transitions: 0,
    evidence: 3,
    causalEdges: 3,
    candidates: 1,
    dueCandidates: 1,
    scheduledRelevant: 2,
    byStatus: {
      scheduled: 2,
      active: 3,
      occurred: 0,
      prevented: 0,
      resolved: 1,
      void: 0,
    },
  },
}

const rawOwnerSummary = '这段 owning summary 不得取代包含作用域的确定性 Prompt 投影。'
const ledgerSubsystem = {
  id: HISTORICAL_EVENT_LEDGER_ID,
  mod: 'mod-history-dynamics',
  label: '历史事件账本',
  description: 'Prompt 消费边界桩',
  collectState() {
    return {
      id: HISTORICAL_EVENT_LEDGER_ID,
      summary: rawOwnerSummary,
      data: structuredClone(ledgerContract),
    }
  },
  preflightBatch() {
    return { ok: true, errors: [], prepared: { batchId: 'fixture', events: [], transitions: [], evidence: [], causalEdges: [], candidateAudits: [], migrationMetadata: [] } }
  },
  commitBatch() {
    return { ok: true, errors: [], eventIds: [], transitionIds: [], evidenceIds: [], causalEdgeIds: [] }
  },
  commitPrepared() {
    return { ok: true, errors: [], eventIds: [], transitionIds: [], evidenceIds: [], causalEdgeIds: [] }
  },
  prepareCandidateSubmission() {
    return {
      prepared: { batchId: 'fixture', events: [], transitions: [], evidence: [], causalEdges: [], candidateAudits: [], migrationMetadata: [] },
      candidateAudits: [],
    }
  },
  submitCandidates() {
    return []
  },
  queryCandidates() {
    return [structuredClone(dueCandidate)]
  },
  getDueCandidates() {
    return [structuredClone(dueCandidate), structuredClone(duplicateDueCandidate)]
  },
  commitCandidateDispositions() {
    return { ok: true, errors: [], eventIds: [], candidateAudits: [] }
  },
  prepareCandidateDispositions() {
    return { ok: true, errors: [], eventIds: [], candidateAudits: [] }
  },
  capturePersistenceState() {
    return structuredClone(ledgerContract)
  },
  restorePersistenceState() {},
  getEvent(eventId) {
    return ledgerContract.relevantEvents.find((candidate) => candidate.eventId === eventId)
  },
  applyChanges() {},
  reset() {},
}

orchestrator.clearExternalSubsystems()
orchestrator.reset()
useEngineStore.getState().reset()
useCharacterStore.getState().reset()
const characterBase = getCharacterBaseSystem()
characterBase.reset()
characterBase.hydrateFromStore()
orchestrator.registerSubsystem(characterBase)
orchestrator.registerSubsystem(ledgerSubsystem)
orchestrator.setContext({
  contextId: contextA,
  contextKind: 'world',
  simulationScope: 'active',
  capabilityProfile: {
    contextId: contextA,
    capabilities: ['life'],
    enabledSubsystemIds: ['character-base', HISTORICAL_EVENT_LEDGER_ID],
    derivedFrom: 'explicit',
  },
  name: 'Prompt 投影测试世界',
  description: '用于验证历史事实不会被适配或跨世界污染。',
  era: '测试纪元',
  config: {
    difficulty: 'normal',
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    eraStartYear: 1,
  },
}, {
  characterId: 'character:prompt-projection',
  name: 'Prompt 投影测试者',
  age: 20,
  gender: '未指定',
  background: '用于确定性消费链回归。',
  attributes: {},
})

// 测试专用地调用内部收集阶段，使断言覆盖真实 relevance -> assemblePromptContext 链。
orchestrator.collectSubsystemStates(false, false)
const promptContext = orchestrator.assemblePromptContext()
const compiledSegments = buildSegmentedPrompt(narrativePrompt, promptContext)
const compiledPrompt = compiledSegments.full
const compiledWorldInput = JSON.parse(compiledSegments.userSegments[0])
const compiledMemoryInput = JSON.parse(compiledSegments.userSegments[1])
const compiledRoundInput = JSON.parse(compiledSegments.userSegments[5])
const localLedgerState = ledgerSubsystem.collectState().data
const eventInjectionText = '【本轮系统事件】潮门的第七响已经传到码头。'
const injectedPrepared = prepareNarrativeRoundPromptContext(orchestrator, eventInjectionText)
const injectedRoundInput = JSON.parse(buildSegmentedPrompt(narrativePrompt, injectedPrepared.promptContext).userSegments[5])

assertOk(
  Array.isArray(localLedgerState.relevantEvents)
    && localLedgerState.relevantEvents.length === ledgerContract.relevantEvents.length
    && ledgerSubsystem.queryCandidates().some((item) => item.candidateId === dueCandidate.candidateId),
  'historical facts and candidates must continue to exist in their local ledger owner',
)
assertOk(
  narrativePrompt.version === '7.11.0'
    && narrativePrompt.serverPromptAssetId === 'mod-engine:narrative:7.11.0',
  'the story Prompt must use the approved 01 asset and version',
)
assertOk(
  JSON.stringify(Object.keys(compiledWorldInput)) === JSON.stringify(['世界'])
    && JSON.stringify(Object.keys(compiledWorldInput.世界)) === JSON.stringify(['名称', '描述'])
    && JSON.stringify(Object.keys(compiledMemoryInput)) === JSON.stringify(['历史连续性事实'])
    && JSON.stringify(Object.keys(compiledRoundInput)) === JSON.stringify(['本轮事实与方向', '当前到期事件'])
    && Array.isArray(compiledRoundInput.本轮事实与方向)
    && compiledRoundInput.本轮事实与方向.length >= 5
    && compiledRoundInput.本轮事实与方向.some((item) => item.includes('本轮事件材料'))
    && compiledRoundInput.本轮事实与方向.some((item) => item.includes('历史事件账本'))
    && !compiledRoundInput.本轮事实与方向.some((item) => item.startsWith('叙述风格：')),
  '01 must retain exactly six user messages, omit unset custom style, and inject scoped world facts when available',
)
assertOk(
  promptContext.subsystemSummaries.length === 0,
  '01 PromptContext must not expose subsystem status summaries',
)
const forbiddenPromptValues = [
  ...ledgerContract.relevantEvents.map((item) => item.eventId),
  ...ledgerContract.relevantCausalEdges.map((item) => item.edgeId),
  dueCandidate.candidateId,
  dueCandidate.candidateId,
  rawOwnerSummary,
  contextA,
  contextB,
  contextC,
]
assertOk(
  forbiddenPromptValues.every((value) => !compiledPrompt.includes(value)),
  'historical events, candidate IDs, causal edges, owner summaries, and context IDs must not enter 01',
)
assertOk(
  compiledRoundInput.当前到期事件.length === 1
    && compiledRoundInput.当前到期事件[0].includes(dueCandidate.candidate.title)
    && compiledRoundInput.当前到期事件[0].includes(dueCandidate.candidate.description),
  '01 current due events must expose only readable time/title/fact content',
)
assertOk(
  injectedRoundInput.本轮事实与方向.filter((item) => item.includes(eventInjectionText)).length === 1
    && injectedRoundInput.本轮事实与方向.some((item) => item.includes('这些材料作为本轮事实参考'))
    && !JSON.stringify(injectedRoundInput).includes('candidate:prompt-due')
    && !JSON.stringify(injectedRoundInput).includes('candidate-audit:prompt-due'),
  '01 must carry one readable lifecycle event through the shared prompt-preparation path without leaking candidate internals',
)

assertOk(
  orchestrator.pendingNarrativeEventCandidateIds?.length === 2,
  'all semantically merged due candidates must enter the existing delivered lifecycle',
)

const prepared = orchestrator.prepareNarrativeResponse({
  narrative: '潮门的约定终于来到眼前，守门人把下一步交还给你的决定。',
})
orchestrator.commitNarrativeResponse(prepared.narrativeId)
orchestrator.finalizeNarrativeResponse(prepared.narrativeId)
const nextPromptContext = orchestrator.assemblePromptContext()
assertOk(
  nextPromptContext.currentDueEvents === undefined,
  'a successfully published due candidate must not be injected again in a later round',
)
assertOk(
  ledgerSubsystem.queryCandidates().some((item) => item.candidateId === dueCandidate.candidateId),
  'suppressing repeat projection must not auto-accept, reject, expire, or delete the ledger candidate',
)

if (failed > 0) {
  console.error(`historical-event-prompt-projection-smoke: ${failed} failure(s)`)
  process.exit(1)
}

console.log('PASS: historical-event-prompt-projection-smoke')
