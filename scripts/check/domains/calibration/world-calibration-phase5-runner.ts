/**
 * @module world-calibration-phase5-runner.ts
 * @description Phase 5 验收 —— faith→cultivation Round2、family×birthRate（纯逻辑，不加载子系统模块）
 */

import assert from 'node:assert/strict'

import {
  buildDefaultCalibration,
  clampModifier,
  formatCalibrationSummary,
  getWorldviewStyleHint,
} from '@/mods/mod-world/utils/calibration-clamp'

import { EDUCATION_INNOVATION_MOD } from '@/mods/mod-culture/constants'
import { TECH_BREAKTHROUGH_PROBABILITY } from '@/mods/mod-tech-level/constants'
import { BREAKTHROUGH_PATHWAYS } from '@/mods/mod-character/constants'
import { formatAdaptationCalibrationBlock } from '@/mods/mod-world/utils/adaptation-prompt-calibration'

import { baseConfig, formula } from './world-calibration-test-helpers'

const BIRTH_PROBABILITY = 0.08
const EFFECTIVE_BIRTH_MIN = 0.001
const EFFECTIVE_BIRTH_MAX = 0.5

/** 与 faith-system.getFaithBreakthroughBonus 一致 */
function computeFaithBreakthroughBonus(devotionLevel: number, devotionGainModifier: number): number {
  return 1 + (devotionLevel / 100) * 0.3 * devotionGainModifier
}

/** 与 cultivation-system.collectStateUpdate 一致 */
function applyFaithBreakthroughBonus(chance: number, faithBonus: number): number {
  if (faithBonus === 1 || chance <= 0) return chance
  return Math.min(Math.max(chance * faithBonus, 0), 1)
}

/** 与 family-system._effectiveBirthProbability 一致 */
function effectiveBirthProbability(fertilityModifier: number): number {
  const mod = clampModifier(fertilityModifier)
  return Math.min(Math.max(BIRTH_PROBABILITY * mod, EFFECTIVE_BIRTH_MIN), EFFECTIVE_BIRTH_MAX)
}

function testFaithBonusFormula() {
  const expected = computeFaithBreakthroughBonus(100, 1.4)
  assert.ok(Math.abs(expected - 1.42) < 0.001, `faithBonus 应 ≈1.42，实际 ${expected}`)
}

function testFaithBonusNoFaith() {
  assert.equal(computeFaithBreakthroughBonus(0, 1.4), 1)
}

function testCultivationRound2FaithMultiply() {
  const baseChance = 0.6 * 1.0 // bottleneckMod=1, 金丹→元婴基线
  const after = applyFaithBreakthroughBonus(baseChance, 1.42)
  assert.ok(Math.abs(after - baseChance * 1.42) < 0.001, `应 ×1.42，实际 ${after}`)
}

function testCultivationRound2NoFaith() {
  const baseChance = 0.4
  assert.equal(applyFaithBreakthroughBonus(baseChance, 1), baseChance)
}

function testFamilyEffectiveBirthPrimitive() {
  const cal = buildDefaultCalibration(
    baseConfig({ civilizationStage: 'primitive', essenceTag: 'historical' }),
  )
  const fertilityMod = formula(cal, 'fertilityModifier')
  const effective = effectiveBirthProbability(fertilityMod)

  assert.equal(fertilityMod, 1, 'primitive 默认 fertilityModifier 应为 1.0')
  assert.ok(
    Math.abs(effective - BIRTH_PROBABILITY) < 0.001,
    `primitive 有效生育率应 ≈0.08，实际 ${effective}`,
  )
}

function testFamilyEffectiveBirthPostApocalyptic() {
  const cal = buildDefaultCalibration(
    baseConfig({ essenceTag: 'postApocalyptic', civilizationStage: 'modern' }),
  )
  const fertilityMod = formula(cal, 'fertilityModifier')
  const effective = effectiveBirthProbability(fertilityMod)

  assert.ok(fertilityMod < 1, `postApocalyptic fertilityModifier 应 <1，实际 ${fertilityMod}`)
  assert.ok(effective < BIRTH_PROBABILITY, `有效生育率应低于 0.08，实际 ${effective}`)
}

