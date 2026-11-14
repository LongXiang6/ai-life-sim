/**
 * Purpose: Regress the approved 01/02/03 Chinese message and response contracts.
 * Owner: quality:narrative
 * Responsibility: Dynamic message fixtures, tolerant story parsing, and strict post-call Schemas only.
 */

import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { parseAIJSON } from '../../../../src/core/ai-service/parse-ai-json.ts'
import { NarrativeAIStoryResultSchema, NarrativeAIStoryContinuityDataSchema, NarrativeAITalentGrowthDataSchema } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { inspectNarrativeResponseQuality, inspectNarrativeStoryContinuityQuality, inspectNarrativeTalentGrowthQuality } from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { buildNarrativeTalentGrowthPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-talent-growth-context.ts'
import { createPendingDestinyPatternGrowth, recordDestinyPatternGrowthAssessmentsInState, recordDestinyPatternGrowthEvidenceInState, registerPendingDestinyPatternGrowthInState, resolvePendingDestinyPatternGrowthInState, validateDestinyPatternAttrBonusForAptitude } from '../../../../src/mods/mod-character/destiny-pattern-growth.ts'
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
import { formatDestinyPatternsForPrompt } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system/prompt-talent-projection.ts'
import { NarrativeControlPlane } from '../../../../src/mods/mod-engine/helpers/narrative-control-plane.ts'
import {
  normalizeBirthProfile,
  normalizeEventCards,
  normalizeLifePlan,
} from '../../../../src/mods/mod-engine/helpers/narrative-control-plane-normalizers.ts'
import { buildNarrativeControlPrompt } from '../../../../src/mods/mod-engine/helpers/narrative-control-plane-call.ts'
import { splitNarrativeBatchResponse } from '../../../../src/mods/mod-engine/helpers/main-narrative-call.ts'
import {
  birthFingerprint,
  baseFingerprint,
  buildNarrativeControlInput,
  NARRATIVE_BIRTH_PROFILE_VERSION,
  NARRATIVE_EVENT_POOL_VERSION,
  NARRATIVE_PLAN_VERSION,
  projectLifePlanForControlPlane,
} from '../../../../src/mods/mod-engine/helpers/narrative-control-plane-input.ts'
import {
  advanceCharacterNarrativeStatus,
  createCharacterNarrativeStatus,
} from '../../../../src/mods/mod-character/subsystems/character-status-runtime.ts'
import { applyCharacterStatusUpdate } from '../../../../src/mods/mod-character/subsystems/character-status-update.ts'
import { sanitizeCharacterNarrativeStatus } from '../../../../src/mods/mod-character/subsystems/character-status-validation.ts'
import {
  CHARACTER_BASE_POINTS_PER_YEAR,
  CHARACTER_DAYS_PER_YEAR,
} from '../../../../src/foundation/subsystem-contracts/character-state.contract.ts'
import {
  FATE_DRAMATIC_BIAS_LABELS,
  FATE_DRAMATIC_BIASES,
} from '../../../../src/foundation/types/narrative/control-plane.ts'
import {
  DIFFICULTY_NARRATIVE_GUIDANCE,
  DIFFICULTY_ORDER,
} from '../../../../src/foundation/types/narrative/difficulty.ts'

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
/**
 * 事件卡契约夹具：按当前卡片契约补齐字段，调用方只声明与本条断言相关的差异。
 * 名称必须保持 2–8 个字符；默认值由抽取与归一化共用。
 */
const eventCard = (partial = {}) => {
  const id = partial.id ?? 'event-card'
  const fallbackName = Array.from(`事件${id}`).slice(0, 8).join('')
  return {
    id,
    名称: fallbackName,
    正负: '双面',
    权重: 3,
    sourceFingerprint: 'event-card-fixture',
    ...partial,
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
    基础属性: {
      当前状态: { 心智: '善于处理复杂信息', 体魄: '稳定耐力', 魅力: '普通', 财富: '普通', 气运: '普通' },
    },
  },
  characterStatusView: {
    年龄: 19,
    自然寿命参考年龄: 100,
    属性数值: { mind: 2, physique: 1, charisma: -1, familyBackground: 0 },
    伤势: '不应发送',
  },
  talents: [{ 名称: '听潮辨隙', 资质阶位: '普通', 开发阶段: '初醒', 效果: '能根据近处水声察觉明显堵塞。' }],
  timelineMemory: ['议事会同意先做低潮勘查。'],
  recentStories: ['你仍是雾潮群岛的测潮学徒，住在港区，持有临时闸槽通行权。'],
  currentTime: '317年4月',
  narrativeTimeWindow: '本轮覆盖一个自然年；已推进365天。',
  wordCountInstruction: '正文约200字。',
  playerBranchIntent: {
    命运分支: '利用低潮窗口复测闸槽，确认安全后完成临时封堵。',
    当前可叙述状态: '不应发送',
  },
  controlPlane: {
    birthProfile: {
      出生地点: '雾港外湾',
      家庭结构: '两代渔工家庭',
      照料者: '父母共同照料',
      家庭资源: '稳定但有限',
      社会处境: '港区居民',
      机会: [],
      限制: [],
      叙事背景: '你出生在受海雾影响的外湾。',
      介入前史: '你在港区长大，十六岁开始学习测潮。',
      sourceFingerprint: 'internal-birth-source',
    },
    difficultyGuidance: '保持中性基线：不额外赐予主角光环，也不针对主角；按世界规则、行动和因果裁决。',
    eventCards: [
      {
        id: 'internal-card-tide-gate',
        名称: '闸槽开裂',
        正负: '负',
        权重: 4,
        sourceFingerprint: 'internal-card-source',
      },
      {
        id: 'internal-card-low-tide',
        名称: '低潮提前',
        正负: '双面',
        权重: 3,
        sourceFingerprint: 'internal-card-source',
      },
    ],
    dueWorldEvents: [],
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
  JSON.stringify(Object.keys(storyMessages[1].玩家信息)) === JSON.stringify(['姓名', '性别', '种族', '背景', '属性尺度', '当前属性语义', '天赋技能']),
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
    && JSON.stringify(Object.keys(storyMessages[4].本次信息)) === JSON.stringify([
      '时间节点',
      '时间窗口',
      '自然寿命参考年龄',
      '命运分支',
      '篇幅偏好',
      '叙事称呼',
      '文风偏好',
      '控制平面',
    ]),
  '01 属性与本次信息必须严格保留数据层字段',
)
assertOk(
  storyMessages[1].玩家信息.属性尺度.includes('-10')
    && storyMessages[1].玩家信息.当前属性语义.心智
    && storyMessages[1].玩家信息.天赋技能[0].资质阶位 === '普通'
    && storyMessages[1].玩家信息.天赋技能[0].开发阶段 === '初醒'
    && storyMessages[1].玩家信息.天赋技能[0].名称 === '听潮辨隙'
    && storyMessages[1].玩家信息.天赋技能[0].效果.includes('近处水声')
    && storyMessages[4].本次信息.命运分支.includes('利用低潮窗口')
    && storyMessages[4].本次信息.篇幅偏好 === '正文约200字。'
    && storyMessages[4].本次信息.叙事称呼 === '第二人称（用“你/你的”）'
    && storyMessages[4].本次信息.文风偏好 === ''
    && storyMessages[4].本次信息.自然寿命参考年龄 === 100
    && storyMessages[4].本次信息.控制平面.出生背景.介入前史 === '你在港区长大，十六岁开始学习测潮。'
    && JSON.stringify(storyMessages[3].玩家本次点属性) === JSON.stringify({ 心智: '2', 体魄: '1', 魅力: '-1', 财富: '0' }),
  '01 数据层必须传递天赋、玩家行动、整数字符串属性、介入前史和自然寿命参考年龄',
)
const compactCards = storyMessages[4].本次信息.控制平面.事件卡池
assertOk(
  storyMessages[4].本次信息.控制平面.难度指引.includes('中性基线')
    && Array.isArray(compactCards)
    && compactCards.length === 2
    && JSON.stringify(compactCards) === JSON.stringify(['闸槽开裂', '低潮提前']),
  '控制平面必须只投影事件卡池名称数组，不携带卡片字段',
)
assertOk(
  compactCards.every((name) => typeof name === 'string' && Array.from(name).length >= 2 && Array.from(name).length <= 8)
    && !JSON.stringify(compactCards).includes('sourceFingerprint')
    && JSON.stringify(storyMessages[4].本次信息.控制平面).includes('出生背景'),
  '事件卡池投影只保留 2–8 字名称，旧候选与方向字段不得进入数据层',
)
assertOk(
  storyMessages[4].本次信息.时间窗口.includes('本轮覆盖')
    && storyMessages[4].本次信息.时间窗口.includes('已推进')
    && !storyMessages[4].本次信息.时间窗口.includes('宏观编年体')
    && !storyMessages[4].本次信息.时间窗口.includes('3 至 5 个时间阶段'),
  '01 时间窗口只传递跨度事实，不再夹带宏观编年配额',
)
const composedStoryMessage = composeNarrativeUserMessage(segments.userSegments[0])
assertOk(
  !composedStoryMessage.includes('代码区块')
    && composedStoryMessage.includes('# 角色')
    && composedStoryMessage.includes('# 输出')
    && composedStoryMessage.includes('议事会同意先做低潮勘查。')
    && composedStoryMessage.includes('"财富": "0"'),
  '01 服务端必须按受保护主故事资产顺序合成唯一 user 消息',
)
assertOk(
  [
    '你是人生模拟器',
    '角色是中心',
    '历史是已经发生的人生',
    '事件是角色选择与世界反应共同留下的结果',
    '正文像人生小说的一章，不是因果报告',
    '允许概括、跳跃、留白',
    '“人生规划”和“事件卡池”只是软提示',
    '属性只写发生持续变化的项',
    '事件卡消费（可选）',
    '天赋表现线索（可选）',
  ].every((phrase) => composedStoryMessage.includes(phrase)),
  '01 核心契约必须角色中心、正文优先并提供最小输出协议',
)
assertOk(
  [...composedStoryMessage.matchAll(/【示例\d｜世界观：/gu)].length === 0
    && (composedStoryMessage.match(/"正文":/gu) ?? []).length === 1
    && composedStoryMessage.includes('"属性":')
    && composedStoryMessage.includes('"角色死亡": false')
    && composedStoryMessage.includes('"命运分支": false')
    && composedStoryMessage.includes('"结局": false')
    && composedStoryMessage.indexOf('# 角色') < composedStoryMessage.indexOf('# 输入')
    && composedStoryMessage.indexOf('# 输入') < composedStoryMessage.indexOf('# 写法')
    && composedStoryMessage.indexOf('# 写法') < composedStoryMessage.indexOf('# 输出'),
  '编译后的主故事消息必须只保留一份最小 JSON 输出并保持角色/输入/写法/输出顺序',
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
const multiResultProjection = projectNarrativeResultForPrompt({
  text: multiResultNarrative,
  displayAge: 18,
})
assertOk(
  multiResultProjection === `18岁：${multiResultNarrative}`,
  '01 近期历史始终投影完整正文，不再依赖结构化事件账本',
)
const olderProjection = projectNarrativeHistoryEntryRuntime(null, {
  text: multiResultNarrative,
  displayAge: 18,
}, 1)
const olderFallbackProjection = projectNarrativeHistoryEntryRuntime(null, {
  text: multiResultNarrative,
  displayAge: 19,
}, 2)
assertOk(
  JSON.stringify(formatNarrativeTimelineForPrompt([olderProjection, olderFallbackProjection]))
    === JSON.stringify([
      `18岁：${multiResultNarrative}`,
      `19岁：${multiResultNarrative}`,
    ]),
  '01 较早未压缩轮次直接投影完整正文，缺少账本时不做二次推断',
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
  JSON.parse(infantSegments.userSegments[0])[4].本次信息.时间节点
    === '当前年龄=1；内部阶段索引=1；只用于合龄裁决，不转写为正文',
  '01 本次信息必须保留不可见的当前阶段索引',
)
assertOk(
  !segments.full.includes('subsystemStates')
    && !segments.full.includes('当前到期事件'),
  '01 不得泄漏内部状态字段',
)
const growthPatterns = [
  ['lineage-enhancement', '强化命格', 'enhancement', 5],
  ['lineage-perception', '感知命格', 'perception', 1],
  ['lineage-control', '操控命格', 'control', 1],
  ['lineage-creation', '创造命格', 'creation', 1],
].map(([lineageId, name, category, aptitudeTier], index) => ({
  lineageId,
  version: index + 1,
  id: `pattern-${index + 1}`,
  name,
  description: `${name}的能力说明。`,
  category,
  aptitudeTier,
  developmentStage: 'awakening',
  effect: `${name}在相关事件中形成直接结果。`,
  attrBonus: { physique: 1 },
}))
const recentGrowthSource = structuredClone(growthPatterns[0])
const recentGrowthResult = { ...structuredClone(recentGrowthSource), version: 5, developmentStage: 'mastery' }
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
  growthEvidence: growthPatterns.slice(1).flatMap((pattern, index) => ([
    {
      lineageId: pattern.lineageId,
      sourceRound: 15,
      usage: `${pattern.name}在检修中被实际使用。`,
      result: `${pattern.name}形成了可复核结果。`,
    },
    {
      lineageId: pattern.lineageId,
      sourceRound: 16,
      usage: `${pattern.name}再次在现场被实际使用。`,
      result: `${pattern.name}再次形成了可复核结果。`,
      ...(index === 0 ? { breakthrough: '一次突发险情促成了能力突破。' } : { breakthrough: '一次关键复测促成了能力突破。' }),
    },
  ])),
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
const growthState = (patterns, pendingGrowth = null, growthHistory = []) => ({ candidates: [], patterns, aptitudeCount: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }, pendingGrowth, growthHistory, growthEvidence: [], growthAssessments: [] })
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
const evidenceState = {
  ...growthState([growthPatterns[1]]),
  growthEvidence: [],
  growthAssessments: [{
    lineageId: growthPatterns[1].lineageId,
    evaluatedThroughRound: 10,
    evaluatedBreakthroughRound: 9,
  }],
}
const recordedEvidenceState = recordDestinyPatternGrowthEvidenceInState(evidenceState, [
  { lineageId: growthPatterns[1].lineageId, sourceRound: 12, usage: '在险情中实际使用。', result: '成功稳定局面。' },
  { lineageId: growthPatterns[1].lineageId, sourceRound: 12, usage: '同回合再次验证。', result: '结果可复核。', breakthrough: '突发险情促成突破。' },
])
const recordedAssessmentState = recordDestinyPatternGrowthAssessmentsInState(
  recordedEvidenceState,
  [{ lineageId: growthPatterns[1].lineageId, evaluatedThroughRound: 12 }],
)
assertOk(
  recordedEvidenceState.growthEvidence.length === 1
    && recordedEvidenceState.growthEvidence[0].usage.includes('再次验证')
    && recordedEvidenceState.growthEvidence[0].breakthrough === '突发险情促成突破。',
  '03 同一回合多条天赋线索必须合并为一个证据窗口并保留突破契机',
)
assertOk(
  recordedAssessmentState.growthAssessments[0].evaluatedThroughRound === 12
    && recordedAssessmentState.growthAssessments[0].evaluatedBreakthroughRound === 9,
  '03 复评水位更新时不能因新结果缺少突破字段而覆盖既有突破水位',
)
const reincarnationSource = {
  lineageId: 'reincarnation-lineage',
  version: 1,
  id: 'reincarnation-v1',
  name: '回声天赋',
  description: '能把曾经经历过的声音重新带回当前判断。',
  category: 'perception',
  aptitudeTier: 1,
  developmentStage: 'awakening',
  effect: '在相关事件中恢复关键声音线索。',
  attrBonus: {},
  apexStrengthenLevel: 0,
  acquiredAt: 100,
  source: { worldName: '旧世界', characterName: '旧角色' },
}
const reincarnationPendingGrowth = createPendingDestinyPatternGrowth({
  narrativeId: 'reincarnation-narrative',
  roundSequence: 20,
  source: reincarnationSource,
  directions: [
    { route: '深度强化', name: '回声入微', description: '让已有声音线索更清晰。', effect: '恢复更细的声音差异。', attrBonus: { mind: 1 } },
    { route: '广度强化', name: '百声通识', description: '让声音线索覆盖更多场景。', effect: '在更多环境中恢复声音线索。', attrBonus: { mind: 1 } },
    { route: '转变强化', name: '借声成象', description: '把声音线索转为可供判断的画面。', effect: '通过声音形成新的判断媒介。', attrBonus: { luck: 1 } },
  ],
})
const reincarnationState = growthState([growthPatterns[2]])
const reincarnationPendingState = registerPendingDestinyPatternGrowthInState(
  reincarnationState,
  reincarnationPendingGrowth,
  16,
  [reincarnationSource],
)
const reincarnationResolved = resolvePendingDestinyPatternGrowthInState(
  reincarnationPendingState,
  reincarnationPendingGrowth.options[0].optionId,
  100,
  20000,
  [reincarnationSource],
)
assertOk(
  reincarnationPendingState.pendingGrowth?.source.apexStrengthenLevel === 0
    && reincarnationResolved.reincarnationTalents?.[0].version === 2
    && reincarnationResolved.state.patterns[0].lineageId === growthPatterns[2].lineageId,
  '03 轮回天赋必须复用同一成长状态，并在玩家确认后更新原携带槽而不伪造普通命格',
)
const transformationSource = {
  ...structuredClone(growthPatterns[1]),
  id: 'transformation-v1', lineageId: 'transformation-lineage', version: 1,
  category: 'enhancement', name: '体能强化',
  aptitudeTier: 2,
  description: '你可以主动强化身体的爆发力。', effect: '发动后身体力量得到局部增强。',
  attrBonus: { physique: 1 },
}
const firstTransformation = createPendingDestinyPatternGrowth({
  narrativeId: 'transformation-round-3', roundSequence: 3, source: transformationSource,
  directions: [
    { route: '深度强化', name: '体能爆发', description: '你能增强同类身体爆发。', effect: '身体爆发更强。', attrBonus: { physique: 2 } },
    { route: '广度强化', name: '持久强化', description: '你能在持续行动中强化身体。', effect: '身体强化适用更多行动。', attrBonus: { physique: 1 } },
    { route: '转变强化', name: '机械共鸣', description: '强化的力量沿掌心传入机件，卡死的齿轮随呼吸重新咬合，身体仍可独立发力。', effect: '保留主动身体强化；触碰机械时可将强化力量用于协调其运转。', attrBonus: { mind: 2 } },
  ],
})
const firstTransformationResult = resolvePendingDestinyPatternGrowthInState(
  registerPendingDestinyPatternGrowthInState(growthState([transformationSource]), firstTransformation, 19),
  firstTransformation.options[2].optionId, 100, 3000,
)
const transformedEvidenceState = recordDestinyPatternGrowthEvidenceInState(
  { ...firstTransformationResult.state, growthEvidence: [], growthAssessments: [] },
  [28, 29, 30].map((sourceRound) => ({
    lineageId: transformationSource.lineageId, sourceRound,
    usage: '你以机械共鸣协调元素供能机械。', result: '机械运动被实际调整，救援通道恢复。',
    ...(sourceRound === 30 ? { breakthrough: '元素核心失控时，你通过共鸣触及供能元素并完成救援，能力发生质变。' } : {}),
  })),
)
const transformedGrowthInput = buildNarrativeTalentGrowthPromptInput({
  patterns: transformedEvidenceState.patterns, compressedSummaries: { summaries: [] }, recentStories: [],
  currentRound: 30, totalBasePoints: 26001, currentAge: 42,
  growthHistory: transformedEvidenceState.growthHistory,
  growthEvidence: transformedEvidenceState.growthEvidence, growthAssessments: [],
  worldContext: { 描述: '机械与元素能力都可以觉醒，元素核心用于驱动机械。' },
})
const currentTransformedCandidate = JSON.parse(transformedGrowthInput.userSegments[2]).玩家已选天赋[0]
assertOk(
  transformedGrowthInput.eligiblePatterns.length === 1
    && currentTransformedCandidate.名称 === '机械共鸣'
    && currentTransformedCandidate.当前版本 === 2
    && currentTransformedCandidate.效果描述 === firstTransformationResult.historyEntry.result.effect
    && currentTransformedCandidate.目标开发阶段 === '圆满',
  '03 下一次进阶必须使用已确认的新能力与新证据，不回到最初能力',
)
const secondTransformation = createPendingDestinyPatternGrowth({
  narrativeId: 'transformation-round-30', roundSequence: 30, source: transformedGrowthInput.eligiblePatterns[0],
  directions: [
    { route: '深度强化', name: '机械协调', description: '你能更准确地协调机械。', effect: '机械共鸣控制更加精细。', attrBonus: { mind: 3 } },
    { route: '广度强化', name: '百械共鸣', description: '你能与更多种类的机械共鸣。', effect: '机械共鸣适用更多器械。', attrBonus: { mind: 2 } },
    { route: '转变强化', name: '元素掌控', description: '掌心的力量顺着机轴流入供能核心，让失控火流沿着选定导管重新归位。', effect: '保留身体强化与触碰机械时协调运转的能力，并能沿机械导管引导其中的元素流动；不能凭空制造元素。', attrBonus: { luck: 1 } },
  ],
})
const secondTransformationResult = resolvePendingDestinyPatternGrowthInState(
  registerPendingDestinyPatternGrowthInState(transformedEvidenceState, secondTransformation, 42),
  secondTransformation.options[2].optionId, 200, 26001,
)
const transformedPattern = secondTransformationResult.state.patterns[0]
const restoredTransformation = characterGrowthSnapshot(42, secondTransformationResult.state)
const transformedStoryTalents = formatDestinyPatternsForPrompt(secondTransformationResult.state.patterns, true)
assertOk(
  secondTransformationResult.state.patterns.length === 1
    && transformedPattern.name === '元素掌控' && transformedPattern.aptitudeTier === 2 && transformedPattern.developmentStage === 'complete'
    && transformedPattern.lineageId === transformationSource.lineageId && transformedPattern.version === 3
    && transformedPattern.attrBonus.physique === undefined && transformedPattern.attrBonus.mind === undefined
    && transformedPattern.attrBonus.luck === 1
    && secondTransformationResult.state.growthHistory.length === 2
    && secondTransformationResult.state.growthHistory[1].source.name === '机械共鸣'
    && secondTransformationResult.state.pendingGrowth === null,
  '03 连续选择转变强化须保留资质、推进开发阶段，并以完整新效果延续已成立能力',
)
assertOk(
  restoredTransformation.destinyPatterns.patterns[0].name === '元素掌控'
    && restoredTransformation.destinyPatterns.growthHistory.length === 2
    && transformedStoryTalents.length === 1 && transformedStoryTalents[0].名称 === '元素掌控'
    && transformedStoryTalents[0].效果 === transformedPattern.effect,
  '03 存档恢复与主故事天赋投影必须使用最终确认版本，历史能力不另行叠加',
)
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
const livingEndingOutput = parseNarrativeResponseEnvelope(JSON.stringify({
  正文: '你把港区测潮学徒的职责交给后来者，仍以顾问身份留在议事会。',
  属性: { 心智: 0, 体魄: 0, 魅力: 0, 财富: 0 },
  角色死亡: false,
  命运分支: false,
  结局: { 评语: '功成身退', 总结: '你结束了这段人生旅程，但仍然活着。' },
}))
assertOk(
  Boolean(livingEndingOutput.ending)
    && livingEndingOutput.characterDeath === undefined,
  '01 普通人生结局不得推断或创建角色死亡状态',
)
const explicitDeathOutput = parseNarrativeResponseEnvelope(JSON.stringify({
  正文: '战斗的重击夺去你的生命，护送队将你的遗物带回港城。',
  属性: { 心智: 0, 体魄: 0, 魅力: 0, 财富: 0 },
  角色死亡: { 死因类型: 'trauma', 死因: '战斗中遭受致命重击' },
  命运分支: false,
  结局: { 评语: '此生已尽', 总结: '战斗中遭受致命重击，此生至此结束。' },
}))
assertOk(
  explicitDeathOutput.characterDeath?.死因类型 === 'trauma'
    && explicitDeathOutput.ending?.评语 === '此生已尽',
  '01 明确死亡必须恢复正式死因并进入结局',
)
const lifespanDraft = {
  raceId: 'human',
  race: { name: '人类', baseLifespanYears: 100, clockMode: 'aging' },
  maximumLifespanYears: 100,
}
const worldLifeStageTemplate = [
  { stageId: 'life-stage-1', displayName: '幼年期', description: '依赖照料', minAgeDays: 0, maxAgeDays: 6 * CHARACTER_DAYS_PER_YEAR, guidance: '按幼年处境推进' },
  { stageId: 'life-stage-2', displayName: '成长期', description: '学习与探索', minAgeDays: 6 * CHARACTER_DAYS_PER_YEAR, maxAgeDays: 18 * CHARACTER_DAYS_PER_YEAR, guidance: '按成长处境推进' },
  { stageId: 'life-stage-3', displayName: '行世期', description: '承担社会角色', minAgeDays: 18 * CHARACTER_DAYS_PER_YEAR, maxAgeDays: 60 * CHARACTER_DAYS_PER_YEAR, guidance: '按行世处境推进' },
  { stageId: 'life-stage-4', displayName: '暮年期', description: '人生渐近收束', minAgeDays: 60 * CHARACTER_DAYS_PER_YEAR, guidance: '体现暮年阅历' },
]
const stageLifespanStatus = createCharacterNarrativeStatus({
  entityId: 'player-stage-lifespan',
  startingAgeYears: 50,
  totalBasePoints: 0,
  lifespanDraft,
  lifeStageTemplate: worldLifeStageTemplate,
})
const originalStageTemplate = JSON.stringify(stageLifespanStatus.lifeStageTemplate)
assertOk(
  stageLifespanStatus.currentStageId === 'life-stage-3'
    && stageLifespanStatus.lifeStageTemplate[3].displayName === '暮年期'
    && sanitizeCharacterNarrativeStatus(stageLifespanStatus)?.lifeStageTemplate.length
      === stageLifespanStatus.lifeStageTemplate.length,
  '角色状态必须保存可校验的未缩放生命阶段模板，并从中派生当前阶段',
)
assertOk(
  stageLifespanStatus.maximumLifespanDays === 100 * CHARACTER_DAYS_PER_YEAR
    && JSON.stringify(stageLifespanStatus.lifeStageTemplate) === originalStageTemplate,
  '自然寿命固定后，角色状态仍保留原始生命阶段模板',
)
const agelessStatus = createCharacterNarrativeStatus({
  entityId: 'player-ageless-stage',
  startingAgeYears: 50,
  totalBasePoints: 0,
  lifespanDraft: {
    ...lifespanDraft,
    race: { ...lifespanDraft.race, clockMode: 'ageless' },
  },
  lifeStageTemplate: worldLifeStageTemplate,
})
assertOk(
  agelessStatus.currentStageId === 'life-stage-3'
    && agelessStatus.endRisk === 0
    && agelessStatus.health.alive,
  '非衰老生命形态不产生自然寿命终局风险或自动死亡',
)
const lifespanStatus = createCharacterNarrativeStatus({
  entityId: 'player-lifespan',
  startingAgeYears: 16,
  totalBasePoints: 0,
  lifespanDraft,
})
const elapsedYearsBasePoints = 84 * CHARACTER_BASE_POINTS_PER_YEAR
const statusAtNaturalReference = advanceCharacterNarrativeStatus(
  lifespanStatus,
  16,
  elapsedYearsBasePoints,
)
assertOk(
  Math.floor(statusAtNaturalReference.ageDays / CHARACTER_DAYS_PER_YEAR) === 100
    && statusAtNaturalReference.maximumLifespanDays === 100 * CHARACTER_DAYS_PER_YEAR
    && statusAtNaturalReference.health.alive
    && statusAtNaturalReference.endRisk === 100,
  '到达自然寿命参考年龄只更新风险提示，不会自动死亡',
)
const explicitDeathStatus = structuredClone(statusAtNaturalReference)
const pendingDeath = applyCharacterStatusUpdate({
  status: explicitDeathStatus,
  payload: { deathCauseKind: 'trauma', deathCauseLabel: '战斗中遭受致命重击' },
  contextId: 'world-a',
  totalBasePoints: elapsedYearsBasePoints,
  evidenceEventIds: ['narrative-death'],
})
assertOk(
  explicitDeathStatus.health.alive === false
    && explicitDeathStatus.health.vitality === 0
    && pendingDeath?.causeKind === 'trauma'
    && pendingDeath?.causeLabel === '战斗中遭受致命重击',
  '明确死亡必须由角色状态所有者写入死亡状态并等待历史事实绑定',
)
const currentAttributes = { 心智: 2, 体魄: 1, 魅力: -1, 财富: 0 }
const schemaBase = {
  正文: '码头开放，城邦恢复补给。',
  属性: currentAttributes,
  命运分支: false,
  结局: false,
  角色死亡: false,
}
assertOk(
  NarrativeAIStoryResultSchema.safeParse(schemaBase).success
    && NarrativeAIStoryResultSchema.safeParse({ ...schemaBase, 属性: { 心智: 3 } }).success,
  '01 最小 Schema 必须接受完整或部分属性，不要求未变化项',
)
assertOk(
  NarrativeAIStoryResultSchema.safeParse({
    ...schemaBase,
    正文: '战斗的重击夺去你的生命，护送队将你的遗物带回港城。',
    角色死亡: { 死因类型: 'trauma', 死因: '战斗中遭受致命重击' },
    结局: '此生已尽',
  }).success
    && !NarrativeAIStoryResultSchema.safeParse({
      ...schemaBase,
      正文: '角色死亡却仍提供未决分支。',
      角色死亡: { 死因类型: 'trauma', 死因: '致命重击' },
      命运分支: ['继续前行', '等待援军'],
      结局: '此生已尽',
    }).success,
  '01 结构协议必须要求明确死亡与终局互斥的死亡分支',
)
const legacyFieldsOutput = parseNarrativeResponseEnvelope(JSON.stringify({
  ...schemaBase,
  时间定位: '20岁·317年',
  事件结果: [{ 事件: '码头开放', 成因: '商路封锁', 结果: '城邦恢复补给', 影响: '粮价回落' }],
  自然寿命变化: -8,
}), { currentAttributes })
assertOk(
  legacyFieldsOutput.eventResults === undefined
    && legacyFieldsOutput.naturalLifespanDeltaYears === undefined
    && legacyFieldsOutput.narrative === schemaBase.正文,
  '01 V3A 不再恢复时间定位、事件结果或自然寿命变化，正文仍可用',
)
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
      { 路线: '转变强化', 名称: '机械共鸣', 详细介绍: '你在修复潮门机械后，能够感应并协调近处机械的运转。', 效果描述: '通过共鸣调整机械运动，不再以听潮辨隙为能力机制。', 属性加成: { 心智: 2, 财富: 1 } },
    ],
  },
}
const growthQuality = inspectNarrativeTalentGrowthQuality(JSON.stringify(growthResult))
assertOk(growthQuality.valid, '03 必须接受固定顺序的三条同级路线')
assertOk(
  growthQuality.result?.成长判定.需要成长
    && growthQuality.result.成长判定.下一阶方向[2].名称 === '机械共鸣',
  '03 解析器必须接受机制不同的转变路线，不以原能力相似度过滤',
)
const noLocalBudget = structuredClone(growthResult)
noLocalBudget.成长判定.下一阶方向[0].属性加成 = { 财富: 100, 体魄: -50 }
assertOk(
  NarrativeAITalentGrowthDataSchema.safeParse(noLocalBudget).success
    && !validateDestinyPatternAttrBonusForAptitude({ familyBackground: 100, physique: -50 }, 2),
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
const consumptionQuality = inspectNarrativeResponseQuality(JSON.stringify({
  事件卡消费: ['旧账被翻出', '旧账被翻出'],
  正文: '另一段完整故事。',
  属性: { 心智: 4, 体魄: 2, 魅力: 1, 财富: 6 },
  命运分支: false,
  结局: false,
}), 200, undefined, qualityPromptInput)
assertOk(
  consumptionQuality.valid === true
    && JSON.stringify(consumptionQuality.parsed?.事件卡消费) === JSON.stringify(['旧账被翻出']),
  '01 解析必须保留并去重本轮实际消费的事件卡名',
)

assertOk(
  narrativePrompt.version === '10.0.0'
    && narrativeStoryContinuityPrompt.version === '3.2.0'
    && narrativeTalentGrowthPrompt.version === '4.0.0'
    && narrativeStoryContinuityPrompt.outputFormat === 'json'
    && narrativeTalentGrowthPrompt.outputFormat === 'json',
  '01/02/03 Prompt 必须绑定当前单一职责版本',
)
const growthRules = JSON.parse(COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT)
assertOk(
  growthRules.目标.includes('绝不改变资质阶位')
    && growthRules.输入映射.玩家已选天赋.includes('血脉编号只串联成长记录')
    && growthRules.资质与开发边界.资质阶位.includes('机制复杂度')
    && growthRules.资质与开发边界.开发阶段.includes('至少需要2个')
    && growthRules.资质与开发边界.开发阶段.includes('至少需要3个')
    && growthRules.路线规则.some((rule) => rule.includes('保留当前能力已经成立的核心结果'))
    && growthRules.路线规则.some((rule) => rule.includes('约30至45字')),
  '03 固定规则须分开资质与开发阶段，并保留能力连续性及2/3窗口门槛',
)
assertOk(
  COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('角色是中心')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('历史是已经发生的人生')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('正文像人生小说的一章，不是因果报告')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('允许概括、跳跃、留白')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('按本次信息.篇幅偏好'),
  '固定主故事 Prompt 必须保持角色中心、正文优先和篇幅偏好边界',
)
assertOk(
  narrativePrompt.serverPromptAssetId === 'mod-engine:narrative:10.0.0'
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('按本次信息.篇幅偏好')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('默认目标约300字')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('宏观编年体')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('3 至 5 个时间阶段'),
  '主叙事受保护资产不得恢复默认字数或宏观编年配额',
)
assertOk(
  COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('“人生规划”和“事件卡池”只是软提示')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('采用某张卡并写入正文时')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('未采用的卡不产生事实')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('一次最多返回 10 轮'),
  '主叙事受保护资产必须保留事件卡软提示和批量边界',
)
assertOk(
  ['"正文"', '"属性"', '"命运分支"', '"结局"', '"角色死亡"', '事件卡消费（可选）', '天赋表现线索（可选）'].every((field) => COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes(field))
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"时间定位"')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"事件结果"')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"自然寿命变化"')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"历史事件"')
    && !COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('"当前状态"'),
  '固定主故事 Prompt 必须声明 V3A 最小字段，不恢复因果账本',
)

