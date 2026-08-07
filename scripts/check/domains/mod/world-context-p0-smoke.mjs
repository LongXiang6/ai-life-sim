/**
 * Purpose: Verify world-context registration, spatial shape, region transitions, and scope ownership.
 * Owner: quality:mod
 * Responsibility: One sequential world-context foundation acceptance scenario.
 */

import { buildDefaultCalibration } from '../../../../src/mods/mod-world/utils/calibration-clamp.ts'
import { WORLDVIEW_TAG_DEFAULTS } from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import { buildWorldContextInstance } from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import {
  closeWorldContext,
  connectWorldContexts,
  getCurrentRegion,
  getCurrentWorldContext,
  setCurrentRegion,
  transitionToWorldContext,
} from '../../../../src/mods/mod-world/world-context-api.ts'
import { getWorldContextRegistrySystem } from '../../../../src/mods/mod-world/subsystems/world-context-registry-system.ts'
import { getSpatialGraphSystem } from '../../../../src/mods/mod-world/subsystems/spatial-graph-system.ts'
import { getSimulationScopePolicySystem } from '../../../../src/mods/mod-world/subsystems/simulation-scope-policy-system.ts'
import { buildOrchestratorWorldSetting } from '../../../../src/mods/mod-engine/helpers/orchestrator-world-setting.ts'
import { projectWorldSettingForNarrativeAI } from '../../../../src/mods/mod-engine/helpers/narrative-ai-input-view.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

function assertThrows(action, message) {
  try {
    action()
    assertOk(false, message)
  } catch {
    assertOk(true, message)
  }
}

function worldConfig(name) {
  return {
    name,
    eraName: '统一纪元',
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
    spatialForm: 'layered-plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}的世界上下文验收设定。`,
    festivalScope: 'china-and-international',
    worldType: 'mixed',
  }
}

function region(id, name) {
  return {
    id,
    name,
    summary: `${name}的初始区域概况`,
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
    templateType: '验收区域',
    terrainTag: 'plains',
  }
}

function contextFixture(contextId, name, scope, parentContextId) {
  const config = worldConfig(name)
  return buildWorldContextInstance({
    contextId,
    config,
    snapshot: {
      contextId,
      rootSpatialNodeId: `${contextId}:space:root`,
      worldConfig: config,
      regions: [region('main', `${name}主区域`), region('north', `${name}北部区域`)],
      tags: WORLDVIEW_TAG_DEFAULTS.mixed,
    },
    worldCode: contextId === 'ctx_p0_root' ? 201 : contextId === 'ctx_p0_child' ? 202 : 203,
    calibration: buildDefaultCalibration(config),
    capabilities: ['space', 'life'],
    scope,
    parentContextId,
  })
}

function roundContext(contextId, totalDays = 20) {
  return {
    contextId,
    contextScope: contextId === 'ctx_p0_root' ? 'active' : 'dormant',
    worldId: contextId,
    characterId: 'character:p0-fixture',
    round: { year: 1, season: 1, month: 1 },
    timeStep: { unit: 'month', value: 1 },
    difficulty: 'normal',
    subsystemStates: {},
    roundSequence: 1,
    daysPassed: 20,
    totalDays,
  }
}

const root = contextFixture('ctx_p0_root', '根世界', 'active')
const child = contextFixture('ctx_p0_child', '子世界', 'dormant', root.record.id)
const closed = contextFixture('ctx_p0_closed', '封存世界', 'dormant')
const registry = getWorldContextRegistrySystem()
const spatial = getSpatialGraphSystem()
const scopePolicy = getSimulationScopePolicySystem()

useWorldStore.getState().reset()
registry.registerContext(root, true)
registry.registerContext(child, false)
registry.registerContext(closed, false)
assertOk(Object.keys(useWorldStore.getState().contexts).length === 3, 'context registry must retain all worlds without overwriting')
assertOk(
  registry.getContext(child.record.id)?.record.parentContextId === root.record.id,
  'context registry must preserve the validated parent hierarchy',
)
assertOk(
  getCurrentWorldContext()?.record.id === root.record.id
    && getCurrentRegion(root.record.id)?.name === '根世界主区域',
  'public world-context queries must project the active context and current region',
)

