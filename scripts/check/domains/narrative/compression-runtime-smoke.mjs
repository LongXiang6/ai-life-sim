/**
 * 叙事压缩运行时冒烟检查。
 *
 * 覆盖：
 *   1. 主叙事最低成功允许省略 digest；可选 keyEvents 一旦出现仍必须带 importance；
 *   2. 摘要账本实际按权重保留高分事件、折叠低分事件；
 *   3. L1 延迟窗口的首个覆盖区间与最近完整原文窗口不能产生空洞；
 *   4. 摘要必须带完整覆盖标记，任何层级失败时不得伪造覆盖节点或成功统计。
 *
 * 该脚本不调用外部 AI，只验证进入运行时后的结构与调度契约。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import {
  NarrativeResponseSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'
import {
  digestLedger,
} from '../../../../src/mods/mod-engine/helpers/digest-ledger.ts'

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
const COMPRESS_L1_DELAY_ROUNDS = readNumericConstant('COMPRESS_L1_DELAY_ROUNDS')
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

const validMetadata = {
  changes: [],
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
  NarrativeResponseSchema.safeParse(validMetadata).success,
  'valid structured narrative response may include digest and weighted keyEvents',
)

assertOk(
  NarrativeResponseSchema.safeParse({ changes: [], digest: '你平稳度过了这一轮。' }).success,
  'minimum body-summary success must be able to record digest without invented weights or entities',
)

const missingDigest = structuredClone(validMetadata)
delete missingDigest.digest
assertOk(
  NarrativeResponseSchema.safeParse(missingDigest).success,
  'the independently extracted round digest is optional when the body is complete',
)

const missingWeight = structuredClone(validMetadata)
delete missingWeight.keyEvents[0].importance
assertOk(
  !NarrativeResponseSchema.safeParse(missingWeight).success,
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
const weightedLines = digestLedger.selectForPrompt(2)
assertOk(
  weightedLines.some((line) => line.includes('你救下失散的孩子') && line.includes('92')),
  'high-importance events must remain individually visible to the narrative prompt',
)
assertOk(
  !weightedLines.some((line) => line.includes('你整理了屋舍')),
  'low-value events must leave the always-on prompt while remaining in the ledger',
)
assertOk(
  digestLedger.selectForPrompt(2, undefined, undefined, { excludeRoundsAtOrAfter: 1 }).length === 0,
  'events already covered by the recent full-text window must not be sent twice',
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
const longSessionProjection = digestLedger.selectForPrompt(522)
assertOk(
  longSessionProjection.some((line) => line.includes('你救下失散的孩子'))
    && !longSessionProjection.some((line) => line.includes('第522轮事件')),
  'long-session prompt projection must retain locked events without accumulating low-value daily details',
)

function expectedL1Range(totalRounds) {
  const blockIndex = Math.floor(totalRounds / SUMMARY_INTERVAL)
  const blockRound = totalRounds % SUMMARY_INTERVAL
  if (blockRound !== 0 || blockIndex < 1) return null
  const targetBlock = blockIndex - 1
  return [targetBlock * SUMMARY_INTERVAL + 1, (targetBlock + 1) * SUMMARY_INTERVAL]
}

assertOk(expectedL1Range(4) === null, 'L1 must wait for one complete five-round block')
assertOk(
  JSON.stringify(expectedL1Range(5)) === JSON.stringify([1, 5]),
  'the first L1 must cover rounds 1-5 immediately after round 5',
)
assertOk(
  JSON.stringify(expectedL1Range(10)) === JSON.stringify([6, 10]),
  'the second L1 must cover rounds 6-10 immediately after round 10',
)
assertOk(
  RECENT_NARRATIVE_WINDOW === SUMMARY_INTERVAL,
  'the raw prompt window must stay at one five-round L1 block',
)

const orchestratorSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
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
const compressorSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/summary-compressor-system.ts'),
  'utf8',
)
const summaryCoverageSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/summary-coverage.ts'),
  'utf8',
)
const engineUtilsSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/utils.ts'),
  'utf8',
)
const memorySource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'),
  'utf8',
)
assertOk(
  orchestratorSource.includes('selectNarrativeHistoryForPrompt(RECENT_NARRATIVE_WINDOW)')
    && orchestratorSource.includes('filterNarrativeRecordsForPrompt(')
    && orchestratorSource.includes('return visible.slice(-limit)')
    && memorySource.includes('recentNarratives: [...recentNarratives]')
    && memorySource.includes('selectLeafSummaries'),
  'production memory assembly must preserve the caller-provided raw window and use hierarchical leaf summaries',
)
assertOk(
  summaryPromptSource.includes('eventRecords.digest')
    && summaryPromptSource.includes('eventRecords.keyEvents')
    && summaryPromptSource.includes('importance'),
  'L1 summary Prompt must receive the extra digest and per-event weights',
)
assertOk(
  summaryPromptSource.includes('SUMMARY_COMPLETION_MARKER')
    && !summaryPromptSource.includes('charLimit')
    && !summaryPromptSource.includes('不超过指定字数'),
  'summary Prompt must require complete coverage without a semantic character cap',
)
assertOk(
  compressorSource.includes('requireCompletedSummaryContent')
    && summaryCoverageSource.includes('摘要缺少完整覆盖标记')
    && !/轮(?:综合|时代|纪元|历史)概略/.test(compressorSource)
    && !compressorSource.includes('fallbackParts')
    && compressorSource.includes('失败不得建立覆盖节点或成功统计'),
  'incomplete or failed compression at every level must retain leaves without creating fallback coverage or success statistics',
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
    && memorySource.includes('visibleByLevel.set'),
  'leaf-summary assembly must replace only fully covered lower levels and retain uncovered summaries',
)

digestLedger.reset()

if (failed > 0) process.exit(1)
console.log('PASS: compression-runtime-smoke')
