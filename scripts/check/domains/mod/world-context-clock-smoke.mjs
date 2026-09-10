/**
 * Purpose: Verify world-context local clocks consume annual base points and migrate day-only snapshots.
 * Owner: quality:mod
 * Responsibility: Local clock canonical cursor, derived dates, scope pause, and legacy migration.
 */

import assert from 'node:assert/strict'

import { buildDefaultCalibration } from '../../../../src/mods/mod-world/utils/calibration-clamp.ts'
import { WORLDVIEW_TAG_DEFAULTS } from '../../../../src/mods/mod-world/constants/world-tag-defaults.ts'
import {
  buildWorldContextInstance,
  syncLocalClock,
} from '../../../../src/mods/mod-world/utils/world-context-runtime.ts'
import { sanitizeWorldStateSnapshot } from '../../../../src/mods/mod-world/utils/world-state-migration.ts'

function config(name) {
  return {
    name,
    eraName: '基础点验收纪元',
    eraStartYear: 1,
    essenceTag: 'mixed',
    powerSystemTag: 'none',
    powerFramework: {
      id: 'fixture:clock',
      label: '无超常力量体系',
      enabled: false,
      progression: 'bounded',
      ranks: [],
      source: 'world-default',
    },
    spatialForm: 'layered-plane',
    civilizationStage: 'modern',
    difficulty: 'normal',
    description: `${name}基础点验收设定。`,
    festivalScope: 'china-and-international',
    worldType: 'mixed',
  }
}

function snapshot(contextId, worldConfig) {
  return {
    contextId,
    rootSpatialNodeId: `${contextId}:space:root`,
    worldConfig,
    regions: [],
    tags: WORLDVIEW_TAG_DEFAULTS.mixed,
  }
}

const worldConfig = config('本地时钟世界')
const active = buildWorldContextInstance({
  contextId: 'ctx_clock_active',
  config: worldConfig,
  snapshot: snapshot('ctx_clock_active', worldConfig),
  worldCode: 301,
  calibration: buildDefaultCalibration(worldConfig),
  scope: 'active',
  globalTotalBasePoints: 200,
})

assert.equal(active.record.createdAtGlobalBasePoints, 200)
assert.equal(active.record.createdAtGlobalDay, 73)
assert.deepEqual(active.record.localClock, {
  totalBasePoints: 0,
  lastGlobalTotalBasePoints: 200,
  totalLocalDays: 0,
  lastGlobalTotalDays: 73,
})

const activeAt500 = syncLocalClock(active, 500)
assert.equal(activeAt500.record.localClock.totalBasePoints, 300)
assert.equal(activeAt500.record.localClock.totalLocalDays, 109)
assert.equal(activeAt500.record.localClock.lastGlobalTotalBasePoints, 500)
assert.equal(activeAt500.record.localClock.lastGlobalTotalDays, 182)

const dormant = {
  ...activeAt500,
  scope: { ...activeAt500.scope, scope: 'dormant' },
}
const dormantAt800 = syncLocalClock(dormant, 800)
assert.equal(dormantAt800.record.localClock.totalBasePoints, 300)
assert.equal(dormantAt800.record.localClock.lastGlobalTotalBasePoints, 800)
assert.equal(dormantAt800.record.localClock.lastGlobalTotalDays, 292)

const background = {
  ...dormantAt800,
  scope: { ...dormantAt800.scope, scope: 'background' },
  record: {
    ...dormantAt800.record,
    localCalendar: { ...dormantAt800.record.localCalendar, pausedWhenInactive: false },
  },
}
const backgroundAt1000 = syncLocalClock(background, 1000)
assert.equal(backgroundAt1000.record.localClock.totalBasePoints, 500)
assert.equal(backgroundAt1000.record.localClock.totalLocalDays, 182)

const fractional = buildWorldContextInstance({
  contextId: 'ctx_clock_fractional',
  config: worldConfig,
  snapshot: snapshot('ctx_clock_fractional', worldConfig),
  worldCode: 302,
  calibration: buildDefaultCalibration(worldConfig),
  scope: 'active',
  globalTotalBasePoints: 0,
  localCalendar: {
    calendarId: 'fractional-clock',
    displayName: '慢速当地历法',
    daysPerYear: 365,
    monthsPerYear: 12,
    timeScale: 0.25,
    pausedWhenInactive: false,
  },
})
const fractionalAt1 = syncLocalClock(fractional, 1)
const fractionalAt2 = syncLocalClock(fractionalAt1, 2)
const fractionalAt4 = syncLocalClock(fractionalAt2, 4)
assert.equal(fractionalAt1.record.localClock.totalBasePoints, 0.25)
assert.equal(fractionalAt2.record.localClock.totalBasePoints, 0.5)
assert.equal(fractionalAt4.record.localClock.totalBasePoints, 1)

const legacy = structuredClone(active)
legacy.record.localClock = {
  totalLocalDays: 365,
  lastGlobalTotalDays: 730,
}
const legacySynced = syncLocalClock(legacy, 2200)
assert.equal(legacySynced.record.localClock.totalBasePoints, 1200)
assert.equal(legacySynced.record.localClock.lastGlobalTotalBasePoints, 2200)
assert.equal(legacySynced.record.localClock.totalLocalDays, 438)

const migrated = sanitizeWorldStateSnapshot({
  contexts: {
    [active.record.id]: {
      ...structuredClone(active),
      record: {
        ...structuredClone(active.record),
        localClock: { totalLocalDays: 365, lastGlobalTotalDays: 730 },
      },
    },
  },
  currentContextId: active.record.id,
  transitionHistory: [{
    id: 'legacy-transition',
    sourceContextId: active.record.id,
    targetContextId: active.record.id,
    sourceRegionId: active.spatialGraph.currentRegionId,
    targetRegionId: active.spatialGraph.currentRegionId,
    exitEdgeId: 'legacy',
    globalTotalDays: 365,
    sourceLocalDays: 10,
    targetLocalDays: 20,
    status: 'committed',
  }],
})
const migratedInstance = migrated.contexts[active.record.id]
assert.equal(migratedInstance.record.localClock.totalBasePoints, 1000)
assert.equal(migratedInstance.record.localClock.lastGlobalTotalBasePoints, 2000)
assert.equal(migrated.transitionHistory[0].globalTotalBasePoints, 1000)
assert.equal(migrated.transitionHistory[0].sourceLocalBasePoints, 27)

const legacyCapabilityInstance = structuredClone(active)
legacyCapabilityInstance.capabilityProfile = {
  ...legacyCapabilityInstance.capabilityProfile,
  capabilities: ['space', 'life', 'npc', 'economy', 'politics'],
  enabledSubsystemIds: ['npc-system', 'relationship-system'],
  backgroundSubsystemIds: ['npc-system'],
}
const migratedCapabilities = sanitizeWorldStateSnapshot({
  contexts: { [active.record.id]: legacyCapabilityInstance },
  currentContextId: active.record.id,
})
assert.deepEqual(
  migratedCapabilities.contexts[active.record.id].capabilityProfile.capabilities,
  ['space', 'life'],
)
assert.ok(
  !migratedCapabilities.contexts[active.record.id].capabilityProfile.enabledSubsystemIds.includes('npc-system'),
  'legacy NPC capability must not re-enable removed P2 subsystems during restore',
)

console.log('PASS: world-context-clock-smoke')
