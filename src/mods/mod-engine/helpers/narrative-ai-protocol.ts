/**
 * @module narrative-ai-protocol.ts
 * @description 主叙事 AI 全中文协议信封、外部 Schema 与内部契约严格转译
 * @mod mod-engine
 *
 * AI 只接触本文件声明的中文字段和值；内部运行态继续使用稳定英文标识。
 * 未知系统、字段、枚举或形状必须让整份回合数据失败，禁止部分翻译后提交。
 */

import { z } from 'zod'

import { MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS } from './mvp-runtime-policy'
import {
  NarrativeResponseSchema,
  type NarrativeRoundMetadata,
} from './narrative-semantic-signals'
import { translateNarrativeAIChangeToInternal } from './subsystem-field-registry'

export const NARRATIVE_BODY_OPEN_TAG = '[正文]'
export const NARRATIVE_BODY_CLOSE_TAG = '[/正文]'
export const NARRATIVE_DATA_OPEN_TAG = '[回合数据]'
export const NARRATIVE_DATA_CLOSE_TAG = '[/回合数据]'

function createEnumTranslator<const TInternal extends string, const TAI extends string>(
  pairs: readonly (readonly [TInternal, TAI])[],
) {
  const internalToAI = Object.fromEntries(pairs) as Record<TInternal, TAI>
  const aiToInternal = Object.fromEntries(
    pairs.map(([internal, ai]) => [ai, internal]),
  ) as Record<TAI, TInternal>
  const aiValues = pairs.map(([, ai]) => ai) as [TAI, ...TAI[]]

  return {
    internalToAI,
    aiToInternal,
    aiValues,
    schema: z.enum(aiValues),
    toInternal(value: TAI): TInternal {
      return aiToInternal[value]
    },
  }
}

export const AI_EVENT_TYPES = createEnumTranslator([
  ['routine', '日常'],
  ['relationship', '关系'],
  ['conflict', '冲突'],
  ['journey', '旅程'],
  ['discovery', '发现'],
  ['achievement', '成就'],
  ['loss', '损失'],
  ['health', '健康'],
  ['creation', '创造'],
  ['other', '其他'],
] as const)

export const AI_IMPACT_SCOPES = createEnumTranslator([
  ['personal', '个人'],
  ['relationship', '关系圈'],
  ['community', '社群'],
  ['society', '社会'],
  ['civilization', '文明'],
] as const)

export const AI_NARRATIVE_REGISTERS = createEnumTranslator([
  ['life', '生活'],
  ['fate', '命运'],
  ['legacy', '传承'],
] as const)

export const AI_ACTION_SCALES = createEnumTranslator([
  ['small', '小'],
  ['medium', '中'],
  ['large', '大'],
] as const)

export const AI_INTENT_FEASIBILITIES = createEnumTranslator([
  ['executable', '可执行'],
  ['conditional', '有条件'],
  ['blocked', '受阻'],
  ['impossible', '不可能'],
] as const)

export const AI_INTENT_EXECUTION_MODES = createEnumTranslator([
  ['immediate', '立即执行'],
  ['progressive', '逐步执行'],
  ['deferred', '延后执行'],
] as const)

export const AI_INTENT_STATUSES = createEnumTranslator([
  ['progressing', '推进中'],
  ['blocked', '受阻'],
  ['succeeded', '成功'],
  ['partially_succeeded', '部分成功'],
  ['failed', '失败'],
] as const)

export const AI_INTENT_RISK_LEVELS = createEnumTranslator([
  ['low', '低'],
  ['medium', '中'],
  ['high', '高'],
  ['extreme', '极高'],
] as const)

export const AI_ARC_TYPES = createEnumTranslator([
  ['battle', '战斗'],
  ['journey', '旅程'],
  ['task', '任务'],
  ['relationship', '关系'],
  ['life_stage', '人生阶段'],
  ['none', '无'],
] as const)

export const AI_RELATIONSHIP_TYPES = createEnumTranslator([
  ['first_meeting', '初识'],
  ['conflict', '冲突'],
  ['alliance', '结盟'],
  ['betrayal', '背叛'],
  ['marriage', '婚姻'],
  ['death', '死亡'],
  ['other', '其他'],
] as const)

export const AI_IMPORTANCE_LEVELS = createEnumTranslator([
  ['HIGH', '高'],
  ['NORMAL', '普通'],
  ['LOW', '低'],
] as const)

