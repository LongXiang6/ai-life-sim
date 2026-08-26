#!/usr/bin/env node
/**
 * Purpose: Audit active Prompt assets for single responsibility, repeated meaning, and V5.1 guidance.
 * Owner: quality:narrative
 * Responsibility: Static Prompt audit only; it never changes runtime assets or calls a provider.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { COMPILED_NARRATIVE_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { buildDestinyPatternSystemPrompt } from '../../../../src/mods/mod-character/prompts/destiny-pattern-prompt.ts'
import { reincarnationPromotionPrompt } from '../../../../src/mods/mod-character/prompts/reincarnation-promotion-prompt.ts'
import { ENDING_REVIEW_SYSTEM_PROMPT } from '../../../../src/mods/mod-pages/pages/game-over/game-over-review.ts'
import { LIFE_SCORING_SYSTEM_PROMPT } from '../../../../src/mods/mod-pages/pages/game-over/game-over-score-generation.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0
const fail = (message) => { console.error(`FAIL: ${message}`); failed += 1 }
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const promptSources = [
  ['destiny', buildDestinyPatternSystemPrompt('action')],
  ['reincarnation', reincarnationPromotionPrompt.systemPrompt],
  ['narrative', COMPILED_NARRATIVE_SYSTEM_PROMPT],
  ['ending-review', ENDING_REVIEW_SYSTEM_PROMPT],
  ['life-score', LIFE_SCORING_SYSTEM_PROMPT],
]
const detailedExample = /药剂|遗迹|秘境|陌生观察者|神秘来客|完整故事示例|成品示例|详细剧情示例/u
for (const [name, source] of promptSources) {
  if (!source || source.trim().length < 20) fail(`${name} Prompt must contain its own active responsibility`)
  if (detailedExample.test(source)) fail(`${name} Prompt contains a detailed content example`)
}

for (const [name, source] of promptSources.slice(0, 4)) {
  if (name === 'narrative') continue
  if (/\b(?:禁止|不要|避免|不得)\b/u.test(source)) fail(`${name} Prompt still relies on negative steering`)
}

const promptBuilderSource = read('src/core/ai-service/prompt-builder.ts')
if (!promptBuilderSource.includes('userSegments: [string, string, string]')) fail('main narrative must use three dynamic segments')
const segments = buildSegmentedPrompt(narrativePrompt, {
  worldNarrativeView: { 名称: '世界事实', 描述: '稳定描述' },
  characterProfileView: { 姓名: '角色事实' },
  characterStatusView: { 年龄: 20 },
  subsystemSummaries: [],
  timelineMemory: ['已成立记忆'],
  narrativeGuidanceText: '本轮事实与方向',
})
if (segments.userSegments.length !== 3) fail('dynamic narrative assembly must produce exactly three segments')
const parsedSegments = segments.userSegments.map((segment) => JSON.parse(segment))
if (
  JSON.stringify(Object.keys(parsedSegments[0])) !== JSON.stringify(['世界'])
  || JSON.stringify(Object.keys(parsedSegments[0].世界 ?? {})) !== JSON.stringify(['名称', '描述'])
  || JSON.stringify(Object.keys(parsedSegments[1])) !== JSON.stringify(['历史连续性事实', '角色'])
  || !Array.isArray(parsedSegments[1].历史连续性事实)
  || JSON.stringify(Object.keys(parsedSegments[2])) !== JSON.stringify(['本轮事实与方向'])
  || !Array.isArray(parsedSegments[2].本轮事实与方向)
) {
  fail('main narrative segments must be standalone world, continuity-and-character, and round-facts JSON objects')
}
if (segments.userSegments.some((segment) => /⟦(?:全局信息|记忆|本轮事实与方向)⟧/u.test(segment))) {
  fail('main narrative JSON segments must not carry object-external labels')
}
try {
  const parsed = JSON.parse(COMPILED_NARRATIVE_SYSTEM_PROMPT)
   const expectedKeys = ['身份', '目标', '输出契约']
   if (JSON.stringify(Object.keys(parsed)) !== JSON.stringify(expectedKeys)) {
     fail('main narrative fixed Prompt must contain one reasonable-narrative target and the output contract')
   }
   if (parsed.身份 !== '故事叙事生成器' || !parsed.目标?.includes('合理的当前故事') || parsed.目标.includes('连贯、可继续')) {
     fail('main narrative fixed Prompt must contain only the reasonable-narrative target')
   }
  if (!parsed.输出契约?.字段定义 || !Array.isArray(parsed.输出契约?.不变量)) {
    fail('main narrative fixed Prompt must expose field definitions and invariants')
  }
   for (const forbiddenKey of ['输入映射', '决策流程', '正文规则', '终态边界']) {
    if (Object.prototype.hasOwnProperty.call(parsed, forbiddenKey)) fail(`main narrative fixed Prompt must not retain ${forbiddenKey}`)
  }
} catch {
  fail('main narrative fixed Prompt must be valid JSON')
}

const gameOverReview = read('src/mods/mod-pages/pages/game-over/game-over-review.ts')
const gameOverScore = read('src/mods/mod-pages/pages/game-over/game-over-score-generation.ts')
if (!gameOverReview.includes('七言四句') || !gameOverReview.includes('90') || !gameOverReview.includes('150')) {
  fail('ending review Prompt must own the V5.1 review length and seven-character poem contract')
}
if (!gameOverScore.includes('五个维度') || !gameOverScore.includes('平均') || !gameOverScore.includes('维度名称')) {
  fail('life score Prompt must let AI define five world-appropriate dimensions and average them')
}

const duplicateMeaning = new Map()
for (const [name, source] of promptSources) {
  const normalized = source
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 120)
  if (duplicateMeaning.has(normalized)) fail(`${name} duplicates the opening responsibility of ${duplicateMeaning.get(normalized)}`)
  else duplicateMeaning.set(normalized, name)
}

if (failed > 0) process.exit(1)
console.log('[kv-prompt-audit] PASS: active Prompt duties are separated and V5.1-guided')
