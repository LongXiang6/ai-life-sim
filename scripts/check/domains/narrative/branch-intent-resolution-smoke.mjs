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
      entities: [],
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

const branchCommands = read('src/mods/mod-engine/helpers/branch-commands.ts')
const responseQuality = read('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const orchestratorSource = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
assertOk(!/callAI|fetch\s*\(/.test(branchCommands), 'selecting a branch must not add a separate AI request')
assertOk(branchCommands.includes('orchestrator.resolveBranchChoice'), 'branch selection must hand the intent to the owning orchestrator')
assertOk(
  responseQuality.includes('当前没有玩家命运意图，禁止生成命运意图判定')
    && responseQuality.includes('validateIntentResolution(metadata.intentResolution, expectedIntentId)'),
  'main quality gate must require matching intentResolution and reject unsolicited intent state',
)
assertOk(
  orchestratorSource.indexOf('intentResolutionError') < orchestratorSource.indexOf("this.applyRoundChanges(effectiveParsed.changes, 'narrative')")
    && orchestratorSource.includes('branchIntents: this.branchIntents')
    && orchestratorSource.includes('intentResolution: committedIntentResolution'),
  'orchestrator must validate before state writes and persist accepted intent results in snapshot and narrative history',
)

if (failed > 0) process.exit(1)
console.log('PASS: branch-intent-resolution-smoke')
