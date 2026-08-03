/**
 * Purpose: Regress narrative compression gating, weighted retention, coverage, and retries.
 * Owner: quality:narrative
 * Responsibility: One shared-ledger compression runtime scenario only.
 * Coverage:
 *   1. 主叙事最低成功允许省略 digest；可选 keyEvents 一旦出现仍必须带 importance；
 *   2. 摘要账本实际按权重保留高分事件、折叠低分事件；
 *   3. L1 延迟窗口的首个覆盖区间与近期事实窗口不能产生空洞；
 *   4. 摘要必须带完整覆盖标记，任何层级失败时不得伪造覆盖节点或成功统计。
 *
 * 该脚本不调用外部 AI，只验证进入运行时后的结构与调度契约。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import {
  NarrativeRoundMetadataSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'
import {
  digestLedger,
} from '../../../../src/mods/mod-engine/helpers/digest-ledger.ts'
import {
  TimelineCompressionOutputSchema,
  buildCompressedMemoryEvents,
} from '../../../../src/mods/mod-engine/helpers/timeline-memory.ts'
import {
  buildTimelineCompressionPrompt,
} from '../../../../src/mods/mod-engine/prompts/summary-prompt.ts'
import {
  CompressionGateError,
  runCompressionGate,
} from '../../../../src/mods/mod-engine/helpers/compression-gate.ts'
import {
  NarrativeBackgroundResultInbox,
  createNarrativeBackgroundInputHash,
} from '../../../../src/mods/mod-engine/helpers/narrative-background-result-inbox.ts'
import { readModuleSource } from '../../lib/read-module-source.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

const constantsSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/constants.ts'),
  'utf8',
)
const readNumericConstant = (name) => {
  const match = constantsSource.match(new RegExp(`export const ${name} = (\\d+)`))
  if (!match) throw new Error(`missing numeric constant ${name}`)
  return Number(match[1])
}
const SUMMARY_INTERVAL = readNumericConstant('SUMMARY_INTERVAL')
const COMPRESS_L1_DELAY_BLOCKS = readNumericConstant('COMPRESS_L1_DELAY_BLOCKS')
const recentWindowExpression = constantsSource.match(
  /export const RECENT_NARRATIVE_WINDOW = SUMMARY_INTERVAL/,
)
if (!recentWindowExpression) throw new Error('RECENT_NARRATIVE_WINDOW must stay fixed at one L1 block')
const RECENT_NARRATIVE_WINDOW = SUMMARY_INTERVAL

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}

let notDueAttempted = false
const notDueResult = await runCompressionGate({
  due: false,
  attempt: async () => {
    notDueAttempted = true
    return 'unexpected'
  },
})
assertOk(
  notDueResult.status === 'not-due'
    && notDueResult.attemptsStarted === 0
    && !notDueAttempted,
  'compression not due must succeed without starting an AI attempt',
)

const firstAttemptResult = await runCompressionGate({
  due: true,
  attempt: async ({ attempt }) => `candidate-${attempt}`,
})
assertOk(
  firstAttemptResult.result === 'candidate-1'
    && firstAttemptResult.attemptsStarted === 1
    && firstAttemptResult.retryAttemptsStarted === 0,
  'compression first-attempt success must return one candidate without retries',
)

let losingRetryAborted = false
const retryRaceResult = await runCompressionGate({
  due: true,
  attempt: async ({ attempt, signal }) => {
    if (attempt === 1) throw new Error('initial failure')
    if (attempt === 2) return 'retry-winner'
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve('late-retry'), 50)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        losingRetryAborted = true
        reject(new Error('retry lost race'))
      }, { once: true })
    })
  },
})
assertOk(
  retryRaceResult.result === 'retry-winner'
    && retryRaceResult.attemptsStarted === 3
    && retryRaceResult.retryAttemptsStarted === 2
    && losingRetryAborted,
  'compression failure must start exactly two concurrent retries and adopt only the first legal candidate',
)

let compressionFailure
try {
  await runCompressionGate({
    due: true,
    attempt: async ({ attempt }) => { throw new Error(`failure-${attempt}`) },
  })
} catch (error) {
  compressionFailure = error
}
assertOk(
  compressionFailure instanceof CompressionGateError
    && compressionFailure.attemptsStarted === 3
    && compressionFailure.retryErrors.length === 2,
  'compression must block after the initial attempt and both concurrent retries fail',
)

const inbox = new NarrativeBackgroundResultInbox()
const identityFor = (roundSequence, story) => ({
  schemaVersion: 1,
  kind: 'data-analysis',
  lifeRunId: 'life-run:inbox-test',
  roundSequence,
  narrativeId: `narrative:inbox-test:${roundSequence}`,
  inputHash: createNarrativeBackgroundInputHash('data-analysis', [story]),
})
const firstIdentity = identityFor(1, '第一轮完整输入')
const secondIdentity = identityFor(2, '第二轮完整输入')
assertOk(
  inbox.register(firstIdentity) === 'registered'
    && inbox.register(secondIdentity) === 'registered'
    && inbox.register(firstIdentity) === 'duplicate-registration'
    && inbox.register({ ...firstIdentity, inputHash: 'fnv1a-00000000' }) === 'identity-mismatch',
  'background inbox must reject duplicate keys with a different input hash while recognizing exact duplicate registration',
)
assertOk(
  inbox.succeed(secondIdentity, { changes: ['round-2'] }) === 'accepted'
    && inbox.drainTerminal('data-analysis', firstIdentity.lifeRunId).length === 0,
  'background inbox must hold a later completed round until the earlier round reaches a terminal state',
)
assertOk(
  inbox.succeed({ ...firstIdentity, inputHash: 'fnv1a-ffffffff' }, { changes: [] }) === 'identity-mismatch'
    && inbox.succeed(firstIdentity, { changes: ['round-1'] }) === 'accepted'
    && inbox.succeed(firstIdentity, { changes: ['duplicate'] }) === 'duplicate-terminal-result',
  'background inbox must reject wrong-hash and duplicate terminal results',
)
const drainedInboxRecords = inbox.drainTerminal('data-analysis', firstIdentity.lifeRunId)
assertOk(
  drainedInboxRecords.length === 2
    && drainedInboxRecords[0]?.identity.roundSequence === 1
    && drainedInboxRecords[1]?.identity.roundSequence === 2,
  'background inbox must consume cross-round terminal results in deterministic source order',
)

const validMetadata = {
  importance: 'NORMAL',
  digest: '你在雨夜接住了失散的孩子。',
  keyEvents: [{
    text: '你救下失散的孩子',
    importance: 86,
    entities: ['孩子', '渡口'],
  }],
  arcStatus: 'ongoing',
  semanticSignals: {
    eventType: 'relationship',
    conflictIntensity: 24,
    tensionDelta: 3,
    actionScale: 'medium',
    irreversible: false,
    impactScope: 'relationship',
    narrativeRegister: 'life',
    registerReason: '一次改变关系的具体相遇',
    arcType: 'relationship',
    relationshipUpdates: [],
    resolvedForeshadowingIds: [],
  },
}

assertOk(
  NarrativeRoundMetadataSchema.safeParse(validMetadata).success,
  'valid event-recognition metadata may include digest and weighted keyEvents',
)

assertOk(
  NarrativeRoundMetadataSchema.safeParse({ digest: '你平稳度过了这一轮。' }).success,
  'minimum body-summary success must be able to record digest without invented weights or entities',
)

const missingDigest = structuredClone(validMetadata)
delete missingDigest.digest
assertOk(
  NarrativeRoundMetadataSchema.safeParse(missingDigest).success,
  'the independently extracted round digest is optional when the body is complete',
)

const missingWeight = structuredClone(validMetadata)
delete missingWeight.keyEvents[0].importance
assertOk(
  !NarrativeRoundMetadataSchema.safeParse(missingWeight).success,
  'keyEvents without per-event importance must fail the active META schema',
)

digestLedger.reset()
digestLedger.record({
  round: 1,
  importance: 'LOW',
  digest: '平静的一天。',
  keyEvents: [{ text: '你整理了屋舍', importance: 12, entities: ['屋舍'] }],
})
digestLedger.record({
  round: 2,
  importance: 'HIGH',
  digest: '你在渡口救下孩子。',
  keyEvents: [{ text: '你救下失散的孩子', importance: 92, entities: ['孩子', '渡口'] }],
})
const timelineEvents = digestLedger.selectForNarrativeTimeline(2)
assertOk(
  timelineEvents.some((event) => event.text.includes('你救下失散的孩子'))
    && timelineEvents.every((event) => (
      !Object.hasOwn(event, 'effective')
      && !Object.hasOwn(event, 'weight')
      && !Object.hasOwn(event, 'importance')
    )),
  'high-importance events must remain visible without exposing internal weights to the narrative prompt',
)
assertOk(
  !timelineEvents.some((event) => event.text.includes('你整理了屋舍')),
  'low-value events must leave the always-on prompt while remaining in the ledger',
)
const recentFacts = digestLedger.selectRecentFactsForNarrativeTimeline(2, RECENT_NARRATIVE_WINDOW)
assertOk(
  recentFacts.some((event) => event.text === '你整理了屋舍')
    && recentFacts.some((event) => event.text === '你救下失散的孩子')
    && !recentFacts.some((event) => event.text === '平静的一天。'),
  'recent prompt memory must use complete structured facts without duplicating the digest when key events exist',
)
assertOk(
  digestLedger.selectForNarrativeTimeline(2, undefined, undefined, { excludeRoundsAtOrAfter: 1 }).length === 0,
  'events already covered by the recent fact window must not be sent twice',
)
assertOk(
  digestLedger.averageAdjustedImportance(1, 2) !== null,
  'summary budgeting must be able to read the ledger importance average',
)
for (let round = 3; round <= 522; round++) {
  digestLedger.record({
    round,
    digest: `第${round}轮摘要`,
    keyEvents: [{ text: `第${round}轮事件`, importance: 10, entities: [`实体${round}`] }],
  })
}
assertOk(
  digestLedger.getEntries().length === 522,
  'long-session digest ledger must retain every recorded round instead of applying a capacity cut',
)
const fourCompletedRounds = digestLedger.selectRecentFactsForNarrativeTimeline(522, RECENT_NARRATIVE_WINDOW)
assertOk(
  fourCompletedRounds.length === 4
    && fourCompletedRounds[0]?.round === 519
    && fourCompletedRounds[3]?.round === 522,
  'the recent fact window must contain exactly the four latest completed rounds',
)
const longSessionProjection = digestLedger.selectForNarrativeTimeline(522)
assertOk(
  longSessionProjection.some((event) => event.text.includes('你救下失散的孩子'))
    && !longSessionProjection.some((event) => event.text.includes('第522轮事件')),
  'long-session prompt projection must retain locked events without accumulating low-value daily details',
)

function expectedL1Range(totalRounds) {
  const blockIndex = Math.floor(totalRounds / SUMMARY_INTERVAL)
  const targetBlock = blockIndex - 1 - COMPRESS_L1_DELAY_BLOCKS
  if (targetBlock < 0) return null
  return [targetBlock * SUMMARY_INTERVAL + 1, (targetBlock + 1) * SUMMARY_INTERVAL]
}

assertOk(expectedL1Range(4) === null, 'L1 must wait for one delayed four-round block')
assertOk(
  JSON.stringify(expectedL1Range(8)) === JSON.stringify([1, 4]),
  'the first L1 must cover rounds 1-4 after round 8',
)
assertOk(
  JSON.stringify(expectedL1Range(12)) === JSON.stringify([5, 8]),
  'the second L1 must cover rounds 5-8 after round 12',
)
assertOk(
  JSON.stringify(expectedL1Range(16)) === JSON.stringify([9, 12]),
  'the third L1 must cover rounds 9-12 after round 16',
)
assertOk(
  RECENT_NARRATIVE_WINDOW === SUMMARY_INTERVAL,
  'the raw prompt window must stay at one four-round L1 block',
)
assertOk(COMPRESS_L1_DELAY_BLOCKS === 1, 'L1 must retain one complete block before compression')

const compressionOutput = TimelineCompressionOutputSchema.parse({
  periods: [{
    timeSpan: '第1-2轮',
    events: [{
      text: '你救下孩子并因此改变了渡口关系',
      occurrenceTime: '第2轮',
      sourceIds: ['source-low', 'source-high'],
      weight: 4,
    }],
  }],
  completionMarker: '[SUMMARY_COMPLETE]',
})
const compressedEvents = buildCompressedMemoryEvents(1, 1, 2, compressionOutput, [
  {
    id: 'source-low',
    round: 1,
    time: '第1轮',
    text: '低权重来源',
    initialWeight: 2,
    weightAnchorRound: 1,
    permanent: false,
  },
  {
    id: 'source-high',
    round: 2,
    time: '第2轮',
    text: '高权重来源',
    initialWeight: 9,
    weightAnchorRound: 2,
    permanent: false,
  },
])
assertOk(
  compressedEvents[0]?.initialWeight === 4
    && compressedEvents[0]?.weightAnchorRound === 2
    && compressedEvents[0]?.permanent === false,
  'compressed memory must persist the AI-provided weight instead of selecting a local source weight',
)
assertOk(
  !TimelineCompressionOutputSchema.safeParse({
    periods: [{
      timeSpan: '第1轮',
      events: [{ text: '越界权重', occurrenceTime: '第1轮', sourceIds: ['source-low'], weight: 11 }],
    }],
    completionMarker: '[SUMMARY_COMPLETE]',
  }).success,
  'compression output must reject weights outside the 1-10 contract',
)
let unknownSourceRejected = false
try {
  buildCompressedMemoryEvents(1, 1, 2, TimelineCompressionOutputSchema.parse({
    periods: [{
      timeSpan: '第1轮',
      events: [{ text: '未知来源', occurrenceTime: '第1轮', sourceIds: ['missing'], weight: 5 }],
    }],
    completionMarker: '[SUMMARY_COMPLETE]',
  }), [])
} catch {
  unknownSourceRejected = true
}
assertOk(unknownSourceRejected, 'compression persistence must reject unknown source IDs')

const recentStories = [
  {
    回合: 1,
    规范时间: { 总天数: 30, 时间标签: '第1月' },
    故事全文: '第一轮完整故事。',
  },
  {
    回合: 2,
    规范时间: { 总天数: 60, 时间标签: '第2月' },
    故事全文: '第二轮完整故事。',
    分支: { 标题: '去留', 选项: ['留下', '离开'] },
    已确认选择: { 内容: '留下', 确认回合: 3 },
  },
  {
    回合: 3,
    规范时间: { 总天数: 90, 时间标签: '第3月' },
    故事全文: '第三轮完整故事。',
  },
]
const compressionPrompt = buildTimelineCompressionPrompt({
  level: 1,
  character: { name: '林舟', gender: '男' },
  world: { name: '临海北湾' },
  sourceFacts: [{
    id: 'round-1:body',
    round: 1,
    time: '第1月',
    text: '正文：第一轮完整故事。',
    initialWeight: 5,
    weightAnchorRound: 1,
    permanent: false,
  }],
  recentStories,
})
assertOk(
  compressionPrompt.user.includes('第一轮完整故事。')
    && compressionPrompt.user.includes('第三轮完整故事。')
    && compressionPrompt.system.includes('整数权重 weight'),
  'compression AI must receive the complete recent three stories and an explicit weight contract',
)

const orchestratorSource = readModuleSource(
  'src/mods/mod-engine/subsystems/orchestrator-system.ts',
  root,
)
assertOk(
  !orchestratorSource.includes('MAX_NARRATIVE_HISTORY')
    && !orchestratorSource.includes('narrativeHistory.shift()'),
  'long-session narrative history must remain complete while summary selection uses real round ids',
)
const summaryPromptSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/summary-prompt.ts'),
  'utf8',
)
const compressorSource = readModuleSource(
  'src/mods/mod-engine/subsystems/summary-compressor-system.ts',
  root,
)
const summaryCoverageSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/summary-coverage.ts'),
  'utf8',
)
const engineUtilsSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/utils.ts'),
  'utf8',
)
const memorySource = readModuleSource(
  'src/mods/mod-engine/subsystems/memory-lifecycle-system.ts',
  root,
)
assertOk(
  orchestratorSource.includes('selectRecentFactsForNarrativeTimeline(')
    && /const latestCompletedRound = Math\.max\(0, (?:this\.state\.totalRounds|orchestrator\['state'\]\.totalRounds) - 1\)/u.test(orchestratorSource)
    && orchestratorSource.includes('latestCompletedRound - RECENT_NARRATIVE_WINDOW + 1')
    && !orchestratorSource.includes('selectNarrativeHistoryForPrompt(')
    && !orchestratorSource.includes('lastNarrativeText')
    && !orchestratorSource.includes('e.narrative.trim()')
    && memorySource.includes('buildNarrativeTimelineProjection(')
    && memorySource.includes('...recentFacts')
    && memorySource.includes('selectLeafSummaries'),
  'production memory projection must use recent structured facts and hierarchical leaf summaries without resending story prose',
)
assertOk(
  summaryPromptSource.includes('eventRecords')
    && summaryPromptSource.includes('sourceFacts')
    && summaryPromptSource.includes('sourceIds')
    && summaryPromptSource.includes('recentStories')
    && summaryPromptSource.includes('weight')
    && !summaryPromptSource.includes('不要输出权重数字'),
  'timeline compression Prompt must receive recent stories, traceable source IDs and AI-owned weights',
)
assertOk(
  summaryPromptSource.includes('SUMMARY_COMPLETION_MARKER')
    && !summaryPromptSource.includes('charLimit')
    && !summaryPromptSource.includes('不超过指定字数'),
  'summary Prompt must require complete coverage without a semantic character cap',
)
assertOk(
  compressorSource.includes('TimelineCompressionOutputSchema')
    && compressorSource.includes('buildCompressedMemoryEvents')
    && compressorSource.includes('buildRecentStoriesFromYearEvents')
    && summaryCoverageSource.includes('摘要缺少完整覆盖标记')
    && !/\btotalL[4-6]\b/.test(compressorSource)
    && !compressorSource.includes('fallbackParts')
    && compressorSource.includes("throw new Error('L1 压缩候选生成失败'")
    && compressorSource.includes('newCompressedSummaries: structuredClone({ summaries })'),
  'incomplete or failed compression at every level must retain leaves without creating fallback coverage or success statistics',
)
assertOk(
  compressorSource.includes('isCurrentAlignedSummary(summary, level)')
    && compressorSource.includes('isCurrentAlignedSummary(summary, childLevel)')
    && compressorSource.includes('summary.endRound === endRound'),
  'legacy summary boundaries must not block current four-round L1 or higher-level promotion',
)
assertOk(
  engineUtilsSource.includes('computeCoverageSafeSummaryTokens')
    && !/inputTextLength\s*\/\s*(?:2|4|8|10|12)/.test(engineUtilsSource),
  'higher compression levels must keep coverage-safe output headroom instead of progressively shrinking the hard token ceiling',
)
assertOk(
  orchestratorSource.includes('addCompressedSummaryToIndex('),
  'higher-level summaries must remain searchable after lower-level events are cleared',
)
assertOk(
  memorySource.includes('coveredRanges')
    && memorySource.includes('summary.startRound >= range.start')
    && memorySource.includes('summary.endRound <= range.end')
    && memorySource.includes('byLevel.set')
    && memorySource.includes('projectSummaryToNarrativeTimeline('),
  'leaf-summary assembly must replace only fully covered lower levels and retain uncovered summaries',
)

digestLedger.reset()

if (failed > 0) process.exit(1)
console.log('PASS: compression-runtime-smoke')