const controlPlane = new NarrativeControlPlane()
const controlAttributeContext = (points = {}, talents = []) => ({
  属性尺度: { 凡人最差: -10, 凡人基准: 0, 凡人正面上限: 10, 超凡: '小于-10或大于10' },
  当前属性: Object.fromEntries(['心智', '体魄', '魅力', '财富'].map((name) => [
    name,
    { 点数: points[name] ?? 0, 语义: '普通' },
  ])),
  已选天赋: talents,
})
const controlInput = (
  roundSequence,
  ageDays = 0,
  playerIntent = '',
  difficulty = 'normal',
  characterContext = controlAttributeContext(),
) => ({
  world: { contextId: 'world-a', contextKind: 'world', name: '雾港', description: '沿海城邦' },
  character: { characterId: 'player-a', name: '岑澜', gender: 'female', background: '港区居民' },
  context: { roundSequence, difficulty },
  subsystemStates: {
    'character-base': { data: { status: { currentStageId: 'life-stage-2', ageDays } } },
  },
  lifeRunId: 'control-plane-smoke',
  playerIntent,
  historyLength: roundSequence - 1,
  narrativeWindow: '本轮覆盖一个自然年。',
  birthContext: {
    属性尺度: characterContext.属性尺度,
    开局属性: characterContext.当前属性,
    已选天赋: characterContext.已选天赋,
  },
  characterContext,
})
const firstControlInput = controlInput(1)
let controlPreparation = controlPlane.inspect(firstControlInput)
const startingAgeInput = (startingAge) => ({
  ...firstControlInput,
  subsystemStates: {
    'character-base': { data: { startingAge } },
  },
})
assertOk(
  NARRATIVE_BIRTH_PROFILE_VERSION === '1.8.0'
    && birthFingerprint(startingAgeInput(0)) !== birthFingerprint(startingAgeInput(16)),
  '出生前史的来源版本与起始年龄必须进入出生档案指纹，避免复用缺少前史的同源档案',
)
const birthProfileAtBirth = normalizeBirthProfile(
  { 叙事背景: '你出生在雾港的一户人家。' },
  'birth:0',
  0,
)
let rejectsMissingInterventionHistory = false
try {
  normalizeBirthProfile({ 叙事背景: '你出生在雾港的一户人家。' }, 'birth:16', 16)
} catch {
  rejectsMissingInterventionHistory = true
}
assertOk(
  birthProfileAtBirth.介入前史 === undefined
    && rejectsMissingInterventionHistory
    && normalizeBirthProfile({
      叙事背景: '你出生在雾港的一户人家。',
      介入前史: '你在港区长大。',
    }, 'birth:16', 16).介入前史 === '你在港区长大。',
  '出生档案必须要求非零起始年龄的介入前史，同时保持出生叙事与既往生活分离',
)
const arrayGoalPlan = normalizeLifePlan({
  阶段标识: 'life-stage-1',
  当前阶段: '婴幼儿期',
  阶段目标: ['建立安全依恋与基本信任', { 方向: '发展语言理解与简单表达' }],
}, 'plan:array-goal')
assertOk(
  arrayGoalPlan.阶段目标 === '建立安全依恋与基本信任；方向：发展语言理解与简单表达',
  '人生规划的阶段目标接受字符串或数组/对象并展开为可读文本',
)
assertThrows(
  () => normalizeLifePlan({ 阶段标识: 'life-stage-1', 当前阶段: '婴幼儿期' }, 'plan:missing-goal'),
  '人生规划缺少阶段目标时必须抛出诊断错误',
)
assertOk(
  controlPreparation.triggers.map((trigger) => trigger.kind).sort().join('|') === 'birth|event|plan|timeline',
  '首轮即可同时触发出生、规划、时间线与事件池（事件池不依赖人生规划，首屏就有卡）',
)
const birthTrigger = controlPreparation.triggers.find((trigger) => trigger.kind === 'birth')
const timelineTrigger = controlPreparation.triggers.find((trigger) => trigger.kind === 'timeline')
controlPlane.commitBirth({ 叙事背景: '你在雾港的一户人家出生。' }, birthTrigger.fingerprint)
controlPlane.commitTimeline([
  { 事件名称: '港务会重审航道', 目标年龄: 1, 因果前提: '新港道投入使用' },
], timelineTrigger.fingerprint)
controlPreparation = controlPlane.inspect(firstControlInput)
const planTrigger = controlPreparation.triggers.find((trigger) => trigger.kind === 'plan')
assertOk(
  Boolean(planTrigger) && controlPreparation.triggers.some((trigger) => trigger.kind === 'event'),
  '缺少当前规划时规划与事件池同轮触发，事件池不再有规划门禁',
)
controlPlane.commitPlan(
  { 阶段标识: 'life-stage-1', 当前阶段: '成长期', 阶段目标: '完成基础学业' },
  planTrigger.fingerprint,
)
controlPreparation = controlPlane.inspect(firstControlInput)
const eventTrigger = controlPreparation.triggers.find((trigger) => trigger.kind === 'event')
assertOk(
  Boolean(eventTrigger) && !controlPreparation.triggers.some((trigger) => trigger.kind === 'plan'),
  '提交规划会清空旧池，随后仍会请求事件卡池补充',
)
assertOk(
  !controlPlane.commitEvents(
    [eventCard({ id: 'stale-life-event', 名称: '旧人生事件', sourceFingerprint: 'stale-fingerprint' })],
    'stale-fingerprint',
  ) && controlPlane.capturePersistenceState().eventCards.length === 0,
  '来源指纹不一致的事件卡写入必须被拒绝',
)
const poolCards = [
  eventCard({ id: 'card-1', 名称: '漕运断绝', 正负: '负', 权重: 5 }),
  eventCard({ id: 'card-2', 名称: '邻港借船', 正负: '正', 权重: 2 }),
  eventCard({ id: 'card-3', 名称: '瘟疫爆发', 正负: '负', 权重: 4 }),
  eventCard({ id: 'card-4', 名称: '拜师', 正负: '正', 权重: 3 }),
  eventCard({ id: 'card-5', 名称: '旧友决裂', 正负: '双面', 权重: 2 }),
  eventCard({ id: 'card-6', 名称: '破境', 正负: '双面', 权重: 1 }),
  eventCard({ id: 'card-7', 名称: '认错人', 正负: '双面', 权重: 3 }),
  // 反向夹具：旧合龄/阶段/生命周期字段进池后必须被抹掉，只剩 id/名称/正负/权重/指纹。
  eventCard({ id: 'card-8', 名称: '青梅竹马', 正负: '正', 权重: 2, 最低合龄: 8, 适用阶段: 'life-stage-1', 生命周期: 'ongoing' }),
]
assertOk(controlPlane.commitEvents(poolCards, eventTrigger.fingerprint), '当前指纹下的事件卡池必须写入成功')
const controlView = controlPlane.getView(
  0,
  controlPreparation.fingerprint,
  timelineTrigger.fingerprint,
  '1',
  'normal',
)
const controlViewIds = controlView.eventCards.map((card) => card.id)
const legacyFieldCard = controlView.eventCards.find((card) => card.id === 'card-8')
assertOk(
  controlViewIds.length === 8
    && new Set(controlViewIds).size === 8
    && controlView.eventCards.every((card) => {
      const length = Array.from(card.名称).length
      return length >= 2 && length <= 8
    })
    && Boolean(legacyFieldCard)
    && !('最低合龄' in legacyFieldCard)
    && !('适用阶段' in legacyFieldCard)
    && !('生命周期' in legacyFieldCard)
    && JSON.stringify(Object.keys(legacyFieldCard).sort())
      === JSON.stringify(['id', 'sourceFingerprint', '名称', '正负', '权重'].sort()),
  '控制平面视图必须给出整池全部卡（不做年龄或阶段过滤）；旧合龄/阶段/生命周期字段入池后必须被抹掉',
)
assertOk(
  JSON.stringify(controlPlane.getView(
    0,
    controlPreparation.fingerprint,
    timelineTrigger.fingerprint,
    '1',
    'normal',
  ).eventCards.map((card) => card.id)) === JSON.stringify(controlViewIds),
  '同指纹与年龄的卡池必须可复现',
)
controlPlane.commitRoundOutcome({
  fingerprint: controlPreparation.fingerprint,
  timelineFingerprint: timelineTrigger.fingerprint,
  selectedEventIds: ['card-1', 'card-5'],
  hadDueWorldEvents: false,
})
const afterPartialConsumption = controlPlane.getView(
  0,
  controlPreparation.fingerprint,
  timelineTrigger.fingerprint,
  '1',
  'normal',
).eventCards.map((card) => card.id)
assertOk(
  afterPartialConsumption.length === 6
    && !afterPartialConsumption.includes('card-1')
    && !afterPartialConsumption.includes('card-5'),
  '只扣除主故事实际消费的卡，未消费卡必须留在池中',
)
assertOk(
  !controlPlane.inspect(firstControlInput).triggers.some((trigger) => trigger.kind === 'event'),
  '池内仍有可用卡时不请求补充事件池',
)
controlPlane.commitRoundOutcome({
  fingerprint: controlPreparation.fingerprint,
  timelineFingerprint: timelineTrigger.fingerprint,
  selectedEventIds: afterPartialConsumption,
  hadDueWorldEvents: false,
})
assertOk(
  controlPlane.inspect(firstControlInput).triggers.some((trigger) => trigger.kind === 'event'),
  '原始事件卡池真正耗尽后才请求补充事件池',
)
const drainPlane = new NarrativeControlPlane()
let drainPreparation = drainPlane.inspect(controlInput(1))
drainPlane.commitBirth(
  { 叙事背景: '你在雾港出生。' },
  drainPreparation.triggers.find((trigger) => trigger.kind === 'birth').fingerprint,
)
drainPlane.commitTimeline([], drainPreparation.triggers.find((trigger) => trigger.kind === 'timeline').fingerprint)
drainPreparation = drainPlane.inspect(controlInput(1))
drainPlane.commitPlan(
  { 阶段标识: 'life-stage-1', 当前阶段: '成长期', 阶段目标: '完成基础学业' },
  drainPreparation.triggers.find((trigger) => trigger.kind === 'plan').fingerprint,
)
drainPreparation = drainPlane.inspect(controlInput(1))
drainPlane.commitEvents([
  eventCard({ id: 'drain-1', 名称: '迁籍令', 正负: '负', 权重: 3 }),
  eventCard({ id: 'drain-2', 名称: '盐路改道', 正负: '双面', 权重: 3 }),
  eventCard({ id: 'drain-3', 名称: '信标误读', 正负: '双面', 权重: 2 }),
], drainPreparation.triggers.find((trigger) => trigger.kind === 'event').fingerprint)
const drainView = drainPlane.getView(
  0,
  drainPreparation.fingerprint,
  drainPreparation.fingerprint,
  1,
  'normal',
)
assertOk(drainView.eventCards.length === 3, '整池可用卡必须全部进入主故事，不抽固定张数')
drainPlane.commitRoundOutcome({
  fingerprint: drainPreparation.fingerprint,
  timelineFingerprint: drainPreparation.fingerprint,
  selectedEventIds: drainView.eventCards.map((card) => card.id),
  hadDueWorldEvents: false,
})
assertOk(
  drainPlane.inspect(controlInput(1)).triggers.some((trigger) => trigger.kind === 'event'),
  '事件卡池耗尽后才请求补充事件池',
)

