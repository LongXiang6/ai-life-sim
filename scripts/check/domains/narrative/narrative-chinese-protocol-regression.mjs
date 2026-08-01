/**
 * 叙事协议：第一次纯叙事 + 后台数据分析与事件识别的中文分段回归。
 */

import {
  buildNarrativeUserJson,
  buildSegmentedPrompt,
} from '../../../../src/core/ai-service/prompt-builder.ts'
import { parseAIJSON } from '../../../../src/core/ai-service/parse-ai-json.ts'
import {
  NarrativeAISettlementDataSchema,
  fromNarrativeAIIntentId,
  parseNarrativeAIJson,
  toNarrativeAIIntentId,
  translateNarrativeAISettlement,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import {
  buildNarrativeSettlementPromptInput,
} from '../../../../src/mods/mod-engine/helpers/narrative-settlement-context.ts'
import {
  buildNarrativeRepairInstruction,
  buildNarrativeRoundOutputContract,
  buildNarrativeEventRecognitionRepairInstruction,
  buildNarrativeSettlementRepairInstruction,
  inspectNarrativeEventRecognitionQuality,
  inspectNarrativeResponseQuality,
  inspectNarrativeSettlementQuality,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import {
  parseNarrativeResponseEnvelope,
  parseNarrativeEventRecognitionEnvelope,
  parseNarrativeSettlementEnvelope,
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
  NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID,
  narrativeEventRecognitionPrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-event-recognition-prompt.ts'
import {
  NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID,
  narrativeSettlementPrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-settlement-prompt.ts'
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
  COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT,
  buildNarrativeEventRecognitionStandardExample,
} from '../../../../src/mods/mod-engine/server/narrative-event-recognition-system-prompt.ts'
import {
  COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT,
  buildNarrativeSettlementDataContractLine,
  buildNarrativeSettlementStandardExample,
  buildNarrativeSettlementSystemContractLines,
} from '../../../../src/mods/mod-engine/server/narrative-settlement-system-prompt.ts'

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

function systemLine(number, instruction) {
  return `⟦系统${number}⟧${JSON.stringify(instruction)}`
}

function dataLine(data) {
  return `⟦数据⟧${JSON.stringify(data)}`
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
    当前意图: {
      意图编号: '命运分支:north-route',
      玩家选择: '带阿禾离开旧桥，由她决定是否继续相信你。',
    },
  },
  narrativeGuidanceText: '写救援后的现场、关系回应和直接后果。',
  subsystemGuideText: '不得进入第一次调用',
  changeRequirementsText: '不得进入第一次调用',
}

const firstInput = buildNarrativeUserJson(promptContext)
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
    && firstInput.本轮引导?.玩家自定义分支?.当前意图?.玩家选择
      === promptContext.playerBranchIntent.当前意图.玩家选择
    && !JSON.stringify(firstInput).includes('不得进入第一次调用'),
  'first call must separate compiled system guidance and the unchanged structured player intent from write contracts',
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
const subsystemStates = Object.fromEntries(writableIds.map((id) => [id, {
  id,
  summary: `${id} 已就绪`,
  data: { 状态标记: id },
}]))
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
const settlementInput = buildNarrativeSettlementPromptInput({
  subsystemStates,
  roundContext,
  narrativeResponse: narrativeWithBranch,
})
const settlementStateLines = settlementInput.userSegments[0].split('\n')
assertOk(
  settlementInput.userSegments.length === 3
    && settlementStateLines.length === writableIds.length
    && settlementStateLines.every((line, index) => (
      line.startsWith(`⟦可写系统:${getNarrativeAISubsystemContract(writableIds[index]).aiName}⟧{`)
      && !line.includes('字段规则')
      && !line.includes('操作与变更字段')
    )),
  'second call must send each active writable system state on its own line without repeating fixed contracts',
)
assertOk(
  settlementInput.userSegments[1].startsWith('⟦回合上下文⟧{')
    && settlementInput.userSegments[2] === `⟦最终叙事响应⟧${narrativeWithBranch}`
    && settlementInput.allowedEvidenceEventIds.length === 1
    && settlementInput.allowedEvidenceEventIds[0] === 'event:accepted-123',
  'second call must send one round-context line, the complete first response, and deduplicated stable evidence IDs',
)

const relationshipInstruction = {
  系统: '通用关系系统',
  目标对象: 'relationship:abc',
  目标上下文: 'context:world-a',
  操作: '调整',
  说明: '救援后信任上升',
  变更: { 好感变化: 1, 信任变化: 2 },
  依据事件: ['event:accepted-123'],
}
const branchSettlementData = {
  摘要: '救援改变了逃离路线并提升了双方信任',
  ...buildSemanticCore(),
}
const settlementResponse = [
  systemLine(1, relationshipInstruction),
  dataLine(branchSettlementData),
].join('\n\n')
const parsedSettlementEnvelope = parseNarrativeSettlementEnvelope(settlementResponse)
assertOk(
  parsedSettlementEnvelope.systemInstructions.length === 1
    && parsedSettlementEnvelope.data.摘要 === branchSettlementData.摘要,
  'second response must parse one operation per system segment and one final data segment',
)
const flexibleSettlementEnvelope = parseNarrativeSettlementEnvelope([
  '以下是完整结算：',
  systemLine(1, relationshipInstruction),
  '⟦数据⟧',
  '```json',
  JSON.stringify(branchSettlementData, null, 2),
  '```',
].join('\n'))
assertOk(
  flexibleSettlementEnvelope.systemInstructions.length === 1
    && flexibleSettlementEnvelope.data.摘要 === branchSettlementData.摘要,
  'second response must tolerate prefaces, single newlines, fences, and multiline complete JSON',
)
const translatedSettlement = translateNarrativeAISettlement(
  parsedSettlementEnvelope.systemInstructions,
  parsedSettlementEnvelope.data,
  {
    allowedEvidenceEventIds: ['event:accepted-123'],
    allowedSubsystemIds: writableIds,
  },
)
assertOk(
  translatedSettlement.changes[0]?.id === 'relationship-system'
    && translatedSettlement.changes[0]?.operation === 'adjust'
    && translatedSettlement.changes[0]?.changes.affinityDelta === 1
    && translatedSettlement.changes[0]?.changes.trustDelta === 2,
  'Chinese system, operation and field names must translate to the owning internal contract',
)
const validSettlementQuality = inspectNarrativeSettlementQuality({
  content: settlementResponse,
  narrative: inspectNarrativeResponseQuality(narrativeWithBranch, 500).parsed,
  allowedEvidenceEventIds: ['event:accepted-123'],
  allowedSubsystemIds: writableIds,
})
assertOk(
  validSettlementQuality.valid
    && validSettlementQuality.parsed?.narrative === parsedNarrative.narrative
    && validSettlementQuality.parsed?.branch === true
    && validSettlementQuality.parsed?.changes.length === 1,
  'strictly valid calls must combine into one commit candidate without changing the first narrative body',
)

const standardSettlement = parseNarrativeSettlementEnvelope(buildNarrativeSettlementStandardExample())
assertOk(
  translateNarrativeAISettlement(
    standardSettlement.systemInstructions,
    standardSettlement.data,
    {
      allowedEvidenceEventIds: ['event:accepted-123'],
      allowedSubsystemIds: writableIds,
    },
  ).changes.length === 2,
  'the single server-side settlement example must remain parseable and translatable',
)
assertOk(
  buildNarrativeSettlementSystemContractLines().length === writableIds.length
    && buildNarrativeSettlementSystemContractLines().every((line) => !line.includes('\n'))
    && buildNarrativeSettlementDataContractLine().startsWith('⟦数据契约⟧{')
    && !buildNarrativeSettlementDataContractLine().includes('\n'),
  'fixed settlement contracts must keep one system or data contract per line',
)

const noChangeResponse = dataLine({ 摘要: '本轮没有形成可写源变化' })
assertOk(
  inspectNarrativeSettlementQuality({
    content: noChangeResponse,
    narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: writableIds,
  }).valid,
  'a round with no source changes must omit every system segment and keep the required data segment',
)

const invalidSettlementCases = [
  [systemLine(2, relationshipInstruction), 'system numbering must start at one'],
  [`${settlementResponse}\n\n⟦结束⟧`, 'ending tags must be rejected'],
  [`${dataLine(branchSettlementData)}\n\n${systemLine(1, relationshipInstruction)}`, 'data must be the final segment'],
  [`${dataLine(branchSettlementData)}\n\n${dataLine(branchSettlementData)}`, 'data must be unique'],
  [`⟦系统1⟧{"系统":"通用关系系统"\n\n${dataLine(branchSettlementData)}`, 'truncated system JSON must be rejected'],
]
for (const [content, message] of invalidSettlementCases) {
  assertThrows(() => parseNarrativeSettlementEnvelope(content), message)
}

const unknownEvidenceResponse = [
  systemLine(1, { ...relationshipInstruction, 依据事件: ['event:not-provided'] }),
  dataLine(branchSettlementData),
].join('\n\n')
assertOk(
  !inspectNarrativeSettlementQuality({
    content: unknownEvidenceResponse,
    narrative: inspectNarrativeResponseQuality(narrativeWithBranch, 500).parsed,
    allowedEvidenceEventIds: ['event:accepted-123'],
    allowedSubsystemIds: writableIds,
  }).valid,
  'settlement must reject evidence IDs that were not supplied in the same call',
)

for (const instruction of [
  { ...relationshipInstruction, 系统: '未知系统' },
  { ...relationshipInstruction, 操作: '未知操作' },
  { ...relationshipInstruction, 变更: { 未知字段: 1 } },
]) {
  const result = inspectNarrativeSettlementQuality({
    content: [systemLine(1, instruction), dataLine(branchSettlementData)].join('\n\n'),
    narrative: inspectNarrativeResponseQuality(narrativeWithBranch, 500).parsed,
    allowedEvidenceEventIds: ['event:accepted-123'],
    allowedSubsystemIds: writableIds,
  })
  assertOk(!result.valid, 'unknown systems, operations and fields must reject the complete settlement')
}

assertOk(
  !inspectNarrativeSettlementQuality({
    content: dataLine({ 摘要: '分支缺少机器语义核心' }),
    narrative: inspectNarrativeResponseQuality(narrativeWithBranch, 500).parsed,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: writableIds,
  }).valid,
  'a first response with a branch must require high, irreversible fate-or-legacy semantic metadata',
)

const intentData = {
  摘要: '夺回家园的长期目标取得条件性进展',
  ...buildSemanticCore(),
  命运意图判定: {
    意图编号: '命运分支:夺回家园',
    可行性: '有条件',
    执行方式: '逐步执行',
    状态: '推进中',
    风险等级: '高',
    进度: 35,
    预计耗时: '仍需数月',
    判定理由: '已经获得盟友，但尚未突破封锁。',
    下一步: '先让船队安全离港',
  },
}
assertOk(
  inspectNarrativeSettlementQuality({
    content: dataLine(intentData),
    narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: writableIds,
    expectedIntentId: 'branch:夺回家园',
  }).valid,
  'an active intent must accept only the matching structured intent resolution',
)
assertOk(
  !inspectNarrativeSettlementQuality({
    content: dataLine(intentData),
    narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: writableIds,
  }).valid,
  'intent metadata must be rejected when the round has no active intent',
)
assertOk(
  !inspectNarrativeSettlementQuality({
    content: noChangeResponse,
    narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: writableIds,
    expectedIntentId: 'branch:夺回家园',
  }).valid,
  'an active intent must not silently omit its settlement resolution',
)

assertOk(
  toNarrativeAIIntentId('branch:长期目标') === '命运分支:长期目标'
    && fromNarrativeAIIntentId('命运分支:长期目标') === 'branch:长期目标',
  'intent ID translation must remain reversible',
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
  !NarrativeAISettlementDataSchema.safeParse({
    摘要: '不允许把系统指令塞回数据段',
    系统指令: [],
  }).success,
  'the data segment must not reintroduce the old combined system-instruction array',
)

const narrativeFailure = inspectNarrativeResponseQuality('⟦正文⟧', 500)
const narrativeRepair = buildNarrativeRepairInstruction(narrativeFailure, 500, true)
assertOk(
  narrativeRepair.includes(narrativeFailure.reason)
    && narrativeRepair.includes('系统提示词末尾的唯一 content 返回结构示例')
    && narrativeRepair.includes('⟦正文⟧')
    && narrativeRepair.includes('⟦分支⟧')
    && !narrativeRepair.includes('禁止摘要')
    && !narrativeRepair.includes('⟦结束⟧'),
  'first-call repair must use the fixed positive example guidance without an ending marker',
)
const settlementFailure = inspectNarrativeSettlementQuality({
  content: '旧结算格式',
  narrative: inspectNarrativeResponseQuality(narrativeWithoutBranch, 500).parsed,
  allowedEvidenceEventIds: [],
  allowedSubsystemIds: writableIds,
})
const originalSettlementFailure = '旧结算格式\n以及完整原文'
const settlementRepair = buildNarrativeSettlementRepairInstruction(
  settlementFailure,
  originalSettlementFailure,
)
assertOk(
  settlementRepair.includes(settlementFailure.reason)
    && settlementRepair.includes(originalSettlementFailure)
    && settlementRepair.includes('系统提示词末尾的唯一结算示例')
    && settlementRepair.includes('系统1')
    && settlementRepair.includes('唯一数据段')
    && !settlementRepair.includes('禁止解释'),
  'second-call repair must retain the complete failed response and use positive example guidance',
)
assertOk(
  buildNarrativeRoundOutputContract(true)?.includes('正文停在玩家作出选择之前')
    && buildNarrativeRoundOutputContract(false, true)?.includes('这是人生首轮')
    && buildNarrativeRoundOutputContract(false) === undefined,
  'normal rounds must add only triggered branch or opening conditions and otherwise repeat no fixed protocol',
)

const eventRecognitionExample = buildNarrativeEventRecognitionStandardExample()
const eventRecognitionEnvelope = parseNarrativeEventRecognitionEnvelope(eventRecognitionExample)
const eventRecognitionQuality = inspectNarrativeEventRecognitionQuality({
  content: eventRecognitionExample,
  currentContextId: 'ctx-protocol',
  currentTotalDays: 1000,
  existingCandidates: [],
})
assertOk(
  Array.isArray(eventRecognitionEnvelope.data.事件)
    && eventRecognitionQuality.valid
    && eventRecognitionQuality.candidates?.length === 1
    && eventRecognitionQuality.candidates[0].scope.kind === 'context'
    && eventRecognitionQuality.candidates[0].scope.contextIds[0] === 'ctx-protocol'
    && eventRecognitionQuality.candidates[0].schedule?.dueTotalDays === 1030,
  'event recognition must parse the unique future-event segment and anchor delays to canonical total days',
)
const emptyEventRecognition = inspectNarrativeEventRecognitionQuality({
  content: '⟦待触发事件⟧{"事件":[]}',
  currentContextId: 'ctx-protocol',
  currentTotalDays: 1000,
  existingCandidates: [],
})
assertOk(
  emptyEventRecognition.valid && emptyEventRecognition.candidates?.length === 0,
  'event recognition must accept one explicit empty candidate set when the story establishes no future trigger',
)
const eventRecognitionFailure = inspectNarrativeEventRecognitionQuality({
  content: '旧事件识别格式',
  currentContextId: 'ctx-protocol',
  currentTotalDays: 1000,
  existingCandidates: [],
})
const originalEventRecognitionFailure = '旧事件识别格式\n以及完整原文'
const eventRecognitionRepair = buildNarrativeEventRecognitionRepairInstruction(
  eventRecognitionFailure,
  originalEventRecognitionFailure,
)
assertOk(
  eventRecognitionRepair.includes(eventRecognitionFailure.reason)
    && eventRecognitionRepair.includes(originalEventRecognitionFailure)
    && eventRecognitionRepair.includes('系统提示词末尾的唯一事件识别示例')
    && eventRecognitionRepair.includes('空事件数组'),
  'event-recognition repair must retain the rejected response and reuse the fixed positive example',
)

assertOk(
  narrativePrompt.version === '5.8.1'
    && narrativePrompt.serverPromptAssetId === NARRATIVE_SERVER_PROMPT_ASSET_ID
    && narrativeSettlementPrompt.version === '1.1.0'
    && narrativeSettlementPrompt.serverPromptAssetId === NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID
    && narrativeEventRecognitionPrompt.version === '1.0.0'
    && narrativeEventRecognitionPrompt.serverPromptAssetId === NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID
    && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('⟦结束⟧')
    && !COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT.includes('⟦结束⟧')
    && !COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT.includes('⟦结束⟧')
    && COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT.includes('尚未发生且需要未来条件才能触发')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('角色自创内容的后续发展必须来自角色自身')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('记忆只提供已经成立的事实')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('本轮必须从当前时间与引导产生新的变化和结果'),
  'the live prompts must expose the three versioned assets and no ending tag',
)

if (failed > 0) process.exit(1)
console.log('PASS: narrative-chinese-protocol-regression')
