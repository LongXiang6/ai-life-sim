/**
 * 创建流程完整性回归：保护角色创建写入的结构化种族/寿命与 startingAge，
 * 并确保命运预览只允许已确认角色且恰好 3 条命格开始人生。
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
const pagePath = path.join(root, 'src/mods/mod-pages/pages/fate-preview/page.tsx')
const characterCreatePath = path.join(root, 'src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts')
const characterConstantsPath = path.join(root, 'src/mods/mod-character/constants.ts')
const orchestratorPath = path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts')
const lifeStagePath = path.join(root, 'src/mods/mod-engine/helpers/life-stage-narrative.ts')
const domainsPath = path.join(root, 'scripts/check/domains.mjs')
const sourceText = fs.readFileSync(pagePath, 'utf8')
const characterCreateSourceText = fs.readFileSync(characterCreatePath, 'utf8')
const characterConstantsSourceText = fs.readFileSync(characterConstantsPath, 'utf8')
const orchestratorSourceText = fs.readFileSync(orchestratorPath, 'utf8')
const lifeStageSourceText = fs.readFileSync(lifeStagePath, 'utf8')
const domainsSourceText = fs.readFileSync(domainsPath, 'utf8')
const sourceFile = ts.createSourceFile(pagePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const characterCreateSourceFile = ts.createSourceFile(
  characterCreatePath,
  characterCreateSourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)

const lifeStageJs = ts.transpileModule(lifeStageSourceText, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: lifeStagePath,
}).outputText
const lifeStageModule = { exports: {} }
const loadLifeStageModule = new Function('exports', 'module', `${lifeStageJs}\nreturn module.exports`)
const {
  buildLifeStageNarrativeHint,
  resolveLifeStageFromAge,
} = loadLifeStageModule(lifeStageModule.exports, lifeStageModule)

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

  const output = ts.transpileModule(declaration.getText(source), {
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
    baseMaxAge: 100,
    goldenAgeRatio: [0.18, 0.4],
    decayMultiplier: 1,
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

const setContextCall = handleStartLife && findDescendant(handleStartLife, (node) =>
  isNamedCall(node, 'orchestrator', 'setContext'),
)
const characterArgument = setContextCall?.arguments[1]
const ageProperty = characterArgument && ts.isObjectLiteralExpression(characterArgument)
  ? characterArgument.properties.find((property) =>
      ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'age')
  : undefined

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

assertOk(!!startingAgeDeclaration, 'fate preview must read canonical characterBase.startingAge')
const customRace = buildConfirmedRaceLifespan?.('星鲸族', 880)
assertOk(
  customRace?.name === '星鲸族'
    && customRace?.baseMaxAge === 880
    && customRace?.goldenAgeRatio?.[0] === raceCatalog.human.goldenAgeRatio[0]
    && customRace?.decayMultiplier === raceCatalog.human.decayMultiplier,
  'custom races must be committed into the existing structured lifespan shape with the confirmed maxAge',
)
const customLifespan = {
  maxAge: 880,
  baseMaxAge: 880,
  race: customRace,
  breakthroughs: [],
  breakthroughChance: 0.3,
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
  characterCreateSourceText.includes('race && !RACE_LIFESPAN[race] ? [race] : []'),
  're-entering character creation must restore the selected custom race into the local option list',
)
assertOk(
  characterCreateSourceText.includes('readStoredAgeSetup(race)')
    && characterCreateSourceText.includes('storedAgeSetup?.maxAge')
    && characterCreateSourceText.includes('storedAgeSetup?.startingAge'),
  're-entering character creation must restore confirmed maxAge and startingAge from existing Store fields',
)
assertOk(
  characterCreateSourceText.includes('confirmedManualMaxAge !== undefined')
    && characterCreateSourceText.includes('computeMaxAge(race, confirmedManualMaxAge)'),
  'the currently edited lifespan input must take precedence over an older computed/restored value at confirmation',
)
assertOk(
  (characterCreateSourceText.match(/buildConfirmedRaceLifespan\(race, maxAge\)/g) ?? []).length >= 2
    && (characterCreateSourceText.match(/setLifespan\(\{ race: confirmedRace, maxAge, baseMaxAge: confirmedRace\.baseMaxAge \}\)/g) ?? []).length >= 2,
  'both forward confirmation and backward preservation must write the structured race/lifespan snapshot',
)
assertOk(
  !!ageProperty
    && ts.isPropertyAssignment(ageProperty)
    && ageProperty.initializer.getText(sourceFile) === 'startingAge',
  'handleStartLife must pass startingAge to orchestrator.setContext',
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
assertOk(!/\bage\s*:\s*0\b/.test(handleBody), 'handleStartLife must not hard-reset any age field to 0')
assertOk(
  handleBody.includes('if (!characterConfirmed || !destinyPatternsConfirmed || !aiComplete) return'),
  'handleStartLife must enforce creation and 4/4 world-initialization prerequisites even if invoked outside the disabled button',
)
assertOk(
  sourceText.includes('selectedPatterns.length === DESTINY_PATTERN_SELECT_COUNT')
    && sourceText.includes("worldInitAIStatus?.status === 'complete'")
    && sourceText.includes('WORLD_INIT_STEPS.every')
    && sourceText.includes('confirmDisabled={Boolean(creationGateReason) || !aiComplete}'),
  'fate preview must require exactly 3 patterns plus a complete four-step world initialization before start',
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
  orchestratorSourceText.includes('narrative = this.buildFallbackNarrativeFromState()'),
  'blocked or empty AI output must use the canonical age-aware orchestrator fallback',
)
assertOk(
  !orchestratorSourceText.includes('narrativeParser.buildFallbackNarrative(this.state.round.year'),
  'fallback narrative must never treat the simulation round year as character age',
)
assertOk(
  resolveLifeStageFromAge(18, 80, 18) === 'young_adult'
    && resolveLifeStageFromAge(20, 80, 18) === 'young_adult'
    && resolveLifeStageFromAge(21, 80, 18) === 'adult',
  'an age-18 start with maxAge 80 must have a monotonic 18-20 young-adult stage followed by adulthood',
)
assertOk(
  resolveLifeStageFromAge(18, 80, 0) === 'young_adult',
  'a birth-start character must not skip young adulthood merely because 20% of maxAge is below 18',
)
const age18Hint = buildLifeStageNarrativeHint('young_adult', 80, 18, 18)
const age21Hint = buildLifeStageNarrativeHint('adult', 80, 18, 21)
assertOk(
  age18Hint.includes('青年期（18-20岁）') && !age18Hint.includes('18-16岁'),
  'life-stage prompt must never emit an inverted young-adult age range',
)
assertOk(
  age21Hint.includes('成年期（21-39岁）'),
  'life-stage prompt labels must match the same exclusive boundaries used by stage resolution',
)
for (const [maxAge, startingAge, currentAge] of [[80, 0, 18], [80, 18, 18], [80, 30, 30]]) {
  const hint = buildLifeStageNarrativeHint(
    resolveLifeStageFromAge(currentAge, maxAge, startingAge),
    maxAge,
    startingAge,
    currentAge,
  )
  const range = hint.match(/（(\d+)-(\d+)岁）/)
  assertOk(
    !range || Number(range[1]) <= Number(range[2]),
    `life-stage prompt range must be monotonic for maxAge=${maxAge}, startingAge=${startingAge}`,
  )
}
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
  domainsSourceText.includes("'src/mods/mod-engine/helpers/life-stage-narrative.ts'"),
  'life-stage helper changes must trigger the narrative starting-age gate',
)

if (failed === 0) {
  console.log('PASS: starting-age-authority-regression')
  process.exit(0)
}
process.exit(1)
