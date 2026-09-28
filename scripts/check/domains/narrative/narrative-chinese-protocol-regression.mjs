/**
 * Purpose: Regress the approved 01/02/03 Chinese message and response contracts.
 * Owner: quality:narrative
 * Responsibility: Dynamic message fixtures, tolerant story parsing, and strict post-call Schemas only.
 */

import fs from 'node:fs'
import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { parseAIJSON } from '../../../../src/core/ai-service/parse-ai-json.ts'
import { NarrativeAIStoryResultSchema, NarrativeAIStoryContinuityDataSchema, NarrativeAITalentGrowthDataSchema } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { inspectNarrativeResponseQuality, inspectNarrativeStoryContinuityQuality, inspectNarrativeTalentGrowthQuality } from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { buildNarrativeTalentGrowthPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-talent-growth-context.ts'
import { createPendingDestinyPatternGrowth, registerPendingDestinyPatternGrowthInState, validateDestinyPatternAttrBonusForRarity } from '../../../../src/mods/mod-character/destiny-pattern-growth.ts'
import { sanitizeCharacterStateSnapshot } from '../../../../src/mods/mod-character/utils/character-state-migration.ts'
import { parseNarrativeResponseEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import { formatNarrativeTimelineForPrompt, projectNarrativeResultForPrompt } from '../../../../src/mods/mod-engine/helpers/timeline-memory.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { narrativeStoryContinuityPrompt } from '../../../../src/mods/mod-engine/prompts/narrative-story-continuity-prompt.ts'
import { narrativeTalentGrowthPrompt } from '../../../../src/mods/mod-engine/prompts/narrative-talent-growth-prompt.ts'
import { COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE, composeNarrativeUserMessage } from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import { COMPILED_NARRATIVE_STORY_CONTINUITY_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-story-continuity-system-prompt.ts'
import { COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-talent-growth-system-prompt.ts'
import { projectNarrativeHistoryEntryRuntime } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system/timeline-projection-runtime.ts'

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
  timelineMemory: ['议事会同意先做低潮勘查。'],
  recentStories: ['你仍是雾潮群岛的测潮学徒，住在港区，持有临时闸槽通行权。'],
  currentTime: '317年4月',
  wordCountInstruction: '正文约200字。',
  playerBranchIntent: {
    命运分支: '利用低潮窗口复测闸槽，确认安全后完成临时封堵。',
    当前可叙述状态: '不应发送',
  },
  subsystemStates: { hidden: true },
}
const segments = buildSegmentedPrompt(narrativePrompt, promptContext)
assertOk(segments.userSegments.length === 1 && segments.userMessageCount === 1, '01 必须发送一条数据层数组消息')
const storyMessages = JSON.parse(segments.userSegments[0])
assertOk(
  Array.isArray(storyMessages)
    && storyMessages.length === 5
    && storyMessages.map((item) => Object.keys(item)[0]).join('|') === '世界|玩家信息|历史输出|玩家本次点属性|本次信息'
    && JSON.stringify(Object.keys(storyMessages[0].世界)) === JSON.stringify(['名称', '描述']),
  '01 数据层数组必须保留五个原字段及顺序',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[1].玩家信息)) === JSON.stringify(['姓名', '性别', '种族', '背景', '天赋技能']),
  '01 数据层第二个字段必须是玩家信息',
)
assertOk(
  Array.isArray(storyMessages[2].历史输出.事件)
    && storyMessages[2].历史输出.事件[0] === '议事会同意先做低潮勘查。'
    && storyMessages[2].历史输出.事件[1].includes('测潮学徒'),
  '01 历史输出必须承载既有历史投影',
)
assertOk(
  JSON.stringify(Object.keys(storyMessages[3].玩家本次点属性)) === JSON.stringify(['心智', '体魄', '魅力', '财富'])
    && JSON.stringify(Object.keys(storyMessages[4].本次信息)) === JSON.stringify(['时间节点', '命运分支', '篇幅偏好']),
  '01 属性与本次信息必须严格保留数据层字段',
)
assertOk(
  storyMessages[1].玩家信息.天赋技能[0].includes('听潮辨隙')
    && storyMessages[4].本次信息.命运分支.includes('利用低潮窗口')
    && storyMessages[4].本次信息.篇幅偏好 === '正文约200字。'
    && JSON.stringify(storyMessages[3].玩家本次点属性) === JSON.stringify({ 心智: '2', 体魄: '1', 魅力: '-1', 财富: '0' }),
  '01 数据层必须传递天赋、玩家行动和整数字符串属性',
)
const composedStoryMessage = composeNarrativeUserMessage(segments.userSegments[0])
assertOk(
  ["【代码区块1：AI身份与核心职责】","【代码区块2：执行顺序与判断】","【代码区块3：只读输入数据】","【代码区块4：恢复本轮起点】","【代码区块5：先形成世界局面，再选择离散新事】","【代码区块6：形成已成立事件结果】","【代码区块7：把结果压缩为广角人生记录】","【代码区块8：依据结果结算】","【代码区块9：完成返回】"]
    .every((heading, index, headings) => composedStoryMessage.indexOf(heading) >= 0 && (index === 0 || composedStoryMessage.indexOf(heading) > composedStoryMessage.indexOf(headings[index - 1])))
    && composedStoryMessage.includes('议事会同意先做低潮勘查。')
    && composedStoryMessage.includes('"财富": "0"'),
  '01 服务端必须按 prompt.txt 最终顺序合成唯一 user 消息',
)
assertOk(
  ["本轮交付一份新的、完整的、已经发生并留下结果的人生记录","现实事实可以连续，但本轮不能自动续写上一轮的主题","先从世界规则、相关者行动和开放人生可能性形成新的事件局面","新轮从仍开放的世界可能性中重新选题，再比较核心问题、主要行动者、因果机制、作用范围、玩家位置和结果意义","把代码区块5选出的每件新事推演到现实已经改变","正文不是事件字段逐字复述","时间节点、年龄、纪元和事件序号只用于内部定位本轮条件","事件、成因、结果、影响四个字符串字段"].every(phrase => composedStoryMessage.includes(phrase)),
  '01 核心契约必须生成多项独立结果的人生记录，历史只提供既定事实而不锁定主题或写法',
)
assertOk(
  projectNarrativeResultForPrompt({ text: '你取得正式领航资格。', displayAge: 18 })
    === '18岁：你取得正式领航资格。',
  '01 近期事实投影必须保留发生年龄、完整故事与句末标点，不添加结算标签',
)
const jobTransferNarrative = '那年秋天，父亲从搬运岗调回车间，腰伤却已落下病根，每逢阴雨便直不起身。母亲在纺织厂食堂找了份择菜的零工，每天带你同去。食堂后厨有一排矮柜，你常坐在柜边等母亲收工。一日午后，灶上大锅的油突然爆起明火，火舌蹿上抽油烟机，后厨几个大人愣在当场。你正对着那口锅，火光刺进眼里，手边就是矮柜上一只厚重锅盖。你抓起锅盖，踮脚前倾，把盖沿对准锅沿推了过去，火苗被压回锅底，滋滋几声闷响后只剩黑烟。母亲冲过来抱住你时手在抖，后厨师傅则默默把锅盖把手修紧，又用铁丝在灶台边加了一道矮栏。当晚父亲提早来接，一路没说话，到家才蹲下来检查你的手掌——只有虎口蹭红了一小片。此后食堂灶台边多了一条规矩：小孩不许靠近，但那只锅盖被师傅用红漆在背面写了个“岑”字，挂在原处。'
const jobTransferProjection = projectNarrativeResultForPrompt({ text: jobTransferNarrative, displayAge: 4 })
assertOk(
  jobTransferProjection === `4岁：${jobTransferNarrative}`,
  '01 真实转岗记录必须保留父亲岗位、腰伤、母亲就业及灶台限制，不能只留下最后一句',
)
const multiResultNarrative = '你取得正式领航资格。\n议会免除了聚落的航道税！船主归还了抵押给你的船契。'
const structuredEventProjection = projectNarrativeResultForPrompt({
  text: multiResultNarrative,
  eventResults: [{ 事件: '航道税改革', 成因: '议会为恢复外海贸易重定税制。', 结果: '聚落免除旧航道税并恢复贸易。', 影响: '船主收回抵押船契，聚落承担短期财政缺口。' }],
  displayAge: 18,
})
assertOk(
  structuredEventProjection.includes('已结束事件身份：航道税改革；已成立事实：成因：议会为恢复外海贸易重定税制。；结果：聚落免除旧航道税并恢复贸易。；影响：船主收回抵押船契，聚落承担短期财政缺口。')
    && !structuredEventProjection.includes('本轮正文事实：')
    && !structuredEventProjection.includes('你取得正式领航资格。')
    && structuredEventProjection.startsWith('18岁：'),
  '01 近期历史有结构化结果时只投影该事实底稿，避免把同一主线以正文再次强化',
)
const olderStructuredProjection = projectNarrativeHistoryEntryRuntime(null, {
  text: multiResultNarrative,
  eventResults: [{ 事件: '航道税改革', 成因: '议会调整税制。', 结果: '聚落恢复贸易。', 影响: '船主收回船契。' }],
  displayAge: 18,
}, 1)
const olderFallbackProjection = projectNarrativeHistoryEntryRuntime(null, {
  text: multiResultNarrative,
  displayAge: 19,
}, 2)
assertOk(
  JSON.stringify(formatNarrativeTimelineForPrompt([olderStructuredProjection, olderFallbackProjection]))
    === JSON.stringify([
      '18岁：已结束事件身份：航道税改革；已成立事实：成因：议会调整税制。；结果：聚落恢复贸易。；影响：船主收回船契。',
      `19岁：${multiResultNarrative}`,
    ]),
  '01 较早未压缩轮次必须优先投影结构化结果，缺少结果时回退完整正文',
)
const completeHistoryProjection = projectNarrativeResultForPrompt({
  text: `  ⟦正文⟧\r\n${multiResultNarrative.replace(/\n/gu, '\r\n')}  `,
  displayAge: 18,
  branchTitle: '  议会的委托  ',
  branchOptions: ['  接受委托  ', '留在聚落'],
  resolvedChoice: '  接受委托  ',
})
assertOk(
  completeHistoryProjection === `18岁：${multiResultNarrative}；已确认选择：接受委托`,
  '01 已确认选择只附所选方向，不再标为未决或附上未选候选；完整事实与段落保持',
)
assertOk(
  projectNarrativeResultForPrompt({
    text: multiResultNarrative,
    displayAge: 18,
    endingSummary: '船契和航道权益都由聚落继承。',
  }) === `18岁：${multiResultNarrative}；船契和航道权益都由聚落继承。`,
  '01 结局总结只能附加到完整正文，不能覆盖已经成立的多项事实',
)
assertOk(
  projectNarrativeResultForPrompt({
    text: multiResultNarrative,
    endingSummary: multiResultNarrative,
  }) === multiResultNarrative,
  '01 相同结局总结不重复追加，缺少年龄不制造年龄索引',
)
const completeHistoryInput = JSON.parse(buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  recentStories: [jobTransferProjection, completeHistoryProjection],
}).userSegments[0])
for (const resolvedChoice of [undefined, '   ']) {
  assertOk(
    projectNarrativeResultForPrompt({ text: multiResultNarrative, displayAge: 18, branchTitle: '议会的委托', branchOptions: ['接受委托', '留在聚落'], resolvedChoice })
      === `18岁：${multiResultNarrative}；未决分支：议会的委托（接受委托、留在聚落）`,
    '01 未选择或空白选择仍保留未决分支，不删除源事实',
  )
}
assertOk(
  JSON.stringify(completeHistoryInput[2].历史输出.事件)
    === JSON.stringify([...promptContext.timelineMemory, jobTransferProjection, completeHistoryProjection]),
  '01 五段动态输入必须完整传递近期多结果事实，不能在组装层再次缩减',
)
assertOk(
  JSON.stringify(formatNarrativeTimelineForPrompt([{
    timeSpan: '大曜历18年',
    occurrenceTime: '大曜历18年 · 角色18岁',
    text: '你帮助港口避开航道灾难。',
    sortRound: 1,
    displayAge: 18,
  }])) === JSON.stringify(['18岁：你帮助港口避开航道灾难。']),
  '01 较早历史投影必须直接使用发生年龄与故事内容，不添加结算标签',
)
const infantSegments = buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  characterStatusView: { ...promptContext.characterStatusView, 年龄: 1 },
})
assertOk(
  JSON.parse(infantSegments.userSegments[0])[4].本次信息.时间节点.startsWith('1岁·'),
  '01 本次信息必须保留当前年龄',
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
  命运分支: ['留下', '离开'],
  属性: { 心智: 2, 体魄: 1, 魅力: -1, 财富: 0 },
  结局: false,
})
const parsed = parseNarrativeResponseEnvelope(validWithBranch)
assertOk(
  parsed.narrative.includes('旧桥边')
    && parsed.branch?.选项.length === 2,
  '01 必须独立解析正文、属性与可选分支',
)
const fourFieldOutput = parseNarrativeResponseEnvelope(JSON.stringify({
  正文: '宫门洞开，迁都诏书与大赦名册一并传往天下。',
  属性: { 心智: 0, 体魄: 0, 魅力: 0, 财富: 0 },
  命运分支: false,
  结局: false,
}))
assertOk(
  fourFieldOutput.narrative.includes('迁都诏书'),
  '01 缺少临时字段时仍必须保留可用正文',
)
const publicResults = [
  JSON.parse(validWithBranch),
  { 正文: '粮路恢复，城邦获得稳定补给。', 属性: { 心智: 3, 体魄: 1, 魅力: -1, 财富: 2 }, 命运分支: false, 结局: false },
  { 正文: '你安然辞世，港口由议会接管。', 属性: { 心智: 2, 体魄: 1, 魅力: -1, 财富: 0 }, 命运分支: false, 结局: '此生无憾' },
]
const currentAttributes = { 心智: 2, 体魄: 1, 魅力: -1, 财富: 0 }
assertOk(
  NarrativeAIStoryResultSchema.safeParse({
    时间定位: '20岁·317年',
    事件结果: [{ 事件: '码头开放', 成因: '商路封锁', 结果: '城邦恢复补给', 影响: '粮价回落' }],
    正文: '码头开放，城邦恢复补给。', 命运分支: false, 属性: currentAttributes, 结局: false,
  }).success,
  '01 声明Schema须接受新版事件结果对象数组，不增加临时字段运行门禁',
)
for (const publicResult of publicResults) {
  const expected = parseNarrativeResponseEnvelope(JSON.stringify(publicResult), { currentAttributes })
  const eventResults = [{ 事件: '码头开放', 成因: '商路封锁', 结果: '城邦恢复补给', 影响: '粮价回落' }]
  const expectedWithEvents = {
    narrative: expected.narrative,
    eventResults,
    ...(expected.branch ? { branch: expected.branch } : {}),
    ...(expected.ending ? { ending: expected.ending } : {}),
    ...(expected.attributeChanges ? { attributeChanges: expected.attributeChanges } : {}),
  }
  for (const [payload, expectedResult] of [
    [{ 时间定位: '20岁·317年', 事件结果: eventResults, ...publicResult }, expectedWithEvents],
    [{ ...publicResult, 时间定位: '20岁·317年', 事件结果: eventResults }, expectedWithEvents],
    [{ 时间定位: null, 事件结果: { 异常: true }, ...publicResult }, expected],
  ]) {
    const actual = parseNarrativeResponseEnvelope(JSON.stringify(payload), { currentAttributes })
    assertOk(
      JSON.stringify(actual) === JSON.stringify(expectedResult),
      '01 合法事件结果应被独立恢复并保留到历史材料，异常事件结果不得阻断或污染正文、分支、结局及属性结果',
    )
  }
}
const arrayWrappedNarrative = parseNarrativeResponseEnvelope(JSON.stringify([{
  年龄: 1,
  心智: 2,
  体魄: 4,
  魅力: 0,
  财富: 0,
  正文: '母亲把你放进学步车里，父亲弯腰捡起铜纽扣塞进你手心。',
  命运分支: false,
  结局: false,
}]))
assertOk(
  arrayWrappedNarrative.narrative === '母亲把你放进学步车里，父亲弯腰捡起铜纽扣塞进你手心。',
  '01 顶层数组包裹的正文必须以 JSON 字符串本体结束，不得吞入闭合引号与字段逗号',
)
const standardJsonBranch = parseNarrativeResponseEnvelope(JSON.stringify({
  年龄: '20岁',
  心智: '3',
  体魄: '1',
  魅力: '-1',
  财富: '0',
  正文: '你核清旧账，三条去路同时摆到面前。',
  命运分支: ['留在商号', '独自北上', '回城查旧案'],
  结局: [false],
}), {
  currentAttributes: { 心智: 2, 体魄: 1, 魅力: -1, 财富: 0 },
})
assertOk(
  JSON.stringify(standardJsonBranch.branch?.选项) === JSON.stringify(['留在商号', '独自北上', '回城查旧案'])
    && standardJsonBranch.attributeChanges?.心智 === 1,
  '01 标准 JSON 必须解析命运分支顶层字段并把绝对值换算为本轮差值',
)
const standardJsonEnding = parseNarrativeResponseEnvelope(JSON.stringify({
  年龄: '80岁',
  心智: '0',
  体魄: '0',
  魅力: '0',
  财富: '0',
  正文: '你在旧宅中安然辞世。',
  命运分支: [false],
  结局: ['此生无憾', '你把未竟之事交给了后来者。'],
}))
assertOk(
  !standardJsonEnding.branch
    && standardJsonEnding.ending?.评语 === '此生无憾'
    && standardJsonEnding.ending?.总结 === '你把未竟之事交给了后来者。',
  '01 标准 JSON 必须解析两元素结局数组并清除未触发分支',
)
const standardJsonInactive = parseNarrativeResponseEnvelope(JSON.stringify({
  年龄: '20岁',
  心智: '0',
  体魄: '0',
  魅力: '0',
  财富: '0',
  正文: '你在渡口等了很久，风停了。',
  命运分支: [false],
  结局: [false],
}))
assertOk(!standardJsonInactive.branch && !standardJsonInactive.ending, '01 标准 JSON 的 [false] 必须表示未触发')
const nestedCurrentAttributes = parseNarrativeResponseEnvelope(JSON.stringify({
  正文: '你在旧港接手了商号，名望与产业由此改观。',
  属性: { 心智: 4, 体魄: 2, 魅力: 3, 财富: 6 },
  命运分支: false,
  结局: false,
}), {
  currentAttributes: { 心智: 3, 体魄: 2, 魅力: 1, 财富: 4 },
})
assertOk(
  nestedCurrentAttributes.attributeChanges?.心智 === 1
    && nestedCurrentAttributes.attributeChanges?.体魄 === undefined
    && nestedCurrentAttributes.attributeChanges?.魅力 === 2
    && nestedCurrentAttributes.attributeChanges?.财富 === 2,
  '01 必须把嵌套财富等属性当前值换算为内部属性差值',
)
const malformedLabeledNarrative = parseNarrativeResponseEnvelope(`[{"年龄":2岁|心智:2|体魄:4|魅力:0|财富:0]
"正文": "父亲从旧大衣里翻出一枚银西可，放进你掌心，说这是魔法世界的钱，留着。",
"命运分支": false,
"结局": false}]`)
assertOk(
  malformedLabeledNarrative.narrative === '父亲从旧大衣里翻出一枚银西可，放进你掌心，说这是魔法世界的钱，留着。',
  '01 畸形协议包装必须精确提取正文字符串，不得吞入闭合引号与字段逗号',
)
const lifeSimulatorBranch = parseNarrativeResponseEnvelope(`【年龄:20岁|心智:3|体魄:1|魅力:-1|财富:0】
"正文": "你核清了旧账，三条去路同时摆到面前。"。
"命运分支": {["留在商号","独自北上","回城查旧案"]}。
"结局": "false"。`, {
  currentAttributes: { 心智: 2, 体魄: 1, 魅力: -1, 财富: 0 },
})
assertOk(lifeSimulatorBranch.branch?.选项.length === 3 && lifeSimulatorBranch.attributeChanges?.心智 === 1, '01 必须解析人生重开简写分支，并把状态行绝对值换算为本轮属性差值')
const lifeSimulatorQuality = inspectNarrativeResponseQuality(`【年龄:20岁|心智:3|体魄:1|魅力:-1|财富:0】
"正文": "你核清旧账后保住了商号的紧要货物。"。
"命运分支": "false"。
"结局": "false"。`, 200, undefined, segments.userSegments[0])
assertOk(lifeSimulatorQuality.valid && lifeSimulatorQuality.parsed?.attributeChanges?.心智 === 1, '01 正式质量入口必须从数据层读取当前属性并换算状态行差值')
const unlabeledLifeSimulators = [
  parseNarrativeResponseEnvelope('【年龄:4岁|心智:5|体魄:1|魅力:1|财富:1】\n\n"考文垂的姨妈家比伦敦旧宅宽敞，却更冷清。姨父在自行车厂上班，表姐已出嫁，空出的阁楼成了你的房间。搬来第三天，你帮姨妈晾衣服，发现后院矮墙外有条窄巷，巷口废木箱下压着一份《预言家日报》——纸张泛黄，日期是1981年11月2日，头版标题只剩半行：『神秘人……败……』其余被雨水泡烂。你蹲着读完能辨认的段落，提到『巫师界欢庆』『麻瓜当局未予置评』。姨妈在屋里喊你，你把报纸折好塞进裤腰。当晚阁楼老鼠啃墙，你摸出铜钥匙对着月光看，柄上符号与报头花体字母的弧度相似——不是巧合。你把报纸藏进床垫下，钥匙重新贴身收好。"\n\n"命运分支": ["把报纸拿给姨妈看，试探她是否知情","白天再去巷口翻找废木箱下有没有更多旧报","记住报头日期与符号，暂时不动声色"]'),
  parseNarrativeResponseEnvelope('【年龄:5岁|心智:5|体魄:1|魅力:1|财富:1】\n\n考文垂的春天多雨，阁楼墙角洇出一片水渍。你趁姨妈去集市，搬开床垫检查藏报，发现《预言家日报》边缘被水汽泡软，墨迹正一圈圈晕开。你决定把残存字句全部誊到算术本上，再烧掉原报。誊抄到『神秘人败』那半行时，你忽然想起旧货铺老板的眼神——他认得这符号，却不肯收钥匙。你翻出铜钥匙，柄上右弧与报头花体『P』完全咬合。你第一次意识到：这枚钥匙不是废铜，是某扇门或某个箱子的凭证。傍晚姨妈回来，说巷口废木箱被市政收走了，连同底下压着的一切。你点头，把誊本和钥匙分藏两处。夜里雨停，阁楼老鼠没再啃墙——它们搬走了，像知道这里已无纸可咬。'),
  parseNarrativeResponseEnvelope('【年龄:6岁|心智:5|体魄:1|魅力:1|财富:1】\n\n补锅匠卷走誊本后，你接连几夜睡不实，听见厨房水管滴答都像有人在翻纸。姨妈为贴补家用，把临街窗台改成杂货摊，卖火柴、蜡烛和针线。你负责看摊，某日一个穿灰呢斗篷的男人停在摊前，不买货，只问了一句：“你家阁楼以前住过补锅匠？”你点头。他掏出一枚银西可放在窗台上，说那补锅匠欠他一样东西，若再有人来问，别答话，收下钱就是。银币边缘有细齿，你趁姨妈转身，将它和铜钥匙一并缝进贴身衣兜的夹层。当晚你摸着两枚硬物，明白自己手里攥的不只是遗物，而是一条正被人追查的线头。\n\n"命运分支": ["把银西可拿给姨妈，问她认不认得这种钱", "白天去巷口打听灰斗篷男人的来历", "缝死衣兜，此后不再向任何人出示钥匙与银币"]'),
]
assertOk(unlabeledLifeSimulators[0].narrative.startsWith('考文垂的姨妈家') && !unlabeledLifeSimulators[0].narrative.includes('【年龄') && !unlabeledLifeSimulators[0].narrative.includes('命运分支') && JSON.stringify(unlabeledLifeSimulators[0].branch?.选项) === JSON.stringify(['把报纸拿给姨妈看，试探她是否知情', '白天再去巷口翻找废木箱下有没有更多旧报', '记住报头日期与符号，暂时不动声色']), '01 缺少正文字段标签但边界唯一时必须恢复正文与三个分支')
assertOk(unlabeledLifeSimulators[1].narrative.startsWith('考文垂的春天多雨') && !unlabeledLifeSimulators[1].narrative.includes('【年龄') && !unlabeledLifeSimulators[1].branch, '01 状态行后无标签无引号正文必须剥离状态行')
assertOk(unlabeledLifeSimulators[2].narrative.startsWith('补锅匠卷走誊本后') && !unlabeledLifeSimulators[2].narrative.includes('【年龄') && !unlabeledLifeSimulators[2].narrative.includes('命运分支') && JSON.stringify(unlabeledLifeSimulators[2].branch?.选项) === JSON.stringify(['把银西可拿给姨妈，问她认不认得这种钱', '白天去巷口打听灰斗篷男人的来历', '缝死衣兜，此后不再向任何人出示钥匙与银币']), '01 状态行后无标签正文必须剥离状态行并保留三个分支')
const lifeSimulatorEnding = parseNarrativeResponseEnvelope(`【年龄:80岁|心智:3|体魄:-2|魅力:1|财富:0】
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
      { 路线: '深度强化', 名称: '听隙入微', 详细介绍: '能分辨更细的近处渗漏差异。', 效果描述: '同类水声中更快辨清堵塞位置。', 属性加成: { 财富: 4, 体魄: -1 } },
      { 路线: '广度强化', 名称: '百流同辨', 详细介绍: '在更多水域环境中分辨异常水声。', 效果描述: '陌生河港也可依水声判断近处水路异常。', 属性加成: { 心智: 2, 财富: 1 } },
      { 路线: '转变强化', 名称: '引流成势', 详细介绍: '把对近处水压的判断化为直接引导细小水流。', 效果描述: '可改变近处少量水流的去向，但不额外扩大影响总量。', 属性加成: { 心智: -1, 财富: 4 } },
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
noLocalBudget.成长判定.下一阶方向[0].属性加成 = { 财富: 100, 体魄: -50 }
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

const qualityPromptInput = JSON.stringify([
  { 世界: { 名称: '', 描述: '' } },
  { 玩家信息: { 姓名: '', 性别: '', 种族: '', 背景: '', 天赋技能: [] } },
  { 历史输出: { 事件: [] } },
  { 玩家本次点属性: { 心智: '3', 体魄: '2', 魅力: '1', 财富: '4' } },
  { 本次信息: { 时间节点: '', 命运分支: '', 篇幅偏好: '正文约200字。' } },
])
const quality = inspectNarrativeResponseQuality(JSON.stringify({
  正文: '一段完整故事。',
  命运分支: false,
  属性: { 心智: 4, 体魄: 2, 魅力: 1, 财富: 6 },
  结局: false,
}), 200, undefined, qualityPromptInput)
assertOk(
  quality.valid === true
    && quality.parsed?.narrative === '一段完整故事。'
    && quality.parsed?.attributeChanges?.心智 === 1
    && quality.parsed?.attributeChanges?.财富 === 2,
  '01 质量检查必须从五元素输入读取财富等属性基准并形成差值',
)

assertOk(
  narrativePrompt.version === '9.15.0'
    && narrativeStoryContinuityPrompt.version === '3.1.0'
    && narrativeTalentGrowthPrompt.version === '3.6.0'
    && narrativeStoryContinuityPrompt.outputFormat === 'json'
    && narrativeTalentGrowthPrompt.outputFormat === 'json',
  '01/02/03 Prompt 必须绑定当前单一职责版本',
)
assertOk(
  fs.readFileSync(new URL('../../../../../docs/prompt.txt', import.meta.url), 'utf8')
    === COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE,
  '外部主叙事 Prompt 必须与服务端样例动态编译文本逐字一致',
)
assertOk(
  ['"时间定位"', '"事件结果"', '"正文"', '"命运分支"', '"属性"', '"结局"'].every((field) => COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(field))
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"篇幅偏好"')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"历史事件"')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"当前状态"'),
  '固定主故事 Prompt 必须声明六个输出字段，应用只消费四项结果',
)
if (failed > 0) process.exit(1); console.log('[narrative-chinese-protocol-regression] PASS')

