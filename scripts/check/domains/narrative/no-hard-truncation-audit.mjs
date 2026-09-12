/**
 * Purpose: Audit active paths that could destructively shorten story, continuity, history, or player text.
 * Owner: quality:narrative
 * Responsibility: Static red lines for the approved 01/02/03 flow and local state owners only.
 */

import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'
import { formatPowerFrameworkForPrompt } from '../../../../src/mods/mod-world/utils/power-framework.ts'

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
const continuityOwner = read('src/mods/mod-engine/subsystems/summary-compressor-system.ts')
const continuityContext = read('src/mods/mod-engine/helpers/narrative-story-continuity-context.ts')
const continuityPrompt = read('src/mods/mod-engine/server/narrative-story-continuity-system-prompt.ts')
const memoryLifecycle = read('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts')
const timelineMemory = read('src/mods/mod-engine/helpers/timeline-memory.ts')
const foreshadowing = read('src/mods/mod-engine/subsystems/foreshadowing-system.ts')
const aiClient = read('src/core/ai-service/ai-client.ts')
const aiTransport = read('src/core/ai-service/ai-client/http-transport.ts')
const aiJsonParser = read('src/core/ai-service/parse-ai-json.ts')
const talentGrowthContext = read('src/mods/mod-engine/helpers/narrative-talent-growth-context.ts')
const historicalStore = read('src/mods/mod-history-dynamics/store.ts')
const historicalQuery = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system/query-runtime.ts')
const historicalLedger = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system.ts')
const historicalCandidateDue = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system/candidate-due-runtime.ts')
const historicalCandidateDisposition = read('src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system/candidate-disposition-runtime.ts')
const historicalLedgerRuntime = read('src/mods/mod-engine/subsystems/orchestrator-system/historical-ledger-runtime.ts')
const characterBase = read('src/mods/mod-character/subsystems/character-base-system.ts')
const characterStatus = read('src/mods/mod-character/subsystems/character-status-update.ts')
const narrativePrompt = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const narrativeSignals = read('src/mods/mod-engine/helpers/narrative-semantic-signals.ts')
const subsystemRelevance = read('src/mods/mod-engine/subsystems/subsystem-relevance-system.ts')
const spatialGraph = read('src/mods/mod-world/subsystems/spatial-graph-system.ts')
const worldSelect = read('src/mods/mod-pages/pages/world-select/WorldSelectCustomForm.tsx')
const characterBackground = read('src/mods/mod-pages/pages/character-create/CharacterBackgroundSection.tsx')
const decisions = read('docs/product-decisions.md')
const acceptanceLedger = read('docs/acceptance-ledger.md')

