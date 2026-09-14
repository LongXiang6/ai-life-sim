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
import {
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_CATEGORY_ORDER,
} from '../../../../src/mods/mod-character/constants.ts'
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
for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
  const source = buildDestinyPatternSystemPrompt(category)
  const config = DESTINY_PATTERN_CATEGORY_CONFIG[category]
  if (!source.includes(config.label) || !source.includes(config.guidance)) {
    fail(`destiny ${category} Prompt must carry its own primary-mechanism guidance`)
  }
}
const detailedExample = /药剂|遗迹(?!发现)|秘境|陌生观察者|神秘来客|完整故事示例|成品示例|详细剧情示例/u
for (const [name, source] of promptSources) {
  if (!source || source.trim().length < 20) fail(`${name} Prompt must contain its own active responsibility`)
  if (detailedExample.test(source)) fail(`${name} Prompt contains a detailed content example`)
}

for (const [name, source] of promptSources.slice(0, 4)) {
  if (name === 'narrative') continue
  if (/\b(?:禁止|不要|避免|不得)\b/u.test(source)) fail(`${name} Prompt still relies on negative steering`)
}

const promptBuilderSource = read('src/core/ai-service/prompt-builder.ts')
if (!promptBuilderSource.includes('userSegments: string[]')) fail('main narrative must expose the data-layer user message')
const segments = buildSegmentedPrompt(narrativePrompt, {
  worldNarrativeView: { 名称: '世界事实', 描述: '稳定描述' },
  characterProfileView: {
    姓名: '角色事实',
    基础属性: {},
  },
  characterStatusView: {
    年龄: 20,
    属性数值: { mind: 2, physique: 1, charisma: -1, familyBackground: 3 },
  },
  subsystemSummaries: [],
  timelineMemory: ['已成立记忆'],
  narrativeGuidanceText: '本轮事实与方向',
})
if (segments.userSegments.length !== 1) fail('dynamic narrative assembly must produce one data-layer message')
const parsedSegments = JSON.parse(segments.userSegments[0])
if (
  Array.isArray(parsedSegments)
  || JSON.stringify(Object.keys(parsedSegments)) !== JSON.stringify([
    '世界',
    '玩家信息',
    '历史事件上下文',
    '玩家本节点属性',
    '本节点信息',
  ])
  || JSON.stringify(Object.keys(parsedSegments.世界 ?? {})) !== JSON.stringify(['名称', '描述'])
  || JSON.stringify(Object.keys(parsedSegments.玩家信息 ?? {})) !== JSON.stringify(['姓名', '性别', '种族', '背景', '天赋技能'])
  || JSON.stringify(Object.keys(parsedSegments.历史事件上下文 ?? {})) !== JSON.stringify(['节点事件'])
  || !Array.isArray(parsedSegments.历史事件上下文?.节点事件)
  || JSON.stringify(Object.keys(parsedSegments.玩家本节点属性 ?? {})) !== JSON.stringify(['心智', '体魄', '魅力', '家境'])
  || Object.values(parsedSegments.玩家本节点属性 ?? {}).some((value) => typeof value !== 'string' || !/^-?\d+$/u.test(value))
  || JSON.stringify(Object.keys(parsedSegments.本节点信息 ?? {})) !== JSON.stringify(['时间节点', '当前状态'])
) {
  fail('main narrative data layer must match the five-field world, player, history, attributes, and current-node contract')
}
if (/⟦(?:全局信息|记忆|本轮素材)⟧/u.test(segments.userSegments[0])) {
  fail('main narrative data layer must not carry object-external labels')
}
if (
  !COMPILED_NARRATIVE_SYSTEM_PROMPT.startsWith('身份：')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('你是一个离散化人生模拟器')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('你的输出是一条已经结算的人生事件，而不是对生活过程的连续记录。')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('每个时间节点都重新观察世界与玩家，从当前可能发生的变化中独立选择一件事件。')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('离散化的目的，是让不同时间节点成为彼此独立的人生切片')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('世界与玩家同时运行')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('输出的是这一节点最值得记录的事实')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('采用结果式叙述')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('历史主要承担一致性与去重作用')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('心智、体魄、魅力、家境表示玩家当前状态')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('只有本次事件自然形成重大人生转折时才生成三个命运走向，否则为null')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('使用第二人称。')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('正文100-200字。')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('输出格式：')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('"命运分支": null或者["选项一", "选项二", "选项三"],')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('"结局": null或者["四字评语", "一句最终总结"]')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('"命运分支"')
  || !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('"结局"')
) {
  fail('main narrative fixed Prompt must contain the current single-node narrative rules and output format')
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
