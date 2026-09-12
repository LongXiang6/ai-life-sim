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
    基础属性: {},
  },
  characterStatusView: {
    年龄: 19,
    属性数值: { mind: 2, physique: 1, charisma: -1, familyBackground: 0 },
    伤势: '不应发送',
  },
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
assertOk(segments.userSegments.length === 1 && segments.userMessageCount === 1, '01 必须发送一条数据层数组消息')
const storyMessages = JSON.parse(segments.userSegments[0])
assertOk(
  Array.isArray(storyMessages)
    && storyMessages.length === 4
    && JSON.stringify(Object.keys(storyMessages[0])) === JSON.stringify(['世界'])
    && JSON.stringify(Object.keys(storyMessages[0].世界)) === JSON.stringify(['名称', '描述']),
  '01 数据层数组必须保留世界对象及字段顺序',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[1])) === JSON.stringify(['玩家信息'])
    && JSON.stringify(Object.keys(storyMessages[1].玩家信息)) === JSON.stringify(['姓名', '性别', '种族', '背景', '天赋技能']),
  '01 数据层第二项必须是玩家信息',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[2])) === JSON.stringify(['剧情'])
    && Array.isArray(storyMessages[2].剧情.长期记忆)
    && Array.isArray(storyMessages[2].剧情.近期记忆),
  '01 数据层第三项必须是长期记忆与近期记忆',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[3])) === JSON.stringify(['玩家属性', '当前信息'])
    && JSON.stringify(Object.keys(storyMessages[3].玩家属性)) === JSON.stringify(['心智', '体魄', '魅力', '家境'])
    && JSON.stringify(Object.keys(storyMessages[3].当前信息)) === JSON.stringify(['时间', '命运抉择']),
  '01 数据层第四项必须是玩家属性与当前信息',
)
assertOk(
  storyMessages[1].玩家信息.天赋技能[0].includes('听潮辨隙')
    && storyMessages[3].当前信息.命运抉择.includes('利用低潮窗口')
    && JSON.stringify(storyMessages[3].玩家属性) === JSON.stringify({ 心智: '2', 体魄: '1', 魅力: '-1', 家境: '0' }),
  '01 数据层必须传递天赋、玩家行动和整数字符串属性',
)
const infantSegments = buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  characterStatusView: { ...promptContext.characterStatusView, 年龄: 1 },
})
assertOk(
  JSON.parse(infantSegments.userSegments[0])[3].当前信息.时间.startsWith('1岁-'),
  '01 当前信息必须保留当前年龄',
)
assertOk(
  !segments.full.includes('subsystemStates')
    && !segments.full.includes('当前到期事件'),
  '01 不得泄漏内部状态字段',
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
    { route: '广度强化', name: '百材通识', description: '把观察经验用于更多材料。', effect: '处理不同材料时更从容。', attrBonus: { familyBackground: 1 } },
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
  属性变化: null,
})
const parsed = parseNarrativeResponseEnvelope(validWithBranch)
assertOk(parsed.narrative.includes('旧桥边'), '01 唯一正文字符串必须保留完整正文')
assertOk(parsed.branch?.选项.length === 2, '01 必须解析可选分支')
const lifeSimulatorBranch = parseNarrativeResponseEnvelope(`【年龄:20岁|心智:3|体魄:1|魅力:-1|家境:0】
"正文": "你核清了旧账，三条去路同时摆到面前。"。
"命运分支": {["留在商号","独自北上","回城查旧案"]}。
"结局": "false"。`, {
  currentAttributes: { 心智: 2, 体魄: 1, 魅力: -1, 家境: 0 },
})
assertOk(
  lifeSimulatorBranch.branch?.选项.length === 3
    && lifeSimulatorBranch.attributeChanges?.心智 === 1,
  '01 必须解析人生重开简写分支，并把状态行绝对值换算为本轮属性差值',
)
const lifeSimulatorQuality = inspectNarrativeResponseQuality(`【年龄:20岁|心智:3|体魄:1|魅力:-1|家境:0】
"正文": "你核清旧账后保住了商号的紧要货物。"。
"命运分支": "false"。
"结局": "false"。`, 200, undefined, segments.userSegments[0])
assertOk(
  lifeSimulatorQuality.valid
    && lifeSimulatorQuality.parsed?.attributeChanges?.心智 === 1,
  '01 正式质量入口必须从数据层读取当前属性并换算状态行差值',
)
const lifeSimulatorEnding = parseNarrativeResponseEnvelope(`【年龄:80岁|心智:3|体魄:-2|魅力:1|家境:0】
"正文": "你在旧宅中安然辞世，未再醒来。"。
"命运分支": "false"。
"结局": {"评语":"此生无憾","总结":"你把未竟之事交给了后来者。"}。`)
assertOk(
  lifeSimulatorEnding.ending?.评语 === '此生无憾'
    && lifeSimulatorEnding.ending?.总结 === '你把未竟之事交给了后来者。',
  '01 必须解析人生重开结局的评语与总结',
)
const missingBodyQuote = '{"正文":"你在旧闸前听潮。\n复测后确认石缝已稳定。,"分支":null,"结局":null,"属性变化":null}'
assertOk(parseAIJSON(missingBodyQuote) === null, '通用 JSON 解析未授权时不得猜测故事字段')
const recoveredBodyQuote = parseNarrativeResponseEnvelope(missingBodyQuote)
assertOk(
  recoveredBodyQuote.narrative === '你在旧闸前听潮。\n复测后确认石缝已稳定。'
    && !recoveredBodyQuote.branch
    && !recoveredBodyQuote.ending,
  '01 可在下一合法顶层字段边界唯一时恢复正文关闭引号与裸换行',
)
const recoveredReordered = parseNarrativeResponseEnvelope('{"结局":null,"正文":"你完成复测后返回矿寨。,"分支":null,"属性变化":null}')
assertOk(recoveredReordered.narrative.endsWith('返回矿寨。'), '01 字段乱序不影响正文恢复')
assertOk(
  parseAIJSON('{"正文":"未完整对象,"分支":null,"结局":null,"属性变化":null', {
    recoverUnclosedString: { field: '正文', followingTopLevelFields: ['正文', '分支', '结局', '属性变化'] },
  }) === null,
  '01 恢复不得补写缺失对象括号',
)
const attributeChange = parseNarrativeResponseEnvelope(JSON.stringify({ 结局: null, 属性变化: { 体魄: 1 }, 正文: '正文', 分支: null }))
assertOk(attributeChange.narrative === '正文' && attributeChange.attributeChanges?.体魄 === 1, '01 必须保留属性变化字段')
const endingWins = parseNarrativeResponseEnvelope(JSON.stringify({ 正文: '正文', 分支: { 选项: ['留下', '离开'] }, 结局: { 四字评语: '灯火长明' } }))
assertOk(!endingWins.branch && endingWins.ending?.评语 === '灯火长明', '01 分支与结局冲突时结局优先')
assertThrows(() => parseNarrativeResponseEnvelope('   '), '真正空响应仍必须拒绝')

