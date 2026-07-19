/**
 * 主叙事 4.0：分级中文协议、三层上下文、严格转译与延迟因果回归。
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getProjectRoot } from '../../lib/project-root.mjs'
import {
  buildNarrativeUserJson,
  buildSegmentedPrompt,
} from '../../../../src/core/ai-service/prompt-builder.ts'
import {
  NarrativeAIResponseSchema,
  buildNarrativeAIProtocolStandardExample,
  fromNarrativeAIIntentId,
  parseNarrativeAIDataJson,
  toNarrativeAIIntentId,
  translateNarrativeAIResponse,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol.ts'
import { extractTaggedMetaEnvelope } from '../../../../src/mods/mod-engine/helpers/tagged-meta-envelope.ts'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
} from '../../../../src/mods/mod-engine/helpers/narrative-ai-input-view.ts'
import { inspectNarrativeResponseQuality } from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import {
  NARRATIVE_SYSTEM_COMPONENTS,
} from '../../../../src/mods/mod-engine/prompts/narrative-prompt-components.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'

let failed = 0
const root = getProjectRoot(import.meta.url)

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

function assertThrows(fn, message) {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  assertOk(threw, message)
}

function compileCausalDelaySystem() {
  const sourceText = fs.readFileSync(
    path.join(root, 'src/mods/mod-engine/subsystems/causal-delay-system.ts'),
    'utf8',
  )
  const sourceFile = ts.createSourceFile(
    'causal-delay-system.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const requiredVariables = new Set([
    'DEFAULT_CAUSAL_CONFIG',
    'CAUSAL_TYPE_DESCRIPTIONS',
    'CAUSAL_SEVERITY_DESCRIPTIONS',
  ])
  const fragments = []
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const names = statement.declarationList.declarations
        .map((declaration) => ts.isIdentifier(declaration.name) ? declaration.name.text : '')
      if (names.some((name) => requiredVariables.has(name))) {
        fragments.push(statement.getText(sourceFile).replace(/^export\s+/, ''))
      }
    }
    if (ts.isClassDeclaration(statement) && statement.name?.text === 'CausalDelaySystem') {
      fragments.push(statement.getText(sourceFile).replace(/^export\s+/, ''))
    }
  }
  const output = ts.transpileModule(fragments.join('\n'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const memoryForgettingStub = {
    addCausalMark() {},
    resolveCausalMark() {},
  }
  return new Function(
    'memoryForgetting',
    `${output}\nreturn CausalDelaySystem;`,
  )(memoryForgettingStub)
}

function buildChineseRoundData(overrides = {}) {
  return {
    状态变更: [
      {
        系统: '道德',
        说明: '你承担风险保护了无辜者。',
        变更: { 道德变化: 1 },
      },
    ],
    重要程度: '高',
    关键事件: [
      {
        内容: '你在渡口兑现对林舟的承诺，同时暴露了自己的行踪。',
        重要度: 88,
        涉及实体: ['你', '林舟', '旧渡口'],
      },
    ],
    情节状态: '进行中',
    语义信号: {
      事件类型: '冲突',
      冲突强度: 62,
      张力变化: 5,
      行动规模: '中',
      不可逆: true,
      影响范围: '关系圈',
      叙事语域: '命运',
      语域理由: '旧承诺与当前追捕同时改变了关系和处境。',
      情节类型: '任务',
      关系变化: [
        { 姓名: '林舟', 类型: '结盟', 说明: '林舟确认你没有背弃旧诺。' },
      ],
      已回收伏笔编号: ['伏笔_旧渡口'],
    },
    命运意图判定: {
      意图编号: '命运分支:夺回家园',
      可行性: '有条件',
      执行方式: '逐步执行',
      状态: '推进中',
      风险等级: '高',
      进度: 35,
      阻碍: ['追兵仍控制北岸'],
      前置条件: ['取得林舟的船队支持'],
      代价: ['暴露行踪'],
      预计耗时: '仍需数月与多个叙事节点',
      判定理由: '你获得了盟友，但尚未突破封锁。',
      下一步: '先让船队安全离港',
    },
    新延迟因果: [
      {
        类型: '承诺',
        严重程度: '重大',
        已成立事实: '你答应在林舟被围困时带他的家人离开。',
        相关人物: '林舟',
      },
    ],
    ...overrides,
  }
}

const roundDigest = '你兑现旧诺，并因现实阻力付出代价。'
const validChineseData = buildChineseRoundData()
assertOk(
  NarrativeAIResponseSchema.safeParse(validChineseData).success,
  'complete Chinese round data must pass the only AI-visible schema',
)

const translated = translateNarrativeAIResponse(validChineseData, roundDigest)
assertOk(
  translated.changes[0]?.id === 'morality'
    && translated.changes[0]?.changes.delta === 1,
  'Chinese subsystem and field names must translate to the stable internal contract',
)
assertOk(
  translated.intentResolution?.intentId === 'branch:夺回家园'
    && translated.intentResolution.status === 'progressing',
  'Chinese intent IDs and enums must round-trip without changing internal identity',
)
assertOk(
  translated.deferredCausality?.[0]?.type === 'promise'
    && translated.deferredCausality[0].severity === 'major',
  'Chinese deferred causality must translate to the owning local subsystem contract',
)
const standardExampleEnvelope = extractTaggedMetaEnvelope(buildNarrativeAIProtocolStandardExample())
assertOk(
  Boolean(standardExampleEnvelope?.dataPresent)
    && translateNarrativeAIResponse(
      parseNarrativeAIDataJson(standardExampleEnvelope?.dataSection ?? ''),
      standardExampleEnvelope?.summary ?? '',
    ).intentResolution?.status === 'progressing',
  'the single annotated standard example must remain directly parseable by the local scanner and strict schema',
)
const repeatedOldCausalityField = structuredClone(validChineseData)
repeatedOldCausalityField.延迟因果 = repeatedOldCausalityField.新延迟因果
delete repeatedOldCausalityField.新延迟因果
assertOk(
  !NarrativeAIResponseSchema.safeParse(repeatedOldCausalityField).success,
  'the AI protocol must accept only newly formed delayed matters, not the ambiguous old field name',
)
const inconsistentRegister = structuredClone(validChineseData)
inconsistentRegister.语义信号.不可逆 = false
assertOk(
  !NarrativeAIResponseSchema.safeParse(inconsistentRegister).success,
  'fate or legacy register must not contradict irreversible=false',
)
const curlyProtocolJson = JSON.stringify(validChineseData).replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gu, '“$1”')
assertOk(
  translateNarrativeAIResponse(parseNarrativeAIDataJson(curlyProtocolJson), roundDigest).digest
    === translated.digest,
  'Chinese syntax quotes must be repaired structurally without changing or dropping semantic fields',
)
assertOk(
  toNarrativeAIIntentId('branch:长期目标') === '命运分支:长期目标'
    && fromNarrativeAIIntentId('命运分支:长期目标') === 'branch:长期目标',
  'intent ID translation must be reversible',
)

const legacyEnglishData = {
  changes: [],
  importance: 'HIGH',
  digest: 'legacy',
  keyEvents: [],
  arcStatus: 'ongoing',
  semanticSignals: {},
}
assertOk(
  !NarrativeAIResponseSchema.safeParse(legacyEnglishData).success,
  'legacy English META must not enter the successful AI protocol path',
)
assertThrows(
  () => translateNarrativeAIResponse(legacyEnglishData, roundDigest),
  'legacy English META must fail strict translation',
)
assertThrows(
  () => translateNarrativeAIResponse(buildChineseRoundData({
    状态变更: [{ 系统: '未知系统', 说明: '非法目标', 变更: { 数值: 1 } }],
  }), roundDigest),
  'an unknown Chinese subsystem must reject the complete structured bundle',
)
assertThrows(
  () => translateNarrativeAIResponse(buildChineseRoundData({
    状态变更: [{ 系统: '道德', 说明: '非法字段', 变更: { 未知字段: 1 } }],
  }), roundDigest),
  'an unknown Chinese field must reject the complete structured bundle',
)

const worldSetting = {
  name: '潮汐群岛',
  description: '群岛以潮汐历法维系航路。',
  era: '潮历1003年',
  config: {
    aiDetailedParameters: { secretInternalField: 1 },
    _coherenceLocks: ['internal-only'],
    powerCeiling: 24,
  },
}
const character = {
  name: '闻潮',
  age: 19,
  gender: 'female',
  background: '你来自北岸的修船人家庭。',
  attributes: { physique: 6, hiddenInternalAttribute: 99 },
}
const worldView = projectWorldSettingForNarrativeAI(worldSetting)
const characterView = projectCharacterForNarrativeAI(character)
assertOk(
  !('config' in worldView)
    && !('attributes' in characterView.profile)
    && !('attributes' in characterView.status),
  'AI world and character projections must not expose internal object copies',
)

const baseContext = {
  worldNarrativeView: worldView,
  characterProfileView: characterView.profile,
  characterStatusView: characterView.status,
  subsystemSummaries: ['【基础属性】体魄6，心智7'],
  narrativeHistory: [],
  worldRules: '潮汐与航路服从世界设定。',
  longTermMemory: '【一生纵览】你始终在寻找失踪的父亲。',
  coreMemory: '【核心记忆】林舟曾替你隐瞒身份。',
  relevantMemory: '【相关往事】北岸守卫正在搜查你的船。',
  recentNarrativeMemory: '【近期完整经历】\n你在旧渡口看见林舟留下的灯。',
  currentTime: '潮历1003年 · 春季3月',
  systemChangeSummary: '林舟的船队已经靠岸。',
  userInstruction: '【玩家选择】兑现承诺并帮助林舟。',
  narrativeGuidanceText: '本轮围绕旧渡口的追捕与承诺推进。',
}
const firstSegments = buildSegmentedPrompt(narrativePrompt, baseContext)
const nextSegments = buildSegmentedPrompt(narrativePrompt, {
  ...baseContext,
  currentTime: '潮历1003年 · 春季4月',
  systemChangeSummary: '北岸追兵封锁了主航道。',
})
assertOk(
  firstSegments.strategy === 'S4'
    && firstSegments.userSegments?.length === 3
    && firstSegments.userMessageCount === 3,
  'main narrative must send exactly three ordered user layers',
)
assertOk(
  firstSegments.userSegments?.[0]?.startsWith('{"全局信息":')
    && firstSegments.userSegments[1]?.startsWith('{"记忆":')
    && firstSegments.userSegments[2]?.startsWith('{"本轮引导":'),
  'the user layers must be ordered as global information, memory, then round guidance',
)
assertOk(
  firstSegments.userSegments?.[0] === nextSegments.userSegments?.[0]
    && firstSegments.userSegments?.[1] === nextSegments.userSegments?.[1]
    && firstSegments.userSegments?.[2] !== nextSegments.userSegments?.[2],
  'round-only changes must preserve the global and memory cache prefixes',
)

const aiViewJson = JSON.stringify(buildNarrativeUserJson(baseContext))
for (const forbiddenInternalName of [
  'aiDetailedParameters',
  'secretInternalField',
  '_coherenceLocks',
  'hiddenInternalAttribute',
  'physique',
]) {
  assertOk(
    !aiViewJson.includes(forbiddenInternalName),
    `AI input must not leak internal field ${forbiddenInternalName}`,
  )
}

const validEnvelope = `⟦正文⟧\n你在旧渡口停下船，林舟的灯从雨里亮起。\n\n你推开追兵横在栈桥上的长矛，让船队先解缆。\n\n最后一根缆绳落水时，北岸的号角也响了，你必须带着他们穿过封锁。\n⟦摘要⟧\n${roundDigest}\n⟦数据⟧\n${JSON.stringify(validChineseData)}\n⟦结束⟧`
assertOk(
  inspectNarrativeResponseQuality(validEnvelope, 200, 'branch:夺回家园').valid,
  'a complete Chinese envelope must pass the live protocol and paragraph gate',
)
const modelNoOpConditionalData = structuredClone(validChineseData)
modelNoOpConditionalData.状态变更 = []
modelNoOpConditionalData.原创内容 = []
modelNoOpConditionalData.新延迟因果 = []
modelNoOpConditionalData.语义信号.关系变化 = []
modelNoOpConditionalData.语义信号.已回收伏笔编号 = []
modelNoOpConditionalData.命运分支 = false
modelNoOpConditionalData.命运意图判定.阻碍 = []
modelNoOpConditionalData.命运意图判定.前置条件 = []
modelNoOpConditionalData.命运意图判定.代价 = []
const tolerantConditionalEnvelope = `⟦正文⟧\n第一段完整现场。\n\n第二段完整行动。\n\n第三段完整后果。\n⟦摘要⟧\n${roundDigest}\n⟦数据⟧\n${JSON.stringify(modelNoOpConditionalData)}\n⟦结束⟧`
assertOk(
  inspectNarrativeResponseQuality(tolerantConditionalEnvelope, 200, 'branch:夺回家园').valid,
  'conditional intent data may normalize explicit no-op arrays and branch=false to omission without losing the intent result',
)
const nearSynonymConditionalData = structuredClone(modelNoOpConditionalData)
nearSynonymConditionalData.新伏笔 = [{ 类型: '隐藏信息', 说明: '保留说明并归入其他', 优先级: 7 }]
nearSynonymConditionalData.语义信号.关系变化 = [{ 姓名: '林舟', 类型: '怀疑', 说明: '保留关系说明并归入其他' }]
assertOk(
  inspectNarrativeResponseQuality(
    tolerantConditionalEnvelope.replace(JSON.stringify(modelNoOpConditionalData), JSON.stringify(nearSynonymConditionalData)),
    200,
    'branch:夺回家园',
  ).valid,
  'optional near-synonym enums must not turn an otherwise valid conditional narrative into a hard reasoning error',
)
const minimumEnvelope = `⟦正文⟧\n第一段。\n\n第二段。\n\n第三段。\n⟦摘要⟧\n本轮发生了一个完整的小事件。\n⟦结束⟧`
assertOk(
  inspectNarrativeResponseQuality(minimumEnvelope, 200, null).valid,
  'ordinary rounds must accept the minimum body-summary protocol without structured data',
)
assertOk(
  !inspectNarrativeResponseQuality(minimumEnvelope, 200, 'branch:夺回家园').valid,
  'an active fate intent must still require its complete conditional data',
)
assertOk(
  !inspectNarrativeResponseQuality(minimumEnvelope, 200, null, true).valid,
  'a forced branch must still require branch data',
)
const invalidOptionalDataEnvelope = `${minimumEnvelope.replace('\n⟦结束⟧', '\n⟦数据⟧\n{"状态变更": []}\n⟦结束⟧')}`
const invalidOptionalDataQuality = inspectNarrativeResponseQuality(invalidOptionalDataEnvelope, 200, null)
assertOk(
  invalidOptionalDataQuality.valid
    && invalidOptionalDataQuality.structuredDataStatus === 'rejected',
  'invalid optional data must preserve body and summary without triggering a rewrite',
)
const legacyEnvelope = `[正文]第一段。\n\n第二段。\n\n第三段。[/正文]\n[回合数据]${JSON.stringify(legacyEnglishData)}[/回合数据]`
assertOk(
  !inspectNarrativeResponseQuality(legacyEnvelope, 200, null).valid,
  'the old tagged envelope must not enter the successful protocol path',
)

assertOk(narrativePrompt.version === '4.1.0', 'tiered Chinese protocol behavior must use Prompt 4.1.0')
for (const forbiddenProtocolToken of [
  '[NARRATIVE]',
  '[META]',
  'intentResolution',
  'semanticSignals',
  'branchOptions',
  'keyEvents',
]) {
  assertOk(
    !narrativePrompt.systemPrompt.includes(forbiddenProtocolToken),
    `System Prompt must not expose legacy English protocol token ${forbiddenProtocolToken}`,
  )
}
assertOk(
  narrativePrompt.systemPrompt.includes('⟦正文⟧')
    && narrativePrompt.systemPrompt.includes('⟦摘要⟧')
    && narrativePrompt.systemPrompt.includes('⟦数据⟧')
    && narrativePrompt.systemPrompt.includes('⟦结束⟧')
    && narrativePrompt.systemPrompt.includes('第二人称“你”')
    && narrativePrompt.systemPrompt.includes('不得填写“任务”等情节类型')
    && narrativePrompt.systemPrompt.includes('不得填写“冲突”等事件类型')
    && narrativePrompt.systemPrompt.includes('数据区不是字段清单')
    && narrativePrompt.systemPrompt.includes('禁止输出 false'),
  'System Prompt must expose the tiered Chinese protocol and second-person contract',
)
assertOk(
  !narrativePrompt.systemPrompt.trimStart().startsWith('{')
    && narrativePrompt.systemPrompt.trimEnd().endsWith('⟦结束⟧'),
  'System Prompt must use low-noise plain constraints first and the single standard example last',
)
assertOk(
  new Set(NARRATIVE_SYSTEM_COMPONENTS.map((component) => component.id)).size
    === NARRATIVE_SYSTEM_COMPONENTS.length
    && NARRATIVE_SYSTEM_COMPONENTS.every((component) => (
      component.kind
      && component.lifecycle
      && component.authority
      && Number.isFinite(component.order)
      && Array.isArray(component.dependsOn)
      && component.assemblyPosition
      && component.loadWhen
      && component.exitWhen
      && component.acceptanceEvidence
    )),
  'every Prompt component must have unique identity and complete governance metadata',
)

const CausalDelaySystem = compileCausalDelaySystem()
const causal = new CausalDelaySystem()
causal.setConfig({
  minTriggerDelay: 1,
  maxTriggerDelay: 2,
  severityDelayMultipliers: { minor: 1, normal: 1, major: 1, critical: 1 },
  maxTriggerPerRound: 2,
})
const causalId = causal.recordCausalEvent(
  'promise',
  'major',
  1,
  18,
  '你答应在林舟被围困时带他的家人离开。',
  '林舟',
)
const pendingSnapshot = causal.capturePreviewState()
const due = causal.checkCausalTrigger(2)
assertOk(
  due.triggeredEvents.some((event) => event.id === causalId)
    && causal.getPendingEvents().some((event) => event.id === causalId)
    && causal.getTriggeredEvents().length === 0,
  'a due causal event must remain pending until a valid narrative commit',
)
assertOk(
  due.narrativeText.includes('已成立事实')
    && due.narrativeText.includes('不预设必然成功')
    && !due.narrativeText.includes('善有善报'),
  'causal injection must send compact facts and leave the outcome to the narrative AI',
)
const committed = causal.commitCausalTriggers([causalId], 2, '你兑现旧诺并带船队离港。')
assertOk(
  committed.length === 1
    && causal.getPendingEvents().length === 0
    && causal.getTriggeredEvents()[0]?.triggerResult === '你兑现旧诺并带船队离港。',
  'a valid narrative commit must atomically confirm and persist the due causal event',
)
const restoredPending = new CausalDelaySystem()
restoredPending.restoreCollectedState(pendingSnapshot)
assertOk(
  restoredPending.getPendingEvents().some((event) => event.id === causalId),
  'causal preview/save restoration must preserve an uncommitted due event for retry',
)
const restoredCommitted = new CausalDelaySystem()
restoredCommitted.restoreCollectedState(causal.capturePreviewState())
assertOk(
  restoredCommitted.getTriggeredEvents()[0]?.id === causalId,
  'causal save restoration must preserve the committed terminal state',
)

console.log(
  `METRIC: prompt-4.1 system=${narrativePrompt.systemPrompt.length} global=${firstSegments.userSegments?.[0]?.length ?? 0} memory=${firstSegments.userSegments?.[1]?.length ?? 0} round=${firstSegments.userSegments?.[2]?.length ?? 0}`,
)

if (failed > 0) process.exit(1)
console.log('PASS: narrative-chinese-protocol-regression')
