/**
 * P2 NPC 社会基础：稳定身份、作用域、调度、原子提交、持久化与协议唯一化。
 */

import fs from 'node:fs'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import { deriveCapabilityProfile } from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import {
  assertWorldEntityReference,
  registerWorldEntityReference,
} from '../../../../src/mods/mod-world/world-context-api.ts'
import { getWorldEntitySystem } from '../../../../src/mods/mod-world/subsystems/world-entity-system.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import { ensureOrchestratorContextFromStores } from '../../../../src/mods/mod-engine/helpers/save-restore.ts'
import { RoundCommitBus } from '../../../../src/mods/mod-engine/helpers/round-commit-bus.ts'
import {
  NarrativeAISettlementDataSchema,
  translateNarrativeAISettlement,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { buildNarrativeSettlementStandardExample } from '../../../../src/mods/mod-engine/server/narrative-settlement-system-prompt.ts'
import { parseNarrativeSettlementEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import { getHistoricalEventLedgerSystem } from '../../../../src/mods/mod-history-dynamics/historical-event-api.ts'
import { useNpcSystemStore } from '../../../../src/mods/mod-npc/index.ts'
import { getNpcSystem } from '../../../../src/mods/mod-npc/npc-system-api.ts'
import { getRelationshipSystem } from '../../../../src/mods/mod-social/relationship-system-api.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

function assertThrows(action, message) {
  let rejected = false
  try {
    action()
  } catch {
    rejected = true
  }
  assertOk(rejected, message)
}

function worldConfig(name) {
  return {
    name,
    eraName: '测试纪元',
    eraStartYear: 1,
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}的 P2 测试设定。`,
    worldType: 'mixed',
  }
}

function fixtureContext(contextId, name, scope, reason = '测试范围') {
  const config = worldConfig(name)
  const rootNodeId = `${contextId}:space:root`
  return {
    record: {
      id: contextId,
      name,
      description: config.description,
      kind: 'world',
      rootSpatialNodeId: rootNodeId,
      lifecycle: scope === 'closed' ? 'closed' : scope === 'dormant' ? 'dormant' : 'open',
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
      capabilities: ['space', 'life', 'npc'],
      enabledSubsystemIds: ['npc-system', 'relationship-system'],
      backgroundSubsystemIds: ['npc-system', 'relationship-system'],
      derivedFrom: 'confirmed-facts',
    },
    scope: { contextId, scope, reason, changedAtGlobalDay: 0 },
    spatialGraph: {
      contextId,
      rootNodeId,
      nodes: {
        [rootNodeId]: {
          id: rootNodeId,
          contextId,
          kind: 'scene',
          name: `${name}根场景`,
          attributes: {},
        },
      },
      edges: {},
      entityLocations: {},
    },
    worldConfig: config,
    worldCode: contextId.charCodeAt(contextId.length - 1),
    initialized: true,
    entities: [],
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

function roundContext(contextId, contextScope, totalDays) {
  return {
    contextId,
    contextScope,
    worldId: contextId,
    characterId: playerId,
    round: { year: Math.floor(totalDays / 365) + 1, season: 1, month: 1 },
    timeStep: { unit: 'year', value: 1 },
    difficulty: 'normal',
    subsystemStates: {},
    roundSequence: totalDays,
    daysPassed: 365,
    totalDays,
  }
}

function npcChange(npcId, contextId, operation, changes, description, evidenceEventIds = []) {
  return {
    id: 'npc-system',
    targetObjectId: npcId,
    targetContextId: contextId,
    operation,
    evidenceEventIds,
    description,
    changes,
  }
}

function relationshipChange(fromEntityId, contextId, operation, changes, description, evidenceEventIds = []) {
  return {
    id: 'relationship-system',
    targetObjectId: fromEntityId,
    targetContextId: contextId,
    operation,
    evidenceEventIds,
    description,
    changes,
  }
}

const contextA = 'ctx_p2_a'
const contextB = 'ctx_p2_b'
const contextC = 'ctx_p2_c'
const contextD = 'ctx_p2_d'
const fixtureA = fixtureContext(contextA, '世界甲', 'active', '当前玩家上下文')
const fixtureB = fixtureContext(contextB, '世界乙', 'background')
const fixtureC = fixtureContext(contextC, '世界丙', 'dormant')
const fixtureD = fixtureContext(contextD, '世界丁', 'closed')
const playerId = 'player:p2-smoke'
const npcA = `${contextA}:character:same-name`
const npcB = `${contextB}:character:same-name`
const npcC = `${contextC}:character:dormant`
const npcD = `${contextD}:character:closed`
const npcAtomic = `${contextA}:character:atomic`
const npcRemote = `${contextA}:character:remote`
const npcPlanned = `${contextA}:character:planned`
const organizationA = `${contextA}:entity:organization`
const remoteNodeId = `${contextA}:space:remote`

fixtureA.spatialGraph.nodes[remoteNodeId] = {
  id: remoteNodeId,
  contextId: contextA,
  kind: 'scene',
  name: '远端场景',
  attributes: {},
}

useWorldStore.setState({
  contexts: {
    [contextA]: fixtureA,
    [contextB]: fixtureB,
    [contextC]: fixtureC,
    [contextD]: fixtureD,
  },
  currentContextId: contextA,
  crossContextEdges: {},
  transitionHistory: [],
  entityReferences: {},
  worldConfig: fixtureA.worldConfig,
  entities: [],
  initialized: true,
  worldCode: fixtureA.worldCode,
  currentYear: 0,
  worldTags: [],
  eraStartYear: 1,
  eraName: '测试纪元',
  calibration: null,
  destinyPatternModifiers: {},
  worldInitAIStatus: null,
})
useCharacterStore.setState({ characterId: playerId, name: '测试玩家', worldCode: fixtureA.worldCode })
useEngineStore.setState((state) => ({
  ...state,
  round: { ...state.round, totalDays: 0 },
}))

const npcSystem = getNpcSystem()
const relationshipSystem = getRelationshipSystem()
const entitySystem = getWorldEntitySystem()
const ledger = getHistoricalEventLedgerSystem()
npcSystem.reset()
relationshipSystem.reset()
ledger.reset()

assertOk(ensureOrchestratorContextFromStores(), 'runtime context restoration must succeed for a valid P2 world')
assertOk(
  assertWorldEntityReference(playerId, ['player']).contextIds.includes(contextA)
    && useWorldStore.getState().contexts[contextA].spatialGraph.entityLocations[playerId]?.nodeId
      === fixtureA.record.rootSpatialNodeId,
  'runtime restoration must register and place the current player through world-owned boundaries',
)

for (const contextId of [contextB, contextC, contextD]) {
  registerWorldEntityReference({
    entityId: playerId,
    kind: 'player',
    displayName: '测试玩家',
    contextIds: [contextId],
    registeredAtTotalDays: 0,
  })
}
for (const [entityId, contextId, displayName] of [
  [npcA, contextA, '同名人物'],
  [npcB, contextB, '同名人物'],
  [npcC, contextC, '休眠人物'],
  [npcD, contextD, '关闭人物'],
  [npcAtomic, contextA, '原子人物'],
  [npcRemote, contextA, '异场人物'],
]) {
  registerWorldEntityReference({
    entityId,
    kind: 'npc',
    displayName,
    contextIds: [contextId],
    registeredAtTotalDays: 0,
  })
}
registerWorldEntityReference({
  entityId: organizationA,
  kind: 'organization',
  displayName: '测试组织',
  contextIds: [contextA],
  registeredAtTotalDays: 0,
})

assertOk(npcA !== npcB, 'same-name NPCs in different contexts must use different stable IDs')
assertThrows(
  () => registerWorldEntityReference({
    entityId: 'npc:bad-context',
    kind: 'npc',
    displayName: '错误引用',
    contextIds: ['ctx_missing'],
    registeredAtTotalDays: 0,
  }),
  'entity directory must reject unknown context IDs before writing',
)
assertThrows(
  () => registerWorldEntityReference({
    entityId: 'npc:no-context',
    kind: 'npc',
    displayName: '空范围',
    contextIds: [],
    registeredAtTotalDays: 0,
  }),
  'entity directory must reject empty visibility scopes',
)
assertThrows(
  () => registerWorldEntityReference({
    entityId: 'npc:fractional-time',
    kind: 'npc',
    displayName: '错误时间',
    contextIds: [contextA],
    registeredAtTotalDays: 0.5,
  }),
  'entity directory must reject non-integer canonical registration days',
)

const capabilityProfile = deriveCapabilityProfile(
  contextA,
  fixtureA.worldConfig,
  'confirmed-facts',
  ['space', 'npc'],
)
assertOk(
  capabilityProfile.enabledSubsystemIds.includes('npc-system')
    && capabilityProfile.enabledSubsystemIds.includes('relationship-system')
    && capabilityProfile.backgroundSubsystemIds.includes('npc-system')
    && capabilityProfile.backgroundSubsystemIds.includes('relationship-system'),
  'npc capability must activate both P2 systems for full and background runtime policy',
)

const historyCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'npc-social-p2-smoke' },
  events: [{
    eventId: 'event:p2:shared-rescue',
    eventType: 'shared-rescue',
    title: '共同脱险',
    description: '玩家与同名人物共同脱离险境。',
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
  }],
}, { contextId: contextA, roundSequence: 1, totalDays: 365 })
assertOk(historyCommit.ok && historyCommit.eventIds.length === 1, 'P2 fixture historical evidence must commit')
const evidenceEventId = historyCommit.eventIds[0]

assertThrows(
  () => relationshipSystem.preflightChanges(relationshipChange(playerId, contextB, 'establish', {
    toEntityId: npcB,
    scopeKind: 'context',
    scopeContextIds: [contextB],
  }, '错误上下文证据', [evidenceEventId]), roundContext(contextB, 'background', 365)),
  'relationship instructions must reject evidence from another context',
)
assertThrows(
  () => relationshipSystem.preflightChanges(relationshipChange(playerId, contextA, 'establish', {
    toEntityId: organizationA,
    scopeKind: 'context',
    scopeContextIds: [contextA],
    affinity: 101,
  }, '越界初始关系'), roundContext(contextA, 'active', 365)),
  'relationship instructions must reject out-of-range initial values instead of clamping them',
)

const contextA365 = roundContext(contextA, 'active', 365)
npcSystem.applyChanges(npcChange(npcA, contextA, 'create-identity', {
  displayName: '同名人物',
  creationSource: 'P2 聚焦测试',
  stableTraits: ['谨慎', '守诺'],
}, '建立 NPC 连续身份'), contextA365)
npcSystem.applyChanges(npcChange(npcA, contextA, 'set-context-state', {
  localName: '阿禾',
  stance: '合作',
  role: '领航员',
  localRuleModifiers: { navigation: 2 },
}, '登记当前世界身份'), contextA365)
npcSystem.applyChanges(npcChange(npcA, contextA, 'set-goal', {
  description: '带船队安全离港',
  targetEntityIds: [organizationA],
}, '建立可追踪目标', [evidenceEventId]), contextA365)
npcSystem.applyChanges(npcChange(npcA, contextA, 'record-behavior', {
  behaviorOperation: 'escort',
  targetEntityIds: [organizationA],
  spatialNodeId: fixtureA.record.rootSpatialNodeId,
}, '记录已确认护送行动', [evidenceEventId]), contextA365)
npcSystem.applyChanges(npcChange(npcA, contextA, 'record-memory', {
  summary: '玩家在危急时刻没有抛下自己。',
  emotion: 7,
  relatedEntityIds: [playerId],
  sourceMemoryIds: [],
}, '保存 NPC 自身主观记忆', [evidenceEventId]), contextA365)

relationshipSystem.applyChanges(relationshipChange(playerId, contextA, 'establish', {
  toEntityId: npcA,
  scopeKind: 'context',
  scopeContextIds: [contextA],
  categoryTags: ['盟友'],
  affinity: 20,
  trust: 35,
  bond: 10,
  conflict: 0,
}, '共同脱险后建立当地关系', [evidenceEventId]), contextA365)
relationshipSystem.applyChanges(relationshipChange(playerId, contextA, 'establish', {
  toEntityId: npcA,
  scopeKind: 'global',
  categoryTags: ['跨世界承诺'],
  affinity: 10,
  trust: 20,
}, '建立跨世界连续关系', [evidenceEventId]), contextA365)

npcSystem.applyChanges(npcChange(npcRemote, contextA, 'create-identity', {
  displayName: '异场人物',
  creationSource: 'P2 投影测试',
  stableTraits: ['独立'],
}, '建立异场 NPC 身份'), contextA365)
npcSystem.applyChanges(npcChange(npcRemote, contextA, 'set-context-state', {
  localName: '远客',
  stance: '中立',
  role: '守望者',
}, '登记异场 NPC 当地状态'), contextA365)
npcSystem.applyChanges(npcChange(npcRemote, contextA, 'record-behavior', {
  behaviorOperation: 'watch',
  spatialNodeId: remoteNodeId,
}, '记录异场行动'), contextA365)
relationshipSystem.applyChanges(relationshipChange(npcRemote, contextA, 'establish', {
  toEntityId: organizationA,
  scopeKind: 'context',
  scopeContextIds: [contextA],
  categoryTags: ['任职'],
}, '建立异场关系'), contextA365)

const globalRelationship = relationshipSystem
  .getRelationshipsForEntities([playerId, npcA], contextA)
  .find((relationship) => relationship.scope.kind === 'global')
assertOk(
  globalRelationship?.scope.contextIds.length === 0,
  'global relationships must remain stable without binding to one contextId',
)
assertThrows(
  () => relationshipSystem.applyChanges(relationshipChange(
    globalRelationship.relationshipId,
    contextA,
    'adjust',
    { affinityDelta: 100 },
    '越界关系调整',
  ), contextA365),
  'relationship adjustments must reject an out-of-range resulting value instead of clamping it',
)
assertThrows(
  () => relationshipSystem.applyChanges(relationshipChange(playerId, contextA, 'establish', {
    toEntityId: npcA,
    scopeKind: 'global',
  }, '禁止重复全局边'), contextA365),
  'duplicate directed relationships in the same scope must be rejected',
)
assertThrows(
  () => npcSystem.preflightChanges(npcChange(npcA, contextA, 'record-behavior', {
    behaviorOperation: 'move',
    spatialNodeId: `${contextB}:space:root`,
  }, '错误世界位置'), contextA365),
  'NPC behavior must reject a spatial node from another context',
)

const collectedA = npcSystem.collectState(roundContext(contextA, 'active', 730)).data
const collectedRelationshipsA = relationshipSystem.collectState(roundContext(contextA, 'active', 730)).data
assertOk(
  collectedA.npcs.length === 1
    && collectedA.npcs[0].ageYears === 1
    && collectedA.npcs[0].memories.length === 1
    && collectedA.npcs[0].contextState.localName === '阿禾',
  'active projection must preserve identity, derived age, local state, goals and subjective memory',
)
assertOk(
  useNpcSystemStore.getState().identities.some((identity) => identity.npcId === npcRemote)
    && relationshipSystem.capturePersistenceState().relationships.some((relationship) => relationship.fromEntityId === npcRemote)
    && !collectedA.npcs.some((npc) => npc.npcId === npcRemote)
    && !collectedRelationshipsA.relationships.some((relationship) => relationship.fromEntityId === npcRemote),
  'prompt projection must exclude unrelated same-context scene data without removing it from owning stores',
)

for (const [npcId, contextId, scope] of [
  [npcB, contextB, 'background'],
  [npcC, contextC, 'dormant'],
  [npcD, contextD, 'closed'],
]) {
  const context = roundContext(contextId, scope, 100)
  npcSystem.applyChanges(npcChange(npcId, contextId, 'create-identity', {
    displayName: assertWorldEntityReference(npcId).displayName,
    creationSource: '调度测试',
    stableTraits: [],
  }, '建立调度测试身份'), context)
  npcSystem.applyChanges(npcChange(npcId, contextId, 'set-goal', {
    description: `${scope} 范围目标`,
    targetEntityIds: [],
  }, '建立调度测试目标'), context)
  relationshipSystem.applyChanges(relationshipChange(playerId, contextId, 'establish', {
    toEntityId: npcId,
    scopeKind: 'context',
    scopeContextIds: [contextId],
    categoryTags: ['调度测试'],
  }, '建立调度测试关系'), context)
}

const advanceContext = roundContext(contextA, 'active', 500)
npcSystem.advance(advanceContext)
const backgroundBehaviors = useNpcSystemStore.getState().behaviorRecords
  .filter((behavior) => behavior.source === 'background-aggregate')
assertOk(
  backgroundBehaviors.length === 1 && backgroundBehaviors[0].contextId === contextB,
  'only background scope may produce deterministic NPC aggregate behavior',
)
relationshipSystem.advance(advanceContext)
const firstBackgroundTransitionCount = relationshipSystem.capturePersistenceState().transitions
  .filter((transition) => transition.transitionId.startsWith('relationship-background:')).length
relationshipSystem.advance(advanceContext)
const backgroundTransitions = relationshipSystem.capturePersistenceState().transitions
  .filter((transition) => transition.transitionId.startsWith('relationship-background:'))
assertOk(
  backgroundTransitions.length === firstBackgroundTransitionCount
    && backgroundTransitions.length > 0
    && backgroundTransitions.every((transition) => transition.contextId === contextB),
  'relationship background aggregation must be idempotent and freeze dormant/closed contexts',
)

const roundCommitBus = new RoundCommitBus(
  (id) => id === npcSystem.id ? npcSystem : id === relationshipSystem.id ? relationshipSystem : undefined,
  (change, context) => {
    const subsystem = change.id === npcSystem.id ? npcSystem : relationshipSystem
    subsystem.applyChanges(change, context)
  },
)
const atomicResult = roundCommitBus.commit({
  source: 'narrative',
  changes: [
    npcChange(npcAtomic, contextA, 'create-identity', {
      displayName: '原子人物',
      creationSource: '原子测试',
      stableTraits: [],
    }, '合法身份指令'),
    relationshipChange(playerId, contextA, 'establish', {
      toEntityId: 'entity:missing',
      scopeKind: 'context',
      scopeContextIds: [contextA],
    }, '非法关系端点'),
  ],
}, contextA365)
assertOk(
  atomicResult.committed.length === 0
    && atomicResult.rejected.length === 1
    && !useNpcSystemStore.getState().identities.some((identity) => identity.npcId === npcAtomic),
  'mixed valid and invalid P2 instructions must make zero writes after package preflight',
)

const plannedPackageResult = roundCommitBus.commit({
  source: 'narrative',
  changes: [
    relationshipChange('player:current', contextA, 'establish', {
      toEntityId: npcPlanned,
      scopeKind: 'context',
      scopeContextIds: [contextA],
      categoryTags: ['同回合创建'],
    }, '创建后立即建立关系'),
    npcChange(npcPlanned, contextA, 'create-identity', {
      displayName: '同回合人物',
      creationSource: '同回合依赖回归',
      stableTraits: ['可追踪'],
    }, '登记同回合创建身份'),
  ],
}, contextA365)
assertOk(
  plannedPackageResult.rejected.length === 0
    && plannedPackageResult.committed.length === 2
    && useNpcSystemStore.getState().identities.some((identity) => identity.npcId === npcPlanned)
    && assertWorldEntityReference(npcPlanned, ['npc']).displayName === '同回合人物'
    && relationshipSystem.capturePersistenceState().relationships.some((relationship) => (
      relationship.fromEntityId === playerId && relationship.toEntityId === npcPlanned
    )),
  'one narrative package must allow an unregistered NPC create followed by a same-round relationship, including player:current alias resolution',
)

const entitySnapshot = entitySystem.capturePersistenceState()
const relationshipSnapshot = relationshipSystem.capturePersistenceState()
const npcSnapshot = npcSystem.capturePersistenceState()
const expectedRelationshipSnapshot = JSON.stringify(relationshipSnapshot)
const expectedNpcSnapshot = JSON.stringify(npcSnapshot)
useWorldStore.setState({ entityReferences: {} })
relationshipSystem.reset()
npcSystem.reset()
entitySystem.restorePersistenceState(entitySnapshot)
relationshipSystem.restorePersistenceState(relationshipSnapshot)
npcSystem.restorePersistenceState(npcSnapshot)
assertOk(
  JSON.stringify(relationshipSystem.capturePersistenceState()) === expectedRelationshipSnapshot
    && JSON.stringify(npcSystem.capturePersistenceState()) === expectedNpcSnapshot,
  'entity, relationship and NPC schemaVersion snapshots must round-trip without loss',
)

const beforeBadRelationship = JSON.stringify(relationshipSystem.capturePersistenceState())
const badRelationship = structuredClone(relationshipSnapshot)
badRelationship.relationships[0].toEntityId = 'entity:missing'
assertThrows(
  () => relationshipSystem.restorePersistenceState(badRelationship),
  'relationship restore must reject missing endpoints',
)
assertOk(
  JSON.stringify(relationshipSystem.capturePersistenceState()) === beforeBadRelationship,
  'failed relationship restore must preserve the loaded state',
)
assertThrows(
  () => relationshipSystem.restorePersistenceState({ ...relationshipSnapshot, schemaVersion: 2 }),
  'relationship restore must reject unknown future schema versions',
)
assertThrows(
  () => relationshipSystem.restorePersistenceState({ ...relationshipSnapshot, migrationMetadata: [] }),
  'relationship restore must reject fields from an old or parallel persistence contract',
)
const fractionalRelationship = structuredClone(relationshipSnapshot)
fractionalRelationship.relationships[0].createdAtTotalDays = 365.5
assertThrows(
  () => relationshipSystem.restorePersistenceState(fractionalRelationship),
  'relationship restore must reject non-integer canonical timestamps',
)
assertOk(
  JSON.stringify(relationshipSystem.capturePersistenceState()) === beforeBadRelationship,
  'failed relationship timestamp restore must preserve the loaded state',
)

const beforeBadEntityDirectory = JSON.stringify(entitySystem.capturePersistenceState())
const missingLocatedEntity = structuredClone(entitySnapshot)
missingLocatedEntity.entries = missingLocatedEntity.entries.filter((entry) => entry.entityId !== npcA)
assertThrows(
  () => entitySystem.restorePersistenceState(missingLocatedEntity),
  'entity-directory restore must reject a spatially located entity without a directory reference',
)
assertThrows(
  () => entitySystem.restorePersistenceState({ ...entitySnapshot, legacyEntries: [] }),
  'entity-directory restore must reject unknown persistence fields',
)
assertOk(
  JSON.stringify(entitySystem.capturePersistenceState()) === beforeBadEntityDirectory,
  'failed entity-directory restore must preserve the loaded directory',
)

const beforeBadNpc = JSON.stringify(npcSystem.capturePersistenceState())
const badNpc = structuredClone(npcSnapshot)
badNpc.memories[0].sourceMemoryIds = ['npc-memory:missing']
assertThrows(
  () => npcSystem.restorePersistenceState(badNpc),
  'NPC restore must reject broken sourceMemoryIds',
)
assertOk(
  JSON.stringify(npcSystem.capturePersistenceState()) === beforeBadNpc,
  'failed NPC restore must preserve the loaded state',
)
assertThrows(
  () => npcSystem.restorePersistenceState({ ...npcSnapshot, schemaVersion: 2 }),
  'NPC restore must reject unknown future schema versions',
)
assertThrows(
  () => npcSystem.restorePersistenceState({ ...npcSnapshot, migrationMetadata: [] }),
  'NPC restore must reject fields from an old or parallel persistence contract',
)
assertOk(
  !('importLegacyCollectedStates' in npcSystem)
    && !('importLegacyCollectedStates' in relationshipSystem),
  'P2 systems must not expose an old collected-state compatibility entry',
)

entitySystem.restorePersistenceState(undefined)
assertOk(
  !entitySystem.listEntityReferences().some((reference) => reference.kind === 'npc'),
  'an absent entity-directory snapshot must clear NPC references left by another save',
)
entitySystem.restorePersistenceState(entitySnapshot)

const standardEnvelope = parseNarrativeSettlementEnvelope(buildNarrativeSettlementStandardExample())
const standardInstructionKeys = Object.keys(standardEnvelope.systemInstructions[0]).sort()
assertOk(
  JSON.stringify(standardInstructionKeys)
    === JSON.stringify(['依据事件', '变更', '操作', '目标上下文', '目标对象', '系统', '说明'].sort()),
  'the canonical AI example must show all seven fixed system-instruction fields',
)
assertOk(
  translateNarrativeAISettlement([{
      系统: 'NPC系统',
      目标对象: npcAtomic,
      目标上下文: contextA,
      操作: '创建身份',
      说明: '建立稳定 NPC 身份',
      变更: { 显示名: '原子人物' },
      依据事件: [],
    }], { 摘要: '建立稳定 NPC 身份' }, {
      allowedEvidenceEventIds: [],
      allowedSubsystemIds: ['npc-system'],
    }).changes[0]?.id === 'npc-system',
  'the unified Chinese protocol must translate P2 instructions to the single runtime ID',
)
const relationshipEndInstruction = {
  系统: '通用关系系统',
  目标对象: globalRelationship.relationshipId,
  目标上下文: contextA,
  操作: '解除',
  说明: '明确解除关系',
  变更: {},
  依据事件: [evidenceEventId],
}
const parsedRelationshipEnd = parseNarrativeSettlementEnvelope([
  `⟦系统1⟧${JSON.stringify(relationshipEndInstruction)}`,
  `⟦数据⟧${JSON.stringify({ 摘要: '明确解除关系' })}`,
].join('\n\n'))
const translatedRelationshipEnd = translateNarrativeAISettlement(
  parsedRelationshipEnd.systemInstructions,
  parsedRelationshipEnd.data,
  {
    allowedEvidenceEventIds: [evidenceEventId],
    allowedSubsystemIds: ['relationship-system'],
  },
)
assertOk(
  Object.keys(translatedRelationshipEnd.changes[0].changes).length === 0,
  'relationship end must use the unified seven-field instruction with an empty payload',
)
relationshipSystem.preflightChanges(
  relationshipChange(globalRelationship.relationshipId, contextA, 'end', {}, '明确解除关系', [evidenceEventId]),
  contextA365,
)
assertThrows(
  () => translateNarrativeAISettlement([{
      系统: 'NPC系统',
      目标对象: npcAtomic,
      目标上下文: contextA,
      操作: '创建身份',
      说明: '夹带其他 NPC 操作字段',
      变更: { 目标描述: '不应由创建身份消费' },
      依据事件: [],
    }], { 摘要: '非法 NPC 操作' }, {
      allowedEvidenceEventIds: [],
      allowedSubsystemIds: ['npc-system'],
    }),
  'translation must reject fields that belong to the system but not the selected operation',
)
assertThrows(
  () => npcSystem.preflightChanges(npcChange(npcAtomic, contextA, 'create-identity', {
    description: '不应由创建身份消费',
  }, '夹带内部字段'), contextA365),
  'the NPC owner must reject inapplicable operation fields instead of silently ignoring them',
)
assertThrows(
  () => relationshipSystem.preflightChanges(relationshipChange(
    globalRelationship.relationshipId,
    contextA,
    'end',
    { affinityDelta: 1 },
    '解除时夹带调整字段',
  ), contextA365),
  'relationship end must reject non-empty payloads instead of silently applying partial meaning',
)
assertThrows(
  () => relationshipSystem.preflightChanges(relationshipChange(
    globalRelationship.relationshipId,
    contextA,
    'adjust',
    {},
    '空关系调整',
  ), contextA365),
  'relationship adjust must contain at least one applicable field',
)
npcSystem.preflightChanges(npcChange(npcA, contextA, 'record-memory', {
  summary: '没有历史事件时以行为来源保留主观记忆。',
  emotion: 3,
  relatedEntityIds: [playerId],
  sourceMemoryIds: [],
}, '保存无历史事件的行为来源记忆'), contextA365)
npcSystem.applyChanges(npcChange(npcA, contextA, 'record-memory', {
  summary: '没有历史事件时以行为来源保留主观记忆。',
  emotion: 3,
  relatedEntityIds: [playerId],
  sourceMemoryIds: [],
}, '保存无历史事件的行为来源记忆'), contextA365)
const behaviorMemoryState = useNpcSystemStore.getState()
const behaviorMemory = behaviorMemoryState.memories.at(-1)
const behaviorMemorySource = behaviorMemoryState.behaviorRecords.find((record) => (
  record.behaviorId === behaviorMemory?.sourceId
))
assertOk(
  behaviorMemory?.sourceKind === 'behavior' && Boolean(behaviorMemorySource),
  'NPC record-memory without a historical event must create a traceable behavior source',
)
const behaviorMemorySnapshot = npcSystem.capturePersistenceState()
npcSystem.restorePersistenceState(behaviorMemorySnapshot)
assertOk(
  JSON.stringify(npcSystem.capturePersistenceState()) === JSON.stringify(behaviorMemorySnapshot),
  'behavior-sourced NPC memory must survive snapshot restore',
)
assertOk(
  !NarrativeAISettlementDataSchema.safeParse({ 摘要: '旧字段', 状态变更: [] }).success,
  'the old 状态变更 success protocol must be rejected',
)

const root = getProjectRoot(import.meta.url)
const mvpConfig = JSON.parse(fs.readFileSync(path.join(
  root,
  'src/mods/mod-engine/helpers/mvp-stages-config.default.json',
), 'utf8'))
const activeStage = mvpConfig.stages[mvpConfig.currentStage] ?? mvpConfig.stages.mvp
const externalRuntimeOrder = activeStage.runtime.external
assertOk(
  externalRuntimeOrder.indexOf('historical-event-ledger')
    < externalRuntimeOrder.indexOf('world-entity')
    && externalRuntimeOrder.indexOf('world-entity')
      < externalRuntimeOrder.indexOf('relationship-system')
    && externalRuntimeOrder.indexOf('relationship-system')
      < externalRuntimeOrder.indexOf('npc-system'),
  'P2 restore order must load evidence and entity references before relationships and NPC memories',
)
const oldRuntimePatterns = [
  /readonly\s+id\s*=\s*['"]npc-attribute['"]/u,
  /readonly\s+id\s*=\s*['"]npc-behavior['"]/u,
  /readonly\s+id\s*=\s*['"]npc-memory['"]/u,
  /readonly\s+id\s*=\s*['"]relationship['"]/u,
  /mod-npc:persist:npc-state/u,
  /NarrativeAIChangeSchema/u,
]
const runtimeFiles = [
  'src/mods/mod-npc',
  'src/mods/mod-social',
  'src/mods/mod-culture',
  'src/mods/mod-engine',
  'src/core/mod-loader',
].flatMap((relativePath) => {
  const absolutePath = path.join(root, relativePath)
  const stat = fs.statSync(absolutePath)
  if (stat.isFile()) return [absolutePath]
  const visit = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory()
      ? visit(path.join(directory, entry.name))
      : /\.(?:ts|tsx|json)$/u.test(entry.name) ? [path.join(directory, entry.name)] : []
  ))
  return visit(absolutePath)
})
const runtimeSource = runtimeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
assertOk(
  oldRuntimePatterns.every((pattern) => !pattern.test(runtimeSource)),
  'old NPC/relationship runtime IDs, browser Store key and old AI schema must have zero live-source entries',
)

if (failed > 0) {
  console.error(`npc-social-p2-smoke failed: ${failed}`)
  process.exit(1)
}

console.log('npc-social-p2-smoke passed')
