/**
 * P0 多世界基础：迁移、身份、范围、空间、原子切换与故事作用域回归。
 */

import { sanitizeWorldStateSnapshot } from '../../../../src/mods/mod-world/utils/world-state-migration.ts'
import {
  buildWorldContextInstance,
  contextKindUsesRegionMap,
  createCrossContextExit,
  deriveCapabilityProfile,
  REQUIRED_CONTEXT_SUBSYSTEM_IDS,
} from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import { WORLDVIEW_TAG_DEFAULTS } from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import {
  commitWorldInitialization,
  createAdditionalWorldContext,
} from '../../../../src/mods/mod-world/world-init-bundle.ts'
import { closeWorldContext } from '../../../../src/mods/mod-world/world-context-api.ts'
import { getWorldContextRegistrySystem } from '../../../../src/mods/mod-world/subsystems/world-context-registry-system.ts'
import { getSpatialGraphSystem } from '../../../../src/mods/mod-world/subsystems/spatial-graph-system.ts'
import { getContextTransitionSystem } from '../../../../src/mods/mod-world/subsystems/context-transition-system.ts'
import { getSimulationScopePolicySystem } from '../../../../src/mods/mod-world/subsystems/simulation-scope-policy-system.ts'
import { causalDelay } from '../../../../src/mods/mod-engine/subsystems/causal-delay-system.ts'
import { foreshadowing } from '../../../../src/mods/mod-engine/subsystems/foreshadowing-system.ts'
import { memoryLifecycle } from '../../../../src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'
import { orchestrator } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'
import { buildOrchestratorWorldSetting } from '../../../../src/mods/mod-engine/helpers/orchestrator-world-setting.ts'
import {
  buildNarrativeTimeContext,
  resolveNarrativeCalendarNode,
} from '../../../../src/mods/mod-engine/helpers/narrative-calendar.ts'
import { projectWorldSettingForNarrativeAI } from '../../../../src/mods/mod-engine/helpers/narrative-ai-input-view.ts'
import { filterNarrativeRecordsForPrompt } from '../../../../src/mods/mod-engine/helpers/narrative-context-scope.ts'
import {
  buildCanonicalCalendarNarrativeHint,
  buildTimeScaleNarrativeHint,
} from '../../../../src/mods/mod-engine/helpers/time-scale-narrative.ts'
import {
  applyGameSave,
  collectGameSavePayload,
  ensureOrchestratorContextFromStores,
} from '../../../../src/mods/mod-engine/helpers/save-restore.ts'
import {
  MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS,
  MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS,
} from '../../../../src/mods/mod-engine/helpers/mvp-runtime-policy.ts'
import { SUBSYSTEM_FIELD_CONTRACTS } from '../../../../src/mods/mod-engine/helpers/subsystem-field-registry.ts'
import { useGlobalStore } from '../../../../src/core/global-store/global-store.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { CharacterBaseSystem } from '../../../../src/mods/mod-character/subsystems/character-base-system.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

