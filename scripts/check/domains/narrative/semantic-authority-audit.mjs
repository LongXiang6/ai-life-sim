/**
 * Purpose: Audit active narrative semantic authority against validated AI META ownership.
 * Owner: quality:narrative
 * Responsibility: Static semantic-authority assertions only; story-text inference is forbidden.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readDirectorySource, readModuleSource } from '../../lib/read-module-source.mjs'
import {
  NarrativeRoundMetadataSchema,
  createNeutralNarrativeSemanticSignals,
} from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'
import {
  NarrativeAIBasicAttributeAnalysisDataSchema,
  NarrativeAIDataAnalysisDataSchema,
  NarrativeAIEventRecognitionDataSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import {
  NarrativeAIMacroImpactDataSchema,
} from '../../../../src/mods/mod-engine/helpers/narrative-macro-impact-context.ts'

const root = getProjectRoot(import.meta.url)
let failed = 0

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  failed++
}

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) fail(message)
}

function assertExcludes(source, forbidden, message) {
  if (source.includes(forbidden)) fail(message)
}

const activeFiles = {
  orchestrator: readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root),
  campaign: read('src/mods/mod-engine/campaigns/default/index.ts'),
  hints: read('src/mods/mod-engine/helpers/narrative-hints.ts'),
  parser: read('src/mods/mod-engine/subsystems/narrative-parser-system.ts'),
  prompt: read('src/mods/mod-engine/prompts/narrative-prompt.ts'),
  promptComponents: read('src/mods/mod-engine/server/narrative-system-prompt.ts'),
  dataAnalysisPromptComponents: read('src/mods/mod-engine/server/narrative-data-analysis-system-prompt.ts'),
  basicAttributePromptComponents: read('src/mods/mod-engine/server/narrative-basic-attribute-system-prompt.ts'),
  eventRecognitionPromptComponents: read('src/mods/mod-engine/server/narrative-event-recognition-system-prompt.ts'),
  macroImpactPromptComponents: read('src/mods/mod-engine/server/narrative-macro-impact-system-prompt.ts'),
  aiProtocol: read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts'),
  plot: read('src/mods/mod-engine/subsystems/plot-structure-system.ts'),
  memory: readModuleSource('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts', root),
  summary: readModuleSource('src/mods/mod-engine/subsystems/summary-compressor-system.ts', root),
  digest: read('src/mods/mod-engine/helpers/digest-ledger.ts'),
  characterBase: readModuleSource('src/mods/mod-character/subsystems/character-base-system.ts', root),
  characterCreate: readDirectorySource('src/mods/mod-pages/pages/character-create', root),
  fatePreview: readDirectorySource('src/mods/mod-pages/pages/fate-preview', root),
}

const forbiddenByFile = {
  orchestrator: [
    'runPostNarrativePhase',
    'runNarrativePostProcessing',
    'countConsecutiveConflictRounds(',
    'setAIRoundImportance(',
    'setAIArcStatus(',
    'checkResolution(',
    'classifyActionScale(',
    'determineLocalDirection(',
    'checkForforgetting(',
    'extractFromNarrative(',
  ],
  campaign: ['runNarrativePostProcessing('],
  hints: [
    'SMALL_ACTION_KEYWORDS',
    'LARGE_ACTION_KEYWORDS',
    'MULTI_STEP_KEYWORDS',
    'classifyActionScale',
    'marriageKeywords',
    'sideQuestPatterns',
    'hasDisease',
  ],
  plot: ['TENSION_KEYWORDS'],
  memory: [
    'HIGH_KEYWORDS',
    'NORMAL_KEYWORDS',
    'LOW_KEYWORDS',
    'CLOSURE_PATTERNS',
    'rateImportance(',
    'detectClosure(',
  ],
  summary: ['rateImportance('],
  digest: ['extractEntities(ev.text)'],
  characterBase: ['detectStartingAge('],
  characterCreate: [
    'detectStartingAge(',
    'LIFESPAN_BG_BONUS_KEYWORDS',
    'background.includes(',
  ],
}

for (const [file, forbiddenValues] of Object.entries(forbiddenByFile)) {
  for (const forbidden of forbiddenValues) {
    assertExcludes(
      activeFiles[file],
      forbidden,
      `${file} must not contain active text-semantic inference: ${forbidden}`,
    )
  }
}

if (fs.existsSync(path.join(root, 'src/mods/mod-engine/helpers/post-narrative-processor.ts'))) {
  fail('legacy post-narrative text scanner must remain removed')
}

for (const field of ['语义信号', '叙事语域', '关系变化', '已回收伏笔编号']) {
  assertIncludes(activeFiles.aiProtocol, field, `Chinese narrative protocol missing structured field ${field}`)
}
for (const register of ['生活', '命运', '传承']) {
  assertIncludes(
    activeFiles.aiProtocol,
    `'${register}'`,
    `narrative prompt must define the ${register} register`,
  )
}
assertIncludes(activeFiles.aiProtocol, 'AI_NARRATIVE_REGISTERS = createEnumTranslator', 'prompt register values must come from the Chinese translation authority')
assertIncludes(activeFiles.prompt, "version: '5.8.3'", 'pure narrative contract must use Prompt version 5.8.3')
assertIncludes(
  activeFiles.dataAnalysisPromptComponents,
  '没有变化的系统省略整段',
  'AI-visible optional system changes must omit empty segments instead of emitting noise',
)
if (/关系变化\s*:\s*\{\s*shape\s*:/.test(activeFiles.aiProtocol)) {
  fail('Chinese relationship updates must not be modeled as a shape/types wrapper object')
}
assertIncludes(
  activeFiles.dataAnalysisPromptComponents,
  '只有通用关系系统的解除操作使用空变更对象',
  'prompt must reserve the only empty-object payload for relationship termination',
)
assertIncludes(
  activeFiles.parser,
  'NarrativeRoundMetadataSchema.parse({',
  'event-recognition metadata must validate against its independent round schema',
)
assertIncludes(
  activeFiles.parser,
  'validateNarrativeEventMetadataForNarrative(',
  'parser must validate event metadata against the accepted main-narrative branch contract',
)
assertExcludes(
  activeFiles.parser,
  'combineNarrativeBackgroundAnalysis(',
  'retired combined narrative/background response boundary must remain removed',
)
assertIncludes(
  activeFiles.orchestrator,
  'if (parsed.semanticSignals)',
  'orchestrator must apply semantic side effects only when validated settlement metadata exists',
)
assertIncludes(
  activeFiles.orchestrator,
  'acceptNarrativeResponse(\n    parsed: ParsedNarrative,\n    playerChoice?: string,',
  'orchestrator must accept the validated main narrative with the exact delivered one-shot action',
)
assertIncludes(
  activeFiles.orchestrator,
  'launchNarrativeBackgroundAnalysis<TResult>',
  'orchestrator must register independently versioned background results',
)

for (const call of [
  'plotStructure.recordNarrativeSignals(',
  'memoryLifecycle.setAISemanticAnalysis(',
  'memoryLifecycle.recordRelationshipUpdates(',
  'foreshadowing.resolveForeshadowing(',
]) {
  assertIncludes(activeFiles.orchestrator, call, `orchestrator missing structured consumer ${call}`)
}

assertIncludes(
  activeFiles.fatePreview,
  'startingAge,\n      status: undefined,',
  'fate preview must hydrate character-base from the confirmed creation draft',
)
assertIncludes(
  activeFiles.digest,
  'new Set(ev.entities ?? [])',
  'digest chaining must use only AI-provided entities',
)

const validMetadata = {
  importance: 'NORMAL',
  digest: '日常的一天过去。',
  keyEvents: [{ text: '完成日常工作', importance: 20 }],
  arcStatus: 'ongoing',
  semanticSignals: {
    eventType: 'routine',
    conflictIntensity: 0,
    tensionDelta: -1,
    actionScale: 'small',
    irreversible: false,
    impactScope: 'personal',
    narrativeRegister: 'life',
    registerReason: '普通生活推进',
    arcType: 'none',
    relationshipUpdates: [],
    resolvedForeshadowingIds: [],
  },
}

if (!NarrativeRoundMetadataSchema.safeParse(validMetadata).success) {
  fail('valid narrative metadata must pass schema validation')
}

if (NarrativeRoundMetadataSchema.safeParse({ ...validMetadata, changes: [] }).success) {
  fail('event-recognition metadata must not absorb system changes from another AI owner')
}

const wrappedRelationships = structuredClone(validMetadata)
wrappedRelationships.semanticSignals.relationshipUpdates = { shape: [] }
if (NarrativeRoundMetadataSchema.safeParse(wrappedRelationships).success) {
  fail('shape/types wrapped relationshipUpdates must fail the event metadata schema')
}

const validSystemInstruction = {
  系统: '角色状态',
  目标对象: 'player:current',
  目标上下文: 'context:world-a',
  操作: '调整属性',
  说明: '长期训练已经形成稳定体魄变化。',
  变更: { 体魄变化: 1 },
  依据事件: [],
}
if (!NarrativeAIDataAnalysisDataSchema.safeParse({ 系统操作: [validSystemInstruction] }).success) {
  fail('data-analysis schema must independently accept its own strict system-operation root')
}
if (!NarrativeAIBasicAttributeAnalysisDataSchema.safeParse({ 系统操作: [validSystemInstruction] }).success) {
  fail('basic-attribute schema must independently accept one valid player-base increment')
}
if (!NarrativeAIEventRecognitionDataSchema.safeParse({
  回合事件: { 摘要: '日常的一天过去。', 注册事件: [] },
  待触发事件: [],
}).success) {
  fail('event-recognition schema must independently accept occurred metadata and an empty future-candidate list')
}
if (!NarrativeAIMacroImpactDataSchema.safeParse({ 影响链: [] }).success) {
  fail('macro-impact schema must independently accept an empty verified-impact DAG')
}
if (NarrativeAIDataAnalysisDataSchema.safeParse({
  系统操作: [{ id: 'character-base', description: 'test', fields: { mindDelta: 1 } }],
}).success) {
  fail('legacy fields-shaped changes must fail the independent data-analysis schema')
}
if (NarrativeAIDataAnalysisDataSchema.safeParse({
  系统操作: [],
  回合事件: { 摘要: '越权字段', 注册事件: [] },
}).success) {
  fail('data-analysis schema must reject event-recognition fields from another owner')
}

const missingEntities = structuredClone(validMetadata)
missingEntities.keyEvents[0].entities = []
if (NarrativeRoundMetadataSchema.safeParse(missingEntities).success) {
  fail('empty keyEvents.entities must fail; no entities should omit the field')
}

const invalidConflict = structuredClone(validMetadata)
invalidConflict.semanticSignals.conflictIntensity = 101
if (NarrativeRoundMetadataSchema.safeParse(invalidConflict).success) {
  fail('out-of-range conflict intensity must fail validation')
}

const neutral = createNeutralNarrativeSemanticSignals()
if (
  neutral.narrativeRegister !== 'life'
  || neutral.conflictIntensity !== 0
  || neutral.relationshipUpdates.length !== 0
  || neutral.resolvedForeshadowingIds.length !== 0
) {
  fail('neutral semantic fallback must be identifiable and non-inferential')
}

assertExcludes(
  activeFiles.prompt,
  'examples: [',
  'the live schema and register rules must not be duplicated into costly few-shot examples',
)
if (failed > 0) process.exit(1)
console.log('PASS: semantic-authority-audit')
