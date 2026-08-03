/**
 * Purpose: Regress structured character creation, lifespan, and starting-age authority.
 * Owner: quality:narrative
 * Responsibility: Creation confirmation and fate-preview prerequisite assertions only.
 *
 * 创建流程完整性回归：保护角色创建写入的结构化种族/寿命与 startingAge，
 * 并确保命运预览只允许已确认角色且恰好 3 条命格开始人生。
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
} from '../../../../src/foundation/subsystem-contracts/life-cycle.contract.ts'

const root = getProjectRoot(import.meta.url)
const pagePath = path.join(root, 'src/mods/mod-pages/pages/fate-preview/page.tsx')
const characterCreatePath = path.join(root, 'src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts')
const characterConstantsPath = path.join(root, 'src/mods/mod-character/constants.ts')
const orchestratorPath = path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts')
const lifecyclePath = path.join(root, 'src/mods/mod-character/subsystems/lifecycle-system.ts')
const domainsPath = path.join(root, 'scripts/check/domains.mjs')
const sourceText = readDirectorySource('src/mods/mod-pages/pages/fate-preview', root, ['.ts', '.tsx'])
const characterCreateSourceText = readDirectorySource('src/mods/mod-pages/pages/character-create', root, ['.ts', '.tsx'])
const characterConstantsSourceText = fs.readFileSync(characterConstantsPath, 'utf8')
const orchestratorSourceText = readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root)
const lifecycleSourceText = fs.readFileSync(lifecyclePath, 'utf8')
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
const buildConfirmedRaceLifespan = compileStandaloneFunction(
  characterCreateSourceFile,
  'buildConfirmedRaceLifespan',
  { RACE_LIFESPAN: raceCatalog },
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

const applyRoundChangesCall = handleStartLife && findDescendant(handleStartLife, (node) =>
  isNamedCall(node, 'orchestrator', 'applyRoundChanges'),
)
const manualChangesArgument = applyRoundChangesCall?.arguments[0]
const manualChangesText = manualChangesArgument?.getText(sourceFile) ?? ''
const ageSyncIndex = handleBody.indexOf('useCharacterStore.setState({ age: startingAge })')
const contextSyncIndex = handleBody.indexOf('ensureOrchestratorContextFromStores()')
const creationCommitIndex = handleBody.indexOf('orchestrator.applyRoundChanges(')

assertOk(!!startingAgeDeclaration, 'fate preview must read canonical characterBase.startingAge')
const customRace = buildConfirmedRaceLifespan?.('星鲸族', 880)
assertOk(
  customRace?.name === '星鲸族'
    && customRace?.baseLifespanYears === 880
    && customRace?.clockMode === 'aging',
  'custom races must be committed into the current structured lifespan draft',
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
  (characterCreateSourceText.match(/buildConfirmedRaceLifespan\(race, maxAge\)/g) ?? []).length >= 2
    && (characterCreateSourceText.match(/setLifespanDraft\(\{ raceId: race, race: confirmedRace, maximumLifespanYears: maxAge \}\)/g) ?? []).length >= 2,
  'both forward confirmation and backward preservation must write the current lifespan draft',
)
assertOk(
  ageSyncIndex >= 0 && contextSyncIndex > ageSyncIndex && creationCommitIndex > contextSyncIndex,
  'handleStartLife must write startingAge before the engine restores context and before owner commits',
)
assertOk(
  !!storeAgeProperty
    && ts.isPropertyAssignment(storeAgeProperty)
    && storeAgeProperty.initializer.getText(sourceFile) === 'startingAge',
  'handleStartLife must sync the character store age from startingAge',
)
assertOk(
  /id:\s*'character-base'/.test(manualChangesText)
    && /changes:\s*\{[^}]*\bstartingAge\b[^}]*\}/s.test(manualChangesText),
  'handleStartLife must sync startingAge to the character-base subsystem through orchestrator',
)
assertOk(
  /id:\s*'lifespan'/.test(manualChangesText)
    && /operation:\s*'set-rule'/.test(manualChangesText)
    && /maximumLifespanDays/.test(manualChangesText),
  'handleStartLife must commit the current lifespan rule through orchestrator',
)
assertOk(!/\bage\s*:\s*0\b/.test(handleBody), 'handleStartLife must not hard-reset any age field to 0')
assertOk(
  handleBody.includes('if (!characterConfirmed || !destinyPatternsConfirmed || !aiComplete) return'),
  'handleStartLife must enforce creation and 4/4 world-initialization prerequisites even if invoked outside the disabled button',
)
assertOk(
  handleBody.includes('if (!allModsLoaded)')
    && handleBody.includes('commitResult.rejected.length > 0')
    && handleBody.includes('commitResult.committed.length !== 3'),
  'handleStartLife must wait for the complete MOD runtime and reject incomplete creation commits before navigation',
)
assertOk(
  sourceText.includes('selectedPatterns.length === DESTINY_PATTERN_SELECT_COUNT')
    && sourceText.includes("status?.status === 'complete'")
    && sourceText.includes('completedSteps === WORLD_INIT_STEPS.length')
    && sourceText.includes('confirmDisabled={Boolean(creationGateReason || runtimeGateReason) || !aiComplete}'),
  'fate preview must require exactly 3 patterns, a complete four-step world initialization, and a ready MOD runtime before start',
)
assertOk(
  /export const DESTINY_PATTERN_SELECT_COUNT = 3\b/.test(characterConstantsSourceText),
  'the creation-flow prerequisite must remain exactly 3 confirmed destiny patterns',
)
assertOk(
  sourceText.includes('>起始年龄：</span>') && sourceText.includes('>{startingAge} 岁</span>'),
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
  lifecycleSourceText.includes("lifespan.clockMode === 'external'")
    && lifecycleSourceText.includes("lifespan.clockMode === 'cyclic'")
    && lifecycleSourceText.includes("stage('lifespan-limit'"),
  'lifecycle-system must own external, cyclic, and aging lifespan boundaries',
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
  domainsSourceText.includes("'src/mods/mod-engine/helpers/lifecycle-narrative.ts'")
    && domainsSourceText.includes("'src/foundation/subsystem-contracts/life-cycle.contract.ts'"),
  'lifecycle narrative and age-contract changes must trigger the narrative starting-age gate',
)

if (failed === 0) {
  console.log('PASS: starting-age-authority-regression')
  process.exit(0)
}
process.exit(1)
