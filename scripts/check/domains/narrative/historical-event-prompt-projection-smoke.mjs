/**
 * P1 历史事件账本 -> 主叙事 Prompt 确定性消费链回归。
 * 边界使用账本公开 collectState 契约桩，避免测试建立第二个事实 Store。
 */

import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import {
  adaptationManager,
  bypassWorldviewAdaptation,
} from '../../../../src/mods/mod-engine/subsystems/adaptation-manager-system.ts'
import { orchestrator } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'
import {
  HISTORICAL_EVENT_LEDGER_ID,
} from '../../../../src/mods/mod-engine/helpers/historical-event-prompt-projection.ts'
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
  counts: {
    events: 6,
    transitions: 0,
    evidence: 3,
    causalEdges: 3,
    candidates: 0,
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
  applyChanges() {},
  reset() {},
}

orchestrator.clearExternalSubsystems()
orchestrator.reset()
useEngineStore.getState().reset()
useCharacterStore.getState().reset()
orchestrator.registerSubsystem(ledgerSubsystem)
orchestrator.setContext({
  contextId: contextA,
  contextKind: 'world',
  simulationScope: 'active',
  capabilityProfile: {
    contextId: contextA,
    capabilities: ['life'],
    enabledSubsystemIds: [HISTORICAL_EVENT_LEDGER_ID],
    derivedFrom: 'explicit',
  },
  name: 'Prompt 投影测试世界',
  description: '用于验证历史事实不会被适配或跨世界污染。',
  era: '测试纪元',
  config: {
    difficulty: 'normal',
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerCeiling: 1,
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
const historicalProjection = promptContext.subsystemSummaries.find((summary) => (
  summary.includes('【历史事件账本：当前待续事实】')
))
const compiledPrompt = buildSegmentedPrompt(narrativePrompt, promptContext).full

assertOk(
  bypassWorldviewAdaptation(HISTORICAL_EVENT_LEDGER_ID),
  'historical-event-ledger must be explicitly excluded from worldview adaptation',
)
assertOk(
  adaptationManager.getAdaptedSummaries([{
    id: HISTORICAL_EVENT_LEDGER_ID,
    summary: historicalProjection ?? '',
  }]).get(HISTORICAL_EVENT_LEDGER_ID) === historicalProjection,
  'deterministic historical projection must remain byte-for-byte unchanged through adaptation manager',
)
assertOk(
  narrativePrompt.version === '4.2.0',
  'historical Prompt input semantics must use narrative Prompt 4.2.0',
)
assertOk(
  Boolean(historicalProjection)
    && historicalProjection.includes(`历史事件[${currentEvent.eventId}]`)
    && historicalProjection.includes('已确认事实：当前世界的潮门将在第七响后关闭。')
    && historicalProjection.includes(`作用域：当地上下文[${contextA}]`)
    && historicalProjection.includes('处理条件：全局第430天、潮门第七响')
    && historicalProjection.includes(`历史事件[${globalEvent.eventId}]`)
    && historicalProjection.includes('作用域：全局')
    && historicalProjection.includes(`历史事件[${crossContextEvent.eventId}]`)
    && historicalProjection.includes(`作用域：跨上下文[${contextA}、${contextB}]`),
  'current-context, global, and explicitly current-crossing scheduled/active facts must retain IDs, text, status, scope, and schedule',
)
assertOk(
  historicalProjection?.includes(`显式因果边[${currentEdge.edgeId}]`)
    && historicalProjection.includes(`显式因果边[${crossEdge.edgeId}]`)
    && historicalProjection.includes(`事件[${currentEvent.eventId}]使之成为可能事件[${globalEvent.eventId}]`)
    && historicalProjection.includes(`事件[${crossContextEvent.eventId}]传播到事件[${currentEvent.eventId}]`),
  'causal edges related to current pending facts must retain edge IDs, endpoint IDs, relations, and scopes',
)
assertOk(
  !historicalProjection?.includes(dormantForeignEvent.description)
    && !historicalProjection?.includes(closedForeignEvent.description)
    && !historicalProjection?.includes(resolvedCurrentEvent.description)
    && !historicalProjection?.includes(foreignEdge.edgeId)
    && !historicalProjection?.includes(rawOwnerSummary),
  'dormant, closed, unrelated-world, resolved, and non-projected owner text must stay outside the current Prompt fact card',
)
assertOk(
  compiledPrompt.includes(currentEvent.description)
    && compiledPrompt.includes(currentEdge.edgeId)
    && compiledPrompt.includes(`作用域：当地上下文[${contextA}]`)
    && !compiledPrompt.includes(dormantForeignEvent.description)
    && !compiledPrompt.includes(closedForeignEvent.description)
    && !compiledPrompt.includes(foreignEdge.edgeId)
    && !compiledPrompt.includes(rawOwnerSummary),
  'the concrete deterministic fact card and related edge must reach the compiled three-layer main Prompt without other-world leakage',
)

if (failed > 0) {
  console.error(`historical-event-prompt-projection-smoke: ${failed} failure(s)`)
  process.exit(1)
}

console.log('PASS: historical-event-prompt-projection-smoke')