// 卡池契约：整池交付、无年龄/阶段过滤、难度不改变卡池、只扣池内实际消费
const agePlane = new NarrativeControlPlane()
const agePreparation = agePlane.inspect(controlInput(1))
agePlane.commitEvents(poolCards, agePreparation.fingerprint)
const poolAt = (ageYears, difficulty = 'normal') => agePlane.getView(
  ageYears,
  agePreparation.fingerprint,
  agePreparation.fingerprint,
  1,
  difficulty,
).eventCards
assertOk(
  poolAt(0).length === 8
    && JSON.stringify(poolAt(0).map((card) => card.id)) === JSON.stringify(poolAt(40).map((card) => card.id))
    && poolAt(0).every((card) => !('最低合龄' in card) && !('适用阶段' in card) && !('生命周期' in card)),
  '整池不做年龄或阶段过滤：任何年龄都投影同一批卡，旧合龄/阶段/生命周期字段已被抹掉',
)
assertOk(
  JSON.stringify(poolAt(20, 'casual').map((card) => card.id))
    === JSON.stringify(poolAt(20, 'nightmare').map((card) => card.id)),
  '难度只影响叙事指引，不改变卡池内容',
)
const suppressedPreparation = new NarrativeControlPlane().inspect({ ...controlInput(1), suppressEventRefill: true })
assertOk(
  !suppressedPreparation.triggers.some((trigger) => trigger.kind === 'event')
    && new NarrativeControlPlane().inspect(controlInput(1)).triggers.some((trigger) => trigger.kind === 'event'),
  '批次进行中（suppressEventRefill）不请求补池，也就不整体替换排队轮要消费的事件池',
)
const unknownIds = ['card-2', '不在池中的卡']
agePlane.commitRoundOutcome({
  fingerprint: agePreparation.fingerprint,
  timelineFingerprint: agePreparation.fingerprint,
  selectedEventIds: unknownIds,
  hadDueWorldEvents: false,
})
assertOk(
  JSON.stringify(poolAt(20).map((card) => card.id))
    === JSON.stringify(poolCards.map((card) => card.id).filter((id) => id !== 'card-2')),
  '只扣除池内已消费的卡：池外卡名映射不到 id，不扣也不采纳',
)

