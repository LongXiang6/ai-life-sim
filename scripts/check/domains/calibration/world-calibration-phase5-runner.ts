/**
 * @module world-calibration-phase5-runner.ts
 * @description Phase 5 验收 —— 跨域校准、规范年龄与 P5 健康/寿命规则
 */

import assert from 'node:assert/strict'

import {
  buildDefaultCalibration,
  FORMULA_KEYS,
  formatCalibrationSummary,
  getWorldviewStyleHint,
} from '@/mods/mod-world/utils/calibration-clamp'

import { DEFAULT_KNOWLEDGE_DOMAINS } from '@/mods/mod-tech-level/constants'
import { CHARACTER_DAYS_PER_YEAR, resolveCharacterAgeDays } from '@/foundation'
import { formatAdaptationCalibrationBlock } from '@/mods/mod-world/utils/adaptation-prompt-calibration'

import { baseConfig, formula } from './world-calibration-test-helpers'

function testFormatCalibrationSummaryRich() {
  const cal = buildDefaultCalibration(
    baseConfig({ essenceTag: 'cultivation', civilizationStage: 'medieval' }),
  )
  const summary = formatCalibrationSummary(cal)

  assert.ok(summary.includes('修炼'), `摘要应含修炼相关项: ${summary}`)
  assert.ok(summary.includes('事件策略'), `摘要应含事件策略: ${summary}`)
  assert.ok(summary.length <= 151, `摘要应 ≤150 字（含省略号）: ${summary.length}`)
}

function testCultureTechUsesComposableDomains() {
  assert.ok(DEFAULT_KNOWLEDGE_DOMAINS.length >= 8)
  assert.ok(DEFAULT_KNOWLEDGE_DOMAINS.includes('food'))
  assert.ok(DEFAULT_KNOWLEDGE_DOMAINS.includes('information'))
  assert.ok(DEFAULT_KNOWLEDGE_DOMAINS.includes('space'))
}

function testCanonicalCharacterAgeUsesTotalDays() {
  const startingAge = 18
  const anchor = CHARACTER_DAYS_PER_YEAR
  assert.equal(resolveCharacterAgeDays(startingAge, anchor, anchor), 18 * CHARACTER_DAYS_PER_YEAR)
  assert.equal(resolveCharacterAgeDays(startingAge, anchor + 730, anchor), 20 * CHARACTER_DAYS_PER_YEAR)
}

function testP5HealthCalibrationFields() {
  const cal = buildDefaultCalibration(
    baseConfig({ essenceTag: 'postApocalyptic', civilizationStage: 'modern' }),
  )
  assert.ok(formula(cal, 'vitalityRecoveryModifier') < 1, '灾后世界应降低生命恢复')
  assert.ok(formula(cal, 'conditionProgressionModifier') > 1, '灾后世界应延长伤病进展')
  assert.ok(FORMULA_KEYS.includes('spiritRecoveryModifier'), 'P5 校准应声明精神恢复')
  assert.ok(!FORMULA_KEYS.includes('breakthroughChanceModifier' as never), '不得保留随机寿命突破字段')
  assert.ok(!FORMULA_KEYS.includes('attributeDecayModifier' as never), '不得保留旧属性衰减字段')
}

function testLifespanCalibrationUsesExplicitMaximum() {
  const cal = buildDefaultCalibration(
    baseConfig({ essenceTag: 'cultivation', civilizationStage: 'medieval' }),
  )
  assert.equal(formula(cal, 'lifespanModifier'), 1.5)
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
  testFormatCalibrationSummaryRich()
  testCultureTechUsesComposableDomains()
  testCanonicalCharacterAgeUsesTotalDays()
  testP5HealthCalibrationFields()
  testLifespanCalibrationUsesExplicitMaximum()
  testAdaptationCalibrationBlock()
  testGetWorldviewStyleHintPrefersCalibration()
  console.log('[OK] world-calibration Phase 5 — 12 cases passed')
}

main()
