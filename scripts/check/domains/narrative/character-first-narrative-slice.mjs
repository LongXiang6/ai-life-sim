#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
const jsonMode = process.argv.includes('--json')
const checks = []

function read(relativePath) {
  const filePath = path.join(ROOT, relativePath)
  if (!fs.existsSync(filePath)) throw new Error(`${relativePath}: missing`)
  return fs.readFileSync(filePath, 'utf8')
}

function check(id, systemPath, question, evaluate) {
  try {
    const evidence = evaluate()
    checks.push({ id, systemPath, status: 'pass', question, evidence })
  } catch (error) {
    checks.push({
      id,
      systemPath,
      status: 'fail',
      question,
      evidence: error instanceof Error ? error.message : String(error),
    })
  }
}

function requireFragments(relativePath, fragments) {
  const content = read(relativePath)
  const missing = fragments.filter((fragment) => !content.includes(fragment))
  if (missing.length > 0) throw new Error(`${relativePath}: missing ${missing.join(' | ')}`)
  return `${relativePath}: ${fragments.length} contract fragments present`
}

function requireOrderedFragments(relativePath, fragments) {
  const content = read(relativePath)
  let cursor = -1
  for (const fragment of fragments) {
    const index = content.indexOf(fragment)
    if (index < 0) throw new Error(`${relativePath}: missing ${fragment}`)
    if (index <= cursor) throw new Error(`${relativePath}: route order drifted at ${fragment}`)
    cursor = index
  }
  return `${relativePath}: ${fragments.length} route nodes remain ordered`
}

check(
  'V1',
  'Product/OpeningFlow/RouteComposition',
  'Are the active opening routes registered in user order?',
  () => requireOrderedFragments('src/mods/mod-pages/manifest.ts', [
    "{ path: '/new-game/character-create', page: 'character-create' }",
    "{ path: '/talent-draw', page: 'talent-draw' }",
    "{ path: '/fate-preview', page: 'fate-preview' }",
    "{ path: '/game-story', page: 'game-story' }",
  ]),
)

check(
  'V2',
  'Product/OpeningFlow/CharacterCreation',
  'Does character confirmation write identity, age, base attributes, lifespan, and then navigate?',
  () => requireFragments('src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts', [
    'setName(trimmed)',
    'setGender(gender)',
    'setAge(startingAge)',
    'setCharacterBase({',
    'startingAge,',
    'setLifespan({ race: confirmedRace, maxAge, baseMaxAge: confirmedRace.baseMaxAge })',
    "router.push('/talent-draw')",
  ]),
)

check(
  'V3',
  'Product/OpeningFlow/DestinyPatternSelection',
  'Can the local preset path produce five candidates, select exactly three, write the owner, and navigate?',
  () => requireFragments('src/mods/mod-pages/pages/talent-draw/page.tsx', [
    'generateFromPresets(100)',
    'DESTINY_PATTERN_SELECT_COUNT',
    'getDestinyPatternSystem().selectPatterns',
    'store.setDestinyPatterns({',
    'patterns: selectedPatterns,',
    "router.push('/attribute-alloc')",
  ]),
)

check(
  'V4',
  'Product/OpeningFlow/AttributeAllocation',
  'Does the player allocate the four owned base attributes before fate preview?',
  () => requireFragments('src/mods/mod-pages/pages/attribute-alloc/page.tsx', [
    'const TOTAL_POINTS = 30',
    'const MAX_VALUE = 10',
    'setCharacterBase({',
    "router.push('/fate-preview')",
  ]),
)

check(
  'V5',
  'Product/OpeningFlow/FatePreviewHandoff',
  'Does fate preview gate complete creation, set orchestrator context, commit owner state, and navigate?',
  () => requireFragments('src/mods/mod-pages/pages/fate-preview/page.tsx', [
    'const characterConfirmed = hasConfirmedCharacter',
    'selectedPatterns.length === DESTINY_PATTERN_SELECT_COUNT',
    "worldInitAIStatus?.status === 'complete'",
    'orchestrator.setContext(',
    'orchestrator.applyRoundChanges([',
    'const confirmedBase = { ...characterBase.base }',
    "id: 'character-base'",
    "id: 'destiny-pattern'",
    "id: 'lifespan'",
    "router.push('/game-story')",
  ]),
)