export const AI_ARC_STATUSES = createEnumTranslator([
  ['start', '开始'],
  ['ongoing', '进行中'],
  ['end', '结束'],
] as const)

export const AI_CREATION_CATEGORIES = createEnumTranslator([
  ['power_system', '力量体系'],
  ['technique', '技法'],
  ['ability', '能力'],
  ['rule', '规则'],
  ['object', '物品'],
  ['other', '其他'],
] as const)

export const AI_FORESHADOWING_TYPES = createEnumTranslator([
  ['prophecy', '预言'],
  ['mysterious_item', '神秘物品'],
  ['secret_identity', '隐藏身份'],
  ['unfinished_business', '未竟之事'],
  ['oath', '誓言'],
  ['mysterious_person', '神秘人物'],
  ['hidden_power', '隐藏力量'],
  ['ancient_ruin', '古代遗迹'],
  ['other', '其他'],
] as const)

export const AI_DEFERRED_CAUSAL_TYPES = createEnumTranslator([
  ['kindness', '恩情'],
  ['grudge', '仇怨'],
  ['promise', '承诺'],
  ['debt', '债务'],
] as const)

export const AI_DEFERRED_CAUSAL_SEVERITIES = createEnumTranslator([
  ['minor', '轻微'],
  ['normal', '普通'],
  ['major', '重大'],
  ['critical', '关键'],
] as const)

export function toNarrativeAIIntentId(internalId: string): string {
  return internalId.startsWith('branch:')
    ? `命运分支:${internalId.slice('branch:'.length)}`
    : internalId
}

export function fromNarrativeAIIntentId(aiId: string): string {
  return aiId.startsWith('命运分支:')
    ? `branch:${aiId.slice('命运分支:'.length)}`
    : aiId
}

export function toNarrativeAIForeshadowingId(internalId: string): string {
  return internalId.startsWith('fs_') ? `伏笔_${internalId.slice(3)}` : internalId
}

export function fromNarrativeAIForeshadowingId(aiId: string): string {
  return aiId.startsWith('伏笔_') ? `fs_${aiId.slice(3)}` : aiId
}

export function translateInternalIntentResolutionToAI(
  resolution: NarrativeRoundMetadata['intentResolution'],
): Record<string, unknown> | null {
  if (!resolution) return null
  return {
    意图编号: toNarrativeAIIntentId(resolution.intentId),
    可行性: AI_INTENT_FEASIBILITIES.internalToAI[resolution.feasibility],
    执行方式: AI_INTENT_EXECUTION_MODES.internalToAI[resolution.executionMode],
    状态: AI_INTENT_STATUSES.internalToAI[resolution.status],
    风险等级: AI_INTENT_RISK_LEVELS.internalToAI[resolution.riskLevel],
    进度: resolution.progress,
    阻碍: resolution.blockers,
    前置条件: resolution.prerequisites,
    代价: resolution.costs,
    预计耗时: resolution.timeHorizon,
    判定理由: resolution.reason,
    ...(resolution.nextStep ? { 下一步: resolution.nextStep } : {}),
  }
}

const NarrativeAIRelationshipUpdateSchema = z.object({
  姓名: z.string().min(1),
  类型: AI_RELATIONSHIP_TYPES.schema,
  说明: z.string().min(1),
}).strict()

const NarrativeAISemanticSignalsSchema = z.object({
  事件类型: AI_EVENT_TYPES.schema,
  冲突强度: z.coerce.number().int().min(0).max(100),
  张力变化: z.coerce.number().int().min(-10).max(15),
  行动规模: AI_ACTION_SCALES.schema,
  不可逆: z.boolean(),
  影响范围: AI_IMPACT_SCOPES.schema,
  叙事语域: AI_NARRATIVE_REGISTERS.schema,
  语域理由: z.string().min(1),
  情节类型: AI_ARC_TYPES.schema,
  关系变化: z.array(NarrativeAIRelationshipUpdateSchema),
  已回收伏笔编号: z.array(z.string().min(1)),
}).strict().superRefine((signals, context) => {
  if (signals.叙事语域 !== '生活' && signals.不可逆 !== true) {
    context.addIssue({
      code: 'custom',
      path: ['不可逆'],
      message: '命运或传承语域必须对应不可逆变化；否则应使用生活语域',
    })
  }
})

const NarrativeAIKeyEventSchema = z.object({
  内容: z.string().min(1),
  重要度: z.coerce.number().min(0).max(100),
  涉及实体: z.array(z.string().min(1)),
}).strict()

