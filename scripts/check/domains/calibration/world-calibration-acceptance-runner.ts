/**
 * @module world-calibration-acceptance-runner.ts
 * @description 蓝图 §15 验收场景 —— 规则默认校准（buildDefaultCalibration）断言
 * 纯逻辑，不调用 AI API。由 world-calibration-acceptance.mjs 调用。
 */

import assert from 'node:assert/strict'

import {
  buildDefaultCalibration,
} from '@/mods/mod-world/utils/calibration-clamp'

import { baseConfig, formula } from './world-calibration-test-helpers'

/** §15 场景 1：史前 primitive */
function testPrehistoricPrimitive() {
  const cal = buildDefaultCalibration(
    baseConfig({ civilizationStage: 'primitive', essenceTag: 'historical' }),
  )
  const strategy = cal.formulas?.eventDistributionStrategy

  assert.equal(strategy, 'prehistoric', 'strategy 应为 prehistoric')
  assert.ok(
    (cal.world?.populationBase ?? Infinity) <= 500,
    `populationBase 应 ≤500，实际 ${cal.world?.populationBase}`,
  )
  assert.ok(
    formula(cal, 'birthRateModifier') < 0.8,
    `birthRateModifier 应 <0.8，实际 ${formula(cal, 'birthRateModifier')}`,
  )
  assert.ok(
    formula(cal, 'techProgressModifier') < 0.5,
    `techProgressModifier 应 <0.5，实际 ${formula(cal, 'techProgressModifier')}`,
  )
  assert.ok(
    formula(cal, 'migrationRateModifier') < 1,
    `migrationRateModifier 应 <1（低迁移），实际 ${formula(cal, 'migrationRateModifier')}`,
  )
  assert.ok(
    formula(cal, 'conflictEscalationModifier') < 1,
    `conflictEscalationModifier 应 <1，实际 ${formula(cal, 'conflictEscalationModifier')}`,
  )
  assert.ok(
    formula(cal, 'literacyGrowthModifier') <= 0.5,
    `literacyGrowthModifier 应 ≤0.5，实际 ${formula(cal, 'literacyGrowthModifier')}`,
  )
  assert.ok(
    formula(cal, 'causalCaptureRate') < 1,
    `causalCaptureRate 应 <1，实际 ${formula(cal, 'causalCaptureRate')}`,
  )
}

/** §15 场景 2：丧尸末日 postApocalyptic */
function testPostApocalyptic() {
  const cal = buildDefaultCalibration(
    baseConfig({ essenceTag: 'postApocalyptic', civilizationStage: 'modern' }),
  )
  const strategy = cal.formulas?.eventDistributionStrategy

  assert.equal(strategy, 'apocalyptic', 'strategy 应为 apocalyptic')
  assert.ok(
    (cal.world?.populationBase ?? Infinity) <= 500,
    `populationBase 应偏低（≤500），实际 ${cal.world?.populationBase}`,
  )
  assert.ok(formula(cal, 'deathRateModifier') > 1, 'deathRateModifier 应 >1')
  assert.ok(formula(cal, 'monsterThreatModifier') > 1, 'monsterThreatModifier 应 >1')
  assert.ok(
    formula(cal, 'resourceConsumptionModifier') > 1,
    'resourceConsumptionModifier 应 >1',
  )
  assert.ok(
    formula(cal, 'incomeModifier') < 1,
    `incomeModifier 应 <1（末日低收入），实际 ${formula(cal, 'incomeModifier')}`,
  )
}

/** §15 场景 3：星际 scifi + space */
function testScifiSpace() {
  const cal = buildDefaultCalibration(
    baseConfig({
      essenceTag: 'scifi',
      civilizationStage: 'space',
      powerSystemTag: 'technology',
      spatialForm: 'crystalSphere',
    }),
  )

  assert.ok(
    (cal.world?.populationBase ?? 0) >= 500_000,
    `populationBase 应 ≥500000，实际 ${cal.world?.populationBase}`,
  )
  assert.equal(cal.world?.mapTemplate, 'starSystems', 'mapTemplate 应为 starSystems')
  assert.ok(
    formula(cal, 'techProgressModifier') > 2.0,
    `techProgressModifier 应 >2.0，实际 ${formula(cal, 'techProgressModifier')}`,
  )
  assert.ok(
    formula(cal, 'industryProductivityModifier') > 1.5,
    `industryProductivityModifier 应 >1.5，实际 ${formula(cal, 'industryProductivityModifier')}`,
  )
}

/** §15 场景 4：修仙 cultivation */
function testCultivationMystical() {
  const cal = buildDefaultCalibration(
    baseConfig({
      essenceTag: 'cultivation',
      powerSystemTag: 'cultivation',
      civilizationStage: 'medieval',
    }),
  )
  const strategy = cal.formulas?.eventDistributionStrategy

  assert.equal(strategy, 'mystical', 'strategy 应为 mystical')
  assert.ok(
    formula(cal, 'cultivationSpeedModifier') > 1.5,
    `cultivationSpeedModifier 应 >1.5，实际 ${formula(cal, 'cultivationSpeedModifier')}`,
  )
  assert.ok(
    formula(cal, 'bottleneckModifier') > 1.2,
    `bottleneckModifier 应 >1.2，实际 ${formula(cal, 'bottleneckModifier')}`,
  )
  assert.ok(
    formula(cal, 'socialMobilityModifier') < 1.0,
    `socialMobilityModifier 应 <1.0（固化），实际 ${formula(cal, 'socialMobilityModifier')}`,
  )
}

function main() {
  testPrehistoricPrimitive()
  testPostApocalyptic()
  testScifiSpace()
  testCultivationMystical()
  console.log('[OK] world-calibration acceptance (§15) — 4 scenarios passed')
}

main()
