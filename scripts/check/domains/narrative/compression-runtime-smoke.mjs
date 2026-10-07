/**
 * Purpose: Regress five-round story-continuity cadence and recent-memory retention.
 * Owner: quality:narrative
 * Responsibility: Threshold, batch selection, failure retry, unique commit, and five-round recent projection.
 */

import assert from 'node:assert/strict'

import { buildAllStoriesForRound } from '../../../../src/mods/mod-engine/helpers/recent-story-context.ts'
import { buildNarrativeStoryContinuityPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-story-continuity-context.ts'
import { NarrativeAIStoryContinuityDataSchema } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { summaryCompressor } from '../../../../src/mods/mod-engine/subsystems/summary-compressor-system.ts'

function story(round) {
  return {
    id: `story-${round}`,
    text: `第${round}轮完整故事。`,
    isComplete: true,
    timestamp: round,
    contextId: 'world-a',
    displayAge: round,
    displayTimeLabel: `甲历${round}年`,
    totalDays: round * 365,
    totalBasePoints: round * 1000,
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

function projections(history, currentRound) {
  const current = history[currentRound - 1]
  return buildAllStoriesForRound({
    history: history.slice(0, currentRound - 1),
    currentRound,
    currentStory: {
      text: current.text,
      totalDays: current.totalDays,
      totalBasePoints: current.totalBasePoints,
      timeLabel: current.displayTimeLabel,
    },
  })
}

function compressionResult(rounds) {
  return NarrativeAIStoryContinuityDataSchema.parse({
    本轮剧情: rounds.map((round) => ({
      来源回合: round,
      时间: `甲历${round}年`,
      剧情: `第${round}轮长期事实。`,
      权重: 6,
    })),
    未来事件: [`甲历${rounds.at(-1) + 1}年：复核批次结果。`],
  })
}

summaryCompressor.reset()
const history = Array.from({ length: 16 }, (_, index) => story(index + 1))

for (const currentRound of [1, 5, 10]) {
  const input = buildNarrativeStoryContinuityPromptInput({
    currentRound,
    currentNarrative: history[currentRound - 1],
    narrativeHistory: history.slice(0, currentRound - 1),
    compressedSummaries: summaryCompressor.getSummaries(),
    compressionStats: summaryCompressor.getStats(),
    recentStories: projections(history, currentRound),
  })
  assert.equal(input, undefined, `第${currentRound}轮不应触发故事连续性调用`)
}

const round11Input = buildNarrativeStoryContinuityPromptInput({
  currentRound: 11,
  currentNarrative: history[10],
  narrativeHistory: history.slice(0, 10),
  compressedSummaries: summaryCompressor.getSummaries(),
  compressionStats: summaryCompressor.getStats(),
  recentStories: projections(history, 11),
})
assert(round11Input)
assert.deepEqual(round11Input.sourceRounds, [1, 2, 3, 4, 5])
assert.deepEqual(JSON.parse(round11Input.userSegments[2]), {
  压缩范围: { 起始回合: 1, 结束回合: 5, 时间窗口: '甲历1年至甲历5年' },
  当前调用时间: '甲历11年',
})
assert.deepEqual(
  JSON.parse(round11Input.userSegments[1]).待压缩五轮正文.map((item) => item.轮次),
  [1, 2, 3, 4, 5],
)

const firstPrepared = summaryCompressor.prepareRoundContinuity({
  currentRound: 11,
  sourceRounds: round11Input.sourceRounds,
  sourceNarratives: round11Input.sourceNarratives,
  result: compressionResult(round11Input.sourceRounds),
  rawResponse: JSON.stringify(compressionResult(round11Input.sourceRounds)),
})
await summaryCompressor.commitPreparedRoundContinuity(firstPrepared, 'five-round-smoke')
assert.deepEqual(summaryCompressor.getSummaries().summaries.map((item) => item.sourceRound), [1, 2, 3, 4, 5])
assert.equal(summaryCompressor.getStats().compressedRoundCount, 5)
assert.equal(summaryCompressor.getStats().lastSourceRound, 5)

const mainRecent = projections(history, 16).slice(-5)
assert.deepEqual(mainRecent.map((item) => item.回合), [12, 13, 14, 15, 16])

const round16Input = buildNarrativeStoryContinuityPromptInput({
  currentRound: 16,
  currentNarrative: history[15],
  narrativeHistory: history.slice(0, 15),
  compressedSummaries: summaryCompressor.getSummaries(),
  compressionStats: summaryCompressor.getStats(),
  recentStories: projections(history, 16),
})
assert(round16Input)
assert.deepEqual(round16Input.sourceRounds, [6, 7, 8, 9, 10])
assert.deepEqual(JSON.parse(round16Input.userSegments[2]), {
  压缩范围: { 起始回合: 6, 结束回合: 10, 时间窗口: '甲历6年至甲历10年' },
  当前调用时间: '甲历16年',
})

const failedPrepared = summaryCompressor.prepareRoundContinuity({
  currentRound: 16,
  sourceRounds: round16Input.sourceRounds,
  sourceNarratives: round16Input.sourceNarratives,
  result: null,
  rawResponse: '',
})
await summaryCompressor.commitPreparedRoundContinuity(failedPrepared, 'five-round-smoke')
assert.equal(summaryCompressor.getSummaries().summaries.length, 5)
assert.equal(summaryCompressor.getStats().lastAttemptRound, 16)

const skippedRetry = buildNarrativeStoryContinuityPromptInput({
  currentRound: 17,
  currentNarrative: story(17),
  narrativeHistory: [...history, story(17)],
  compressedSummaries: summaryCompressor.getSummaries(),
  compressionStats: summaryCompressor.getStats(),
  recentStories: projections([...history, story(17)], 17),
})
assert.equal(skippedRetry, undefined, '失败批次未到五轮 cadence 时不得重复调用')

summaryCompressor.reset()
console.log('PASS: compression-runtime-smoke')
