/**
 * 命运分支意图：结构化可行性、持续推进、终态与无额外 AI 调用回归。
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import {
  NarrativeResponseSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'
import {
  canContinueWithNarrativeBody,
  buildNarrativeDataRepairInstruction,
  inspectNarrativeResponseQuality,
  preserveNarrativeBodyAndSummary,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { replaceTaggedMetaDataSection } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import {
  narrativeBranchRepairOutputSchema,
} from '../../../../src/mods/mod-engine/prompts/narrative-branch-repair-prompt.ts'
import {
  buildBranchIntentInstruction,
  commitBranchIntentResolution,
  createBranchIntentState,
  isTerminalIntentStatus,
  upsertBranchIntent,
  validateIntentResolution,
  validateIntentResolutionForState,
} from '../../../../src/mods/mod-engine/helpers/branch-intent-resolution.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function buildLatestEntryGuard(runtime, entry) {
  const state = runtime.getState()
  return {
    lifeGeneration: runtime.getLifeGeneration(),
    lifeRunId: state.lifeRunId,
    sourceRound: state.totalRounds,
    sourceNarrative: entry.text,
  }
}

function buildMetadata(intentResolution) {
  return {
    changes: [],
    importance: 'HIGH',
    digest: '你开始把命运选择付诸行动，并面对现实阻力。',
    keyEvents: [{
      text: '你推进已选择的长期方向并确认当前阶段结果。',
      importance: 90,
    }],
    arcStatus: intentResolution.status === 'progressing' ? 'ongoing' : 'end',
    semanticSignals: {
      eventType: 'conflict',
      conflictIntensity: 60,
      tensionDelta: 4,
      actionScale: intentResolution.executionMode === 'immediate' ? 'small' : 'large',
      irreversible: true,
      impactScope: 'personal',
      narrativeRegister: 'fate',
      registerReason: '玩家正在承担已确认命运选择的阻力与后果。',
      arcType: 'task',
      relationshipUpdates: [],
      resolvedForeshadowingIds: [],
    },
    intentResolution,
  }
}

const firstIntent = createBranchIntentState('branch-one', '尝试联合旧友夺回家园', 8)
const progressing = {
  intentId: firstIntent.intentId,
  feasibility: 'conditional',
  executionMode: 'progressive',
  status: 'progressing',
  riskLevel: 'high',
  progress: 25,
  blockers: ['敌方仍控制主要入口'],
  prerequisites: ['取得旧友明确支持'],
  costs: ['暴露自己的行踪'],
  timeHorizon: '预计需要数月并跨越多个叙事节点',
  reason: '你拥有行动动机，但资源和盟友尚不足以立即完成目标。',
  nextStep: '先确认旧友立场并建立安全落脚点',
}

assertOk(NarrativeResponseSchema.safeParse(buildMetadata(progressing)).success, 'valid intentResolution must pass the active narrative Schema')
assertOk(!validateIntentResolutionForState(firstIntent, progressing), 'matching progressive resolution must pass intent validation')
assertOk(!isTerminalIntentStatus(progressing.status), 'progressing must remain non-terminal')

assertOk(
  Boolean(validateIntentResolution(undefined, firstIntent.intentId)),
  'an active intent must reject META that omits intentResolution',
)

const wrongId = { ...progressing, intentId: 'branch:wrong' }
assertOk(
  Boolean(validateIntentResolution(wrongId, firstIntent.intentId)),
  'an active intent must reject a mismatched intentId',
)
assertOk(
  !validateIntentResolution(progressing, firstIntent.intentId),
  'matching intentResolution must pass protocol, Schema and contextual validation',
)

const impossibleButProgressing = {
  ...progressing,
  feasibility: 'impossible',
  status: 'progressing',
}
assertOk(
  Boolean(validateIntentResolutionForState(firstIntent, impossibleButProgressing)),
  'impossible intent must not masquerade as progressing',
)

const otherIntent = createBranchIntentState('branch-two', '公开拒绝旧秩序', 9)
const instruction = buildBranchIntentInstruction(firstIntent, [otherIntent])
assertOk(instruction.includes(firstIntent.choice), 'focused intent instruction must retain the complete player choice')
assertOk(instruction.includes(otherIntent.choice), 'other unresolved intents must remain in Prompt context')
assertOk(!/成功率|%/.test(instruction), 'intent instruction must not request pseudo-precise success probability')
assertOk(
  instruction.includes('命运分支:branch-one')
    && !instruction.includes('intentResolution')
    && !instruction.includes('feasibility'),
  'AI-visible intent instruction must use the Chinese ID prefix and Chinese protocol fields only',
)

let collection = upsertBranchIntent([], 'branch-one', firstIntent.choice, 8)
assertOk(collection.focusedIntentId === firstIntent.intentId, 'branch selection must create a focused stable intent')
let commitResult = commitBranchIntentResolution(collection.intents, collection.focusedIntentId, progressing, 9)
assertOk(commitResult.committed?.status === 'progressing', 'accepted progressive resolution must be committed')
assertOk(commitResult.intents[0]?.resolution?.progress === 25, 'non-terminal resolution must persist on the focused intent')

collection = upsertBranchIntent(commitResult.intents, 'branch-two', otherIntent.choice, 10)
assertOk(collection.intents.length === 2, 'a new branch must not delete another unresolved intent')

const succeeded = {
  intentId: otherIntent.intentId,
  feasibility: 'executable',
  executionMode: 'immediate',
  status: 'succeeded',
  riskLevel: 'medium',
  progress: 100,
  blockers: [],
  prerequisites: [],
  costs: ['与旧秩序公开决裂'],
  timeHorizon: '本轮完成公开表态',
  reason: '你具备当场表达立场的能力，并承担了立即可见的社会代价。',
}
commitResult = commitBranchIntentResolution(collection.intents, collection.focusedIntentId, succeeded, 11)
assertOk(commitResult.committed?.status === 'succeeded', 'terminal intent result must be returned')
assertOk(commitResult.intents.length === 1, 'terminal intent may leave the active set only after acceptance')
assertOk(commitResult.focusedIntentId === firstIntent.intentId, 'engine must resume the most recent remaining unresolved intent')
assertOk(
  commitResult.archivedIntents?.some((intent) => intent.intentId === otherIntent.intentId && intent.lifecycle === 'terminal'),
  'terminal intent must remain in archived history for continuity auditing',
)

const partiallySucceededIntent = createBranchIntentState('branch-three', '修复旧港的供水系统', 12)
const partialCollection = upsertBranchIntent(commitResult.intents, 'branch-three', partiallySucceededIntent.choice, 12)
const partiallySucceeded = {
  intentId: partiallySucceededIntent.intentId,
  feasibility: 'conditional',
  executionMode: 'progressive',
  status: 'partially_succeeded',
  riskLevel: 'medium',
  progress: 60,
  blockers: ['仍需更换主阀'],
  prerequisites: ['取得维修材料'],
  costs: ['消耗储备零件'],
  timeHorizon: '还需数周完成收尾',
  reason: '主干管线已恢复，但最后一段仍需材料和时间。',
  nextStep: '在下个集市采购主阀并完成压力测试',
}
const partialResult = commitBranchIntentResolution(
  partialCollection.intents,
  partialCollection.focusedIntentId,
  partiallySucceeded,
  13,
)
assertOk(partialResult.committed?.status === 'partially_succeeded', 'partially_succeeded result must be returned')
assertOk(
  !partialResult.intents.some((intent) => intent.intentId === partiallySucceededIntent.intentId),
  'partially_succeeded is terminal and must leave the active intent set',
)
assertOk(
  partialResult.archivedIntents?.some((intent) => intent.intentId === partiallySucceededIntent.intentId && intent.lifecycle === 'terminal'),
  'partially_succeeded intent must be archived as a terminal result',
)

const snapshotRoundTrip = JSON.parse(JSON.stringify({
  branchIntents: commitResult.intents,
  focusedBranchIntentId: commitResult.focusedIntentId,
}))
assertOk(snapshotRoundTrip.branchIntents.length === 1, 'snapshot serialization must persist unresolved intent state')
assertOk(snapshotRoundTrip.focusedBranchIntentId === firstIntent.intentId, 'snapshot serialization must persist focused intent ownership')

// 玩家路径回归：自定义选择后的主模型若只返回完整正文/摘要，不能让整轮回滚。
const bodyOnlyResponse = [
  '⟦正文⟧',
  '你把自定义选择付诸行动，现场立刻给出回应，新的局面在眼前展开。',
  '⟦摘要⟧',
  '你已经开始执行玩家确认的长期方向。',
  '⟦结束⟧',
].join('\n')
const bodyOnlyQuality = inspectNarrativeResponseQuality(
  bodyOnlyResponse,
  200,
  firstIntent.intentId,
)
assertOk(!bodyOnlyQuality.valid, 'missing intent META must remain rejected as structured data')
assertOk(bodyOnlyQuality.conditionalFailure === 'intent', 'missing intent META must be classified as an intent-only failure')
assertOk(
  canContinueWithNarrativeBody(bodyOnlyQuality, firstIntent.intentId),
  'a complete body must remain usable when only focused intent META is missing',
)
assertOk(
  canContinueWithNarrativeBody(bodyOnlyQuality, firstIntent.intentId, true),
  'a forced branch body must remain usable while its conditional META is repaired later',
)
const scalarIntentListResponse = [
  '⟦正文⟧',
  '你当场确认了行动方向，并把第一步落实到眼前。',
  '⟦数据⟧',
  JSON.stringify({
    重要程度: '高',
    情节状态: '进行中',
    语义信号: {
      事件类型: '冲突',
      冲突强度: 20,
      张力变化: 2,
      行动规模: '小',
      不可逆: true,
      影响范围: '个人',
      叙事语域: '命运',
      语域理由: '玩家已把选择付诸行动。',
      情节类型: '任务',
    },
    命运意图判定: {
      意图编号: '命运分支:branch-one',
      可行性: '有条件',
      执行方式: '逐步执行',
      状态: '推进中',
      风险等级: '中',
      进度: 20,
      阻碍: '仍需确认入口',
      前置条件: '取得旧友支持',
      代价: '暴露部分行踪',
      预计耗时: '数月',
      判定理由: '当前资源只够完成第一步。',
      下一步: '确认旧友立场',
    },
  }),
  '⟦结束⟧',
].join('\n')
assertOk(
  inspectNarrativeResponseQuality(scalarIntentListResponse, 200, firstIntent.intentId).valid,
  'single textual blocker, prerequisite and cost must normalize losslessly into one-item lists',
)
const commonChineseAliasesResponse = scalarIntentListResponse
  .replace('"重要程度":"高"', '"重要程度":"中"')
  .replace('"情节状态":"进行中"', '"情节状态":"推进中"')
  .replace('"事件类型":"冲突"', '"事件类型":"成长"')
  .replace('"影响范围":"个人"', '"影响范围":"社交圈"')
  .replace('"情节类型":"任务"', '"情节类型":"日常"')
assertOk(
  inspectNarrativeResponseQuality(commonChineseAliasesResponse, 200, firstIntent.intentId).valid,
  'unambiguous Chinese enum aliases from live providers must normalize before strict validation',
)
const malformedConditionalResponse = [
  '⟦正文⟧',
  '你已经完成了现场行动，新的局面清楚地落到眼前。',
  '⟦摘要⟧',
  '正文事实应先交付给玩家。',
  '⟦数据⟧',
  '{"重要程度":"高"}',
  '⟦结束⟧',
].join('\n')
const malformedConditionalQuality = inspectNarrativeResponseQuality(
  malformedConditionalResponse,
  200,
  undefined,
  true,
)
assertOk(!malformedConditionalQuality.valid, 'forced branch META must remain conditionally rejected')
assertOk(
  canContinueWithNarrativeBody(malformedConditionalQuality, undefined, true),
  'forced branch with a complete body must still be player-visible immediately',
)
const bodyOnlyEnvelope = preserveNarrativeBodyAndSummary(malformedConditionalResponse)
assertOk(!bodyOnlyEnvelope.includes('⟦数据⟧'), 'invalid conditional data must be removed before state application')
assertOk(bodyOnlyEnvelope.includes('正文事实应先交付给玩家。'), 'body-only fallback must preserve the summary')

const invalidIrreversibleData = {
  重要程度: '高',
  情节状态: '进行中',
  语义信号: {
    事件类型: '冲突',
    冲突强度: 60,
    张力变化: 3,
    行动规模: '中',
    不可逆: false,
    影响范围: '关系圈',
    叙事语域: '命运',
    语域理由: '你已经开始执行当前命运意图。',
    情节类型: '任务',
  },
  命运意图判定: {
    意图编号: '命运分支:branch-one',
    可行性: '有条件',
    执行方式: '逐步执行',
    状态: '推进中',
    风险等级: '中',
    进度: 20,
    预计耗时: '数月',
    判定理由: '当前行动已经发生。',
    下一步: '继续推进',
  },
}
const exactBodyAndSummary = '⟦正文⟧\r\n你把门推开，已经发生的行动不能被格式修复改写。\r\n\r\n第二段保留原始空行。  \r\n⟦摘要⟧\r\n原摘要也必须逐字保留。\r\n'
const invalidDataText = JSON.stringify(invalidIrreversibleData)
const invalidDataEnvelope = `${exactBodyAndSummary}⟦数据⟧\r\n${invalidDataText}\r\n⟦结束⟧`
const invalidDataQuality = inspectNarrativeResponseQuality(
  invalidDataEnvelope,
  200,
  firstIntent.intentId,
)
const irreversibleIssue = invalidDataQuality.validationIssues?.find(
  (issue) => issue.path === '语义信号.不可逆',
)
assertOk(
  irreversibleIssue?.currentValue === 'false'
    && irreversibleIssue.rule.includes('命运或传承语域必须对应不可逆变化'),
  'data repair diagnostics must retain the exact field path, current value and violated rule',
)
const dataRepairInstruction = buildNarrativeDataRepairInstruction(
  invalidDataQuality,
  invalidDataText,
  firstIntent.intentId,
)
assertOk(
  dataRepairInstruction.includes('失败路径：语义信号.不可逆')
    && dataRepairInstruction.includes('当前值：false')
    && dataRepairInstruction.includes('合法示例：true')
    && dataRepairInstruction.includes('命运分支:branch-one')
    && dataRepairInstruction.includes(invalidDataText),
  'data-only repair must tell the model the path, value, rule, legal shape, current condition and complete original data',
)
const repairedDataText = JSON.stringify({
  ...invalidIrreversibleData,
  语义信号: { ...invalidIrreversibleData.语义信号, 不可逆: true },
})
const repairedDataEnvelope = replaceTaggedMetaDataSection(invalidDataEnvelope, repairedDataText)
assertOk(
  repairedDataEnvelope?.startsWith(exactBodyAndSummary) === true
    && repairedDataEnvelope.endsWith('⟦结束⟧')
    && inspectNarrativeResponseQuality(repairedDataEnvelope, 200, firstIntent.intentId).valid,
  'strictly valid repaired data must merge without changing any body or summary bytes',
)
const unwrappedStory = '你沿着潮湿的石阶走出城门，风里带着远处海潮和炉火的气味。守门人没有拦你，只把一枚旧铜牌塞进你掌心，提醒你在日落前找到北岸的灯塔。'
const unwrappedQuality = inspectNarrativeResponseQuality(unwrappedStory, 200, firstIntent.intentId)
assertOk(
  !unwrappedQuality.valid && unwrappedQuality.conditionalFailure === 'intent',
  'a complete unwrapped story must expose missing conditional intent META without withholding its body',
)
assertOk(unwrappedQuality.hasUsableNarrative === true, 'unwrapped story must remain player-visible')
assertOk(
  inspectNarrativeResponseQuality(unwrappedStory, 200).valid,
  'an ordinary unwrapped story must remain a complete player-visible success',
)

const runtime = new OrchestratorSystem()
runtime.resolveBranchChoice('custom-choice', '自定义寻找失落的航道')
const runtimeResult = runtime.handleNarrativeResponse(bodyOnlyResponse)
assertOk(
  runtimeResult.narrative.includes('自定义选择付诸行动'),
  'runtime must commit the complete body after custom-choice META failure',
)
assertOk(!runtimeResult.intentResolution, 'runtime must not fabricate an intent resolution')
assertOk(
  runtime.getActiveBranchIntents().some((intent) => intent.choice === '自定义寻找失落的航道'),
  'unresolved custom intent must remain pending after body-only acceptance',
)
assertOk(runtime.getState().narrativeHistory.length === 1, 'body-only custom choice must create a playable narrative history entry')

// 玩家强制分支若只拿到完整正文，正文先落地；后台修复只能把严格校验的
// 分支 META 合并回同一历史条目，不能改写故事或另增一轮。
const forcedRuntime = new OrchestratorSystem()
useEngineStore.setState({ forceBranchNext: true, branchRepairPending: true, narrativeHistory: [] })
const forcedBodyResult = forcedRuntime.handleNarrativeResponse(bodyOnlyResponse)
const forcedEntry = forcedRuntime.getState().narrativeHistory[0]
const forcedEntryGuard = forcedEntry ? buildLatestEntryGuard(forcedRuntime, forcedEntry) : undefined
useEngineStore.setState({ narrativeHistory: structuredClone(forcedRuntime.getState().narrativeHistory) })
const forcedBranchRepairData = {
  分支标题: '谁来承担今后的照料责任？',
  分支选项: ['由守塔人家庭继续抚养', '交由往来船队中的亲族照料'],
}
assertOk(
  narrativeBranchRepairOutputSchema.safeParse(forcedBranchRepairData).success,
  'dedicated forced-branch output must accept only a title and two to four choices',
)
assertOk(
  !narrativeBranchRepairOutputSchema.safeParse({
    ...forcedBranchRepairData,
    分支选项: ['重复选择', '重复选择'],
  }).success,
  'dedicated forced-branch output must reject duplicate choices',
)
assertOk(
  !narrativeBranchRepairOutputSchema.safeParse({
    ...forcedBranchRepairData,
    正文: '后台结果不得携带或改写正文',
  }).success,
  'dedicated forced-branch output must reject every extra narrative or META field',
)
assertOk(
  forcedEntry?.id && forcedEntryGuard
    && forcedRuntime.applyBackgroundForcedBranchRepair(
      forcedEntry.id,
      forcedBranchRepairData,
      forcedEntryGuard,
    ),
  'a valid background forced-branch repair must merge into its committed history entry',
)
const repairedForcedEntry = forcedRuntime.getState().narrativeHistory[0]
assertOk(
  forcedBodyResult.narrative === repairedForcedEntry?.text
    && repairedForcedEntry?.text.includes('自定义选择付诸行动'),
  'background branch repair must preserve the exact committed narrative body',
)
assertOk(
  forcedRuntime.getState().narrativeHistory.length === 1
    && repairedForcedEntry?.isBranchPoint === true
    && repairedForcedEntry.branchOptions?.length === 2,
  'background repair must add one unresolved branch without creating another narrative round',
)
assertOk(
  useEngineStore.getState().narrativeHistory[0]?.isBranchPoint === true
    && useEngineStore.getState().forceBranchNext === false,
  'accepted background branch META must reach the player-facing Store and clear the force flag',
)
useEngineStore.setState({
  forceBranchNext: false,
  branchRepairPending: false,
  narrativeHistory: [],
})

// 重复正文候选回归：只替换同一条历史记录的正文，并保留原摘要、上下文和分支字段。
const repairRuntime = new OrchestratorSystem()
const sourceResponse = [
  '⟦正文⟧',
  '旧港的雾气压在屋檐下，你把修井图摊开，逐段核对每一处阀门。',
  '⟦摘要⟧',
  '你开始修复旧港供水系统。',
  '⟦结束⟧',
].join('\n')
const repairResult = repairRuntime.handleNarrativeResponse(sourceResponse)
const repairEntry = repairRuntime.getState().narrativeHistory[0]
const repairEntryGuard = repairEntry ? buildLatestEntryGuard(repairRuntime, repairEntry) : undefined
useEngineStore.setState({
  forceBranchNext: true,
  narrativeHistory: structuredClone(repairRuntime.getState().narrativeHistory),
})
assertOk(
  repairEntry?.id && repairEntryGuard
    && repairRuntime.applyBackgroundForcedBranchRepair(
      repairEntry.id,
      forcedBranchRepairData,
      repairEntryGuard,
    ),
  'the source entry must have an existing branch field before a repetition replacement',
)
const repairOriginalSummary = repairRuntime.getState().narrativeHistory.length
const repairCandidate = [
  '⟦正文⟧',
  '夜雨突然涨过堤岸，你带着修井图进入泵房，先封住倒灌的闸门，再让学徒记录压力变化。',
  '⟦结束⟧',
].join('\n')
const consistentAudit = {
  事实一致: true,
  完整覆盖: true,
  覆盖证据: [{
    原文事实: '你带着修井图进入泵房并封住倒灌闸门',
    候选对应: '候选保留修井图、泵房和封闸行动',
  }],
  冲突: [],
  遗漏: [],
}
assertOk(
  repairEntry?.id && repairEntryGuard
    && repairRuntime.applyBackgroundNarrativeRepair(
      repairEntry.id,
      sourceResponse,
      repairCandidate,
      consistentAudit,
      repairEntryGuard,
    ),
  'a valid repetition candidate must be accepted for the matching life generation',
)
const repairedEntry = repairRuntime.getState().narrativeHistory[0]
assertOk(repairRuntime.getState().narrativeHistory.length === repairOriginalSummary, 'background narrative repair must not create a second round')
assertOk(repairedEntry?.text.includes('夜雨突然涨过堤岸'), 'background narrative repair must replace only the body')
assertOk(repairResult.narrative !== repairedEntry?.text, 'replacement candidate must differ from the repetitive source body')
assertOk(repairedEntry?.isBranchPoint === true && repairedEntry.branchOptions?.length === 2, 'background repair must preserve existing branch fields')
assertOk(repairedEntry?.repetitionMetric?.round === repairEntry?.repetitionMetric?.round, 'background repair must keep the original round metric identity')
const repairedTextBeforeStaleCandidate = repairedEntry?.text
assertOk(
  repairEntry?.id
    && !repairRuntime.applyBackgroundNarrativeRepair(
      repairEntry.id,
      sourceResponse,
      repairCandidate.replace('夜雨突然涨过堤岸', '旧候选试图覆盖新正文'),
      consistentAudit,
      repairEntryGuard,
    ),
  'a stale background candidate must be rejected after the source entry has already changed',
)
assertOk(
  repairRuntime.getState().narrativeHistory[0]?.text === repairedTextBeforeStaleCandidate,
  'rejecting a stale candidate must leave the newer narrative entry unchanged',
)

const strictCandidateRuntime = new OrchestratorSystem()
const strictSourceResult = strictCandidateRuntime.handleNarrativeResponse(sourceResponse)
const strictSourceEntry = strictCandidateRuntime.getState().narrativeHistory[0]
const strictSourceGuard = strictSourceEntry
  ? buildLatestEntryGuard(strictCandidateRuntime, strictSourceEntry)
  : undefined
const candidateWithSummary = repairCandidate.replace(
  '⟦结束⟧',
  '⟦摘要⟧\n候选不得携带摘要。\n⟦结束⟧',
)
assertOk(
  strictSourceEntry?.id && strictSourceGuard
    && !strictCandidateRuntime.applyBackgroundNarrativeRepair(
      strictSourceEntry.id,
      sourceResponse,
      candidateWithSummary,
      consistentAudit,
      strictSourceGuard,
    ),
  'a repetition repair candidate carrying summary or META must be rejected',
)
assertOk(
  strictSourceEntry?.id && strictSourceGuard
    && !strictCandidateRuntime.applyBackgroundNarrativeRepair(
      strictSourceEntry.id,
      sourceResponse,
      repairCandidate,
      {
        事实一致: false,
        完整覆盖: true,
        覆盖证据: [],
        冲突: ['候选反转了已成立行动结果'],
        遗漏: [],
      },
      strictSourceGuard,
    ),
  'a candidate rejected by the independent fact audit must never replace the story',
)
assertOk(
  strictSourceEntry?.id && strictSourceGuard
    && !strictCandidateRuntime.applyBackgroundNarrativeRepair(
      strictSourceEntry.id,
      sourceResponse,
      repairCandidate,
      {
        事实一致: true,
        完整覆盖: false,
        覆盖证据: [{
          原文事实: '修井图仍由你保管',
          候选对应: '你带着修井图进入泵房',
        }],
        冲突: [],
        遗漏: ['原文逐段核对每一处阀门的已成立行动没有在候选中承载'],
      },
      strictSourceGuard,
    ),
  'a candidate that omits any established source fact must never replace the story',
)
assertOk(
  strictCandidateRuntime.getState().narrativeHistory[0]?.text === strictSourceResult.narrative,
  'failed candidate gates must preserve the exact committed source narrative',
)

const lateCandidateRuntime = new OrchestratorSystem()
lateCandidateRuntime.handleNarrativeResponse(sourceResponse)
const lateSourceEntry = lateCandidateRuntime.getState().narrativeHistory[0]
const lateSourceGuard = lateSourceEntry
  ? buildLatestEntryGuard(lateCandidateRuntime, lateSourceEntry)
  : undefined
lateCandidateRuntime.handleNarrativeResponse([
  '⟦正文⟧',
  '第二轮已经进入泵房深处，你完成了新的压力测试。',
  '⟦结束⟧',
].join('\n'))
assertOk(
  lateSourceEntry?.id && lateSourceGuard
    && !lateCandidateRuntime.applyBackgroundNarrativeRepair(
      lateSourceEntry.id,
      sourceResponse,
      repairCandidate,
      consistentAudit,
      lateSourceGuard,
    ),
  'a background candidate must be rejected after a newer narrative entry exists',
)

const repairLockRuntime = new OrchestratorSystem()
const oldRepairGeneration = repairLockRuntime.getLifeGeneration()
const oldRepairToken = repairLockRuntime.tryBeginNarrativeRepetitionRepair(oldRepairGeneration)
assertOk(
  oldRepairToken,
  'the first repetition repair in a life generation must acquire the single-flight lock',
)
repairLockRuntime.reset()
const newRepairGeneration = repairLockRuntime.getLifeGeneration()
const newRepairToken = repairLockRuntime.tryBeginNarrativeRepetitionRepair(newRepairGeneration)
assertOk(
  newRepairGeneration !== oldRepairGeneration
    && newRepairToken,
  'a reset must invalidate the old repair and allow the new life to acquire its own lock',
)
repairLockRuntime.finishNarrativeRepetitionRepair(oldRepairToken)
assertOk(
  !repairLockRuntime.tryBeginNarrativeRepetitionRepair(newRepairGeneration),
  'completion from an old life must not release the current life repair lock',
)
repairLockRuntime.finishNarrativeRepetitionRepair(newRepairToken)
const replacementRepairToken = repairLockRuntime.tryBeginNarrativeRepetitionRepair(newRepairGeneration)
assertOk(
  replacementRepairToken,
  'the matching life generation must release its repair lock',
)
repairLockRuntime.finishNarrativeRepetitionRepair(replacementRepairToken)

const forcedLockRuntime = new OrchestratorSystem()
const oldForcedGeneration = forcedLockRuntime.getLifeGeneration()
const oldForcedToken = forcedLockRuntime.tryBeginForcedBranchRepair(oldForcedGeneration)
forcedLockRuntime.reset()
const newForcedGeneration = forcedLockRuntime.getLifeGeneration()
const newForcedToken = forcedLockRuntime.tryBeginForcedBranchRepair(newForcedGeneration)
forcedLockRuntime.finishForcedBranchRepair(oldForcedToken)
assertOk(
  oldForcedToken && newForcedToken && useEngineStore.getState().branchRepairPending,
  'completion from an old life must not clear a new forced-branch request pending state',
)
forcedLockRuntime.finishForcedBranchRepair(newForcedToken)
assertOk(
  !useEngineStore.getState().branchRepairPending,
  'only the matching forced-branch owner may release pending state',
)

const roundTokenRuntime = new OrchestratorSystem()
const committedToken = roundTokenRuntime.beginRoundExecution()
roundTokenRuntime.commitRoundExecution(committedToken)
let releasePreview
let deferredCallbackCount = 0
const preview = roundTokenRuntime.runPreviewRound(async () => new Promise((resolve) => {
  releasePreview = resolve
}))
await Promise.resolve()
assertOk(
  roundTokenRuntime.enqueueAfterRoundCommit(committedToken, () => {
    deferredCallbackCount += 1
  }),
  'a committed real-round callback must remain eligible while preview is active',
)
assertOk(deferredCallbackCount === 0, 'background merge must wait until preview state is restored')
releasePreview()
await preview
await Promise.resolve()
assertOk(deferredCallbackCount === 1, 'background merge must run once after preview restoration')

const staleRoundToken = roundTokenRuntime.beginRoundExecution()
roundTokenRuntime.commitRoundExecution(staleRoundToken)
const newerRoundToken = roundTokenRuntime.beginRoundExecution()
let staleRoundCallbackCount = 0
assertOk(
  !roundTokenRuntime.enqueueAfterRoundCommit(staleRoundToken, () => {
    staleRoundCallbackCount += 1
  }) && staleRoundCallbackCount === 0,
  'starting a newer real round must invalidate a late callback from the previous round',
)
roundTokenRuntime.abortRoundExecution(newerRoundToken)

useEngineStore.getState().reset()
useEngineStore.setState({ forceBranchNext: true })
const promptBranchRuntime = new OrchestratorSystem()
const uniqueChoice = '沿北岸航道寻找失踪的远征队'
promptBranchRuntime.resolveBranchChoice('prompt-branch', uniqueChoice)
promptBranchRuntime.setLastPlayerChoice(uniqueChoice)
const branchUserInstruction = promptBranchRuntime.buildUserInstruction() ?? ''
const choiceMentions = branchUserInstruction.match(new RegExp(uniqueChoice, 'gu'))?.length ?? 0
assertOk(
  choiceMentions === 1,
  'the active BranchIntent must be the only Prompt projection that repeats the current choice text',
)
assertOk(
  branchUserInstruction.includes('【强制分支】')
    && !branchUserInstruction.includes('本轮禁止生成新的命运分支')
    && !branchUserInstruction.includes('普通命运分支冷却中'),
  'an explicit forced branch must override ordinary branch cooldown instructions',
)

const branchCommands = read('src/mods/mod-engine/helpers/branch-commands.ts')
const responseQuality = read('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const orchestratorSource = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const campaignSource = read('src/mods/mod-engine/campaigns/default/index.ts')
const preGenSource = read('src/mods/mod-engine/helpers/pre-gen-queue.ts')
const branchRepairStart = campaignSource.indexOf('ctx._forcedBranchRepair = repairForcedBranchInBackground')
const branchRepairBodyCommit = campaignSource.indexOf(
  "ctx._fullContent = preserveNarrativeBodyAndSummary(ctx._fullContent ?? '')",
  branchRepairStart,
)
const branchRepairRequestLifecycle = campaignSource.slice(branchRepairStart, branchRepairBodyCommit)
assertOk(!/callAI|fetch\s*\(/.test(branchCommands), 'selecting a branch must not add a separate AI request')
assertOk(branchCommands.includes('orchestrator.resolveBranchChoice'), 'branch selection must hand the intent to the owning orchestrator')
assertOk(
  responseQuality.includes('validateIntentResolution(metadata.intentResolution, expectedIntentId)')
    && responseQuality.includes('当前命运意图要求完整语义数据与命运意图判定')
    && responseQuality.includes('canContinueWithNarrativeBody')
    && orchestratorSource.includes('当前没有玩家命运意图，禁止提交 intentResolution'),
  'active intent must require matching data while unsolicited intent state is rejected before writes',
)
assertOk(
  campaignSource.includes('preserveNarrativeBodyAndSummary(ctx._fullContent ?? \'\')')
    && campaignSource.includes("initialQuality.conditionalFailure !== 'intent'")
    && campaignSource.includes("requireBranch || typeof expectedIntentId === 'string'")
    && campaignSource.includes('保留完整正文，结构化状态保持待处理')
    && campaignSource.includes('buildNarrativeDataRepairInstruction')
    && campaignSource.includes('replaceTaggedMetaDataSection')
    && campaignSource.includes("callKind: 'narrative-data-repair'")
    && campaignSource.includes('repairForcedBranchInBackground')
    && campaignSource.includes('applyBackgroundForcedBranchRepair')
    && campaignSource.includes('tryBeginForcedBranchRepair')
    && campaignSource.includes('finishForcedBranchRepair')
    && campaignSource.includes("callKind: 'narrative-branch-repair'")
    && campaignSource.includes('narrativeBranchRepairPrompt')
    && preGenSource.includes('canContinueWithNarrativeBody(responseQuality, expectedIntentId)'),
  'conditional data must use narrow repair paths and preserve a completed body when repair still fails',
)
assertOk(
  branchRepairStart >= 0
    && branchRepairBodyCommit > branchRepairStart
    && branchRepairRequestLifecycle.includes('.finally(() => {')
    && branchRepairRequestLifecycle.includes('finishForcedBranchRepair(ownerToken)'),
  'the background request must own pending-state cleanup before later parsing or commit work can fail',
)
assertOk(
  campaignSource.includes('const scheduleForcedBranchRepair = (previousContent: string): void =>')
    && campaignSource.includes('scheduleForcedBranchRepair(previousContent)')
    && campaignSource.includes("if (repairedQuality.conditionalFailure === 'branch') {")
    && campaignSource.includes("scheduleForcedBranchRepair(ctx._fullContent ?? '')"),
  'a forced branch repair must be scheduled for both the initial usable body and a body recovered by format repair',
)
assertOk(
  orchestratorSource.includes('if (!forceBranch && lastEntry?.resolvedChoice)')
    && orchestratorSource.includes('else if (!forceBranch && this.shouldSuppressBranchPoint(false))')
    && orchestratorSource.includes('const roundExecutionToken = this.isPreviewExecution()'),
  'forced branches and preview execution must not inherit ordinary real-round suppression or ownership',
)
assertOk(
  orchestratorSource.indexOf('intentResolutionError') < orchestratorSource.indexOf("this.applyRoundChanges(effectiveParsed.changes, 'narrative')")
    && orchestratorSource.includes('branchIntents: this.branchIntents')
    && orchestratorSource.includes('intentResolution: committedIntentResolution'),
  'orchestrator must validate before state writes and persist accepted intent results in snapshot and narrative history',
)

if (failed > 0) process.exit(1)
console.log('PASS: branch-intent-resolution-smoke')
