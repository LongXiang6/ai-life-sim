/**
 * Purpose: Execute exactly seven real requests for the dual-axis talent acceptance.
 * Owner: quality:narrative
 * Responsibility: Durable request accounting and runtime protocol checks without retries or AI review.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DestinyPatternAiPoolService } from '../../../../src/mods/mod-character/subsystems/destiny-pattern-system/ai-pool-service.ts'
import { DESTINY_PATTERN_CATEGORY_ORDER, DESTINY_PATTERN_CATEGORY_CONFIG } from '../../../../src/mods/mod-character/constants.ts'
import { createPendingDestinyPatternGrowth, validateDestinyPatternAttrBonusForAptitude } from '../../../../src/mods/mod-character/destiny-pattern-growth.ts'
import { createPromotedReincarnationTalent, decideReincarnationPromotion, promoteReincarnationTalent } from '../../../../src/mods/mod-character/reincarnation-talent-access.ts'
import { COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts'
import { inspectNarrativeTalentGrowthQuality } from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { buildTalentGrowthLiveEvalPrompt, buildTalentGrowthLiveEvalSample } from './narrative-talent-growth-live-eval-fixtures.mjs'

const memory = new Map()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  get length() { return memory.size }, key: index => [...memory.keys()][index] ?? null,
  getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
} })

const directory = path.resolve('reports/talent-awakening-live-acceptance')
const ledgerPath = path.join(directory, 'ledger.json')
const expected = [...DESTINY_PATTERN_CATEGORY_ORDER.map(category => `draw:${category}`), 'growth', 'reincarnation']
const model = 'deepseek-v4-flash'
const endpoint = 'https://api.deepseek.com/chat/completions'
const attrKeys = { 心智: 'mind', 体魄: 'physique', 魅力: 'charisma', 财富: 'familyBackground', 气运: 'luck' }

function readApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  if (!fs.existsSync('.env.local')) return undefined
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find(value => value.startsWith('DEEPSEEK_API_KEY='))
  return line?.slice('DEEPSEEK_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '')
}

function summarize(ledger) {
  return {
    provider: 'deepseek', model, requestCount: Object.keys(ledger.requests).length,
    completed: Object.values(ledger.requests).filter(request => request.state === 'completed').length,
    checks: ledger.checks, ledgerPath,
  }
}

async function main() {
  if (!process.argv.includes('--execute')) {
    assert(fs.existsSync(ledgerPath), 'No ledger exists; real acceptance requires explicit --execute')
    console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))), null, 2))
    return
  }
  const apiKey = readApiKey()
  assert(apiKey, 'DEEPSEEK_API_KEY is not configured; no requests have been sent')
  fs.mkdirSync(directory, { recursive: true })
  const ledger = { startedAt: new Date().toISOString(), provider: 'deepseek', model, requests: {}, checks: [] }
  // Exclusive creation prevents reruns or a second process from spending the same seven-request budget.
  const fd = fs.openSync(ledgerPath, 'wx')
  fs.writeFileSync(fd, JSON.stringify(ledger, null, 2))
  fs.fsyncSync(fd)
  fs.closeSync(fd)
  function save() {
    const handle = fs.openSync(ledgerPath, 'w')
    try {
      fs.writeFileSync(handle, JSON.stringify(ledger, null, 2))
      fs.fsyncSync(handle)
    } finally {
      fs.closeSync(handle)
    }
  }
  function check(name, action) {
    try {
      const detail = action()
      ledger.checks.push({ name, pass: true, ...(detail === undefined ? {} : { detail }) })
    } catch (error) {
      ledger.checks.push({ name, pass: false, error: error.message })
    }
    save()
  }
  async function callModel(id, systemPrompt, userPrompt, options = {}) {
    assert(expected.includes(id) && !ledger.requests[id], `Duplicate or unexpected real request: ${id}`)
    const messages = [{ role: 'system', content: systemPrompt },
      ...(options.userSegments ?? [userPrompt]).map(content => ({ role: 'user', content }))]
    const request = { state: 'started', startedAt: new Date().toISOString(), messages }
    ledger.requests[id] = request
    save()
    const started = Date.now()
    try {
      const response = await fetch(endpoint, {
        method: 'POST', signal: options.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, stream: false, temperature: 0.8, thinking: { type: 'disabled' } }),
      })
      request.httpStatus = response.status
      const text = await response.text()
      assert(response.ok, `Model HTTP ${response.status}; no retry will be sent`)
      const payload = JSON.parse(text)
      const content = payload.choices?.[0]?.message?.content
      assert(typeof content === 'string' && content.trim(), 'Model returned no final content')
      Object.assign(request, {
        state: 'completed', content, usage: payload.usage,
        finishReason: payload.choices?.[0]?.finish_reason, latencyMs: Date.now() - started,
      })
      save()
      console.log(`[talent-live] ${id} completed (${request.latencyMs}ms)`)
      return content
    } catch (error) {
      Object.assign(request, { state: 'failed', error: error.message, latencyMs: Date.now() - started })
      save()
      throw error
    }
  }

  let candidates = []
  const pool = new DestinyPatternAiPoolService(patterns => { candidates = patterns })
  pool.setAIService((system, user, options) => {
    const category = DESTINY_PATTERN_CATEGORY_ORDER.find(value => system.includes(`主机制族：${DESTINY_PATTERN_CATEGORY_CONFIG[value].label}。`))
    return callModel(`draw:${category}`, system, user, options)
  })
  try {
    await pool.generateWithAI({
      worldConfig: { name: '现代地球', description: '当代城市社会，科技与公共制度和现实相近；未建立统一超凡体系或全民觉醒制度。' },
      character: { race: '人类', background: '普通家庭，尚未选择职业与人生道路。' }, existingNames: [],
    })
  } catch (error) {
    ledger.checks.push({ name: 'initial-pool', pass: false, error: error.message })
    save()
  }
  check('five-categories-and-draw-bounds', () => {
    for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
      assert(candidates.filter(pattern => pattern.category === category).length >= 4, `${category} initial pool is incomplete`)
    }
    assert(candidates.every(pattern => pattern.aptitudeTier >= 1 && pattern.aptitudeTier <= 3
      && pattern.developmentStage === 'awakening' && validateDestinyPatternAttrBonusForAptitude(pattern.attrBonus, pattern.aptitudeTier)))
    return candidates.map(({ name, category, aptitudeTier, developmentStage, description, effect }) => ({ name, category, aptitudeTier, developmentStage, description, effect }))
  })

  const sample = buildTalentGrowthLiveEvalSample('sufficient')
  const growthInput = buildTalentGrowthLiveEvalPrompt(sample)
  assert.equal(growthInput.eligiblePatterns.length, 1)
  let growthSource = sample.patterns[0]
  try {
    const content = await callModel('growth', COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT, '', { userSegments: growthInput.userSegments })
    check('eligible-growth-three-routes', () => {
      const quality = inspectNarrativeTalentGrowthQuality(content)
      assert(quality.valid, quality.reason)
      const decision = quality.result.成长判定
      assert.equal(decision.需要成长, true)
      assert.equal(decision.命格血脉编号, growthSource.lineageId)
      const ids = decision.依据窗口编号
      assert(ids.length >= 2 && new Set(ids).size === ids.length)
      assert(ids.every(id => growthInput.evidenceWindowsByLineage[growthSource.lineageId].some(window => window.id === id)))
      const directions = decision.下一阶方向.map(route => ({
        route: route.路线, name: route.名称, description: route.详细介绍, effect: route.效果描述,
        attrBonus: Object.fromEntries(Object.entries(route.属性加成).map(([key, value]) => [attrKeys[key], value])),
      }))
      const pending = createPendingDestinyPatternGrowth({ narrativeId: 'live-acceptance', roundSequence: sample.currentRound, source: growthSource, directions })
      assert(pending.options.every(option => option.pattern.aptitudeTier === growthSource.aptitudeTier && option.pattern.developmentStage === 'mastery'))
      growthSource = pending.options[0].pattern
      return { evidence: decision.成长依据, directions }
    })
  } catch (error) {
    ledger.checks.push({ name: 'growth-request', pass: false, error: error.message })
    save()
  }
  try {
    const source = { ...growthSource, apexStrengthenLevel: 0 }
    const decision = decideReincarnationPromotion(source)
    const promoted = await promoteReincarnationTalent({
      worldName: '雾潮群岛', characterName: '岑澜', finalAge: 83,
      lifeSummary: '长期在北港使用听潮辨隙定位堵塞和裂缝，拆检与封堵复测多次证实能力结果；风暴检修形成了新的掌握。',
      lifeRecords: sample.recentStories.map(story => story.故事全文), selectedPattern: source,
      endingScore: 78, strengthTier: { id: 'stable', label: '稳健', guidance: '保留已有能力，以这一生已发生事实发展新的机制。' },
      promotionDecision: decision,
    }, { callAI: (system, user) => callModel('reincarnation', system, user) })
    check('promotion-keeps-ability-and-resets-stage', () => {
      const result = createPromotedReincarnationTalent(source, promoted, decision, { worldName: '雾潮群岛', characterName: '岑澜' })
      assert.equal(result.aptitudeTier, source.aptitudeTier + 1)
      assert.equal(result.developmentStage, 'awakening')
      return result
    })
  } catch (error) {
    ledger.checks.push({ name: 'reincarnation-request', pass: false, error: error.message })
    save()
  }
  check('exactly-seven-no-retries', () => {
    assert.deepEqual(Object.keys(ledger.requests).sort(), [...expected].sort())
    assert(Object.values(ledger.requests).every(request => request.state === 'completed'))
  })
  ledger.finishedAt = new Date().toISOString()
  save()
  console.log(JSON.stringify(summarize(ledger), null, 2))
  if (ledger.checks.some(result => !result.pass)) process.exitCode = 1
}

main().catch(error => { console.error(`[talent-live] ${error.message}`); process.exitCode = 1 })
