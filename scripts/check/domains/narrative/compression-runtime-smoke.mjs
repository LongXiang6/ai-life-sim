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
import { buildRecentStoriesForRound } from '../../../../src/mods/mod-engine/helpers/recent-story-context.ts'
import { deriveSameRoundMemoryRetention, formatNarrativeTimelineForPrompt, projectSummaryToNarrativeTimeline } from '../../../../src/mods/mod-engine/helpers/timeline-memory.ts'
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

const firstRoundDateStory = {
  ...story(1),
  displayTimeLabel: '甲历1年1月1日',
}
const firstRoundDateInput = buildNarrativeStoryContinuityPromptInput({
  currentRound: 1,
  currentNarrative: firstRoundDateStory,
  narrativeHistory: [],
  compressedSummaries: summaryCompressor.getSummaries(),
  recentStories: buildRecentStoriesForRound({
    history: [],
    currentRound: 1,
    currentStory: {
      text: firstRoundDateStory.text,
      totalDays: firstRoundDateStory.totalDays,
      timeLabel: firstRoundDateStory.displayTimeLabel,
    },
  }),
})
const firstRoundCurrentSegment = JSON.parse(firstRoundDateInput.userSegments[2]).当前回合
assert.equal(
  firstRoundCurrentSegment.时间窗口,
  firstRoundCurrentSegment.当前时间,
  '首轮没有此前正文时，时间窗口必须直接等于当前时间，不得生成反向日期范围',
)

for (const currentRound of [1, 2, 3, 4, 5, 6]) {
  const recentStories = buildRecentStoriesForRound({
    history: history.slice(0, currentRound - 1),
    currentRound,
    currentStory: {
      text: history[currentRound - 1].text,
      totalDays: history[currentRound - 1].totalDays,
      timeLabel: history[currentRound - 1].displayTimeLabel,
    },
  })
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
    '最近四轮正文',
    '当前回合',
  ])
  assert.equal(
    JSON.parse(input.userSegments[1]).最近四轮正文.length,
    Math.min(currentRound - 1, 4),
    `第 ${currentRound} 轮应提供此前最多四轮完整正文`,
  )
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

const retentionEvents = [
  {
    id: 'round-memory:12:event:1',
    timeSpan: '甲历1年',
    occurrenceTime: '甲历1年·春',
    text: '侦查得到关键线索。',
    weight: 8,
  },
  {
    id: 'round-memory:12:event:2',
    timeSpan: '甲历1年',
    occurrenceTime: '甲历1年·春',
    text: '线索来自旧档案。',
    weight: 4,
  },
  {
    id: 'round-memory:12:event:3',
    timeSpan: '甲历1年',
    occurrenceTime: '甲历1年·春',
    text: '调查留下轻微伤势。',
    weight: 2,
  },
]
const retentionSourceSnapshot = structuredClone(retentionEvents)
assert.deepEqual(
  deriveSameRoundMemoryRetention(12, retentionEvents),
  [
    { causalGroupId: 'round-memory:12', retentionPriority: 8 },
    { causalGroupId: 'round-memory:12', retentionPriority: 7 },
    { causalGroupId: 'round-memory:12', retentionPriority: 6 },
  ],
  '同轮派生优先级应以最高原始权重为基准，低权重仅影响派生值',
)
assert.deepEqual(retentionEvents, retentionSourceSnapshot, '派生计算不得修改原始事件或原始权重')

const retentionSummary = {
  sourceRound: 12,
  createdRound: 13,
  content: '甲历1年：侦查得到关键线索。',
  memoryEvents: retentionEvents,
  rawCompressionResponse: '{}',
}
const retentionProjection = projectSummaryToNarrativeTimeline(retentionSummary)
assert.deepEqual(
  retentionProjection.map((entry) => [entry.text, entry.causalGroupId, entry.retentionPriority]),
  [
    ['侦查得到关键线索。', 'round-memory:12', 8],
    ['线索来自旧档案。', 'round-memory:12', 7],
    ['调查留下轻微伤势。', 'round-memory:12', 6],
  ],
  '摘要投影应按原事件顺序携带同轮派生元数据',
)
const lifecycleRetentionProjection = memoryLifecycle.buildNarrativeTimelineProjection(
  [],
  { summaries: [retentionSummary, {
    sourceRound: 13,
    createdRound: 14,
    content: '甲历2年：线索得到复核。',
    memoryEvents: [{
      id: 'round-memory:13:event:1',
      timeSpan: '甲历2年',
      occurrenceTime: '甲历2年·春',
      text: '线索得到复核。',
      weight: 3,
    }],
    rawCompressionResponse: '{}',
  }] },
  { closedContextIds: new Set() },
)
assert.deepEqual(
  lifecycleRetentionProjection.timelineEntries.map((entry) => entry.causalGroupId),
  ['round-memory:12', 'round-memory:12', 'round-memory:12', 'round-memory:13'],
  'MemoryLifecycle 时间轴投影应填充同轮因果组且不跨回合混组',
)
assert.deepEqual(
  lifecycleRetentionProjection.timelineEntries.map((entry) => entry.text),
  ['侦查得到关键线索。', '线索来自旧档案。', '调查留下轻微伤势。', '线索得到复核。'],
  '派生优先级不得重排回合与事件顺序',
)
const retentionPromptProjection = formatNarrativeTimelineForPrompt(
  lifecycleRetentionProjection.timelineEntries,
)
assert.equal(retentionPromptProjection.join('\n').includes('retentionPriority'), false, '内部派生字段不得进入主叙事文本')
assert.equal(retentionPromptProjection.join('\n').includes('causalGroupId'), false, '内部因果组字段不得进入主叙事文本')
assert.equal(retentionPromptProjection.length, 2, '同时间事件仍按既有格式合并，不新增展示行')

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
