/**
 * Phase 6：叙事 Prompt 接线审计（纯逻辑，不依赖 TS 编译）
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { buildMvpSubsystemGuide } from '../../../../src/mods/mod-engine/helpers/mvp-runtime-policy.ts'
import { narrativePrompt as liveNarrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { NARRATIVE_SYSTEM_COMPONENTS } from '../../../../src/mods/mod-engine/prompts/narrative-prompt-components.ts'

const root = getProjectRoot(import.meta.url)

const promptBuilder = fs.readFileSync(
  path.join(root, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const narrativePrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/narrative-prompt.ts'),
  'utf8',
)
const narrativePromptComponents = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/narrative-prompt-components.ts'),
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
  'longTermMemory',
  'relevantMemory',
  'recentNarrativeMemory',
  'coreMemory',
  'eventInjectionText',
  'timeBridgeSummary',
  'narrativeToneHint',
  'subsystemSummaries',
  'characterProfileView',
  'characterStatusView',
  'worldNarrativeView',
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

const runtimeNarrativeContextFields = [
  'narrativeToneHint',
  'timeBridgeSummary',
  'causalChainHint',
  'timeGuideText',
  'narrativeGuidanceText',
]
for (const variable of runtimeNarrativeContextFields) {
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

for (const [name, requiredKeys] of [
  ['GLOBAL_JSON_KEYS', ['世界设定', '角色档案', '状态变更指南']],
  ['MEMORY_JSON_KEYS', ['长期记忆', '核心记忆', '相关往事', '近期完整经历']],
  ['ROUND_JSON_KEYS', ['当前时间', '角色现状', '本轮触发事项', '本轮导演提示']],
]) {
  const match = promptBuilder.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const`))
  assertOk(Boolean(match), `${name} must remain an explicit ordered layer`)
  for (const key of requiredKeys) {
    assertOk(match?.[1]?.includes(`'${key}'`), `${name} missing ${key}`)
  }
}
assertOk(
  promptBuilder.indexOf('全局信息: pickJsonKeys')
    < promptBuilder.indexOf('记忆: pickJsonKeys')
    && promptBuilder.indexOf('记忆: pickJsonKeys')
      < promptBuilder.indexOf('本轮引导: pickJsonKeys'),
  'three-layer assembly must remain global information -> memory -> round guidance',
)

const cacheLayerBaseContext = {
  worldNarrativeView: {
    当前上下文编号: 'ctx-cache',
    当前上下文类型: '世界',
    当前模拟范围: '当前完整模拟',
    当前世界能力: ['生命'],
    世界名称: '缓存测试世界',
    世界描述: '稳定不变的世界描述。',
    当前历法: '测试历',
  },
  characterProfileView: { 姓名: '测试角色', 性别: '女', 背景: '稳定背景' },
  characterStatusView: { 年龄: 18 },
  subsystemSummaries: ['【基础属性】体魄0'],
  narrativeHistory: [],
  currentTime: '测试历 1 年',
  creationProtectionText: '原创事实甲',
}
const cacheLayerChangedContext = {
  ...cacheLayerBaseContext,
  currentTime: '测试历 2 年',
  creationProtectionText: '原创事实甲\n原创事实乙',
}
const cacheLayerBefore = buildSegmentedPrompt(liveNarrativePrompt, cacheLayerBaseContext)
const cacheLayerAfter = buildSegmentedPrompt(liveNarrativePrompt, cacheLayerChangedContext)
assertOk(
  cacheLayerBefore.userSegments?.[0] === cacheLayerAfter.userSegments?.[0],
  'dynamic time and creation protection must not invalidate the stable global cache message',
)
assertOk(
  cacheLayerBefore.userSegments?.[1] !== cacheLayerAfter.userSegments?.[1]
    && cacheLayerBefore.userSegments?.[2] !== cacheLayerAfter.userSegments?.[2],
  'creation protection must remain in memory while current time remains in round guidance',
)

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
  migratedHistoryHint.endsWith('仅在“正文”中，全程以第二人称“你”指代玩家角色。'),
  'the final round-guidance layer must restate second-person narration after historical memory',
)
assertOk(
  migratedHistoryHint.includes('不得模仿其人称、措辞或段落结构')
    && memoryLifecycle.includes('以下内容是已经发生的完整事实')
    && memoryLifecycle.includes('不得模仿其中的人称、措辞或段落结构'),
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

const activeGuide = buildMvpSubsystemGuide([
  'morality',
  'character-base',
  'inactive-system',
  'lifespan',
]) ?? ''
assertOk(
  activeGuide.includes('本轮可变更系统仅限：基础属性、寿命、道德')
    && activeGuide.includes('体魄变化')
    && activeGuide.includes('最大寿命')
    && activeGuide.includes('道德变化')
    && !activeGuide.includes('inactive-system')
    && !activeGuide.includes('气运绝对值'),
  'subsystem guide must expose the stable-order Chinese intersection of active writable systems',
)
assertOk(
  buildMvpSubsystemGuide(['inactive-system']) === '',
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
  narrativePromptComponents.includes('普通与已装备神话命格效果每轮持续生效'),
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
  liveNarrativePrompt.version === '4.2.1'
    && !narrativePromptComponents.includes('examples: ['),
  'optimized prompt must be versioned and keep one governed standard example instead of duplicate examples',
)
assertOk(
  narrativePromptComponents.includes('正文全程用第二人称“你”')
    && narrativePromptComponents.includes('不写全知旁白、第三人称传记或编年报告')
    && narrativePromptComponents.includes('至少保留一个可感知现场')
    && narrativePromptComponents.includes('娱乐性、代入感和继续游玩的意愿')
    && NARRATIVE_SYSTEM_COMPONENTS.some((component) => component.kind === '示例'),
  'main narrative components must lock second-person viewpoint and scene-level immersion',
)
assertOk(
  narrativePromptComponents.includes('连续推进同一因果主线')
    && narrativePromptComponents.includes('三个独立生活切片')
    && narrativePromptComponents.includes('时间服务剧情，不逐步记账'),
  'main narrative prompt must reject annual disconnected-life-slice output while retaining one causal storyline',
)
assertOk(
  liveNarrativePrompt.systemPrompt.length > 0 && liveNarrativePrompt.systemPrompt.length < 8_000,
  'compiled fixed SYSTEM_PROMPT must stay compact enough for efficient repeated simulation calls',
)
for (const duplicatedStaticContract of [
  'allowedSubSystems:',
  'attributeRules:',
  'mvpChangePolicy:',
  'resourcesDelta',
]) {
  assertOk(
    !liveNarrativePrompt.systemPrompt.includes(duplicatedStaticContract),
    `fixed prompt must not duplicate runtime-derived field contracts: ${duplicatedStaticContract}`,
  )
}

if (failed === 0) {
  console.log('PASS: kv-prompt-audit (wiring + compression + field order)')
  process.exit(0)
}
process.exit(1)
