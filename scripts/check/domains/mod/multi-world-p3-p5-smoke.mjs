/**
 * P3-P5 multi-world simulation acceptance: environment, progression, and life closure.
 */

import fs from 'node:fs'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { WORLDVIEW_TAG_DEFAULTS } from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import { buildDefaultCalibration } from '../../../../src/mods/mod-world/utils/calibration-clamp.ts'
import { buildWorldContextInstance } from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import { useWorldStore } from '../../../../src/mods/mod-world/store.ts'
import {
  moveWorldEntityLocation,
  registerWorldEntityReference,
} from '../../../../src/mods/mod-world/world-context-api.ts'
import { getWorldEntitySystem } from '../../../../src/mods/mod-world/subsystems/world-entity-system.ts'
import {
  getGeographySystem,
  getNaturalResourceSystem,
} from '../../../../src/mods/mod-environment-ecology/environment-simulation-api.ts'
import { projectWorldMap } from '../../../../src/mods/mod-world-map/map-projection.ts'
import {
  getAchievementSystem,
  getGrowthSystem,
  getReputationSystem,
} from '../../../../src/mods/mod-progression/progression-api.ts'
import { getHistoricalEventLedgerSystem } from '../../../../src/mods/mod-history-dynamics/historical-event-api.ts'
import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { getCharacterBaseSystem } from '../../../../src/mods/mod-character/subsystems/character-base-system.ts'
import { getLifespanSystem } from '../../../../src/mods/mod-character/subsystems/lifespan-system.ts'
import { getLifecycleSystem } from '../../../../src/mods/mod-character/subsystems/lifecycle-system.ts'
import { getHealthSystem } from '../../../../src/mods/mod-character/subsystems/health-system.ts'
import { syncSubsystemStoresFromStates } from '../../../../src/mods/mod-engine/helpers/subsystem-store-sync.ts'
import { buildOrchestratorWorldSetting } from '../../../../src/mods/mod-engine/helpers/orchestrator-world-setting.ts'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'

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
    powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
    spatialForm: 'plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}的 P3-P5 验收设定。`,
    worldType: 'mixed',
  }
}

function contextFixture(contextId, name, scope, resourceConsumptionModifier, worldCode) {
  const config = worldConfig(name)
  const calibration = buildDefaultCalibration(config)
  calibration.formulas = {
    ...calibration.formulas,
    resourceConsumptionModifier,
    lifespanModifier: 1,
  }
  return buildWorldContextInstance({
    contextId,
    config,
    snapshot: {
      contextId,
      rootSpatialNodeId: `${contextId}:space:root`,
      worldConfig: config,
      entities: [],
      regions: [{
        id: 'region-main',
        name: `${name}主区域`,
        templateType: '测试',
        temperature: 20,
        humidity: 50,
        terrainTag: 'plains',
        resourceDistribution: {},
        population: 100,
        developmentLevel: 10,
      }],
      tags: WORLDVIEW_TAG_DEFAULTS.mixed,
    },
    worldCode,
    calibration,
    capabilities: ['space', 'life', 'npc'],
    scope,
    localCalendar: {
      calendarId: 'canonical-365',
      displayName: '测试纪元',
      daysPerYear: 365,
      monthsPerYear: 12,
      timeScale: 1,
      pausedWhenInactive: false,
    },
  })
}

function roundContext(contextId, contextScope, characterId, totalDays, daysPassed, roundSequence) {
  return {
    contextId,
    contextScope,
    worldId: contextId,
    characterId,
    round: { year: Math.floor(totalDays / 365) + 1, season: 1, month: 1 },
    timeStep: { unit: 'year', value: 1 },
    difficulty: 'normal',
    subsystemStates: {},
    roundSequence,
    daysPassed,
    totalDays,
  }
}

const contextA = 'ctx_p3p5_a'
const contextB = 'ctx_p3p5_b'
const playerId = 'character:p3p5-player'
const instanceA = contextFixture(contextA, '潮汐世界', 'active', 2, 301)
const instanceB = contextFixture(contextB, '静谧世界', 'background', 0.5, 302)

useWorldStore.getState().reset()
getWorldEntitySystem().reset()
useWorldStore.getState().registerContext(instanceA, true)
useWorldStore.getState().registerContext(instanceB, false)
useWorldStore.getState().setCrossContextEdge({
  id: 'edge:p3p5:portal',
  kind: 'portal',
  fromNodeId: instanceA.record.rootSpatialNodeId,
  toNodeId: instanceB.record.rootSpatialNodeId,
  bidirectional: true,
  enabled: true,
})
registerWorldEntityReference({
  entityId: playerId,
  kind: 'player',
  displayName: '验收角色',
  contextIds: [contextA, contextB],
  registeredAtTotalDays: 0,
})
moveWorldEntityLocation({
  entityId: playerId,
  contextId: contextA,
  nodeId: instanceA.record.rootSpatialNodeId,
  updatedAtGlobalDay: 0,
})