function worldConfig(name, overrides = {}) {
  return {
    name,
    eraName: '纪元',
    eraStartYear: 1,
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerCeiling: 1,
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}的完整世界设定。`,
    worldType: 'mixed',
    ...overrides,
  }
}

const unknownTagProfile = deriveCapabilityProfile('ctx_unknown_tags', worldConfig('未知标签世界', {
  essenceTag: 'custom-unknown-essence',
  powerSystemTag: 'custom-unknown-power',
  civilizationStage: 'custom-unknown-stage',
}))
assertOk(
  unknownTagProfile.capabilities.join(',') === 'space',
  'unknown custom labels must not be mistaken for confirmed life, society, technology, or supernatural capabilities',
)
assertOk(
  REQUIRED_CONTEXT_SUBSYSTEM_IDS.every((id) => unknownTagProfile.enabledSubsystemIds.includes(id)),
  'capability profiles must always merge every explicitly required runtime subsystem',
)
assertOk(
  new Set(unknownTagProfile.enabledSubsystemIds).size === unknownTagProfile.enabledSubsystemIds.length,
  'capability policy merging must remain stable and duplicate-free',
)
const historicalProfile = deriveCapabilityProfile(
  'ctx_historical',
  worldConfig('历史世界', { essenceTag: 'historical' }),
)
const postApocalypticProfile = deriveCapabilityProfile(
  'ctx_post_apocalyptic',
  worldConfig('末日世界', { essenceTag: 'postApocalyptic' }),
)
assertOk(
  historicalProfile.capabilities.includes('life') && postApocalypticProfile.capabilities.includes('life'),
  'live historical and postApocalyptic tags must retain confirmed life capability',
)
assertOk(
  ['campaign-root', 'region', 'settlement', 'scene', 'dream', 'digital', 'vehicle', 'abstract']
    .every((kind) => !contextKindUsesRegionMap(kind)),
  'aggregate, local, scene, dream, digital, vehicle, and abstract contexts must use the non-map initialization policy',
)
assertOk(
  ['world', 'universe', 'plane', 'galaxy', 'planet', 'continent']
    .every((kind) => contextKindUsesRegionMap(kind)),
  'only declared world-scale context kinds may request region-map initialization',
)

function snapshot(contextId, config, localEntityId = 'settlement-0') {
  return {
    contextId,
    rootSpatialNodeId: `${contextId}:space:root`,
    worldConfig: config,
    entities: [{
      id: localEntityId,
      name: `${config.name}城`,
      type: 'settlement',
      regionId: 'region-0',
      description: '测试聚落',
      attributes: {},
      tier: 'city',
      population: 1000,
      developmentLevel: 50,
    }],
    regions: [{
      id: 'region-0',
      name: `${config.name}区域`,
      templateType: '测试',
      temperature: 20,
      humidity: 50,
      terrainTag: 'plains',
      resourceDistribution: {},
      population: 1000,
      developmentLevel: 50,
    }],
    tags: WORLDVIEW_TAG_DEFAULTS.mixed,
  }
}

const legacyConfig = worldConfig('旧世界')
const migrated = sanitizeWorldStateSnapshot({
  worldConfig: legacyConfig,
  entities: snapshot('legacy', legacyConfig).entities,
  initialized: true,
  worldCode: 101,
  currentYear: 9,
  worldTags: ['旧世界事实'],
  eraStartYear: 1,
  eraName: '旧纪元',
  calibration: null,
  destinyPatternModifiers: {},
  worldInitAIStatus: null,
})

const migratedContextId = migrated.currentContextId
assertOk(typeof migratedContextId === 'string', 'legacy single-world save must migrate to one stable contextId')
assertOk(Object.keys(migrated.contexts ?? {}).length === 1, 'legacy migration must create exactly one initial context')
assertOk(migrated.contexts[migratedContextId].scope.scope === 'active', 'migrated initial context must be active')
assertOk(
  migrated.contexts[migratedContextId].entities[0].id.startsWith(`${migratedContextId}:entity:`),
  'legacy world entities must receive namespaced global IDs',
)

useWorldStore.setState(migrated)
const registry = getWorldContextRegistrySystem()
const spatial = getSpatialGraphSystem()
const transition = getContextTransitionSystem()
const scopePolicy = getSimulationScopePolicySystem()

const secondConfig = worldConfig('第二世界', { spatialForm: 'universe', powerSystemTag: 'technology' })
const secondResult = await createAdditionalWorldContext(secondConfig, {
  contextId: 'ctx_world_second',
  worldCode: 202,
  connectFromCurrent: true,
  makeActive: false,
  initialScope: 'dormant',
  globalTotalDays: 0,
})
const second = useWorldStore.getState().contexts[secondResult.contextId]
/*
 * 额外保留纯构造器覆盖：后面的第三上下文用于验证显式注册与回滚，不走工厂。
 */
const unusedPureConstructionEvidence = buildWorldContextInstance({
  contextId: 'ctx_world_second',
  config: secondConfig,
  snapshot: snapshot('ctx_world_second', secondConfig),
  worldCode: 202,
  calibration: null,
  worldTags: ['第二世界事实'],
  eraStartYear: 10,
  eraName: '星历',
  scope: 'dormant',
})
const first = useWorldStore.getState().contexts[migratedContextId]
const exit = Object.values(useWorldStore.getState().crossContextEdges).find((edge) => (
  edge.fromNodeId === first.record.rootSpatialNodeId
  && edge.toNodeId === second.record.rootSpatialNodeId
))

assertOk(Object.keys(useWorldStore.getState().contexts).length === 2, 'a second context must coexist without overwriting the first')
assertOk(unusedPureConstructionEvidence.record.id === second.record.id, 'world-init factory and pure context constructor must share the frozen ID contract')
assertOk(Boolean(exit), 'additional-world factory must create a validated cross-context exit when requested')
assertOk(
  first.entities[0].id !== unusedPureConstructionEvidence.entities[0].id,
  'identical local entity IDs in two contexts must not collide',
)
assertOk(!scopePolicy.canRunFullRound(second.record.id), 'dormant context must not run a full round')

const secondRootNode = structuredClone(second.spatialGraph.nodes[second.record.rootSpatialNodeId])
const secondNodeCount = Object.keys(second.spatialGraph.nodes).length
spatial.addNode(second.record.id, secondRootNode)
assertOk(
  Object.keys(useWorldStore.getState().contexts[second.record.id].spatialGraph.nodes).length === secondNodeCount,
  'adding an identical spatial node must be idempotent',
)
let conflictingNodeRejected = false
try {
  spatial.addNode(second.record.id, { ...secondRootNode, name: '冲突根节点' })
} catch {
  conflictingNodeRejected = true
}
assertOk(conflictingNodeRejected, 'a duplicate spatial node ID with different content must be rejected')

const invalidNodeBase = {
  id: `${second.record.id}:space:test-child`,
  contextId: second.record.id,
  kind: 'scene',
  name: '测试子节点',
  attributes: {},
}
let spatialMissingParentRejected = false
try {
  spatial.addNode(second.record.id, {
    ...invalidNodeBase,
    parentNodeId: `${second.record.id}:space:missing-parent`,
  })
} catch {
  spatialMissingParentRejected = true
}
assertOk(spatialMissingParentRejected, 'a spatial node parent must already exist in the same context')
let spatialSelfParentRejected = false
try {
  spatial.addNode(second.record.id, {
    ...invalidNodeBase,
    parentNodeId: invalidNodeBase.id,
  })
} catch {
  spatialSelfParentRejected = true
}
assertOk(spatialSelfParentRejected, 'a spatial node must not reference itself as parent')

const secondBeforeCycleProbe = structuredClone(useWorldStore.getState().contexts[second.record.id])
const cycleNodeA = {
  ...invalidNodeBase,
  id: `${second.record.id}:space:cycle-a`,
  parentNodeId: `${second.record.id}:space:cycle-b`,
}
const cycleNodeB = {
  ...invalidNodeBase,
  id: `${second.record.id}:space:cycle-b`,
  parentNodeId: cycleNodeA.id,
}
useWorldStore.getState().replaceContext({
  ...secondBeforeCycleProbe,
  spatialGraph: {
    ...secondBeforeCycleProbe.spatialGraph,
    nodes: {
      ...secondBeforeCycleProbe.spatialGraph.nodes,
      [cycleNodeA.id]: cycleNodeA,
      [cycleNodeB.id]: cycleNodeB,
    },
  },
})
let ancestorCycleRejected = false
try {
  spatial.addNode(second.record.id, {
    ...invalidNodeBase,
    parentNodeId: cycleNodeA.id,
  })
} catch {
  ancestorCycleRejected = true
} finally {
  useWorldStore.getState().replaceContext(secondBeforeCycleProbe)
}
assertOk(ancestorCycleRejected, 'a spatial node must reject an existing cyclic parent chain')

const secondLocalEdge = Object.values(second.spatialGraph.edges)[0]
assertOk(Boolean(secondLocalEdge), 'second context must provide a local edge for duplicate-ID validation')
if (secondLocalEdge) {
  spatial.addEdge(second.record.id, structuredClone(secondLocalEdge))
  let conflictingEdgeRejected = false
  try {
    spatial.addEdge(second.record.id, { ...secondLocalEdge, enabled: !secondLocalEdge.enabled })
  } catch {
    conflictingEdgeRejected = true
  }
  assertOk(conflictingEdgeRejected, 'a duplicate spatial edge ID with different content must be rejected')
}
if (exit) {
  spatial.addCrossContextExit(structuredClone(exit))
  let conflictingExitRejected = false
  try {
    spatial.addCrossContextExit({ ...exit, enabled: !exit.enabled })
  } catch {
    conflictingExitRejected = true
  }
  assertOk(conflictingExitRejected, 'a duplicate cross-context edge ID with different content must be rejected')
}

assertOk(useWorldStore.getState().setCurrentContext === undefined, 'world Store must not expose a direct current-context switch action')
assertOk(useWorldStore.getState().setContextScope === undefined, 'world Store must not expose a direct scope mutation action')
let directRegistrationSwitchRejected = false
try {
  useWorldStore.getState().registerContext(unusedPureConstructionEvidence, true)
} catch {
  directRegistrationSwitchRejected = true
}
assertOk(directRegistrationSwitchRejected, 'context registration must not bypass the owning transition system when an active context exists')
let directCurrentScopeDropRejected = false
try {
  useWorldStore.getState().replaceContext({
    ...first,
    scope: { ...first.scope, scope: 'dormant' },
  })
} catch {
  directCurrentScopeDropRejected = true
}
assertOk(directCurrentScopeDropRejected, 'generic context replacement must not demote the current active context')

const actorEntityId = 'character_test_global'
spatial.setEntityLocation({
  entityId: actorEntityId,
  contextId: second.record.id,
  nodeId: second.record.rootSpatialNodeId,
  updatedAtGlobalDay: 0,
})
spatial.setEntityLocation({
  entityId: actorEntityId,
  contextId: first.record.id,
  nodeId: first.record.rootSpatialNodeId,
  updatedAtGlobalDay: 0,
})
assertOk(
  !useWorldStore.getState().contexts[second.record.id].spatialGraph.entityLocations[actorEntityId],
  'setting a global entity location must clear its previous location in every other context',
)

const spoofedActor = await transition.transition({
  targetContextId: second.record.id,
  exitEdgeId: exit?.id,
  actorEntityId: 'character_spoofed',
}, 90, {
  actorEntityId,
  apply: () => true,
  rollback: () => {},
})
assertOk(!spoofedActor.ok && spoofedActor.record.status === 'rejected', 'transition must reject an actor that is not the trusted current character')

const missingCompanion = await transition.transition({
  targetContextId: second.record.id,
  exitEdgeId: exit?.id,
  actorEntityId,
  companionEntityIds: ['character_missing_companion'],
}, 90, {
  actorEntityId,
  apply: () => true,
  rollback: () => {},
})
assertOk(!missingCompanion.ok && missingCompanion.record.status === 'rejected', 'every companion and carried entity must be located in the source context before transition')

const committed = await transition.transition({
  targetContextId: second.record.id,
  exitEdgeId: exit?.id,
  actorEntityId,
  leaveScope: 'background',
}, 100, {
  actorEntityId,
  apply: () => true,
  rollback: () => {},
})

const afterCommit = useWorldStore.getState()
assertOk(committed.ok, 'valid connected transition must commit')
assertOk(afterCommit.currentContextId === second.record.id, 'committed transition must project the target context')
assertOk(afterCommit.contexts[migratedContextId].scope.scope === 'background', 'source context must retain the requested background scope')
assertOk(afterCommit.contexts[migratedContextId].record.lifecycle === 'open', 'background context must remain open instead of being mislabeled dormant')
assertOk(afterCommit.contexts[second.record.id].scope.scope === 'active', 'target context must become the only active scope')
assertOk(
  afterCommit.contexts[second.record.id].spatialGraph.entityLocations[actorEntityId]?.nodeId
    === second.record.rootSpatialNodeId,
  'actor global entity location must move to the target root',
)
assertOk(
  afterCommit.contexts[migratedContextId].record.localClock.totalLocalDays === 100,
  'source active local clock must settle against canonical global time before leaving',
)
assertOk(
  afterCommit.contexts[second.record.id].record.localClock.totalLocalDays === 0,
  'dormant target with paused local time must not replay inactive global days',
)

const thirdConfig = worldConfig('回滚世界')
const third = buildWorldContextInstance({
  contextId: 'ctx_world_rollback',
  config: thirdConfig,
  snapshot: snapshot('ctx_world_rollback', thirdConfig),
  worldCode: 303,
  calibration: null,
  scope: 'dormant',
})
registry.registerContext(third, false)
const rollbackExit = createCrossContextExit(afterCommit.contexts[second.record.id], third)
spatial.addCrossContextExit(rollbackExit)
const staleTimeRejected = await transition.transition({
  targetContextId: third.record.id,
  exitEdgeId: rollbackExit.id,
  actorEntityId,
}, 99, {
  actorEntityId,
  apply: () => true,
  rollback: () => {},
})
assertOk(!staleTimeRejected.ok && staleTimeRejected.record.status === 'rejected', 'transition must reject time earlier than the source or target canonical checkpoint')
let runtimeCharacterContextId = second.record.id
const rolledBack = await transition.transition({
  targetContextId: third.record.id,
  exitEdgeId: rollbackExit.id,
  actorEntityId,
}, 120, {
  actorEntityId,
  apply: () => {
    runtimeCharacterContextId = third.record.id
    return false
  },
  rollback: () => {
    runtimeCharacterContextId = second.record.id
  },
})
const afterRollback = useWorldStore.getState()
assertOk(!rolledBack.ok && rolledBack.record.status === 'rolled-back', 'runtime adapter failure must produce a rolled-back transition')
assertOk(afterRollback.currentContextId === second.record.id, 'failed runtime injection must restore the previous current context')
assertOk(afterRollback.contexts[third.record.id].scope.scope === 'dormant', 'failed transition must not leave target active')
assertOk(afterRollback.worldConfig?.name === secondConfig.name, 'failed transition must restore the legacy current-world projection')
assertOk(runtimeCharacterContextId === second.record.id, 'failed runtime injection must invoke the character/runtime rollback adapter')

let inferredCloseTimeRejected = false
try {
  closeWorldContext(third.record.id, '禁止推断关闭时间', Number.NaN)
} catch {
  inferredCloseTimeRejected = true
}
assertOk(inferredCloseTimeRejected, 'closing a context must require an explicit canonical globalTotalDays value')
closeWorldContext(third.record.id, '测试关闭', 120)
const rejected = await transition.transition({
  targetContextId: third.record.id,
  exitEdgeId: rollbackExit.id,
  actorEntityId,
}, 120, {
  actorEntityId,
  apply: () => true,
  rollback: () => {},
})
assertOk(!rejected.ok && rejected.record.status === 'rejected', 'closed target context must be rejected before mutation')

const transitionView = transition.collectState({}).data
assertOk(!('transitionHistory' in transitionView), 'collected transition state must not clone the complete persisted history every round')
assertOk(
  transitionView.transitionCount === useWorldStore.getState().transitionHistory.length,
  'collected transition state must expose the complete-history count without deleting the Store truth',
)
assertOk(transitionView.latestTransition?.id === rejected.record.id, 'collected transition state must expose the latest consumable result')

const serializedWorld = JSON.parse(JSON.stringify(useWorldStore.getState()))
const roundTrip = sanitizeWorldStateSnapshot(serializedWorld)
assertOk(Object.keys(roundTrip.contexts).length === 3, 'world save round-trip must preserve every context')
assertOk(roundTrip.currentContextId === second.record.id, 'world save round-trip must preserve currentContextId')
assertOk(roundTrip.contexts[migratedContextId].record.lifecycle === 'open', 'save migration must preserve background contexts as open lifecycle')
assertOk(roundTrip.transitionHistory.length === afterRollback.transitionHistory.length + 1, 'transition history must survive JSON round-trip without fixed-capacity loss')

const currentSetting = buildOrchestratorWorldSetting(secondConfig)
const aiWorldView = projectWorldSettingForNarrativeAI(currentSetting)
assertOk(currentSetting.contextId === second.record.id, 'orchestrator WorldSetting must use the stable current context ID')
assertOk(aiWorldView.当前上下文类型 === '宇宙', 'AI world view must expose a Chinese context-kind value')
assertOk(aiWorldView.当前模拟范围 === '当前完整模拟', 'AI world view must expose a Chinese scope value')
assertOk(!aiWorldView.当前世界能力.includes('technology'), 'AI capability enum values must not leak English protocol values')

assertOk(
  [...MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS].join(',') === 'character-base,lifespan,luck,morality',
  'P0 must not expand the four-system main-narrative write allowlist',
)
assertOk(SUBSYSTEM_FIELD_CONTRACTS['context-transition'].aiAuthority === 'proposal', 'context transition must be proposal-only for AI')
assertOk(SUBSYSTEM_FIELD_CONTRACTS['simulation-scope-policy'].aiAuthority === 'read-only', 'simulation scope must be AI read-only')

causalDelay.reset()
causalDelay.recordCausalEvent('promise', 'major', 1, 20, '当地承诺', undefined, undefined, {
  scope: 'context',
  contextId: second.record.id,
})
assertOk(!causalDelay.checkCausalTrigger(10000, third.record.id).hasTriggered, 'local causal event must not trigger in the wrong context')
assertOk(causalDelay.checkCausalTrigger(10000, second.record.id).hasTriggered, 'local causal event must remain triggerable in its own context')

foreshadowing.reset()
foreshadowing.detectForeshadowing(1, 20, [{ type: 'oath', description: '当地伏笔', priority: 10 }], second.record.id)
const roundContext = {
  contextId: second.record.id,
  contextScope: 'active',
  worldId: second.record.id,
  characterId: actorEntityId,
  round: { year: 1, season: 0, month: 0 },
  timeStep: { unit: 'year', value: 1 },
  difficulty: 'normal',
  subsystemStates: {},
  roundSequence: 100,
  daysPassed: 365,
  totalDays: 365,
}

const characterBase = new CharacterBaseSystem()
characterBase.applyChanges({
  id: 'character-base',
  description: '测试基础值',
  changes: { base: { physique: 10, mind: 10, talentAptitude: 10, charisma: 10 } },
}, roundContext)
characterBase.setContextModifier(second.record.id, '当地重力', { physique: 5 })
characterBase.setContextModifier(third.record.id, '当地重力', { physique: -2 })
const secondContextAttributes = characterBase.collectState(roundContext).data.current.physique
const thirdContextAttributes = characterBase.collectState({
  ...roundContext,
  contextId: third.record.id,
  worldId: third.record.id,
}).data.current.physique
assertOk(secondContextAttributes === 15, 'current-world character modifier must apply in its owning context')
assertOk(thirdContextAttributes === 8, 'switching contexts must recompute local modifiers without cross-world contamination')

foreshadowing.collectState(roundContext)
assertOk(!foreshadowing.buildForeshadowingText(third.record.id), 'local foreshadowing must not enter the wrong-world Prompt')
assertOk(foreshadowing.buildForeshadowingText(second.record.id).includes('当地伏笔'), 'local foreshadowing must remain visible in its own world')

const orchestratorSnapshot = JSON.parse(JSON.stringify(orchestrator.captureSnapshot()))
assertOk(orchestratorSnapshot.engineSubsystemStates?.['causal-delay'], 'orchestrator snapshot must persist causal internal state')
assertOk(orchestratorSnapshot.engineSubsystemStates?.foreshadowing, 'orchestrator snapshot must persist foreshadowing internal state')
causalDelay.reset()
foreshadowing.reset()
orchestrator.restoreSnapshot(orchestratorSnapshot)
assertOk(causalDelay.getCausalEvents().length === 1, 'serialized orchestrator snapshot must restore causal events')
assertOk(foreshadowing.getState().active.length === 1, 'serialized orchestrator snapshot must restore scoped foreshadowing')

let dormantCollisionRejected = false
try {
  registry.registerContext(third, false)
} catch {
  dormantCollisionRejected = true
}
assertOk(dormantCollisionRejected, 're-registering a dormant context ID must be rejected as a collision')

const contextCountBeforeReinitialize = Object.keys(useWorldStore.getState().contexts).length
const canonicalGlobalDay = 120
const reinitializedCurrent = await commitWorldInitialization(secondConfig, second.worldCode, 10, {
  globalTotalDays: canonicalGlobalDay,
})
assertOk(
  reinitializedCurrent.contextId === second.record.id,
  'world-select and world-customize initialization with the same worldCode must reuse the current contextId',
)
assertOk(
  Object.keys(useWorldStore.getState().contexts).length === contextCountBeforeReinitialize,
  'reinitializing the current context must not create a duplicate context',
)

const contextCountBeforeInvalidParents = Object.keys(useWorldStore.getState().contexts).length
let unknownCapabilityRejected = false
try {
  await createAdditionalWorldContext(worldConfig('非法能力场景'), {
    contextId: 'ctx_scene_invalid_capability',
    parentContextId: second.record.id,
    contextKind: 'scene',
    capabilities: ['life', 'unknown-capability'],
    connectFromCurrent: false,
    globalTotalDays: canonicalGlobalDay,
  })
} catch {
  unknownCapabilityRejected = true
}
assertOk(unknownCapabilityRejected, 'formal context creation must reject an unknown explicit capability')

let missingCanonicalTimeRejected = false
try {
  await createAdditionalWorldContext(worldConfig('缺少规范时间的场景'), {
    contextId: 'ctx_scene_missing_global_time',
    parentContextId: second.record.id,
    contextKind: 'scene',
    connectFromCurrent: false,
  })
} catch {
  missingCanonicalTimeRejected = true
}
assertOk(
  missingCanonicalTimeRejected,
  'creating an additional context must require globalTotalDays from the unique TimeSystem',
)

let missingParentRejected = false
try {
  await createAdditionalWorldContext(worldConfig('无父级场景'), {
    contextId: 'ctx_scene_missing_parent',
    parentContextId: 'ctx_missing_parent',
    contextKind: 'scene',
    connectFromCurrent: false,
    globalTotalDays: canonicalGlobalDay,
  })
} catch {
  missingParentRejected = true
}
assertOk(missingParentRejected, 'formal context creation must reject a missing parent context')

let selfParentRejected = false
try {
  await createAdditionalWorldContext(worldConfig('自引用场景'), {
    contextId: 'ctx_scene_self_parent',
    parentContextId: 'ctx_scene_self_parent',
    contextKind: 'scene',
    connectFromCurrent: false,
    globalTotalDays: canonicalGlobalDay,
  })
} catch {
  selfParentRejected = true
}
assertOk(selfParentRejected, 'formal context creation must reject a self-referencing parent')
assertOk(
  Object.keys(useWorldStore.getState().contexts).length === contextCountBeforeInvalidParents,
  'rejected parent contracts must not partially register a context',
)

const sceneCalendar = {
  calendarId: 'dream-cycle',
  displayName: '梦境轮转',
  daysPerYear: 40,
  monthsPerYear: 5,
  timeScale: 0.5,
  pausedWhenInactive: false,
}
const nestedSceneResult = await createAdditionalWorldContext(worldConfig('嵌套梦境', {
  essenceTag: 'custom-unknown-essence',
  powerSystemTag: 'custom-unknown-power',
  civilizationStage: 'custom-unknown-stage',
  _coherenceLocks: {
    essenceTag: true,
    civilizationStage: true,
    powerSystemTag: true,
    spatialForm: true,
  },
}), {
  contextId: 'ctx_dream_nested',
  parentContextId: second.record.id,
  contextKind: 'dream',
  localCalendar: sceneCalendar,
  capabilities: ['life', 'technology', 'life'],
  connectFromCurrent: false,
  makeActive: false,
  globalTotalDays: canonicalGlobalDay,
})
const nestedScene = useWorldStore.getState().contexts[nestedSceneResult.contextId]
assertOk(nestedScene.record.parentContextId === second.record.id, 'created context must preserve its validated parent')
assertOk(nestedScene.record.kind === 'dream', 'formal creation must preserve an explicitly declared contextKind')
assertOk(
  nestedScene.capabilityProfile.capabilities.join(',') === 'space,life,technology'
    && nestedScene.capabilityProfile.derivedFrom === 'confirmed-facts',
  'confirmed capabilities must override unknown labels, deduplicate values, and preserve required space capability',
)
assertOk(
  JSON.stringify(nestedScene.record.localCalendar) === JSON.stringify(sceneCalendar),
  'formal creation must preserve an explicitly declared localCalendar',
)
assertOk(
  nestedScene.record.createdAtGlobalDay === canonicalGlobalDay
    && nestedScene.record.localClock.lastGlobalTotalDays === canonicalGlobalDay,
  'new contexts must use the explicitly supplied canonical global day instead of resetting to day zero',
)
assertOk(
  nestedScene.regions.length === 0
    && nestedScene.entities.length === 0
    && Object.keys(nestedScene.spatialGraph.nodes).length === 1,
  'non-map contexts must initialize with only a spatial root and no forced regions or nations',
)

let parentCycleRejected = false
try {
  registry.validateContextParent(second.record.id, nestedScene.record.id)
} catch {
  parentCycleRejected = true
}
assertOk(parentCycleRejected, 'parent validation must reject a cycle through an existing descendant')

const collectedRegistryState = registry.collectState({
  ...roundContext,
  contextId: nestedScene.record.id,
  worldId: nestedScene.record.id,
})
collectedRegistryState.data.contexts[nestedScene.record.id].name = '外部篡改'
assertOk(
  useWorldStore.getState().contexts[nestedScene.record.id].record.name === '嵌套梦境',
  'collected registry state must be a deep copy of the owning Store',
)

const invalidHierarchySave = JSON.parse(JSON.stringify(useWorldStore.getState()))
invalidHierarchySave.contexts[nestedScene.record.id].record.parentContextId = 'ctx_missing_parent'
let invalidHierarchySaveRejected = false
try {
  sanitizeWorldStateSnapshot(invalidHierarchySave)
} catch {
  invalidHierarchySaveRejected = true
}
assertOk(invalidHierarchySaveRejected, 'save migration must reject a context whose declared parent is absent')

const localSetting = buildOrchestratorWorldSetting(nestedScene.worldConfig, {
  contextId: nestedScene.record.id,
  eraStartYear: 100,
  eraName: '梦历',
})
localSetting.simulationScope = 'active'
const localBoundaryGlobalDay = canonicalGlobalDay + 80
const localBoundaryNode = resolveNarrativeCalendarNode(localBoundaryGlobalDay, localSetting)
const previousLocalNode = resolveNarrativeCalendarNode(localBoundaryGlobalDay - 2, localSetting)
const localNarrativeTime = buildNarrativeTimeContext({
  ...roundContext,
  contextId: nestedScene.record.id,
  worldId: nestedScene.record.id,
  totalDays: localBoundaryGlobalDay,
  daysPassed: 2,
  timeStep: { unit: 'day', value: 1 },
  round: { ...roundContext.round, totalDays: localBoundaryGlobalDay },
}, localSetting)
assertOk(
  localBoundaryNode?.calendarYear === 101
    && localBoundaryNode.month === 1
    && localBoundaryNode.day === 1,
  'a non-365 local calendar must advance its displayed year exactly at its own year boundary',
)
assertOk(
  localNarrativeTime.calendarName === '梦境轮转'
    && localNarrativeTime.seasonName === '第1时节'
    && localNarrativeTime.usesCanonicalSolarSeasons === false,
  'Prompt time projection must expose the active context local calendar and neutral local season',
)
const localWorldView = projectWorldSettingForNarrativeAI(localSetting, localNarrativeTime)
assertOk(
  localWorldView.当前历法 === '梦境轮转'
    && !Object.hasOwn(localWorldView, '当前纪年')
    && !Object.hasOwn(localWorldView, '当前月份')
    && !Object.hasOwn(localWorldView, '当前季节')
    && localNarrativeTime.timeLabel.includes('101')
    && localNarrativeTime.timeLabel.includes('第1时节')
    && localNarrativeTime.timeLabel.includes('1月1日'),
  'stable AI world view must retain the local calendar identity while dynamic local time stays in the round layer',
)
const localCalendarHint = buildCanonicalCalendarNarrativeHint({
  timeStep: { unit: 'day', value: 1 },
  calendarYear: localNarrativeTime.calendarYear,
  calendarName: localNarrativeTime.calendarName,
  daysPerYear: localNarrativeTime.daysPerYear,
  monthsPerYear: localNarrativeTime.monthsPerYear,
  seasonName: localNarrativeTime.seasonName,
  usesCanonicalSolarSeasons: localNarrativeTime.usesCanonicalSolarSeasons,
  month: localNarrativeTime.month,
  day: localNarrativeTime.day,
  previousNode: previousLocalNode ? {
    calendarYear: previousLocalNode.calendarYear,
    month: previousLocalNode.month,
    day: previousLocalNode.day,
  } : undefined,
  daysPassed: previousLocalNode
    ? localNarrativeTime.localTotalDays - previousLocalNode.localTotalDays
    : undefined,
})
assertOk(
  localCalendarHint.includes('梦境轮转')
    && !localCalendarHint.includes('3—5月春季'),
  'non-canonical calendar guidance must not inject fixed solar month and season rules',
)
const localSeasonScaleHint = buildTimeScaleNarrativeHint(
  { unit: 'season', value: 1 },
  { usesCanonicalSolarSeasons: false, calendarName: '梦境轮转' },
)
assertOk(
  localSeasonScaleHint.includes('当地时节')
    && !localSeasonScaleHint.includes('三个月内'),
  'non-canonical season scale guidance must not silently fall back to a three-month solar quarter',
)

const closedContextIds = new Set([third.record.id])
const scopedNarratives = [
  { text: '当前当地完整故事', contextId: second.record.id, memoryScope: 'context' },
  { text: '无关当地完整故事', contextId: migratedContextId, memoryScope: 'context' },
  { text: '关闭世界当地故事', contextId: third.record.id, memoryScope: 'context' },
  { text: '全局身份故事', memoryScope: 'global' },
  { text: '跨界旅行故事', contextId: third.record.id, memoryScope: 'travel' },
]
const visibleNarratives = filterNarrativeRecordsForPrompt(scopedNarratives, {
  currentContextId: second.record.id,
  closedContextIds,
})
assertOk(
  visibleNarratives.map((entry) => entry.text).join('|')
    === '当前当地完整故事|全局身份故事|跨界旅行故事',
  'recent complete narratives must include current/global/travel scopes and exclude unrelated or closed local stories',
)
const scopedMemory = memoryLifecycle.buildRichPrompt(
  '',
  visibleNarratives.map((entry) => entry.text),
  {
    summaries: [
      { level: 1, startRound: 1, endRound: 1, content: '当前当地摘要', contextIds: [second.record.id] },
      { level: 1, startRound: 2, endRound: 2, content: '无关当地摘要', contextIds: [migratedContextId] },
      { level: 1, startRound: 3, endRound: 3, content: '关闭世界摘要', contextIds: [third.record.id] },
      { level: 1, startRound: 4, endRound: 4, content: '全局摘要' },
    ],
  },
  second.record.id,
  closedContextIds,
)
const scopedLongTermMemory = memoryLifecycle.formatLongTermMemoryForInjection(scopedMemory)
const scopedRecentMemory = memoryLifecycle.formatRecentNarrativesForInjection(scopedMemory)
assertOk(
  scopedLongTermMemory.includes('当前当地摘要')
    && scopedLongTermMemory.includes('全局摘要')
    && !scopedLongTermMemory.includes('无关当地摘要')
    && !scopedLongTermMemory.includes('关闭世界摘要'),
  'summary memory injection must exclude unrelated and closed local context content without deleting it',
)
assertOk(
  scopedRecentMemory.includes('当前当地完整故事')
    && scopedRecentMemory.includes('全局身份故事')
    && scopedRecentMemory.includes('跨界旅行故事')
    && !scopedRecentMemory.includes('无关当地完整故事'),
  'recent memory injection must preserve only the scoped complete narrative selection',
)

orchestrator.clearExternalSubsystems()
for (const id of MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS) {
  orchestrator.registerSubsystem({
    id,
    mod: 'mod-world',
    label: `测试子系统:${id}`,
    description: 'P0 save/restore focused test binding',
    collectState: () => ({ id, summary: '', data: {} }),
    applyChanges: () => {},
  })
}
useGlobalStore.getState().setAllModsLoaded(true)
useCharacterStore.setState({
  name: '存档往返角色',
  background: '用于 P0 多世界存档回归。',
  worldCode: useWorldStore.getState().worldCode,
})
useCharacterStore.getState().ensureCharacterId()
assertOk(ensureOrchestratorContextFromStores(), 'save round-trip setup must inject the current world into orchestrator')

const fullSavePayload = JSON.parse(JSON.stringify(collectGameSavePayload()))
const savedCurrentContextId = fullSavePayload.world.currentContextId
const savedContextCount = Object.keys(fullSavePayload.world.contexts).length
const savedTransitionCount = fullSavePayload.world.transitionHistory.length
const savedNestedClock = JSON.stringify(fullSavePayload.world.contexts[nestedScene.record.id].record.localClock)
useWorldStore.setState((state) => ({
  worldConfig: { ...state.worldConfig, name: '污染后的世界投影' },
  contexts: {
    ...state.contexts,
    [second.record.id]: {
      ...state.contexts[second.record.id],
      record: { ...state.contexts[second.record.id].record, name: '污染后的上下文' },
    },
  },
}))
useEngineStore.setState({ currentNarrative: '污染后的叙事状态' })
useCharacterStore.setState({ name: '污染后的角色' })
await applyGameSave(fullSavePayload)
assertOk(
  useWorldStore.getState().currentContextId === savedCurrentContextId
    && Object.keys(useWorldStore.getState().contexts).length === savedContextCount
    && useWorldStore.getState().transitionHistory.length === savedTransitionCount,
  'collectGameSavePayload -> applyGameSave must restore the full multi-context registry and transition history',
)
assertOk(
  JSON.stringify(useWorldStore.getState().contexts[nestedScene.record.id].record.localClock) === savedNestedClock,
  'real game save round-trip must preserve every context local clock',
)
assertOk(
  useCharacterStore.getState().name === '存档往返角色'
    && useEngineStore.getState().currentNarrative !== '污染后的叙事状态',
  'real game save round-trip must restore character and engine state together with world contexts',
)

useGlobalStore.getState().setGamePhase('world_build')
const beforeRejectedRestore = JSON.stringify(collectGameSavePayload())
const mismatchedSavePayload = JSON.parse(JSON.stringify(fullSavePayload))
mismatchedSavePayload.orchestrator.worldContextId = migratedContextId
let mismatchedSaveRejected = false
try {
  await applyGameSave(mismatchedSavePayload)
} catch {
  mismatchedSaveRejected = true
}
assertOk(mismatchedSaveRejected, 'save restore must reject an orchestrator snapshot from another context')
assertOk(
  JSON.stringify(collectGameSavePayload()) === beforeRejectedRestore,
  'failed multi-context restore must roll back engine, character, world and orchestrator as one bundle',
)
assertOk(
  useGlobalStore.getState().gamePhase === 'world_build',
  'failed save restore must not advance the player into simulation phase',
)

if (failed > 0) process.exit(1)
console.log('PASS: world-context-p0-smoke')
