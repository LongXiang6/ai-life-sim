/**
 * Purpose: Verify multi-world spatial graphs and the single regional-profile owner.
 * Owner: quality:mod
 * Responsibility: One sequential world-shape and region-profile acceptance scenario.
 */

import { buildDefaultCalibration } from '../../../../src/mods/mod-world/utils/calibration-clamp.ts'
import { buildWorldContextInstance } from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import { WORLDVIEW_TAG_DEFAULTS } from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import {
  connectWorldContexts,
  getCurrentRegion,
  setCurrentRegion,
} from '../../../../src/mods/mod-world/world-context-api.ts'
import { getSpatialGraphSystem } from '../../../../src/mods/mod-world/subsystems/spatial-graph-system.ts'

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
    description: `${name}的空间区域验收设定。`,
    worldType: 'mixed',
  }
}

function region(id, name, summary) {
  return {
    id,
    name,
    summary,
    climate: '温和',
    ecology: '河谷生态',
    resources: ['淡水'],
    pollution: '低',
    economy: '小规模贸易',
    population: '人口稀疏',
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

function contextFixture(contextId, name, scope, regions) {
  const config = worldConfig(name)
  return buildWorldContextInstance({
    contextId,
    config,
    snapshot: {
      contextId,
      rootSpatialNodeId: `${contextId}:space:root`,
      worldConfig: config,
      regions,
      tags: WORLDVIEW_TAG_DEFAULTS.mixed,
    },
    worldCode: contextId === 'ctx_region_a' ? 101 : 102,
    calibration: buildDefaultCalibration(config),
    capabilities: ['space'],
    scope,
  })
}

function roundContext(contextId, totalDays = 12) {
  const totalBasePoints = Math.ceil(totalDays * 1000 / 365)
  return {
    contextId,
    contextScope: contextId === 'ctx_region_a' ? 'active' : 'background',
    worldId: contextId,
    characterId: 'character:region-fixture',
    round: { year: 1, season: 1, month: 1 },
    timeStep: { unit: 'event', value: 12 },
    difficulty: 'normal',
    subsystemStates: {},
    roundSequence: 1,
    basePointsPassed: totalBasePoints,
    totalBasePoints,
    daysPassed: totalDays,
    totalDays,
  }
}

const contextA = contextFixture('ctx_region_a', '潮汐世界', 'active', [
  region('region-a', '潮汐镇', '靠近河口的交通小镇'),
  region('region-a-hills', '北岭', '沿河向北的丘陵地带'),
])
const contextB = contextFixture('ctx_region_b', '静谧世界', 'dormant', [
  region('region-b', '静谧镇', '被林地包围的安静聚落'),
])

useWorldStore.getState().reset()
useWorldStore.getState().registerContext(contextA, true)
useWorldStore.getState().registerContext(contextB, false)
const exit = connectWorldContexts(contextA.record.id, contextB.record.id)
const spatial = getSpatialGraphSystem()
const stateA = roundContext(contextA.record.id)
const graphA = useWorldStore.getState().contexts[contextA.record.id].spatialGraph
const currentRegionId = graphA.currentRegionId
const otherRegionId = Object.keys(graphA.regionProfiles).find((id) => id !== currentRegionId)

assertOk(exit.kind === 'portal', 'cross-context connection must remain a spatial portal')
assertOk(graphA.worldForm === 'plane', 'spatial graph must own the world form')
assertOk(Boolean(otherRegionId), 'fixture must contain a second region for current-region validation')

const collected = spatial.collectState(stateA)
assertOk(
  collected.data.currentRegionName === '潮汐镇'
    && collected.data.currentRegionProfile?.regionId === currentRegionId
    && collected.data.currentRegionProfile?.summary === '靠近河口的交通小镇',
  'collectState must expose the current region name and complete regional profile',
)
assertOk(
  collected.data.regionProfiles[currentRegionId].climate === '温和'
    && collected.data.regionProfiles[currentRegionId].resources[0] === '淡水',
  'regional profile must include the merged climate, ecology, resource, and social fields',
)

spatial.applyChanges({
  id: 'spatial-graph',
  targetObjectId: currentRegionId,
  targetContextId: contextA.record.id,
  operation: 'update-region-profile',
  description: '宏观影响更新当前区域概况',
  changes: {
    summary: '河口商路因春汛变得繁忙',
    economy: '季节性贸易活跃',
    resources: ['淡水', '盐'],
  },
}, stateA)

const afterUpdate = useWorldStore.getState().contexts[contextA.record.id]
const updatedProfile = afterUpdate.spatialGraph.regionProfiles[currentRegionId]
assertOk(
  updatedProfile.summary === '河口商路因春汛变得繁忙'
    && updatedProfile.economy === '季节性贸易活跃'
    && updatedProfile.resources.join(',') === '淡水,盐'
    && updatedProfile.updatedAtGlobalDay === stateA.totalDays,
  'update-region-profile must write only the current region profile with the canonical day',
)
assertOk(
  afterUpdate.regions[0].summary === '靠近河口的交通小镇',
  'initial regions must remain an initialization snapshot rather than a second writable owner',
)
assertOk(
  getCurrentRegion(contextA.record.id)?.summary === updatedProfile.summary,
  'public current-region query must read from spatialGraph.regionProfiles',
)

if (otherRegionId) {
  assertThrows(
    () => spatial.applyChanges({
      id: 'spatial-graph',
      targetObjectId: otherRegionId,
      targetContextId: contextA.record.id,
      operation: 'update-region-profile',
      description: '不应更新非当前区域',
      changes: { summary: '越权更新' },
    }, stateA),
    'region profile updates must reject non-current regions',
  )
}
assertThrows(
  () => spatial.applyChanges({
    id: 'spatial-graph',
    targetObjectId: currentRegionId,
    targetContextId: 'ctx_region_b',
    operation: 'update-region-profile',
    description: '不应跨上下文写入',
    changes: { summary: '跨上下文' },
  }, stateA),
  'region profile updates must reject a mismatched target context',
)
assertThrows(
  () => spatial.applyChanges({
    id: 'spatial-graph',
    targetObjectId: currentRegionId,
    targetContextId: contextA.record.id,
    operation: 'update-region-profile',
    description: '不应写入未知字段',
    changes: { exactCoordinates: '1,2' },
  }, stateA),
  'region profile updates must reject precise-location fields and unknown fields',
)

if (otherRegionId) {
  setCurrentRegion(contextA.record.id, otherRegionId)
  const switched = spatial.collectState({ ...stateA, totalDays: 20 })
  assertOk(
    switched.data.currentRegionName === '北岭'
      && switched.data.currentRegionProfile?.regionId === otherRegionId,
    'changing regions must update the current-region projection without creating a precise player location',
  )
}

const detached = spatial.collectState(stateA)
detached.data.currentRegionProfile.summary = '调用方修改不应回写'
assertOk(
  spatial.collectState(stateA).data.currentRegionProfile.summary !== '调用方修改不应回写',
  'collectState must return detached regional data',
)
assertOk(
  Object.keys(useWorldStore.getState().contexts[contextB.record.id].spatialGraph.regionProfiles).length === 1,
  'regional profiles must remain isolated between world contexts',
)

if (failed > 0) {
  console.error(`multi-world-p3-p5-smoke failed: ${failed}`)
  process.exit(1)
}

console.log('multi-world-p3-p5-smoke passed')
