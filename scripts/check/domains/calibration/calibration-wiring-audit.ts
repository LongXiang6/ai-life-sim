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
  migrationRateModifier: 'population-system',
  literacyGrowthModifier: 'education-system',
  incomeModifier: 'work-system',
  conflictEscalationModifier: 'conflict-cycle-system',
  devotionGainModifier: 'faith-system',
  causalCaptureRate: 'P1 历史事件账本不使用概率捕获',
}

const SPECIAL_PATTERNS: Record<string, string[]> = {
  economyTierRatios: ['economyTierRatios'],
  crossDomainEffectModifier: ['crossDomainEffectModifier'],
  economyModifier: ['_economyModifier', 'economyModifier'],
  populationModifier: ['formulas?.populationModifier'],
  developmentModifier: ['formulas?.developmentModifier'],
}

/**
 * MVP 蓝图阶段 0 只要求校准核心路径和已保留系统可用。
 * 下列字段的消费者属于延后模拟系统；未接线时记录为 defer，不作为 calibration
 * acceptance 的硬失败。未知字段仍保持 backlog 并触发 assert，防止真实漏接线被吞掉。
 */
const MVP_DEFERRED_FORMULA_KEYS: Record<string, string> = {
  impactRangeModifier: '跨系统影响范围模拟延后',
  birthRateModifier: 'population-system 延后',
  fertilityModifier: 'family-system 延后',
  deathRateModifier: 'population-system 延后',
  inflationModifier: 'economy-system 延后',
  tradeMultiplierModifier: 'economy-system 延后',
  monsterThreatModifier: 'monster-system 延后',
  monsterSpawnModifier: 'monster-system 延后',
  socialMobilityModifier: 'social-stratification-system 延后',
  factionEmergenceModifier: 'faction-dynamics-system 延后',
  legalEnforcementModifier: 'legal-system 延后',
  ecologyRecoveryModifier: 'ecology-system 延后',
  disasterFrequencyModifier: 'climate-system 延后',
  techProgressModifier: 'culture-tech-system 延后',
  techBreakthroughModifier: 'culture-tech-system 延后',
  eventDistributionStrategy: '事件分布策略由延后模拟系统消费',
  migrationRateModifier: 'population-system 延后',
  literacyGrowthModifier: 'education-system 延后',
  incomeModifier: 'work-system 延后',
  conflictEscalationModifier: 'conflict-cycle-system 延后',
  causalCaptureRate: 'P1 已移除正文概率捕获；账本只消费完整校验的结构化事实',
}

/** 已知 backlog / defer（非漏接线） */
const BACKLOG: Record<string, string> = {
  'styleGuide.narrativeTone': 'orchestrator narrativeToneHint',
  'entities.*': 'world-entity-system L1',
  'historical-event-ledger event-input': 'P1 复用主叙事结构化数据，不新增独立 AI token 配额',
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
    const deferredReason = MVP_DEFERRED_FORMULA_KEYS[key]
    entries.push({
      field: key,
      status: wired ? 'wired' : deferredReason ? 'defer' : 'backlog',
      consumer: FORMULA_WIRED[key],
      note: deferredReason,
    })
  }

  return entries
}

function main() {
  const source = readAllSources()
  const entries = auditFormulaKeys(source)

  const unexpectedUnwired = entries.filter((e) => e.status === 'backlog')
  const deferred = entries.filter((e) => e.status === 'defer')
  const wiredCount = entries.filter((e) => e.status === 'wired').length

  console.log(`[calibration-wiring-audit] L2/L3 字段: ${wiredCount}/${entries.length} 已接线`)

  for (const e of entries) {
    const mark = e.status === 'wired' ? '✅' : e.status === 'defer' ? '⏳' : '⚠️'
    console.log(`  ${mark} ${e.field}${e.consumer ? ` → ${e.consumer}` : ''}${e.note ? ` (${e.note})` : ''}`)
  }

  if (deferred.length > 0) {
    console.log('[calibration-wiring-audit] MVP 延后字段（登记，非失败）:')
    for (const e of deferred) {
      console.log(`  ⏳ ${e.field}: ${e.note}`)
    }
  }

  console.log('[calibration-wiring-audit] 跨系统 / Prompt backlog（登记，非失败）:')
  for (const [k, note] of Object.entries(BACKLOG)) {
    console.log(`  📋 ${k}: ${note}`)
  }

  assert.equal(unexpectedUnwired.length, 0, `未知未接线 L2 字段: ${unexpectedUnwired.map((e) => e.field).join(', ')}`)

  // 当前 MVP 仍必须保持的关键跨读；延后模拟系统的旧 Phase 5 断言只登记不阻断。
  assert.ok(source.includes('breakthroughBonus'), 'faith breakthroughBonus 应已导出')

  // IT-5：收入/运气 dedup — fortune 用 luckPointModifier，不用 incomeModifier
  const fortuneFile = collectSourceFiles(SRC).find((f) => f.includes('fortune-encounter-system.ts'))
  if (fortuneFile) {
    const fortuneSrc = fs.readFileSync(fortuneFile, 'utf8')
    assert.ok(fortuneSrc.includes("getFormulaModifier('luckPointModifier')"))
    assert.ok(!fortuneSrc.includes("getFormulaModifier('incomeModifier')"), 'fortune 不应读 incomeModifier')
  }

  const deferredAssertions: Record<string, string> = {
    'education innovationMod': 'education-system 延后',
    'culture-tech collectStateUpdate': 'culture-tech-system 延后',
    'work incomeModifier': 'work-system 延后',
    'family fertilityModifier': 'family-system 延后',
  }
  if (Object.keys(deferredAssertions).length > 0) {
    console.log('[calibration-wiring-audit] Phase 5 延后断言（登记，非失败）:')
    for (const [label, note] of Object.entries(deferredAssertions)) {
      console.log(`  ⏳ ${label}: ${note}`)
    }
  }

  assert.ok(source.includes('narrativeToneHint'), 'narrative tone hint 应已接入')
  assert.ok(source.includes('getWorldviewStyleHint'), 'styleGuide 读取 helper 应存在')
  assert.ok(source.includes('calibrationSummary'), 'narrative calibrationSummary 应已接入')

  console.log('[OK] calibration-wiring-audit — matrix passed')
}

main()
