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

assert.match(sources.mainPrompt, /version: '10\.0\.0'/u)
assert(
  sources.orchestrator.includes('const openingTalents = selectedPatterns.map')
    && sources.orchestrator.includes('growthHistory')
    && sources.orchestrator.includes('.sort((left, right) => left.source.version - right.source.version)')
    && sources.orchestrator.includes('birthContext: {')
    && sources.orchestrator.includes('getAttrSemantic'),
  '出生控制平面必须从开局天赋版本投影属性语义与天赋输入',
)
assert(
  sources.mainSystemPrompt.includes('你是人生模拟器')
    && sources.mainSystemPrompt.includes('角色是中心')
    && sources.mainSystemPrompt.includes('历史是已经发生的人生')
    && sources.mainSystemPrompt.includes('正文像人生小说的一章，不是因果报告')
    && sources.mainSystemPrompt.includes('允许概括、跳跃、留白')
    && sources.mainSystemPrompt.includes('“人生规划”和“事件卡池”只是软提示')
    && sources.mainSystemPrompt.includes('事件卡池只提供卡名')
    && sources.mainSystemPrompt.includes('属性只写发生持续变化的项')
    && sources.mainSystemPrompt.includes('一次最多返回 10 轮')
    && !sources.mainSystemPrompt.includes('先形成改变玩家社会位置'),
  '主故事 Prompt 必须保持角色中心、正文优先和不设事件配额',
)
const eventCardCallSource = read('src/mods/mod-engine/helpers/narrative-control-plane-call.ts')
assert(
  eventCardCallSource.includes('{"事件卡":[{"名称":"","正负":"正","权重":3}]}')
    && eventCardCallSource.includes('卡不是事实')
    && !/生命周期|适用阶段|持续条件|最低合龄/u.test(eventCardCallSource)
    && ['15%', '抽 3 张', '抽三张', '手牌', '难度权重', 'DIFFICULTY_FATE_WEIGHTS', 'DIFFICULTY_NEGATIVE_EVENT_CEILINGS', '最低合龄']
      .every((banned) => !sources.mainSystemPrompt.includes(banned) && !eventCardCallSource.includes(banned))
    && !read('src/foundation/types/narrative/control-plane.ts').includes('最低合龄') && !read('src/mods/mod-engine/helpers/narrative-control-plane-normalizers.ts').includes('最低合龄'),
  '事件卡只声明 名称/正负/权重，不写合龄、生命周期或阶段，也不残留抽卡概率、手牌与难度权重',
)
assert.equal([...sources.mainSystemPrompt.matchAll(/【示例\d｜/gu)].length, 0, '主故事固定资产不得再携带示例矩阵')
assert(
  ['# 角色', '# 输入', '# 写法', '# 输出'].every((heading) => sources.mainSystemPrompt.includes(heading))
    && ['【输入1：世界】', '【输入2：玩家】', '【输入3：历史】', '【输入4：属性】', '【输入5：本次条件】']
      .every((heading) => sources.mainSystemPrompt.includes(heading)),
  '主故事 Prompt 必须保持角色、输入、写法、输出与五段动态输入结构',
)
assert(
  sources.fatePreview.includes('初临此世')
    && sources.fatePreview.includes('你的来处')
    && !sources.fatePreview.includes('出生事实'),
  '命运预览的出生板块必须使用沉浸式栏目名',
)
for (const phrase of [
  '只返回一个合法 JSON 对象',
  '事件卡消费（可选）',
  '天赋表现线索（可选）',
  '命运分支：本轮自然形成',
  '结局：人生不可逆终态',
  '角色死亡：明确死亡时',
]) assert(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(phrase), phrase)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /【输入1：世界】/u)
assert.match(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /【输入5：本次条件】/u)
assert.doesNotMatch(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, /代码区块|时间定位|事件结果|自然寿命变化/u)
for (const field of ['"正文"', '"属性"', '"命运分支"', '"结局"', '"角色死亡"']) {
  assert(COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(field))
}
assert(NarrativeAIBranchSchema.safeParse({ 选项: ['你继续勘查', '你暂时撤回'] }).success)
assert(NarrativeAIBranchSchema.safeParse({ 选项: ['你先观察', '你请求协助', '你调整工具', '你退出现场'] }).success)
assert.equal(NarrativeAIBranchSchema.safeParse({ 选项: ['你继续勘查'] }).success, false)
assert.equal(NarrativeAIBranchSchema.safeParse({ 选项: ['一', '二', '三', '四', '五'] }).success, false)

