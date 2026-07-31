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

type WiringStatus = 'wired' | 'derived' | 'backlog'

interface WiringEntry {
  field: string
  status: WiringStatus
  consumer?: string
  note?: string
}

/** 当前运行系统消费的校准字段；消费者使用现行 owning system ID。 */
const FORMULA_WIRED: Partial<Record<string, string>> = {
  populationModifier: 'population-system (economy-runtime)',
  developmentModifier: 'world-init-system',
  birthRateModifier: 'population-system',
  fertilityModifier: 'relationship-system（仅关系语义，不建立家庭人口旁路）',
  deathRateModifier: 'population-system',
  inflationModifier: 'economy',
  tradeMultiplierModifier: 'economy',
  vitalityRecoveryModifier: 'health-system',
  staminaRecoveryModifier: 'health-system',
  spiritRecoveryModifier: 'health-system',
  conditionProgressionModifier: 'health-system',
  lifespanModifier: 'lifespan-system',
  cultivationSpeedModifier: 'combat-power',
  bottleneckModifier: 'cultivation-system',
  monsterThreatModifier: 'monster-system',
  monsterSpawnModifier: 'monster-system',
  luckPointModifier: 'luck-system + fortune-encounter-system',
  socialMobilityModifier: 'social-stratification-system',
  factionEmergenceModifier: 'faction-dynamics-system',
  warFrequencyModifier: 'conflict-cycle',
  warDamageModifier: 'conflict-cycle',
  legalEnforcementModifier: 'legal-system',
  ecologyRecoveryModifier: 'ecology-system',
  pollutionDecayModifier: 'pollution-system',
  resourceConsumptionModifier: 'natural-resource-system',
  disasterFrequencyModifier: 'climate-system',
  techProgressModifier: 'culture-tech-system',
  techBreakthroughModifier: 'culture-tech-system',
  industryProductivityModifier: 'work/economy',
  economyModifier: 'orchestrator (_economyModifier)',
  migrationRateModifier: 'population-system',
  literacyGrowthModifier: 'education-system',
  incomeModifier: 'work-system',
  conflictEscalationModifier: 'conflict-cycle-system',
  devotionGainModifier: 'faith-system',
  causalCaptureRate: 'P1 历史事件账本不使用概率捕获',
}

const SPECIAL_PATTERNS: Record<string, string[]> = {
  economyModifier: ['_economyModifier', 'economyModifier'],
  populationModifier: ["getFormulaModifier('populationModifier'", 'formulas?.populationModifier'],
  developmentModifier: ['formulas?.developmentModifier'],
}

/**
 * 当前 owning system 由自身状态、世界能力或结构化事实派生这些字段。
 * 派生字段仍可作为世界初始化或 Prompt 的稀疏校准输入，但不伪装成独立的
 * getFormulaModifier 运行时消费者，也不能回写已删除的旧系统。
 */
const FORMULA_DERIVED: Record<string, string> = {
  impactRangeModifier: '影响范围由上下文能力画像与空间图派生',
  fertilityModifier: '关系系统只拥有关系语义；宏观出生由 population-system 派生',
  tradeMultiplierModifier: '商路与价格由 economy 状态派生，不建立独立乘数旁路',
  monsterSpawnModifier: '怪物候选由 ecology 物种与世界能力派生，不随机生成第二物种池',
  causalCaptureRate: '历史账本只消费完整校验的结构化事实，不从正文概率捕获',
  cultivationSpeedModifier: 'combat-power 的训练进度由 cultivation 状态与世界力量框架派生',
  bottleneckModifier: 'cultivation 的瓶颈由当前阶位、训练与证据事件派生',
  monsterThreatModifier: 'monster 的区域威胁由 ecology 物种、承载量与污染状态派生',
  factionEmergenceModifier: 'faction-dynamics 的势力变化由组织实体与历史事实派生',
  warFrequencyModifier: 'conflict-cycle 的冲突频率由冲突状态机与上下文事件派生',
  warDamageModifier: 'conflict-cycle 的损害由冲突阶段、张力与参与方状态派生',
  legalEnforcementModifier: 'legal 的执法结果由制度条目、组织和历史事实派生',
  ecologyRecoveryModifier: 'ecology 的恢复由物种、栖息节点与时间推进派生',
  pollutionDecayModifier: 'pollution 的衰减由环境状态与时间推进派生',
  disasterFrequencyModifier: 'climate 的灾害候选由气候状态、时间与世界能力派生',
  techProgressModifier: 'culture-tech 的知识进度由 education、作品和已确认事实派生',
  techBreakthroughModifier: 'culture-tech 的突破由研究能力、知识传播和证据事件派生',
  eventDistributionStrategy: '事件分布策略由世界校准与当前上下文能力派生',
  literacyGrowthModifier: 'education 的识字增长由教育普及、知识传播和时间派生',
  conflictEscalationModifier: 'conflict-cycle 的阶段推进由张力、时间和历史证据派生',
  devotionGainModifier: 'faith 的虔诚变化由信仰关系、神祇规则和历史事实派生',
}