// 归一化：名称 2–8 字、正负枚举、权重钳制、同批重名合并、旧字段丢弃
const normalizedCards = normalizeEventCards([
  eventCard({ id: 'valid-card', 名称: '天降横财', 正负: '正', 权重: 5 }),
  eventCard({ id: 'short-name', 名称: '财', 正负: '正' }),
  eventCard({ id: 'long-name', 名称: '一场突如其来的巨大变故', 正负: '负' }),
  eventCard({ id: 'bad-polarity', 名称: '不明倾向', 正负: '中' }),
  eventCard({ id: 'duplicate-name', 名称: '天降横财', 正负: '负' }),
  eventCard({ id: 'bounded-weight', 名称: '旧港借船', 正负: '双面', 权重: 9 }),
], 'normalize-fingerprint')
assertOk(
  normalizedCards.length === 2
    && normalizedCards[0].名称 === '天降横财'
    && normalizedCards[1].名称 === '旧港借船'
    && normalizedCards[1].权重 === 5
    && normalizedCards.every((card) => card.sourceFingerprint === 'normalize-fingerprint'),
  '事件卡归一化必须拒绝 1 字名、超 8 字名、非法正负与同批重名，并钳制权重到 1–5',
)
assertOk(
  normalizeEventCards(
    { 事件卡: [eventCard({ id: 'wrapped', 名称: '外敌入侵', 正负: '负' })] },
    'wrapped-fingerprint',
  ).length === 1
    && normalizeEventCards(
      [{ id: 'old-card', 事件: '旧版事件', 领域: 'bond_karma' }],
      'old-fingerprint',
    ).length === 0
    && normalizeEventCards(
      [eventCard({ id: 'legacy-fields', 名称: '临时封堵', 最低合龄: 16, 生命周期: 'unknown', 适用阶段: 'life-stage-1' })],
      'legacy-fields-fingerprint',
    ).map((card) => Object.keys(card).sort().join('|'))[0]
      === ['sourceFingerprint', 'id', '名称', '正负', '权重'].sort().join('|'),
  '事件卡归一化必须接受事件卡外壳、丢弃旧候选字段，并抹掉最低合龄、生命周期与适用阶段',
)

