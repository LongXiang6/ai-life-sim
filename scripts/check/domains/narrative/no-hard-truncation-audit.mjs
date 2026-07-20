/**
 * 剧情质量硬截断红线审计。
 *
 * 只检查会破坏叙事语义或用户设定的已知路径。协议解析、ID 生成、并发分批、
 * UI 视觉预览和“原始数据仍完整保存”的近期窗口不属于破坏性硬截断。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { mapRawNarrativeChanges } from '../../../../src/mods/mod-engine/helpers/narrative-change-bundle.ts'
import { validateRoundChanges } from '../../../../src/mods/mod-engine/helpers/subsystem-field-registry.ts'
import { requireCompletedSummaryContent } from '../../../../src/mods/mod-engine/helpers/summary-coverage.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const assertOk = (condition, message) => {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}
const reject = (source, pattern, message) => assertOk(!pattern.test(source), message)

const constants = read('src/mods/mod-engine/constants.ts')
const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const store = read('src/mods/mod-engine/store.ts')
const compressor = read('src/mods/mod-engine/subsystems/summary-compressor-system.ts')
const summaryPrompt = read('src/mods/mod-engine/prompts/summary-prompt.ts')
const summaryCoverage = read('src/mods/mod-engine/helpers/summary-coverage.ts')
const engineUtils = read('src/mods/mod-engine/utils.ts')
const ledger = read('src/mods/mod-engine/helpers/digest-ledger.ts')
const lifecycle = read('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts')
const coreMemory = read('src/mods/mod-engine/subsystems/core-memory-system.ts')
const forgettingPatterns = read('src/mods/mod-engine/patterns/forgetting-patterns.ts')
const foreshadowing = read('src/mods/mod-engine/subsystems/foreshadowing-system.ts')
const interceptor = read('src/mods/mod-engine/helpers/narrative-interceptor-pipeline.ts')
const parseStrategies = read('src/mods/mod-engine/helpers/parse-strategies.ts')
const fieldRegistry = read('src/mods/mod-engine/helpers/subsystem-field-registry.ts')
const roundCommitBus = read('src/mods/mod-engine/helpers/round-commit-bus.ts')
const timeBridge = read('src/mods/mod-engine/helpers/time-bridge-summary.ts')
const adaptation = read('src/mods/mod-engine/subsystems/adaptation-manager-system.ts')
const historicalPromptProjection = read('src/mods/mod-engine/helpers/historical-event-prompt-projection.ts')
const calibration = read('src/mods/mod-world/utils/calibration-clamp.ts')
const powerContext = read('src/mods/mod-world/utils/world-init-prompt-vars.ts')
const crossDomain = read('src/mods/mod-engine/helpers/cross-domain-rules.ts')
const postDeath = read('src/mods/mod-character/subsystems/post-death-epilogue-system.ts')
const memoryEngine = read('src/mods/mod-engine/subsystems/memory-engine-system.ts')
const forgetting = read('src/mods/mod-engine/subsystems/memory-forgetting-system.ts')
const eventLifecycle = read('src/mods/mod-engine/helpers/event-lifecycle-tracker.ts')
const branchPolicy = read('src/mods/mod-engine/helpers/narrative-branch-policy.ts')
const branchIntent = read('src/mods/mod-engine/helpers/branch-intent-resolution.ts')
const narrativePrompt = read('src/mods/mod-engine/prompts/narrative-prompt.ts')
const narrativeSignals = read('src/mods/mod-engine/helpers/narrative-semantic-signals.ts')
const subsystemRelevance = read('src/mods/mod-engine/subsystems/subsystem-relevance-system.ts')
const geography = read('src/mods/mod-environment-ecology/subsystems/geography-system.ts')
const nationRelation = read('src/mods/mod-politics/subsystems/nation-relation-system.ts')
const npcStore = read('src/mods/mod-npc/store.ts')
const npcMemory = read('src/mods/mod-npc/subsystems/npc-memory-system.ts')
const npcTypes = read('src/mods/mod-npc/types.ts')
const celestial = read('src/mods/mod-base-universe/subsystems/celestial-system.ts')
const celestialConstants = read('src/mods/mod-base-universe/constants.ts')
const era = read('src/mods/mod-base-universe/subsystems/era-system.ts')
const worldMap = read('src/mods/mod-base-universe/subsystems/world-map-system.ts')
const culture = read('src/mods/mod-culture/subsystems/culture-system.ts')
const art = read('src/mods/mod-culture/subsystems/art-system.ts')
const causalConstants = read('src/mods/mod-history-dynamics/constants.ts')
const causalSimulation = read('src/mods/mod-history-dynamics/components/causal-graph-component.ts')
const eventPool = read('src/mods/mod-history-dynamics/components/event-candidate-provider.ts')
const historicalLedgerStore = read('src/mods/mod-history-dynamics/store.ts')
const characterConstants = read('src/mods/mod-character/constants.ts')
const mythicPattern = read('src/mods/mod-character/prompts/mythic-pattern-prompt.ts')
const destinyPattern = read('src/mods/mod-character/prompts/destiny-pattern-prompt.ts')
const raceOrigin = read('src/mods/mod-character/prompts/race-origin.ts')
const raceOriginCaller = read('src/mods/mod-character/prompts/use-race-origin.ts')
const npcBehaviorPrompt = read('src/mods/mod-npc/prompts/npc-behavior.ts')
const worldCalibration = read('src/mods/mod-world/prompts/world-calibration-prompt.ts')
const worldTagsPrompt = read('src/mods/mod-world/prompts/world-tags-prompt.ts')
const worldDimensionCalibration = read('src/mods/mod-world/prompts/world-dimension-calibration-prompt.ts')
const worldEntityPrompt = read('src/mods/mod-world/prompts/world-entity-prompt.ts')
const worldEntityPromptShared = read('src/mods/mod-world/prompts/world-init-prompt-shared.ts')
const worldCustomize = read('src/mods/mod-pages/pages/world-customize/WorldCustomizeMobile.tsx')
const worldDimension = read('src/mods/mod-pages/pages/world-customize/WorldCustomizeDimensionCard.tsx')
const worldTypes = read('src/mods/mod-pages/pages/world-customize/world-customize.types.ts')
const worldSelect = read('src/mods/mod-pages/pages/world-select/WorldSelectCustomForm.tsx')
const characterBackground = read('src/mods/mod-pages/pages/character-create/CharacterBackgroundSection.tsx')
const worldPrototype = read('docs/ui-prototypes/mobile/world-customize/final-wc-rf2-1.html')
const characterPrototype = read('docs/ui-prototypes/mobile/character-create/final-cc-rf9-1.html')
const decisions = read('docs/product-decisions.md')
const acceptanceLedger = read('docs/acceptance-ledger.md')
const runtimePolicy = JSON.parse(read('src/mods/mod-engine/helpers/mvp-stages-config.default.json'))

reject(constants, /MAX_NARRATIVE_HISTORY|MAX_CHARACTER_CREATIONS/, 'engine constants must not define destructive narrative or creation caps')
reject(orchestrator, /narrativeHistory\.shift\(|characterCreations\.shift\(/, 'orchestrator must retain complete narrative history and original creations')
reject(orchestrator, /worldSetting\.description\.slice\(/, 'worldview adaptation must receive the complete world description')
reject(store, /narrativeHistory[\s\S]{0,160}slice\(-?\d+\)/, 'engine persistence must not keep only a fixed tail of narrative history')
reject(compressor, /MAX_SUMMARIES|summaries\s*=\s*summaries\.slice\(/, 'summary storage must not discard old semantic summaries by capacity')
reject(compressor, /轮综合概略|轮时代概略|轮纪元概略|轮历史概略|叙事概略（生成失败）/, 'compression failure must not create fact-free placeholder coverage nodes')
assertOk(
  compressor.includes('requireCompletedSummaryContent')
    && compressor.includes('保留全部 L5 叶子等待后续重试'),
  'summary compression must reject incomplete AI output and retain lower-level leaves on failure',
)
reject(summaryPrompt, /charLimit|不超过\s*\$?\{?\w*\}?\s*字|不超过指定字数|仅保留：|极简摘要|高度浓缩摘要/, 'summary Prompt must not induce character limits or fact-dropping level semantics')
assertOk(
  summaryPrompt.includes('SUMMARY_COMPLETION_MARKER')
    && summaryPrompt.includes('无法完整覆盖时不要输出完成标记'),
  'summary Prompt must require an explicit complete-coverage marker',
)
assertOk(
  summaryCoverage.includes('摘要缺少完整覆盖标记')
    && summaryCoverage.includes('摘要正文为空'),
  'summary coverage validation must reject missing markers and empty content',
)
reject(compressor, /fallbackParts|失败降级：保留完整叙事文本/, 'failed L1 compression must not create a fallback coverage node or success statistic')
assertOk(compressor.includes('失败不得建立覆盖节点或成功统计'), 'failed L1 compression must retain original leaves for retry')
reject(engineUtils, /computeSummaryCharLimit|inputTextLength\s*\/\s*(?:2|4|8|10|12)/, 'summary token headroom must not shrink by level or convert into a character cap')
assertOk(engineUtils.includes('computeCoverageSafeSummaryTokens'), 'summary token budgets must provide coverage-safe technical headroom')
reject(ledger, /MAX_LEDGER_ENTRIES|entry\.events\.shift\(|kept[\s\S]{0,120}\.slice\(/, 'digest ledger must not delete or top-N truncate narrative facts')
reject(lifecycle, /MAX_INDEX_ENTRIES|MAX_EVENTS_BY_SEVERITY|MAX_RETRIEVAL_HITS|searchIndex\.splice\(|searchIndex\.shift\(|results\.slice\(|\.slice\(-[12],?\)/, 'memory lifecycle must retain its index and use leaf summaries instead of fixed-count cuts')
assertOk(lifecycle.includes('selectLeafSummaries'), 'memory lifecycle must assemble long history through hierarchical leaf summaries')
reject(coreMemory, /MAX_INTERACTIONS_PER_NPC|MAX_NPC_COUNT|npcMap\.delete\(/, 'core memory must not evict people or interactions by fixed capacity')
assertOk(coreMemory.includes('return null') && coreMemory.includes('return sorted.map'), 'core-memory compression must fall back to complete entries when no covering summary exists')
assertOk(coreMemory.includes('const fullyCovered = entries.every'), 'core-memory compression must prove every source event is covered before replacing complete entries')
reject(forgettingPatterns, /keywords\.slice\(/, 'explainable forgetting must preserve every matched audit reason')
reject(foreshadowing, /MAX_ACTIVE_FORESHADOWING|MAX_PROMPT_FORESHADOWING|TIMEOUT_ROUNDS|\.slice\(0,\s*MAX_PROMPT/, 'foreshadowing must not evict or top-N truncate unresolved threads')
reject(interceptor, /changes\.slice\(/, 'narrative changes must never be partially committed through slicing')
assertOk(interceptor.includes('整包拒绝'), 'invalid narrative changes must reject the complete state-change bundle')
assertOk(
  interceptor.includes('narrative: ctx.parsed.narrative')
    && interceptor.includes('changes: []'),
  'whole-META rejection must preserve the narrative body and clear every structured change',
)
reject(parseStrategies, /validateRoundChanges/, 'the parser must preserve the complete raw change bundle for the interceptor')
assertOk(parseStrategies.includes('mapRawNarrativeChanges(raw.changes)'), 'the parser must route the complete raw array through the lossless mapper')
assertOk(parseStrategies.includes('metadataRejected'), 'full META Schema failure must remain visible to the interceptor')
assertOk(fieldRegistry.includes('z.object(shape).strict()'), 'subsystem field validation must reject unknown keys instead of stripping them')
assertOk(
  roundCommitBus.indexOf("commit.source === 'narrative' && rejected.length > 0")
    < roundCommitBus.indexOf('for (const change of prepared)'),
  'narrative changes must pass complete preflight before the first subsystem write',
)
assertOk(
  orchestrator.includes('narrativeCommitSnapshot')
    && orchestrator.includes('restoreSubsystemPreviewStates(narrativeCommitSnapshot)')
    && orchestrator.includes('stateChangeBundleAccepted'),
  'orchestrator must roll back unexpected partial writes and reject all dependent META',
)
const rollbackOwners = {
  'character-base': read('src/mods/mod-character/subsystems/character-base-system.ts'),
  lifespan: read('src/mods/mod-character/subsystems/lifespan-system.ts'),
  luck: read('src/mods/mod-character/subsystems/luck-system.ts'),
  morality: read('src/mods/mod-character/subsystems/morality-system.ts'),
}
for (const subsystemId of runtimePolicy.stages[runtimePolicy.currentStage].narrativeChange) {
  const source = rollbackOwners[subsystemId]
  assertOk(
    source?.includes('capturePreviewState(') && source?.includes('restorePreviewState('),
    `narrative-writable subsystem ${subsystemId} must support transaction rollback`,
  )
}
reject(timeBridge, /truncateBullet|MAX_BULLET|bullets\.slice\(|bullets\.length\s*>=/, 'time bridge must preserve all semantic bullets without character or count truncation')
reject(adaptation, /content\.slice\(|narrativeHints\[0\]/, 'adaptation fallback must retain the complete semantic result')
reject(historicalPromptProjection, /\.slice\(|\.shift\(|\.splice\(|MAX_(?:EVENT|EDGE)|LIMIT_(?:EVENT|EDGE)/, 'historical Prompt projection must use semantic status/scope bounds instead of fixed-count truncation')
assertOk(
  historicalPromptProjection.includes("CONTINUATION_STATUSES = new Set<HistoricalEventStatus>(['scheduled', 'active'])")
    && historicalPromptProjection.includes("scope.kind === 'global' || scope.contextIds.includes(currentContextId)"),
  'historical Prompt projection must be bounded by unresolved status and current scope without dropping source facts',
)
reject(calibration, /SUMMARY_MAX_LEN|joined\.slice\(/, 'calibration summary must not be cut by character count')
reject(powerContext, /split\(['"]。['"]\)\[0\]/, 'power context must not shorten higher tiers to the first phrase')
reject(crossDomain, /eventHistory\s*=\s*this\.eventHistory\.slice\(-500\)/, 'cross-domain event history must not discard old events by capacity')
reject(postDeath, /narrativeHistory\.slice\(|deathNarratives\.slice\(/, 'death and epilogue narrative must not use fixed-count life-history cuts')
reject(postDeath, /总字数\s*\d+\s*[-—]\s*\d+\s*字/, 'death and epilogue Prompts must not impose fixed character ranges')
reject(memoryEngine, /majorEvents\.slice\(-3\)|relationships\.shift\(|majorEvents\.shift\(/, 'memory archive must retain complete relationships and major events')
reject(forgetting, /causalEvents\.shift\(/, 'causal protection marks must not be evicted by capacity')
reject(eventLifecycle, /activeDisasters\.slice\(/, 'event lifecycle must not ignore disasters after a fixed count')
reject(branchPolicy, /\.slice\(0,\s*4\)/, 'branch option normalization must not silently remove valid options')
reject(narrativePrompt, /digest:[^\n]*(?:不超过|最多)\d+|keyEvents:[^\n]*最多\d+|entities[^\n]*最多\d+|relationshipUpdates:[^\n]*最多\d+|resolvedForeshadowingIds:[^\n]*最多\d+|notableEvents:[^\n]*最多\d+|creations:[^\n]*最多\d+|foreshadowing:[^\n]*最多\d+/, 'narrative Prompt must not induce fixed character or item limits on semantic META')
assertOk(narrativePrompt.includes("version: '4.5.0'"), 'no-truncation narrative contract must use Prompt version 4.5.0')
assertOk(
  branchIntent.includes('其他未完成命运意图；保持事实连续，不得静默删除')
    && orchestrator.includes('branchIntents: this.branchIntents')
    && orchestrator.includes('intentResolution: committedIntentResolution'),
  'unresolved branch intents and accepted terminal results must remain traceable across Prompt, snapshot and narrative history',
)
reject(narrativeSignals, /maxLength|maxItems|z\.string\(\)(?:\.min\([^)]*\))?\.max\(|relationshipUpdates:[\s\S]{0,180}\.strict\(\)\)\.max\(|resolvedForeshadowingIds:[^\n]*\.max\(|notableEvents:[^\n]*\.max\(|creations:[^\n]*\.max\(|foreshadowing:[^\n]*\.max\(|keyEvents:[^\n]*\.max\(/, 'narrative Schema must not reject complete semantic text or arrays by fixed size')
reject(subsystemRelevance, /stateHistory\[subsystemId\]\.shift\(|this\.changeRecords\s*=\s*this\.changeRecords\.filter/, 'subsystem relevance must retain complete state and change history behind its recent read window')
reject(geography, /tectonicEvents\.slice\(|recentlyChanged[\s\S]{0,100}\.slice\(/, 'geography must retain all tectonic and changed-region facts')
reject(nationRelation, /recentEvents\.shift\(|recentEvents\s*=\s*rel\.recentEvents\.slice\(|allEvents\.slice\(/, 'nation relations must retain and expose complete diplomatic event history')
reject(npcStore, /\bmaxNPCs:\s*number|initialState[\s\S]{0,120}maxNPCs|Object\.keys\(npcs\)\.length[^\n]*maxNPCs|recentBehaviors[^\n]*\.slice\(|recentGlobalEvents[^\n]*\.slice\(|personality\.traits\.slice\(|recentEvents:\s*recentGlobalEvents\.slice\(/, 'NPC store must not reject people or cap behavior, event, or trait semantics')
reject(npcMemory, /memories:[^\n]*\.slice\(|mergedKeywords[^\n]*\.slice\(|important[\s\S]{0,120}\.slice\(|trivialMemories\.slice\(|MEMORY_RETENTION\.trivial\s*\*\s*2[\s\S]{0,120}continue/, 'NPC memory must use complete storage and traceable semantic compression without fixed cuts or silent age deletion')
assertOk(npcMemory.includes('[来源 ${memory.id}]'), 'merged NPC memories must preserve traceable source IDs and complete details')
reject(npcTypes, /MEMORY_SUMMARY_LIMITS|最多保留\s*20/, 'NPC contracts must not advertise destructive memory limits')
reject(celestial, /CELESTIAL_HISTORY_MAX|history\s*=\s*history\.slice\(/, 'celestial history must not be capacity-truncated')
reject(celestialConstants, /CELESTIAL_HISTORY_MAX/, 'base-universe constants must not define a celestial history cap')
reject(era, /history\.length\s*>\s*20|history\s*=\s*this\._state\.history\.slice\(/, 'era history must retain every era transition')
reject(worldMap, /resources[\s\S]{0,160}\.slice\(0,\s*4\)|neighborNames[\s\S]{0,120}\.slice\(0,\s*4\)|sorted\.slice\(0,\s*5\)|notable\.slice\(0,\s*3\)/, 'world-map Prompt summaries must cover every resource, neighbor, faction, and notable relation')
reject(culture, /\.slice\(0,\s*3\)/, 'culture Prompt context must not reduce values to a fixed top three')
reject(art, /getTopWorks|\.slice\(0,\s*limit\)|getTopWorks\(3\)|currentStyles\.length\s*<\s*\d+|currentStyles\.splice\(/, 'art state and Prompt context must preserve all styles and notable works')
reject(causalConstants, /MAX_CAUSAL_QUEUE_SIZE/, 'causal history must not define a fixed pending-queue capacity')
reject(causalSimulation, /pending\.length[\s\S]{0,100}(?:return null|shift\(|splice\()/, 'causal capture must not silently discard anchors because the queue is full')
reject(eventPool, /candidateAudits\.(?:shift|splice)\(|candidateAudits\s*=\s*candidateAudits\.(?:filter|slice)\(/, 'candidate audit history must not be deleted by the internal provider')
assertOk(
  eventPool.includes('不能把候选直接当成已经发生的历史事实')
    && eventPool.includes("status: 'available'"),
  'event candidates must remain non-factual append-only audit inputs until the ledger accepts them',
)
reject(historicalLedgerStore, /(?:events|transitions|evidence|causalEdges|candidateAudits|migrationMetadata)\.(?:shift|splice)\(|(?:events|transitions|evidence|causalEdges|candidateAudits|migrationMetadata)\s*=\s*[^\n]*\.(?:filter|slice)\(/, 'historical ledger truth must not use FIFO, fixed-window, or filtering deletion')
assertOk(
  historicalLedgerStore.includes('events: [...state.events, ...cloneValue(append.events)]')
    && historicalLedgerStore.includes('candidateAudits: [...state.candidateAudits, ...cloneValue(append.candidateAudits)]')
    && historicalLedgerStore.includes('migrationMetadata: [...state.migrationMetadata, ...cloneValue(append.migrationMetadata)]'),
  'historical facts, candidate decisions, and migration evidence must be appended to the owning Store',
)
reject(characterConstants, /DESTINY_PATTERN_(?:MAX_WORLD_SIZE|TOTAL_MAX)_MB/, 'destiny-pattern story data must not retain obsolete storage-cap constants')
reject(mythicPattern, /z\.string\(\)[^\n]*\.max\(|\d+\s*[-—]\s*\d+\s*(?:字|汉字)/, 'mythic narrative rules must not be rejected or shortened by character limits')
reject(destinyPattern, /\d+\s*[-—]\s*\d+\s*(?:字|汉字)|命格描述（\d+/, 'destiny-pattern semantics must not be shortened by character-count guidance')
reject(raceOrigin, /\d+\s*[-—]\s*\d+\s*字/, 'race-origin narrative must not be shortened by a character-count target')
reject(raceOriginCaller, /输出\s*\d+\s*[-—]\s*\d+\s*字|estimatedOutputTokens:\s*80/, 'race-origin token headroom must not be derived from a tight story-length cap')
reject(npcBehaviorPrompt, /\d+\s*[-—]\s*\d+\s*字/, 'NPC behavior narrative must not use a fixed character-count target')
reject(worldCalibration, /worldviewStyleHint:[^\n]*\.max\(|narrativeTone:[^\n]*\.max\(|worldTags:[^\n]*\.max\(/, 'world calibration must not cap narrative style text or world tags')
reject(worldTagsPrompt, /tags:[^\n]*\.max\(|生成5-8个|简洁2-8字/, 'world tag generation must not omit valid tags by fixed counts or character limits')
reject(worldDimensionCalibration, /worldTags：5-8/, 'dimension calibration must request complete world-tag coverage')
assertOk(worldEntityPrompt.includes("version: '1.4.0'"), 'world-entity Prompt must version the complete-description contract')
reject(worldEntityPromptShared, /description:\s*'描述\(\d+[-—]\d+字\)'/, 'world entity descriptions must not be shortened by character-count guidance')
reject(worldCustomize, /WORLD_CUSTOM_TEXT_MAX_LENGTH|maxLength=|value\.slice\(/, 'world description input must not hard-limit user story settings')
reject(worldDimension, /WORLD_CUSTOM_TEXT_MAX_LENGTH|maxLength=|value\.slice\(/, 'custom world dimensions must not hard-limit user story settings')
reject(worldTypes, /WORLD_CUSTOM_TEXT_MAX_LENGTH/, 'world-customize types must not declare a destructive text cap')
reject(worldSelect, /maxLength=\{?5000\}?|value\.slice\(0,\s*5000\)/, 'custom world descriptions must not be truncated at input time')
reject(characterBackground, /maxLength=\{?5000\}?/, 'character background must not be truncated at input time')
reject(worldPrototype, /maxlength=["']5000["']|\/\s*5000/, 'selected world-customize prototype must reflect unlimited semantic input')
reject(characterPrototype, /maxlength=["']120["']|\/\s*120/, 'selected character-create prototype must reflect unlimited semantic input')
assertOk(decisions.includes('PD-015') && decisions.includes('破坏性硬截断'), 'product authority must define the no-hard-truncation red line')
assertOk(
  acceptanceLedger.includes('已由 PD-015 取代')
    && !acceptanceLedger.includes('让拦截器裁掉未来输出中的未完成尾句'),
  'historical acceptance records must mark tail-cutting guidance as superseded by PD-015',
)

// 确定性运行回归：字段真源发现任一非法项或契约外字段后必须整包返回空。
const mixedChanges = [
  { id: 'morality', description: '做出善意选择', changes: { delta: 1 } },
  { id: 'unknown-system', description: '非法变更', changes: { value: 1 } },
]
assertOk(
  mapRawNarrativeChanges(mixedChanges).length === 2,
  'parser mapping must preserve both valid and invalid items before whole-bundle validation',
)
assertOk(
  requireCompletedSummaryContent(`完整事实摘要\n[SUMMARY_COMPLETE]`) === '完整事实摘要',
  'a marked non-empty summary must be accepted without altering its semantic content',
)
for (const incompleteSummary of ['缺少完成标记', '[SUMMARY_COMPLETE]']) {
  let rejectedIncompleteSummary = false
  try {
    requireCompletedSummaryContent(incompleteSummary)
  } catch {
    rejectedIncompleteSummary = true
  }
  assertOk(rejectedIncompleteSummary, 'missing-marker or empty summaries must fail instead of becoming coverage')
}
const originalWarn = console.warn
console.warn = () => {}
try {
  assertOk(validateRoundChanges(mixedChanges).length === 0, 'one invalid change must reject every change in the META bundle')
  assertOk(
    validateRoundChanges([
      { id: 'morality', description: '含契约外字段', changes: { delta: 1, hidden: 2 } },
    ]).length === 0,
    'unknown fields inside one change must reject the complete META bundle',
  )
} finally {
  console.warn = originalWarn
}

if (failed > 0) process.exit(1)
console.log('PASS: no-hard-truncation-audit')
