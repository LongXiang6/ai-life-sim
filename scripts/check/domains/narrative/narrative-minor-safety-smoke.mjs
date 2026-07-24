#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { useCharacterStore } from '../../../../src/mods/mod-character/store.ts'
import { resolveNarrativeBranchChoice } from '../../../../src/mods/mod-engine/helpers/branch-commands.ts'
import {
  isDisallowedMinorSexualContent,
  MINOR_SEXUAL_CONTENT_REJECTION_MESSAGE,
} from '../../../../src/mods/mod-engine/helpers/narrative-safety.ts'
import { useEngineStore } from '../../../../src/mods/mod-engine/store.ts'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const restrictedChoice = '要求当前未成年角色参与性行为'
const safeChoice = '和同龄朋友一起参加夏令营'

assert.equal(isDisallowedMinorSexualContent(restrictedChoice, 16), true)
assert.equal(
  isDisallowedMinorSexualContent(restrictedChoice, 18),
  true,
  '文本显式指向未成年人时仍必须拒绝',
)
assert.equal(isDisallowedMinorSexualContent('当前成年角色参与性行为', 18), false)
assert.equal(isDisallowedMinorSexualContent(safeChoice, 16), false)

useEngineStore.getState().reset()
useCharacterStore.setState({ age: 16 })
useEngineStore.setState({
  narrativeHistory: [{
    id: 'safety-branch',
    text: '你需要选择下一步的行动。',
    isComplete: true,
    isBranchPoint: true,
    branchOptions: [safeChoice],
    timestamp: 1,
  }],
  narrativeError: null,
})
assert.equal(resolveNarrativeBranchChoice('safety-branch', restrictedChoice), false)
assert.equal(useEngineStore.getState().narrativeHistory[0].resolvedChoice, undefined)
assert.equal(useEngineStore.getState().branchIntents.length, 0)
assert.equal(useEngineStore.getState().narrativeError, MINOR_SEXUAL_CONTENT_REJECTION_MESSAGE)

const streamed = []
const streamingRuntime = new OrchestratorSystem()
streamingRuntime.onStream((chunk) => streamed.push(chunk))
streamingRuntime.appendNarrativeChunk('⟦正文⟧\n未成年角色在夏令营和同龄朋友完成了全天的集体活动。')
assert.equal(
  streamed.some((chunk) => chunk.text.includes('集体活动')),
  true,
  '测试必须先覆盖已有局部正文可见的真实流式路径',
)
streamingRuntime.appendNarrativeChunk('随后被要求参与性行为。')
assert.equal(streamed.some((chunk) => chunk.text.includes('性行为')), false)
assert.equal(
  streamed.some((chunk) => chunk.isReset === true),
  true,
  '流式违规内容必须立即清空已显示的局部正文',
)

const commitRuntime = new OrchestratorSystem()
assert.throws(
  () => commitRuntime.handleNarrativeResponse([
    '⟦正文⟧',
    restrictedChoice,
    '⟦结束⟧',
  ].join('\n')),
  (error) => error instanceof Error
    && error.name === 'NarrativeSafetyRejectedError'
    && error.message === MINOR_SEXUAL_CONTENT_REJECTION_MESSAGE,
)
assert.equal(commitRuntime.getState().narrativeHistory.length, 0)
assert.equal(commitRuntime.getState().storyRepetitionStats.rounds, 0)

const branchHookSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-pages/pages/game-story/useSimulationBranch.ts'),
  'utf8',
)
const confirmStart = branchHookSource.indexOf('const handleBranchConfirm')
assert.ok(
  branchHookSource.indexOf('resolveNarrativeBranchChoice(branchId, choice)', confirmStart)
    < branchHookSource.indexOf('reportUsageMetric({', confirmStart),
  '分支词项日志只能在选择通过安全与状态门禁后上报',
)

useEngineStore.getState().reset()
console.log('[narrative-minor-safety-smoke] PASS')
