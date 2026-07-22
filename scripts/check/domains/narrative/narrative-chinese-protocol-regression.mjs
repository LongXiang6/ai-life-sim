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
import { buildNarrativeHints } from '../../../../src/mods/mod-engine/helpers/narrative-hints.ts'
import {
  buildNarrativeRepairInstruction,
  buildNarrativeRoundOutputContract,
  inspectNarrativeResponseQuality,
} from '../../../../src/mods/mod-engine/helpers/narrative-response-quality.ts'
import { buildTimeScaleNarrativeHint } from '../../../../src/mods/mod-engine/helpers/time-scale-narrative.ts'
import {
  COMPILED_NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_SYSTEM_COMPONENTS,
  buildNarrativeAIProtocolStandardExample,
} from '../../../../src/mods/mod-engine/server/narrative-system-prompt.ts'
import {
  FALLBACK_NARRATIVE_PROMPT,
  NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID,
  NARRATIVE_SERVER_PROMPT_ASSET_ID,
  narrativePrompt,
} from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT } from '../../../../src/mods/mod-engine/server/narrative-repair-system-prompt.ts'

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
    'LEGACY_COMPAT_TRIGGER_DELAY_ROUNDS',
    'CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION',
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
const minimumEnvelope = `⟦正文⟧\n一个自然段也能完整讲清本轮事件。\n⟦摘要⟧\n本轮发生了一个完整的小事件。\n⟦结束⟧`
assertOk(
  inspectNarrativeResponseQuality(minimumEnvelope, 200, null).valid,
  'ordinary rounds must accept the minimum body-summary protocol without structured data',
)
const bodyOnlyEnvelope = `⟦正文⟧\n这一轮只返回完整正文；没有额外高价值事实需要建立摘要索引。\n⟦结束⟧`
assertOk(
  inspectNarrativeResponseQuality(bodyOnlyEnvelope, 200, null).valid,
  'ordinary rounds must accept a complete body without an optional summary',
)
const fiveParagraphEnvelope = `⟦正文⟧\n第一段。\n\n第二段。\n\n第三段。\n\n第四段。\n\n第五段。\n⟦摘要⟧\n本轮事件按自然节奏写成五段。\n⟦结束⟧`
const fiveParagraphQuality = inspectNarrativeResponseQuality(fiveParagraphEnvelope, 200, null)
assertOk(
  fiveParagraphQuality.valid && fiveParagraphQuality.paragraphCount === 5,
  'five coherent paragraphs must be accepted without a format-repair request',
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
const balancedRepairInstruction = buildNarrativeRepairInstruction(invalidOptionalDataQuality, 200)
assertOk(
  balancedRepairInstruction.includes('行动发展')
    && balancedRepairInstruction.includes('不要为修复格式新增压力或障碍')
    && !balancedRepairInstruction.includes('行动阻力'),
  'format repair must preserve narrative progress without reintroducing mandatory resistance',
)
const legacyEnvelope = `[正文]第一段。\n\n第二段。\n\n第三段。[/正文]\n[回合数据]${JSON.stringify(legacyEnglishData)}[/回合数据]`
assertOk(
  !inspectNarrativeResponseQuality(legacyEnvelope, 200, null).valid,
  'the old tagged envelope must not enter the successful protocol path',
)

const finalRoundContract = buildNarrativeRoundOutputContract('branch:夺回家园', true, true)
assertOk(
  finalRoundContract.includes('本轮输出契约')
    && finalRoundContract.includes('安心发育')
    && finalRoundContract.includes('不得无因果直接跳过数周或数月')
    && finalRoundContract.includes('命运分支:夺回家园'),
  'the nearest dynamic contract must retain protocol, calm progression, opening origin and focused intent checks',
)
assertOk(
  COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT.length < 5_000,
  'the dedicated repair system asset must remain compact',
)
assertOk(narrativePrompt.version === '4.6.0', 'latest narrative attention and repair behavior must use Prompt 4.6.0')
assertOk(
  narrativePrompt.systemPrompt === ''
    && narrativePrompt.serverPromptAssetId === NARRATIVE_SERVER_PROMPT_ASSET_ID
    && NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID === 'mod-engine:narrative-repair:1.0.0',
  'browser narrative contract must reference the server asset without carrying fixed Prompt text',
)
for (const forbiddenProtocolToken of [
  '[NARRATIVE]',
  '[META]',
  'intentResolution',
  'semanticSignals',
  'branchOptions',
  'keyEvents',
]) {
  assertOk(
    !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes(forbiddenProtocolToken),
    `System Prompt must not expose legacy English protocol token ${forbiddenProtocolToken}`,
  )
}
assertOk(
  COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('⟦正文⟧')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('⟦摘要⟧')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('⟦数据⟧')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('⟦结束⟧')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('第二人称“你”')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('摘要只在能提供高价值事实索引时输出')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('省略字段表示本轮未提交该类结构化信息')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('数据区不是字段清单')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('而不是输出 false'),
  'System Prompt must expose the tiered Chinese protocol and second-person contract',
)
assertOk(
  !COMPILED_NARRATIVE_SYSTEM_PROMPT.trimStart().startsWith('{')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.trimEnd().endsWith('⟦结束⟧'),
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

const drivingForceComponent = NARRATIVE_SYSTEM_COMPONENTS.find(
  (component) => component.id === 'narrative-driving-force',
)
const ownershipComponent = NARRATIVE_SYSTEM_COMPONENTS.find(
  (component) => component.id === 'player-setting-ownership',
)
const firstRoundOriginComponent = NARRATIVE_SYSTEM_COMPONENTS.find(
  (component) => component.id === 'first-round-origin',
)
assertOk(
  ownershipComponent?.authority === '世界与协议'
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('专属、独有、唯一、血脉限定、异界来源或角色自创')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不得改写为当地常见能力、制式技术、药剂激活、机构授予或他人同源能力'),
  'fixed Prompt must preserve the ownership and origin of player-exclusive settings',
)
assertOk(
  firstRoundOriginComponent === undefined
    && finalRoundContract.includes('不得无因果直接跳过数周或数月')
    && finalRoundContract.includes('原生本地角色则用现场、家庭、职责或关键关系建立起点')
    && finalRoundContract.includes('只有玩家明确要求从中途或既定关系开始时才可跳时'),
  'first-round origin must load only in the final dynamic contract and preserve explicit mid-story openings',
)
assertOk(
  drivingForceComponent?.lifecycle === '全局常驻'
    && drivingForceComponent?.authority === '剧情引导'
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('压力、阻力和受挫不是每轮必选项')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不会自动触发官方或机构审查、鉴定、登记、封存或针对')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('已解决后不得换名复用')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不默认贫困、羞辱、资格审查或被针对')
    && COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('不得用陌生观察者、神秘来客、突然通知或新机构凭空补压力与悬念'),
  'fixed Prompt must allow positive change drivers and require causality for institutional intervention',
)
assertOk(
  !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('依次写触发与压力、行动与阻力')
    && !COMPILED_NARRATIVE_SYSTEM_PROMPT.includes('平静轮也要有欲望、关系回声、意外、压力或悬念'),
  'fixed Prompt must not require pressure or resistance in every three-paragraph round',
)
assertOk(
  FALLBACK_NARRATIVE_PROMPT.includes('变化可以是机会、发现、掌握、认可、关系变化、休整、成功或合理冲突')
    && FALLBACK_NARRATIVE_PROMPT.includes('不要求制造阻力')
    && FALLBACK_NARRATIVE_PROMPT.includes('不默认机构审查、被针对或贫困羞辱模板')
    && !FALLBACK_NARRATIVE_PROMPT.includes('一个阻力或意外及其直接后果'),
  'degraded narrative Prompt must preserve the same balanced change-driver policy',
)

const balancedHints = buildNarrativeHints({
  currentAge: 18,
  maxAge: 80,
  startingAge: 0,
  round: 8,
  recentEvents: [{ age: 17 }],
  lastPlayerChoice: '继续学习潮汐术',
  forceBranch: false,
  branchJustResolved: false,
  consecutiveSameGoalRounds: 2,
  timeStep: { unit: 'year', value: 1 },
  lifeStage: 'young_adult',
}).optional.join('\n')
assertOk(
  balancedHints.includes('机会、关系、能力、处境或合理压力')
    && balancedHints.includes('不要为延长目标重复制造同类阻碍')
    && balancedHints.includes('只有既有因果需要时才写阻力')
    && !balancedHints.includes('优先体现新阶段的社会压力')
    && !balancedHints.includes('先确定年度主要压力'),
  'dynamic narrative hints must treat pressure as one causal option and reject repeated filler obstacles',
)

const crossMonthBalanceHint = buildTimeScaleNarrativeHint({ unit: 'month', value: 3 })
const multiYearBalanceHint = buildTimeScaleNarrativeHint({ unit: 'year', value: 3 })
assertOk(
  crossMonthBalanceHint.includes('起点状态或变化契机')
    && !crossMonthBalanceHint.includes('第一段交代起点压力')
    && multiYearBalanceHint.includes('主要变化驱动力')
    && !multiYearBalanceHint.includes('起点阶段与主要压力'),
  'time-scale guidance must preserve causal coverage without forcing a pressure-led opening',
)

const plotBalanceGuidance = fs.readFileSync(
  path.join(root, 'src/mods/mod-engine/subsystems/plot-structure-system.ts'),
  'utf8',
)
assertOk(
  plotBalanceGuidance.includes('目标、机会或矛盾逐步加深')
    && plotBalanceGuidance.includes('不得为增加张力机械制造威胁、审查或针对')
    && plotBalanceGuidance.includes('不要求制造冲突')
    && !plotBalanceGuidance.includes('越来越大的压力')
    && !plotBalanceGuidance.includes('可以引入新的矛盾、欲望或关系压力'),
  'plot guidance must raise engagement through causal development rather than mandatory conflict',
)

const CausalDelaySystem = compileCausalDelaySystem()
const collisionGuard = new CausalDelaySystem()
const originalDateNow = Date.now
let sameMillisecondIds = []
try {
  Date.now = () => 1234567890
  sameMillisecondIds = [
    collisionGuard.recordCausalEvent('promise', 'normal', 7, 20, '同毫秒承诺一'),
    collisionGuard.recordCausalEvent('promise', 'normal', 7, 20, '同毫秒承诺二'),
  ]
} finally {
  Date.now = originalDateNow
}
assertOk(
  new Set(sameMillisecondIds).size === sameMillisecondIds.length,
  'same-round same-type causal matters created in one millisecond must receive distinct local IDs',
)

const causal = new CausalDelaySystem()
causal.setConfig({
  delayDaysBySeverity: { minor: 10, normal: 10, major: 10, critical: 10 },
  maxTriggerPerRound: 2,
})
const causalId = causal.recordCausalEvent(
  'promise',
  'major',
  1,
  18,
  '你答应在林舟被围困时带他的家人离开。',
  '林舟',
  undefined,
  {
    scope: 'context',
    contextId: 'ctx-river',
    createdTotalDays: 100,
    originEventId: 'history-origin-1',
  },
)
const pendingSnapshot = causal.capturePreviewState()
const wrongContextDue = causal.checkCausalTrigger(999, {
  currentTotalDays: 110,
  scope: 'context',
  contextId: 'ctx-mountain',
})
assertOk(!wrongContextDue.hasTriggered, 'context-scoped causality must not trigger in another world')
const notDue = causal.checkCausalTrigger(999, {
  currentTotalDays: 109,
  scope: 'context',
  contextId: 'ctx-river',
})
assertOk(
  !notDue.hasTriggered,
  'canonical causal event must remain pending before dueTotalDays even when many rounds elapsed',
)
const due = causal.checkCausalTrigger(2, {
  currentTotalDays: 110,
  scope: 'context',
  contextId: 'ctx-river',
})
assertOk(
  due.triggeredEvents[0]?.id === causalId
    && due.triggeredEvents[0]?.schedule === 'canonical-days'
    && due.triggeredEvents[0]?.createdTotalDays === 100
    && due.triggeredEvents[0]?.dueTotalDays === 110
    && due.triggeredEvents[0]?.originEventId === 'history-origin-1'
    && causal.getPendingEvents().some((event) => event.id === causalId)
    && causal.getTriggeredEvents().length === 0,
  'a canonical due event must expose timing and origin evidence without being consumed before commit',
)
const retryAfterFailedNarrative = causal.checkCausalTrigger(3, {
  currentTotalDays: 111,
  scope: 'context',
  contextId: 'ctx-river',
})
assertOk(
  retryAfterFailedNarrative.triggeredEvents[0]?.id === causalId
    && causal.getPendingEvents().length === 1
    && causal.getTriggeredEvents().length === 0,
  'a rejected or failed narrative attempt must leave the due event pending for retry',
)
assertOk(
  due.narrativeText.includes('已成立事实：你答应在林舟被围困时带他的家人离开。')
    && due.narrativeText.includes('不预设必然成功')
    && !due.narrativeText.includes('善有善报'),
  'causal injection must send compact facts and leave the outcome to the narrative AI',
)
const committed = causal.commitCausalTriggers(
  [causalId],
  3,
  '你兑现旧诺并带船队离港。',
  {
    currentTotalDays: 111,
    resolutionEventId: 'history-resolution-1',
  },
)
assertOk(
  committed.length === 1
    && causal.getPendingEvents().length === 0
    && causal.getTriggeredEvents()[0]?.triggerResult === '你兑现旧诺并带船队离港。'
    && causal.getTriggeredEvents()[0]?.triggeredTotalDays === 111
    && causal.getTriggeredEvents()[0]?.resolutionEventId === 'history-resolution-1',
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

const restoredLegacy = new CausalDelaySystem()
restoredLegacy.restoreCollectedState({
  config: {
    minTriggerDelay: 1,
    maxTriggerDelay: 2,
    severityDelayMultipliers: { minor: 1, normal: 1, major: 1, critical: 1 },
    maxTriggerPerRound: 2,
  },
  causalEvents: [{
    id: 'legacy-promise-4',
    type: 'promise',
    severity: 'major',
    round: 4,
    age: 20,
    description: '旧存档中的承诺仍等待原始回合节点。',
    triggerDelay: 2,
    triggered: false,
  }],
  stats: { totalRecorded: 1, totalTriggered: 0, pendingEvents: 1, lastTriggerAt: 0 },
})
const legacyEvent = restoredLegacy.getPendingEvents()[0]
assertOk(
  legacyEvent?.schedule === 'legacy-round'
    && legacyEvent.scope === 'global'
    && legacyEvent.createdTotalDays === undefined
    && legacyEvent.dueTotalDays === undefined,
  'old saves must retain an explicit legacy-round schedule without guessed day conversion',
)
assertOk(
  !restoredLegacy.checkCausalTrigger(5, { currentTotalDays: 99999, scope: 'global' }).hasTriggered
    && restoredLegacy.checkCausalTrigger(6, { currentTotalDays: 0, scope: 'global' }).hasTriggered,
  'legacy-round items must keep using their stored round delay regardless of canonical total days',
)

const duplicateLegacySnapshot = {
  config: {
    maxTriggerPerRound: 2,
    delayDaysBySeverity: { minor: 30, normal: 90, major: 180, critical: 365 },
  },
  causalEvents: [
    {
      id: 'legacy-duplicate',
      type: 'promise',
      severity: 'normal',
      round: 2,
      age: 18,
      description: '旧事项一',
      triggerDelay: 2,
      triggered: false,
    },
    {
      id: 'legacy-duplicate',
      type: 'debt',
      severity: 'major',
      round: 3,
      age: 19,
      description: '旧事项二',
      triggerDelay: 3,
      triggered: false,
    },
  ],
  stats: { totalRecorded: 2, totalTriggered: 0, pendingEvents: 2, lastTriggerAt: 0 },
}
const duplicateLegacyA = new CausalDelaySystem()
const duplicateLegacyB = new CausalDelaySystem()
duplicateLegacyA.restoreCollectedState(duplicateLegacySnapshot)
duplicateLegacyB.restoreCollectedState(duplicateLegacySnapshot)
const migratedLegacyIds = duplicateLegacyA.getCausalEvents().map((event) => event.id)
assertOk(
  new Set(migratedLegacyIds).size === 2
    && duplicateLegacyA.getCausalEvents()[1]?.legacyId === 'legacy-duplicate'
    && JSON.stringify(duplicateLegacyA.getCausalEvents()) === JSON.stringify(duplicateLegacyB.getCausalEvents()),
  'unversioned legacy snapshots must deterministically renumber duplicate IDs and retain legacyId audit evidence',
)

const versionedDuplicateGuard = new CausalDelaySystem()
versionedDuplicateGuard.recordCausalEvent('kindness', 'minor', 1, 18, '当前游戏原状态')
const versionedDuplicateBaseline = JSON.stringify(versionedDuplicateGuard.capturePreviewState())
let rejectedVersionedDuplicate = false
try {
  versionedDuplicateGuard.restoreCollectedState({
    schemaVersion: 1,
    ...duplicateLegacySnapshot,
  })
} catch {
  rejectedVersionedDuplicate = true
}
assertOk(
  rejectedVersionedDuplicate
    && JSON.stringify(versionedDuplicateGuard.capturePreviewState()) === versionedDuplicateBaseline,
  'versioned P1 snapshots with duplicate causal IDs must fail atomically and preserve the current game state',
)

const batchedCausality = new CausalDelaySystem()
batchedCausality.setConfig({
  delayDaysBySeverity: { minor: 0, normal: 0, major: 0, critical: 0 },
  maxTriggerPerRound: 2,
})
for (const [index, severity] of ['minor', 'normal', 'major'].entries()) {
  batchedCausality.recordCausalEvent(
    'debt',
    severity,
    index + 1,
    20,
    `批处理保留事项${index + 1}`,
    undefined,
    undefined,
    { scope: 'global', createdTotalDays: 200 },
  )
}
const firstBatch = batchedCausality.checkCausalTrigger(3, {
  currentTotalDays: 200,
  scope: 'global',
})
assertOk(
  firstBatch.triggeredEvents.length === 2
    && batchedCausality.getPendingEvents().length === 3,
  'maxTriggerPerRound must limit only the returned batch and retain every due event',
)
batchedCausality.commitCausalTriggers(
  firstBatch.triggeredEvents.map((event) => event.id),
  3,
  '首批已在完整叙事提交后兑现。',
  { currentTotalDays: 200 },
)
assertOk(
  batchedCausality.checkCausalTrigger(4, { currentTotalDays: 200, scope: 'global' })
    .triggeredEvents.length === 1,
  'an event deferred by batching must remain eligible in the next accepted narrative round',
)

console.log(
  `METRIC: prompt-${narrativePrompt.version} server-system=${COMPILED_NARRATIVE_SYSTEM_PROMPT.length} global=${firstSegments.userSegments?.[0]?.length ?? 0} memory=${firstSegments.userSegments?.[1]?.length ?? 0} round=${firstSegments.userSegments?.[2]?.length ?? 0}`,
)

if (failed > 0) process.exit(1)
console.log('PASS: narrative-chinese-protocol-regression')