const NarrativeAICreationSchema = z.object({
  名称: z.string().min(1),
  说明: z.string().min(1),
  类别: AI_CREATION_CATEGORIES.schema,
}).strict()

const NarrativeAIForeshadowingSchema = z.object({
  类型: AI_FORESHADOWING_TYPES.schema,
  说明: z.string().min(1),
  优先级: z.coerce.number().min(1).max(10),
}).strict()

const NarrativeAIIntentResolutionSchema = z.object({
  意图编号: z.string().min(1),
  可行性: AI_INTENT_FEASIBILITIES.schema,
  执行方式: AI_INTENT_EXECUTION_MODES.schema,
  状态: AI_INTENT_STATUSES.schema,
  风险等级: AI_INTENT_RISK_LEVELS.schema,
  进度: z.coerce.number().min(0).max(100),
  阻碍: z.array(z.string().min(1)),
  前置条件: z.array(z.string().min(1)),
  代价: z.array(z.string().min(1)),
  预计耗时: z.string().min(1),
  判定理由: z.string().min(1),
  下一步: z.string().min(1).optional(),
}).strict()

const NarrativeAIChangeSchema = z.object({
  系统: z.string().min(1),
  说明: z.string().min(1),
  变更: z.record(z.string(), z.unknown()),
}).strict()

const NarrativeAIDeferredCausalitySchema = z.object({
  类型: AI_DEFERRED_CAUSAL_TYPES.schema,
  严重程度: AI_DEFERRED_CAUSAL_SEVERITIES.schema,
  已成立事实: z.string().min(1),
  相关人物: z.string().min(1).optional(),
  相关势力: z.string().min(1).optional(),
}).strict()

/** 主叙事 AI 唯一可接受的中文回合数据协议。 */
export const NarrativeAIResponseSchema = z.object({
  状态变更: z.array(NarrativeAIChangeSchema),
  长期事件: z.array(z.string().min(1)).optional(),
  原创内容: z.array(NarrativeAICreationSchema).optional(),
  新伏笔: z.array(NarrativeAIForeshadowingSchema).optional(),
  重要程度: AI_IMPORTANCE_LEVELS.schema,
  本轮摘要: z.string().min(1),
  关键事件: z.array(NarrativeAIKeyEventSchema),
  情节状态: AI_ARC_STATUSES.schema,
  语义信号: NarrativeAISemanticSignalsSchema,
  命运分支: z.boolean().optional(),
  分支标题: z.string().min(1).optional(),
  分支选项: z.array(z.string().min(1)).min(2).max(4).optional(),
  命运意图判定: NarrativeAIIntentResolutionSchema.optional(),
  新延迟因果: z.array(NarrativeAIDeferredCausalitySchema).optional(),
}).strict()

export type NarrativeAIResponse = z.infer<typeof NarrativeAIResponseSchema>

/**
 * 仅修复 AI 把 JSON 语法引号/分隔符写成中文全角形式的协议错误。
 * 不补括号、不丢数组项、不提取局部对象，也不改写字符串内部的中文引号。
 */
export function normalizeNarrativeAIJsonSyntax(source: string): string {
  let output = ''
  let inAsciiString = false
  let inCurlyString = false
  let escaped = false

  const nextNonWhitespace = (from: number): string | undefined => {
    for (let index = from; index < source.length; index++) {
      if (!/\s/u.test(source[index]!)) return source[index]
    }
    return undefined
  }

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!

    if (inAsciiString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inAsciiString = false
      }
      continue
    }

    if (inCurlyString) {
      if (char === '”' && [':', ',', '}', ']'].includes(nextNonWhitespace(index + 1) ?? '')) {
        output += '"'
        inCurlyString = false
      } else if (char === '"') {
        output += '\\"'
      } else {
        output += char
      }
      continue
    }

    if (char === '"') {
      output += char
      inAsciiString = true
    } else if (char === '“') {
      output += '"'
      inCurlyString = true
    } else if (char === '，') {
      output += ','
    } else if (char === '：') {
      output += ':'
    } else {
      output += char
    }
  }

  return output
}

export function parseNarrativeAIDataJson(source: string): unknown {
  return JSON.parse(normalizeNarrativeAIJsonSyntax(source))
}

/**
 * 中文协议整包转译为内部运行契约。任何未知系统/字段/枚举都会抛错，
 * 调用方必须保留原始回合数据并让全部结构化状态失效。
 */
