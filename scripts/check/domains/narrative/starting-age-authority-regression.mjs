/**
 * Purpose: Regress structured character creation, lifespan, and starting-age authority.
 * Owner: quality:narrative
 * Responsibility: Creation confirmation and fate-preview prerequisite assertions only.
 *
 * 创建流程完整性回归：保护角色创建写入的结构化种族/寿命与 startingAge，
 * 并确保命运预览只允许已确认角色且四个共享命格槽已填满时开始人生。
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readDirectorySource, readModuleSource } from '../../lib/read-module-source.mjs'
import {
  CHARACTER_DAYS_PER_YEAR,
  resolveCharacterAgeDays,
  resolveInitialAgeAnchorTotalDays,
} from '../../../../src/foundation/subsystem-contracts/character-state.contract.ts'

const root = getProjectRoot(import.meta.url)
const pagePath = path.join(root, 'src/mods/mod-pages/pages/fate-preview/page.tsx')
const characterCreatePath = path.join(root, 'src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts')
const characterConstantsPath = path.join(root, 'src/mods/mod-character/constants.ts')
const orchestratorPath = path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts')
const characterStatusRuntimePath = path.join(root, 'src/mods/mod-character/subsystems/character-status-runtime.ts')
const domainsPath = path.join(root, 'scripts/check/domains.mjs')
const sourceText = readDirectorySource('src/mods/mod-pages/pages/fate-preview', root, ['.ts', '.tsx'])
const characterCreateSourceText = readDirectorySource('src/mods/mod-pages/pages/character-create', root, ['.ts', '.tsx'])
const characterConstantsSourceText = fs.readFileSync(characterConstantsPath, 'utf8')
const orchestratorSourceText = readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root)
const characterStatusRuntimeSourceText = fs.readFileSync(characterStatusRuntimePath, 'utf8')
const domainsSourceText = fs.readFileSync(domainsPath, 'utf8')
const sourceFile = ts.createSourceFile(pagePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const characterCreateSourceFile = ts.createSourceFile(
  characterCreatePath,
  characterCreateSourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)

let failed = 0

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}

function findDescendant(node, predicate) {
  if (predicate(node)) return node
  let found
  ts.forEachChild(node, (child) => {
    if (!found) found = findDescendant(child, predicate)
  })
  return found
}

function compileStandaloneFunction(source, functionName, environment) {
  const declaration = findDescendant(source, (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === functionName,
  )
  assertOk(!!declaration, `${functionName} must remain a named, testable helper`)
  if (!declaration) return null

  const output = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ''), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const names = Object.keys(environment)
  const values = Object.values(environment)
  return new Function(...names, `${output}\nreturn ${functionName}`)(...values)
}

function isNamedCall(node, objectName, methodName) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  return node.expression.expression.getText(sourceFile) === objectName
    && node.expression.name.text === methodName
}

const startingAgeDeclaration = findDescendant(sourceFile, (node) =>
  ts.isVariableDeclaration(node)
  && ts.isIdentifier(node.name)
  && node.name.text === 'startingAge'
  && node.initializer?.getText(sourceFile) === 'characterBase.startingAge',
)

const handleStartLife = findDescendant(sourceFile, (node) =>
  ts.isVariableDeclaration(node)
  && ts.isIdentifier(node.name)
  && node.name.text === 'handleStartLife',
)
const handleBody = handleStartLife?.initializer?.getText(sourceFile) ?? ''

const raceCatalog = {
  human: {
    name: '人类',
    baseLifespanYears: 100,
    clockMode: 'aging',
  },
}
const raceCatalogWithElf = {
  ...raceCatalog,
  elf: { name: '精灵', baseLifespanYears: 1000, clockMode: 'aging' },
}
const resolveRaceId = compileStandaloneFunction(
  characterCreateSourceFile,
  'resolveRaceId',
  { RACE_LIFESPAN: raceCatalogWithElf },
)
const resolveRaceConfig = compileStandaloneFunction(
  characterCreateSourceFile,
  'resolveRaceConfig',
  { RACE_LIFESPAN: raceCatalogWithElf, resolveRaceId },
)
const buildConfirmedRaceLifespan = compileStandaloneFunction(
  characterCreateSourceFile,
  'buildConfirmedRaceLifespan',
  { RACE_LIFESPAN: raceCatalogWithElf, resolveRaceConfig },
)
const computeMaxAge = compileStandaloneFunction(
  characterCreateSourceFile,
  'computeMaxAge',
  { RACE_LIFESPAN: raceCatalogWithElf, resolveRaceConfig },
)
const resolvePreviewRaceInfo = compileStandaloneFunction(
  sourceFile,
  'resolvePreviewRaceInfo',
  { RACE_LIFESPAN: raceCatalog },
)
const hasConfirmedCharacter = compileStandaloneFunction(
  sourceFile,
  'hasConfirmedCharacter',
  { RACE_LIFESPAN: raceCatalog, Number, Boolean },
)

const setStateCall = handleStartLife && findDescendant(handleStartLife, (node) =>
  isNamedCall(node, 'useCharacterStore', 'setState'),
)
const storeArgument = setStateCall?.arguments[0]
const storeAgeProperty = storeArgument && ts.isObjectLiteralExpression(storeArgument)
  ? storeArgument.properties.find((property) =>
      ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'age')
  : undefined

const ageSyncIndex = handleBody.indexOf('useCharacterStore.setState({ age: startingAge })')
const contextSyncIndex = handleBody.indexOf('ensureOrchestratorContextFromStores()')
const characterStateIndex = handleBody.indexOf('setCharacterBase({')

assertOk(!!startingAgeDeclaration, 'fate preview must read canonical characterBase.startingAge')
const customRace = buildConfirmedRaceLifespan?.('星鲸族', 880)
assertOk(
  customRace?.name === '星鲸族'
    && customRace?.baseLifespanYears === 880
    && customRace?.clockMode === 'aging',
  'custom races must be committed into the current structured lifespan draft',
)
assertOk(
  resolveRaceId?.('精灵') === 'elf' && computeMaxAge?.('精灵') === 1000,
  'custom-name entry must retain the canonical lifespan config when it matches a known race label',
)
const customLifespan = {
  raceId: '星鲸族',
  race: customRace,
  maximumLifespanYears: 880,
}
assertOk(
  resolvePreviewRaceInfo?.('星鲸族', customLifespan)?.name === '星鲸族',
  'fate preview must display the real custom race name from structured lifespan data',
)
assertOk(
  hasConfirmedCharacter?.('云舟', '星鲸族', 27, customLifespan) === true,
  'a named character with matching structured custom race, lifespan, and starting age must pass the character gate',
)
assertOk(
  hasConfirmedCharacter?.('云舟', '星鲸族', 27, {
    ...customLifespan,
    race: raceCatalog.human,
  }) === false,
  'a stale or mismatched structured race must fail the character confirmation gate',
)
assertOk(
  characterCreateSourceText.includes('const selected = race && !RACE_LIFESPAN[race] ? [race] : []')
    && characterCreateSourceText.includes('[...new Set([...selected, ...storedCustomRaces])]'),
  're-entering character creation must restore the selected custom race into the local option list',
)
assertOk(
  characterCreateSourceText.includes('const raceId = resolveRaceId(race)')
    && characterCreateSourceText.includes('setLifespanDraft({ raceId, race: confirmedRace, maximumLifespanYears: maxAge })'),
  'character confirmation must persist a canonical race ID for typed names that match known race labels',
)
assertOk(
  characterCreateSourceText.includes('manualLifespan: storedManualLifespan')
    && characterCreateSourceText.includes('manualStartingAge: storedManualStartingAge')
    && characterCreateSourceText.includes('const manualLifespan = storedManualLifespan')
    && characterCreateSourceText.includes('const manualStartingAge = storedManualStartingAge'),
  're-entering character creation must restore lifespan and starting age from the long-lived draft owner',
)
assertOk(
  characterCreateSourceText.includes('parsedMaxAge !== undefined')
    && characterCreateSourceText.includes('computeMaxAge(input.race, parsedMaxAge)'),
  'the currently edited lifespan input must take precedence over an older computed/restored value at confirmation',
)
assertOk(
  (characterCreateSourceText.match(/buildConfirmedRaceLifespan\(raceId, maxAge\)/g) ?? []).length >= 2
    && (characterCreateSourceText.match(/setLifespanDraft\(\{ raceId, race: confirmedRace, maximumLifespanYears: maxAge \}\)/g) ?? []).length >= 2,
  'both forward confirmation and backward preservation must write the current lifespan draft',
)
assertOk(
  characterStateIndex >= 0 && ageSyncIndex > characterStateIndex && contextSyncIndex > ageSyncIndex,
  'handleStartLife must finalize the character draft before the engine restores its context',
)
assertOk(
  !!storeAgeProperty
    && ts.isPropertyAssignment(storeAgeProperty)
    && storeAgeProperty.initializer.getText(sourceFile) === 'startingAge',
  'handleStartLife must sync the character store age from startingAge',
)
assertOk(
  !handleBody.includes('orchestrator.applyRoundChanges([')
    && !handleBody.includes("id: 'destiny-pattern'")
    && !handleBody.includes('MAX_CREATION_COMMIT_ATTEMPTS')
    && !handleBody.includes('isTransientCreationCommitReason'),
  'handleStartLife must pass the already-confirmed Store loadout into the core context without a page-level destiny re-commit or retry gate',
)
assertOk(!/\bage\s*:\s*0\b/.test(handleBody), 'handleStartLife must not hard-reset any age field to 0')
assertOk(
  handleBody.includes('if (isStarting || !characterConfirmed || !patternLoadoutConfirmed || !birthReady || !worldReady) return'),
  'handleStartLife must enforce character, optional loadout capacity, birth readiness, and local world readiness even outside the disabled button',
)
assertOk(
  /allModsLoaded|核心模拟系统尚未加载完成/u.test(handleBody)
    && handleBody.includes('ensureOrchestratorContextFromStores()'),
  'handleStartLife must retain the core-runtime readiness check and restore the engine context from Store state',
)
assertOk(
  sourceText.includes('const patternLoadoutConfirmed = isPatternLoadoutValid(selectedPatterns, equippedReincarnationTalents)')
    && sourceText.includes('const hasPatterns = isPatternLoadoutValid(selectedPatterns, equippedReincarnationTalents)')
    && sourceText.includes('const worldReady = worldInitialized && !!worldConfig && worldCode > 0')
    && sourceText.includes('confirmDisabled={Boolean(creationGateReason || runtimeGateReason || isStarting) || !worldReady}')
    && !sourceText.includes("getSubsystemBindings().some(({ id }) => id === 'destiny-pattern')")
    && !sourceText.includes('命格系统尚未准备完成'),
  'fate preview must allow optional loadouts within capacity, require local world confirmation and ready core runtime, without a destiny-subsystem binding gate',
)
assertOk(
  /export const PATTERN_LOADOUT_SLOT_COUNT = 4\b/.test(characterConstantsSourceText),
  'the creation-flow prerequisite must remain exactly four shared pattern slots',
)
assertOk(
  sourceText.includes('>起始年龄：</span>') && sourceText.includes('>{startingAge} 岁</b>'),
  'final fate preview must visibly display the starting age',
)
assertOk(
  !orchestratorSourceText.includes('buildFallbackNarrativeFromState'),
  'failed or empty AI output must not synthesize local narrative outside the atomic four-call pipeline',
)
assertOk(
  !orchestratorSourceText.includes('narrativeParser.buildFallbackNarrative(this.state.round.year'),
  'fallback narrative must never treat the simulation round year as character age',
)
const firstRoundAnchor = resolveInitialAgeAnchorTotalDays(CHARACTER_DAYS_PER_YEAR)
assertOk(
  resolveCharacterAgeDays(18, CHARACTER_DAYS_PER_YEAR, firstRoundAnchor) === 18 * CHARACTER_DAYS_PER_YEAR
    && resolveCharacterAgeDays(18, CHARACTER_DAYS_PER_YEAR * 3, firstRoundAnchor) === 20 * CHARACTER_DAYS_PER_YEAR,
  'character age must derive from starting age plus elapsed canonical days without aging before the first narrative',
)
assertOk(
  characterStatusRuntimeSourceText.includes("status.clockMode !== 'aging'")
    && characterStatusRuntimeSourceText.includes('status.maximumLifespanDays * 0.8')
    && characterStatusRuntimeSourceText.includes('不因到龄自动死亡'),
  'character-base status must turn the lifespan draft into staged guidance and a non-deterministic ending risk',
)
assertOk(
  characterCreateSourceText.includes('此前经历仍然存在')
    && characterCreateSourceText.includes('自然衰老参考，不是死亡线')
    && characterCreateSourceText.includes('到龄不会自动死亡'),
  'character creation must explain intervention age, prior life, and non-automatic natural death',
)
assertOk(
  domainsSourceText.includes("'scripts/check/domains/narrative/starting-age-authority-regression.mjs'"),
  'narrative gate must execute the starting-age authority regression',
)
assertOk(
  domainsSourceText.includes("'src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts'"),
  'character-create logic changes must trigger the creation integrity gate',
)
assertOk(
  domainsSourceText.includes("'src/mods/mod-pages/pages/fate-preview/'"),
  'fate-preview changes must trigger the narrative starting-age gate',
)
assertOk(
  domainsSourceText.includes("'src/mods/mod-engine/subsystems/orchestrator-system.ts'"),
  'orchestrator changes must trigger the narrative starting-age gate',
)
assertOk(
  domainsSourceText.includes("'src/mods/mod-character/subsystems/character-status-runtime.ts'")
    && domainsSourceText.includes("'src/foundation/subsystem-contracts/character-state.contract.ts'"),
  'character status and age-contract changes must trigger the narrative starting-age gate',
)

if (failed === 0) {
  console.log('PASS: starting-age-authority-regression')
  process.exit(0)
}
process.exit(1)
