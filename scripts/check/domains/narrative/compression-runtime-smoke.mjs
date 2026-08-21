/**
 * Purpose: Regress the single-round sliding story-continuity contract.
 * Owner: quality:narrative
 * Responsibility: 02 message order, retry-window selection, unique source commits, and story projection only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'
import { buildNarrativeStoryContinuityPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-story-continuity-context.ts'
import { NarrativeAIStoryContinuityDataSchema } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { summaryCompressor } from '../../../../src/mods/mod-engine/subsystems/summary-compressor-system.ts'
import { memoryLifecycle } from '../../../../src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'
import { buildPromptTimelineMemoryRuntime } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system/timeline-projection-runtime.ts'

const root = getProjectRoot(import.meta.url)

function story(round) {
  return {
    id: `story-${round}`,
    text: `第${round}轮完整故事。`,
    isComplete: true,
    timestamp: round,
    contextId: 'world-a',
    contextName: '甲世界',
    displayAge: round,
    displayTimeLabel: `甲历${round}年`,
    totalDays: round * 365,
    transitionAudit: {
      schemaVersion: 1,
      round,
      requestedChangeCount: 0,
      committedChangeCount: 0,
      before: {},
      after: {},
    },
  }
}

function compressionResult(sourceRound) {
  return NarrativeAIStoryContinuityDataSchema.parse({
    本轮记忆: [{
      时间: `甲历${sourceRound}年`,
      事实: `第${sourceRound}轮连续事实。`,
      权重: 6,
    }],
    未来事件: [`甲历${sourceRound + 1}年：复核第${sourceRound}轮结果。`],
  })
}

summaryCompressor.reset()
const history = Array.from({ length: 6 }, (_, index) => story(index + 1))

for (const currentRound of [1, 2, 3, 4, 5, 6]) {
  const recentStories = history.slice(Math.max(0, currentRound - 3), currentRound).map((entry) => ({
    回合: entry.transitionAudit.round,
    规范时间: { 总天数: entry.totalDays, 时间标签: entry.displayTimeLabel },
    故事全文: entry.text,
  }))
  const input = buildNarrativeStoryContinuityPromptInput({
    currentRound,
    currentNarrative: history[currentRound - 1],
    narrativeHistory: history.slice(0, currentRound - 1),
    compressedSummaries: summaryCompressor.getSummaries(),
    recentStories,
  })
  assert.equal(input.sourceRound, currentRound)
  assert.equal(input.sourceNarrative.text, `第${currentRound}轮完整故事。`)
  assert.equal(input.userSegments.length, 3)
  assert.deepEqual(input.userSegments.map((segment) => Object.keys(JSON.parse(segment))[0]), [
    '历史记忆',
    '最近两轮正文',
    '当前回合',
  ])
  assert.deepEqual(Object.keys(JSON.parse(input.userSegments[2]).当前回合), ['当前时间', '时间窗口', '正文'])
  assert(!input.userSegments.some((segment) => /⟦[^⟧]+⟧/u.test(segment)))

  const prepared = summaryCompressor.prepareRoundContinuity({
    currentRound,
    sourceRound: input.sourceRound,
    sourceNarrative: input.sourceNarrative,
    result: compressionResult(currentRound),
    rawResponse: JSON.stringify(compressionResult(currentRound)),
  })
  assert.equal(prepared.didCompress, true)
  await summaryCompressor.commitPreparedRoundContinuity(prepared, 'life-memory-smoke')
}

assert.deepEqual(
  summaryCompressor.getSummaries().summaries.map((summary) => summary.sourceRound),
  [1, 2, 3, 4, 5, 6],
  '每个完成回合必须形成一条带权重的逐轮连续记忆',
)
assert.deepEqual(summaryCompressor.getStats(), {
  compressedRoundCount: 6,
  lastSourceRound: 6,
  lastCompletedAt: summaryCompressor.getStats().lastCompletedAt,
})
assert(summaryCompressor.getStats().lastCompletedAt > 0)

summaryCompressor.reset()
for (const currentRound of [1, 2, 3]) {
  const recentStories = history.slice(0, currentRound).map((entry) => ({
    回合: entry.transitionAudit.round,
    规范时间: { 总天数: entry.totalDays, 时间标签: entry.displayTimeLabel },
    故事全文: entry.text,
  }))
  const input = buildNarrativeStoryContinuityPromptInput({
    currentRound,
    currentNarrative: history[currentRound - 1],
    narrativeHistory: history.slice(0, currentRound - 1),
    compressedSummaries: summaryCompressor.getSummaries(),
    recentStories,
  })
  assert.equal(input.sourceRound, 1, `第 ${currentRound} 轮必须继续处理失败来源 1`)
  const prepared = summaryCompressor.prepareRoundContinuity({
    currentRound,
    sourceRound: input.sourceRound,
    sourceNarrative: input.sourceNarrative,
    result: currentRound < 3 ? null : compressionResult(1),
    rawResponse: '',
  })
  await summaryCompressor.commitPreparedRoundContinuity(prepared, 'life-memory-retry-smoke')
}
assert.deepEqual(
  summaryCompressor.getSummaries().summaries.map((summary) => summary.sourceRound),
  [1],
  '失败来源必须在两个后续详细窗口回合内保持可重试，并只在成功后写入摘要',
)
const fourthRecentStories = history.slice(1, 4).map((entry) => ({
  回合: entry.transitionAudit.round,
  规范时间: { 总天数: entry.totalDays, 时间标签: entry.displayTimeLabel },
  故事全文: entry.text,
}))
const fourthInput = buildNarrativeStoryContinuityPromptInput({
  currentRound: 4,
  currentNarrative: history[3],
  narrativeHistory: history.slice(0, 3),
  compressedSummaries: summaryCompressor.getSummaries(),
  recentStories: fourthRecentStories,
})
assert.equal(fourthInput.sourceRound, 2, '旧来源成功后必须继续处理详细窗口中最早未压缩正文')

summaryCompressor.reset()
for (const currentRound of [1, 2, 3, 4, 5, 6]) {
  const prepared = summaryCompressor.prepareRoundContinuity({
    currentRound,
    sourceRound: currentRound,
    sourceNarrative: history[currentRound - 1],
    result: compressionResult(currentRound),
    rawResponse: JSON.stringify(compressionResult(currentRound)),
  })
  await summaryCompressor.commitPreparedRoundContinuity(prepared, 'life-memory-smoke')
}

assert.throws(() => summaryCompressor.prepareRoundContinuity({
  currentRound: 6,
  sourceRound: 6,
  sourceNarrative: history[5],
  result: compressionResult(6),
  rawResponse: JSON.stringify(compressionResult(6)),
}), /已经存在逐轮连续记忆/u)

const fakeOrchestrator = {
  state: {
    totalRounds: 6,
    narrativeHistory: history,
    characterCreations: [],
  },
  worldSetting: { contextId: 'world-a', name: '甲世界' },
  getNarrativeScopeView: () => ({
    currentContextId: 'world-a',
    closedContextIds: new Set(),
  }),
  getRuntimeDependencies: () => ({ memoryLifecycle, summaryCompressor }),
  projectNarrativeHistoryEntry: (entry, round) => ({
    timeSpan: entry.displayTimeLabel,
    occurrenceTime: entry.displayTimeLabel,
    text: entry.text,
    sortRound: round,
    sortTotalDays: entry.totalDays,
  }),
  resolveNarrativeRoundTime: () => undefined,
}
const promptMemory = buildPromptTimelineMemoryRuntime(fakeOrchestrator)
assert(promptMemory)
for (const sourceRound of [1, 2, 3, 4, 5, 6]) {
  assert(promptMemory.some((entry) => entry.includes(`第${sourceRound}轮连续事实`)))
  assert(!promptMemory.some((entry) => entry.includes(`第${sourceRound}轮完整故事`)))
}
assert.equal(summaryCompressor.getSummaries().summaries[0].memoryEvents[0].weight, 6)

const removedPaths = [
  'src/app/api/narrative-memory/route.ts',
  'src/core/storage/narrative-memory-store.ts',
  'src/core/storage/narrative-memory-policy.ts',
  'src/mods/mod-engine/helpers/digest-ledger.ts',
  'src/mods/mod-engine/subsystems/orchestrator-system/memory-recall-runtime.ts',
]
for (const relativePath of removedPaths) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} 必须保持删除`)
}

const activeMemorySources = [
  readModuleSource('src/foundation/types/narrative/memory.ts', root),
  readModuleSource('src/mods/mod-engine/subsystems/summary-compressor-system.ts', root),
  readModuleSource('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts', root),
  readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system/timeline-projection-runtime.ts', root),
].join('\n')
for (const retiredToken of [
  'initialWeight',
  'currentWeight',
  'weightAnchorRound',
  'selectLeafSummaries',
  'coveredRanges',
  'narrative-memory-store',
  'memory-recall-runtime',
]) {
  assert.equal(activeMemorySources.includes(retiredToken), false, `活动记忆路径不得残留 ${retiredToken}`)
}

summaryCompressor.reset()
console.log('PASS: compression-runtime-smoke')