const contextA0 = roundContext(contextA, 'active', playerId, 0, 0, 1)
const contextA10 = roundContext(contextA, 'active', playerId, 10, 10, 2)
const contextB10 = roundContext(contextB, 'background', playerId, 10, 10, 2)
const regionA = useWorldStore.getState().contexts[contextA].regions[0].id
const regionB = useWorldStore.getState().contexts[contextB].regions[0].id

// P3: geography/resource ownership and context-specific calibration.
const geography = getGeographySystem()
const resources = getNaturalResourceSystem()
geography.reset()
resources.reset()
geography.advance(contextA0)
resources.advance(contextA0)
resources.registerDeposit({
  depositId: 'resource:p3p5:a',
  contextId: contextA,
  nodeId: regionA,
  resourceTypeId: 'water',
  displayName: '潮汐淡水',
  unit: 'unit',
  quantity: 100,
  capacity: 100,
  renewable: false,
  baselineConsumptionPerDay: 1,
  totalDays: 0,
})
resources.registerDeposit({
  depositId: 'resource:p3p5:b',
  contextId: contextB,
  nodeId: regionB,
  resourceTypeId: 'water',
  displayName: '静谧淡水',
  unit: 'unit',
  quantity: 100,
  capacity: 100,
  renewable: false,
  baselineConsumptionPerDay: 1,
  totalDays: 0,
})
resources.advance(contextA10)

assertOk(
  resources.listDeposits(contextA)[0]?.quantity === 80
    && resources.listDeposits(contextB)[0]?.quantity === 95,
  'P3 resource advance must consume each context calibration instead of the active-world singleton',
)
assertOk(
  geography.listNodes(contextA).every((node) => node.contextId === contextA)
    && geography.listNodes(contextB).every((node) => node.contextId === contextB),
  'P3 geography must be partitioned by contextId + spatialNodeId',
)

const map = projectWorldMap({ contextId: contextA, totalDays: 10, observerEntityId: playerId })
assertOk(
  map.nodes.some((node) => node.nodeId === regionA && node.resources.some((item) => item.depositId === 'resource:p3p5:a'))
    && map.nodes.some((node) => node.nodeId === instanceB.record.rootSpatialNodeId)
    && map.edges.some((edge) => edge.edgeId === 'edge:p3p5:portal' && edge.crossContext),
  'P3 map projection must include owned geography/resources and connected cross-context nodes',
)
map.nodes[0].name = '被调用方修改'
if (map.nodes[0].resources[0]) map.nodes[0].resources[0].quantity = -1
const mapAgain = projectWorldMap({ contextId: contextA, totalDays: 10, observerEntityId: playerId })
assertOk(
  mapAgain.nodes[0].name !== '被调用方修改'
    && mapAgain.nodes.every((node) => node.resources.every((item) => item.quantity >= 0)),
  'P3 map projection must remain a detached read model instead of a second state owner',
)

// P4: growth/reputation scope and achievements derived only from committed history.
const ledger = getHistoricalEventLedgerSystem()
const growth = getGrowthSystem()
const achievement = getAchievementSystem()
const reputation = getReputationSystem()
ledger.reset()
growth.reset()
achievement.reset()
reputation.reset()
achievement.defineAchievement({
  achievementId: 'achievement:p3p5:committed',
  name: '留下确证',
  description: '完成一项已提交的世界事件。',
  points: 20,
  scopeKind: 'context',
  contextId: contextA,
  criteria: {
    eventTypes: ['p4-milestone'],
    tags: [],
    minimumCount: 1,
    requireCharacterParticipation: true,
  },
})
achievement.advance(contextA10)
assertOk(
  !achievement.listUnlocks(playerId).some((item) => item.achievementId === 'achievement:p3p5:committed'),
  'P4 achievements must not unlock before a matching fact is committed',
)

const milestoneCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'multi-world-p3-p5-smoke' },
  events: [{
    eventId: 'event:p3p5:milestone',
    eventType: 'p4-milestone',
    title: '完成跨域航路',
    description: '角色完成了已验证的跨域航路。',
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
    participants: [{ entityId: playerId, contextId: contextA, role: 'actor' }],
    tags: ['p4-milestone'],
  }],
}, { contextId: contextA, roundSequence: 2, totalDays: 10 })
assertOk(milestoneCommit.ok && milestoneCommit.eventIds.length === 1, 'P4 fixture history must commit atomically')
achievement.onHistoricalEventsCommitted(milestoneCommit.eventIds, contextA10)
assertOk(
  achievement.listUnlocks(playerId).some((item) => (
    item.achievementId === 'achievement:p3p5:committed'
      && item.evidenceEventIds[0] === milestoneCommit.eventIds[0]
  )),
  'P4 achievement unlock must retain the committed historical event ID as evidence',
)

growth.applyChanges({
  id: 'growth-system',
  targetObjectId: playerId,
  targetContextId: contextA,
  operation: 'learn-skill',
  description: '由已确认航路事件学会潮汐导航',
  changes: {
    name: '潮汐导航',
    category: '航行',
    description: '根据潮汐变化判断安全航路。',
    scopeKind: 'context',
    scopeContextIds: [contextA],
    potentialCap: 100,
  },
  evidenceEventIds: milestoneCommit.eventIds,
}, contextA10)
reputation.applyChanges({
  id: 'reputation',
  targetObjectId: playerId,
  targetContextId: contextA,
  operation: 'adjust',
  description: '当地居民认可航路成果',
  changes: { scopeKind: 'context', scopeContextId: contextA, dimension: '可靠', delta: 20 },
  evidenceEventIds: milestoneCommit.eventIds,
}, contextA10)
reputation.applyChanges({
  id: 'reputation',
  targetObjectId: playerId,
  targetContextId: contextA,
  operation: 'adjust',
  description: '跨世界档案认可航路成果',
  changes: { scopeKind: 'global', dimension: '开拓', delta: 10 },
  evidenceEventIds: milestoneCommit.eventIds,
}, contextA10)

assertOk(
  growth.collectState(contextA10).data.skills.length === 1
    && growth.collectState(contextB10).data.skills.length === 0,
  'P4 context-scoped growth must not leak into another world projection',
)
assertOk(
  reputation.collectState(contextA10).data.evaluations.length === 2
    && reputation.collectState(contextB10).data.evaluations.length === 1
    && reputation.collectState(contextB10).data.evaluations[0].scope.kind === 'global',
  'P4 reputation must separate context and global evaluator domains',
)

// P5: canonical age, lifespan death, dedicated history, persistence, and epilogue projection.
const characterBase = getCharacterBaseSystem()
const lifespan = getLifespanSystem()
const lifecycle = getLifecycleSystem()
const health = getHealthSystem()
useCharacterStore.getState().reset()
useCharacterStore.setState((state) => ({
  characterId: playerId,
  name: '验收角色',
  gender: 'other',
  background: '测试背景',
  characterBase: { ...state.characterBase, startingAge: 0 },
  lifespanDraft: {
    raceId: 'test-mortal',
    race: { name: '短生测试体', baseLifespanYears: 1, clockMode: 'aging', attrBaselines: {} },
    maximumLifespanYears: 1,
  },
}))
characterBase.reset()
characterBase.hydrateFromStore()
lifespan.reset()
lifecycle.reset()
health.reset()

const lifeStart = roundContext(contextA, 'active', playerId, 0, 0, 1)
const lifeEnd = roundContext(contextA, 'active', playerId, 365, 365, 2)
lifespan.advance(lifeStart)
lifecycle.advance(lifeStart)
health.advance(lifeStart)
lifespan.advance(lifeEnd)
lifecycle.advance(lifeEnd)
health.advance(lifeEnd)

const pendingDeath = health.getPendingDeath(playerId)
assertOk(
  lifespan.getProfile(playerId)?.maximumLifespanDays === 365
    && lifecycle.getEntity(playerId)?.ageDays === 365
    && pendingDeath?.causeKind === 'old-age',
  'P5 must derive age from canonical totalDays and create a pending old-age death at the explicit lifespan boundary',
)
assertThrows(
  () => health.capturePersistenceState(),
  'P5 health must reject persistence while death has no committed historical event',
)

