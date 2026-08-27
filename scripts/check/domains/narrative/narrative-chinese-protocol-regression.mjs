/**
 * Purpose: Regress the approved 01/02/03 Chinese message and response contracts.
 * Owner: quality:narrative
 * Responsibility: Dynamic message fixtures, tolerant story parsing, and strict post-call Schemas only.
 */

import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { parseAIJSON } from '../../../../src/core/ai-service/parse-ai-json.ts'
import {
  NarrativeAIStoryContinuityDataSchema,
  NarrativeAITalentGrowthDataSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import {
  inspectNarrativeResponseQuality,
  inspectNarrativeStoryContinuityQuality,
  inspectNarrativeTalentGrowthQuality,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { buildNarrativeTalentGrowthPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-talent-growth-context.ts'
import {
  createPendingDestinyPatternGrowth,
  registerPendingDestinyPatternGrowthInState,
  validateDestinyPatternAttrBonusForRarity,
} from '../../../../src/mods/mod-character/destiny-pattern-growth.ts'
import { sanitizeCharacterStateSnapshot } from '../../../../src/mods/mod-character/utils/character-state-migration.ts'
import { parseNarrativeResponseEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { narrativeStoryContinuityPrompt } from '../../../../src/mods/mod-engine/prompts/narrative-story-continuity-prompt.ts'
import { narrativeTalentGrowthPrompt } from '../../../../src/mods/mod-engine/prompts/narrative-talent-growth-prompt.ts'
import { COMPILED_NARRATIVE_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import { COMPILED_NARRATIVE_STORY_CONTINUITY_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-story-continuity-system-prompt.ts'
import { COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts'

let failed = 0
function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}
function assertThrows(fn, message) {
  try {
    fn()
    assertOk(false, message)
  } catch {
    // expected
  }
}

const promptContext = {
  worldNarrativeView: {
    名称: '雾潮群岛',
    描述: '受海雾、季风和潮汐影响的群岛位面。',
  },
  characterProfileView: {
    姓名: '岑澜',
    性别: '女',
    种族: '潮裔',
    背景: '测潮学徒兼浅海潜水员。',
    基础属性: { 体魄: '专业优秀', 心智: '能处理复杂信息' },
  },
  characterStatusView: { 年龄: 19, 伤势: '不应发送' },
  talents: [{ 名称: '听潮辨隙', 效果: '能根据近处水声察觉明显堵塞。' }],
  timelineMemory: ['317年3月12日：议事会同意先做低潮勘查。'],
  currentTime: '317年4月',
  playerBranchIntent: {
    本轮明确行动: '利用低潮窗口复测闸槽，确认安全后完成临时封堵。',
    当前可叙述状态: '不应发送',
  },
  wordCountInstruction: '正文约 300 字',
  subsystemStates: { hidden: true },
}
const segments = buildSegmentedPrompt(narrativePrompt, promptContext)
assertOk(segments.userSegments.length === 6 && segments.userMessageCount === 6, '01 必须恰好发送六条用户消息')
const storyMessages = segments.userSegments.map((segment) => JSON.parse(segment))
assertOk(JSON.stringify(Object.keys(storyMessages[0])) === JSON.stringify(['世界']), '01 第一条消息只能是世界')
assertOk(
  JSON.stringify(Object.keys(storyMessages[0].世界)) === JSON.stringify(['名称', '描述']),
  '01 世界字段及顺序必须与样品一致',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[1])) === JSON.stringify(['历史连续性事实']),
  '01 第二条消息只能是历史连续性事实',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[2])) === JSON.stringify(['最近五轮正文']),
  '01 第三条消息只能是最近五轮正文',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[3])) === JSON.stringify(['角色']),
  '01 第四条消息只能是角色',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[4])) === JSON.stringify(['世界模拟内容']),
  '01 第五条消息只能是世界模拟内容',
)
const defaultFacts = storyMessages[5].本轮事实与方向
assertOk(JSON.stringify(Object.keys(storyMessages[5])) === JSON.stringify(['本轮事实与方向']) && defaultFacts.length === 5 && defaultFacts[0].includes('时间窗口：317年4月') && defaultFacts[1].startsWith('玩家行动：') && defaultFacts[2].includes('角色当前19岁') && defaultFacts[2].includes('超出能力的行动不得直接视为已完成') && defaultFacts[3].includes('第二人称“你”') && defaultFacts[3].includes('不规定叙事主语') && defaultFacts[4] === '字数要求：正文约300字；这是大约字数，优先以适合剧情为准，可适当增减。' && !defaultFacts.some((item) => item.startsWith('叙述风格：')) && !defaultFacts.join('\n').includes('保留古典用词质感'), '01 无自定义文风时第六条消息不得追加叙述风格项或旧默认文风')
const roundFactsFor = (narrativeStyle) => JSON.parse(buildSegmentedPrompt(narrativePrompt, { ...promptContext, narrativeStyle }).userSegments[5]).本轮事实与方向
const rawCustomStyle = '  用克制短句写潮湿空气。\n第二行  保留两个空格。  '
const customStyleFacts = roundFactsFor(rawCustomStyle)
const customStyleFact = customStyleFacts.find((item) => item.startsWith('叙述风格：'))
assertOk(customStyleFact === `叙述风格：${rawCustomStyle}` && !customStyleFact.includes('窗口覆盖义务') && customStyleFacts[0].includes('时间窗口：317年4月') && !customStyleFacts[0].includes('至少完成一条主事件链'), '01 非空自定义文风逐字保留，时间项只提供时间边界')
assertOk(['', '  \n\t  '].every((style) => !roundFactsFor(style).some((item) => item.startsWith('叙述风格：'))), '01 空文风或纯空白文风必须省略叙述风格项')
for (const [narrativeAddressing, expected] of [['first-person', '第一人称“我”'], ['character-name', '角色姓名“岑澜”']]) assertOk(JSON.parse(buildSegmentedPrompt(narrativePrompt, { ...promptContext, narrativeAddressing }).userSegments[5]).本轮事实与方向[3].includes(expected), `${narrativeAddressing} setting must change only the dynamic addressing instruction`)
const infantSegments = buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  characterStatusView: { 年龄: 1 },
})
const infantGuidance = JSON.parse(infantSegments.userSegments[5]).本轮事实与方向
assertOk(
  infantGuidance[2].includes('角色当前1岁')
    && infantGuidance[2].includes('婴幼儿'),
  '01 必须保留年龄与能力边界，但不把低龄生活细节写成叙事模板',
)
const dueSegments = buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  currentDueEvents: ['全局第120天：某事项已到期，等待本轮处理。'],
})
const dueMessage = JSON.parse(dueSegments.userSegments[5])
assertOk(
  JSON.stringify(Object.keys(dueMessage)) === JSON.stringify(['本轮事实与方向', '当前到期事件'])
    && dueMessage.当前到期事件.length === 1,
  '01 到期候选必须按需注入当前到期事件字段',
)
assertOk(
  !segments.full.includes('文明阶段')
    && !segments.full.includes('当前区域')
    && !segments.full.includes('当前可叙述状态')
    && !segments.full.includes('空间形态')
    && !segments.full.includes('世界观本质')
    && !segments.full.includes('力量体系')
    && !segments.full.includes('成立规则')
    && !segments.full.includes('最近正文')
    && !segments.full.includes('伤势')
    && !segments.full.includes('等级')
    && !segments.full.includes('subsystemStates')
    && JSON.stringify(Object.keys(storyMessages[3].角色.天赋[0])) === JSON.stringify(['名称', '效果']),
  '01 不得泄漏样品外世界、完整近期正文、区域、状态或天赋等级字段',
)

