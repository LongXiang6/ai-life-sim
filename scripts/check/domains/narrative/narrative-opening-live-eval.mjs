#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { buildTimeScaleNarrativeHint } from '../../../../src/mods/mod-engine/helpers/time-scale-narrative.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'

const PROVIDER = 'deepseek'
const MODEL = 'deepseek-v4-flash'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const ROUNDS = 4

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

function extractBody(content) {
  const start = content.indexOf('⟦正文⟧')
  const end = content.indexOf('⟦摘要⟧', start + 1)
  if (start < 0 || end < 0) return undefined
  return content.slice(start + '⟦正文⟧'.length, end).trim()
}

function firstNarrativeLine(body) {
  return body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
}

function buildMessages(round, history) {
  const year = 1998 + round
  const context = {
    worldNarrativeView: '潮汐群岛由航海城邦与旧灯塔共同维系。海雾、贸易和潮汐术都服从已建立的资源与社会规则。',
    characterProfileView: '你出身修船匠家庭，擅长辨认潮声，重视承诺，但没有未经训练的超凡能力。',
    characterStatusView: `你${17 + round}岁，目前在北港灯塔做学徒，正在追查父亲失踪前留下的航线缺口。`,
    currentTime: `${year}年 · 春 · 4月`,
    narrativeHistory: history,
    recentNarrativeMemory: history.length > 0 ? history.join('\n\n') : undefined,
    narrativeGuidanceText: [
      '本轮围绕同一条主线推进：港务官突然封存旧航海图，你必须决定如何保住调查线索。',
      '直接写可感知现场、具体动作、他人回应和本轮后果；不要写年度总结。',
    ].join('\n'),
    timeGuideText: buildTimeScaleNarrativeHint({ unit: 'year', value: 1 }),
    wordCountInstruction: '篇幅约200字，只作节奏参考；剧情需要时可以自然超出。',
  }
  const segments = buildSegmentedPrompt(narrativePrompt, context)
  if (segments.messages) return segments.messages
  const userSegments = segments.userSegments ?? [segments.full]
  return [
    { role: 'system', content: narrativePrompt.systemPrompt },
    ...userSegments.map((content) => ({ role: 'user', content })),
  ]
}

async function callRound(apiKey, round, history) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  const startedAt = Date.now()
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(round, history),
        temperature: 0.8,
        max_tokens: 2400,
        stream: false,
        thinking: { type: 'enabled', budget_tokens: 1200 },
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${responseText}`)
    const payload = JSON.parse(responseText)
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek returned no final text')
    const body = extractBody(content)
    if (!body) throw new Error('Narrative envelope is missing body or digest markers')
    const firstLine = firstNarrativeLine(body)
    return {
      body,
      firstLine,
      latencyMs: Date.now() - startedAt,
      finishReason: payload.choices?.[0]?.finish_reason,
      usage: payload.usage,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const apiKey = readLocalEnv('DEEPSEEK_API_KEY')
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured in the environment or .env.local')

  const history = []
  const results = []
  for (let round = 1; round <= ROUNDS; round++) {
    const result = await callRound(apiKey, round, history)
    history.push(result.body)
    const genericTimeOpening = /^(?:这一年|这一月|这一天)(?:[，。！？、\s]|$)/.test(result.firstLine)
    results.push({
      round,
      firstLine: result.firstLine,
      genericTimeOpening,
      latencyMs: result.latencyMs,
      finishReason: result.finishReason,
      promptVersion: narrativePrompt.version,
      provider: PROVIDER,
      model: MODEL,
      inputTokens: result.usage?.prompt_tokens,
      outputTokens: result.usage?.completion_tokens,
    })
  }

  const normalizedOpenings = results.map((result) => result.firstLine.replace(/[，。！？].*$/, '').slice(0, 16))
  const repeatedOpeningCount = normalizedOpenings.length - new Set(normalizedOpenings).size
  const genericOpeningCount = results.filter((result) => result.genericTimeOpening).length
  console.log(JSON.stringify({
    requirement: 'four sequential annual narratives avoid generic repeated time openings',
    promptVersion: narrativePrompt.version,
    provider: PROVIDER,
    model: MODEL,
    genericOpeningCount,
    repeatedOpeningCount,
    results,
  }, null, 2))

  if (genericOpeningCount > 0 || repeatedOpeningCount > 0) process.exit(1)
}

main().catch((error) => {
  console.error(`[narrative-opening-live-eval] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