function testFormatCalibrationSummaryRich() {
  const cal = buildDefaultCalibration(
    baseConfig({ essenceTag: 'cultivation', civilizationStage: 'medieval' }),
  )
  const summary = formatCalibrationSummary(cal)

  assert.ok(summary.includes('修炼'), `摘要应含修炼相关项: ${summary}`)
  assert.ok(summary.includes('事件策略'), `摘要应含事件策略: ${summary}`)
  assert.ok(summary.length <= 151, `摘要应 ≤150 字（含省略号）: ${summary.length}`)
}

function testEducationInnovationModLevels() {
  assert.ok(EDUCATION_INNOVATION_MOD.advanced === 2.0)
  assert.ok(EDUCATION_INNOVATION_MOD.advanced > EDUCATION_INNOVATION_MOD.basic)
}

/** 与 culture-tech advanceCultureTech 中 baseProgress 乘数一致 */
function testCultureTechProgressScalesWithInnovation() {
  const techMod = 1.0
  const base = 0.05 * techMod * EDUCATION_INNOVATION_MOD.basic
  const scaled = 0.05 * techMod * EDUCATION_INNOVATION_MOD.advanced
  assert.ok(scaled > base, '高 innovationMod 应提高进度增量')
  assert.ok(Math.abs(scaled / base - 2) < 0.001)
}

/** 与思潮触发概率一致 */
function testCultureTechTrendProbabilityScalesWithInnovation() {
  const breakthroughMod = 1.0
  const baseP = TECH_BREAKTHROUGH_PROBABILITY * breakthroughMod * EDUCATION_INNOVATION_MOD.basic
  const highP = TECH_BREAKTHROUGH_PROBABILITY * breakthroughMod * EDUCATION_INNOVATION_MOD.advanced
  assert.ok(highP > baseP)
  assert.ok(Math.abs(highP / baseP - 2) < 0.001)
}

function testLifespanPathwayEligibility() {
  const eligible = BREAKTHROUGH_PATHWAYS.filter((p) =>
    8 >= p.requiredLuck && 10000 >= p.requiredWealth && 50 >= p.requiredReputation,
  )
  assert.ok(eligible.length > 0, '高 luck/wealth/reputation 应至少一条途径')

  const none = BREAKTHROUGH_PATHWAYS.filter((p) =>
    0 >= p.requiredLuck && 0 >= p.requiredWealth && 0 >= p.requiredReputation,
  )
  assert.equal(none.length, 0, '零资源时不应有条途径（需先积累子系统状态）')
}

function testAdaptationCalibrationBlock() {
  assert.equal(formatAdaptationCalibrationBlock(''), '')
  assert.equal(formatAdaptationCalibrationBlock('默认校准'), '')
  assert.ok(formatAdaptationCalibrationBlock('修炼速度×2').includes('世界校准摘要'))
}

function testGetWorldviewStyleHintPrefersCalibration() {
  const cal = buildDefaultCalibration(baseConfig({ essenceTag: 'historical' }))
  cal.styleGuide = { worldviewStyleHint: '自定义风格提示' }

  assert.equal(getWorldviewStyleHint(cal, 'historical'), '自定义风格提示')
  assert.ok(getWorldviewStyleHint(null, 'historical').length > 0, 'fallback essence 常量')
}

function main() {
  testFaithBonusFormula()
  testFaithBonusNoFaith()
  testCultivationRound2FaithMultiply()
  testCultivationRound2NoFaith()
  testFamilyEffectiveBirthPrimitive()
  testFamilyEffectiveBirthPostApocalyptic()
  testFormatCalibrationSummaryRich()
  testEducationInnovationModLevels()
  testCultureTechProgressScalesWithInnovation()
  testCultureTechTrendProbabilityScalesWithInnovation()
  testLifespanPathwayEligibility()
  testAdaptationCalibrationBlock()
  testGetWorldviewStyleHintPrefersCalibration()
  console.log('[OK] world-calibration Phase 5 — 13 cases passed')
}

main()
