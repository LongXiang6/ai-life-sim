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
  inspectNarrativeResponseQuality,
  preserveNarrativeBodyAndSummary,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
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
  forcedEntry?.id
    && forcedRuntime.applyBackgroundForcedBranchRepair(forcedEntry.id, forcedBranchRepairData),
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
    && campaignSource.includes('canContinueWithNarrativeBody(initialQuality, expectedIntentId, requireBranch)')
    && campaignSource.includes('if (!repairedQuality.valid && requireBranch)')
    && campaignSource.includes('保留完整正文，结构化状态保持待处理')
    && campaignSource.includes('repairForcedBranchInBackground')
    && campaignSource.includes('applyBackgroundForcedBranchRepair')
    && campaignSource.includes('setBranchRepairPending(true)')
    && campaignSource.includes("callKind: 'narrative-branch-repair'")
    && campaignSource.includes('narrativeBranchRepairPrompt')
    && preGenSource.includes('canContinueWithNarrativeBody(responseQuality, expectedIntentId)'),
  'main rounds must deliver any complete body and repair a forced branch through its compact background contract',
)
assertOk(
  branchRepairStart >= 0
    && branchRepairBodyCommit > branchRepairStart
    && branchRepairRequestLifecycle.includes('.finally(() => {')
    && branchRepairRequestLifecycle.includes('setBranchRepairPending(false)'),
  'the background request must own pending-state cleanup before later parsing or commit work can fail',
)
assertOk(
  orchestratorSource.indexOf('intentResolutionError') < orchestratorSource.indexOf("this.applyRoundChanges(effectiveParsed.changes, 'narrative')")
    && orchestratorSource.includes('branchIntents: this.branchIntents')
    && orchestratorSource.includes('intentResolution: committedIntentResolution'),
  'orchestrator must validate before state writes and persist accepted intent results in snapshot and narrative history',
)

if (failed > 0) process.exit(1)
console.log('PASS: branch-intent-resolution-smoke')
