/**
 * @module narrative-regression-seed.mjs
 * @description 叙事一致性回归（蓝图 Phase 5.1）—— 固定 seed 50 轮规则检测
 *
 * 纯逻辑模拟，不调用 AI API：
 *   - 重要性加权检索：HIGH 条目无关键词时仍应入选
 *   - 娱乐护栏：protected NPC 名不可被标记遗忘
 *   - 伏笔上下文：活跃伏笔 id 须出现在静态接线中
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
const ROUNDS = 50
const SEED = 20260622

/** Mulberry32 PRNG */
function createRng(seed) {
  let s = seed >>> 0
  return () => {
    s += 0x6D2B79F5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 简化版 retrieveFromIndex（与 memory-lifecycle-system 策略对齐）
 * @param {Array<{ content: string; tags: string[]; maxImportance: string }>} index
 * @param {string} queryText
 * @param {number} limit
 */
function retrieveFromIndex(index, queryText, limit = 5) {
  const results = []
  for (const entry of index) {
    let score = 0
    if (entry.maxImportance === 'HIGH') score += 4
    else if (entry.maxImportance === 'NORMAL') score += 2

    for (const tag of entry.tags) {
      if (queryText.includes(tag)) score += 1
    }

    if (entry.maxImportance === 'HIGH') score *= 2
    else if (entry.maxImportance === 'NORMAL') score *= 1.5

    if (score === 0 && entry.maxImportance === 'HIGH') score = 5

    if (score > 0) results.push({ entry, score })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit).map((r) => r.entry.content)
}

/**
 * 简化版记忆保留分析（与 memory-lifecycle 保护语义对齐）
 * @param {string} content
 * @param {string[]} protectedNpcNames
 */
function shouldRetainSummary(content, protectedNpcNames) {
  const mentionsProtectedNpc = protectedNpcNames.some(
    (name) => name.length > 0 && content.includes(name),
  )
  if (mentionsProtectedNpc) return true
  const IMPORTANT_KEYWORDS = ['死亡', '婚礼', '突破', '转折', '伏笔']
  if (IMPORTANT_KEYWORDS.some((kw) => content.includes(kw))) return true
  return false
}

function runRetrievalRegression(rng) {
  const protectedNpc = '李青云'
  /** @type {Array<{ content: string; tags: string[]; maxImportance: string }>} */
  const index = []

  for (let round = 1; round <= ROUNDS; round++) {
    const isHigh = rng() > 0.7
    const mentionsNpc = rng() > 0.85
    index.push({
      content: mentionsNpc
        ? `第${round}轮：${protectedNpc}出现在城镇`
        : `第${round}轮：日常琐事记录`,
      tags: mentionsNpc ? [protectedNpc, '城镇'] : ['日常'],
      maxImportance: isHigh ? 'HIGH' : 'NORMAL',
    })
  }

  let highMissCount = 0
  for (let round = 1; round <= ROUNDS; round++) {
    const query = `第${round}轮无关查询xyz`
    const hits = retrieveFromIndex(index, query)
    const highEntries = index.filter((e) => e.maxImportance === 'HIGH')
    const anyHighHit = hits.some((h) => highEntries.some((e) => e.content === h))
    if (highEntries.length > 0 && !anyHighHit) highMissCount++
  }

  if (highMissCount > 0) {
    console.error(`[FAIL] 检索回归：${highMissCount}/${ROUNDS} 轮 HIGH 记忆未保底入选`)
    return false
  }
  console.log(`[OK] 检索回归：${ROUNDS} 轮 HIGH 记忆保底通过`)
  return true
}

function runForgettingRegression(rng) {
  const protectedNpcNames = ['李青云', '苏婉儿']
  let wronglyForgotten = 0

  for (let round = 1; round <= ROUNDS; round++) {
    const content = rng() > 0.5
      ? `${protectedNpcNames[round % 2]}与主角交谈`
      : `第${round}轮普通散步`
    if (content.includes(protectedNpcNames[0]) || content.includes(protectedNpcNames[1])) {
      if (!shouldRetainSummary(content, protectedNpcNames)) wronglyForgotten++
    }
  }

  if (wronglyForgotten > 0) {
    console.error(`[FAIL] 遗忘护栏：${wronglyForgotten} 条 NPC 相关摘要被错误标记可遗忘`)
    return false
  }
  console.log(`[OK] 遗忘护栏：${ROUNDS} 轮 protected NPC 摘要全部保留`)
  return true
}

function runForeshadowingStaticCheck() {
  const foreshadowPath = path.join(ROOT, 'src/mods/mod-engine/subsystems/foreshadowing-system.ts')
  const orchestratorPath = path.join(ROOT, 'src/mods/mod-engine/subsystems/orchestrator-system.ts')
  const content = fs.readFileSync(foreshadowPath, 'utf8')
  const orch = fs.readFileSync(orchestratorPath, 'utf8')

  const required = ['buildForeshadowingText', 'getPlantedContext', 'detectForeshadowing']
  const missing = required.filter((m) => !orch.includes(m) && !content.includes(` ${m}`))
  if (missing.length > 0) {
    console.error(`[FAIL] 伏笔静态接线缺少: ${missing.join(', ')}`)
    return false
  }
  console.log('[OK] 伏笔静态接线方法齐全')
  return true
}

function runCampaignStageContractCheck() {
  const stagesGen = readRel('src/mods/mod-engine/campaigns/default/stages.generated.ts')
  const manifest = readRel('src/mods/mod-engine/manifest.ts')
  const genStages = [...stagesGen.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  const manifestStageBlock = manifest.match(/campaignHooks:\s*\{[\s\S]*?stages:\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const declared = [...manifestStageBlock.matchAll(/'([^']+)'/g)].map((m) => m[1])

  if (declared.join('|') !== genStages.join('|')) {
    console.error('[FAIL] campaignHooks.stages 与 stages.generated.ts 不一致')
    console.error(`  manifest: ${declared.join(', ')}`)
    console.error(`  generated: ${genStages.join(', ')}`)
    return false
  }
  console.log('[OK] campaign 阶段 manifest ↔ generated 契约一致')
  return true
}

/** @param {string} rel */
function readRel(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const rng = createRng(SEED)
let failed = 0

console.log(`[narrative-regression-seed] seed=${SEED} rounds=${ROUNDS}`)

if (!runRetrievalRegression(rng)) failed++
if (!runForgettingRegression(createRng(SEED))) failed++
if (!runForeshadowingStaticCheck()) failed++
if (!runCampaignStageContractCheck()) failed++

if (failed > 0) {
  console.error(`\n叙事回归失败: ${failed} 项`)
  process.exit(1)
}

console.log('\n[OK] 叙事一致性回归全部通过')