const continuity = NarrativeAIStoryContinuityDataSchema.parse({
  本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6 }],
  未来事件: ['317年5月1日：贺峤带队检查内层石缝。'],
})
assertOk(continuity.本轮剧情[0].权重 === 6, '02 必须保留时间、剧情和权重')
assertThrows(
  () => NarrativeAIStoryContinuityDataSchema.parse({
    本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。' }],
    未来事件: [],
  }),
  '02 必须拒绝漏掉权重的剧情事件',
)
assertOk(
  NarrativeAIStoryContinuityDataSchema.safeParse({
    本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6, 来源回合: 4 }],
    未来事件: [],
  }).success,
  '02 解析器必须逐项恢复 canonical 剧情并忽略样品外字段',
)
const partialContinuity = inspectNarrativeStoryContinuityQuality(JSON.stringify({
  本轮剧情: [{ 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6 }],
  未来事件: ['缺少全角冒号'],
}))
assertOk(
  partialContinuity.valid
    && partialContinuity.result?.本轮剧情.length === 1
    && partialContinuity.result?.未来事件.length === 0
    && Boolean(partialContinuity.futureEventReason),
  '02 单条未来事件异常不得丢弃有效本轮剧情',
)
const partialPlot = inspectNarrativeStoryContinuityQuality(JSON.stringify({
  本轮剧情: [
    { 时间: '317年4月13日', 剧情: '临时封堵通过承压复测。', 权重: 6 },
    { 时间: '317年4月14日', 剧情: '', 权重: 6 },
  ],
  未来事件: [],
}))
assertOk(
  partialPlot.valid
    && partialPlot.result?.本轮剧情.length === 1
    && partialPlot.result.本轮剧情[0].剧情 === '临时封堵通过承压复测。'
    && partialPlot.reason.includes('本轮剧情[1]字段不完整'),
  '02 单条剧情异常不得丢弃其他合法本轮剧情',
)

