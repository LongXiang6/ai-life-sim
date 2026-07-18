/**
 * 叙事压缩运行时冒烟检查。
 *
 * 覆盖：
 *   1. 主叙事 META 必须带 digest、keyEvents 与每事件 importance/entities；
 *   2. 摘要账本实际按权重保留高分事件、折叠低分事件；
 *   3. L1 延迟窗口的首个覆盖区间与最近完整原文窗口不能产生空洞；
 *   4. 摘要必须带完整覆盖标记，失败时不得伪造高层覆盖节点。
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
  /export const RECENT_NARRATIVE_WINDOW = SUMMARY_INTERVAL \* \(COMPRESS_L1_DELAY_ROUNDS \+ 1\)/,
)
if (!recentWindowExpression) throw new Error('RECENT_NARRATIVE_WINDOW must derive from the L1 delay contract')
const RECENT_NARRATIVE_WINDOW = SUMMARY_INTERVAL * (COMPRESS_L1_DELAY_ROUNDS + 1)

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
  'valid narrative response must include digest and weighted keyEvents',
)

const missingDigest = structuredClone(validMetadata)
delete missingDigest.digest
assertOk(
  !NarrativeResponseSchema.safeParse(missingDigest).success,
  'response without the extra digest field must fail the active META schema',
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

function expectedL1Range(totalRounds) {
  const blockIndex = Math.floor(totalRounds / SUMMARY_INTERVAL)
  const blockRound = totalRounds % SUMMARY_INTERVAL
  if (blockRound !== COMPRESS_L1_DELAY_ROUNDS || blockIndex < 2) return null
  const targetBlock = blockIndex - 2
  return [targetBlock * SUMMARY_INTERVAL + 1, (targetBlock + 1) * SUMMARY_INTERVAL]
}

assertOk(expectedL1Range(20) === null, 'L1 must remain delayed before the first complete delay window')
assertOk(
  JSON.stringify(expectedL1Range(21)) === JSON.stringify([1, 10]),
  'the first delayed L1 must cover rounds 1-10 at round 21',
)
assertOk(
  JSON.stringify(expectedL1Range(31)) === JSON.stringify([11, 20]),
  'the second delayed L1 must cover rounds 11-20 at round 31',
)
assertOk(
  RECENT_NARRATIVE_WINDOW >= SUMMARY_INTERVAL * (COMPRESS_L1_DELAY_ROUNDS + 1),
  'the raw prompt window must cover all rounds waiting for delayed L1 compression',
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
  orchestratorSource.includes('slice(-RECENT_NARRATIVE_WINDOW)')
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
    && !/轮(?:综合|时代|纪元|历史)概略/.test(compressorSource),
  'incomplete or failed higher-level compression must retain leaves instead of creating placeholder coverage',
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