/** 已知辅助接线记录（非漏接线） */
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
    const patterns = SPECIAL_PATTERNS[key] ?? [`getFormulaModifier('${key}'`]
    const wired = patterns.some((p) => source.includes(p))
    const derivedReason = FORMULA_DERIVED[key]
    entries.push({
      field: key,
      status: wired ? 'wired' : derivedReason ? 'derived' : 'backlog',
      consumer: FORMULA_WIRED[key],
      note: derivedReason,
    })
  }

  return entries
}

function main() {
  const source = readAllSources()
  const entries = auditFormulaKeys(source)

  const unexpectedUnwired = entries.filter((e) => e.status === 'backlog')
  const derived = entries.filter((e) => e.status === 'derived')
  const wiredCount = entries.filter((e) => e.status === 'wired').length

  console.log(`[calibration-wiring-audit] L2/L3 字段: ${wiredCount}/${entries.length} 已接线`)

  for (const e of entries) {
    const mark = e.status === 'wired' ? '✅' : e.status === 'derived' ? '↳' : '⚠️'
    console.log(`  ${mark} ${e.field}${e.consumer ? ` → ${e.consumer}` : ''}${e.note ? ` (${e.note})` : ''}`)
  }

  if (derived.length > 0) {
    console.log('[calibration-wiring-audit] 当前 owning system 派生字段（登记，非失败）:')
    for (const e of derived) {
      console.log(`  ↳ ${e.field}: ${e.note}`)
    }
  }

  console.log('[calibration-wiring-audit] 辅助接线记录（登记，非失败）:')
  for (const [k, note] of Object.entries(BACKLOG)) {
    console.log(`  📋 ${k}: ${note}`)
  }

  assert.equal(unexpectedUnwired.length, 0, `未知未接线 L2 字段: ${unexpectedUnwired.map((e) => e.field).join(', ')}`)

  // 当前运行必须保持的关键跨读。
  assert.ok(source.includes('breakthroughBonus'), 'faith breakthroughBonus 应已导出')

  // IT-5：收入/运气 dedup — luck-system 拥有 luckPointModifier，fortune 只消费其快照
  const luckFile = collectSourceFiles(SRC).find((f) => f.includes('luck-system.ts'))
  if (luckFile) {
    const luckSrc = fs.readFileSync(luckFile, 'utf8')
    assert.ok(luckSrc.includes("getFormulaModifier('luckPointModifier'"), 'luck-system 应拥有 luckPointModifier')
  }
  const fortuneFile = collectSourceFiles(SRC).find((f) => f.includes('fortune-encounter-system.ts'))
  if (fortuneFile) {
    const fortuneSrc = fs.readFileSync(fortuneFile, 'utf8')
    assert.ok(!fortuneSrc.includes("getFormulaModifier('incomeModifier')"), 'fortune 不应读 incomeModifier')
  }

  assert.ok(source.includes('narrativeToneHint'), 'narrative tone hint 应已接入')
  assert.ok(source.includes('getWorldviewStyleHint'), 'styleGuide 读取 helper 应存在')
  assert.ok(source.includes('calibrationSummary'), 'narrative calibrationSummary 应已接入')

  console.log('[OK] calibration-wiring-audit — matrix passed')
}

main()