// 持久化：版本 3 才迁移；旧版本与旧候选字段都不进入当前事件池
const restoredV2Plane = new NarrativeControlPlane()
restoredV2Plane.restorePersistenceState({
  schemaVersion: 2,
  legacyHints: [],
  eventCandidates: [eventCard({ id: 'legacy-cache', 名称: '旧版缓存卡' })],
  timelineCommitments: [],
})
assertOk(
  restoredV2Plane.capturePersistenceState().schemaVersion === 3
    && restoredV2Plane.capturePersistenceState().eventCards.length === 0,
  'schemaVersion 2 的缓存不迁移，直接重置为新的空事件卡池',
)
const restoredV3Plane = new NarrativeControlPlane()
restoredV3Plane.restorePersistenceState({
  schemaVersion: 3,
  eventPoolFingerprint: 'restore-fingerprint',
  eventCards: [
    eventCard({ id: 'restored-valid', 名称: '宗族分灶', 正负: '负', 权重: 4, sourceFingerprint: 'restore-fingerprint' }),
    { id: 'restored-old', 事件: '旧格式字段', sourceFingerprint: 'restore-fingerprint' },
  ],
  timelineCommitments: [],
})
const restoredCards = restoredV3Plane.capturePersistenceState().eventCards
assertOk(
  restoredCards.length === 1
    && restoredCards[0].名称 === '宗族分灶'
    && restoredCards[0].sourceFingerprint === 'restore-fingerprint',
  '当前控制平面状态必须只保留合法事件卡并丢弃旧候选字段',
)