export function translateNarrativeAIResponse(raw: unknown): NarrativeRoundMetadata & {
  changes: Array<{ id: string; description: string; changes: Record<string, unknown> }>
} {
  const ai = NarrativeAIResponseSchema.parse(raw)
  const translated = {
    changes: ai.状态变更.map((change) => translateNarrativeAIChangeToInternal({
      systemName: change.系统,
      description: change.说明,
      fields: change.变更,
    }, MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS)),
    notableEvents: ai.长期事件,
    creations: ai.原创内容?.map((item) => ({
      name: item.名称,
      description: item.说明,
      category: AI_CREATION_CATEGORIES.toInternal(item.类别),
    })),
    foreshadowing: ai.新伏笔?.map((item) => ({
      type: AI_FORESHADOWING_TYPES.toInternal(item.类型),
      description: item.说明,
      priority: item.优先级,
    })),
    importance: AI_IMPORTANCE_LEVELS.toInternal(ai.重要程度),
    digest: ai.本轮摘要,
    keyEvents: ai.关键事件.map((event) => ({
      text: event.内容,
      importance: event.重要度,
      entities: event.涉及实体,
    })),
    arcStatus: AI_ARC_STATUSES.toInternal(ai.情节状态),
    semanticSignals: {
      eventType: AI_EVENT_TYPES.toInternal(ai.语义信号.事件类型),
      conflictIntensity: ai.语义信号.冲突强度,
      tensionDelta: ai.语义信号.张力变化,
      actionScale: AI_ACTION_SCALES.toInternal(ai.语义信号.行动规模),
      irreversible: ai.语义信号.不可逆,
      impactScope: AI_IMPACT_SCOPES.toInternal(ai.语义信号.影响范围),
      narrativeRegister: AI_NARRATIVE_REGISTERS.toInternal(ai.语义信号.叙事语域),
      registerReason: ai.语义信号.语域理由,
      arcType: AI_ARC_TYPES.toInternal(ai.语义信号.情节类型),
      relationshipUpdates: ai.语义信号.关系变化.map((update) => ({
        name: update.姓名,
        type: AI_RELATIONSHIP_TYPES.toInternal(update.类型),
        summary: update.说明,
      })),
      resolvedForeshadowingIds: ai.语义信号.已回收伏笔编号
        .map(fromNarrativeAIForeshadowingId),
    },
    branch: ai.命运分支,
    branchTitle: ai.分支标题,
    branchOptions: ai.分支选项,
    intentResolution: ai.命运意图判定
      ? {
          intentId: fromNarrativeAIIntentId(ai.命运意图判定.意图编号),
          feasibility: AI_INTENT_FEASIBILITIES.toInternal(ai.命运意图判定.可行性),
          executionMode: AI_INTENT_EXECUTION_MODES.toInternal(ai.命运意图判定.执行方式),
          status: AI_INTENT_STATUSES.toInternal(ai.命运意图判定.状态),
          riskLevel: AI_INTENT_RISK_LEVELS.toInternal(ai.命运意图判定.风险等级),
          progress: ai.命运意图判定.进度,
          blockers: ai.命运意图判定.阻碍,
          prerequisites: ai.命运意图判定.前置条件,
          costs: ai.命运意图判定.代价,
          timeHorizon: ai.命运意图判定.预计耗时,
          reason: ai.命运意图判定.判定理由,
          nextStep: ai.命运意图判定.下一步,
        }
      : undefined,
    deferredCausality: ai.新延迟因果?.map((item) => ({
      type: AI_DEFERRED_CAUSAL_TYPES.toInternal(item.类型),
      severity: AI_DEFERRED_CAUSAL_SEVERITIES.toInternal(item.严重程度),
      description: item.已成立事实,
      relatedPerson: item.相关人物,
      relatedFaction: item.相关势力,
    })),
  }

  return NarrativeResponseSchema.parse(translated)
}

