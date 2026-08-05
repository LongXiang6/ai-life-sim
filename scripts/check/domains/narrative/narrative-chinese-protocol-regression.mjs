/**
 * Purpose: Regress the Chinese narrative protocol and its background-analysis envelopes.
 * Owner: quality:narrative
 * Responsibility: Protocol fixtures, parsing, and sequential assertions only.
 */

import {
  buildNarrativeUserJson,
  buildSegmentedPrompt,
} from '../../../../src/core/ai-service/prompt-builder.ts'
import { parseAIJSON } from '../../../../src/core/ai-service/parse-ai-json.ts'
import {
  NarrativeAIBasicAttributeAnalysisDataSchema,
  NarrativeAIDataAnalysisDataSchema,
  NarrativeAIEventRecognitionDataSchema,
  parseNarrativeAIJson,
  translateNarrativeAIBasicAttributeAnalysis,
  translateNarrativeAIDataAnalysis,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import {
  buildNarrativeBasicAttributePromptInput,
} from '../../../../src/mods/mod-engine/helpers/narrative-basic-attribute-context.ts'
import {
  buildNarrativeDataAnalysisPromptInput,
} from '../../../../src/mods/mod-engine/helpers/narrative-data-analysis-context.ts'
import {
  buildNarrativeEventRecognitionPromptInput,
} from '../../../../src/mods/mod-engine/helpers/narrative-event-recognition-context.ts'
import {
  NarrativeAIMacroImpactDataSchema,
  buildNarrativeMacroImpactPromptInput,
} from '../../../../src/mods/mod-engine/helpers/narrative-macro-impact-context.ts'
import {
  buildPlayerRoundActionProjection,
  consumeAcceptedPlayerRoundAction,
} from '../../../../src/mods/mod-engine/helpers/player-round-action.ts'
import {
  buildNarrativeRepairInstruction,
  buildNarrativeRoundOutputContract,
  inspectNarrativeBasicAttributeAnalysisQuality,
  inspectNarrativeDataAnalysisQuality,
  inspectNarrativeEventRecognitionQuality,
  inspectNarrativeMacroImpactQuality,
  inspectNarrativeResponseQuality,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import {
  parseNarrativeResponseEnvelope,
} from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import {
  MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS,
} from '../../../../src/mods/mod-engine/helpers/mvp-runtime-policy.ts'
import {
  getNarrativeAISubsystemContract,
} from '../../../../src/mods/mod-engine/helpers/subsystem-field-registry.ts'
import {
  NARRATIVE_SERVER_PROMPT_ASSET_ID,
  narrativePrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import {
  NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID,
  narrativeBasicAttributePrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-basic-attribute-prompt.ts'
import {
  NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID,
  narrativeDataAnalysisPrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-data-analysis-prompt.ts'
import {
  NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID,
  narrativeEventRecognitionPrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-event-recognition-prompt.ts'
import {
  NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID,
  narrativeMacroImpactPrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-macro-impact-prompt.ts'
import {
  COMPILED_NARRATIVE_SYSTEM_PROMPT,
  buildNarrativeAIProtocolPromptExample,
  buildNarrativeAIProtocolStandardExample,
} from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import {
  formatNarrativeTimelineForPrompt,
  formatSummaryForPrompt,
  projectSummaryToNarrativeTimeline,
} from '../../../../src/mods/mod-engine/helpers/timeline-memory.ts'
import {
  COMPILED_NARRATIVE_BASIC_ATTRIBUTE_SYSTEM_PROMPT,
  buildNarrativeBasicAttributeContractLine,
  buildNarrativeBasicAttributeStandardExample,
} from '../../../../src/mods/mod-engine/server/narrative-basic-attribute-system-prompt.ts'
import {
  COMPILED_NARRATIVE_DATA_ANALYSIS_SYSTEM_PROMPT,
  buildNarrativeDataAnalysisStandardExample,
  buildNarrativeDataAnalysisSystemContractLines,
} from '../../../../src/mods/mod-engine/server/narrative-data-analysis-system-prompt.ts'
import {
  COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT,
  buildNarrativeEventRecognitionStandardExample,
} from '../../../../src/mods/mod-engine/server/narrative-event-recognition-system-prompt.ts'
import {
  COMPILED_NARRATIVE_MACRO_IMPACT_SYSTEM_PROMPT,
} from '../../../../src/mods/mod-engine/server/narrative-macro-impact-system-prompt.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

function assertThrows(fn, message) {
  try {
    fn()
    assertOk(false, message)
  } catch {
    // Expected rejection.
  }
}

function buildSemanticCore(overrides = {}) {
  return {
    重要程度: '高',
    情节状态: '进行中',
    语义信号: {
      事件类型: '关系',
      冲突强度: 20,
      张力变化: 3,
      行动规模: '中',
      不可逆: true,
      影响范围: '关系圈',
      叙事语域: '命运',
      语域理由: '共同逃离改变了双方的长期关系和路线',
      情节类型: '关系',
    },
    ...overrides,
  }
}

function dataAnalysisLine(data) {
  return JSON.stringify(data)
}

function basicAttributeLine(data) {
  return JSON.stringify(data)
}

function eventRecognitionLine(data) {
  return JSON.stringify(data)
}

const promptContext = {
  worldNarrativeView: { 世界: '临海北湾', 规则: '现实物理与社会因果' },
  characterProfileView: { 姓名: '林舟', 年龄: 27 },
  characterStatusView: { 位置: '旧桥南端', 体力: '正常' },
  subsystemSummaries: ['阿禾在旧桥北端', '双方信任为35'],
  worldRules: '现实物理与社会因果；无超自然能力。',
  modWorldRules: 'NPC 与关系只通过登记实体和公开契约运行。',
  narrativeStyle: '写实',
  narrativeToneHint: '克制温暖',
  wordCountInstruction: '约500字',
  timelineMemory: [
    '【时间轴记忆】',
    '【时间阶段：2023年6月2日】',
    '- [2023年6月2日 · 角色24岁] 阿禾在港口事故中救过你。',
    '',
    '【时间阶段：2026年9月17日】',
    '- [2026年9月17日 · 角色27岁] 上一轮你发现巡船正搜查北岸。',
  ].join('\n'),
  currentTime: '2026年9月18日·秋·18:40',
  plotStructureText: '寻找阿禾并重建信任',
  eventInjectionText: 'event:accepted-123：你在旧桥救下阿禾。',
  causalChainHint: '巡船搜索路线因救援改变。',
  roundSystemGuidanceText: '先保持已成立的救援事实，再推进现场回应。',
  playerBranchIntent: {
    本轮明确行动: '带阿禾离开旧桥，由她决定是否继续相信你。',
  },
  narrativeGuidanceText: '写救援后的现场、关系回应和直接后果。',
  subsystemGuideText: '不得进入第一次调用',
  changeRequirementsText: '不得进入第一次调用',
}

const firstInput = buildNarrativeUserJson(promptContext)
const deliveredAction = promptContext.playerBranchIntent.本轮明确行动
const firstSegments = buildSegmentedPrompt(narrativePrompt, promptContext)
const changedRoundSegments = buildSegmentedPrompt(narrativePrompt, {
  ...promptContext,
  currentTime: '2026年9月18日·秋·19:00',
})
assertOk(
  firstSegments.strategy === 'S4'
    && firstSegments.userMessageCount === 3
    && firstSegments.userSegments.length === 3,
  'first call must contain exactly three ordered user messages',
)
assertOk(
  firstSegments.userSegments[0].startsWith('⟦全局信息⟧{')
    && firstSegments.userSegments[1].startsWith('⟦记忆⟧【时间轴记忆】\n【时间阶段：')
    && firstSegments.userSegments[2].startsWith('⟦本轮引导⟧{')
    && firstSegments.full === firstSegments.userSegments.join('\n'),
  'first-call messages must keep cache-stable tagged layers while memory uses real chronological line breaks',
)
assertOk(
  firstSegments.userSegments[1].includes('\n- [2023年6月2日 · 角色24岁]')
    && firstSegments.userSegments[1].includes('\n\n【时间阶段：2026年9月17日】\n- ')
    && !firstSegments.userSegments[1].includes('\\n'),
  'memory rounds and events must be physically separated by newlines instead of JSON escape text',
)
assertOk(
  firstSegments.userSegments[0] === changedRoundSegments.userSegments[0]
    && firstSegments.userSegments[1] === changedRoundSegments.userSegments[1]
    && firstSegments.userSegments[2] !== changedRoundSegments.userSegments[2],
  'round-only changes must preserve the global and memory cache prefixes',
)
assertOk(
  !JSON.stringify(firstInput).includes('subsystemGuideText')
    && !JSON.stringify(firstInput).includes('changeRequirementsText')
    && firstInput.本轮引导?.系统引导?.[0] === promptContext.roundSystemGuidanceText
    && firstInput.本轮引导?.本轮玩家行动?.本轮明确行动
      === promptContext.playerBranchIntent.本轮明确行动
    && !JSON.stringify(firstInput).includes('不得进入第一次调用'),
  'first call must separate compiled system guidance and the unchanged one-shot player action from write contracts',
)
assertOk(
  buildPlayerRoundActionProjection(deliveredAction)?.本轮明确行动 === deliveredAction
    && consumeAcceptedPlayerRoundAction(deliveredAction, deliveredAction).consumed
    && consumeAcceptedPlayerRoundAction(deliveredAction, deliveredAction).nextChoice === undefined,
  'the exact one-shot player action must project unchanged and be consumed only after acceptance',
)
assertOk(
  consumeAcceptedPlayerRoundAction('改去南岸', deliveredAction).nextChoice === '改去南岸'
    && !consumeAcceptedPlayerRoundAction('改去南岸', deliveredAction).consumed,
  'a newer player action must survive acceptance of an older in-flight round',
)

const narrativeWithoutBranch = '⟦正文⟧你撞开仓门救出阿禾，巡船的灯越过礁石。\n\n她接过缆绳，与你一同转入雾中的北岸航道。'
const narrativeWithBranch = `${narrativeWithoutBranch}\n\n⟦分支⟧${JSON.stringify({
  标题: '决定航向',
  选项: ['驶入海雾', '转向旧礁群'],
})}`
const parsedNarrative = parseNarrativeResponseEnvelope(narrativeWithBranch)
assertOk(
  parsedNarrative.branch?.标题 === '决定航向'
    && parsedNarrative.branch.选项.length === 2,
  'first response must parse body and optional branch without machine data',
)
assertOk(
  parseNarrativeResponseEnvelope(buildNarrativeAIProtocolStandardExample()).branch?.选项.length === 2,
  'the single server-side narrative example must remain directly parseable',
)
assertOk(
  buildNarrativeAIProtocolPromptExample().includes('【content 返回结构示例开始')
    && buildNarrativeAIProtocolPromptExample().includes('⟦正文⟧<完整正文>')
    && buildNarrativeAIProtocolPromptExample().includes('\n\n⟦分支⟧')
    && buildNarrativeAIProtocolPromptExample().includes('"标题":"<分支标题>"')
    && buildNarrativeAIProtocolPromptExample().includes('"选项":["<分支选项>","<分支选项>"]')
    && !buildNarrativeAIProtocolPromptExample().includes('此处填写')
    && !/阿禾|仓门|巡船|礁石|缆绳|海雾|航向/u.test(buildNarrativeAIProtocolPromptExample())
    && buildNarrativeAIProtocolPromptExample().endsWith('均是本轮输入，不属于 content。')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes(buildNarrativeAIProtocolPromptExample()),
  'fixed Prompt must use neutral placeholders, show exact newlines, and end before dynamic input',
)
assertOk(
  COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('reasoning_content 承载')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('最终玩家可见结果完整写入 content')
    && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不要输出思考过程'),
  'DeepSeek output guidance must positively assign reasoning_content and content responsibilities',
)

const internalSummary = {
  startRound: 1,
  endRound: 4,
  content: '旧摘要',
  memoryEvents: [
    {
      id: 'memory:active',
      timeSpan: '2023年6月',
      text: '阿禾在港口事故中救过你。',
      occurrenceTime: '2023年6月2日',
      sourceEventIds: ['event:source-1'],
      sourceRounds: [1],
      initialWeight: 10,
      weightAnchorRound: 1,
      permanent: true,
    },
  ],
}
const storyTimeline = formatNarrativeTimelineForPrompt(
  projectSummaryToNarrativeTimeline(internalSummary, 20),
)
assertOk(
  storyTimeline === '【时间轴记忆】\n【时间阶段：2023年6月】\n- [2023年6月2日] 阿禾在港口事故中救过你。'
    && !/weight|权重|source|L[123]|衰减/iu.test(storyTimeline)
    && formatSummaryForPrompt(internalSummary, 20).includes('[10，2023年6月2日]'),
  'story memory must expose only time + event while internal compression retains weight data',
)
const flexibleNarrative = parseNarrativeResponseEnvelope([
  '```text',
  '### 正文',
  '你撞开仓门救出阿禾。',
  '',
  '她与你一同转入北岸航道。',
  '```',
].join('\n'))
const flexibleTaggedNarrative = parseNarrativeResponseEnvelope([
  '以下是本轮结果：',
  '⟦正文⟧',
  '你撞开仓门救出阿禾。',
  '⟦分支⟧',
  '```json',
  JSON.stringify({ 标题: '决定航向', 选项: ['驶入海雾', '转向旧礁群'] }, null, 2),
  '```',
].join('\n'))
assertOk(
  flexibleNarrative.narrative.startsWith('你撞开仓门')
    && flexibleTaggedNarrative.branch?.选项.length === 2,
  'first response must preserve complete prose across plain text, headings, fences, whitespace, and multiline branch JSON',
)
assertOk(
  inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).valid
    && inspectNarrativeResponseQuality(narrativeWithBranch, 500).valid,
  'first-call quality must accept every complete narrative whether or not the AI supplied optional branch data',
)

for (const invalidNarrative of [
  '⟦正文⟧',
  '{"摘要":"只有机器数据，没有正文"}',
  `${narrativeWithoutBranch}\n⟦摘要⟧旧摘要`,
  `${narrativeWithoutBranch}\n\n⟦数据⟧{}`,
  `${narrativeWithoutBranch}\n\n⟦结束⟧`,
  `${narrativeWithoutBranch}\n\n⟦分支⟧{"标题":"残缺","选项":["甲","乙"]`,
]) {
  assertThrows(
    () => parseNarrativeResponseEnvelope(invalidNarrative),
    `first response must reject legacy or malformed content: ${invalidNarrative}`,
  )
}

const writableIds = [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS]
const dataWritableIds = writableIds.filter((id) => id !== 'character-base')
const subsystemStates = Object.fromEntries(writableIds.map((id) => [id, {
  id,
  summary: `${id} 已就绪`,
  data: { 状态标记: id },
}]))
subsystemStates['character-base'] = {
  id: 'character-base',
  summary: '基础属性已就绪',
  data: {
    contextId: 'context:world-a',
    base: { physique: 0, mind: 10, talentAptitude: 11, charisma: 4 },
    current: { physique: 0, mind: 10, talentAptitude: 11, charisma: 5 },
    modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 1 },
    contextModifiers: {
      'context:world-a': { climate: { physique: 1 } },
    },
    startingAge: 18,
  },
}
subsystemStates['destiny-pattern'] = {
  id: 'destiny-pattern',
  summary: '命格已就绪',
  data: {
    patterns: [{ name: '潮声记忆', description: '能准确记住潮汐节律', rarity: 'rare' }],
  },
}
subsystemStates.lifespan = {
  id: 'lifespan',
  summary: '生命形态已就绪',
  data: {
    profile: { raceId: 'human', displayName: '人类', clockMode: 'biological' },
  },
}
subsystemStates['lifecycle-system'] = {
  id: 'lifecycle-system',
  summary: '生命周期已就绪',
  data: {
    entity: { stageId: 'adult', stageLabel: '成年', stageDescription: '身心处于稳定成年阶段' },
  },
}
subsystemStates['historical-event-ledger'] = {
  id: 'historical-event-ledger',
  summary: '当前上下文存在已接受历史事件',
  data: {
    contextId: 'context:world-a',
    relevantEvents: [
      { eventId: 'event:accepted-123' },
      { eventId: 'event:accepted-123' },
    ],
  },
}
const roundContext = {
  contextId: 'context:world-a',
  contextScope: 'active',
  worldId: 'context:world-a',
  characterId: 'player:current',
  round: { year: 2026, season: 3, month: 9 },
  timeStep: { unit: 'month', value: 1 },
  difficulty: 'normal',
  subsystemStates,
  roundSequence: 12,
  daysPassed: 30,
  totalDays: 120,
}
const recentStories = [
  {
    回合: 10,
    规范时间: { 总天数: 60, 时间标签: '2026年7月18日' },
    故事全文: '你在旧桥第一次找到阿禾，她拒绝立刻离开。',
    分支: { 标题: '旧桥抉择', 选项: ['等待她', '独自离开'] },
    已确认选择: { 内容: '等待她', 确认回合: 11 },
  },
  {
    回合: 11,
    规范时间: { 总天数: 90, 时间标签: '2026年8月18日' },
    故事全文: '巡船封锁北岸，你们转移到废弃仓库。',
  },
  {
    回合: 12,
    规范时间: { 总天数: 120, 时间标签: '2026年9月18日' },
    故事全文: parsedNarrative.narrative,
    分支: { 标题: parsedNarrative.branch.标题, 选项: parsedNarrative.branch.选项 },
  },
]
const character = {
  name: '林舟',
  gender: '男',
  background: '出身临海修船匠家庭，长期学习航海与木工。',
  destinyPatterns: [],
}

const dataAnalysisInput = buildNarrativeDataAnalysisPromptInput({
  subsystemStates,
  roundContext,
  recentStories,
})
const dataStateLines = dataAnalysisInput.userSegments[0].split('\n')
const dataRecentStories = JSON.parse(dataAnalysisInput.userSegments[2].slice('⟦最近故事⟧'.length))
assertOk(
  dataAnalysisInput.userSegments.length === 3
    && dataStateLines.length === dataWritableIds.length
    && dataStateLines.every((line, index) => (
      line.startsWith(`⟦可写系统:${getNarrativeAISubsystemContract(dataWritableIds[index]).aiName}⟧{`)
      && !line.includes('字段规则')
      && !line.includes('操作与变更字段')
    )),
  'data analysis must send every active non-basic writable system state without repeating fixed contracts',
)
assertOk(
  dataAnalysisInput.userSegments[1].startsWith('⟦回合上下文⟧{')
    && dataAnalysisInput.userSegments[2].startsWith('⟦最近故事⟧[')
    && dataRecentStories.length === 3
    && dataRecentStories[0].故事全文 === recentStories[0].故事全文
    && dataRecentStories[2].故事全文 === recentStories[2].故事全文
    && dataAnalysisInput.allowedEvidenceEventIds.length === 1
    && dataAnalysisInput.allowedEvidenceEventIds[0] === 'event:accepted-123',
  'data analysis must receive the complete recent three stories and deduplicated stable evidence IDs',
)

const basicAttributeInput = buildNarrativeBasicAttributePromptInput({
  subsystemStates,
  character,
  roundContext,
  recentStories,
})
const characterProfile = JSON.parse(
  basicAttributeInput.userSegments[0].slice('⟦角色画像⟧'.length),
)
assertOk(
  basicAttributeInput.userSegments.length === 4
    && basicAttributeInput.userSegments[0].startsWith('⟦角色画像⟧{')
    && basicAttributeInput.userSegments[1].startsWith('⟦基础属性状态⟧{')
    && basicAttributeInput.userSegments[1].includes('"base":{"physique":0,"mind":10,"talentAptitude":11')
    && basicAttributeInput.userSegments[1].includes('"current":{"physique":0,"mind":10,"talentAptitude":11')
    && basicAttributeInput.userSegments[1].includes('"modifiers":{"physique":0')
    && basicAttributeInput.userSegments[3].includes(recentStories[0].故事全文)
    && characterProfile.身份.姓名 === '林舟'
    && characterProfile.稳定特征.命格[0]?.name === '潮声记忆'
    && characterProfile.稳定特征.物种与生命形态.displayName === '人类'
    && characterProfile.稳定特征.生命周期阶段.stageLabel === '成年'
    && characterProfile.属性构成.当前语义.体魄.说明 === '平平无奇'
    && characterProfile.属性构成.当前语义.心智.说明.includes('人类物种巅峰')
    && characterProfile.属性构成.当前语义.悟性.说明.includes('超凡'),
  'basic-attribute analysis must receive the complete character portrait, 0/10/>10 semantics, full state and recent stories',
)

const eventRecognitionInput = buildNarrativeEventRecognitionPromptInput({
  subsystemStates,
  roundContext,
  existingCandidates: [],
  recentStories,
})
const eventRecentStories = JSON.parse(eventRecognitionInput.userSegments[4].slice('⟦最近故事⟧'.length))
assertOk(
  eventRecognitionInput.userSegments.length === 5
    && eventRecognitionInput.userSegments[0].startsWith('⟦回合上下文⟧{')
    && eventRecognitionInput.userSegments[1].startsWith('⟦事件相关状态⟧{')
    && eventRecognitionInput.userSegments[2] === '⟦本轮已投递因果⟧[]'
    && eventRecognitionInput.userSegments[3] === '⟦已有待触发事件⟧[]'
    && eventRecentStories.length === 3
    && eventRecentStories[2].故事全文 === recentStories[2].故事全文,
  'event recognition must receive complete event state, existing candidates and recent stories',
)

subsystemStates.economy = {
  id: 'economy',
  summary: '宏观经济已就绪',
  data: {
    contextId: 'context:world-a',
    targetObjectId: 'economy:world-a',
    priceIndex: 100,
    productivity: 1,
  },
}
const macroImpactInput = buildNarrativeMacroImpactPromptInput({
  subsystemStates,
  roundContext,
  recentStories,
})
const macroRecentStories = JSON.parse(
  macroImpactInput.userSegments[3].slice('⟦最近故事⟧'.length),
)
assertOk(
  macroImpactInput.userSegments.length === 4
    && macroImpactInput.userSegments[0].startsWith('⟦宏观系统与字段契约⟧[')
    && macroImpactInput.userSegments[1].startsWith('⟦玩家影响力证据⟧{')
    && macroImpactInput.userSegments[2].startsWith('⟦回合上下文⟧{')
    && macroRecentStories.length === 3
    && macroRecentStories[0].故事全文 === recentStories[0].故事全文
    && macroImpactInput.activeSubsystemIds.includes('economy'),
  'macro-impact analysis must receive complete active system contracts, influence evidence, round context and recent stories',
)
const macroImpactResponse = JSON.stringify({
  影响链: [{
    节点编号: 'impact-economy',
    依赖节点: [],
    系统: '宏观经济',
    目标对象: 'economy:world-a',
    目标上下文: 'context:world-a',
    操作: '调整经济',
    变更: { 生产力变化: 1 },
    强度: 20,
    说明: '玩家公开的新工艺已经被当地生产组织采用。',
    依据事件: ['event:accepted-123'],
  }],
})
const macroImpactQuality = inspectNarrativeMacroImpactQuality({
  content: macroImpactResponse,
  activeSubsystemIds: macroImpactInput.activeSubsystemIds,
  allowedEvidenceEventIds: macroImpactInput.allowedEvidenceEventIds,
  currentContextId: roundContext.contextId,
})
assertOk(
  NarrativeAIMacroImpactDataSchema.safeParse(JSON.parse(macroImpactResponse)).success
    && macroImpactQuality.valid
    && macroImpactQuality.changes?.[0]?.id === 'economy'
    && macroImpactQuality.changes[0]?.changes.productivityDelta === 1,
  'macro-impact DAG must translate only active fields with matching context and stable evidence',
)
const cyclicMacroImpact = inspectNarrativeMacroImpactQuality({
  content: JSON.stringify({
    影响链: [
      {
        ...JSON.parse(macroImpactResponse).影响链[0],
        节点编号: 'impact-a',
        依赖节点: ['impact-b'],
      },
      {
        ...JSON.parse(macroImpactResponse).影响链[0],
        节点编号: 'impact-b',
        依赖节点: ['impact-a'],
        变更: { 物价指数变化: 1 },
      },
    ],
  }),
  activeSubsystemIds: macroImpactInput.activeSubsystemIds,
  allowedEvidenceEventIds: macroImpactInput.allowedEvidenceEventIds,
  currentContextId: roundContext.contextId,
})
assertOk(!cyclicMacroImpact.valid, 'macro-impact DAG must reject cyclic chain dependencies')

const relationshipInstruction = {
  系统: '通用关系系统',
  目标对象: 'relationship:abc',
  目标上下文: 'context:world-a',
  操作: '调整',
  说明: '救援后信任上升',
  变更: { 好感变化: 1, 信任变化: 2 },
  依据事件: ['event:accepted-123'],
}
const dataAnalysisResponse = dataAnalysisLine({ 系统操作: [relationshipInstruction] })
const parsedDataAnalysis = NarrativeAIDataAnalysisDataSchema.parse(parseNarrativeAIJson(dataAnalysisResponse))
assertOk(
  parsedDataAnalysis.系统操作.length === 1,
  'data analysis must parse one strict pure-JSON root',
)
const translatedDataChanges = translateNarrativeAIDataAnalysis(
  parsedDataAnalysis,
  {
    allowedEvidenceEventIds: ['event:accepted-123'],
    allowedSubsystemIds: dataWritableIds,
  },
)
assertOk(
  translatedDataChanges[0]?.id === 'relationship-system'
    && translatedDataChanges[0]?.operation === 'adjust'
    && translatedDataChanges[0]?.changes.affinityDelta === 1
    && translatedDataChanges[0]?.changes.trustDelta === 2,
  'Chinese system, operation and field names must translate to the owning internal contract',
)
const validDataAnalysisQuality = inspectNarrativeDataAnalysisQuality({
  content: dataAnalysisResponse,
  allowedEvidenceEventIds: ['event:accepted-123'],
  allowedSubsystemIds: dataWritableIds,
})
assertOk(
  validDataAnalysisQuality.valid && validDataAnalysisQuality.changes?.length === 1,
  'strict data analysis must produce only validated non-basic system changes',
)

const standardDataAnalysis = NarrativeAIDataAnalysisDataSchema.parse(
  parseNarrativeAIJson(buildNarrativeDataAnalysisStandardExample()),
)
assertOk(
  translateNarrativeAIDataAnalysis(
    standardDataAnalysis,
    {
      allowedEvidenceEventIds: ['event:accepted-123'],
      allowedSubsystemIds: dataWritableIds,
    },
  ).length === 0,
  'the server-side data-analysis example must remain neutral, parseable, and translatable',
)
assertOk(
  buildNarrativeDataAnalysisSystemContractLines().length === dataWritableIds.length
    && buildNarrativeDataAnalysisSystemContractLines().every((line) => !line.includes('\n')),
  'fixed data-analysis contracts must keep one writable system contract per line',
)

const noDataChangeResponse = dataAnalysisLine({ 系统操作: [] })
assertOk(
  inspectNarrativeDataAnalysisQuality({
    content: noDataChangeResponse,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: dataWritableIds,
  }).valid,
  'data analysis must accept an explicit empty operation set',
)

const invalidDataAnalysisCases = [
  [`${dataAnalysisResponse}\n\n${dataAnalysisResponse}`, 'multiple JSON roots must be rejected'],
  ['{"系统操作":[', 'truncated data-analysis JSON must be rejected'],
  [JSON.stringify({ 系统操作: [], 回合事件: {} }), 'foreign root fields must be rejected'],
]
for (const [content, message] of invalidDataAnalysisCases) {
  assertThrows(
    () => NarrativeAIDataAnalysisDataSchema.parse(parseNarrativeAIJson(content)),
    message,
  )
}

const unknownEvidenceResponse = dataAnalysisLine({
  系统操作: [{ ...relationshipInstruction, 依据事件: ['event:not-provided'] }],
})
assertOk(
  !inspectNarrativeDataAnalysisQuality({
    content: unknownEvidenceResponse,
    allowedEvidenceEventIds: ['event:accepted-123'],
    allowedSubsystemIds: dataWritableIds,
  }).valid,
  'data analysis must reject evidence IDs that were not supplied in the same call',
)

for (const instruction of [
  { ...relationshipInstruction, 系统: '未知系统' },
  { ...relationshipInstruction, 操作: '未知操作' },
  { ...relationshipInstruction, 变更: { 未知字段: 1 } },
]) {
  const result = inspectNarrativeDataAnalysisQuality({
    content: dataAnalysisLine({ 系统操作: [instruction] }),
    allowedEvidenceEventIds: ['event:accepted-123'],
    allowedSubsystemIds: dataWritableIds,
  })
  assertOk(!result.valid, 'unknown systems, operations and fields must reject the complete data analysis')
}

const basicAttributeInstruction = {
  系统: '基础属性',
  目标对象: 'player:current',
  目标上下文: 'context:world-a',
  操作: '增量',
  说明: '长期训练已经形成稳定体能提升',
  变更: { 体魄变化: 1 },
  依据事件: [],
}
const basicAttributeResponse = basicAttributeLine({ 系统操作: [basicAttributeInstruction] })
const parsedBasicAttribute = NarrativeAIBasicAttributeAnalysisDataSchema.parse(
  parseNarrativeAIJson(basicAttributeResponse),
)
const translatedBasicAttributeChanges = translateNarrativeAIBasicAttributeAnalysis(
  parsedBasicAttribute,
  { allowedEvidenceEventIds: [], allowedSubsystemIds: ['character-base'] },
)
assertOk(
  translatedBasicAttributeChanges[0]?.id === 'character-base'
    && translatedBasicAttributeChanges[0]?.changes.physiqueDelta === 1
    && inspectNarrativeBasicAttributeAnalysisQuality({
      content: basicAttributeResponse,
      allowedEvidenceEventIds: [],
      allowedSubsystemIds: ['character-base'],
    }).valid,
  'basic-attribute analysis must translate only persistent four-attribute increments',
)
assertOk(
  NarrativeAIBasicAttributeAnalysisDataSchema.parse(
    parseNarrativeAIJson(buildNarrativeBasicAttributeStandardExample()),
  ).系统操作.length === 0
    && buildNarrativeBasicAttributeContractLine().startsWith('⟦基础属性契约⟧{'),
  'the fixed basic-attribute contract and neutral empty example must remain parseable',
)
for (const invalidBasicAttributeData of [
  { 系统操作: [{ ...basicAttributeInstruction, 系统: '健康系统' }] },
  { 系统操作: [{ ...basicAttributeInstruction, 变更: { 体魄变化: 0 } }] },
  { 系统操作: [{ ...basicAttributeInstruction, 变更: { 疲劳变化: -1 } }] },
  { 系统操作: [basicAttributeInstruction, basicAttributeInstruction] },
]) {
  assertOk(
    !NarrativeAIBasicAttributeAnalysisDataSchema.safeParse(invalidBasicAttributeData).success,
    'basic-attribute schema must reject foreign, zero, temporary or duplicate operations',
  )
}
assertOk(
  inspectNarrativeBasicAttributeAnalysisQuality({
    content: basicAttributeLine({ 系统操作: [] }),
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: ['character-base'],
  }).valid,
  'basic-attribute analysis must accept an explicit no-change result',
)

const eventRecognitionExample = eventRecognitionLine({
  回合事件: {
    摘要: '你救出阿禾并与她转入北岸航道',
    注册事件: [{ 内容: '你从仓门内救出阿禾', 重要度: 80, 涉及实体: ['阿禾'] }],
    ...buildSemanticCore(),
  },
  待触发事件: [{
    类型: '会合',
    标题: '北岸后续会合',
    说明: '阿禾已经约定在北岸安全后再次会合',
    作用域: '当前上下文',
    触发条件: '双方抵达北岸并确认安全',
    延迟天数: 30,
    相关人物: ['阿禾'],
  }],
})
const eventRecognitionData = NarrativeAIEventRecognitionDataSchema.parse(
  parseNarrativeAIJson(eventRecognitionExample),
)
const eventRecognitionQuality = inspectNarrativeEventRecognitionQuality({
  content: eventRecognitionExample,
  narrative: inspectNarrativeResponseQuality(narrativeWithBranch, 500).parsed,
  currentContextId: 'ctx-protocol',
  currentTotalDays: 1000,
  existingCandidates: [],
})
assertOk(
  eventRecognitionData.回合事件.注册事件.length === 1
    && eventRecognitionQuality.valid
    && eventRecognitionQuality.metadata?.keyEvents?.length === 1
    && eventRecognitionQuality.candidates?.length === 1
    && eventRecognitionQuality.candidates[0].scope.kind === 'context'
    && eventRecognitionQuality.candidates[0].scope.contextIds[0] === 'ctx-protocol'
    && eventRecognitionQuality.candidates[0].schedule?.dueTotalDays === 1030,
  'event recognition must own occurred events, metadata and future candidates in one strict result',
)
const neutralEventRecognitionExample = NarrativeAIEventRecognitionDataSchema.parse(
  parseNarrativeAIJson(buildNarrativeEventRecognitionStandardExample()),
)
assertOk(
  neutralEventRecognitionExample.回合事件.注册事件.length === 0
    && neutralEventRecognitionExample.待触发事件.length === 0,
  'the fixed event-recognition example must remain neutral and avoid preselecting an event outcome',
)
const emptyEventRecognitionResponse = eventRecognitionLine({
  回合事件: {
    摘要: '本轮平稳结束，没有形成新的可注册事件',
    注册事件: [],
  },
  待触发事件: [],
})
assertOk(
  inspectNarrativeEventRecognitionQuality({
    content: emptyEventRecognitionResponse,
    narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
    currentContextId: 'ctx-protocol',
    currentTotalDays: 1000,
    existingCandidates: [],
  }).valid,
  'event recognition must accept explicit empty occurred-event and candidate sets',
)
assertOk(
  !NarrativeAIEventRecognitionDataSchema.safeParse({
    回合事件: {
      摘要: '旧协议仍重复输出事件布尔值',
      本轮存在新事件: false,
      注册事件: [],
    },
    待触发事件: [],
  }).success
    && eventRecognitionQuality.metadata?.keyEvents?.length === 1
    && inspectNarrativeEventRecognitionQuality({
      content: emptyEventRecognitionResponse,
      narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
      currentContextId: 'ctx-protocol',
      currentTotalDays: 1000,
      existingCandidates: [],
    }).metadata?.keyEvents === undefined,
  'event presence must be derived locally from registered events instead of an AI boolean',
)

assertOk(
  parseNarrativeAIJson('{“摘要”：“完整弯引号响应”，}').摘要 === '完整弯引号响应'
    && parseAIJSON('说明文字\n```json\n{"值":[1,2,3]}\n```\n结束')?.值?.length === 3,
  'complete JSON must tolerate common punctuation, fences, and surrounding explanations without changing string content',
)
assertOk(
  parseAIJSON('{"完整":true') === null
    && parseAIJSON('[{"完整":true},{"残缺":') === null
    && parseAIJSON('{"一":1}\n{"二":2}') === null,
  'JSON compatibility must reject truncated values and ambiguous multiple complete values',
)
assertOk(
  !NarrativeAIDataAnalysisDataSchema.safeParse({
    系统操作: [],
    回合事件: {},
  }).success,
  'the data-analysis root must not absorb event-recognition fields',
)

const narrativeFailure = inspectNarrativeResponseQuality('⟦正文⟧', 500)
const narrativeRepair = buildNarrativeRepairInstruction(narrativeFailure, 500, true)
const repeatedNarrative = inspectNarrativeResponseQuality(narrativeWithoutBranch, 500, {
  round: 2,
  recentHistory: [{ round: 1, text: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed.narrative }],
})
const repetitionRepair = buildNarrativeRepairInstruction(repeatedNarrative, 500)
assertOk(
  narrativeRepair.includes(narrativeFailure.reason)
    && narrativeRepair.includes('系统提示词末尾的唯一 content 返回结构示例')
    && narrativeRepair.includes('⟦正文⟧')
    && narrativeRepair.includes('⟦分支⟧')
    && !narrativeRepair.includes('禁止摘要')
    && !narrativeRepair.includes('⟦结束⟧'),
  'first-call repair must use the fixed positive example guidance without an ending marker',
)
assertOk(
  !repeatedNarrative.valid
    && repeatedNarrative.repetitionMetric?.qualityLevel === 'high'
    && repetitionRepair.includes('不得复述同一天、同一行动和同一结果')
    && repetitionRepair.includes('不得只替换同义词'),
  'high-repetition narrative must be repaired before publication with explicit forward-progress guidance',
)
assertOk(
  buildNarrativeRoundOutputContract(true)?.includes('正文停在玩家作出选择之前')
    && buildNarrativeRoundOutputContract(false, true)?.includes('这是人生首轮')
    && buildNarrativeRoundOutputContract(false) === undefined,
  'normal rounds must add only triggered branch or opening conditions and otherwise repeat no fixed protocol',
)
assertOk(
  narrativeDataAnalysisPrompt.outputFormat === 'json'
    && narrativeDataAnalysisPrompt.outputSchema === NarrativeAIDataAnalysisDataSchema
    && narrativeBasicAttributePrompt.outputFormat === 'json'
    && narrativeBasicAttributePrompt.outputSchema === NarrativeAIBasicAttributeAnalysisDataSchema
    && narrativeEventRecognitionPrompt.outputFormat === 'json'
    && narrativeEventRecognitionPrompt.outputSchema === NarrativeAIEventRecognitionDataSchema
    && narrativeMacroImpactPrompt.outputFormat === 'json'
    && narrativeMacroImpactPrompt.outputSchema === NarrativeAIMacroImpactDataSchema,
  'all four background calls must use the shared JSON-mode and Zod-schema validation owner',
)

assertOk(
  narrativePrompt.version === '5.8.3'
    && narrativePrompt.serverPromptAssetId === NARRATIVE_SERVER_PROMPT_ASSET_ID
    && narrativeBasicAttributePrompt.version === '2.1.0'
    && narrativeBasicAttributePrompt.serverPromptAssetId === NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID
    && narrativeDataAnalysisPrompt.version === '2.0.0'
    && narrativeDataAnalysisPrompt.serverPromptAssetId === NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID
    && narrativeEventRecognitionPrompt.version === '3.2.0'
    && narrativeEventRecognitionPrompt.serverPromptAssetId === NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID
    && narrativeMacroImpactPrompt.version === '1.0.0'
    && narrativeMacroImpactPrompt.serverPromptAssetId === NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID
    && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('⟦结束⟧')
    && !COMPILED_NARRATIVE_BASIC_ATTRIBUTE_SYSTEM_PROMPT.includes('⟦结束⟧')
    && !COMPILED_NARRATIVE_DATA_ANALYSIS_SYSTEM_PROMPT.includes('⟦结束⟧')
    && !COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT.includes('⟦结束⟧')
    && !COMPILED_NARRATIVE_MACRO_IMPACT_SYSTEM_PROMPT.includes('⟦结束⟧')
    && COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT.includes('尚未发生且需要未来条件')
    && COMPILED_NARRATIVE_MACRO_IMPACT_SYSTEM_PROMPT.includes('直接影响或连锁反应')
    && !/⟦数据分析⟧|⟦基础属性分析⟧|⟦事件识别⟧|⟦宏观影响⟧/u.test([
      COMPILED_NARRATIVE_DATA_ANALYSIS_SYSTEM_PROMPT,
      COMPILED_NARRATIVE_BASIC_ATTRIBUTE_SYSTEM_PROMPT,
      COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT,
      COMPILED_NARRATIVE_MACRO_IMPACT_SYSTEM_PROMPT,
    ].join('\n'))
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('角色自创内容的后续发展必须来自角色自身')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('记忆只提供已经成立的事实')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('本轮必须从当前时间与引导产生新的变化和结果'),
  'the live prompts must expose the five versioned assets and no ending tag',
)

if (failed > 0) process.exit(1)
console.log('PASS: narrative-chinese-protocol-regression')
