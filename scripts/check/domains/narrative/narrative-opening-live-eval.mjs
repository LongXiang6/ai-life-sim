#!/usr/bin/env node

/**
 * Purpose: Live regression for random complete-story generation and round variation.
 * Owner: quality:narrative
 * Responsibility: Validate prompt behavior without owning runtime state.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { parseNarrativeResponseEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { composeNarrativeUserMessage } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import { buildWordCountInstruction, DEFAULT_WORD_COUNT_TARGET } from '../../../../src/mods/mod-engine/constants/narrative-config.ts'
import { projectNarrativeResultForPrompt } from '../../../../src/mods/mod-engine/helpers/timeline-memory.ts'

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

function extractEnvelope(content) {
  try {
    return parseNarrativeResponseEnvelope(content)
  } catch {
    return undefined
  }
}

function firstNarrativeLine(body) {
  return body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
}

function detectedTimeMarkers(body) {
  return [...new Set(body.match(
    /(?:第?[零〇一二两三四五六七八九十百千\d]+个?(?:岁|年|月|日|天|夜|周|旬|季|季度|时辰|小时|分钟)(?:前|后|间|内|中|来)?|(?:今年|去年|明年|这年|那年|当年|次年|翌年|今夜|昨夜|明夜|那夜|今晚|明晚|翌日|次日|第二天|不久后|数日后|多年后|天亮后|入夜后|开春|入春|入夏|入秋|入冬|春末|夏末|秋末|冬末|年初|年末|年底|一整季))/gu,
  ) ?? [])]
}

function buildMessages(round, history) {
  const currentAge = 17 + round
  const recentHistory = history.slice(-3)
  const firstRecentRound = round - recentHistory.length
  const context = {
    worldNarrativeView: {
      名称: '潮汐群岛',
      描述: '群岛社会由多个自治城邦与海岸聚落组成，海贸和有限潮汐术影响生产与政治秩序，世界遵循既有资源与力量边界。',
    },
    characterProfileView: {
      姓名: '林汐',
      性别: '女',
      种族: '人类',
      背景: '修船匠家庭出身，擅长辨认潮声，重视承诺，但没有未经训练的超凡能力。',
      基础属性: {},
    },
    characterStatusView: {
      年龄: currentAge,
    },
    currentTime: `大曜历${currentAge}年 · 事件${round}`,
    narrativeAddressing: 'second-person',
    wordCountInstruction: buildWordCountInstruction(DEFAULT_WORD_COUNT_TARGET),
    talents: [],
    recentStories: recentHistory.map((text, index) => projectNarrativeResultForPrompt({
      text,
      displayAge: 17 + firstRecentRound + index,
    })),
  }
  const segments = buildSegmentedPrompt(narrativePrompt, context)
  return [{ role: 'user', content: composeNarrativeUserMessage(segments.userSegments[0]) }]
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
        stream: false,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${responseText}`)
    const payload = JSON.parse(responseText)
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek returned no final text')
    const envelope = extractEnvelope(content)
    const body = envelope?.narrative
    if (!body) throw new Error('Narrative response does not contain a usable story body')
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
    const timeMarkers = detectedTimeMarkers(result.body)
    results.push({
      round,
      body: result.body,
      firstLine: result.firstLine,
      genericTimeOpening,
      timeMarkers,
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
  const timeMarkerRoundCount = results.filter((result) => result.timeMarkers.length > 0).length
  console.log(JSON.stringify({
    requirement: 'four sequential random stories use the formal five-segment history input',
    promptVersion: narrativePrompt.version,
    provider: PROVIDER,
    model: MODEL,
    genericOpeningCount,
    repeatedOpeningCount,
    timeMarkerRoundCount,
    results,
  }, null, 2))

  if (genericOpeningCount > 0 || repeatedOpeningCount > 0 || timeMarkerRoundCount > 0) process.exit(1)
}

main().catch((error) => {
  console.error(`[narrative-opening-live-eval] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
