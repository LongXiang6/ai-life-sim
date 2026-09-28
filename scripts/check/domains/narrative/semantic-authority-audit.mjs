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
import { COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'

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

assert.match(sources.mainPrompt, /version: '9\.15\.0'/u)
// Asset-contract checks do not establish actual generation quality.
for (const phrase of [
  "本轮交付一份新的、完整的、已经发生并留下结果的人生记录",
  "本轮由若干件各自落地的新事共同组成",
  "现实事实可以连续，但本轮不能自动续写上一轮的主题",
  "你是文字游戏式人生重开模拟器的世界演化与事件裁决系统",
  "恢复已成立事实后，先从世界规则、相关者行动和开放人生可能性形成新的事件局面，再判断玩家在其中的合龄因果位置并裁决事件结果，最后将结果编译为人生记录",
  "已确认的角色设定、自创成果及其来源归属是裁决依据",
  "玩家决定行动意图，你依条件裁决世界响应与未决结果，不预设成败",
  "其中尚未发生的成功、所得或数值变化仍由条件裁决，不能直接登记为事实",
  "叙事只编译结果，不反向安排事件去满足预设情节",
  "返回尚未发生的行动或发展方向选项，不预先承诺成败或所得",
  "先从世界规则、相关者行动和开放人生可能性形成新的事件局面",
  "新轮从仍开放的世界可能性中重新选题，再比较核心问题、主要行动者、因果机制、作用范围、玩家位置和结果意义",
  "把代码区块5选出的每件新事推演到现实已经改变",
  "事件结果是正文唯一的前置事实",
  "事件结果在正文提交后由叙事历史记录保存",
  "正文涉及玩家时只用“你/你的”",
  "用“事实已经发生、状态已经改变、结果已经留下”的记录口吻表达跨度",
  "玩家姓名不进入正文",
  "不要为了短把完整人生记录缩成一件小事",
  "代价来自投入、放弃和反作用",
  "惊喜和荒诞来自世界特性、偶然相遇和各方行动的交汇",
  "事件、成因、结果、影响四个字符串字段"
]) assert(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(phrase), phrase)
const stageHeadings = [
  "【代码区块1：AI身份与核心职责】",
  "【代码区块2：执行顺序与判断】",
  "【代码区块3：只读输入数据】",
  "【代码区块4：恢复本轮起点】",
  "【代码区块5：先形成世界局面，再选择离散新事】",
  "【代码区块6：形成已成立事件结果】",
  "【代码区块7：把结果压缩为广角人生记录】",
  "【代码区块8：依据结果结算】",
  "【代码区块9：完成返回】"
]
const stages = COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.split(/(?=【代码区块\d+：)/u)
assert.equal(stages.length, stageHeadings.length)
for (const [index, stage] of stages.entries()) {
  assert(stage.startsWith(stageHeadings[index]))
  const numbers = [...stage.matchAll(/^(\d+)\. /gmu)].map(match => Number(match[1]))
  if (index === 2) {
    assert.match(stage, /【输入1：世界】/u)
    assert.match(stage, /【输入5：本次条件】/u)
  } else {
    assert(numbers.length > 0)
    assert.deepEqual(numbers, numbers.map((_, index) => index + 1))
  }
}
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /编号只表示处理顺序，不表示重要程度、事件数量或正文段数/u)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /只返回一个合法 JSON 对象/u)
assert.doesNotMatch(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /作为文字游戏式人生重开模拟器的叙事引擎|五项数据是只读事实|已确认的命运方向必须落实/u)
assert.doesNotMatch(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /本轮唯一的叙事对象|形成一条完整的叙事弧线|围绕一个主要状态变化|事件抽取器|世界演变/u)
for (const field of ["\"时间定位\"","\"事件结果\"","\"正文\"","\"命运分支\"","\"属性\"","\"结局\""]) assert(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(field))
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
assert.match(sources.parser, /eventResults/u)
assert.match(sources.orchestrator, /eventResults/u)
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
      { 路线: '深度强化', 名称: '听隙入微', 详细介绍: '能听出更细的近处渗漏差异。', 效果描述: '同类水声中更快辨清堵塞位置。', 属性加成: { 财富: 2 } },
      { 路线: '广度强化', 名称: '百流同辨', 详细介绍: '在更多水域环境中分辨异常水声。', 效果描述: '陌生河港也可依水声判断近处水路异常。', 属性加成: { 心智: 1, 财富: 1 } },
      { 路线: '转变强化', 名称: '引流成势', 详细介绍: '把对近处水压的判断化为直接引导细小水流。', 效果描述: '可改变近处少量水流的去向，但不能增大可影响的水量。', 属性加成: { 心智: -1, 财富: 3 } },
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

