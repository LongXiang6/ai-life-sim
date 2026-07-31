/**
 * MVP 运行时子系统状态回归。
 *
 * 保护以下权威链：创建流程/Store -> loader 单例 -> orchestrator 快照 ->
 * 同轮提交后同步/存档 -> 读档私有状态恢复，并确保预生成不污染真实状态。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

function read(rel) {
  // PowerShell/Windows checkouts may retain CRLF.  Normalize here so the
  // regression contract checks source semantics rather than line endings.
  return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')
}

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}

function assertIncludes(source, expected, message) {
  assertOk(source.includes(expected), message)
}

function walkSourceFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkSourceFiles(absolute))
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      results.push(absolute)
    }
  }
  return results
}

const activeSubsystems = [
  {
    id: 'world-entity',
    className: 'WorldEntitySystem',
    file: 'src/mods/mod-world/subsystems/world-entity-system.ts',
    previewMutable: false,
    requiresCollectedStateHydration: true,
  },
  {
    id: 'relationship-system',
    className: 'RelationshipSystem',
    file: 'src/mods/mod-social/subsystems/relationship-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'npc-system',
    className: 'NpcSystem',
    file: 'src/mods/mod-npc/subsystems/npc-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'geography',
    className: 'GeographySystem',
    file: 'src/mods/mod-environment-ecology/subsystems/geography-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'natural-resource',
    className: 'NaturalResourceSystem',
    file: 'src/mods/mod-environment-ecology/subsystems/natural-resource-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'growth-system',
    className: 'GrowthSystem',
    file: 'src/mods/mod-progression/subsystems/growth-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'achievement',
    className: 'AchievementSystem',
    file: 'src/mods/mod-progression/subsystems/achievement-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'reputation',
    className: 'ReputationSystem',
    file: 'src/mods/mod-progression/subsystems/reputation-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'character-base',
    className: 'CharacterBaseSystem',
    file: 'src/mods/mod-character/subsystems/character-base-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: true,
  },
  {
    id: 'destiny-pattern',
    className: 'DestinyPatternSystem',
    file: 'src/mods/mod-character/subsystems/destiny-pattern-system.ts',
    previewMutable: false,
    requiresCollectedStateHydration: true,
  },
  {
    id: 'lifespan',
    className: 'LifespanSystem',
    file: 'src/mods/mod-character/subsystems/lifespan-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'lifecycle-system',
    className: 'LifecycleSystem',
    file: 'src/mods/mod-character/subsystems/lifecycle-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'health',
    className: 'HealthSystem',
    file: 'src/mods/mod-character/subsystems/health-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
  },
  {
    id: 'luck',
    className: 'LuckSystem',
    file: 'src/mods/mod-character/subsystems/luck-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: false,
    requiresPersistentSnapshot: true,
  },
  {
    id: 'morality',
    className: 'MoralitySystem',
    file: 'src/mods/mod-character/subsystems/morality-system.ts',
    previewMutable: true,
    requiresCollectedStateHydration: true,
  },
]

const expectedExternalRuntime = [
  'world-context-registry',
  'contextual-capability-profile',
  'spatial-graph',
  'context-transition',
  'simulation-scope-policy',
  'world-init',
  'historical-event-ledger',
  'world-entity', 'relationship-system', 'npc-system', 'geography', 'natural-resource',
  'climate', 'ecology', 'pollution', 'growth-system', 'achievement', 'reputation',
  'character-base', 'destiny-pattern', 'lifespan', 'lifecycle-system', 'health', 'luck',
  'morality', 'celestial', 'era', 'fate-prophecy', 'divine-creation', 'economy',
  'population', 'settlement', 'work', 'item', 'culture', 'art', 'education', 'works',
  'social-stratification', 'faction-dynamics', 'legal', 'conflict-cycle', 'culture-tech',
  'combat-power', 'cultivation', 'monster', 'fortune-encounter', 'faith',
  'divine-intervention', 'anomaly-phenomena',
]

const mvpConfig = JSON.parse(read('src/mods/mod-engine/helpers/mvp-stages-config.default.json'))
const externalRuntime = mvpConfig?.stages?.[mvpConfig.currentStage]?.runtime?.external ?? []
assertOk(
  JSON.stringify(externalRuntime) === JSON.stringify(expectedExternalRuntime),
  'current external runtime whitelist must keep P0-P8 systems in canonical order',
)
assertOk(
  externalRuntime.includes('health') && externalRuntime.includes('lifecycle-system'),
  'P5 health and lifecycle owners must be active in the MVP runtime whitelist',
)

const sourceFiles = walkSourceFiles(path.join(root, 'src'))
for (const subsystem of activeSubsystems) {
  const source = read(subsystem.file)
  const getterName = `get${subsystem.className}`
  assertIncludes(source, `export function ${getterName}()`, `${subsystem.id} must export a lazy runtime getter`)
  if (subsystem.requiresCollectedStateHydration) {
    assertIncludes(source, 'hydrateFromStore()', `${subsystem.id} must hydrate creation/persisted Store data`)
    assertIncludes(source, 'restoreCollectedState(', `${subsystem.id} must restore orchestrator collected data`)
  }
  if (subsystem.requiresPersistentSnapshot) {
    assertIncludes(source, 'capturePersistenceState()', `${subsystem.id} must expose its owning persistence snapshot`)
    assertIncludes(source, 'restorePersistenceState(', `${subsystem.id} must restore its owning persistence snapshot`)
  }
  if (subsystem.previewMutable) {
    assertIncludes(source, 'capturePreviewState()', `${subsystem.id} must capture preview-mutated private state`)
    assertIncludes(source, 'restorePreviewState(', `${subsystem.id} must restore preview-mutated private state`)
  }

  const constructors = []
  for (const absolute of sourceFiles) {
    const text = fs.readFileSync(absolute, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (line.includes(`new ${subsystem.className}(`)) {
        constructors.push({
          file: path.relative(root, absolute).replaceAll('\\', '/'),
          line: index + 1,
          text: line.trim(),
        })
      }
    })
  }
  assertOk(
    constructors.length === 1
      && constructors[0].file === subsystem.file
      && constructors[0].text.includes('??='),
    `${subsystem.id} must only be constructed inside its lazy runtime getter; found ${constructors
      .map((item) => `${item.file}:${item.line}`)
      .join(', ') || 'none'}`,
  )
}

const registration = read('src/mods/mod-engine/bootstrap/register-subsystems.ts')
const getterLookupIndex = registration.indexOf('const getterName = `get${className}`')
const constructorLookupIndex = registration.indexOf('const ClassCtor = modExports[className]')
assertOk(
  getterLookupIndex >= 0 && constructorLookupIndex > getterLookupIndex,
  'loader registration must resolve the module getter before falling back to a constructor',
)

const runtimePolicy = read('src/mods/mod-engine/helpers/mvp-runtime-policy.ts')
assertIncludes(
  runtimePolicy,
  'export function getMissingMvpExternalRuntimeSubsystemIds(',
  'runtime policy must expose one canonical missing-subsystem check for guarded entry points',
)
assertIncludes(
  runtimePolicy,
  'export function resolveMvpRuntimeReadiness(',
  'runtime policy must expose one canonical loader-plus-binding readiness resolver',
)

const destinyAccess = read('src/mods/mod-character/destiny-pattern-access.ts')
assertIncludes(
  destinyAccess,
  "export { getDestinyPatternSystem } from './subsystems/destiny-pattern-system'",
  'destiny public access must re-export the loader-owned singleton getter',
)
assertOk(
  !destinyAccess.includes('new DestinyPatternSystem('),
  'destiny public access must not create a second subsystem instance',
)

const worldBundle = read('src/mods/mod-world/world-init-bundle.ts')
const worldPipeline = read('src/mods/mod-world/utils/world-init-pipeline.ts')
assertIncludes(worldBundle, 'const entitySystem = getWorldEntitySystem()', 'local world commit must use the runtime entity singleton')
assertIncludes(worldBundle, 'entitySystem.reset()', 'starting a world must clear the shared entity singleton before rebuilding it')
assertIncludes(worldPipeline, 'const entitySystem = getWorldEntitySystem()', 'world AI pipeline must use the runtime entity singleton')

const orchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const engineHooks = read('src/mods/mod-engine/hooks.ts')
for (const expected of [
  'subsystemPreviewStates: Record<string, unknown>',
  'subsystemPreviewStates: this.captureSubsystemPreviewStates()',
  'this.restoreSubsystemPreviewStates(snap.subsystemPreviewStates)',
  'this.restoreSubsystemsFromCollectedStates(this.lastSubsystemStates)',
  'hydrateSubsystemsFromStores(): void',
]) {
  assertIncludes(orchestrator, expected, `orchestrator missing runtime-state wiring: ${expected}`)
}
assertOk(
  (orchestrator.match(/this\.restoreSubsystemPreviewStates\(snap\.subsystemPreviewStates\)/g) ?? []).length >= 2,
  'both normal preview restore and invalidated-preview reconcile must restore external private state',
)
assertOk(
  /this\.lastNarratedTimeStep = \{ \.\.\.this\.state\.timeStep \}\s*this\.collectSubsystemStates\(false, false\)/s.test(orchestrator),
  'narrative commit must refresh lastSubsystemStates in the same round without duplicating relevance',
)
assertOk(
  !/this\.lastNarratedTimeStep = \{ \.\.\.this\.state\.timeStep \}[\s\S]{0,160}this\.syncBranchIntentProjectionToEngineStore\(\)/.test(orchestrator),
  'narrative settlement must not validate the branch projection before EngineStore receives the committed history',
)
const historySyncIndex = engineHooks.indexOf('narrativeHistory: mergedHistory')
const projectionSyncIndex = engineHooks.indexOf(
  'useEngineStore.getState().setBranchIntentProjection({',
  historySyncIndex,
)
assertOk(
  historySyncIndex >= 0 && projectionSyncIndex > historySyncIndex,
  'the unified Store sync must persist narrative history before validating the derived branch projection',
)
assertOk(
  !/source === 'manual'[\s\S]*?this\.collectSubsystemStates\(false, false\)/.test(orchestrator),
  'round-zero manual creation commits must not run collect-time subsystem side effects',
)
assertIncludes(orchestrator, 'subsystem.reset()', 'new-life reset must clear every registered external subsystem')
assertIncludes(orchestrator, 'timeSystem.reset()', 'new-life reset must clear canonical time state')
assertIncludes(orchestrator, 'totalDays: 0', 'fresh orchestrator time must start at canonical day zero')
assertIncludes(
  orchestrator,
  'summaryCompressor.restoreFromEngineState(',
  'read/refresh restore must hydrate summary-compressor private state',
)
assertIncludes(orchestrator, 'coreMemory.hydrateFromStore()', 'read/refresh restore must hydrate core-memory private state')
for (const [pattern, label] of [
  [/memoryLifecycle\.setAISemanticAnalysis\(\s*roundSequence,/, 'memoryLifecycle.setAISemanticAnalysis'],
  [/coreMemory\.recordRelationshipUpdates\(\s*parsed\.semanticSignals\.relationshipUpdates,\s*roundSequence,/, 'coreMemory.recordRelationshipUpdates'],
  [/foreshadowing\.detectForeshadowing\(\s*roundSequence,/, 'foreshadowing.detectForeshadowing'],
  [/round:\s*roundSequence,/, 'round: roundSequence'],
  [/const roundSequence = this\.state\.totalRounds/, 'const roundSequence = this.state.totalRounds'],
]) {
  assertOk(pattern.test(orchestrator), `round-indexed narrative state must use totalRounds: ${label}`)
}
assertOk(
  !/memoryLifecycle\.setAISemanticAnalysis\(\s*this\.state\.round\.year/.test(orchestrator),
  'memory semantic maps must not use calendar year as their unique round key',
)
assertOk(
  /for \(const subsystem of \[plotStructure, foreshadowing\]\)[\s\S]{0,220}subsystem\.collectState\(context\)/.test(orchestrator),
  'plot structure and foreshadowing clocks must advance inside every real/preview round collection',
)
assertOk(
  orchestrator.includes('private getInternalStatefulSubsystems(): ISubSystem[]')
    && ['memoryEngine', 'subsystemRelevance', 'memoryLifecycle', 'memoryForgetting', 'causalDelay', 'plotStructure', 'foreshadowing', 'coreMemory']
      .every((subsystem) => orchestrator.includes(`      ${subsystem},`))
    && orchestrator.includes('engineSubsystemStates: this.captureInternalSubsystemStates()')
    && orchestrator.includes('subsystemPreviewStates: this.captureSubsystemPreviewStates()'),
  'preview snapshots must include mutable internal narrative state and retrieval statistics',
)
assertIncludes(orchestrator, 'engineStoreRuntime: Pick<', 'preview snapshots must preserve Store-only runtime fields')
assertIncludes(orchestrator, 'useEngineStore.setState(snap.engineStoreRuntime)', 'normal preview restore must restore Store-only runtime fields')
assertIncludes(orchestrator, 'private pendingCompression: Promise<void> | null = null', 'orchestrator must track in-flight summary compression')
assertIncludes(orchestrator, 'async waitForBackgroundCompression(): Promise<void>', 'runtime consumers must be able to await compression commit')
assertIncludes(orchestrator, 'const existingL1Keys = new Set(', 'compression must identify newly created L1 summaries exactly')
assertOk(
  orchestrator.includes('maxIndexedEndRound = Math.max(maxIndexedEndRound, summary.endRound)')
    || orchestrator.includes('maxIndexedEndRound = Math.max(maxIndexedEndRound, l1.endRound)'),
  'compression must track the exact indexed coverage boundary',
)
assertIncludes(orchestrator, 'memoryLifecycle.clearTaggedEventsThrough(maxIndexedEndRound)', 'compression must only clear events already covered by L1 summaries')
assertOk(
  !orchestrator.includes('s.endRound >= this.state.totalRounds - 10'),
  'the first delayed L1 summary must not be excluded by a moving recent-round filter',
)
assertIncludes(orchestrator, 'this.hydrateFromEngineStore(snap.orchestrator.state.timeStep)', 'invalidated preview restore must reconcile from the authoritative EngineStore')
assertOk(
  orchestrator.includes("if (this.state.status !== 'running' && this.state.status !== 'complete') {")
    && orchestrator.includes("reason: 'invalid-engine-status'")
    && orchestrator.includes("status: 'skipped'"),
  'terminal rounds must still be eligible for the final auto-save',
)
assertOk(
  /await this\.runStageMachine\(stages, context\)[\s\S]{0,620}if \(this\.shouldStop\(\)\) \{\s*this\.state\.status = 'complete'/.test(orchestrator),
  'reaching maxRounds must mark the just-finished round complete without an extra click',
)
assertIncludes(
  orchestrator,
  "if (this.state.status !== 'complete') this.start()",
  'hydrating a terminal save must not restart it as a running timeline',
)

for (const file of [
  'src/mods/mod-engine/subsystems/plot-structure-system.ts',
  'src/mods/mod-engine/subsystems/foreshadowing-system.ts',
  'src/mods/mod-engine/subsystems/memory-lifecycle-system.ts',
  'src/mods/mod-engine/subsystems/memory-forgetting-system.ts',
  'src/mods/mod-engine/subsystems/core-memory-system.ts',
]) {
  const source = read(file)
  assertIncludes(source, 'capturePreviewState()', `${file} must capture preview-mutated state`)
  assertIncludes(source, 'restorePreviewState(', `${file} must restore preview-mutated state`)
}

const memoryLifecycleSource = read('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts')
assertIncludes(
  memoryLifecycleSource,
  'clearTaggedEventsThrough(endRound: number): number',
  'memory lifecycle must expose partial cleanup for delayed L1 coverage',
)
assertIncludes(
  memoryLifecycleSource,
  'this.taggedEvents.filter((event) => event.round > endRound)',
  'memory lifecycle must preserve tagged events newer than the indexed summary boundary',
)

const lifespan = read('src/mods/mod-character/subsystems/lifespan-system.ts')
assertOk(!lifespan.includes('getLifecycleStageLabel'), 'lifespan summary must not inject a second fixed human life-stage authority')
assertOk(!/当前年龄 \$\{age\} \$\{stageLabel\}/.test(lifespan), 'lifespan summary must leave stage wording to lifecycle-system')

const sync = read('src/mods/mod-engine/helpers/subsystem-store-sync.ts')
for (const id of ['character-base', 'destiny-pattern', 'lifespan', 'lifecycle-system', 'health', 'morality', 'world-entity', 'luck']) {
  assertIncludes(sync, `'${id}'`, `Store synchronization must include ${id}`)
}
assertIncludes(sync, 'useCharacterStore.setState(', 'runtime state must sync to the character Store')
assertIncludes(sync, 'useWorldStore.setState(', 'runtime entities must sync to the world Store')

const saveRestore = read('src/mods/mod-engine/helpers/save-restore.ts')
assertIncludes(saveRestore, "assertRuntimeReady('加载存档')", 'loading must reject an incomplete runtime before mutating Stores')
assertIncludes(saveRestore, "assertRuntimeReady('手动存档')", 'manual saves must reject an incomplete runtime')
assertIncludes(saveRestore, 'let restoredOrchestratorSnapshot = false', 'save restore must distinguish snapshot and Store fallback paths')
assertOk(
  /if \(!restoredOrchestratorSnapshot\) \{[\s\S]{0,360}orchestrator\.hydrateFromEngineStore\(\)/.test(saveRestore),
  'a missing or partially failed optional snapshot must rebuild the whole orchestrator from the restored EngineStore',
)
const validateIndex = saveRestore.indexOf('const core = assertCoreSavePayload(data)')
const firstCoreWriteIndex = saveRestore.indexOf('useEngineStore.setState(', validateIndex)
assertOk(
  validateIndex >= 0 && firstCoreWriteIndex > validateIndex,
  'all three core save payloads must be validated before the first Store write',
)
const loadCancelIndex = saveRestore.indexOf('await cancelPreGenQueue()', validateIndex)
const loadCompressionWaitIndex = saveRestore.indexOf('await orchestrator.waitForBackgroundCompression()', loadCancelIndex)
assertOk(
  loadCancelIndex > validateIndex && loadCompressionWaitIndex > loadCancelIndex && firstCoreWriteIndex > loadCompressionWaitIndex,
  'loading must validate input, cancel and await preview cleanup, then await compression before mutating Stores',
)
assertIncludes(saveRestore, "assertPreGenIdle('加载存档')", 'loading must verify preview cleanup before mutating Stores')
assertIncludes(saveRestore, "assertCompressionIdle('加载存档')", 'loading must verify summary compression has committed')
assertIncludes(saveRestore, 'export async function collectManualGameSavePayload()', 'manual saves must use an engine-owned asynchronous collection boundary')
assertIncludes(saveRestore, "assertPreGenIdle('手动存档')", 'manual saves must verify preview cleanup before collecting state')
assertIncludes(saveRestore, "assertCompressionIdle('手动存档')", 'manual saves must verify summary compression has committed')
assertIncludes(saveRestore, 'useCharacterStore.setState(previous.character, true)', 'failed core restore must roll character Store back atomically')
assertIncludes(saveRestore, 'useWorldStore.setState(previous.world, true)', 'failed core restore must roll world Store back atomically')
assertIncludes(saveRestore, 'useEngineStore.setState(previous.engine, true)', 'failed core restore must roll engine Store back atomically')
assertIncludes(
  saveRestore,
  'orchestrator.restorePreviewSnapshot(previous.orchestrator)',
  'failed core restore must roll the runtime singleton back atomically from the non-persistent preview snapshot',
)
assertIncludes(saveRestore, "const savedContextId = (data.orchestrator as { worldContextId?: unknown }).worldContextId", 'save restore must read the orchestrator world-context identity')
assertIncludes(saveRestore, "savedContextId !== restoredWorld.currentContextId", 'save restore must reject a world/orchestrator context mismatch before entering simulation')
const worldMigrationIndex = saveRestore.indexOf('const migratedWorld = sanitizeWorldStateSnapshot(core.world)')
const worldStoreWriteIndex = saveRestore.indexOf('useWorldStore.setState(migratedWorld', worldMigrationIndex)
assertOk(
  worldMigrationIndex >= 0 && worldStoreWriteIndex > worldMigrationIndex,
  'save restore must sanitize the world snapshot before writing WorldStore',
)

const worldStore = read('src/mods/mod-world/store.ts')
assertOk(/version:\s*6/.test(worldStore), 'world persistence must retain the current multi-context registry migration version')
assertIncludes(
  worldStore,
  'return sanitizeWorldStateSnapshot(state) as unknown as WorldStore',
  'world persistence migration must pass old direct-restore state through the world sanitizer',
)

const saveManager = read('src/core/storage/save-manager.ts')
assertIncludes(saveManager, "const REQUIRED_CORE_SAVE_FILES = ['engine', 'character', 'world'] as const", 'save manager must declare the three atomic core files')
assertIncludes(saveManager, 'const missingCoreFiles = REQUIRED_CORE_SAVE_FILES.filter', 'save manager must reject a missing core file')
assertOk(
  /REQUIRED_CORE_SAVE_FILES\.includes\([\s\S]{0,240}核心文件 \$\{fileName\} 已损坏/.test(saveManager),
  'save manager must reject corrupted core JSON instead of silently skipping it',
)
assertIncludes(saveManager, 'let saveOperationTail: Promise<void> = Promise.resolve()', 'save operations must share one serialization tail')
assertIncludes(saveManager, 'function enqueueSaveOperation<T>', 'save manager must expose one internal serialization helper')
assertIncludes(saveManager, 'interface SaveDirTransaction', 'save directory replacement must remain rollback-capable until index commit')
assertIncludes(saveManager, 'transaction = await replaceSaveDir(', 'manual and automatic saves must use the shared directory transaction')
assertIncludes(saveManager, 'await transaction.commit()', 'save index success must explicitly commit the directory transaction')
assertIncludes(saveManager, 'await transaction.rollback()', 'save index failure must restore the previous directory')
assertOk(
  !/catch \(err\) \{[\s\S]{0,180}deleteDirectory\(saveDir\(/.test(saveManager),
  'outer save catches must not delete the live save directory without a completed transaction backup',
)
for (const expected of [
  'return enqueueSaveOperation(() => saveToSlotUnlocked(',
  'return enqueueSaveOperation(() => loadSaveUnlocked(slot))',
  'return enqueueSaveOperation(() => deleteSaveUnlocked(slot))',
  'return enqueueSaveOperation(() => autoSaveUnlocked(',
]) {
  assertIncludes(saveManager, expected, `save manager operation is not serialized: ${expected}`)
}

const preGen = read('src/mods/mod-engine/helpers/pre-gen-queue.ts')
assertIncludes(preGen, "if (useEngineStore.getState().status === 'complete') return", 'terminal timelines must not start another background preview')
assertIncludes(preGen, 'inspectNarrativeResponseQuality(fullContent, wordCountTarget)', 'pre-generated rounds must pass the same strict first-response protocol gate')
assertIncludes(preGen, 'const isBranchPoint = responseQuality.parsed.branch === true', 'pre-generated branch detection must use only the strictly parsed first response')
assertIncludes(preGen, 'fullContent,\n            isBranchPoint,\n            signature,', 'pre-generation must cache the complete first response without synthesizing settlement data')
assertOk(
  !preGen.includes('parseNarrativeSettlementEnvelope')
    && !preGen.includes('translateNarrativeAISettlement')
    && !preGen.includes('handleNarrativeResponse('),
  'preview generation must not run or commit data analysis or event recognition',
)
assertOk(
  !/void\s+fillPreGenQueue\(promptTemplate,\s*sessionId\)/.test(preGen),
  'pre-generation failure paths must not recursively retry without a budget or backoff',
)
const causalDelaySource = read('src/mods/mod-engine/subsystems/causal-delay-system.ts')
const causalCheckStart = causalDelaySource.indexOf('checkCausalTrigger(')
const causalCommitStart = causalDelaySource.indexOf('commitCausalTriggers(', causalCheckStart)
const causalCheckBlock = causalDelaySource.slice(causalCheckStart, causalCommitStart)
assertOk(
  causalCheckStart >= 0
    && causalCommitStart > causalCheckStart
    && !causalCheckBlock.includes('event.triggered = true')
    && causalDelaySource.slice(causalCommitStart).includes('event.triggered = true'),
  'due causal events must be previewed without consumption and committed only after narrative acceptance',
)
assertOk(
  causalDelaySource.includes('capturePreviewState(): CausalDelaySnapshotV1')
    && causalDelaySource.includes('restoreCollectedState(snapshot: unknown)')
    && causalDelaySource.includes('causalEvents: this.causalEvents'),
  'causal pending and terminal states must participate in preview and save restoration',
)
assertOk(
  orchestrator.includes('this.pendingNarrativeCausalEventIds = triggeredCausality.triggeredEvents.map')
    && orchestrator.indexOf('causalDelay.commitCausalTriggers(')
      > orchestrator.indexOf('if (parsed.semanticSignals)'),
  'orchestrator must confirm due causality only inside the validated semantic commit path',
)
const campaignQuality = read('src/mods/mod-engine/campaigns/default/index.ts')
assertIncludes(campaignQuality, "name: 'ai-narration'", 'Campaign must declare the first pure narrative stage')
assertIncludes(campaignQuality, "name: 'publish-narrative'", 'Campaign must publish the accepted story before background analysis')
assertIncludes(campaignQuality, "name: 'ai-data-analysis'", 'Campaign must declare the background data-analysis stage')
assertIncludes(campaignQuality, "name: 'ai-event-recognition'", 'Campaign must declare the background event-recognition stage')
assertOk(
  campaignQuality.match(/parallelGroup: 'narrative-background-analysis'/gu)?.length === 2
    && campaignQuality.includes("dependsOn: ['ai-data-analysis', 'ai-event-recognition']"),
  'data analysis and event recognition must run in one explicit parallel group before post-processing',
)
assertIncludes(campaignQuality, 'inspectNarrativeResponseQuality(', 'main and preview generation must inspect the complete first response')
assertIncludes(campaignQuality, 'inspectNarrativeSettlementQuality({', 'real rounds must inspect the complete second response before commit')
assertIncludes(campaignQuality, 'inspectNarrativeEventRecognitionQuality({', 'real rounds must strictly inspect the future-event response before commit')
assertOk(
  campaignQuality.includes('const MAX_FORMAT_REPAIR_ATTEMPTS = 2')
    && campaignQuality.match(/repairAttempts < MAX_FORMAT_REPAIR_ATTEMPTS/gu)?.length === 3
    && campaignQuality.includes('callAIWithPromptTemplate(promptTemplate, segments.full, {')
    && campaignQuality.includes('callAIWithPromptTemplate(narrativeSettlementPrompt, joinedInput, {')
    && campaignQuality.includes('callAIWithPromptTemplate(narrativeEventRecognitionPrompt, joinedInput, {'),
  'each response type must reuse its original asset and dynamic messages for at most two format repairs',
)
assertIncludes(campaignQuality, '⟦上一版叙事响应⟧${response}', 'first-response repair must retain the complete rejected response')
assertIncludes(campaignQuality, 'buildNarrativeSettlementRepairInstruction(quality, response)', 'settlement repair must retain and repair the complete rejected settlement')
assertIncludes(campaignQuality, 'buildNarrativeEventRecognitionRepairInstruction(quality, response)', 'event-recognition repair must retain and repair the complete rejected response')
const qualityOrchestrator = read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
assertOk(
  campaignQuality.includes('const requestBranch = useEngineStore.getState().forceBranchNext')
    && !campaignQuality.includes('inspectNarrativeResponseQuality(response, wordCountTarget, requestBranch)')
    && qualityOrchestrator.includes("branchTitle: '由你决定下一步'")
    && qualityOrchestrator.includes('branchOptions: []'),
  'forced branching must request AI options but commit a custom-input branch point when a complete response omits them',
)
assertIncludes(campaignQuality, 'if (orchestrator.isPreviewExecution()) return', 'preview execution must stop before player publication and both background AI stages')
assertIncludes(campaignQuality, 'if (!ctx._settledNarrative)', 'a missing or twice-rejected settlement must not reach post-processing')
assertIncludes(campaignQuality, 'if (!ctx._recognizedEventCandidates)', 'a missing or twice-rejected event candidate set must not reach post-processing')
const roundHooks = read('src/mods/mod-engine/hooks.ts')
assertIncludes(roundHooks, 'const roundSnapshot = orchestrator.capturePreviewSnapshot()', 'real rounds must capture the complete runtime rollback point before advancing time')
assertIncludes(roundHooks, 'orchestrator.restorePreviewSnapshot(roundSnapshot)', 'failed narrative rounds must roll back time, Store state, and subsystem state')
assertIncludes(roundHooks, "'failed',\n          executionError.executionCode", 'failed background work must retain the published body with the exact terminal status code')
const successfulFinalizationIndex = roundHooks.indexOf('queueRoundFinalization(async () => {')
const successfulOutcomeIndex = roundHooks.indexOf('postNarrativeRoundOutcome(report)', successfulFinalizationIndex)
const nextPreviewIndex = roundHooks.indexOf('fillPreGenQueue(narrativePrompt', successfulFinalizationIndex)
assertOk(
  successfulFinalizationIndex >= 0
    && successfulOutcomeIndex > successfulFinalizationIndex
    && nextPreviewIndex > successfulOutcomeIndex,
  'the next preview must start only after the real round outcome snapshot is finalized',
)
assertOk(
  (qualityOrchestrator.match(/this\.isPreviewExecution\(\) \|\| !this\.roundDiagnostic/g) ?? []).length >= 6
    && qualityOrchestrator.includes('if (this.isPreviewExecution()) return\n    const report = this.roundDiagnostic?.report'),
  'preview execution must not append phases, quality, adoption, persistence, or system events to the real-round diagnostic',
)
assertIncludes(qualityOrchestrator, 'this.lastExecutedFullContent = null', 'every execution must clear stale full-content state before running stages')
assertIncludes(qualityOrchestrator, '本轮未推进，请重新尝试', 'missing gated content must abort the round with an actionable retry error')
assertIncludes(qualityOrchestrator, 'characterStoreRuntime', 'preview snapshots must include the externally stored character age')
assertOk(
  !qualityOrchestrator.includes('rawNarrativeStream')
    && !qualityOrchestrator.includes('parsePartial(')
    && !qualityOrchestrator.includes('streamingNarrative'),
  'uncommitted first-response text must never stream into player-visible state',
)
assertIncludes(campaignQuality, "error.name = 'NarrativeGenerationRejectedError'", 'first-response rejection must be distinguishable from an unexpected runtime error')
assertIncludes(campaignQuality, "error.name = 'NarrativeSettlementRejectedError'", 'settlement rejection must be distinguishable from an unexpected runtime error')
assertIncludes(roundHooks, "err.name === 'NarrativeGenerationRejectedError'", 'handled narrative rejection must not be reported as an unexpected console error')
assertIncludes(roundHooks, "|| err.name === 'NarrativeSettlementRejectedError'", 'handled settlement rejection must not be reported as an unexpected console error')
const waitCompressionIndex = preGen.indexOf('await orchestrator.waitForBackgroundCompression()')
const previewSnapshotIndex = preGen.indexOf('const snapshot = orchestrator.capturePreviewSnapshot()')
assertOk(
  waitCompressionIndex >= 0 && previewSnapshotIndex > waitCompressionIndex,
  'pre-generation must await the previous real-round compression before capturing a rollback snapshot',
)
assertOk(!preGen.includes('streamingNarrative'), 'pre-generation must not own obsolete streaming UI state')
const worldEntitySystem = read('src/mods/mod-world/subsystems/world-entity-system.ts')
const worldEntityHydrationStart = worldEntitySystem.indexOf('hydrateFromStore(): void')
const worldEntityHydrationEnd = worldEntitySystem.indexOf('restoreCollectedState(', worldEntityHydrationStart)
const worldEntityHydrationBlock = worldEntitySystem.slice(worldEntityHydrationStart, worldEntityHydrationEnd)
assertOk(
  worldEntityHydrationStart >= 0
    && worldEntityHydrationEnd > worldEntityHydrationStart
    && !worldEntityHydrationBlock.includes('ensureEntityDirectoryValidated')
    && !worldEntitySystem.includes('entityDirectoryHydrationError'),
  'bootstrap hydration must not persist a transient entity-directory error before player context registration and owning-snapshot restore',
)
for (const setting of [
  'settings.provider',
  'settings.customUrl',
  'settings.customModel',
  'settings.temperature',
  'settings.wordCountTarget',
  'settings.storySeed',
  'settings.narrativeStyleText',
  'settings.narrativeStyleVersion',
]) {
  assertIncludes(preGen, setting, `pre-generation signature must invalidate on setting change: ${setting}`)
}

const resetNewLife = read('src/mods/mod-pages/helpers/new-life-reset.ts')
assertIncludes(resetNewLife, 'clearPreGenQueue()', 'new life reset must invalidate cached preview output')
assertIncludes(resetNewLife, 'orchestrator.reset()', 'new life reset must clear the shared runtime singleton')
assertIncludes(resetNewLife, 'clearNewLifeCreationDrafts()', 'new life reset must not carry the previous timeline creation drafts')
assertIncludes(resetNewLife, 'await waitForModRuntimeReady()', 'new life reset must wait until every active runtime subsystem is registered')
assertIncludes(resetNewLife, 'await flushOpfsQueueNow()', 'new life reset must durably flush deleted creation drafts before navigation')
for (const inactiveMod of ['mod-base-universe', 'mod-npc', 'mod-tech-level']) {
  assertOk(
    !resetNewLife.includes(`@/mods/${inactiveMod}`),
    `new-life page reset must not introduce undeclared dependencies on inactive MOD ${inactiveMod}`,
  )
}

const persistLayer = read('src/core/storage/persist-layer.ts')
const storageInit = read('src/app/_components/storage-init.tsx')
assertIncludes(persistLayer, 'let _initializationPromise: Promise<void> | null = null', 'OPFS initialization must expose one shared in-flight promise')
assertIncludes(persistLayer, 'if (_initializationPromise) return _initializationPromise', 'Strict Mode remounts must await the same OPFS restore')
assertIncludes(persistLayer, 'Promise.race([opfsRestoreAll(), timeout])', 'a permanently pending OPFS handle must not block the entire app shell forever')
assertIncludes(storageInit, 'void initStorage().finally(', 'the app shell must wait for OPFS restoration to settle')
assertIncludes(storageInit, 'const fallbackTimer = window.setTimeout(', 'the app shell must have its own readiness fallback if the storage promise never settles')
assertIncludes(persistLayer, 'export const STORAGE_INIT_TIMEOUT_MS = 5_000', 'the storage timeout must have one exported authority')
assertIncludes(
  storageInit,
  'const STORAGE_READY_TIMEOUT_MS = STORAGE_INIT_TIMEOUT_MS + 1_000',
  'the UI readiness fallback must run strictly after the storage layer timeout',
)
assertOk(
  storageInit.indexOf('if (!ready)') < storageInit.indexOf('return <>{children}</>'),
  'save-consuming pages must not render before the storage readiness barrier',
)

const hooks = read('src/mods/mod-engine/hooks.ts')
assertIncludes(hooks, 'syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())', 'UI sync must publish the latest subsystem snapshot')
assertIncludes(hooks, "runtimeStatus === 'complete' ? 'complete' : 'idle'", 'advance cleanup must preserve terminal complete status')
assertOk(
  /queueRoundFinalization\([\s\S]{0,1600}waitForBackgroundCompression\(\)[\s\S]{0,600}syncOrchestratorToEngineStore\(\)[\s\S]{0,600}(?:await\s+)?orchestrator\.triggerAutoSave\(\)/s.test(hooks),
  'automatic saves must capture state only after background summary compression commits',
)
assertIncludes(hooks, 'runtimeRegistry.isFrozen()', 'runtime readiness must distinguish completed bootstrap from an early partial registration')
assertIncludes(hooks, 'runtimeReadiness,', 'the story page must receive the full authoritative runtime readiness')
assertIncludes(
  hooks,
  'resolveMvpRuntimeReadiness({',
  'round advancement must verify the actual runtime bindings instead of trusting UI readiness alone',
)

const gameStory = read('src/mods/mod-pages/pages/game-story/page.tsx')
const engineStore = read('src/mods/mod-engine/store.ts')
const narrativeTimeline = read('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx')
assertIncludes(gameStory, 'runtimeReadiness,', 'the story page must consume engine-owned runtime readiness')
assertOk(!gameStory.includes('allModsLoaded'), 'the story page must not gate simulation controls on loader UI state alone')
assertIncludes(gameStory, '核心系统未完整加载', 'the story page must distinguish incomplete registration from normal initialization')
assertIncludes(gameStory, 'collectManualGameSavePayload()', 'cloud saves must use the engine-owned pre-generation cancellation boundary')
assertOk(
  !gameStory.includes('preGenStatus.isActive || isAdvancing'),
  'background pre-generation alone must not block local or cloud manual saves',
)
assertOk(
  !gameStory.includes('disabled={!isRuntimeReady || isAdvancing || preGenStatus.isActive}'),
  'background pre-generation alone must not disable the manual-save entry',
)
assertOk(
  engineStore.includes('pendingNarrative: PendingNarrative | null')
    && engineStore.includes('pendingNarrative: _pn')
    && engineStore.includes('updatePendingNarrative: _upn')
    && engineStore.includes('clearPendingNarrative: _cpn'),
  'the published story projection must stay non-persistent and expose explicit pending, committing, and failed transitions',
)
assertOk(
  gameStory.includes('pendingNarrative.roundSequence > totalRounds')
    && gameStory.includes('showGenerationCursor={isAdvancing && !hasVisiblePendingNarrative}')
    && gameStory.includes('正文已生成，但本轮未完成结算')
    && narrativeTimeline.includes('if (showGenerationCursor)')
    && narrativeTimeline.includes('const canTapAdvance = showAdvance && !advanceBlocked && !isGenerating'),
  'the story page must show accepted prose immediately, remove the generation cursor, keep controls blocked, and retain failed prose feedback',
)

const campaign = read('src/mods/mod-engine/campaigns/default/index.ts')
assertOk(
  (campaign.match(/orchestrator\.collectAllSubsystemStates\(\)/g) ?? []).length >= 1,
  'the first campaign collection must still record relevance',
)
assertOk(
  !campaign.includes('orchestrator.collectAllSubsystemStates(false)')
    && orchestrator.includes('this.collectSubsystemStates(false, false)'),
  'post-commit state refresh must stay inside the orchestrator without duplicating relevance history',
)
assertIncludes(campaign, 'settings.storySeed.trim()', 'campaign must normalize the configured story seed')
assertIncludes(
  campaign,
  '...(settings.storySeed.trim() ? { storySeed: settings.storySeed.trim() } : {})',
  'the shared main-narrative call options must carry storySeed for real and preview rounds',
)
assertIncludes(
  preGen,
  'stream: false',
  'pre-generation must always request a complete non-streaming first response',
)
assertOk(
  /memoryLifecycle\.scoreImportance\(\s*narrative,\s*roundSequence,\s*this\.state\.round\.year,\s*this\.worldSetting\?\.contextId/.test(orchestrator),
  'orchestrator memory scoring must keep roundSequence distinct from calendar year and attach the current context',
)

const plotStructure = read('src/mods/mod-engine/subsystems/plot-structure-system.ts')
assertIncludes(
  plotStructure,
  'this.state.phaseElapsedDays = context.totalDays - this.state.phaseStartedAtTotalDays',
  'plot phase duration must derive from canonical totalDays',
)
assertIncludes(
  plotStructure,
  'totalDays: context.totalDays',
  'plot phase history must preserve the canonical transition day',
)
assertIncludes(
  plotStructure,
  'roundSequence: getRoundSequence(context)',
  'plot phase history must keep roundSequence only as an audit sequence',
)
assertOk(
  !plotStructure.includes('phaseRound'),
  'plot phase duration must not retain a parallel round counter',
)

assertOk(
  !fs.existsSync(path.join(root, 'src/mods/mod-engine/subsystems/adaptation-manager-system.ts')),
  'the removed extra AI adaptation call must not retain a subsystem implementation',
)

if (failed > 0) process.exit(1)
console.log('PASS: runtime-subsystem-state-regression')
