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

assert.match(sources.mainPrompt, /version: '9\.26\.0'/u)
// Asset-contract checks do not establish actual generation quality.
for (const phrase of [
  "生成一段新的、已经发生并留下结果的人生记录",
  "正文是广角人生记录，不是连续小说、事项清单、家庭影响报告或单一现场的动作回放",
  "历史只提供已经成立的事实、来源、关系、身份、资源和后果，不提供本轮主题、续写顺序、段落结构或文风",
  "你是以玩家人生与世界交互为主体的文字游戏式人生重开模拟器",
  "世界按自己的规则、资源边界、相关者行动和开放可能性变化",
  "家庭只能作为玩家的背景、资源、关系或处境，不能把家庭成员的工作、搬迁、收入、手续或家庭存续写成替代玩家人生的主线",
  "玩家是事件身份、因果主线和正文重心的归属者",
  "即使玩家处于幼年或依赖阶段，也要通过合龄的感知、移动、学习、游戏、依恋、恐惧、社交、观察或选择进入因果",
  "面对非标准世界观",
  "先形成会作用于玩家的新外部局面",
  "事件结果是正文唯一的事实底稿",
  "正文使用第二人称“你/你的”",
  "细节必须服务玩家的行动、位置、关系、结果或代价",
  "可通过相关的空间、环境、光线、声音、触感、气味、物件位置或人物反应让结果可感知",
  "只返回一个合法 JSON 对象",
  "事件、成因、结果、影响"
]) assert(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(phrase), phrase)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /【输入1：世界】/u)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /【输入5：本次条件】/u)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /本次调用内依次完成：恢复世界边界和已成立事实；形成新的外部局面；裁决玩家与世界的交互、结果和代价；编译正文；结算并返回 JSON/u)
assert.doesNotMatch(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /代码区块/u)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /只返回一个合法 JSON 对象/u)
assert.doesNotMatch(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /玩家处于依赖阶段时，以外部局面和照料者的目标为事件主体/u)
assert.doesNotMatch(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /家庭日常只能作为玩家位置的证据或后果/u)
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
assert.match(sources.talentPrompt, /转变强化依据玩家本局已成立经历和突破契机重新塑造能力/u)
assert.match(sources.talentPrompt, /不要求保留最初天赋或上一版本的能力特征/u)
assert.match(sources.talentPrompt, /新天赋可以与最初天赋毫不相干/u)
assert.match(sources.talentPrompt, /深度、广度也以当前已确认版本为起点/u)
assert.doesNotMatch(sources.talentPrompt, /每条路线保留同一命格的核心来源|不额外扩大影响总量|凡俗可及/u)
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
      { 路线: '转变强化', 名称: '机械共鸣', 详细介绍: '你在修复潮门机械后，能够感应并协调近处机械的运转。', 效果描述: '通过共鸣调整机械运动，不再以听潮辨隙为能力机制。', 属性加成: { 心智: 2, 财富: 1 } },
    ],
  },
}).success, 'Schema 必须允许转变路线跨越能力类型，不以原能力相似度过滤')
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