check(
  'V6',
  'Product/Simulation/NarrativeExecution',
  'Does the first advance restore authoritative context, execute the orchestrator, and sync its result?',
  () => requireFragments('src/mods/mod-engine/hooks.ts', [
    'ensureOrchestratorContextFromStores()',
    'orchestrator.start()',
    'await orchestrator.executeRoundV2(',
    'syncOrchestratorToEngineStore()',
  ]),
)

check(
  'V7',
  'Product/Simulation/AIEnvelope',
  'Does the live narrative path use the proxy and a flexible body-plus-optional-summary protocol?',
  () => {
    requireFragments('src/core/ai-service/ai-client.ts', ["fetchWithTimeout('/api/proxy'", 'fetchAIStreamResponse'])
    requireFragments('src/mods/mod-engine/helpers/narrative-response-quality.ts', [
      'parseNarrativeAIDataJson(envelope.dataSection ?? \'\')',
      'envelope.summary',
      'paragraphCount: paragraphs.length',
    ])
    return requireFragments('src/mods/mod-engine/helpers/narrative-ai-protocol.ts', [
      'export const NarrativeAIResponseSchema',
      '状态变更: z.array(NarrativeAIChangeSchema).min(1).optional()',
      '语义信号: NarrativeAISemanticSignalsSchema.optional()',
      '新延迟因果: z.array(NarrativeAIDeferredCausalitySchema).min(1).optional()',
    ])
  },
)

check(
  'V8',
  'Product/Simulation/VisibleNarrative',
  'Does committed narrativeHistory reach the visible timeline and preserve paragraph boundaries?',
  () => {
    requireFragments('src/mods/mod-pages/pages/game-story/page.tsx', [
      'const { narrativeHistory } = useNarrative()',
      '<NarrativeTimeline',
      'entries={narrativeEntries}',
      'onAdvance={handleNarrativeAdvance}',
      'advanceText={narrativeAdvanceText}',
      'advanceHint={narrativeAdvanceHint}',
    ])
    return requireFragments('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx', [
      'function splitNarrativeParagraphs',
      'entries[i]',
      'splitNarrativeParagraphs(entry.text).map',
    ])
  },
)

check(
  'V9',
  'Product/OpeningFlow/PersistenceBoundary',
  'Are the four persistent stores explicitly versioned for repeatable browser setup?',
  () => {
    const stores = [
      ['src/mods/mod-world/store.ts', "name: 'mod-world:persist:world-state'", 'version: 6'],
      ['src/mods/mod-settings/store.ts', "name: 'mod-settings:store'", 'version: 8'],
      ['src/mods/mod-character/store.ts', "name: 'mod-character:persist:character-state'", 'version: 3'],
      ['src/mods/mod-engine/store.ts', "name: 'mod-engine:persist:engine-state'", 'version: 2'],
    ]
    for (const [relativePath, name, version] of stores) requireFragments(relativePath, [name, version])
    return `${stores.length} persisted store contracts present`
  },
)

const failed = checks.filter((item) => item.status === 'fail')

if (jsonMode) {
  console.log(JSON.stringify({ status: failed.length === 0 ? 'pass' : 'fail', checks }, null, 2))
} else {
  for (const item of checks) {
    console.log(`[creation-first-narrative] ${item.status.toUpperCase()} ${item.id} ${item.systemPath}`)
    console.log(`  ${item.evidence}`)
  }
  console.log(`[creation-first-narrative] static vertical slice ${checks.length - failed.length}/${checks.length} passed`)
  console.log('[creation-first-narrative] static evidence does not replace the optional real-browser runner')
}

if (failed.length > 0) process.exitCode = 1
