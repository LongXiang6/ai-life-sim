/**
 * Phase 6：叙事 Prompt 接线审计（纯逻辑，不依赖 TS 编译）
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { compileNarrativeGuidance } from '../../../../src/core/ai-service/narrative-guidance-compiler.ts'
import { narrativePrompt as liveNarrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import {
  COMPILED_NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_SYSTEM_COMPONENTS,
} from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'

const root = getProjectRoot(import.meta.url)

const promptBuilder = fs.readFileSync(
  path.join(root, 'src/core/ai-service/prompt-builder.ts'),
  'utf8',
)
const narrativePrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/prompts/narrative-prompt.ts'),
  'utf8',
)
const narrativeSystemPrompt = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/server/narrative-system-prompt.ts'),
  'utf8',
)
const campaign = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/campaigns/default/index.ts'),
  'utf8',
)
const settlementContext = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-settlement-context.ts'),
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
const coreMemory = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/core-memory-system.ts'),
  'utf8',
)
const narrativeHints = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-hints.ts'),
  'utf8',
)
const narrativeIOSample = fs.readFileSync(
  path.join(root, 'docs/reference/ai-narrative-io-proposed-segmented.txt'),
  'utf8',
).replace(/\r\n/gu, '\n').trimEnd()
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
  'timelineMemory',
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

if (!promptBuilder.includes('userSegments: [string, string, string]')) {
  console.error('FAIL: fixed three-message tuple not found')
  failed++
}

if (campaign.includes('segments.stablePrefix, segments.variableSuffix')) {
  console.error('FAIL: campaign still uses legacy broken userSegments')
  failed++
}

if (!campaign.includes('userSegments: segments.userSegments')) {
  console.error('FAIL: campaign not using the fixed three narrative messages')
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
  !summaryPrompt.includes('只写 sourceFacts 或 existingCompressedHistory') ||
  !summaryPrompt.includes('禁止补写模拟状态')
) {
  console.error('FAIL: timeline summary prompt must forbid inferred deferred simulation states')
  failed++
}

const runtimeNarrativeContextFields = [
  'narrativeToneHint',
  'timeBridgeSummary',
  'causalChainHint',
  'roundSystemGuidanceText',
  'playerBranchIntent',
  'timeGuideText',
  'narrativeGuidanceText',
]
for (const variable of runtimeNarrativeContextFields) {
  if (!promptContract.includes(`"${variable}"`)) {
    console.error(`FAIL: prompt context contract missing narrative variable ${variable}`)
    failed++
  }
}

if (promptBuilder.includes('buildConversationMessages')) {
  console.error('FAIL: removed conversation-message strategy remains wired')
  failed++
}

if (promptBuilder.includes('KV_MESSAGE_STRATEGY')) {
  console.error('FAIL: removed dynamic KV message strategy remains wired')
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
  ['GLOBAL_JSON_KEYS', ['世界设定', '角色档案', '命格天赋']],
  ['ROUND_JSON_KEYS', ['当前时间', '角色现状', '本轮触发事项', '系统引导', '玩家自定义分支', '字数要求']],
]) {
  const match = promptBuilder.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const`))
  assertOk(Boolean(match), `${name} must remain an explicit ordered layer`)
  for (const key of requiredKeys) {
    assertOk(match?.[1]?.includes(`'${key}'`), `${name} missing ${key}`)
  }
}
const globalKeysBlock = promptBuilder.match(/const GLOBAL_JSON_KEYS = \[([\s\S]*?)\] as const/)?.[1] ?? ''
const roundKeysBlock = promptBuilder.match(/const ROUND_JSON_KEYS = \[([\s\S]*?)\] as const/)?.[1] ?? ''
assertOk(
  !globalKeysBlock.includes("'字数要求'")
    && !globalKeysBlock.includes("'玩家自定义'")
    && roundKeysBlock.lastIndexOf("'字数要求'") > roundKeysBlock.lastIndexOf("'玩家自定义分支'"),
  'raw player settings must stay removed while word-count guidance remains the final dynamic field',
)
assertOk(
  promptBuilder.indexOf('全局信息: pickJsonKeys')
    < promptBuilder.indexOf('记忆: context.timelineMemory')
    && promptBuilder.indexOf('记忆: context.timelineMemory')
      < promptBuilder.indexOf('本轮引导: pickJsonKeys')
    && !promptBuilder.includes('变化要求: pickJsonKeys')
    && promptBuilder.includes('userSegments: [string, string, string]'),
  'first-call assembly must remain global information -> memory -> round guidance with no write contract layer',
)
const timeScaleNarrative = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/time-scale-narrative.ts'),
  'utf8',
)

const cacheLayerBaseContext = {
  worldNarrativeView: {
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
  currentTime: '测试历 1 年',
  timelineMemory: '【时间轴记忆】\n【时间阶段：测试历1年】\n- [测试历1年] 玩家角色亲自开创[玩家原创·其他] 原创事实甲',
  wordCountInstruction: '本轮正文目标约200个汉字。',
}
const cacheLayerChangedContext = {
  ...cacheLayerBaseContext,
  currentTime: '测试历 2 年',
  timelineMemory: '【时间轴记忆】\n【时间阶段：测试历1年】\n- [测试历1年] 玩家角色亲自开创[玩家原创·其他] 原创事实甲\n\n【时间阶段：测试历2年】\n- [测试历2年] 原创事实乙',
  wordCountInstruction: '本轮正文目标约500个汉字。',
}
const cacheLayerBefore = buildSegmentedPrompt(liveNarrativePrompt, cacheLayerBaseContext)
const cacheLayerAfter = buildSegmentedPrompt(liveNarrativePrompt, cacheLayerChangedContext)
assertOk(
  cacheLayerBefore.userSegments?.[0] === cacheLayerAfter.userSegments?.[0],
  'dynamic time and permanent creation memory must not invalidate the stable global cache message',
)
assertOk(
  cacheLayerBefore.userSegments?.[1] !== cacheLayerAfter.userSegments?.[1]
    && cacheLayerBefore.userSegments?.[2] !== cacheLayerAfter.userSegments?.[2],
  'permanent creation ownership must remain in timeline memory while time and length remain in round guidance',
)
assertOk(
    !promptBuilder.includes('creationProtectionText')
    && !promptBuilder.includes("'原创保护'")
    && orchestrator.includes('coreMemory.buildCreationTimelineEntries('),
  'player creations must use the core-memory projection without a dedicated prompt field',
)
assertOk(
  orchestrator.includes('memoryLifecycle.buildNarrativeTimelineProjection(')
    && !orchestrator.includes('getCompressedNarrativeHistory(')
    && !memoryLifecycle.includes('formatRichPromptForInjection(')
    && !memoryLifecycle.includes('stateCard:'),
  'narrative memory must have one timeline-only projection path without the retired mixed-state formatter',
)

const compiledGuidance = compileNarrativeGuidance({
  roundSystemGuidanceText: '系统提示甲',
  timeGuideText: '系统提示甲',
  narrativeGuidanceText: '系统提示乙',
  playerBranchIntent: { 当前意图: { 玩家选择: '保留  原始空格' } },
})
assertOk(
  JSON.stringify(compiledGuidance.systemGuidance) === JSON.stringify(['系统提示甲', '系统提示乙'])
    && compiledGuidance.playerBranchIntent?.当前意图?.玩家选择 === '保留  原始空格'
    && !fs.readFileSync(path.join(root, 'src/core/ai-service/narrative-guidance-compiler.ts'), 'utf8').includes('.slice('),
  'local guidance compiler must sort, dedupe exact system text, preserve player input, and avoid length truncation',
)
assertOk(
  narrativeSystemPrompt.includes('记忆只提供已经成立的事实')
    && narrativeSystemPrompt.includes('本轮必须从当前时间与引导产生新的变化和结果')
    && narrativeSystemPrompt.includes('正文全程用第二人称“你”')
    && !memoryLifecycle.includes('不得模仿其中的人称、措辞或段落结构'),
  'server fixed authority alone must define how narrative memory is used',
)
for (const [source, duplicatedRule] of [
  [coreMemory, '以下内容由玩家角色亲自开创'],
  [coreMemory, '不得改写为遗迹发现'],
  [orchestrator, '跨世界概念能力·每轮遵守'],
  [orchestrator, '受世界合理性约束·每轮遵守'],
  [orchestrator, '本轮必须处理“玩家自定义分支”中的当前意图'],
  [narrativeHints, '固定事实优先级与三级合理性规则'],
]) {
  assertOk(!source.includes(duplicatedRule), `dynamic narrative input must not repeat fixed rule: ${duplicatedRule}`)
}
const exactSampleContext = {
  worldNarrativeView: {
    字段名称: '<世界设定字段值>',
  },
  worldRules: '<世界规则>',
  modWorldRules: '<模组世界规则>',
  worldTagsText: '<世界标签>',
  calibrationSummary: '<世界校准>',
  powerFramework: '<力量体系>',
  talents: '<命格天赋>',
  characterProfileView: {
    字段名称: '<角色档案字段值>',
  },
  narrativeStyle: '<叙事风格设置>',
  narrativeToneHint: '<叙事基调设置>',
  timelineMemory: [
    '【时间轴记忆】',
    '【时间阶段：<时间阶段一>】',
    '- [<发生时间一>] <已成立事实一>',
    '',
    '【时间阶段：<时间阶段二>】',
    '- [<发生时间二>] <已成立事实二>',
  ].join('\n'),
  currentTime: '<当前时间>',
  characterStatusView: { 字段名称: '<角色现状字段值>' },
  subsystemSummaries: ['<当前状态条目>'],
  systemChangeSummary: '<最近变化>',
  plotStructureText: '<当前情节阶段>',
  foreshadowingText: '<本轮可回收伏笔>',
  eventInjectionText: '<本轮触发事项>',
  timeBridgeSummary: '<时间跨度摘要>',
  causalChainHint: '<已触发因果>',
  roundSystemGuidanceText: '<系统引导>',
  narrativeGuidanceText: '<叙事引导>',
  playerBranchIntent: {
    当前意图: {
      意图编号: '<意图编号>',
      分支编号: '<分支编号>',
      玩家选择: '<玩家原始选择>',
      建立轮次: '<建立轮次>',
      更新轮次: '<更新轮次>',
    },
  },
  wordCountInstruction: '<本轮字数要求>',
}
const exactSampleDynamicInput = buildSegmentedPrompt(
  liveNarrativePrompt,
  exactSampleContext,
).full
const sampleDynamicMarker = narrativeIOSample.indexOf('\n⟦全局信息⟧')
const sampleFixedPrefix = sampleDynamicMarker >= 0
  ? narrativeIOSample.slice(0, sampleDynamicMarker)
  : ''
const sampleDynamicInput = sampleDynamicMarker >= 0
  ? narrativeIOSample.slice(sampleDynamicMarker + 1)
  : ''
assertOk(
  sampleFixedPrefix === COMPILED_NARRATIVE_SYSTEM_PROMPT
    && sampleDynamicInput === exactSampleDynamicInput
    && sampleDynamicInput.split('\n').filter((line) => /^⟦(?:全局信息|记忆|本轮引导)⟧/u.test(line)).length === 3
    && sampleDynamicInput.includes('⟦记忆⟧【时间轴记忆】\n【时间阶段：')
    && sampleDynamicInput.includes('\n\n【时间阶段：<时间阶段二>】\n- ')
    && !/weight|权重|sourceEventIds|currentWeight|衰减|L[123]时间轴/iu.test(sampleDynamicInput)
    && !sampleDynamicInput.includes('以下内容由玩家角色亲自开创')
    && !/临海北湾|阿禾|旧桥|海雾|写实|克制而温暖/u.test(sampleDynamicInput)
    && !sampleDynamicInput.includes('最终玩家可见结果完整写入 content'),
  'the exact I/O sample must byte-match the compiled messages and contain only format placeholders',
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
    && formatEquippedMythicPatternForPrompt?.([{ name: '空壳', concept: '空', effect: '   ' }]) === undefined,
  'empty mythic slots or empty effects must not enter the prompt',
)
assertOk(
  formatEquippedMythicPatternForPrompt?.([
    { name: '未熄之诺', concept: '承诺', effect: '真诚许下的承诺更难被世界轻易抹去。' },
    { name: '回声', concept: '记忆', effect: '重要关系会留下可追溯的回声。' },
  ]) === '【轮回天赋】未熄之诺（承诺）：真诚许下的承诺更难被世界轻易抹去。\n回声（记忆）：重要关系会留下可追溯的回声。',
  'multiple equipped mythic effects must retain their facts under a rule-free dynamic label',
)
assertOk(
  formatDestinyPatternsForPrompt?.([], false) === undefined
    && formatDestinyPatternsForPrompt?.([
      { name: '潮声', description: '能从潮声中辨认远方变化。', effect: '潮声会提示环境变化，但不会给出确定答案。' },
    ], false) === '【普通命格】潮声：潮声会提示环境变化，但不会给出确定答案。'
    && formatDestinyPatternsForPrompt?.([
      { name: '潮声', description: '能从潮声中辨认远方变化。', effect: '潮声会提示环境变化，但不会给出确定答案。' },
    ], true)?.includes('特质说明：能从潮声中辨认远方变化。'),
  'ordinary destiny effects must stay compact and factual, with descriptions added only at opening',
)
assertOk(
  orchestrator.includes('useCharacterStore.getState().equippedMythicPatterns')
    && orchestrator.includes('const destinyPatternText = formatDestinyPatternsForPrompt(')
    && orchestrator.includes("talents: [mythicPatternText, destinyPatternText].filter(Boolean).join('\\n') || undefined"),
  'equipped mythic effects must precede ordinary destiny effects in the single compact talent field',
)
assertOk(
  narrativeSystemPrompt.includes('已装备轮回天赋 > 世界内合理性 > 普通命格')
    && narrativeSystemPrompt.includes('轮回天赋是跨世界生效的概念性能力')
    && narrativeSystemPrompt.includes('普通命格只有在世界内因果合理时生效'),
  'system prompt must distinguish mythic cross-world authority from reasonableness-bound ordinary talents',
)

assertOk(
  orchestrator.includes('collectActiveModWorldRules(')
    && !orchestrator.includes('.filter((m) => m.worldRules)'),
  'orchestrator must not aggregate worldRules from every loaded manifest',
)
assertOk(
  !orchestrator.includes('subsystemGuideText:')
    && !orchestrator.includes('changeRequirementsText:')
    && campaign.includes('buildNarrativeSettlementPromptInput({')
    && settlementContext.includes('⟦可写系统:${contract.aiName}⟧')
    && settlementContext.includes('stateLines.join(\'\\n\')'),
  'write contracts and active system state must belong only to the second settlement call',
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
  liveNarrativePrompt.version === '5.8.1'
    && liveNarrativePrompt.systemPrompt === ''
    && !narrativeSystemPrompt.includes('examples: ['),
  'optimized prompt must be versioned and keep one governed standard example instead of duplicate examples',
)
assertOk(
  narrativeSystemPrompt.includes('正文全程用第二人称“你”')
    && narrativeSystemPrompt.includes('不写全知旁白、第三人称传记或编年报告')
    && narrativeSystemPrompt.includes('日级可用一个可感知现场承载主线')
    && narrativeSystemPrompt.includes('年级及以上依本轮时间尺度用多个阶段节点或时代断点承载同一因果主线')
    && narrativeSystemPrompt.includes('短档通过压缩每个节点而不是删除时间尺度要求的节点控制篇幅')
    && narrativeSystemPrompt.includes('年级及以上仍须保留起点、阶段变化或转折与结束格局')
    && !narrativeSystemPrompt.includes('若本轮按年或更长跨度推进，正文仍只选择一个代表性现场')
    && !narrativeSystemPrompt.includes('先选择能在该区间内自然收束的单一事件')
    && narrativeSystemPrompt.includes('娱乐性、代入感和继续游玩的意愿')
    && NARRATIVE_SYSTEM_COMPONENTS.some((component) => component.kind === '示例'),
  'main narrative components must lock second-person viewpoint and scale-aware scene structure',
)
assertOk(
  narrativeSystemPrompt.includes('连续推进同一因果主线')
    && narrativeSystemPrompt.includes('互不相干的生活切片')
    && timeScaleNarrative.includes('正文必须沿同一时间跨度内的因果主线推进')
    && timeScaleNarrative.includes('不拼接互不相干的事件或生活切片'),
  'main narrative prompt must reject annual disconnected-life-slice output while retaining one causal storyline',
)
assertOk(
  COMPILED_NARRATIVE_SYSTEM_PROMPT.length > 0 && COMPILED_NARRATIVE_SYSTEM_PROMPT.length < 8_000,
  'compiled fixed SYSTEM_PROMPT must stay compact enough for efficient repeated simulation calls',
)
assertOk(
  orchestrator.includes("id: 'round-output-contract'")
    && orchestrator.includes('order: 10_000')
    && orchestrator.includes('buildNarrativeRoundOutputContract('),
  'the compact output contract must be the final dynamic guidance component',
)
for (const duplicatedStaticContract of [
  'allowedSubSystems:',
  'attributeRules:',
  'mvpChangePolicy:',
  'resourcesDelta',
]) {
  assertOk(
    !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes(duplicatedStaticContract),
    `fixed prompt must not duplicate runtime-derived field contracts: ${duplicatedStaticContract}`,
  )
}

if (failed === 0) {
  console.log('PASS: kv-prompt-audit (wiring + compression + field order)')
  process.exit(0)
}
process.exit(1)