reject(constants, /MAX_NARRATIVE_HISTORY|MAX_CHARACTER_CREATIONS/, 'engine constants must not define destructive story or creation caps')
reject(orchestrator, /narrativeHistory\.shift\(/, 'orchestrator must retain complete narrative history')
reject(orchestrator, /worldSetting\.description\.slice\(/, 'world adaptation must receive the complete world description')
reject(store, /narrativeHistory[\s\S]{0,160}slice\(-?\d+\)/, 'engine persistence must not keep only a fixed story tail')
reject(continuityOwner, /MAX_SUMMARIES|summaries\s*=\s*summaries\.slice\(/, '02 storage must not evict semantic memories by capacity')
reject(continuityOwner, /fallback|降级|retry|重试/iu, '02 owner must not create fallback content or hidden retries')
assertOk(
  continuityOwner.includes('sourceRounds.length !== 5')
    && continuityOwner.includes('sourceRounds.some((round) => current.summaries.some((summary) =>')
    && continuityOwner.includes('nextSummaries: { summaries: [...current.summaries, ...summaries] }'),
  '02 must append one unique five-round batch without replacing earlier memories',
)
reject(continuityContext, /故事全文[^\n]*(?:slice|substring)|sourceNarrative\.text\.(?:slice|substring)/u, '02 input must send the complete source story')
reject(continuityPrompt, /不超过|仅保留|极简|高度浓缩/u, '02 Prompt must not impose destructive semantic caps')
reject(memoryLifecycle, /MAX_INDEX_ENTRIES|MAX_RELATIONSHIP_MEMORIES|relationshipMemories\.(?:shift|splice)\(|searchIndex\.(?:shift|splice)\(/, 'unified memory must not evict facts or people by fixed capacity')
assertOk(
  memoryLifecycle.includes('buildNarrativeTimelineProjection('),
  '02 memory must remain traceable through dated timeline facts',
)
assertOk(
  timelineMemory.includes('projectSummaryToNarrativeTimeline')
    && timelineMemory.includes('formatNarrativeTimelineForPrompt')
    && !timelineMemory.includes('initialWeight')
    && !timelineMemory.includes('weightAnchorRound'),
  'memory storage and 01 projection must remain separate without retired weight fields',
)
reject(foreshadowing, /MAX_ACTIVE_FORESHADOWING|MAX_PROMPT_FORESHADOWING|\.slice\(0,\s*MAX_PROMPT/, 'unresolved foreshadowing must not be evicted or top-N truncated')
reject(aiJsonParser, /repairTruncatedJSON|extractCompleteObjects|objects\.join\(','\)/, 'AI JSON parsing must not rebuild a partial response')
assertOk(
  aiJsonParser.includes('parseAIJSONCandidates')
    && aiJsonParser.includes('残缺尾部不会丢弃前面已经完整的候选'),
  'AI JSON parsing must keep independently complete candidates while dropping unusable fragments',
)
reject(aiClient, /repair|retryResult|validateWithRetry/u, 'public AI client must not expose an implicit repair or retry path')
reject(aiTransport, /retry-executor|retry policy belongs|repair/u, 'AI transport must describe one request and leave another attempt to the caller')
reject(continuityContext, /recentStories\.slice\(/, '02 source selection must not truncate the provided retry window')
reject(talentGrowthContext, /eligiblePatterns\.slice\(|compressedSummaries\.summaries\.slice\(/, '03 must not truncate eligible patterns or historical memory')
reject(orchestrator, /capturePreviewSnapshot|restorePreviewSnapshot|runPreviewRound|isPreviewExecution/, 'narrative execution must not restore a speculative earlier round')
reject(historicalQuery, /DEFAULT_QUERY_LIMIT|MAX_QUERY_LIMIT|pageSize\s*=|limit\s*=\s*100/, 'historical queries must not hide a default or maximum read cap')
reject(historicalLedgerRuntime, /pageSize\s*=|limit:\s*500|offset\s*\+=/, 'historical runtime must not reconstruct full local input through a fixed page size')
const historicalCandidateLifecycle = [historicalLedger, historicalCandidateDue, historicalCandidateDisposition].join('\n')
reject(historicalCandidateLifecycle, /readyEvents\.slice\(|dueCandidates\.slice\(|MAX_(?:EVENT|CANDIDATE)/, 'historical ledger must not truncate due events or candidates')
assertOk(
  historicalCandidateLifecycle.includes('getDueCandidates')
    && historicalCandidateLifecycle.includes('commitCandidateDispositions')
    && historicalCandidateLifecycle.includes('isHistoricalScheduleDue'),
  'historical ledger must own local due-time evaluation and complete candidate disposition writes',
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
reject(spatialGraph, /resources\.slice\(|regionProfiles[^\n]*\.slice\(/, 'world-region state must not truncate profile fields')
reject(narrativePrompt, /digest:[^\n]*(?:不超过|最多)\d+|keyEvents:[^\n]*最多\d+|entities[^\n]*最多\d+|creations:[^\n]*最多\d+|foreshadowing:[^\n]*最多\d+/, '01 contract must not impose fixed semantic metadata limits')
reject(narrativeSignals, /maxLength|maxItems|z\.string\(\)(?:\.min\([^)]*\))?\.max\(|keyEvents:[^\n]*\.max\(/, 'narrative metadata must not reject complete semantic text by fixed size')
reject(subsystemRelevance, /stateHistory\[subsystemId\]\.shift\(|this\.changeRecords\s*=\s*this\.changeRecords\.filter/, 'relevance windows must not delete complete underlying state history')
reject(worldSelect, /maxLength=\{?5000\}?|value\.slice\(0,\s*5000\)/, 'custom world descriptions must not be cut at input time')
reject(characterBackground, /maxLength=\{?5000\}?|value\.slice\(0,\s*5000\)/, 'character background must not be cut at input time')
assertOk(decisions.includes('PD-015') && decisions.includes('破坏性硬截断'), 'product authority must retain the no-hard-truncation red line')
assertOk(acceptanceLedger.includes('已由 PD-015 取代'), 'historical acceptance must mark tail-cutting guidance as superseded')

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