assert.match(sources.continuityPrompt, /人生模拟器的故事连续性提取器/u)
assert.match(sources.continuityPrompt, /本轮剧情/u)
assert.match(sources.continuityPrompt, /未来事件/u)
assert.match(sources.continuityPrompt, /时间.*剧情.*权重/u)
assert.match(sources.talentPrompt, /天赋进阶路线生成器/u)
assert.match(sources.talentPrompt, /机缘已经由程序确认/u)
assert.match(sources.talentPrompt, /不因世界没有同类力量体系而否定或降格/u)
assert.match(sources.talentPrompt, /目标开发阶段/u)
assert.match(sources.talentPrompt, /深度强化、广度强化、转变强化/u)
assert.match(sources.talentPrompt, /转变强化依据本局经历和机缘气质重塑机制组合/u)
assert.match(sources.talentPrompt, /三条路线都必须保留当前已经成立的核心能力/u)
assert.match(sources.talentPrompt, /不得削弱、删除、倒退/u)
assert.match(sources.talentPrompt, /三条路线都从当前版本出发/u)
assert.doesNotMatch(sources.talentPrompt, /每条路线保留同一命格的核心来源|不额外扩大影响总量|凡俗可及/u)
assert.match(sources.talentPrompt, /长期积累/u)
assert.match(sources.talentPrompt, /机缘类型/u)
assert.match(sources.talentPrompt, /禁止返回不成长/u)
assert.doesNotMatch(sources.talentPrompt, /突破契机|明确契机|三项共同成立/u)
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
assert.doesNotMatch(sources.parser, /eventResults|naturalLifespanDeltaYears|时间定位|事件结果|自然寿命变化/u)
assert.doesNotMatch(sources.orchestrator, /eventResults|naturalLifespanDeltaYears/u)
assert.doesNotMatch(sources.parser, /本轮记忆|未来事件|成长判定/u)
assert.doesNotMatch(sources.orchestrator, /runNarrativePostProcessing|launchNarrativeBackgroundAnalysis|combineNarrativeBackgroundAnalysis/u)
assert(
  !sources.protocol.includes('来源回合: z.number().int().positive(),')
    && sources.campaign.includes('sourceRound: preparedNarrative.roundSequence')
    && !sources.campaign.includes('hint.来源回合 !=='),
  '天赋线索来源回合必须由引擎按本轮记录，模型不输出回合号',
)
assert.doesNotMatch(sources.protocol, /NarrativeAIEventResult|时间定位|事件结果|自然寿命变化/u)

assert(NarrativeAIStoryContinuityDataSchema.safeParse({
  本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6 }],
  未来事件: ['317年5月1日：贺峤带队检查内层石缝。'],
}).success)
assert(NarrativeAIStoryContinuityDataSchema.safeParse({
  本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6, 来源: '当前回合' }],
  未来事件: [],
}).success)
assert(NarrativeAITalentGrowthDataSchema.safeParse({
  命格血脉编号: 'lineage:test',
  机缘类型: '顿悟',
  成长依据: '既有事实明确体现了能力效果。',
  依据窗口编号: ['round:16', 'round:17'],
  下一阶方向: [
    { 路线: '深度强化', 名称: '听隙入微', 详细介绍: '能听出更细的近处渗漏差异。', 效果描述: '同类水声中更快辨清堵塞位置。', 属性加成: { 财富: 2 } },
    { 路线: '广度强化', 名称: '百流同辨', 详细介绍: '在更多水域环境中分辨异常水声。', 效果描述: '陌生河港也可依水声判断近处水路异常。', 属性加成: { 心智: 1, 财富: 1 } },
    { 路线: '转变强化', 名称: '机械共鸣', 详细介绍: '你在修复潮门机械后，能够感应并协调近处机械的运转。', 效果描述: '通过共鸣调整机械运动，不再以听潮辨隙为能力机制。', 属性加成: { 心智: 2, 财富: 1 } },
  ],
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
