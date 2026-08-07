/**
 * Purpose: Audit active paths that could destructively shorten story, memory, history, or player text.
 * Owner: quality:narrative
 * Responsibility: Static red lines and focused whole-package behavior only.
 */

import { register } from 'node:module'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'

register('../../lib/typescript-loader.mjs', import.meta.url)
const { mapRawNarrativeChanges } = await import('../../../../src/mods/mod-engine/helpers/narrative-change-bundle.ts')
const { validateRoundChanges } = await import('../../../../src/mods/mod-engine/helpers/subsystem-field-registry.ts')
const { requireCompletedSummaryContent } = await import('../../../../src/mods/mod-engine/helpers/summary-coverage.ts')
const { formatPowerFrameworkForPrompt } = await import('../../../../src/mods/mod-world/utils/power-framework.ts')

const root = getProjectRoot(import.meta.url)
let failed = 0

const read = (relativePath) => readModuleSource(relativePath, root)
const assertOk = (condition, message) => {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}
const reject = (source, pattern, message) => assertOk(!pattern.test(source), message)

const constants = read('src/mods/mod-engine/constants.ts')
const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const store = read('src/mods/mod-engine/store.ts')
const compressor = read('src/mods/mod-engine/subsystems/summary-compressor-system.ts')
const summaryPrompt = read('src/mods/mod-engine/prompts/summary-prompt.ts')
const summaryCoverage = read('src/mods/mod-engine/helpers/summary-coverage.ts')
const engineUtils = read('src/mods/mod-engine/utils.ts')
const digestLedger = read('src/mods/mod-engine/helpers/digest-ledger.ts')
const memoryLifecycle = read('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts')
const timelineFacts = read('src/mods/mod-engine/subsystems/memory-lifecycle-system/timeline-facts.ts')
const timelineMemory = read('src/mods/mod-engine/helpers/timeline-memory.ts')
const foreshadowing = read('src/mods/mod-engine/subsystems/foreshadowing-system.ts')
const changeBundle = read('src/mods/mod-engine/helpers/narrative-change-bundle.ts')
const aiClient = read('src/core/ai-service/ai-client.ts')
const aiJsonParser = read('src/core/ai-service/parse-ai-json.ts')
const dataAnalysisContext = read('src/mods/mod-engine/helpers/narrative-data-analysis-context.ts')
const basicAttributeContext = read('src/mods/mod-engine/helpers/narrative-basic-attribute-context.ts')
const eventRecognitionContext = read('src/mods/mod-engine/helpers/narrative-event-recognition-context.ts')
const macroImpactContext = read('src/mods/mod-engine/helpers/narrative-macro-impact-context.ts')
const fieldRegistry = read('src/mods/mod-engine/helpers/subsystem-field-registry.ts')
const roundCommitBus = read('src/mods/mod-engine/helpers/round-commit-bus.ts')
const timeBridge = read('src/mods/mod-engine/helpers/time-bridge-summary.ts')
const historicalProjection = read('src/mods/mod-engine/helpers/historical-event-prompt-projection.ts')
const historicalStore = read('src/mods/mod-history-dynamics/store.ts')
const historicalQuery = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system/query-runtime.ts')
const historicalLedger = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system.ts')
const historicalCandidateDue = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system/candidate-due-runtime.ts')
const historicalCandidateDisposition = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system/candidate-disposition-runtime.ts')
const historicalLedgerRuntime = read('src/mods/mod-engine/subsystems/orchestrator-system/historical-ledger-runtime.ts')
const eventRecognitionProtocol = read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts')
const eventRecognitionQuality = read('src/mods/mod-engine/helpers/narrative-response-quality.ts')
const eventRecognitionCandidateQuality = read('src/mods/mod-engine/helpers/narrative-event-candidate-quality.ts')
const characterBase = read('src/mods/mod-character/subsystems/character-base-system.ts')
const characterStatus = read('src/mods/mod-character/subsystems/character-status-update.ts')
const characterEpilogue = read('src/mods/mod-character/subsystems/character-epilogue-runtime.ts')
const eventLifecycle = read('src/mods/mod-engine/helpers/event-lifecycle-tracker.ts')
const narrativePrompt = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const narrativeSignals = read('src/mods/mod-engine/helpers/narrative-semantic-signals.ts')
const subsystemRelevance = read('src/mods/mod-engine/subsystems/subsystem-relevance-system.ts')
const spatialGraph = read('src/mods/mod-world/subsystems/spatial-graph-system.ts')
const worldCustomize = read('src/mods/mod-pages/pages/world-customize/WorldCustomizeMobile.tsx')
const worldDimension = read('src/mods/mod-pages/pages/world-customize/WorldCustomizeDimensionCard.tsx')
const worldTypes = read('src/mods/mod-pages/pages/world-customize/world-customize.types.ts')
const worldSelect = read('src/mods/mod-pages/pages/world-select/WorldSelectCustomForm.tsx')
const characterBackground = read('src/mods/mod-pages/pages/character-create/CharacterBackgroundSection.tsx')
const decisions = read('docs/product-decisions.md')
const acceptanceLedger = read('docs/acceptance-ledger.md')