const growthPatterns = [
  ['lineage-action', '行动命格', 'action', 'epic'],
  ['lineage-cognition', '认知命格', 'cognition', 'common'],
  ['lineage-expression', '表达命格', 'expression', 'common'],
  ['lineage-stewardship', '经营命格', 'stewardship', 'common'],
].map(([lineageId, name, category, rarity], index) => ({
  lineageId,
  version: index + 1,
  id: `pattern-${index + 1}`,
  name,
  description: `${name}的能力说明。`,
  category,
  rarity,
  effect: `${name}在相关事件中形成直接结果。`,
  attrBonus: { physique: 1 },
}))
const recentGrowthSource = structuredClone(growthPatterns[0])
const recentGrowthResult = { ...structuredClone(recentGrowthSource), version: 5, rarity: 'legendary' }
const talentGrowthInput = buildNarrativeTalentGrowthPromptInput({
  patterns: growthPatterns,
  compressedSummaries: { summaries: [] },
  recentStories: [1, 2, 3, 4, 5].map((round) => ({
    回合: round,
    规范时间: { 总天数: round * 365, 时间标签: `第${round}年` },
    故事全文: `第${round}年完成了一次与天赋相关的检修复核。`,
  })),
  currentRound: 17,
  totalDays: 9000,
  currentAge: 16,
  growthHistory: [{
    choiceId: 'growth-choice-1',
    narrativeId: 'narrative-11',
    roundSequence: 11,
    lineageId: recentGrowthSource.lineageId,
    selectedOptionId: 'growth-option-1',
    source: recentGrowthSource,
    result: recentGrowthResult,
    committedAt: 100,
  }],
})
const growthPromptPatterns = JSON.parse(talentGrowthInput.userSegments[2]).玩家已选天赋
assertOk(
  talentGrowthInput.eligiblePatterns.length === 3
    && growthPromptPatterns.length === 3
    && growthPromptPatterns.every((pattern) => pattern.命格血脉编号 !== recentGrowthSource.lineageId),
  '03 必须只发送本轮真正可成长的其他天赋，且由程序筛掉未满足冷却的最近成长项',
)
const underageTalentGrowthInput = buildNarrativeTalentGrowthPromptInput({
  patterns: growthPatterns,
  compressedSummaries: { summaries: [] },
  recentStories: [1, 2, 3, 4, 5].map((round) => ({
    回合: round,
    规范时间: { 总天数: round * 365, 时间标签: `第${round}年` },
    故事全文: `第${round}年完成了一次与天赋相关的检修复核。`,
  })),
  currentRound: 17,
  totalDays: 9000,
  currentAge: 15,
  growthHistory: [],
})
assertOk(
  underageTalentGrowthInput.eligiblePatterns.length === 0
    && JSON.parse(underageTalentGrowthInput.userSegments[2]).玩家已选天赋.length === 0,
  '03 未满 16 岁时必须由程序清空成长候选并跳过成长 AI',
)
const growthState = (patterns, pendingGrowth = null, growthHistory = []) => ({ candidates: [], patterns, rarityCount: { common: 1, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 }, pendingGrowth, growthHistory })
const characterGrowthSnapshot = (age, destinyPatterns) => sanitizeCharacterStateSnapshot({ age, destinyPatterns, equippedReincarnationTalents: [] })
const underageGrowthSource = structuredClone(growthPatterns[1])
const underagePendingGrowth = createPendingDestinyPatternGrowth({
  narrativeId: 'underage-narrative', roundSequence: 3, source: underageGrowthSource,
  directions: [
    { route: '深度强化', name: '观火入微', description: '辨认更细微的火色差异。', effect: '观察火候时更准确。', attrBonus: { mind: 1 } },
    { route: '广度强化', name: '百材通识', description: '把观察经验用于更多材料。', effect: '处理不同材料时更从容。', attrBonus: { talentAptitude: 1 } },
    { route: '转变强化', name: '听声辨质', description: '改用敲击声音判断材料状态。', effect: '可通过声音识别材料变化。', attrBonus: { mind: 1 } },
  ],
})
assertThrows(() => registerPendingDestinyPatternGrowthInState(growthState([underageGrowthSource]), underagePendingGrowth, 15), '03 角色所有者不得登记未满 16 岁的待选成长')
const [underagePendingSnapshot, adultPendingSnapshot] = [1, 16].map((age) => characterGrowthSnapshot(age, growthState([underageGrowthSource], underagePendingGrowth)))
assertOk(underagePendingSnapshot.destinyPatterns.pendingGrowth === null && adultPendingSnapshot.destinyPatterns.pendingGrowth?.choiceId === underagePendingGrowth.choiceId, '03 角色快照恢复必须清除未满 16 岁的旧待选成长，并保留成年后的合法待选项')
const underageSelectedOption = underagePendingGrowth.options[0]
const underageCommittedSnapshot = characterGrowthSnapshot(1, growthState([underageSelectedOption.pattern], null, [{ choiceId: underagePendingGrowth.choiceId, narrativeId: underagePendingGrowth.narrativeId, roundSequence: underagePendingGrowth.roundSequence, lineageId: underagePendingGrowth.lineageId, selectedOptionId: underageSelectedOption.optionId, source: underageGrowthSource, result: underageSelectedOption.pattern, committedAt: 100, totalDays: 365 }]))
assertOk(underageCommittedSnapshot.destinyPatterns.growthHistory.length === 0 && underageCommittedSnapshot.destinyPatterns.patterns[0]?.id === underageGrowthSource.id, '03 未成年旧存档若已提交成长，恢复时必须回到首次成长前的命格版本')
const validWithBranch = JSON.stringify({
  正文: '你在旧桥边听见城中钟声，随后把决定交给了仍在等候的人。',
  分支: { 选项: ['留下', '离开'] },
  结局: null,
})
const parsed = parseNarrativeResponseEnvelope(validWithBranch)
assertOk(parsed.narrative.includes('旧桥边'), '01 唯一正文字符串必须保留完整正文')
assertOk(parsed.branch?.选项.length === 2, '01 必须解析可选分支')
const missingBodyQuote = '{"正文":"你在旧闸前听潮。\n复测后确认石缝已稳定。,"分支":null,"结局":null}'
assertOk(parseAIJSON(missingBodyQuote) === null, '通用 JSON 解析未授权时不得猜测故事字段')
const recoveredBodyQuote = parseNarrativeResponseEnvelope(missingBodyQuote)
assertOk(
  recoveredBodyQuote.narrative === '你在旧闸前听潮。\n复测后确认石缝已稳定。'
    && !recoveredBodyQuote.branch
    && !recoveredBodyQuote.ending,
  '01 可在下一合法顶层字段边界唯一时恢复正文关闭引号与裸换行',
)
const recoveredReordered = parseNarrativeResponseEnvelope('{"结局":null,"正文":"你完成复测后返回矿寨。,"分支":null}')
assertOk(recoveredReordered.narrative.endsWith('返回矿寨。'), '01 字段乱序不影响正文恢复')
assertOk(
  parseAIJSON('{"正文":"未完整对象,"分支":null,"结局":null', {
    recoverUnclosedString: { field: '正文', followingTopLevelFields: ['正文', '分支', '结局'] },
  }) === null,
  '01 恢复不得补写缺失对象括号',
)
const extraField = parseNarrativeResponseEnvelope(JSON.stringify({ 结局: null, 属性变化: {}, 正文: '正文', 分支: null }))
assertOk(extraField.narrative === '正文', '01 宽容解析继续忽略输出中的额外键')
const endingWins = parseNarrativeResponseEnvelope(JSON.stringify({ 正文: '正文', 分支: { 选项: ['留下', '离开'] }, 结局: { 四字评语: '灯火长明' } }))
assertOk(!endingWins.branch && endingWins.ending?.四字评语 === '灯火长明', '01 分支与结局冲突时结局优先')
assertThrows(() => parseNarrativeResponseEnvelope('   '), '真正空响应仍必须拒绝')

