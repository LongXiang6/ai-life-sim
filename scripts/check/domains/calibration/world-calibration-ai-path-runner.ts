/**
 * @module world-calibration-ai-path-runner.ts
 * @description Step 0 AI 路径测试 —— mock JSON + Zod + clampCalibration（不调用 AI API）
 */

import assert from 'node:assert/strict'

import { MODIFIER_MAX, MODIFIER_MIN } from '@/mods/mod-world/utils/calibration-clamp'

import {
  baseConfig,
  formula,
  simulateAiCalibrationPath,
} from './world-calibration-test-helpers'

/** 稀疏 AI 输出：仅覆盖偏离项，其余保留 buildDefaultCalibration 基线 */
function testSparseMergeRetainsDefaults() {
  const config = baseConfig({ civilizationStage: 'medieval', essenceTag: 'historical' })
  const { zodOk, clamped } = simulateAiCalibrationPath(
    { formulas: { inflationModifier: 1.4 } },
    config,
  )

  assert.equal(zodOk, true)
  assert.equal(formula(clamped, 'inflationModifier'), 1.4)
  assert.equal(formula(clamped, 'birthRateModifier'), 1, '未输出字段应保持默认 1.0')
  assert.equal(clamped.formulas?.eventDistributionStrategy, 'political')
}

/** Zod 范围外 modifier：parse 失败时仍走 clamp 截断 */
function testModifierClampWhenZodRejects() {
  const config = baseConfig()
  const { zodOk, clamped } = simulateAiCalibrationPath(
    { formulas: { birthRateModifier: 250 } },
    config,
  )

  assert.equal(zodOk, false, '超出 Zod max 应 parse 失败')
  assert.equal(formula(clamped, 'birthRateModifier'), MODIFIER_MAX)
}

function testModifierClampLowBound() {
  const config = baseConfig()
  const { clamped } = simulateAiCalibrationPath(
    { formulas: { deathRateModifier: 0.001 } },
    config,
  )
  assert.equal(formula(clamped, 'deathRateModifier'), MODIFIER_MIN)
}

/** 非法 strategy / mapTemplate 回退 */
function testInvalidEnumFallback() {
  const config = baseConfig({ essenceTag: 'cultivation' })
  const { clamped } = simulateAiCalibrationPath(
    {
      formulas: { eventDistributionStrategy: 'not_a_real_strategy' as never },
      world: { mapTemplate: 'invalid_map' as never },
    },
    config,
  )

  assert.equal(clamped.formulas?.eventDistributionStrategy, 'balanced')
  assert.equal(clamped.world?.mapTemplate, 'flatDiscWorld', '非法 mapTemplate 回退 inferMapTemplate')
}

/** entities 范围 clamp + min≤max 修正 */
function testEntityRangeClamp() {
  const config = baseConfig()
  const { clamped } = simulateAiCalibrationPath(
    {
      entities: {
        nationCount: { min: 20, max: 5 },
        factionCount: { min: -1, max: 99 },
      },
    },
    config,
  )

  assert.ok((clamped.entities?.nationCount?.min ?? 0) <= (clamped.entities?.nationCount?.max ?? 0))
  assert.ok((clamped.entities?.factionCount?.max ?? 0) <= 15)
}

/** 空 / null 输入降级为纯规则默认 */
function testNullRawFallback() {
  const config = baseConfig({ civilizationStage: 'primitive' })
  const { clamped } = simulateAiCalibrationPath(null, config)

  assert.equal(clamped.formulas?.eventDistributionStrategy, 'prehistoric')
  assert.equal(clamped.scale.populationTotal, '1000000')
}

/** §15 场景：mock AI 稀疏 JSON（修仙） */
function testAiPathCultivationScenario() {
  const config = baseConfig({
    essenceTag: 'cultivation',
    powerSystemTag: 'cultivation',
    civilizationStage: 'medieval',
  })

  const mockAiOutput = {
    metadata: {
      essenceTag: 'cultivation',
      civilizationStage: 'medieval',
      powerSystemTag: 'cultivation',
      spatialForm: 'universe',
      difficulty: 'normal',
    },
    formulas: {
      eventDistributionStrategy: 'mystical',
      cultivationSpeedModifier: 2.2,
      bottleneckModifier: 1.35,
      socialMobilityModifier: 0.65,
    },
    world: {
      mapTemplate: 'flatDiscWorld',
    },
  }

  const { zodOk, clamped } = simulateAiCalibrationPath(mockAiOutput, config)
  assert.equal(zodOk, true)
  assert.equal(clamped.formulas?.eventDistributionStrategy, 'mystical')
  assert.ok(formula(clamped, 'cultivationSpeedModifier') > 1.5)
  assert.ok(formula(clamped, 'bottleneckModifier') > 1.2)
  assert.ok(formula(clamped, 'socialMobilityModifier') < 1.0)
}

