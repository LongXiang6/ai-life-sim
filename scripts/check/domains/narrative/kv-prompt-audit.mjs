/**
 * Purpose: Audit narrative Prompt wiring and key-value projection without TypeScript compilation.
 * Owner: quality:narrative
 * Responsibility: One static Prompt-contract audit and its optimization findings only.
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { readModuleSource } from '../../lib/read-module-source.mjs'
import {
  buildNarrativeUserJson,
  buildSegmentedPrompt,
  NARRATIVE_GLOBAL_JSON_KEYS,
  NARRATIVE_ROUND_JSON_KEYS,
} from '../../../../src/core/ai-service/prompt-builder.ts'
import {
  compileNarrativeGuidance,
  NARRATIVE_GUIDANCE_SOURCE_DEFINITIONS,
} from '../../../../src/core/ai-service/narrative-guidance-compiler.ts'
import { narrativePrompt as liveNarrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { auditNarrativePromptComponents } from '../../../../src/mods/mod-engine/prompts/narrative-prompt-components.ts'
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
const dataAnalysisContext = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-data-analysis-context.ts'),
  'utf8',
)
const basicAttributeContext = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-basic-attribute-context.ts'),
  'utf8',
)
const eventRecognitionContext = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-event-recognition-context.ts'),
  'utf8',
)
const macroImpactContext = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-macro-impact-context.ts'),
  'utf8',
)
const orchestrator = readModuleSource('src/mods/mod-engine/subsystems/orchestrator-system.ts', root)
const promptContextRuntime = readModuleSource(
  'src/mods/mod-engine/subsystems/orchestrator-system/prompt-context-runtime.ts',
  root,
)
const memoryLifecycle = readModuleSource('src/mods/mod-engine/subsystems/memory-lifecycle-system.ts', root)
const narrativeHints = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/helpers/narrative-hints.ts'),
  'utf8',
)
const subsystemRelevance = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/subsystem-relevance-system.ts'),
  'utf8',
)
const narrativeIOSample = fs.readFileSync(
  path.join(root, 'docs/reference/ai-narrative-io-proposed-segmented.txt'),
  'utf8',
).replace(/\r\n/gu, '\n').trimEnd()
const summaryCompressor = readModuleSource('src/mods/mod-engine/subsystems/summary-compressor-system.ts', root)
const characterStatusRuntime = fs.readFileSync(
  path.join(root, 'src/mods/mod-character/subsystems/character-status-runtime.ts'),
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
const optimizationFindings = []

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}

function recordOptimization(code, source, message, evidence = '') {
  optimizationFindings.push({ code, source, message, evidence })
}

function countOccurrences(text, fragment) {
  if (!fragment) return 0
  return text.split(fragment).length - 1
}

function detectPromptContradictions(text) {
  const issues = []
  if (
    /年(?:级|度|跨度)[^。\n]{0,40}(?:只|仍只)[^。\n]{0,20}单一(?:事件|现场)/u.test(text)
    && /年(?:级|度|跨度)[^。\n]{0,60}不得[^。\n]{0,20}单一(?:事件|现场)/u.test(text)
  ) {
    issues.push('year-scale-single-scene-conflict')
  }
  if (
    /本轮[^。\n]{0,20}必须[^。\n]{0,20}(?:输出|提供)分支/u.test(text)
    && /无真正[^。\n]{0,20}抉择[^。\n]{0,20}仅写正文/u.test(text)
  ) {
    issues.push('branch-required-vs-optional-conflict')
  }
  return issues
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

if (
  !orchestrator.includes('runCompressionGate({')
  || !orchestrator.includes('createCompressionCandidate(')
  || !orchestrator.includes('commitCompressionCandidate(')
) {
  console.error('FAIL: orchestrator not wired to candidate-based compression gate')
  failed++
}
assertOk(
  !orchestrator.includes('generateCompressedSummaries')
    && !summaryCompressor.includes('generateCompressedSummaries'),
  'retired shared-mutation compression API must be removed',
)

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

if (characterStatusRuntime.includes('lastNarrativeText')) {
  console.error('FAIL: character status must not infer state changes from narrative text')
  failed++
}

assertOk(
  JSON.stringify(NARRATIVE_GLOBAL_JSON_KEYS) === JSON.stringify([
    '世界设定',
    '世界规则',
    '模组世界规则',
    '世界标签',
    '世界校准',
    '力量体系',
    '命格天赋',
    '角色档案',
    '叙事风格',
    '叙事基调',
  ])
    && JSON.stringify(NARRATIVE_ROUND_JSON_KEYS) === JSON.stringify([
      '当前时间',
      '角色现状',
      '当前状态',
      '最近变化',
      '当前情节阶段',
      '本轮可回收伏笔',
      '本轮触发事项',
      '时间跨度摘要',
      '已触发因果',
      '系统引导',
      '本轮玩家行动',
      '字数要求',
    ]),
  'prompt field registry must remain complete and ordered by its owning layer',
)
assertOk(
  !NARRATIVE_GLOBAL_JSON_KEYS.includes('字数要求')
    && !NARRATIVE_GLOBAL_JSON_KEYS.includes('玩家自定义')
    && NARRATIVE_ROUND_JSON_KEYS.at(-1) === '字数要求',
  'raw player settings must stay removed while word-count guidance remains the final dynamic field',
)
assertOk(
  new Set([...NARRATIVE_GLOBAL_JSON_KEYS, ...NARRATIVE_ROUND_JSON_KEYS]).size
    === NARRATIVE_GLOBAL_JSON_KEYS.length + NARRATIVE_ROUND_JSON_KEYS.length,
  'every first-call JSON field must have one owning segment',
)
assertOk(
  JSON.stringify(NARRATIVE_GUIDANCE_SOURCE_DEFINITIONS) === JSON.stringify([
    { id: 'round-system-guidance', order: 10, contextKey: 'roundSystemGuidanceText' },
    { id: 'time-guide', order: 20, contextKey: 'timeGuideText' },
    { id: 'dynamic-guidance', order: 30, contextKey: 'narrativeGuidanceText' },
  ]),
  'dynamic guidance sources must declare stable IDs, owners, and explicit order in one registry',
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
    && orchestrator.includes('memoryLifecycle.buildCreationTimelineEntries('),
  'player creations must use the unified memory projection without a dedicated prompt field',
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
  playerBranchIntent: { 本轮明确行动: '保留  原始空格' },
})
assertOk(
  JSON.stringify(compiledGuidance.systemGuidance) === JSON.stringify(['系统提示甲', '系统提示乙'])
    && compiledGuidance.playerBranchIntent?.本轮明确行动 === '保留  原始空格'
    && !fs.readFileSync(path.join(root, 'src/core/ai-service/narrative-guidance-compiler.ts'), 'utf8').includes('.slice('),
  'local guidance compiler must sort, dedupe exact system text, preserve player input, and avoid length truncation',
)

const promptComponentAudit = auditNarrativePromptComponents(NARRATIVE_SYSTEM_COMPONENTS)
for (const issue of promptComponentAudit) {
  if (issue.severity === 'error') {
    assertOk(false, `${issue.code}: ${issue.message}`)
  } else {
    recordOptimization(issue.code, issue.componentId, issue.message, issue.relatedComponentId ?? '')
  }
}
if (countOccurrences(COMPILED_NARRATIVE_SYSTEM_PROMPT, '最终玩家可见结果完整写入 content') > 1) {
  recordOptimization(
    'prompt-repeated-output-duty',
    'chinese-output-protocol',
    'content 字段职责和起始标签在同一输出协议内重复声明。',
    '最终玩家可见结果完整写入 content',
  )
}

const auditFixture = (id, order, content) => ({
  id,
  title: id,
  kind: '写作规则',
  lifecycle: '全局常驻',
  authority: '剧情引导',
  order,
  dependsOn: [],
  assemblyPosition: '系统固定前缀',
  loadWhen: '测试时加载',
  exitWhen: '测试结束',
  acceptanceEvidence: 'kv-prompt-audit',
  content,
})
const syntheticPromptAudit = auditNarrativePromptComponents([
  auditFixture('fixture-a', 10, '最终结果完整写入 content。'),
  auditFixture('fixture-b', 20, '生成完成后，最终结果完整写入 content。'),
])
assertOk(
  syntheticPromptAudit.some((issue) => issue.code === 'overlapping-component-guidance'),
  'prompt audit must detect cross-component containment instead of exact-text duplicates only',
)
assertOk(
  detectPromptContradictions('年度跨度仍只选择一个单一现场。年度跨度不得压成单一现场。')
    .includes('year-scale-single-scene-conflict'),
  'prompt audit must detect contradictory time-scale instructions',
)
assertOk(
  detectPromptContradictions(COMPILED_NARRATIVE_SYSTEM_PROMPT).length === 0,
  'compiled fixed prompt must not contain known instruction contradictions',
)

const concreteTopicSeeds = [
  '药剂',
  '遗迹',
  '秘境',
  '陌生观察者',
  '神秘来客',
  '王朝',
  '宗教',
  '血脉',
  '遗物',
]
const fixedTopicSeeds = concreteTopicSeeds.filter((term) => COMPILED_NARRATIVE_SYSTEM_PROMPT.includes(term))
const timeScaleTopicSeeds = concreteTopicSeeds.filter((term) => timeScaleNarrative.includes(term))
if (fixedTopicSeeds.length > 0 || timeScaleTopicSeeds.length > 0) {
  recordOptimization(
    'prompt-concrete-topic-seeds',
    'fixed-and-time-guidance',
    '用于否定或举例的具体题材名词仍可能反向提供剧情素材，宜改为纯类别描述。',
    [...new Set([...fixedTopicSeeds, ...timeScaleTopicSeeds])].join(','),
  )
}
if (
  orchestrator.includes("id: 'recent-system-changes'")
  && orchestrator.includes('systemChangeSummary: systemChangeSummary')
) {
  recordOptimization(
    'prompt-duplicate-recent-changes',
    'orchestrator-system',
    '最近变化同时进入独立字段和系统引导，来源与语义容易重复或漂移。',
    '最近变化 + recent-system-changes',
  )
}
if (
  promptGate.includes('系统指令仅可提交')
  || orchestrator.includes('没有永久数值变化时省略系统指令')
) {
  recordOptimization(
    'prompt-stale-main-narrative-write-contract',
    'dynamic-guidance',
    '主叙事已不负责系统写入，但动态引导仍提及系统指令提交或省略。',
    'round-coherence + birth-opening',
  )
}
if (
  orchestrator.includes('guidance.roll.toFixed(2)')
  && orchestrator.includes('badProbabilityPercent')
  && subsystemRelevance.includes('influenceScore}/100')
) {
  recordOptimization(
    'prompt-internal-metrics-exposed',
    'dynamic-guidance',
    '本地投掷、概率区间和影响力分数是内部计算证据，主叙事只需要已判定方向与范围。',
    'luck roll/probabilities + influence score',
  )
}
if (orchestrator.includes('resolvedLines.slice(-3)')) {
  recordOptimization(
    'prompt-fixed-count-projection',
    'orchestrator-system',
    '最近分支结果使用固定三项切片，无法完整还原全部仍相关的玩家选择。',
    'resolvedLines.slice(-3)',
  )
}
const annualRuleMentions = countOccurrences(timeScaleNarrative, '二至三个')
  + countOccurrences(narrativeSystemPrompt, '二至三个')
if (annualRuleMentions >= 4) {
  recordOptimization(
    'prompt-time-rule-repetition',
    'fixed-and-time-guidance',
    '年度镜头数量与叙事距离在固定规则、档位规则和历法规则中重复声明。',
    `annual-rule-mentions=${annualRuleMentions}`,
  )
}
assertOk(
  narrativeSystemPrompt.includes('记忆只提供已经成立的事实')
    && narrativeSystemPrompt.includes('本轮必须从当前时间与引导产生新的变化和结果')
    && narrativeSystemPrompt.includes('正文全程用第二人称“你”')
    && !memoryLifecycle.includes('不得模仿其中的人称、措辞或段落结构'),
  'server fixed authority alone must define how narrative memory is used',
)
for (const [source, duplicatedRule] of [
  [memoryLifecycle, '以下内容由玩家角色亲自开创'],
  [memoryLifecycle, '不得改写为遗迹发现'],
  [orchestrator, '跨世界概念能力·每轮遵守'],
  [orchestrator, '受世界合理性约束·每轮遵守'],
  [orchestrator, '本轮玩家行动只对当前回合生效'],
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
    本轮明确行动: '<玩家原始选择>',
  },
  wordCountInstruction: '<本轮字数要求>',
}
const exactSampleSegments = buildSegmentedPrompt(
  liveNarrativePrompt,
  exactSampleContext,
)
const exactSampleDynamicInput = exactSampleSegments.full
assertOk(
  exactSampleSegments.totalChars === exactSampleDynamicInput.length
    && exactSampleSegments.globalSegmentChars === exactSampleSegments.userSegments[0].length
    && exactSampleSegments.memorySegmentChars === exactSampleSegments.userSegments[1].length
    && exactSampleSegments.roundSegmentChars === exactSampleSegments.userSegments[2].length,
  'prompt segment metrics must describe the exact transmitted characters',
)
const emptyNoiseProjection = buildNarrativeUserJson({
  worldNarrativeView: {},
  characterProfileView: { 姓名: '<角色>' },
  characterStatusView: {},
  subsystemSummaries: [],
  currentTime: '<当前时间>',
  timelineMemory: '',
  worldRules: '  ',
  modWorldRules: [],
  playerBranchIntent: {},
  wordCountInstruction: '<字数要求>',
})
assertOk(
  JSON.stringify(emptyNoiseProjection.全局信息) === JSON.stringify({ 角色档案: { 姓名: '<角色>' } })
    && JSON.stringify(emptyNoiseProjection.本轮引导) === JSON.stringify({
      当前时间: '<当前时间>',
      字数要求: '<字数要求>',
    }),
  'empty strings, arrays, and plain objects must not consume prompt fields',
)
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
console.log(
  `[PROMPT-METRIC] fixed=${COMPILED_NARRATIVE_SYSTEM_PROMPT.length} global=${exactSampleSegments.globalSegmentChars} memory=${exactSampleSegments.memorySegmentChars} round=${exactSampleSegments.roundSegmentChars} total=${exactSampleSegments.totalChars}`,
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
  { name: 'mod-unused', worldRules: '未启用扩展规则' },
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
  promptContextRuntime.includes('formatEquippedMythicPatternForPrompt(useCharacterStore.getState().equippedMythicPatterns)')
    && promptContextRuntime.includes('formatDestinyPatternsForPrompt(destinyPatterns, isOpeningRound)')
    && promptContextRuntime.includes('const talents = [')
    && promptContextRuntime.includes("].filter(Boolean).join('\\n') || undefined"),
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
    && campaign.includes('buildNarrativeDataAnalysisPromptInput({')
    && campaign.includes('buildNarrativeBasicAttributePromptInput({')
    && campaign.includes('buildNarrativeEventRecognitionPromptInput({')
    && campaign.includes('buildNarrativeMacroImpactPromptInput({')
    && dataAnalysisContext.includes('⟦可写系统:')
    && dataAnalysisContext.includes('stateLines.join(\'\\n\')')
    && dataAnalysisContext.includes('⟦最近故事⟧')
    && basicAttributeContext.includes('⟦基础属性状态⟧')
    && basicAttributeContext.includes('⟦最近故事⟧')
    && eventRecognitionContext.includes('⟦已有待触发事件⟧')
    && eventRecognitionContext.includes('⟦本轮已投递因果⟧')
    && eventRecognitionContext.includes('⟦最近故事⟧')
    && macroImpactContext.includes('⟦宏观系统与字段契约⟧')
    && macroImpactContext.includes('⟦玩家影响力证据⟧')
    && macroImpactContext.includes('⟦最近故事⟧'),
  'all four background calls must receive their complete owned fields and recent story context',
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
  liveNarrativePrompt.version === '5.8.3'
    && liveNarrativePrompt.systemPrompt === ''
    && !narrativeSystemPrompt.includes('examples: ['),
  'optimized prompt must be versioned and keep one governed standard example instead of duplicate examples',
)
assertOk(
  narrativeSystemPrompt.includes('正文全程用第二人称“你”')
    && narrativeSystemPrompt.includes('不写全知旁白、第三人称传记或编年报告')
    && narrativeSystemPrompt.includes('日级贴近连续现场')
    && narrativeSystemPrompt.includes('一年至十年保持人物层面的阶段镜头')
    && narrativeSystemPrompt.includes('不得把宏观报告与即时现场拼接在一起')
    && narrativeSystemPrompt.includes('短档通过压缩每个节点而不是删除时间档位要求的节点控制篇幅')
    && timeScaleNarrative.includes('【年度连续场景视角】用二至三个前后相承的代表性场景覆盖一整年')
    && countOccurrences(narrativeSystemPrompt, '二至三个') === 0
    && !narrativeSystemPrompt.includes('若本轮按年或更长跨度推进，正文仍只选择一个代表性现场')
    && !narrativeSystemPrompt.includes('先选择能在该区间内自然收束的单一事件')
    && narrativeSystemPrompt.includes('娱乐性、代入感和继续游玩的意愿')
    && NARRATIVE_SYSTEM_COMPONENTS.some((component) => component.kind === '示例'),
  'main narrative components must lock second-person viewpoint and scale-aware scene structure',
)
assertOk(
  narrativeSystemPrompt.includes('压力、阻力和受挫不是每轮必选项')
    && narrativeSystemPrompt.includes('不得静默过滤、隐藏、替换或强制梦境化')
    && !narrativeSystemPrompt.includes('极端不合理或直接违背高优先级事实时，只能写成梦境、幻想或尚未落地的念头')
    && !narrativeHints.includes('每15轮')
    && !narrativeHints.includes('每 15 轮')
    && !characterStatusRuntime.includes('Math.random(')
    && !campaign.includes('传说、书页、旧档案、梦境、遗物铭文或路人故事'),
  'core narrative prompts must avoid forced adversity, periodic branching, random genre direction, and concrete medium bias',
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

for (const finding of optimizationFindings.sort((left, right) => (
  left.code.localeCompare(right.code) || left.source.localeCompare(right.source)
))) {
  console.log(
    `[OPTIMIZE] code=${finding.code} source=${finding.source} message=${finding.message}${finding.evidence ? ` evidence=${finding.evidence}` : ''}`,
  )
}

if (failed === 0) {
  console.log(`PASS: kv-prompt-audit (assembly + ownership + neutrality + volume, optimize=${optimizationFindings.length})`)
  process.exit(0)
}
process.exit(1)