const continuity = NarrativeAIStoryContinuityDataSchema.parse({
  本轮记忆: [{ 时间: '317年4月13日', 事实: '临时封堵通过承压复测。', 权重: 6 }],
  未来事件: ['317年5月1日：贺峤带队检查内层石缝。'],
})
assertOk(continuity.本轮记忆[0].权重 === 6, '02 必须保留时间、事实和权重')
assertThrows(
  () => NarrativeAIStoryContinuityDataSchema.parse({
    本轮记忆: [{ 时间: '317年4月13日', 事实: '临时封堵通过承压复测。' }],
    未来事件: [],
  }),
  '02 必须拒绝漏掉权重的记忆事件',
)
assertOk(
  NarrativeAIStoryContinuityDataSchema.safeParse({
    本轮记忆: [{ 时间: '317年4月13日', 事实: '临时封堵通过承压复测。', 权重: 6, 来源回合: 4 }],
    未来事件: [],
  }).success,
  '02 解析器必须忽略样品外字段而不整包拒绝',
)
const partialContinuity = inspectNarrativeStoryContinuityQuality(JSON.stringify({
  本轮记忆: [{ 时间: '317年4月13日', 事实: '临时封堵通过承压复测。', 权重: 6 }],
  未来事件: ['缺少全角冒号'],
}))
assertOk(
  partialContinuity.valid
    && partialContinuity.result?.本轮记忆.length === 1
    && partialContinuity.result?.未来事件.length === 0
    && Boolean(partialContinuity.futureEventReason),
  '02 单条未来事件异常不得丢弃有效本轮记忆',
)

