/**
 * 命运分支意图：选择建档、持续推进、第二次结算判定与终态归档回归。
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import {
  buildNarrativeBranchIntentProjection,
  buildSettlementBranchIntentInstruction,
  commitBranchIntentResolution,
  createBranchIntentState,
  findMostRecentlyUpdatedBranchIntentId,
  isTerminalIntentStatus,
  rebuildBranchIntentsFromHistory,
  upsertBranchIntent,
  validateIntentResolution,
  validateIntentResolutionForState,
} from '../../../../src/mods/mod-engine/helpers/branch-intent-resolution.ts'
import {
  inspectNarrativeResponseQuality,
  inspectNarrativeSettlementQuality,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import {
  MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS,
} from '../../../../src/mods/mod-engine/helpers/mvp-runtime-policy.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

function dataLine(data) {
  return `⟦数据⟧${JSON.stringify(data)}`
}

function resolution(overrides = {}) {
  return {
    intentId: 'branch:north-route',
    feasibility: 'conditional',
    executionMode: 'progressive',
    status: 'progressing',
    riskLevel: 'high',
    progress: 35,
    blockers: ['北岸仍被封锁'],
    prerequisites: ['取得船队支持'],
    costs: ['暴露行踪'],
    timeHorizon: '仍需数月',
    reason: '已经获得盟友，但尚未突破封锁。',
    nextStep: '先让船队安全离港',
    ...overrides,
  }
}

function aiResolution(overrides = {}) {
  return {
    意图编号: '命运分支:north-route',
    可行性: '有条件',
    执行方式: '逐步执行',
    状态: '推进中',
    风险等级: '高',
    进度: 35,
    阻碍: ['北岸仍被封锁'],
    前置条件: ['取得船队支持'],
    代价: ['暴露行踪'],
    预计耗时: '仍需数月',
    判定理由: '已经获得盟友，但尚未突破封锁。',
    下一步: '先让船队安全离港',
    ...overrides,
  }
}

const firstIntent = createBranchIntentState('north-route', '驶入海雾寻找北岸航道', 4)
assertOk(
  firstIntent.intentId === 'branch:north-route'
    && firstIntent.createdRound === 4
    && firstIntent.updatedRound === 4,
  'a resolved branch choice must create one stable active intent',
)

const initial = upsertBranchIntent([], 'north-route', firstIntent.choice, 4)
const duplicate = upsertBranchIntent(initial.intents, 'north-route', firstIntent.choice, 5)
assertOk(
  initial.intents.length === 1
    && initial.focusedIntentId === firstIntent.intentId
    && duplicate.intents.length === 1
    && duplicate.intents[0]?.createdRound === 4,
  'reconfirming the same branch must refocus its existing intent without resetting progress history',
)

const second = upsertBranchIntent(initial.intents, 'harbor-alliance', '与港口船队结盟', 6)
assertOk(
  second.intents.length === 2
    && second.focusedIntentId === 'branch:harbor-alliance'
    && findMostRecentlyUpdatedBranchIntentId(second.intents) === 'branch:harbor-alliance',
  'a later branch must become focused without deleting another unfinished intent',
)

const narrativeProjection = buildNarrativeBranchIntentProjection(firstIntent, [second.intents[1]])
assertOk(
  narrativeProjection.当前意图?.意图编号 === '命运分支:north-route'
    && narrativeProjection.当前意图?.玩家选择 === firstIntent.choice
    && narrativeProjection.其他未完成意图?.[0]?.玩家选择 === second.intents[1]?.choice
    && !JSON.stringify(narrativeProjection).includes('命运意图判定'),
  'the first call must receive the complete raw player intent as structured data without settlement instructions',
)
const settlementInstruction = buildSettlementBranchIntentInstruction(firstIntent, [second.intents[1]])
assertOk(
  settlementInstruction.includes('【当前命运意图结算条件】')
    && settlementInstruction.includes(firstIntent.choice)
    && settlementInstruction.includes('只按最终叙事已经写成的实际执行结果结算')
    && settlementInstruction.includes('“命运意图判定”必须存在'),
  'the second call must settle the final story without reauthoring the player direction',
)

assertOk(!validateIntentResolution(resolution(), firstIntent.intentId), 'valid progressing intent metadata must pass')
for (const [candidate, expected] of [
  [undefined, '缺少'],
  [resolution({ intentId: 'branch:other' }), '必须为'],
  [resolution({ status: 'succeeded', progress: 90, nextStep: undefined }), '100'],
  [resolution({ status: 'progressing', progress: 100 }), '小于 100'],
  [resolution({ feasibility: 'impossible', status: 'progressing' }), 'failed'],
  [resolution({ status: 'blocked', feasibility: 'executable' }), 'blocked 或 conditional'],
  [resolution({ nextStep: undefined }), 'nextStep'],
]) {
  assertOk(
    validateIntentResolution(candidate, firstIntent.intentId)?.includes(expected),
    `invalid intent resolution must be rejected with ${expected}`,
  )
}
assertOk(
  isTerminalIntentStatus('succeeded')
    && isTerminalIntentStatus('partially_succeeded')
    && isTerminalIntentStatus('failed')
    && !isTerminalIntentStatus('progressing'),
  'only committed success, partial success and failure may close an intent',
)

const progressingCommit = commitBranchIntentResolution(
  initial.intents,
  firstIntent.intentId,
  resolution(),
  7,
)
assertOk(
  !progressingCommit.error
    && !progressingCommit.terminal
    && progressingCommit.intents[0]?.resolution?.progress === 35
    && progressingCommit.focusedIntentId === firstIntent.intentId,
  'a progressing resolution must update and retain the focused active intent',
)
assertOk(
  validateIntentResolutionForState(
    progressingCommit.intents[0],
    resolution({ progress: 20 }),
  )?.includes('不得低于'),
  'later settlement must not regress already committed intent progress',
)

const terminalResolution = resolution({
  feasibility: 'executable',
  executionMode: 'immediate',
  status: 'succeeded',
  progress: 100,
  blockers: [],
  prerequisites: [],
  costs: [],
  timeHorizon: '本轮完成',
  reason: '船队已经安全穿过封锁。',
  nextStep: undefined,
})
const terminalCommit = commitBranchIntentResolution(
  progressingCommit.intents,
  firstIntent.intentId,
  terminalResolution,
  8,
)
assertOk(
  !terminalCommit.error
    && terminalCommit.terminal
    && terminalCommit.intents.length === 0
    && terminalCommit.archivedIntents?.[0]?.lifecycle === 'terminal'
    && terminalCommit.archivedIntents[0].resolution?.progress === 100,
  'a valid terminal settlement must remove the active intent and retain a complete audit record',
)

const rebuilt = rebuildBranchIntentsFromHistory([
  {
    id: 'north-route',
    round: 4,
    resolvedChoiceRound: 4,
    resolvedChoice: firstIntent.choice,
  },
  { round: 7, intentResolution: resolution() },
  { round: 8, intentResolution: terminalResolution },
])
assertOk(
  rebuilt.intents.length === 0
    && rebuilt.archivedIntents?.[0]?.intentId === firstIntent.intentId
    && rebuilt.archivedIntents[0].resolution?.status === 'succeeded',
  'complete narrative history must deterministically rebuild terminal intent audit state',
)

const firstResponse = '⟦正文⟧你和阿禾借着潮声驶入海雾，旧桥的灯在身后逐渐熄灭。'
const parsedFirst = inspectNarrativeResponseQuality(firstResponse, 500).parsed
const settlementData = {
  摘要: '你与阿禾进入海雾，北岸航道目标取得阶段性进展。',
  重要程度: '高',
  情节状态: '进行中',
  语义信号: {
    事件类型: '旅程',
    冲突强度: 45,
    张力变化: 4,
    行动规模: '中',
    不可逆: true,
    影响范围: '关系圈',
    叙事语域: '命运',
    语域理由: '驶入海雾使北岸航道目标进入不可逆的新阶段。',
    情节类型: '旅程',
  },
  命运意图判定: aiResolution(),
}
assertOk(
  inspectNarrativeSettlementQuality({
    content: dataLine(settlementData),
    narrative: parsedFirst,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS],
    expectedIntentId: firstIntent.intentId,
  }).valid,
  'the second call must accept a complete matching intent resolution',
)
assertOk(
  !inspectNarrativeSettlementQuality({
    content: dataLine({ ...settlementData, 命运意图判定: undefined }),
    narrative: parsedFirst,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS],
    expectedIntentId: firstIntent.intentId,
  }).valid,
  'the second call must reject an omitted resolution while an intent is focused',
)
assertOk(
  !inspectNarrativeSettlementQuality({
    content: dataLine({
      ...settlementData,
      命运意图判定: aiResolution({ 意图编号: '命运分支:other' }),
    }),
    narrative: parsedFirst,
    allowedEvidenceEventIds: [],
    allowedSubsystemIds: [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS],
    expectedIntentId: firstIntent.intentId,
  }).valid,
  'the second call must reject a resolution for any non-focused intent',
)

const campaignSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/campaigns/default/index.ts'),
  'utf8',
)
const preGenSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/pre-gen-queue.ts'),
  'utf8',
)
const storeSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/store.ts'),
  'utf8',
)
const orchestratorSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
)
assertOk(
  campaignSource.includes('const focusedIntent = orchestrator.getFocusedBranchIntent()')
    && campaignSource.includes('buildSettlementBranchIntentInstruction(')
    && campaignSource.includes('expectedIntentId: focusedIntent?.intentId')
    && campaignSource.includes('buildNarrativeSettlementPromptInput({')
    && campaignSource.includes("name: 'ai-data-analysis'"),
  'the active intent must be evaluated in the background data-analysis call',
)
assertOk(
  orchestratorSource.includes('buildNarrativeBranchIntentProjection(')
    && !orchestratorSource.includes('buildSettlementBranchIntentInstruction('),
  'the orchestrator must send only the structured player branch projection to the first call',
)
assertOk(
  preGenSource.includes('inspectNarrativeResponseQuality(fullContent, wordCountTarget)')
    && !preGenSource.includes('inspectNarrativeSettlementQuality')
    && !preGenSource.includes('intentResolution'),
  'pre-generation must cache only the first strict response and defer intent settlement to real consumption',
)
for (const retiredMarker of [
  'branchRepairPending',
  'canContinueWithNarrativeBody',
  'buildNarrativeDataRepairInstruction',
  'preserveNarrativeBodyAndSummary',
  'replaceTaggedMetaDataSection',
  'narrativeBranchRepairOutputSchema',
]) {
  assertOk(
    !campaignSource.includes(retiredMarker)
      && !preGenSource.includes(retiredMarker)
      && !storeSource.includes(retiredMarker)
      && !orchestratorSource.includes(retiredMarker),
    `retired branch or data repair path remains: ${retiredMarker}`,
  )
}

if (failed > 0) process.exit(1)
console.log('PASS: branch-intent-resolution-smoke')
