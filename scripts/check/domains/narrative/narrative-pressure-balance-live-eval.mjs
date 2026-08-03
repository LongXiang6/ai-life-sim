#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import {
  buildNarrativeRepairInstruction,
  inspectNarrativeResponseQuality,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { buildTimeScaleNarrativeHint } from '../../../../src/mods/mod-engine/helpers/time-scale-narrative.ts'
import { parseNarrativeResponseEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import {
  compileNarrativeDynamicComponents,
  createNarrativeRepairComponent,
} from '../../../../src/mods/mod-engine/prompts/narrative-prompt-components.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { COMPILED_NARRATIVE_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'

const PROVIDER = 'deepseek'
const MODEL = 'deepseek-v4-flash'
const ENDPOINT = 'https://api.deepseek.com/chat/completions'

const CASES = [
  {
    id: 'BAL-01',
    requirement: '新能力在无监管规则时可以直接兑现成果，不自动引入机构审查',
    world: '溪谷镇把治愈术视为与木工、草药相同的普通手艺，居民按师徒传承和公开实践自由学习，是否请人治疗只看口碑与实际效果。',
    character: '你十八岁，刚在导师指导下稳定掌握微光治愈术，材料充足，身体健康，与邻里关系良好。',
    history: '上一轮你完成了最后一次练习，导师确认术式稳定，并请你今天为扭伤脚踝的木匠处理伤势。',
    guidance: '围绕第一次独立施术写一个完整现场，让既有准备产生本轮可见结果。',
    forbidden: ['审查', '鉴定', '登记', '封存', '许可', '官方', '监管'],
    expectedAny: ['成功', '稳定', '缓解', '恢复', '认可', '笑', '感谢', '站起来', '接得住', '铜钱', '好了', '不疼'],
  },
  {
    id: 'BAL-02',
    requirement: '世界规则和前序事件已建立时，机构介入仍然有效',
    world: '赤塔城明文规定所有高阶火术必须登记。城防术师会对曾引发公共事故的人进行复核，这是公开且持续执行的城市规则。',
    character: '你二十二岁，正在学习高阶火术，三个月前的失控曾烧坏公共训练场，已经收到今天到塔楼复核的正式通知。',
    history: '上一轮城防术师把盖有印章的复核通知交到你手中，并列明安全演示项目。',
    guidance: '兑现已经建立的复核事项，写清准备、演示与本轮结果，不新增无关势力。',
    forbidden: ['陌生人', '蓝袍', '暗中', '跟踪', '监视', '盯着', '事情不会就这么结束', '另一个势力'],
    expectedAny: ['复核', '城防', '术师', '塔楼', '登记'],
  },
  {
    id: 'BAL-03',
    requirement: '已经解决的审查障碍不得换名重复，主线应转向掌握和成果',
    world: '远航学院的入学核验只进行一次，完成后学员可在课程规则内自由训练。',
    character: '你十九岁，入学核验和身份确认都已完成并正式结案，现在拥有训练室使用权和完整课程材料。',
    history: '前两轮已经完成材料检查与身份复核，档案员明确宣布手续结案。本轮是你的首次正式导航训练。',
    guidance: '写首次导航训练中的学习、发现与可见进展，不回到已经结案的手续。',
    forbidden: ['再次审查', '重新鉴定', '补充登记', '二次复核', '重新核验', '档案调查'],
    expectedAny: ['掌握', '发现', '进展', '完成', '成功', '领会', '改向', '省半天', '计算', '轨迹', '标注', '航线'],
  },
  {
    id: 'BAL-04',
    requirement: '开局可以普通、稳定或有利，不默认贫困羞辱和资格审查模板',
    world: '青禾村多年安稳，公共粮仓充足，邻里互助是常态，近期没有战争、灾荒或制度性排斥。',
    character: '你出生在关系和睦的木匠家庭，父母健康，收入稳定，亲友已经准备好迎接你的出生。',
    history: '',
    guidance: '这是零岁开场，只写出生与家世，用一个具体家庭现场建立后续生活起点。',
    forbidden: ['贫困', '羞辱', '资格审查', '被针对', '不配', '拖欠', '驱逐'],
    expectedAny: ['安稳', '温暖', '笑', '迎接', '祝福', '照料'],
  },
]

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
  try {
    return parseNarrativeResponseEnvelope(content).narrative
  } catch {
    return undefined
  }
}

