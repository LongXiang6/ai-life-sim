/**
 * Active narrative semantic authority audit.
 * Semantic decisions must come from validated AI META, never story-text scanning.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import {
  NarrativeResponseSchema,
  NarrativeRoundMetadataSchema,
  createNeutralNarrativeSemanticSignals,
} from '../../../../src/mods/mod-engine/helpers/narrative-semantic-signals.ts'

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
  orchestrator: read('src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  campaign: read('src/mods/mod-engine/campaigns/default/index.ts'),
  hints: read('src/mods/mod-engine/helpers/narrative-hints.ts'),
  archetypes: read('src/mods/mod-engine/helpers/life-stage-archetypes.ts'),
  parser: read('src/mods/mod-engine/helpers/parse-strategies.ts'),
  prompt: read('src/mods/mod-engine/prompts/narrative-prompt.ts'),
  promptComponents: read('src/mods/mod-engine/server/narrative-system-prompt.ts'),
  aiProtocol: read('src/mods/mod-engine/helpers/narrative-ai-protocol.ts'),
  plot: read('src/mods/mod-engine/subsystems/plot-structure-system.ts'),
  memory: read('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'),
  summary: read('src/mods/mod-engine/subsystems/summary-compressor-system.ts'),
  digest: read('src/mods/mod-engine/helpers/digest-ledger.ts'),
  lifespan: read('src/mods/mod-character/subsystems/lifespan-system.ts'),
  characterBase: read('src/mods/mod-character/subsystems/character-base-system.ts'),
  characterCreate: read('src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts'),
  fatePreview: read('src/mods/mod-pages/pages/fate-preview/page.tsx'),
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
  archetypes: [
    'BATTLE_KEYWORDS',
    'isLastEventConflict',
    'countConsecutiveConflictRounds',
    'PEACEFUL_GOAL_KEYWORDS',
    'isPlayerGoalPeaceful',
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
  lifespan: [
    'lastNarrativeText',
    'LIFESPAN_NARRATIVE_REDUCTION_ENABLED',
    'LIFESPAN_REDUCTION_KEYWORDS',
    'LIFESPAN_BG_BONUS_KEYWORDS',
  ],
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
assertIncludes(activeFiles.prompt, "version: '4.6.1'", 'latest narrative attention and repair contract must use Prompt version 4.6.1')
assertIncludes(
  activeFiles.promptComponents,
  '无内容、无变化时省略整个字段',
  'AI-visible optional data must omit empty fields instead of emitting noise',
)
if (/关系变化\s*:\s*\{\s*shape\s*:/.test(activeFiles.aiProtocol)) {
  fail('Chinese relationship updates must not be modeled as a shape/types wrapper object')
}
assertIncludes(
  activeFiles.promptComponents,
  '禁止空数组、空对象、空字符串和 null',
  'prompt must require omission instead of noisy empty fields',
)
assertIncludes(
  activeFiles.parser,
  'NarrativeResponseSchema.safeParse(metadataCandidate)',
  'parser must validate the complete semantic metadata and raw change bundle together',
)
assertIncludes(
  activeFiles.parser,
  'metadataRejected: metadataRejectedOverride || Boolean(metadataResult && !metadataResult.success)',
  'parser must expose complete META rejection to the whole-package interceptor',
)
assertIncludes(
  activeFiles.orchestrator,
  'if (hasValidatedSemanticMetadata)',
  'orchestrator must gate semantic side effects on complete metadata validation',
)

for (const call of [
  'plotStructure.recordNarrativeSignals(',
  'memoryLifecycle.setAISemanticAnalysis(',
  'coreMemory.recordRelationshipUpdates(',
  'foreshadowing.resolveForeshadowing(',
]) {
  assertIncludes(activeFiles.orchestrator, call, `orchestrator missing structured consumer ${call}`)
}

assertIncludes(
  activeFiles.lifespan,
  'typeof ch.lifespanDelta ===',
  'lifespan must consume structured lifespanDelta',
)
assertIncludes(
  activeFiles.fatePreview,
  'maxAge: lifespan.maxAge',
  'fate preview must commit the explicit character-creation lifespan',
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

const validResponse = { ...validMetadata, changes: [] }
if (!NarrativeResponseSchema.safeParse(validResponse).success) {
  fail('valid tagged narrative META must pass the complete response schema')
}

const wrappedRelationships = structuredClone(validResponse)
wrappedRelationships.semanticSignals.relationshipUpdates = { shape: [] }
if (NarrativeResponseSchema.safeParse(wrappedRelationships).success) {
  fail('shape/types wrapped relationshipUpdates must fail the complete response schema')
}

const legacyChangeFields = structuredClone(validResponse)
legacyChangeFields.changes = [{ id: 'character-base', description: 'test', fields: { mindDelta: 1 } }]
if (NarrativeResponseSchema.safeParse(legacyChangeFields).success) {
  fail('legacy fields-shaped changes must fail instead of entering pre-generation cache')
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
