/**
 * Purpose: Audit the 01/02/03 Prompt responsibilities and runtime ownership boundaries.
 * Owner: quality:narrative
 * Responsibility: Schema isolation, stage ownership, and absence of local story-text inference only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { readDirectorySource, readModuleSource } from '../../lib/read-module-source.mjs'
import {
  NarrativeAIBranchSchema,
  NarrativeAIStoryContinuityDataSchema,
  NarrativeAITalentGrowthDataSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'

const root = getProjectRoot(import.meta.url)
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const sources = {
  campaign: read('src/mods/mod-engine/campaigns/default/index.ts'),
  parser: read('src/mods/mod-engine/subsystems/narrative-parser-system.ts'),
  orchestrator: readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root),
  mainPrompt: read('src/mods/mod-engine/prompts/narrative-prompt.ts'),
  mainSystemPrompt: read('src/mods/mod-engine/server/narrative-system-prompt.ts'),
  continuityPrompt: read('src/mods/mod-engine/server/narrative-story-continuity-system-prompt.ts'),
  talentPrompt: read('src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts'),
  continuityContext: read('src/mods/mod-engine/helpers/narrative-story-continuity-context.ts'),
  talentContext: read('src/mods/mod-engine/helpers/narrative-talent-growth-context.ts'),
  protocol: read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts'),
  quality: read('src/mods/mod-engine/helpers/narrative-response-quality.ts'),
  contexts: readDirectorySource('src/mods/mod-engine/helpers', root),
  characterBase: readModuleSource('src/mods/mod-character/subsystems/character-base-system.ts', root),
  characterCreate: readDirectorySource('src/mods/mod-pages/pages/character-create', root),
  fatePreview: readDirectorySource('src/mods/mod-pages/pages/fate-preview', root),
}

assert.match(sources.mainPrompt, /version: '7\.26\.0'/u)
assert.match(sources.mainSystemPrompt, /String\.raw/u)
assert.match(sources.mainSystemPrompt, /身份核心：单时间节点叙事生成器/u)
assert.match(sources.mainSystemPrompt, /本次调用只生成当前节点的一条事件叙事/u)
assert.match(sources.mainSystemPrompt, /只写当前节点，不跨时间，不总结一生，不输出多条。/u)
assert.match(sources.mainSystemPrompt, /只读的前情记忆，不是本次要生成的内容。/u)
assert.match(sources.mainSystemPrompt, /仅当发生改写命运的大事级别，给出三个不同的命运走向/u)
assert.match(sources.mainSystemPrompt, /命运抉择字段内容，是上一轮的命运走向选择的内容。/u)
assert.match(sources.mainSystemPrompt, /定义世界为什么样，决定什么合理。/u)
assert.match(sources.mainSystemPrompt, /上下极限为±10边界，超凡可突破±10/u)
assert.match(sources.mainSystemPrompt, /第二人称代指玩家。现代白话为主，古风点缀。正文100-200字。/u)
assert.match(sources.mainSystemPrompt, /【年龄:X岁\|心智:x\|体魄:x\|魅力:x\|家境:x】/u)
assert.match(sources.mainSystemPrompt, /"命运分支"/u)
assert.match(sources.mainSystemPrompt, /"结局"/u)
assert.doesNotMatch(sources.mainSystemPrompt, /人生重开模拟器体例|年龄边界|每轮状态变化必须要大/u)
assert.doesNotMatch(sources.mainSystemPrompt, /你是一个“人生重开模拟器”系统|事件必须完整：事件→直接结果→外部回响→状态改变→收束/u)
assert.doesNotMatch(sources.mainSystemPrompt, /输出契约|世界故事模拟器|正文规则|终态边界|决策流程/u)
assert.doesNotMatch(sources.mainSystemPrompt, /最近两轮详细剧情|先读取最近两轮/u)
assert.doesNotMatch(sources.mainSystemPrompt, /examples\s*:/u)
assert.doesNotMatch(sources.mainSystemPrompt, /详细示例|示例正文|例如：/u)
assert(NarrativeAIBranchSchema.safeParse({ 选项: ['你继续勘查', '你暂时撤回'] }).success)
assert(NarrativeAIBranchSchema.safeParse({ 选项: ['你先观察', '你请求协助', '你调整工具', '你退出现场'] }).success)
assert.equal(NarrativeAIBranchSchema.safeParse({ 选项: ['你继续勘查'] }).success, false)
assert.equal(NarrativeAIBranchSchema.safeParse({ 选项: ['一', '二', '三', '四', '五'] }).success, false)

assert.match(sources.continuityPrompt, /人生模拟器的故事连续性提取器/u)
assert.match(sources.continuityPrompt, /本轮剧情/u)
assert.match(sources.continuityPrompt, /未来事件/u)
assert.match(sources.continuityPrompt, /时间.*剧情.*权重/u)
assert.match(sources.talentPrompt, /天赋成长的推演者/u)
assert.match(sources.talentPrompt, /下一等级/u)
assert.match(sources.talentPrompt, /深度强化、广度强化、转变强化/u)
assert.match(sources.talentPrompt, /转变强化改变作用方式，不额外扩大影响总量/u)
assert.match(sources.talentPrompt, /长期积累/u)
assert.match(sources.talentPrompt, /时间沉淀/u)
assert.match(sources.talentPrompt, /明确契机/u)
assert.match(sources.talentPrompt, /三项共同成立/u)
assert.doesNotMatch(sources.talentPrompt, /感知[^\n]{0,80}不得[^\n]{0,80}(?:创造|消除|操控)/u)
assert.doesNotMatch(sources.talentPrompt, /判断[^\n]{0,80}不得[^\n]{0,80}(?:创造|消除|操控)/u)
for (const prompt of [sources.continuityPrompt, sources.talentPrompt]) {
  assert.doesNotMatch(prompt, /详细故事输出示例|示例正文|few-shot|examples\s*:/iu)
}
for (const stage of ['ai-story-continuity', 'ai-talent-growth']) {
  assert.match(
    sources.campaign,
    new RegExp(`name: '${stage}'[\\s\\S]{0,220}dependsOn: \\[\\s*'prepare-narrative'\\s*\\][\\s\\S]{0,120}parallelGroup: SPECIALIST_PARALLEL_GROUP`, 'u'),
  )
}
assert.match(
  sources.campaign,
  /dependsOn:\s*\[\s*'ai-story-continuity',\s*'ai-talent-growth',?\s*\]/u,
)
assert.equal([...sources.campaign.matchAll(/name: '(ai-[^']+)'/gu)].length, 3)

assert.match(sources.parser, /parseNarrativeResponseEnvelope\(content, options\)/u)
assert.match(sources.parser, /endingTitle/u)
assert.doesNotMatch(sources.parser, /本轮记忆|未来事件|成长判定/u)
assert.doesNotMatch(sources.orchestrator, /runNarrativePostProcessing|launchNarrativeBackgroundAnalysis|combineNarrativeBackgroundAnalysis/u)

assert(NarrativeAIStoryContinuityDataSchema.safeParse({
  本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6 }],
  未来事件: ['317年5月1日：贺峤带队检查内层石缝。'],
}).success)
assert(NarrativeAIStoryContinuityDataSchema.safeParse({
  本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6, 来源: '当前回合' }],
  未来事件: [],
}).success)
assert(NarrativeAITalentGrowthDataSchema.safeParse({
  成长判定: { 需要成长: false },
}).success)
assert(NarrativeAITalentGrowthDataSchema.safeParse({
  成长判定: {
    需要成长: true,
    命格血脉编号: 'lineage:test',
  成长依据: '既有事实明确体现了能力效果。',
  依据窗口编号: ['round:16', 'round:17'],
    下一阶方向: [
      { 路线: '深度强化', 名称: '听隙入微', 详细介绍: '能听出更细的近处渗漏差异。', 效果描述: '同类水声中更快辨清堵塞位置。', 属性加成: { 家境: 2 } },
      { 路线: '广度强化', 名称: '百流同辨', 详细介绍: '在更多水域环境中分辨异常水声。', 效果描述: '陌生河港也可依水声判断近处水路异常。', 属性加成: { 心智: 1, 家境: 1 } },
      { 路线: '转变强化', 名称: '引流成势', 详细介绍: '把对近处水压的判断化为直接引导细小水流。', 效果描述: '可改变近处少量水流的去向，但不能增大可影响的水量。', 属性加成: { 心智: -1, 家境: 3 } },
    ],
  },
}).success, 'Schema 必须允许转变路线从感知判断质变为直接操控类')
const continuityOrder = ['历史剧情:', '待压缩五轮正文:', '压缩范围:']
let continuityCursor = -1
for (const fragment of continuityOrder) {
  const index = sources.continuityContext.indexOf(fragment)
  assert(index > continuityCursor, `02 消息顺序漂移：${fragment}`)
  continuityCursor = index
}
const talentOrder = ['历史记忆:', '最近两轮详细记忆:', '玩家已选天赋:']
let talentCursor = -1
for (const fragment of talentOrder) {
  const index = sources.talentContext.indexOf(fragment)
  assert(index > talentCursor, `03 消息顺序漂移：${fragment}`)
  talentCursor = index
}
assert.doesNotMatch(sources.talentContext, /极性/u)
assert.doesNotMatch(sources.quality, /MAX_|等级总加成上限|负属性绝对值总和/u)

const approvedProtocolExports = [
  'NarrativeAIStoryResultSchema',
  'NarrativeAITalentGrowthDataSchema',
  'NarrativeAIStoryContinuityDataSchema',
]
for (const exportName of approvedProtocolExports) assert.match(sources.protocol, new RegExp(`export const ${exportName}`))
assert.equal([...sources.protocol.matchAll(/export const NarrativeAI[A-Za-z]+DataSchema/gu)].length, 2)

const textInferenceTokens = [
  'SMALL_ACTION_KEYWORDS',
  'LARGE_ACTION_KEYWORDS',
  'classifyActionScale',
  'detectStartingAge(',
  'extractFromNarrative(',
  'checkForforgetting(',
]
const inferenceOwners = [
  sources.orchestrator,
  sources.contexts,
  sources.characterBase,
  sources.characterCreate,
]
for (const token of textInferenceTokens) {
  for (const source of inferenceOwners) assert.equal(source.includes(token), false, `活动路径不得本地推断：${token}`)
}

assert.match(sources.fatePreview, /startingAge/u)
console.log('PASS: semantic-authority-audit')
