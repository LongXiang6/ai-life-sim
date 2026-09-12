#!/usr/bin/env node

/**
 * Purpose: Execute and score real DeepSeek requests for the active talent-growth Prompt.
 * Owner: quality:narrative
 * Responsibility: Credential loading, provider calls, protocol checks, semantic scoring, and aggregate reporting only.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { inspectNarrativeTalentGrowthQuality } from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { validateDestinyPatternAttrBonusForRarity } from '../../../../src/mods/mod-character/destiny-pattern-growth.ts'
import { narrativeTalentGrowthPrompt } from '../../../../src/mods/mod-engine/prompts/narrative-talent-growth-prompt.ts'
import { COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts'
import {
  buildTalentGrowthLiveEvalPrompt,
  buildTalentGrowthLiveEvalSample,
  DEFAULT_TALENT_GROWTH_LIVE_EVAL_SAMPLES,
} from './narrative-talent-growth-live-eval-fixtures.mjs'

const PROVIDER = 'deepseek'
const MODEL = 'deepseek-v4-flash'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const REQUESTS_PER_SAMPLE = Math.max(1, Number.parseInt(process.env.LIVE_EVAL_ATTEMPTS ?? '2', 10) || 2)
const TARGET_RARITY = { common: 'fine', fine: 'rare', rare: 'epic' }
const ATTR_TO_INTERNAL = { 心智: 'mind', 体魄: 'physique', 魅力: 'charisma', 家境: 'familyBackground', 气运: 'luck' }
const COST_TERMS = /代价|限制|副作用|牺牲|消耗|必须|仅能|不能|无法|不得|受限|付出/gu
const SYSTEM_TERMS = /成功率|触发率|判定值|冷却|概率|数值判定/u

function readLocalEnv(name) {
  if (process.env[name]) return process.env[name]
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return undefined
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match?.[1] === name) return match[2].trim().replace(/^"|"$/g, '')
  }
  return undefined
}

function normalizeRouteResult(result, sample, promptInput) {
  if (!result?.成长判定?.需要成长) {
    return { needsGrowth: false, target: null, routes: [], checks: [] }
  }
  const decision = result.成长判定
  const source = sample.patterns.find((item) => item.lineageId === decision.命格血脉编号)
  const targetRarity = source ? TARGET_RARITY[source.rarity] : undefined
  const evidenceWindowIds = decision.依据窗口编号 ?? []
  const availableEvidenceWindows = source
    ? (promptInput.evidenceWindowsByLineage[source.lineageId] ?? [])
    : []
  const minimumEvidenceWindows = source
    ? ({ common: 2, fine: 3, rare: 4, epic: 5 }[source.rarity] ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY
  const evidenceWindowIdsAreUnique = new Set(evidenceWindowIds).size === evidenceWindowIds.length
  const evidenceWindowIdsAreAllowed = evidenceWindowIds.every((id) => availableEvidenceWindows.some((window) => window.id === id))
  const evidenceValid = evidenceWindowIds.length >= minimumEvidenceWindows
    && evidenceWindowIdsAreUnique
    && evidenceWindowIdsAreAllowed
  if (!source || !evidenceValid) {
    return {
      needsGrowth: false,
      target: decision.命格血脉编号 ?? null,
      routes: [],
      rawNeedsGrowth: true,
      localRejected: true,
      evidenceWindowIds,
      checks: [{
        name: 'evidence-window-gate',
        pass: true,
        detail: `local rejection: ${evidenceWindowIds.join('|') || 'none'} / minimum ${minimumEvidenceWindows} / available ${availableEvidenceWindows.map((window) => window.id).join('|')}`,
      }],
    }
  }
  const routes = decision.下一阶方向 ?? []
  const checks = []
  checks.push({ name: 'route-count', pass: routes.length === 3, detail: String(routes.length) })
  checks.push({ name: 'evidence-window-gate', pass: true, detail: evidenceWindowIds.join('|') })
  checks.push({
    name: 'route-order',
    pass: routes.map((item) => item.路线).join('|') === '深度强化|广度强化|转变强化',
    detail: routes.map((item) => item.路线).join('|'),
  })
  checks.push({
    name: 'route-name-distinct',
    pass: new Set(routes.map((item) => item.名称)).size === routes.length,
    detail: routes.map((item) => item.名称).join('|'),
  })
  checks.push({ name: 'target-rarity-known', pass: Boolean(targetRarity), detail: targetRarity ?? 'unknown-source' })
  const attrResults = routes.map((route) => {
    const internal = Object.fromEntries(Object.entries(route.属性加成 ?? {}).map(([key, value]) => [ATTR_TO_INTERNAL[key] ?? key, value]))
    return { route: route.路线, pass: Boolean(targetRarity) && validateDestinyPatternAttrBonusForRarity(internal, targetRarity), attrs: route.属性加成 }
  })
  checks.push({ name: 'attribute-bounds', pass: attrResults.every((item) => item.pass), detail: attrResults })
  const descriptions = routes.flatMap((item) => [item.详细介绍, item.效果描述]).join(' ')
  checks.push({ name: 'no-system-terms', pass: !SYSTEM_TERMS.test(descriptions), detail: descriptions.match(SYSTEM_TERMS)?.join('、') ?? '' })
  const costCounts = routes.map((item) => (String(item.详细介绍) + ' ' + String(item.效果描述)).match(COST_TERMS)?.length ?? 0)
  checks.push({ name: 'optional-cost-shape', pass: true, detail: costCounts })
  const contextText = `${decision.成长依据} ${descriptions}`
  const contextHits = ['潮', '水', '检修', '港', '北港', '声'].filter((term) => contextText.includes(term))
  checks.push({ name: 'context-grounding-signal', pass: contextHits.length >= 1, detail: contextHits })
  if (sample.id === 'world-boundary') {
    const forbidden = /直接操纵水流|凭空生成|穿透实体|无视材料|元素操控/u
    checks.push({ name: 'world-boundary', pass: !forbidden.test(descriptions), detail: descriptions.match(forbidden)?.join('、') ?? '' })
  }
  if (sample.id === 'growth-history-continuity') {
    const continuityTerms = ['主动', '回声', '敲击', '扰动', '声源']
    const continuityHits = continuityTerms.filter((term) => descriptions.includes(term))
    checks.push({ name: 'growth-history-continuity', pass: continuityHits.length >= 1, detail: continuityHits })
  }
  return { needsGrowth: true, target: decision.命格血脉编号, routes, checks, costCounts, evidence: decision.成长依据, evidenceWindowIds }
}

function checkExpectedDecision(sample, normalized) {
  if (sample.expected === 'no-growth') {
    return { name: 'expected-decision', pass: normalized.needsGrowth === false, detail: `expected no-growth, received ${String(normalized.needsGrowth)}` }
  }
  if (sample.expected === 'select-tide-listener') {
    return { name: 'expected-decision', pass: normalized.needsGrowth === true && normalized.target === 'lineage:tide-listener', detail: `target=${String(normalized.target)}` }
  }
  return { name: 'expected-decision', pass: normalized.needsGrowth === true, detail: `expected growth, received ${String(normalized.needsGrowth)}` }
}

async function callDeepSeek(apiKey, messages) {
  const startedAt = Date.now()
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0,
      stream: false,
      thinking: { type: 'disabled' },
    }),
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`)
  const payload = JSON.parse(responseText)
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek returned no final text')
  return {
    latencyMs: Date.now() - startedAt,
    finishReason: payload.choices?.[0]?.finish_reason ?? null,
    usage: payload.usage ?? {},
    content,
  }
}

async function main() {
  const apiKey = readLocalEnv('DEEPSEEK_API_KEY')
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured in the environment or .env.local')
  const requestedSamples = process.argv.slice(2)
  const sampleIds = requestedSamples.length > 0
    ? requestedSamples
    : DEFAULT_TALENT_GROWTH_LIVE_EVAL_SAMPLES
  const results = []
  for (const sampleId of sampleIds) {
    const sample = buildTalentGrowthLiveEvalSample(sampleId)
    const promptInput = buildTalentGrowthLiveEvalPrompt(sample)
    const messages = [
      { role: 'system', content: COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT },
      ...promptInput.userSegments.map((content) => ({ role: 'user', content })),
    ]
    for (let attempt = 1; attempt <= REQUESTS_PER_SAMPLE; attempt += 1) {
      try {
        const response = await callDeepSeek(apiKey, messages)
        const quality = inspectNarrativeTalentGrowthQuality(response.content)
        const normalized = quality.valid && quality.result
          ? normalizeRouteResult(quality.result, sample, promptInput)
          : { needsGrowth: null, target: null, routes: [], checks: [] }
        normalized.checks.push(checkExpectedDecision(sample, normalized))
        results.push({
          sample: sampleId,
          attempt,
          expected: sample.expected,
          promptVersion: narrativeTalentGrowthPrompt.version,
          provider: PROVIDER,
          model: MODEL,
          eligibleCount: promptInput.eligiblePatterns.length,
          inputChars: messages.reduce((sum, message) => sum + message.content.length, 0),
          latencyMs: response.latencyMs,
          finishReason: response.finishReason,
          usage: {
            promptTokens: response.usage.prompt_tokens ?? null,
            completionTokens: response.usage.completion_tokens ?? null,
            promptCacheHitTokens: response.usage.prompt_cache_hit_tokens ?? null,
            promptCacheMissTokens: response.usage.prompt_cache_miss_tokens ?? null,
            reasoningTokens: response.usage.completion_tokens_details?.reasoning_tokens ?? response.usage.reasoning_tokens ?? null,
          },
          protocolValid: quality.valid,
          protocolReason: quality.valid ? '' : quality.reason,
          ...normalized,
        })
      } catch (error) {
        results.push({ sample: sampleId, attempt, expected: sample.expected, promptVersion: narrativeTalentGrowthPrompt.version, provider: PROVIDER, model: MODEL, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  const completed = results.filter((item) => !item.error)
  const qualityValid = completed.filter((item) => item.protocolValid)
  const routeChecks = qualityValid.flatMap((item) => item.checks)
  const failures = routeChecks.filter((item) => !item.pass)
  const summary = {
    test: 'live DeepSeek talent-growth evaluation',
    promptVersion: narrativeTalentGrowthPrompt.version,
    provider: PROVIDER,
    model: MODEL,
    requests: results.length,
    httpSuccesses: completed.length,
    protocolValid: qualityValid.length,
    errors: results.filter((item) => item.error).length,
    latencyMs: completed.map((item) => item.latencyMs),
    latencyAvgMs: completed.length ? Math.round(completed.reduce((sum, item) => sum + item.latencyMs, 0) / completed.length) : null,
    latencyP95Ms: completed.length ? [...completed.map((item) => item.latencyMs)].sort((a, b) => a - b)[Math.min(completed.length - 1, Math.ceil(completed.length * 0.95) - 1)] : null,
    promptTokens: completed.map((item) => item.usage.promptTokens),
    completionTokens: completed.map((item) => item.usage.completionTokens),
    localCheckFailures: failures.length,
    failures,
    results,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (summary.errors > 0 || summary.protocolValid < summary.httpSuccesses || summary.localCheckFailures > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(`[narrative-talent-growth-live-eval] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