// 生成 Prompt：6–8 张、2–8 字、正负、权重三个字段；不读难度、不再要求旧字段
const eventPromptText = buildNarrativeControlPrompt('event', { 世界: '雾港' }).systemPrompt
const eventPromptsAcrossDifficulties = DIFFICULTY_ORDER.map((difficulty) => (
  buildNarrativeControlPrompt('event', { difficulty, difficultyGuidance: DIFFICULTY_NARRATIVE_GUIDANCE[difficulty] })
))
assertOk(
  eventPromptsAcrossDifficulties.every((prompt) => (
    prompt.version === NARRATIVE_EVENT_POOL_VERSION
      && prompt.systemPrompt === eventPromptsAcrossDifficulties[0].systemPrompt
      && prompt.userPromptTemplate === '输入：{}'
  ))
    && eventPromptText.includes('{"事件卡":[{"名称":"","正负":"正","权重":3}]}')
    && eventPromptText.includes('6 至 8 张')
    && eventPromptText.includes('2 至 8 个字符')
    && eventPromptText.includes('正、负、双面')
    && eventPromptText.includes('权重')
    && eventPromptText.includes('卡不是事实')
    && !eventPromptText.includes('最低合龄')
    && !eventPromptText.includes('生命周期')
    && !eventPromptText.includes('适用阶段')
    && !eventPromptText.includes('15%')
    && !eventPromptText.includes('抽 3 张')
    && !eventPromptText.includes('手牌'),
  '事件卡生成指令必须只声明 名称/正负/权重 三个字段，且不残留合龄、生命周期、抽卡与手牌规则',
)