function buildMessages(testCase) {
  const segments = buildSegmentedPrompt(narrativePrompt, {
    worldNarrativeView: testCase.world,
    characterProfileView: testCase.character,
    characterStatusView: testCase.character,
    currentTime: '当前纪年 · 春 · 4月',
    timelineMemory: testCase.history
      ? `【时间轴记忆】\n【时间阶段：前情】\n- [前情] ${testCase.history}`
      : undefined,
    narrativeGuidanceText: testCase.guidance,
    timeGuideText: buildTimeScaleNarrativeHint({ unit: 'year', value: 1 }),
    wordCountInstruction: '篇幅约200字，只作节奏参考；剧情需要时可以自然超出。',
  })
  if (segments.messages) {
    return [
      { role: 'system', content: COMPILED_NARRATIVE_SYSTEM_PROMPT },
      ...segments.messages.filter((message) => message.role !== 'system'),
    ]
  }
  const userSegments = segments.userSegments ?? [segments.full]
  return [
    { role: 'system', content: COMPILED_NARRATIVE_SYSTEM_PROMPT },
    ...userSegments.map((content) => ({ role: 'user', content })),
  ]
}

async function callModel(apiKey, messages, signal) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.65,
      stream: false,
      thinking: { type: 'disabled' },
    }),
    signal,
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${responseText}`)
  const payload = JSON.parse(responseText)
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek returned no final text')
  return { payload, content }
}

async function runCase(apiKey, testCase) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  const startedAt = Date.now()
  try {
    const messages = buildMessages(testCase)
    const initial = await callModel(apiKey, messages, controller.signal)
    let payload = initial.payload
    let content = initial.content
    let body = extractBody(content)
    let repaired = false
    if (!body) {
      const quality = inspectNarrativeResponseQuality(content, 200)
      const repairInstruction = compileNarrativeDynamicComponents([
        createNarrativeRepairComponent(buildNarrativeRepairInstruction(quality, 200)),
      ]) ?? ''
      const repair = await callModel(apiKey, [
        ...messages,
        { role: 'assistant', content },
        { role: 'user', content: repairInstruction },
      ], controller.signal)
      payload = repair.payload
      content = repair.content
      body = extractBody(content)
      repaired = true
    }
    if (!body) {
      console.error(JSON.stringify({ id: testCase.id, malformedContent: content }, null, 2))
      throw new Error('Narrative response still violates the strict first-call protocol after one application-equivalent repair')
    }
    const forbiddenHits = testCase.forbidden.filter((term) => body.includes(term))
    const expectedHits = testCase.expectedAny.filter((term) => body.includes(term))
    return {
      id: testCase.id,
      requirement: testCase.requirement,
      passed: forbiddenHits.length === 0 && expectedHits.length > 0,
      forbiddenHits,
      expectedHits,
      repaired,
      latencyMs: Date.now() - startedAt,
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
      body,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const apiKey = readLocalEnv('DEEPSEEK_API_KEY')
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured in the environment or .env.local')

  const results = []
  for (const testCase of CASES) results.push(await runCase(apiKey, testCase))

  console.log(JSON.stringify({
    promptVersion: narrativePrompt.version,
    provider: PROVIDER,
    model: MODEL,
    passed: results.every((result) => result.passed),
    results,
  }, null, 2))

  if (results.some((result) => !result.passed)) process.exit(1)
}

main().catch((error) => {
  console.error(`[narrative-pressure-balance-live-eval] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
