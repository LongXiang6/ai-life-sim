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

/** 当前运行系统直接消费的校准字段；其余字段登记为区域或角色状态派生背景。 */
const FORMULA_WIRED: Partial<Record<string, string>> = {
  developmentModifier: 'world-init / spatial-graph 区域生成',
  economyModifier: 'world-init / world-region 区域背景',
}

const SPECIAL_PATTERNS: Record<string, string[]> = {
  economyModifier: ['_economyModifier', 'calibration?.formulas?.economyModifier'],
  developmentModifier: ['formulas?.developmentModifier'],
}

/**
 * 当前 owning system 由自身状态、世界能力或结构化事实派生这些字段。
 * 派生字段仍可作为世界初始化或 Prompt 的稀疏校准输入，但不伪装成独立的
 * getFormulaModifier 运行时消费者，也不能回写已删除的旧系统。
 */
const FORMULA_DERIVED: Record<string, string> = {
  populationModifier: '世界区域概况的人口规模背景；不创建独立人口推进状态',
  developmentModifier: '区域发展度由世界初始化与区域概况派生',
  impactRangeModifier: '影响范围由上下文能力画像与世界区域关联派生',
  birthRateModifier: '世界区域概况的人口变化背景；不建立人口系统',
  fertilityModifier: '角色状态与统一记忆中的家庭生育叙事倾向；不建立关系系统',
  deathRateModifier: '世界区域概况的生存压力背景；角色死亡事实归角色状态',
  inflationModifier: '世界区域概况的价格与交换背景；不建立独立经济状态',
  tradeMultiplierModifier: '世界区域概况的商路与交换倾向；不建立独立经济状态',
  vitalityRecoveryModifier: '角色状态中的生命恢复修正',
  staminaRecoveryModifier: '角色状态中的体力恢复修正',
  spiritRecoveryModifier: '角色状态中的精神恢复修正',
  conditionProgressionModifier: '角色状态中的健康问题进展修正',
  lifespanModifier: '角色状态中的叙事寿命上限修正；不直接触发老死',
  cultivationSpeedModifier: '修炼与力量框架的训练进度修正',
  bottleneckModifier: '修炼系统按当前阶位、训练和证据派生瓶颈',
  monsterThreatModifier: '世界区域的危险题材倾向；不创建怪物实体状态',
  monsterSpawnModifier: '世界区域的异常生物题材倾向；不创建第二物种池',
  luckPointModifier: '角色状态的气运倾向与机缘叙事修正',
  socialMobilityModifier: '世界区域概况的社会流动背景；不建立阶层系统',
  factionEmergenceModifier: '世界区域概况的势力出现倾向；不建立势力状态',
  warFrequencyModifier: '世界区域概况的冲突背景；不建立冲突周期系统',
  warDamageModifier: '世界区域概况的冲突后果倾向；不建立冲突周期系统',
  legalEnforcementModifier: '世界区域概况的制度约束背景；不建立法律系统',
  ecologyRecoveryModifier: '世界区域概况的生态恢复背景；不建立独立生态系统',
  pollutionDecayModifier: '世界区域概况的环境压力背景；不建立独立污染系统',
  resourceConsumptionModifier: '世界区域概况的资源消耗背景；不建立独立资源系统',
  disasterFrequencyModifier: '世界区域概况的灾害倾向；由时间与叙事条件解释',
  techProgressModifier: '知识与技术系统的研究进度修正',
  techBreakthroughModifier: '知识与技术系统的突破倾向修正',
  industryProductivityModifier: '世界区域概况的生产背景；不建立职业或经济系统',
  economyModifier: '世界区域概况的宏观交换背景',
  migrationRateModifier: '世界区域之间的迁移叙事背景；不建立人口系统',
  literacyGrowthModifier: '世界区域概况的教育背景；不建立教育系统',
  incomeModifier: '角色与剧情中的收益倾向；不建立职业状态',
  conflictEscalationModifier: '世界区域叙事中的冲突节奏倾向；不建立冲突周期系统',
  devotionGainModifier: '信仰题材的叙事倾向；不建立信仰状态',
  causalCaptureRate: '历史事件账本只消费完整校验的结构化事实，不从正文概率捕获',
  eventDistributionStrategy: '事件分布策略由世界校准与当前上下文能力派生',
}

/** 已知辅助接线记录（非漏接线） */
const BACKLOG: Record<string, string> = {
  'styleGuide.narrativeTone': 'orchestrator narrativeToneHint',
  'regions.*': 'world-init 生成、spatial-graph 持有区域概况',
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

  assert.ok(source.includes('narrativeToneHint'), 'narrative tone hint 应已接入')
  assert.ok(source.includes('getWorldviewStyleHint'), 'styleGuide 读取 helper 应存在')
  assert.ok(source.includes('calibrationSummary'), 'narrative calibrationSummary 应已接入')

  console.log('[OK] calibration-wiring-audit — matrix passed')
}

main()