const rootGraph = useWorldStore.getState().contexts[root.record.id].spatialGraph
const rootNodeId = root.record.rootSpatialNodeId
const childRegionId = useWorldStore.getState().contexts[child.record.id].spatialGraph.currentRegionId
const extraNode = {
  id: `${root.record.id}:space:subregion`,
  contextId: root.record.id,
  parentNodeId: rootNodeId,
  kind: 'region',
  name: '根世界附属区域',
  localId: 'subregion',
  attributes: { templateType: '验收区域', terrainTag: 'coast' },
}
spatial.addNode(root.record.id, extraNode)
spatial.addEdge(root.record.id, {
  id: `${root.record.id}:edge:adjacent:subregion`,
  kind: 'adjacent',
  fromNodeId: rootGraph.currentRegionId,
  toNodeId: extraNode.id,
  bidirectional: true,
  enabled: true,
})
assertOk(
  Boolean(useWorldStore.getState().contexts[root.record.id].spatialGraph.nodes[extraNode.id]),
  'spatial graph must accept a validated region node and its relation edge',
)
assertThrows(
  () => spatial.addNode(root.record.id, { ...extraNode, name: '冲突节点' }),
  'spatial graph must reject replacing an existing node ID with different content',
)
assertThrows(
  () => spatial.addNode(root.record.id, { ...extraNode, id: `${root.record.id}:space:self`, parentNodeId: `${root.record.id}:space:self` }),
  'spatial graph must reject self-referencing parent nodes',
)
assertThrows(
  () => spatial.addEdge(root.record.id, {
    id: `${root.record.id}:edge:bad`,
    kind: 'route',
    fromNodeId: rootGraph.currentRegionId,
    toNodeId: 'ctx_p0_child:space:missing',
    bidirectional: false,
    enabled: true,
  }),
  'spatial graph must reject edges that cross contexts without a declared portal',
)

const exit = connectWorldContexts(root.record.id, child.record.id)
assertOk(exit.kind === 'portal', 'cross-context connection must be represented by a portal edge')
const transition = await transitionToWorldContext({
  targetContextId: child.record.id,
  targetRegionId: childRegionId,
  exitEdgeId: exit.id,
  leaveScope: 'background',
})
assertOk(transition.ok && transition.record.status === 'committed', 'valid context transition must commit once')
const transitioned = useWorldStore.getState()
assertOk(
  transitioned.currentContextId === child.record.id
    && transitioned.contexts[root.record.id].scope.scope === 'background'
    && transitioned.contexts[child.record.id].scope.scope === 'active'
    && transitioned.contexts[child.record.id].spatialGraph.currentRegionId === childRegionId,
  'transition must atomically switch active scope and target region',
)

setCurrentRegion(child.record.id, transitioned.contexts[child.record.id].spatialGraph.currentRegionId)
assertThrows(
  () => scopePolicy.setScope(child.record.id, 'dormant', '不允许直接降级当前上下文', 20),
  'scope policy must not demote the active context outside the transition owner',
)
scopePolicy.setScope(root.record.id, 'dormant', '测试休眠', 20)
assertOk(!scopePolicy.canRunFullRound(root.record.id), 'dormant context must not run the full round')

closeWorldContext(root.record.id, '测试关闭', 21)
assertOk(useWorldStore.getState().contexts[root.record.id].scope.scope === 'closed', 'non-current context can be closed explicitly')
const rejectedClosed = await transitionToWorldContext({
  targetContextId: root.record.id,
  exitEdgeId: exit.id,
})
assertOk(!rejectedClosed.ok && rejectedClosed.record.status === 'rejected', 'closed target context must be rejected before mutation')

const transitionState = getSpatialGraphSystem().collectState(roundContext(child.record.id))
assertOk(
  transitionState.data.currentRegionName === '子世界主区域'
    && transitionState.data.worldForm === 'layered-plane',
  'spatial graph state must expose world form and current region without entity-location state',
)
const setting = buildOrchestratorWorldSetting(
  useWorldStore.getState().contexts[child.record.id].worldConfig,
  { contextId: child.record.id },
)
const aiView = projectWorldSettingForNarrativeAI(setting)
assertOk(aiView.当前历法 === '统一游戏历法', 'narrative world view must use the fixed game calendar')
assertOk(aiView.当前上下文类型 === '世界' && aiView.当前模拟范围 === '当前完整模拟', 'narrative world view must expose Chinese context and scope labels')

if (failed > 0) {
  console.error(`world-context-p0-smoke failed: ${failed}`)
  process.exit(1)
}

console.log('PASS: world-context-p0-smoke')