const growthResult = {
  成长判定: {
    需要成长: true,
    命格血脉编号: 'lineage:tide-listener',
    成长依据: '连续复测中，听潮辨隙直接定位了堵塞并形成验证结果。',
    依据窗口编号: ['round:16', 'round:17'],
    下一阶方向: [
      { 路线: '深度强化', 名称: '听隙入微', 详细介绍: '能分辨更细的近处渗漏差异。', 效果描述: '同类水声中更快辨清堵塞位置。', 属性加成: { 家境: 4, 体魄: -1 } },
      { 路线: '广度强化', 名称: '百流同辨', 详细介绍: '在更多水域环境中分辨异常水声。', 效果描述: '陌生河港也可依水声判断近处水路异常。', 属性加成: { 心智: 2, 家境: 1 } },
      { 路线: '转变强化', 名称: '引流成势', 详细介绍: '把对近处水压的判断化为直接引导细小水流。', 效果描述: '可改变近处少量水流的去向，但不额外扩大影响总量。', 属性加成: { 心智: -1, 家境: 4 } },
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
noLocalBudget.成长判定.下一阶方向[0].属性加成 = { 家境: 100, 体魄: -50 }
assertOk(
  NarrativeAITalentGrowthDataSchema.safeParse(noLocalBudget).success
    && !validateDestinyPatternAttrBonusForRarity({ familyBackground: 100, physique: -50 }, 'fine'),
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

const quality = inspectNarrativeResponseQuality(JSON.stringify({ 正文: '一段完整故事。', 分支: null, 结局: null, 属性变化: null }), 200)
assertOk(quality.valid === true && quality.parsed?.narrative === '一段完整故事。', '01 质量检查优先发布可恢复正文')

assertOk(
  narrativePrompt.version === '7.20.0'
    && narrativeStoryContinuityPrompt.version === '3.0.0'
    && narrativeTalentGrowthPrompt.version === '3.5.0'
    && narrativeStoryContinuityPrompt.outputFormat === 'json'
    && narrativeTalentGrowthPrompt.outputFormat === 'json',
  '01/02/03 Prompt 必须绑定当前单一职责版本',
)
assertOk(
  COMPILED_NARRATIVE_SYSTEM_PROMPT.startsWith('你是一个“人生重开模拟器”系统')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('年龄与轮次由外部程序控制')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不自行增龄、跳年')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('故事内容必须符合对应的年龄能力边界')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('本轮正文只能叙述当前年龄正在发生或已经发生的事')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('正文只能包含状态行当前年龄这一岁内的一个完整事件')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不得出现任何大于当前年龄的年龄数字或年龄阶段词')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不得回顾成长，不得写人生概览或成长蒙太奇')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不得出现下一岁及以后的年龄、事件、成长、关系变化或结果')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('世界设定中的第二人称描述不是本轮已发生事实，只作为世界背景')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('命运分支')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('结局')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('"正文"')
    && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('冷却')
    && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('世界模拟引擎'),
  '固定主故事 Prompt 必须采用最新系统提示词并保留项目输出字段',
)

if (failed > 0) process.exit(1); console.log('[narrative-chinese-protocol-regression] PASS')