const deathPlanner = new OrchestratorSystem()
deathPlanner.setContext(
  buildOrchestratorWorldSetting(worldConfig('潮汐世界'), { contextId: contextA }),
  {
    characterId: playerId,
    name: '验收角色',
    age: 1,
    gender: 'other',
    background: '测试背景',
    attributes: {},
  },
)
const deathPlan = deathPlanner.buildHistoricalNarrativeTransactionPlan(
  ledger,
  { narrative: '生命抵达边界。', digest: '角色寿终。', importance: 8, arcStatus: 'closed', changes: [] },
  [],
  pendingDeath,
)
const plannedDeaths = deathPlan?.batch.events?.filter((event) => event.eventType === 'character-death') ?? []
assertOk(
  plannedDeaths.length === 1
    && plannedDeaths[0].participants?.some((item) => item.entityId === playerId && item.role === 'deceased'),
  'P5 orchestrator settlement must append one dedicated character-death event for the pending entity',
)

const deathCommit = ledger.commitBatch({
  source: { kind: 'system', sourceId: 'multi-world-p3-p5-smoke-death' },
  events: [{
    eventId: 'event:p3p5:death',
    eventType: 'character-death',
    title: '人物离世',
    description: pendingDeath.causeLabel,
    scope: { kind: 'context', contextIds: [contextA] },
    status: 'occurred',
    participants: [{ entityId: playerId, contextId: contextA, role: 'deceased' }],
    tags: ['character-death', pendingDeath.causeKind],
  }],
}, { contextId: contextA, roundSequence: 2, totalDays: 365 })
assertOk(deathCommit.ok && deathCommit.eventIds.length === 1, 'P5 dedicated death history must commit')
health.onHistoricalEventsCommitted(deathCommit.eventIds, lifeEnd)
const committedHealth = health.capturePersistenceState()
const death = committedHealth.entities.find((item) => item.entityId === playerId)?.death
assertOk(
  death?.historicalEventId === deathCommit.eventIds[0]
    && death.epilogueStatus === 'pending'
    && !JSON.stringify(committedHealth).includes('pendingDeaths'),
  'P5 formal health snapshot must contain only the event-bound death and no pending-death side state',
)

const epilogueHealth = structuredClone(committedHealth)
const epilogueDeath = epilogueHealth.entities.find((item) => item.entityId === playerId)?.death
epilogueDeath.epilogueStatus = 'ready'
epilogueDeath.epilogueText = '潮声停下后，他留下的航路仍被后来者使用。'
health.restorePersistenceState(epilogueHealth)
syncSubsystemStoresFromStates({
  lifespan: lifespan.collectState(lifeEnd),
  'lifecycle-system': lifecycle.collectState(lifeEnd),
  health: health.collectState(lifeEnd),
})
assertOk(
  useCharacterStore.getState().health.death?.epilogueText === epilogueDeath.epilogueText
    && useCharacterStore.getState().health.alive === false,
  'P5 committed epilogue must project from the health owner into the current game-over UI state',
)

const root = getProjectRoot(import.meta.url)
const campaignSource = fs.readFileSync(path.join(root, 'src/mods/mod-engine/campaigns/default/index.ts'), 'utf8')
const gameOverSource = fs.readFileSync(path.join(root, 'src/mods/mod-pages/pages/game-over/page.tsx'), 'utf8')
assertOk(
  campaignSource.indexOf("name: 'epilogue-check'") < campaignSource.indexOf("name: 'compress-save'")
    && gameOverSource.includes('death?.epilogueText?.trim()')
    && gameOverSource.includes('committedEpilogueReview ?? endingReview ?? localEndingReview'),
  'P5 current campaign must settle epilogue before save and game-over must prefer the committed health epilogue',
)

const retiredOwnerPatterns = [
  /post-death-epilogue-system/u,
  /attribute-decay-system/u,
  /life-stage-system/u,
  /world-map-system/u,
  /personal-ability-system/u,
  /skill-system/u,
]
const liveDirectories = [
  'src/mods/mod-character',
  'src/mods/mod-environment-ecology',
  'src/mods/mod-progression',
  'src/mods/mod-world-map',
  'src/mods/mod-engine/helpers/mvp-stages-config.default.json',
]
const visit = (absolutePath) => {
  const stat = fs.statSync(absolutePath)
  if (stat.isFile()) return [absolutePath]
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory()
      ? visit(path.join(absolutePath, entry.name))
      : /\.(?:ts|tsx|json)$/u.test(entry.name) ? [path.join(absolutePath, entry.name)] : []
  ))
}
const liveSource = liveDirectories
  .flatMap((relativePath) => visit(path.join(root, relativePath)))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')
assertOk(
  retiredOwnerPatterns.every((pattern) => !pattern.test(liveSource)),
  'P3-P5 retired owners must have zero live source, registration, and runtime-policy references',
)

if (failed > 0) {
  console.error(`multi-world-p3-p5-smoke failed: ${failed}`)
  process.exit(1)
}

console.log('multi-world-p3-p5-smoke passed')
