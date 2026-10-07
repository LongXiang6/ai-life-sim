#!/usr/bin/env node
/**
 * Purpose: Verify the character-first opening and live narrative path through static contract fragments.
 * Owner: quality:narrative
 * Responsibility: Focused product-slice evidence only; runtime systems own the verified behavior.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'

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

function forbidFragments(relativePath, fragments) {
  const content = read(relativePath)
  const present = fragments.filter((fragment) => content.includes(fragment))
  if (present.length > 0) throw new Error(`${relativePath}: forbidden ${present.join(' | ')}`)
  return `${relativePath}: ${fragments.length} retired contract fragments absent`
}

function requireModuleFragments(relativePath, fragments) {
  const content = readModuleSource(relativePath, ROOT)
  const missing = fragments.filter((fragment) => !content.includes(fragment))
  if (missing.length > 0) throw new Error(`${relativePath}: missing ${missing.join(' | ')}`)
  return `${relativePath}: ${fragments.length} module contract fragments present`
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
  () => {
    requireFragments('src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts', [
      'setName(trimmed)',
      'setGender(gender)',
      'setAge(startingAge)',
      'setCharacterBase({',
      'startingAge,',
      'setLifespanDraft({ raceId: race, race: confirmedRace, maximumLifespanYears: maxAge })',
      'prepareCachedTalentDrawSelection()',
      "router.push('/talent-draw')",
    ])
    return requireModuleFragments('src/mods/mod-pages/pages/talent-draw/talent-draw-storage.ts', [
      'export function prepareCachedTalentDrawSelection',
      "if (initial.phase !== 'selecting') return",
      "persistTalentDrawState('selecting', initial.slots, initial.loadoutSlots)",
    ])
  },
)

check(
  'V3',
  'Product/OpeningFlow/DestinyPatternSelection',
  'Can the local preset path produce five classified categories, fill four shared slots, write the owner, and navigate?',
  () => requireModuleFragments('src/mods/mod-pages/pages/talent-draw/page.tsx', [
    'useTalentDrawGeneration',
    'DESTINY_PATTERN_DISPLAY_COUNT',
    'PATTERN_LOADOUT_SLOT_COUNT',
    'selection.handleConfirm()',
    'router.prefetch(\'/attribute-alloc\')',
    'TalentDrawSelectionView',
  ]),
)

check(
  'V4',
  'Product/OpeningFlow/AttributeAllocation',
  'Does the player allocate the four owned base attributes before fate preview?',
  () => requireFragments('src/mods/mod-pages/pages/attribute-alloc/page.tsx', [
     'const TOTAL_POINTS = 4',
    'const effectiveValue = value + bonus',
     'nextUsedPoints > TOTAL_POINTS',
     'setCharacterBase({ base: normalizeAttributes(attributes) })',
    'setCharacterBase({',
    "router.push('/fate-preview')",
  ]),
)

check(
  'V5',
  'Product/OpeningFlow/FatePreviewHandoff',
  'Does fate preview gate complete creation, restore the engine context from confirmed Store state, and navigate without a destiny re-commit?',
  () => {
    requireFragments('src/mods/mod-pages/pages/fate-preview/page.tsx', [
      'const characterConfirmed = hasConfirmedCharacter',
      'const patternLoadoutConfirmed = isPatternLoadoutComplete(selectedPatterns, equippedReincarnationTalents)',
       'const worldReady = worldInitialized && !!worldConfig && worldCode > 0',
      'useFatePreviewStart',
      'const runtimeGateReason = allModsLoaded ? null',
      'confirmDisabled={Boolean(creationGateReason || runtimeGateReason || isStarting) || !worldReady}',
    ])
    requireFragments('src/mods/mod-pages/pages/fate-preview/useFatePreviewStart.ts', [
      'ensureOrchestratorContextFromStores()',
      'if (isStarting || !characterConfirmed || !patternLoadoutConfirmed || !worldReady) return',
      'allModsLoaded',
      "setGamePhase('simulation')",
      "router.push('/game-story')",
    ])
    return forbidFragments('src/mods/mod-pages/pages/fate-preview/useFatePreviewStart.ts', [
      'orchestrator.applyRoundChanges([',
      "id: 'destiny-pattern'",
      'MAX_CREATION_COMMIT_ATTEMPTS',
      'isTransientCreationCommitReason',
      '命格系统尚未准备完成',
    ])
  },
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
   'Does the live narrative path use the proxy and the strict 01 plus parallel 02/03 protocol?',
  () => {
    requireModuleFragments('src/core/ai-service/ai-client/http-transport.ts', ["fetchWithDeadline('/api/proxy'"])
    requireFragments('src/mods/mod-engine/helpers/narrative-response-quality.ts', [
      'const parsed = narrativeParser.parse(content, {',
      'terminalGuidance,',
      'currentAttributes: extractCurrentNarrativeAttributes(terminalGuidance),',
      'parseNarrativeAIJson(content)',
      'NarrativeAITalentGrowthDataSchema.parse(',
      'const rawMemory = envelope.本轮剧情',
      'const rawFutureEvents = envelope.未来事件',
      'NarrativeAIStoryContinuityDataSchema.parse({ 本轮剧情: memory, 未来事件: futureEvents })',
    ])
    requireFragments('src/mods/mod-engine/helpers/narrative-ai-protocol.ts', [
      'export const NarrativeAIStoryResultSchema',
      'export const NarrativeAIStoryContinuityDataSchema',
      'export const NarrativeAITalentGrowthDataSchema',
    ])
    return requireFragments('src/mods/mod-engine/campaigns/default/index.ts', [
      "name: 'ai-narration'",
      "name: 'prepare-narrative'",
      "name: 'ai-story-continuity'",
      "name: 'ai-talent-growth'",
      "name: 'commit-round'",
    ])
  },
)

check(
  'V8',
  'Product/Simulation/VisibleNarrative',
  'Does committed narrativeHistory reach the visible timeline and preserve paragraph boundaries?',
  () => {
    requireModuleFragments('src/mods/mod-pages/pages/game-story/page.tsx', [
      'useGameStoryPresentation',
      'narrativeEntries',
      'onAdvance: handleNarrativeAdvance',
      'advanceText: narrativeAdvanceText',
      'advanceHint: narrativeAdvanceHint',
    ])
    return requireModuleFragments('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx', [
      'const eventElements = useMemo',
      'const entry = entries[index]!',
      'NarrativeTimelineEntryView',
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
      ['src/mods/mod-settings/store.ts', "name: 'mod-settings:store'", 'version: 15'],
      ['src/mods/mod-character/store.ts', "name: 'mod-character:persist:character-state'", 'version: 9'],
      ['src/mods/mod-engine/store.ts', "name: 'mod-engine:persist:engine-state'", 'ENGINE_STORE_SCHEMA_VERSION = 10'],
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