const growthResult = {
  成长判定: {
    需要成长: true,
    命格血脉编号: 'lineage:tide-listener',
    成长依据: '连续复测中，听潮辨隙直接定位了堵塞并形成验证结果。',
    依据窗口编号: ['round:16', 'round:17'],
    下一阶方向: [
      { 路线: '深度强化', 名称: '听隙入微', 详细介绍: '能分辨更细的近处渗漏差异。', 效果描述: '同类水声中更快辨清堵塞位置。', 属性加成: { 悟性: 4, 体魄: -1 } },
      { 路线: '广度强化', 名称: '百流同辨', 详细介绍: '在更多水域环境中分辨异常水声。', 效果描述: '陌生河港也可依水声判断近处水路异常。', 属性加成: { 心智: 2, 悟性: 1 } },
      { 路线: '转变强化', 名称: '引流成势', 详细介绍: '把对近处水压的判断化为直接引导细小水流。', 效果描述: '可改变近处少量水流的去向，但不额外扩大影响总量。', 属性加成: { 心智: -1, 悟性: 4 } },
    ],
  },
}
const growthQuality = inspectNarrativeTalentGrowthQuality(JSON.stringify(growthResult))
assertOk(growthQuality.valid, '03 必须接受固定顺序的三条同级路线')
assertOk(
  growthQuality.result?.成长判定.需要成长
    && growthQuality.result.成长判定.下一阶方向[2].效果描述.includes('改变近处少量水流'),
  '03 必须允许感知判断能力质变为直接操控类，只约束不扩大影响总量',
)
const noLocalBudget = structuredClone(growthResult)
noLocalBudget.成长判定.下一阶方向[0].属性加成 = { 悟性: 100, 体魄: -50 }
assertOk(
  NarrativeAITalentGrowthDataSchema.safeParse(noLocalBudget).success
    && !validateDestinyPatternAttrBonusForRarity({ talentAptitude: 100, physique: -50 }, 'fine'),
  '03 传输协议保持宽容，但本地天赋提交必须拒绝越过等级边界的属性',
)
const wrongOrder = structuredClone(growthResult)
wrongOrder.成长判定.下一阶方向.reverse()
const reorderedQuality = inspectNarrativeTalentGrowthQuality(JSON.stringify(wrongOrder))
assertOk(
  reorderedQuality.valid
    && reorderedQuality.result?.成长判定.下一阶方向.map((item) => item.路线).join('|') === '深度强化|广度强化|转变强化',
  '03 解析器必须识别乱序路线并恢复固定输出顺序',
)

