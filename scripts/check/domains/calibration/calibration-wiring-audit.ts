/**
 * @module calibration-wiring-audit.ts
 * @description Phase 5C —— 校准字段接线静态矩阵（纯文件扫描，不加载子系统）
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FORMULA_KEYS } from '@/mods/mod-world/utils/calibration-clamp'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = path.join(ROOT, 'src')

type WiringStatus = 'wired' | 'defer' | 'backlog'

interface WiringEntry {
  field: string
  status: WiringStatus
  consumer?: string
  note?: string
}

/** getFormulaModifier 标准接线 */
const FORMULA_WIRED: Partial<Record<string, string>> = {
  populationModifier: 'world-init-system',
  developmentModifier: 'world-init-system',
  impactRangeModifier: 'getImpactRangeModifier',
  birthRateModifier: 'population-system',
  fertilityModifier: 'family-system',
  deathRateModifier: 'population-system',
  inflationModifier: 'economy-system',
  tradeMultiplierModifier: 'economy-system',
  hpRecoveryModifier: 'health-system',
  staminaRecoveryModifier: 'health-system',
  lifespanModifier: 'lifespan-system',
  attributeDecayModifier: 'attribute-decay-system',
  breakthroughChanceModifier: 'lifespan-system',
  cultivationSpeedModifier: 'combat-power-system',
  bottleneckModifier: 'cultivation-system',
  monsterThreatModifier: 'monster-system',
  monsterSpawnModifier: 'monster-system',
  luckPointModifier: 'luck-system + fortune-encounter-system',
  socialMobilityModifier: 'social-stratification-system',
  factionEmergenceModifier: 'faction-dynamics-system',
  warFrequencyModifier: 'nation-relation-system',
  warDamageModifier: 'nation-relation-system',
  legalEnforcementModifier: 'legal-system',
  ecologyRecoveryModifier: 'ecology-system',
  pollutionDecayModifier: 'pollution-system',
  resourceConsumptionModifier: 'natural-resource-system',
  disasterFrequencyModifier: 'climate-system',
  techProgressModifier: 'culture-tech-system',
  techBreakthroughModifier: 'culture-tech-system',
  industryProductivityModifier: 'industry-system',
  economyModifier: 'orchestrator (_economyModifier)',
  crossDomainEffectModifier: 'orchestrator-system',
  eventDistributionStrategy: 'getEventDistributionStrategy',
  migrationRateModifier: 'population-system',
  literacyGrowthModifier: 'education-system',
  incomeModifier: 'work-system',
  conflictEscalationModifier: 'conflict-cycle-system',
  devotionGainModifier: 'faith-system',
  causalCaptureRate: 'causal-simulation-system',
}

const SPECIAL_PATTERNS: Record<string, string[]> = {
  impactRangeModifier: ['getImpactRangeModifier'],
  eventDistributionStrategy: ['getEventDistributionStrategy'],
  economyTierRatios: ['economyTierRatios'],
  crossDomainEffectModifier: ['crossDomainEffectModifier'],
  economyModifier: ['_economyModifier', 'economyModifier'],
  populationModifier: ['formulas?.populationModifier'],
  developmentModifier: ['formulas?.developmentModifier'],
}

/** 已知 backlog / defer（非漏接线） */
const BACKLOG: Record<string, string> = {
  'styleGuide.worldviewStyleHint': 'timeline/narrative 已接入 calibration',
  'styleGuide.eventTypeWeights': 'world-timeline-system pickWeightedEventType',
  'styleGuide.narrativeTone': 'orchestrator narrativeToneHint',
  'entities.*': 'world-entity-system L1',
  'causal-simulation tokens': 'IT-6 排除 narrative token 结构校准',
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue
      collectSourceFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(ent.name) && !/\.d\.ts$/.test(ent.name)) {
      acc.push(full)
    }
  }
  return acc
}

function readAllSources(): string {
  return collectSourceFiles(SRC).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
}

function auditFormulaKeys(source: string): WiringEntry[] {
  const entries: WiringEntry[] = []

  for (const key of FORMULA_KEYS) {
    if (key === 'economyTierRatios') {
      const ok = source.includes('economyTierRatios')
      entries.push({
        field: key,
        status: ok ? 'wired' : 'backlog',
        consumer: FORMULA_WIRED[key],
      })
      continue
    }

    const patterns = SPECIAL_PATTERNS[key] ?? [`getFormulaModifier('${key}')`]
    const wired = patterns.some((p) => source.includes(p))
    entries.push({
      field: key,
      status: wired ? 'wired' : 'backlog',
      consumer: FORMULA_WIRED[key],
    })
  }

  return entries
}

function main() {
  const source = readAllSources()
  const entries = auditFormulaKeys(source)

  const unwired = entries.filter((e) => e.status !== 'wired')
  const wiredCount = entries.filter((e) => e.status === 'wired').length

  console.log(`[calibration-wiring-audit] L2/L3 字段: ${wiredCount}/${entries.length} 已接线`)

  for (const e of entries) {
    const mark = e.status === 'wired' ? '✅' : '⚠️'
    console.log(`  ${mark} ${e.field}${e.consumer ? ` → ${e.consumer}` : ''}`)
  }

  console.log('[calibration-wiring-audit] 跨系统 / Prompt backlog（登记，非失败）:')
  for (const [k, note] of Object.entries(BACKLOG)) {
    console.log(`  📋 ${k}: ${note}`)
  }

  assert.equal(unwired.length, 0, `未接线 L2 字段: ${unwired.map((e) => e.field).join(', ')}`)

  // 5A/5B 关键跨读
  assert.ok(source.includes('breakthroughBonus'), 'faith breakthroughBonus 应已导出')
  assert.ok(source.includes('innovationMod'), 'education innovationMod 应已导出')
  assert.ok(source.includes('collectStateUpdate'), 'culture-tech Round2 应已实现')

  // IT-5：收入/运气 dedup — fortune 用 luckPointModifier，不用 incomeModifier
  const fortuneFile = collectSourceFiles(SRC).find((f) => f.includes('fortune-encounter-system.ts'))
  const workFile = collectSourceFiles(SRC).find((f) => f.includes('work-system.ts'))
  if (fortuneFile) {
    const fortuneSrc = fs.readFileSync(fortuneFile, 'utf8')
    assert.ok(fortuneSrc.includes("getFormulaModifier('luckPointModifier')"))
    assert.ok(!fortuneSrc.includes("getFormulaModifier('incomeModifier')"), 'fortune 不应读 incomeModifier')
  }
  if (workFile) {
    const workSrc = fs.readFileSync(workFile, 'utf8')
    assert.ok(workSrc.includes("getFormulaModifier('incomeModifier')"))
  }
  assert.ok(source.includes("getFormulaModifier('fertilityModifier')"), 'family 应读 fertilityModifier')
  assert.ok(source.includes('pickWeightedEventType'), 'timeline 应按 eventTypeWeights 加权采样')
  assert.ok(source.includes('narrativeToneHint'), 'narrative tone hint 应已接入')
  assert.ok(source.includes('getWorldviewStyleHint'), 'styleGuide 读取 helper 应存在')
  assert.ok(source.includes('calibrationSummary'), 'narrative calibrationSummary 应已接入')

  console.log('[OK] calibration-wiring-audit — matrix passed')
}

main()