reject(constants, /MAX_NARRATIVE_HISTORY|MAX_CHARACTER_CREATIONS/, 'engine constants must not define destructive story or creation caps')
reject(orchestrator, /narrativeHistory\.shift\(|characterCreations\.shift\(/, 'orchestrator must retain complete narrative history and original creations')
reject(orchestrator, /worldSetting\.description\.slice\(/, 'world adaptation must receive the complete world description')
reject(store, /narrativeHistory[\s\S]{0,160}slice\(-?\d+\)/, 'engine persistence must not keep only a fixed story tail')
reject(compressor, /MAX_SUMMARIES|summaries\s*=\s*summaries\.slice\(/, 'summary storage must not evict semantic summaries by capacity')
reject(compressor, /fallbackParts|失败降级：保留完整叙事文本/, 'compression failure must not create a fake coverage node')
assertOk(
  compressor.includes('TimelineCompressionOutputSchema')
    && compressor.includes('buildCompressedMemoryEvents')
    && compressor.includes('newCompressedSummaries: structuredClone({ summaries })'),
  'summary compression must retain lower-level leaves until a complete result is accepted',
)
reject(summaryPrompt, /charLimit|不超过指定字数|仅保留：|极简摘要|高度浓缩摘要/, 'summary Prompt must not induce destructive character limits')
assertOk(
  summaryPrompt.includes('SUMMARY_COMPLETION_MARKER')
    && summaryCoverage.includes('摘要缺少完整覆盖标记')
    && summaryCoverage.includes('摘要正文为空'),
  'summary coverage must require a complete marker and non-empty body',
)
reject(engineUtils, /computeSummaryCharLimit|inputTextLength\s*\/\s*(?:2|4|8|10|12)/, 'summary headroom must not become a character cap')
reject(digestLedger, /MAX_LEDGER_ENTRIES|entry\.events\.shift\(|kept[\s\S]{0,120}\.slice\(/, 'digest ledger must not delete or top-N narrative facts')
reject(memoryLifecycle, /MAX_INDEX_ENTRIES|MAX_RELATIONSHIP_MEMORIES|relationshipMemories\.(?:shift|splice)\(|searchIndex\.(?:shift|splice)\(/, 'unified memory must not evict facts or people by fixed capacity')
assertOk(
  memoryLifecycle.includes('selectLeafSummaries')
    && memoryLifecycle.includes('buildCreationTimelineEntries')
    && timelineFacts.includes('玩家角色亲自开创[玩家原创·'),
  'long memory and player creations must remain traceable through dated leaf facts',
)
assertOk(
  timelineMemory.includes('formatSummaryForPrompt')
    && timelineMemory.includes('formatNarrativeTimelineForPrompt')
    && timelineMemory.includes('sourceEventIds'),
  'memory storage and Prompt projection must remain separate while preserving source IDs',
)
reject(foreshadowing, /MAX_ACTIVE_FORESHADOWING|MAX_PROMPT_FORESHADOWING|\.slice\(0,\s*MAX_PROMPT/, 'unresolved foreshadowing must not be evicted or top-N truncated')
reject(changeBundle, /changes\.slice\(/, 'narrative changes must not be partially mapped')
assertOk(changeBundle.includes('(changes ?? []).map'), 'change mapping must preserve every item before whole-package validation')
reject(aiJsonParser, /repairTruncatedJSON|extractCompleteObjects|objects\.join\(','\)/, 'AI JSON parsing must not rebuild a partial response')
assertOk(aiJsonParser.includes('scan.incomplete || scan.spans.length !== 1'), 'AI JSON parsing must accept one complete unambiguous value')
reject(aiClient, /originalResponse\.(?:slice|substring)\(/, 'analysis repair must retain the complete failed response')
assertOk(
  aiClient.includes('【上一版纯 JSON 响应全文开始】')
    && aiClient.includes('【上一版纯 JSON 响应全文结束】'),
  'analysis repair must carry the complete previous response',
)
reject(dataAnalysisContext, /stateLines\.slice\(|activeSubsystemIds\.slice\(/, 'data-analysis input must not truncate writable state')
reject(basicAttributeContext, /state\.data\.slice\(|recentStories\.slice\(/, 'basic-attribute input must not truncate state or stories')
reject(eventRecognitionContext, /existingCandidates\.slice\(|recentStories\.slice\(/, 'event recognition must not truncate candidates or stories')
reject(macroImpactContext, /recentStories\.slice\(|macroSystems\.slice\(/, 'macro impact must not truncate regional state or stories')
assertOk(
  /z\.object\(Object\.fromEntries\([\s\S]*?\) as z\.ZodRawShape\)\.strict\(\)/.test(fieldRegistry),
  'field validation must reject unknown keys instead of stripping them',
)
assertOk(
  roundCommitBus.indexOf('if (ATOMIC_AI_SOURCES.has(commit.source) && rejected.length > 0)')
    < roundCommitBus.indexOf('for (const change of prepared)'),
  'each AI package must pass complete preflight before the first write',
)
reject(orchestrator, /capturePreviewSnapshot|restorePreviewSnapshot|runPreviewRound|isPreviewExecution/, 'narrative execution must not restore a speculative earlier round')
reject(timeBridge, /truncateBullet|MAX_BULLET|bullets\.slice\(|bullets\.length\s*>=/, 'time bridge must preserve every semantic bullet')
reject(historicalProjection, /\.shift\(|\.splice\(|MAX_(?:EVENT|EDGE)|LIMIT_(?:EVENT|EDGE)/, 'historical Prompt projection must not mutate or capacity-evict facts')
reject(historicalQuery, /DEFAULT_QUERY_LIMIT|MAX_QUERY_LIMIT|pageSize\s*=|limit\s*=\s*100/, 'historical queries must not hide a default or maximum read cap')
reject(historicalLedgerRuntime, /pageSize\s*=|limit:\s*500|offset\s*\+=/, 'historical runtime must not reconstruct full candidate input through a fixed page size')
const historicalCandidateLifecycle = [historicalLedger, historicalCandidateDue, historicalCandidateDisposition].join('\n')
reject(historicalCandidateLifecycle, /readyEvents\.slice\(|dueCandidates\.slice\(|MAX_(?:EVENT|CANDIDATE)/, 'historical ledger must not truncate due events or candidates')
assertOk(
  historicalProjection.includes("CONTINUATION_STATUSES = new Set<HistoricalEventStatus>(['scheduled', 'active'])")
    && historicalProjection.includes("scope.kind === 'global' || scope.contextIds.includes(currentContextId)")
    && historicalProjection.includes('dueCandidates')
    && historicalProjection.includes('逐项表现'),
  'historical Prompt projection must use semantic status/scope bounds and preserve every due candidate',
)
assertOk(
  historicalCandidateLifecycle.includes('getDueCandidates')
    && historicalCandidateLifecycle.includes('commitCandidateDispositions')
    && historicalCandidateLifecycle.includes('isHistoricalScheduleDue'),
  'historical ledger must own due-time evaluation and complete candidate disposition writes',
)
assertOk(
  eventRecognitionProtocol.includes('到期候选判定')
    && eventRecognitionProtocol.includes('AI_HISTORICAL_EVENT_CANDIDATE_STATUSES')
    && [eventRecognitionQuality, eventRecognitionCandidateQuality].join('\n').includes('到期候选必须逐项判定'),
  'event recognition must validate one disposition for every delivered due candidate',
)
reject(historicalStore, /(?:events|transitions|evidence|causalEdges|candidateAudits|migrationMetadata)\.(?:shift|splice)\(/, 'historical truth must not use FIFO deletion')
assertOk(
  historicalStore.includes('events: [...state.events, ...cloneValue(append.events)]')
    && historicalStore.includes('candidateAudits: [...state.candidateAudits, ...cloneValue(append.candidateAudits)]')
    && historicalStore.includes('migrationMetadata: [...state.migrationMetadata, ...cloneValue(append.migrationMetadata)]'),
  'historical facts, candidate decisions, and migration evidence must append to the owner',
)
reject(characterBase, /conditions\.(?:shift|splice)\(|guidance\.slice\(/, 'unified character status must not discard health conditions or guidance by capacity')
reject(characterStatus, /evidenceEventIds\.slice\(|conditions\.slice\(/, 'character status updates must preserve complete evidence and conditions')
reject(characterEpilogue, /narrativeHistory\.slice\(|deathNarratives\.slice\(/, 'epilogue generation must not use a fixed-count life-history cut')
reject(eventLifecycle, /activeEvents\.slice\(|activeTrends\.slice\(|zones\.slice\(/, 'event lifecycle must process every active owner-provided signal')
reject(spatialGraph, /resources\.slice\(|regionProfiles[^\n]*\.slice\(/, 'world-region state must not truncate profile fields')
reject(narrativePrompt, /digest:[^\n]*(?:不超过|最多)\d+|keyEvents:[^\n]*最多\d+|entities[^\n]*最多\d+|creations:[^\n]*最多\d+|foreshadowing:[^\n]*最多\d+/, 'main narrative protocol must not impose fixed semantic META limits')
reject(narrativeSignals, /maxLength|maxItems|z\.string\(\)(?:\.min\([^)]*\))?\.max\(|keyEvents:[^\n]*\.max\(/, 'narrative metadata must not reject complete semantic text by fixed size')
reject(subsystemRelevance, /stateHistory\[subsystemId\]\.shift\(|this\.changeRecords\s*=\s*this\.changeRecords\.filter/, 'relevance windows must not delete complete underlying state history')
reject(worldCustomize, /WORLD_CUSTOM_TEXT_MAX_LENGTH|maxLength=|value\.slice\(/, 'world description input must not hard-limit player settings')
reject(worldDimension, /WORLD_CUSTOM_TEXT_MAX_LENGTH|maxLength=|value\.slice\(/, 'custom world dimensions must not truncate player text')
reject(worldTypes, /WORLD_CUSTOM_TEXT_MAX_LENGTH/, 'world customization types must not define a destructive text cap')
reject(worldSelect, /maxLength=\{?5000\}?|value\.slice\(0,\s*5000\)/, 'custom world descriptions must not be cut at input time')
reject(characterBackground, /maxLength=\{?5000\}?|value\.slice\(0,\s*5000\)/, 'character background must not be cut at input time')
assertOk(decisions.includes('PD-015') && decisions.includes('破坏性硬截断'), 'product authority must retain the no-hard-truncation red line')
assertOk(acceptanceLedger.includes('已由 PD-015 取代'), 'historical acceptance must mark tail-cutting guidance as superseded')

const mixedChanges = [
  {
    id: 'character-base',
    operation: 'update-status',
    description: '做出善意选择',
    changes: { moralityDelta: 1 },
  },
  { id: 'unknown-system', description: '非法变更', changes: { value: 1 } },
]
assertOk(mapRawNarrativeChanges(mixedChanges).length === 2, 'mapping must preserve valid and invalid items before whole-package validation')
assertOk(requireCompletedSummaryContent('完整事实摘要\n[SUMMARY_COMPLETE]') === '完整事实摘要', 'complete summary content must remain unchanged')
for (const incomplete of ['缺少完成标记', '[SUMMARY_COMPLETE]']) {
  let rejectedIncomplete = false
  try {
    requireCompletedSummaryContent(incomplete)
  } catch {
    rejectedIncomplete = true
  }
  assertOk(rejectedIncomplete, 'incomplete summaries must fail instead of becoming coverage')
}
const originalWarn = console.warn
console.warn = () => {}
try {
  assertOk(validateRoundChanges(mixedChanges).length === 0, 'one invalid item must reject the complete change package')
  assertOk(validateRoundChanges([{
    id: 'character-base',
    operation: 'update-status',
    description: '含契约外字段',
    changes: { moralityDelta: 1, hidden: 2 },
  }]).length === 0, 'unknown fields must reject the complete change package')
} finally {
  console.warn = originalWarn
}

const powerProjection = formatPowerFrameworkForPrompt({
  id: 'audit:power',
  label: '审计力量体系',
  enabled: true,
  progression: 'bounded',
  source: 'world-default',
  ranks: [
    { id: 'audit:power:rank:1', index: 1, label: '初阶', description: '可重复运用基础力量' },
    { id: 'audit:power:rank:2', index: 2, label: '中阶', description: '能够稳定影响局部环境' },
  ],
})
assertOk(
  powerProjection?.includes('可重复运用基础力量')
    && powerProjection.includes('能够稳定影响局部环境'),
  'power framework projection must preserve every declared rank description',
)

if (failed > 0) process.exit(1)
console.log('PASS: no-hard-truncation-audit')