const quality = inspectNarrativeResponseQuality(JSON.stringify({ 正文: '一段完整故事。', 分支: null, 结局: null }), 200)
assertOk(quality.valid === true && quality.parsed?.narrative === '一段完整故事。', '01 质量检查优先发布可恢复正文')

assertOk(
  narrativePrompt.version === '7.11.0'
    && narrativeStoryContinuityPrompt.version === '2.8.0'
    && narrativeTalentGrowthPrompt.version === '3.4.0'
    && narrativeStoryContinuityPrompt.outputFormat === 'json'
    && narrativeTalentGrowthPrompt.outputFormat === 'json',
  '01/02/03 Prompt 必须绑定当前单一职责版本',
)
assertOk(
  (() => {
    let parsed
    try {
      parsed = JSON.parse(COMPILED_NARRATIVE_SYSTEM_PROMPT)
    } catch {
      return false
    }
    return JSON.stringify(Object.keys(parsed)) === JSON.stringify(['身份', '目标', '叙事原则', '输出契约'])
      && parsed.身份.startsWith('你是一位人生叙事者')
      && parsed.目标.includes('讲一段有人、有因果、有推进、可读的故事')
      && !parsed.目标.includes('连贯、可继续')
      && Array.isArray(parsed.叙事原则)
      && parsed.叙事原则.some((item) => item.includes('自创来源稳定'))
      && parsed.输出契约?.调用?.includes('submit_story_turn')
      && parsed.输出契约?.字段定义?.正文?.includes('非空字符串')
      && parsed.输出契约?.字段定义?.分支?.includes('选项')
      && parsed.输出契约?.字段定义?.结局?.includes('四字评语')
      && Array.isArray(parsed.输出契约?.不变量)
      && parsed.输出契约.不变量.some((item) => item.includes('顶层恰好包含正文、分支、结局三个键'))
      && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('世界故事模拟器')
      && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('正文规则')
      && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('终态边界')
      && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('决策流程')
  })(),
  '固定主故事 Prompt 只增加唯一合理叙事目标并保留输出结构协议，02/03 固定资产继续保留各自状态提取职责',
)

if (failed > 0) process.exit(1); console.log('[narrative-chinese-protocol-regression] PASS')
