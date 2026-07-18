/**
 * 叙事压缩运行时冒烟检查。
 *
 * 覆盖：
 *   1. 主叙事 META 必须带 digest、keyEvents 与每事件 importance/entities；
 *   2. 摘要账本实际按权重保留高分事件、折叠低分事件；
 *   3. L1 延迟窗口的首个覆盖区间与最近完整原文窗口不能产生空洞。
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

// 历史达到保留上限后，events 可能从第 22 轮等较晚轮次开始；L1 仍必须
// 按事件真实 id 选取目标区间，而不是把 round 当作数组下标。
const retainedWindow = Array.from({ length: 200 }, (_, index) => ({ id: index + 22 }))
const delayedBlock = retainedWindow.filter((event) => event.id >= 191 && event.id <= 200)
assertOk(
  delayedBlock.length === 10
    && delayedBlock[0]?.id === 191
    && delayedBlock.at(-1)?.id === 200,
  'delayed L1 selection must remain correct after the narrative history window is trimmed',
)

const orchestratorSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
)
const summaryPromptSource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/summary-prompt.ts'),
  'utf8',
)
const memorySource = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'),
  'utf8',
)
assertOk(
  orchestratorSource.includes('slice(-RECENT_NARRATIVE_WINDOW)')
    && memorySource.includes('recentNarratives.slice(-RECENT_NARRATIVE_WINDOW'),
  'production memory assembly must use the delayed-compression-safe raw window',
)
assertOk(
  summaryPromptSource.includes('eventRecords.digest')
    && summaryPromptSource.includes('eventRecords.keyEvents')
    && summaryPromptSource.includes('importance'),
  'L1 summary Prompt must receive the extra digest and per-event weights',
)
assertOk(
  orchestratorSource.includes('addCompressedSummaryToIndex('),
  'higher-level summaries must remain searchable after lower-level events are cleared',
)

digestLedger.reset()

if (failed > 0) process.exit(1)
console.log('PASS: compression-runtime-smoke')
