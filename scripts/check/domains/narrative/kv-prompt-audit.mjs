/**
 * Phase 6：叙事 Prompt 接线审计（纯逻辑，不依赖 TS 编译）
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)

const promptBuilder = fs.readFileSync(
  path.join(root, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const narrativePrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/narrative-prompt.ts'),
  'utf8',
)
const campaign = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/campaigns/default/index.ts'),
  'utf8',
)
const orchestrator = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  'utf8',
)
const memoryLifecycle = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/memory-lifecycle-system.ts'),
  'utf8',
)
const summaryCompressor = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/summary-compressor-system.ts'),
  'utf8',
)
const lifespanSystem = fs.readFileSync(
  path.join(root, 'src/mods/mod-character/subsystems/lifespan-system.ts'),
  'utf8',
)
const summaryPrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/summary-prompt.ts'),
  'utf8',
)
const promptContract = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/bootstrap/prompt-context-contract.generated.ts'),
  'utf8',
)
const promptGate = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/subsystem-prompt-gate.ts'),
  'utf8',
)
const mvpRuntimePolicy = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/mvp-runtime-policy.ts'),
  'utf8',
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

function compileStandaloneFunction(sourceText, fileName, functionName, environment = {}) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = findDescendant(sourceFile, (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === functionName,
  )
  assertOk(!!declaration, `${functionName} must remain a named, testable helper`)
  if (!declaration) return null

  const declarationText = declaration.getText(sourceFile).replace(/^export\s+/, '')
  const output = ts.transpileModule(declarationText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const names = Object.keys(environment)
  const values = Object.values(environment)
  return new Function(...names, `${output}\nreturn ${functionName}`)(...values)
}

const requiredContextFields = [
  'calibrationSummary',
  'memorySummary',
  'eventInjectionText',
  'timeBridgeSummary',
  'narrativeToneHint',
  'subsystemSummaries',
  'character',
  'worldSetting',
]

for (const key of requiredContextFields) {
  if (!promptBuilder.includes(`context.${key}`)) {
    console.error(`FAIL: prompt-builder missing context field ${key}`)
    failed++
  }
}

if (!promptBuilder.includes('buildNarrativeUserJson')) {
  console.error('FAIL: buildNarrativeUserJson not found')
  failed++
}

if (!promptBuilder.includes('getNarrativeUserSegments')) {
  console.error('FAIL: getNarrativeUserSegments not found')
  failed++
}

if (campaign.includes('segments.stablePrefix, segments.variableSuffix')) {
  console.error('FAIL: campaign still uses legacy broken userSegments')
  failed++
}

if (!campaign.includes('getNarrativeUserSegments')) {
  console.error('FAIL: campaign not using getNarrativeUserSegments')
  failed++
}

if (!orchestrator.includes('generateCompressedSummaries')) {
  console.error('FAIL: orchestrator not wired to generateCompressedSummaries')
  failed++
}

const buildYearEventsStart = orchestrator.indexOf('private buildYearEvents')
const buildYearEventsEnd = orchestrator.indexOf('/** Phase 6', buildYearEventsStart)
const buildYearEvents = buildYearEventsStart >= 0 && buildYearEventsEnd > buildYearEventsStart
  ? orchestrator.slice(buildYearEventsStart, buildYearEventsEnd)
  : ''
if (!buildYearEvents.includes('n.displayAge') || !buildYearEvents.includes('n.displayTimeLabel')) {
  console.error('FAIL: buildYearEvents must use per-entry displayAge/displayTimeLabel')
  failed++
}

if (!orchestrator.includes('if (maxIndexedEndRound > 0)')) {
  console.error('FAIL: compression cleanup must wait until a new L1 range was actually indexed')
  failed++
}

if (
  !memoryLifecycle.includes('existingIndex') ||
  (!memoryLifecycle.includes('e.level === level && e.startRound === startRound && e.endRound === endRound')
    && !memoryLifecycle.includes('e.level === entry.level && e.startRound === entry.startRound && e.endRound === entry.endRound'))
) {
  console.error('FAIL: memory lifecycle index must dedupe by level/startRound/endRound')
  failed++
}

if (
  !summaryCompressor.includes('didCompress: boolean') ||
  !summaryCompressor.includes('if (didCompress)') ||
  !summaryCompressor.includes('didCompress: false')
) {
  console.error('FAIL: summary compressor must report real compression and guard lastCompressionAt')
  failed++
}

if (
  !summaryPrompt.includes('只总结 eventRecords.narrative') ||
  !summaryPrompt.includes('模拟系统可能延后')
) {
  console.error('FAIL: summary prompt must forbid inferred deferred simulation states')
  failed++
}

const runtimeNarrativeVars = [
  'narrativeToneHint',
  'timeBridgeSummary',
  'causalChainHint',
  'timeGuideText',
  'narrativeGuidanceText',
]
for (const variable of runtimeNarrativeVars) {
  if (!narrativePrompt.includes(`'${variable}'`)) {
    console.error(`FAIL: narrative prompt variables missing ${variable}`)
    failed++
  }
  if (!promptContract.includes(`"${variable}"`)) {
    console.error(`FAIL: prompt context contract missing narrative variable ${variable}`)
    failed++
  }
}

if (!promptBuilder.includes('buildConversationMessages')) {
  console.error('FAIL: buildConversationMessages / S3 not wired')
  failed++
}

if (!promptBuilder.includes('KV_MESSAGE_STRATEGY')) {
  console.error('FAIL: KV_MESSAGE_STRATEGY not used')
  failed++
}

if (!orchestrator.includes('buildTimeBridgeSummary')) {
  console.error('FAIL: TS-5 time bridge not wired in orchestrator')
  failed++
}

if (lifespanSystem.includes('lastNarrativeText')) {
  console.error('FAIL: lifespan must not infer lifespan changes from narrative text')
  failed++
}

// eventInjection before currentState in prompt-builder FAST_JSON_KEYS
const fastMatch = promptBuilder.match(/const FAST_JSON_KEYS = \[([\s\S]*?)\] as const/)
if (fastMatch) {
  const fastBlock = fastMatch[1]
  const eventIdx = fastBlock.indexOf("'事件注入'")
  const stateIdx = fastBlock.indexOf("'当前状态'")
  const directorIdx = fastBlock.indexOf("'本轮导演提示'")
  if (eventIdx < 0 || stateIdx < 0 || eventIdx > stateIdx) {
    console.error('FAIL: FAST_JSON_KEYS order — eventInjection must precede currentState')
    failed++
  }
  if (directorIdx < 0 || !fastBlock.trim().endsWith("'本轮导演提示',")) {
    console.error('FAIL: FAST_JSON_KEYS order — round director hint must be the final dynamic key')
    failed++
  }
} else {
  console.error('FAIL: FAST_JSON_KEYS not found')
  failed++
}

if (!promptBuilder.includes('buildRoundDirectorHint')) {
  console.error('FAIL: round director hint builder missing')
  failed++
}

const buildRoundDirectorHint = compileStandaloneFunction(
  promptBuilder,
  'prompt-builder.ts',
  'buildRoundDirectorHint',
)
const migratedHistoryHint = buildRoundDirectorHint?.({
  timeGuideText: '时间提示',
  narrativeGuidanceText: '剧情提示',
}) ?? ''
assertOk(
  migratedHistoryHint.endsWith('仅在 [NARRATIVE] 正文中，全程以第二人称“你”指代玩家角色。'),
  'the final S2 user segment must restate second-person narration after historical memory',
)
assertOk(
  migratedHistoryHint.includes('不得模仿其人称、措辞或段落结构')
    && memoryLifecycle.includes('以下是已发生事实的原始记录')
    && memoryLifecycle.includes('不得模仿其中的叙述人称、措辞或段落结构'),
  'legacy narrative text must remain factual memory rather than a style sample',
)

const wordCountStart = orchestrator.indexOf('wordCountInstruction:')
const wordCountEnd = orchestrator.indexOf('calibrationSummary:', wordCountStart)
const wordCountBlock = wordCountStart >= 0 && wordCountEnd > wordCountStart
  ? orchestrator.slice(wordCountStart, wordCountEnd)
  : ''
if (wordCountBlock.includes('buildTimeScaleNarrativeHint')) {
  console.error('FAIL: time-scale hint must not be embedded in stable wordCountInstruction')
  failed++
}

const collectActiveModWorldRules = compileStandaloneFunction(
  promptGate,
  'subsystem-prompt-gate.ts',
  'collectActiveModWorldRules',
)
const activeRules = collectActiveModWorldRules?.([
  { name: 'mod-engine', worldRules: '引擎规则' },
  { name: 'mod-character', worldRules: '角色规则' },
  { name: 'mod-world', worldRules: '共享规则' },
  { name: 'mod-npc', worldRules: '未启用 NPC 规则' },
  { name: 'mod-duplicate', worldRules: '共享规则' },
], [
  { mod: 'mod-character' },
  { mod: 'mod-world' },
])
assertOk(
  activeRules === '引擎规则\n角色规则\n共享规则',
  'MOD world rules must include only active runtime providers, preserve order, and dedupe text',
)

const buildMvpSubsystemGuide = compileStandaloneFunction(
  mvpRuntimePolicy,
  'mvp-runtime-policy.ts',
  'buildMvpSubsystemGuide',
  {
    MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS: new Set([
      'character-base',
      'lifespan',
      'luck',
      'morality',
    ]),
    buildSubsystemGuide: (ids) => `guide:${[...ids].join(',')}`,
  },
)
const activeGuide = buildMvpSubsystemGuide?.([
  'morality',
  'character-base',
  'inactive-system',
  'lifespan',
]) ?? ''
assertOk(
  activeGuide.includes('本轮可变更子系统仅：character-base lifespan morality')
    && activeGuide.includes('guide:character-base,lifespan,morality')
    && !activeGuide.includes('inactive-system')
    && !activeGuide.includes(' luck'),
  'subsystem guide must be the stable-order intersection of active and writable systems',
)
assertOk(
  buildMvpSubsystemGuide?.(['inactive-system']) === '',
  'no writable active subsystem must produce no subsystem guide',
)

const formatEquippedMythicPatternForPrompt = compileStandaloneFunction(
  orchestrator,
  'orchestrator-system.ts',
  'formatEquippedMythicPatternForPrompt',
)
const formatDestinyPatternsForPrompt = compileStandaloneFunction(
  orchestrator,
  'orchestrator-system.ts',
  'formatDestinyPatternsForPrompt',
)
assertOk(
  formatEquippedMythicPatternForPrompt?.(null) === undefined
    && formatEquippedMythicPatternForPrompt?.({ name: '空壳', concept: '空', effect: '   ' }) === undefined,
  'empty mythic slots or empty effects must not enter the prompt',
)
assertOk(
  formatEquippedMythicPatternForPrompt?.({
    name: '未熄之诺',
    concept: '承诺',
    effect: '真诚许下的承诺更难被世界轻易抹去。',
  }) === '【已装备神话命格·每轮遵守】未熄之诺（承诺）：真诚许下的承诺更难被世界轻易抹去。',
  'equipped mythic effects must be formatted as an explicit per-round narrative rule',
)
assertOk(
  formatDestinyPatternsForPrompt?.([], false) === undefined
    && formatDestinyPatternsForPrompt?.([
      { name: '潮声', description: '能从潮声中辨认远方变化。', effect: '潮声会提示环境变化，但不会给出确定答案。' },
    ], false) === '【普通命格·每轮遵守】潮声：潮声会提示环境变化，但不会给出确定答案。'
    && formatDestinyPatternsForPrompt?.([
      { name: '潮声', description: '能从潮声中辨认远方变化。', effect: '潮声会提示环境变化，但不会给出确定答案。' },
    ], true)?.includes('特质说明：能从潮声中辨认远方变化。'),
  'ordinary destiny effects must stay compact but remain explicit per-round rules, with descriptions added only at opening',
)
assertOk(
  orchestrator.includes('useCharacterStore.getState().equippedMythicPattern')
    && orchestrator.includes('const destinyPatternText = formatDestinyPatternsForPrompt(')
    && orchestrator.includes("talents: [destinyPatternText, mythicPatternText].filter(Boolean).join('\\n') || undefined"),
  'ordinary and equipped mythic effects must both be injected every round',
)
assertOk(
  narrativePrompt.includes('普通命格与已装备神话命格的 effect 都是每轮持续遵守的叙事规则'),
  'system prompt must define ordinary and mythic effects as persistent rules while keeping mythic inheritance narrative-only',
)

assertOk(
  orchestrator.includes('collectActiveModWorldRules(')
    && !orchestrator.includes('.filter((m) => m.worldRules)'),
  'orchestrator must not aggregate worldRules from every loaded manifest',
)
assertOk(
  orchestrator.includes('buildMvpSubsystemGuide(promptOpenIds)')
    && !orchestrator.includes('assembled.subsystemGuideText = SUBSYSTEM_GUIDE'),
  'orchestrator must inject a guide derived from the systems open in this round',
)
for (const inactiveConnection of [
  'buildEconomyTierRules',
  'buildCausalChainHint',
  "@/mods/mod-power-system",
]) {
  assertOk(
    !orchestrator.includes(inactiveConnection),
    `inactive prompt connection must stay removed: ${inactiveConnection}`,
  )
}
assertOk(
  narrativePrompt.includes("version: '2.9.0'") && !narrativePrompt.includes('examples: ['),
  'optimized prompt must be versioned and must not duplicate the schema into large few-shot examples',
)
assertOk(
  narrativePrompt.includes('正文全程用第二人称“你”指代玩家角色')
    && narrativePrompt.includes('禁止写成第三人称传记、履历或编年报告')
    && narrativePrompt.includes('每轮至少落入一个可辨认的现场')
    && narrativePrompt.includes('婴幼儿阶段仍使用“你”')
    && narrativePrompt.includes('娱乐性与持续游玩意愿')
    && narrativePrompt.includes('styleReference'),
  'main narrative prompt must lock second-person viewpoint and scene-level immersion without changing the META schema',
)
assertOk(
  narrativePrompt.includes('三段围绕同一条因果主线')
    && narrativePrompt.includes('不得把三个独立日常、地点或人物各写成一段')
    && narrativePrompt.includes('不得按时间切成互不相干的生活切片'),
  'main narrative prompt must reject annual disconnected-life-slice output while retaining one causal storyline',
)
const systemPromptStart = narrativePrompt.indexOf('export const SYSTEM_PROMPT')
const systemPromptEnd = narrativePrompt.indexOf('\n})', systemPromptStart)
const systemPromptSource = systemPromptStart >= 0 && systemPromptEnd > systemPromptStart
  ? narrativePrompt.slice(systemPromptStart, systemPromptEnd + 3)
  : ''
assertOk(
  systemPromptSource.length > 0 && systemPromptSource.length < 5_500,
  'fixed SYSTEM_PROMPT source must stay compact enough for efficient repeated simulation calls',
)
for (const duplicatedStaticContract of [
  'allowedSubSystems:',
  'attributeRules:',
  'mvpChangePolicy:',
  'resourcesDelta',
]) {
  assertOk(
    !systemPromptSource.includes(duplicatedStaticContract),
    `fixed prompt must not duplicate runtime-derived field contracts: ${duplicatedStaticContract}`,
  )
}

if (failed === 0) {
  console.log('PASS: kv-prompt-audit (wiring + compression + field order)')
  process.exit(0)
}
process.exit(1)