// 单轮故事不得被批量回收撕碎：没有「故事批次」锚点时原样返回
const singleRoundResponse = JSON.stringify({
  正文: '你在雾港的雨季里守住了旧闸门。',
  命运分支: ['留下继续守闸', '先带人撤离'],
  属性: { 心智: 1 },
  结局: false,
  角色死亡: false,
})
assertOk(singleRoundResponse.includes('命运分支":['), '单轮夹具必须保留会被误回收的分支数组')
for (const rounds of [1, 10]) {
  const singleRound = splitNarrativeBatchResponse(singleRoundResponse, rounds)
  assertOk(
    singleRound.primary === singleRoundResponse && singleRound.queuedResponses.length === 0,
    `无批量锚点的单轮故事对象必须原样返回（batchRounds=${rounds}），不得从分支数组撕出碎片`,
  )
}
for (const passthroughResponse of [
  '本轮无事发生，[注：记录不全',
  '本轮无事发生，结果:[1,2]',
  JSON.stringify({ 正文: '附录见 [1,2] 号记录。', 命运分支: ['留下', '离开'] }),
]) {
  const passthrough = splitNarrativeBatchResponse(passthroughResponse, 10)
  assertOk(
    passthrough.primary === passthroughResponse && passthrough.queuedResponses.length === 0,
    `无批量锚点、也不含故事对象数组的文本必须原样返回，不得从 [ 回收：${passthroughResponse.slice(0, 12)}`,
  )
}