/** §15 场景：mock AI 稀疏 JSON（星际）覆盖 space 基线 */
function testAiPathScifiSpaceScenario() {
  const config = baseConfig({
    essenceTag: 'scifi',
    civilizationStage: 'space',
    powerSystemTag: 'technology',
    spatialForm: 'crystalSphere',
  })

  const mockAiOutput = {
    world: {
      mapTemplate: 'starSystems',
      regionCount: 12,
    },
    scale: {
      populationTotal: '800000000000',
      annualEconomicOutput: '64000000000000000',
    },
    formulas: {
      techProgressModifier: 3.0,
      industryProductivityModifier: 2.2,
      eventDistributionStrategy: 'cosmic_epic',
    },
  }

  const { zodOk, clamped } = simulateAiCalibrationPath(mockAiOutput, config)
  assert.equal(zodOk, true)
  assert.equal(clamped.scale.populationTotal, '800000000000')
  assert.equal(clamped.scale.annualEconomicOutput, '64000000000000000')
  assert.equal(clamped.world?.mapTemplate, 'starSystems')
  assert.ok(formula(clamped, 'techProgressModifier') > 2.0)
  assert.ok(formula(clamped, 'industryProductivityModifier') > 1.5)
}

/** AI 输出含 passthrough 额外字段不阻断流程 */
function testPassthroughExtraFields() {
  const config = baseConfig()
  const { zodOk, clamped } = simulateAiCalibrationPath(
    { unknownFutureField: 'ignored', formulas: { tradeMultiplierModifier: 1.1 } },
    config,
  )

  assert.equal(zodOk, true)
  assert.equal(formula(clamped, 'tradeMultiplierModifier'), 1.1)
}

/** Phase 4-B：incomeModifier 稀疏 AI 输出 */
function testPhase4BIncomeModifier() {
  const config = baseConfig({ essenceTag: 'postApocalyptic', civilizationStage: 'modern' })
  const { zodOk, clamped } = simulateAiCalibrationPath(
    { formulas: { incomeModifier: 0.5 } },
    config,
  )

  assert.equal(zodOk, true)
  assert.equal(formula(clamped, 'incomeModifier'), 0.5)
  assert.ok(
    formula(clamped, 'incomeModifier') < 1,
    '末日 AI 覆盖后 incomeModifier 应可 <1',
  )
}

/** Phase 4-B：incomeModifier 稀疏 AI 输出 */
function testPhase4ModifierWiring() {
  const config = baseConfig({ civilizationStage: 'industrial', essenceTag: 'historical' })
  const { zodOk, clamped } = simulateAiCalibrationPath(
    {
      formulas: {
        migrationRateModifier: 1.5,
        literacyGrowthModifier: 1.8,
      },
    },
    config,
  )

  assert.equal(zodOk, true)
  assert.equal(formula(clamped, 'migrationRateModifier'), 1.5)
  assert.equal(formula(clamped, 'literacyGrowthModifier'), 1.8)
}

/** Phase 4-C：conflictEscalationModifier */
function testPhase4CConflictEscalationModifier() {
  const config = baseConfig({ essenceTag: 'historical', civilizationStage: 'medieval' })
  const { zodOk, clamped } = simulateAiCalibrationPath(
    { formulas: { conflictEscalationModifier: 1.6 } },
    config,
  )

  assert.equal(zodOk, true)
  assert.equal(formula(clamped, 'conflictEscalationModifier'), 1.6)
  assert.ok(
    formula(clamped, 'conflictEscalationModifier') > 1,
    '历史世界观规则默认或 AI 覆盖应可 >1',
  )
}

/** Phase 4-C：devotionGainModifier / causalCaptureRate */
function testPhase4CDevotionAndCausal() {
  const faithConfig = baseConfig({
    powerSystemTag: 'faith',
    essenceTag: 'mythological',
    civilizationStage: 'medieval',
  })
  const { clamped: faithCal } = simulateAiCalibrationPath({}, faithConfig)
  assert.ok(
    formula(faithCal, 'devotionGainModifier') > 1,
    'faith+mythological 规则默认 devotionGainModifier 应 >1',
  )

  const { zodOk, clamped } = simulateAiCalibrationPath(
    { formulas: { causalCaptureRate: 0.7, devotionGainModifier: 1.5 } },
    faithConfig,
  )
  assert.equal(zodOk, true)
  assert.equal(formula(clamped, 'causalCaptureRate'), 0.7)
  assert.equal(formula(clamped, 'devotionGainModifier'), 1.5)
}

function main() {
  testSparseMergeRetainsDefaults()
  testModifierClampWhenZodRejects()
  testModifierClampLowBound()
  testInvalidEnumFallback()
  testEntityRangeClamp()
  testNullRawFallback()
  testAiPathCultivationScenario()
  testAiPathScifiSpaceScenario()
  testPassthroughExtraFields()
  testPhase4ModifierWiring()
  testPhase4BIncomeModifier()
  testPhase4CConflictEscalationModifier()
  testPhase4CDevotionAndCausal()
  console.log('[OK] world-calibration AI path — 16 cases passed')
}

main()