/** 固定 System Prompt 从此生成中文字段说明，禁止另写第二份输出字段清单。 */
export function buildNarrativeAIProtocolGuide(): string[] {
  return [
    `最终只能输出 ${NARRATIVE_BODY_OPEN_TAG}三段正文${NARRATIVE_BODY_CLOSE_TAG} 与 ${NARRATIVE_DATA_OPEN_TAG}单个合法对象${NARRATIVE_DATA_CLOSE_TAG}；禁止代码块和额外文字。`,
    '回合数据必填：状态变更、重要程度、本轮摘要、关键事件、情节状态、语义信号。',
    `重要程度只能为：${AI_IMPORTANCE_LEVELS.aiValues.join('、')}；情节状态只能为：${AI_ARC_STATUSES.aiValues.join('、')}。`,
    `语义信号必填事件类型、冲突强度、张力变化、行动规模、不可逆、影响范围、叙事语域、语域理由、情节类型、关系变化、已回收伏笔编号；冲突强度与张力变化必须是数字，不得写“高”“上升”等文字。`,
    `事件类型只能为：${AI_EVENT_TYPES.aiValues.join('、')}；行动规模只能为：${AI_ACTION_SCALES.aiValues.join('、')}；影响范围只能为：${AI_IMPACT_SCOPES.aiValues.join('、')}。`,
    `叙事语域只能为：${AI_NARRATIVE_REGISTERS.aiValues.join('、')}；情节类型只能为：${AI_ARC_TYPES.aiValues.join('、')}。`,
    '状态变更每项严格使用“系统、说明、变更”，系统与变更字段只能来自本轮中文字段指南；无明确数值变化返回空数组。',
    '关键事件每项严格使用“内容、重要度、涉及实体”，完整记录本轮值得长期继承的全部因果事实；没有明确实体也必须返回空数组。',
    `关系变化每项严格使用“姓名、类型、说明”，类型只能为：${AI_RELATIONSHIP_TYPES.aiValues.join('、')}；没有变化返回空数组。`,
    `只有本轮新形成恩情、仇怨、承诺或债务时才返回“新延迟因果”；类型只能为：${AI_DEFERRED_CAUSAL_TYPES.aiValues.join('、')}；严重程度只能为：${AI_DEFERRED_CAUSAL_SEVERITIES.aiValues.join('、')}；每项使用“类型、严重程度、已成立事实”，可附相关人物或相关势力。正在兑现或已经到期的旧因果不属于新事项，不得重复登记；不要把未来写作指令放入该字段。`,
    '命运分支为真时必须同时给出分支标题与二至四个字符串选项，选项表达行动、立场或方向，不承诺结果。',
    '存在当前命运意图时必须返回命运意图判定，并原样使用提示中的中文意图编号；不存在时禁止返回该字段。',
  ]
}

/** 由中文协议权威派生的最小完整示例；只示范形状与类型，不提供剧情内容模板。 */
export function buildNarrativeAIProtocolExample(): string {
  return JSON.stringify({
    状态变更: [],
    重要程度: AI_IMPORTANCE_LEVELS.aiValues[1],
    本轮摘要: '用一句完整中文概括本轮行动、阻力与结果。',
    关键事件: [{
      内容: '记录一条值得长期继承的完整因果事实。',
      重要度: 60,
      涉及实体: ['人物或地点'],
    }],
    情节状态: AI_ARC_STATUSES.aiValues[1],
    语义信号: {
      事件类型: AI_EVENT_TYPES.aiValues[0],
      冲突强度: 20,
      张力变化: 1,
      行动规模: AI_ACTION_SCALES.aiValues[0],
      不可逆: false,
      影响范围: AI_IMPACT_SCOPES.aiValues[0],
      叙事语域: AI_NARRATIVE_REGISTERS.aiValues[0],
      语域理由: '说明为何采用该语域。',
      情节类型: AI_ARC_TYPES.aiValues[5],
      关系变化: [],
      已回收伏笔编号: [],
    },
  }, null, 2)
}

/** 仅在一次格式修复调用中加载的高频错误核对表。 */
export function buildNarrativeAIProtocolRepairChecklist(): string[] {
  return [
    '严格照抄系统提示词中的中文回合数据示例形状，不得翻译成英文键，不得新增近义字段。',
    '重要度、冲突强度、张力变化、进度、优先级等必须是 JSON 数字；不可逆、命运分支必须是布尔值。',
    '状态变更、关键事件、涉及实体、关系变化、已回收伏笔编号、新延迟因果、分支选项都必须是数组；状态变更中的“变更”必须是对象。',
    '所有枚举只能从系统提示词列出的中文值中选择；不得自造“营救行动、局部、上升、信任加深、承诺履行”等近义值。',
    '命运或传承语域必须把“不可逆”设为 true；若本轮尚未形成不可逆变化，叙事语域必须使用生活。',
    '没有明确永久数值变化时，状态变更必须返回空数组；短暂疲劳、动作消耗、情绪和临时处境不得伪装成属性变更。',
  ]
}