// 批量截断：按 batchRounds 截断到 10 项、回收已完整写出的前几项、零完整项明确报错
const twelveRounds = Array.from({ length: 12 }, (_, index) => JSON.stringify({ 正文: `第${index + 1}轮` }))
const cappedBatch = splitNarrativeBatchResponse(`{"故事批次":[${twelveRounds.join(',')}]}`, 12)
assertOk(
  cappedBatch.queuedResponses.length === 9
    && JSON.parse(cappedBatch.primary).正文 === '第1轮'
    && JSON.parse(cappedBatch.queuedResponses[8]).正文 === '第10轮',
  '故事批次必须截断到最多 10 轮，且保留前 10 轮的原始顺序',
)
const truncatedBatch = splitNarrativeBatchResponse('{"故事批次":[{"正文":"完整一"},{"正文":"完整二"},{"正文":"被截', 10)
assertOk(
  JSON.parse(truncatedBatch.primary).正文 === '完整一' && truncatedBatch.queuedResponses.length === 1,
  '响应被截断时必须回收已完整写出的前几轮，而不是把截断原文当单轮故事',
)
let truncatedBatchRejects = false
try {
  splitNarrativeBatchResponse('{"故事批次":[{"正文":"被截', 10)
} catch {
  truncatedBatchRejects = true
}
assertOk(truncatedBatchRejects, '批量响应被截断且回收不到任何完整故事项时必须明确报错')
let emptyBatchRejects = false
try {
  splitNarrativeBatchResponse('{"故事批次":[]}', 10)
} catch {
  emptyBatchRejects = true
}
assertOk(emptyBatchRejects, '批量锚点存在但回收不到任何故事项时必须明确报错')

const biasSamples = new Set()
for (let round = 1; round <= 12; round += 1) {
  const biasView = controlPlane.getView(
    0,
    controlPreparation.fingerprint,
    timelineTrigger.fingerprint,
    String(round),
    'normal',
  )
  assertOk(
    Boolean(biasView.dramaticBias) && biasView.dramaticBiasLabel === FATE_DRAMATIC_BIAS_LABELS[biasView.dramaticBias],
    '每轮视图必须给出合法命运转折调性且标签与之一致',
  )
  biasSamples.add(biasView.dramaticBias)
}
assertOk(biasSamples.size > 1, '命运转折调性必须随回合推进变化，而不是恒定单一调性')

const biasContextSegments = buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  controlPlane: {
    eventCards: [],
    dueWorldEvents: [],
    dramaticBias: 'dramatic_irony',
    dramaticBiasLabel: FATE_DRAMATIC_BIAS_LABELS.dramatic_irony,
  },
})
assertOk(
  JSON.stringify(biasContextSegments).includes(FATE_DRAMATIC_BIAS_LABELS.dramatic_irony)
    && JSON.stringify(biasContextSegments).includes('命运转折调性'),
  '命运转折调性必须作为只读投影进入主故事动态数据',
)

// 批量：一次最多 10 轮，遇分支、结局或阶段结束即停
const batchSegments = buildSegmentedPrompt(narrativePrompt, { ...promptContext, narrativeBatchSize: 10 })
const batchMessage = JSON.parse(batchSegments.userSegments[0])[4].本次信息.批量输出
assertOk(
  typeof batchMessage === 'string'
    && batchMessage.includes('最多10轮故事')
    && batchMessage.includes('第一项对应本轮')
    && batchMessage.includes('遇到命运分支、结局或人生阶段结束时，该轮即本批最后一项')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('一次最多返回 10 轮')
    && COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE.includes('遇到命运分支、结局或人生阶段结束时停止'),
  '批量输出必须声明一次最多 10 轮，并在分支、结局或阶段结束时停止',
)

assertOk(
  NARRATIVE_EVENT_POOL_VERSION === '3.0.0'
    && NARRATIVE_PLAN_VERSION === '1.1.0'
    && buildNarrativeControlInput(controlInput(1)).narrativeWindow === '本轮覆盖一个自然年。'
    && DIFFICULTY_ORDER.join('|') === 'casual|relaxed|normal|hard|nightmare',
  '事件池版本必须为 3.0.0，并保持规划版本、时间窗口与五档难度顺序',
)

const dueInput = controlInput(4, 365)
const duePreparation = controlPlane.inspect(dueInput)
const dueView = controlPlane.getView(
  1,
  duePreparation.fingerprint,
  timelineTrigger.fingerprint,
  '4',
  'normal',
)
assertOk(dueView.dueWorldEvents.length === 1, '世界时间线承诺到达目标年龄后才进入到期视图')
controlPlane.commitRoundOutcome({
  fingerprint: duePreparation.fingerprint,
  timelineFingerprint: timelineTrigger.fingerprint,
  hadDueWorldEvents: true,
})
assertOk(
  controlPlane.inspect(dueInput).triggers.some((trigger) => trigger.kind === 'timeline'),
  '当前世界承诺全部消费后才请求下一批未来时间线',
)

if (failed > 0) process.exit(1); console.log('[narrative-chinese-protocol-regression] PASS')
