/**
 * @module narrative-ai-protocol.ts
 * @description 主叙事 AI 全中文协议信封、外部 Schema 与内部契约严格转译
 * @mod mod-engine
 *
 * AI 只接触本文件声明的中文字段和值；内部运行态继续使用稳定英文标识。
 * 未知系统、字段、枚举或形状必须让整个数据区失败，禁止部分翻译后提交。
 */

import { z } from 'zod'

import { MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS } from './mvp-runtime-policy'
import {
  NarrativeResponseSchema,
  type NarrativeRoundMetadata,
} from './narrative-semantic-signals'
import { translateNarrativeAIChangeToInternal } from './subsystem-field-registry'

export const NARRATIVE_BODY_TAG = '⟦正文⟧'
export const NARRATIVE_SUMMARY_TAG = '⟦摘要⟧'
export const NARRATIVE_DATA_TAG = '⟦数据⟧'
export const NARRATIVE_END_TAG = '⟦结束⟧'
export const NARRATIVE_ANNOTATION_OPEN = '⟪'
export const NARRATIVE_ANNOTATION_CLOSE = '⟫'

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
    ...(resolution.blockers.length > 0 ? { 阻碍: resolution.blockers } : {}),
    ...(resolution.prerequisites.length > 0 ? { 前置条件: resolution.prerequisites } : {}),
    ...(resolution.costs.length > 0 ? { 代价: resolution.costs } : {}),
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
  关系变化: z.array(NarrativeAIRelationshipUpdateSchema).min(1).optional(),
  已回收伏笔编号: z.array(z.string().min(1)).min(1).optional(),
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
  涉及实体: z.array(z.string().min(1)).min(1).optional(),
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
  阻碍: z.array(z.string().min(1)).min(1).optional(),
  前置条件: z.array(z.string().min(1)).min(1).optional(),
  代价: z.array(z.string().min(1)).min(1).optional(),
  预计耗时: z.string().min(1),
  判定理由: z.string().min(1),
  下一步: z.string().min(1).optional(),
}).strict()

const NarrativeAIChangeSchema = z.object({
  系统: z.string().min(1),
  说明: z.string().min(1),
  变更: z.record(z.string(), z.unknown()).refine(
    (changes) => Object.keys(changes).length > 0,
    '变更对象不能为空',
  ),
}).strict()

const NarrativeAIDeferredCausalitySchema = z.object({
  类型: AI_DEFERRED_CAUSAL_TYPES.schema,
  严重程度: AI_DEFERRED_CAUSAL_SEVERITIES.schema,
  已成立事实: z.string().min(1),
  相关人物: z.string().min(1).optional(),
  相关势力: z.string().min(1).optional(),
}).strict()

/** 主叙事 AI 唯一可接受的中文数据区协议；摘要由独立必填区承载。 */
export const NarrativeAIResponseSchema = z.object({
  状态变更: z.array(NarrativeAIChangeSchema).min(1).optional(),
  长期事件: z.array(z.string().min(1)).min(1).optional(),
  原创内容: z.array(NarrativeAICreationSchema).min(1).optional(),
  新伏笔: z.array(NarrativeAIForeshadowingSchema).min(1).optional(),
  重要程度: AI_IMPORTANCE_LEVELS.schema.optional(),
  关键事件: z.array(NarrativeAIKeyEventSchema).min(1).optional(),
  情节状态: AI_ARC_STATUSES.schema.optional(),
  语义信号: NarrativeAISemanticSignalsSchema.optional(),
  命运分支: z.literal(true).optional(),
  分支标题: z.string().min(1).optional(),
  分支选项: z.array(z.string().min(1)).min(2).max(4).optional(),
  命运意图判定: NarrativeAIIntentResolutionSchema.optional(),
  新延迟因果: z.array(NarrativeAIDeferredCausalitySchema).min(1).optional(),
}).strict().superRefine((data, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({ code: 'custom', message: '没有结构化信息时应省略整个数据区' })
  }

  const semanticCore = [data.重要程度, data.情节状态, data.语义信号]
  const semanticCoreCount = semanticCore.filter((value) => value !== undefined).length
  if (semanticCoreCount > 0 && semanticCoreCount < semanticCore.length) {
    context.addIssue({ code: 'custom', message: '重要程度、情节状态与语义信号必须同时提交或同时省略' })
  }

  const branchFields = [data.命运分支, data.分支标题, data.分支选项]
  const branchFieldCount = branchFields.filter((value) => value !== undefined).length
  if (branchFieldCount > 0 && branchFieldCount < branchFields.length) {
    context.addIssue({ code: 'custom', message: '命运分支、分支标题与分支选项必须同时提交或同时省略' })
  }

  if ((data.命运分支 || data.命运意图判定) && semanticCoreCount !== semanticCore.length) {
    context.addIssue({ code: 'custom', message: '命运分支或命运意图判定必须同时提交完整语义核心' })
  }
  if (data.命运分支) {
    if (data.重要程度 !== '高') {
      context.addIssue({ code: 'custom', path: ['重要程度'], message: '命运分支必须对应高重要程度' })
    }
    if (data.语义信号?.不可逆 !== true) {
      context.addIssue({ code: 'custom', path: ['语义信号', '不可逆'], message: '命运分支必须对应不可逆变化' })
    }
    if (data.语义信号?.叙事语域 === '生活') {
      context.addIssue({ code: 'custom', path: ['语义信号', '叙事语域'], message: '命运分支不得使用生活语域' })
    }
  }
})

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

/**
 * 删除标准示例中可能被模型误复制的 `⟪说明⟫`。
 * 仅处理 JSON 字符串外的完整注释，不使用正则，也不改写字符串内容。
 */
export function stripNarrativeAIAnnotations(source: string): string {
  let output = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      output += char
      inString = true
      continue
    }

    if (char === NARRATIVE_ANNOTATION_OPEN) {
      const closeIndex = source.indexOf(NARRATIVE_ANNOTATION_CLOSE, index + 1)
      if (closeIndex < 0) {
        throw new Error('数据区包含未闭合的示例说明')
      }
      index = closeIndex
      continue
    }

    output += char
  }

  return output
}

export function parseNarrativeAIDataJson(source: string): unknown {
  const normalized = normalizeNarrativeAIJsonSyntax(stripNarrativeAIAnnotations(source)).trim()
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) {
    throw new Error('数据区必须且只能包含一个完整对象')
  }
  return JSON.parse(normalized)
}

/**
 * 模型有时会把“没有变化”写成空数组。空数组不携带语义，进入严格 Schema
 * 前将其视为省略；不会补字段、猜测状态或改写任何故事文本。分支选项仍保留
 * 严格的最小数量门禁，避免把无效分支当成合法分支。
 */
function omitEmptyNarrativeAIOptionals(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw

  const source = raw as Record<string, unknown>
  const output: Record<string, unknown> = { ...source }
  // “没有分支”偶尔会被模型写成 false；协议语义是省略三项，
  // 仅在没有其它分支字段时将其归一为省略。若同时带标题或选项，继续交给
  // 严格 Schema 拒绝不一致的分支包。
  if (output.命运分支 === false
    && output.分支标题 === undefined
    && output.分支选项 === undefined) {
    delete output.命运分支
  }
  if (output.命运意图判定
    && typeof output.命运意图判定 === 'object'
    && !Array.isArray(output.命运意图判定)
    && Object.keys(output.命运意图判定 as Record<string, unknown>).length === 0) {
    // 标准示例的条件对象偶尔被原样复制为空对象；空对象不代表判定结果。
    delete output.命运意图判定
  }
  const optionalArrayKeys = [
    '状态变更',
    '长期事件',
    '原创内容',
    '新伏笔',
    '关键事件',
    '新延迟因果',
  ] as const
  for (const key of optionalArrayKeys) {
    if (Array.isArray(output[key]) && output[key].length === 0) delete output[key]
  }

  // 可选描述项偶尔出现近义枚举（如“隐藏信息”“怀疑”）。这些字段不会直接
  // 驱动数值写入，统一归入“其他”并保留原说明，避免一条近义词拖垮整轮叙事。
  if (Array.isArray(output.原创内容)) {
    output.原创内容 = output.原创内容.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const normalized = { ...(item as Record<string, unknown>) }
      if (typeof normalized.类别 === 'string'
        && !AI_CREATION_CATEGORIES.aiValues.includes(normalized.类别 as never)) {
        normalized.类别 = '其他'
      }
      return normalized
    })
  }
  if (Array.isArray(output.新伏笔)) {
    output.新伏笔 = output.新伏笔.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const normalized = { ...(item as Record<string, unknown>) }
      if (typeof normalized.类型 === 'string'
        && !AI_FORESHADOWING_TYPES.aiValues.includes(normalized.类型 as never)) {
        normalized.类型 = '其他'
      }
      return normalized
    })
  }

  const semantic = output.语义信号
  if (semantic && typeof semantic === 'object' && !Array.isArray(semantic)) {
    const normalizedSemantic = { ...(semantic as Record<string, unknown>) }
    for (const key of ['关系变化', '已回收伏笔编号'] as const) {
      if (Array.isArray(normalizedSemantic[key]) && normalizedSemantic[key].length === 0) {
        delete normalizedSemantic[key]
      }
    }
    if (Array.isArray(normalizedSemantic.关系变化)) {
      normalizedSemantic.关系变化 = normalizedSemantic.关系变化.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        const normalized = { ...(item as Record<string, unknown>) }
        if (typeof normalized.类型 === 'string'
          && !AI_RELATIONSHIP_TYPES.aiValues.includes(normalized.类型 as never)) {
          normalized.类型 = '其他'
        }
        return normalized
      })
    }
    output.语义信号 = normalizedSemantic
  }

  const intent = output.命运意图判定
  if (intent && typeof intent === 'object' && !Array.isArray(intent)) {
    const normalizedIntent = { ...(intent as Record<string, unknown>) }
    for (const key of ['阻碍', '前置条件', '代价'] as const) {
      if (Array.isArray(normalizedIntent[key]) && normalizedIntent[key].length === 0) {
        delete normalizedIntent[key]
      }
    }
    output.命运意图判定 = normalizedIntent
  }

  return output
}

/**
 * 中文协议整包转译为内部运行契约。任何未知系统/字段/枚举都会抛错，
 * 调用方必须保留原始数据区并让全部结构化状态失效。
 */
export function translateNarrativeAIResponse(raw: unknown, digest: string): NarrativeRoundMetadata & {
  changes: Array<{ id: string; description: string; changes: Record<string, unknown> }>
} {
  const ai = NarrativeAIResponseSchema.parse(omitEmptyNarrativeAIOptionals(raw))
  const translated = {
    changes: (ai.状态变更 ?? []).map((change) => translateNarrativeAIChangeToInternal({
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
    importance: ai.重要程度 ? AI_IMPORTANCE_LEVELS.toInternal(ai.重要程度) : undefined,
    digest,
    keyEvents: ai.关键事件?.map((event) => ({
      text: event.内容,
      importance: event.重要度,
      entities: event.涉及实体,
    })),
    arcStatus: ai.情节状态 ? AI_ARC_STATUSES.toInternal(ai.情节状态) : undefined,
    semanticSignals: ai.语义信号
      ? {
          eventType: AI_EVENT_TYPES.toInternal(ai.语义信号.事件类型),
          conflictIntensity: ai.语义信号.冲突强度,
          tensionDelta: ai.语义信号.张力变化,
          actionScale: AI_ACTION_SCALES.toInternal(ai.语义信号.行动规模),
          irreversible: ai.语义信号.不可逆,
          impactScope: AI_IMPACT_SCOPES.toInternal(ai.语义信号.影响范围),
          narrativeRegister: AI_NARRATIVE_REGISTERS.toInternal(ai.语义信号.叙事语域),
          registerReason: ai.语义信号.语域理由,
          arcType: AI_ARC_TYPES.toInternal(ai.语义信号.情节类型),
          relationshipUpdates: (ai.语义信号.关系变化 ?? []).map((update) => ({
            name: update.姓名,
            type: AI_RELATIONSHIP_TYPES.toInternal(update.类型),
            summary: update.说明,
          })),
          resolvedForeshadowingIds: (ai.语义信号.已回收伏笔编号 ?? [])
            .map(fromNarrativeAIForeshadowingId),
        }
      : undefined,
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
          blockers: ai.命运意图判定.阻碍 ?? [],
          prerequisites: ai.命运意图判定.前置条件 ?? [],
          costs: ai.命运意图判定.代价 ?? [],
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

/** 固定 System Prompt 的唯一基础协议；字段细则只在标准示例中出现一次。 */
export function buildNarrativeAIProtocolBaseRules(): string[] {
  return [
    `最终按 ${NARRATIVE_BODY_TAG}、${NARRATIVE_SUMMARY_TAG}、可选 ${NARRATIVE_DATA_TAG}、${NARRATIVE_END_TAG} 的顺序输出；每个标记独占一行，禁止代码块、表情、额外标题和解释。`,
    '正文必须是完整中文三段；摘要只记录本轮已经发生的事实，不写评价、文风说明或未来写作指令。',
    '数据只记录本轮确实成立的结构化结果；无内容、无变化时省略整个字段，禁止空数组、空对象、空字符串和 null。',
    '数据区不是字段清单，不要照抄全部示例；数值变化为0时省略该项，列表无项时省略字段，没有命运分支时省略分支三项而不是输出 false。',
    '省略字段表示本轮未提交该类结构化信息，不表示确认没有变化；本地不会从正文猜测缺失状态。',
    '没有当前命运意图时，省略“命运意图判定”；标准示例中的条件字段不得照抄。',
    '不得为字数、格式或数组数量删短正文、摘要或剧情事实；需要凝练时保持全部事实可追踪。',
    `标准示例中的 ${NARRATIVE_ANNOTATION_OPEN}说明${NARRATIVE_ANNOTATION_CLOSE} 只解释字段，正式输出不得复制。`,
    '一旦输出数据区，所有已输出字段必须整包合法；禁止新增近义字段、英文键或只提交合法部分。',
    '最低合法结果是完整三段正文、完整摘要与结束标记；存在当前命运意图或强制命运分支时，相关结构化字段仍为条件必填。',
  ]
}

/** 唯一完整标准示例；同一处同时承担形状、类型、枚举、触发和文风说明。 */
export function buildNarrativeAIProtocolStandardExample(): string {
  return `${NARRATIVE_BODY_TAG}
你撞开仓房木门，把林舟的铜扣递给阿禾；巡船的灯已经越过礁石。

你用外衣堵住船缝，借退潮暗礁转舵，避开追船投来的绳钩。

你们尚未脱险，东侧海雾与西侧旧航标之间的选择已经逼到眼前。

${NARRATIVE_SUMMARY_TAG}
你救出阿禾但仍被追赶，必须决定逃离北岸还是调查父亲的航标。

${NARRATIVE_DATA_TAG}
{
  "状态变更": [{"系统":"道德","说明":"冒险救人","变更":{"道德变化":1}}], ${NARRATIVE_ANNOTATION_OPEN}只输出非零永久变化；系统和变更键取本轮指南；无则省略${NARRATIVE_ANNOTATION_CLOSE}
  "长期事件": ["军府开始追捕你"], ${NARRATIVE_ANNOTATION_OPEN}持续既成事实；无则省略${NARRATIVE_ANNOTATION_CLOSE}
  "原创内容": [{"名称":"贴礁转舵","说明":"借暗礁限制追船","类别":"技法"}], ${NARRATIVE_ANNOTATION_OPEN}类别：${AI_CREATION_CATEGORIES.aiValues.join('、')}；无则省略${NARRATIVE_ANNOTATION_CLOSE}
  "新伏笔": [{"类型":"神秘物品","说明":"父亲船队的烧焦缆绳","优先级":8}], ${NARRATIVE_ANNOTATION_OPEN}类型：${AI_FORESHADOWING_TYPES.aiValues.join('、')}；优先级1—10；无则省略${NARRATIVE_ANNOTATION_CLOSE}
  "重要程度": "高", ${NARRATIVE_ANNOTATION_OPEN}${AI_IMPORTANCE_LEVELS.aiValues.join('、')}；与情节状态、语义信号同现同省${NARRATIVE_ANNOTATION_CLOSE}
  "关键事件": [{"内容":"你救出阿禾并遭军府追捕","重要度":82,"涉及实体":["阿禾","军府"]}], ${NARRATIVE_ANNOTATION_OPEN}重要度0—100；实体无则省略；事件无则省略${NARRATIVE_ANNOTATION_CLOSE}
  "情节状态": "进行中", ${NARRATIVE_ANNOTATION_OPEN}${AI_ARC_STATUSES.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
  "语义信号": {
    "事件类型":"冲突", ${NARRATIVE_ANNOTATION_OPEN}事件性质：${AI_EVENT_TYPES.aiValues.join('、')}；不得填写“任务”等情节类型${NARRATIVE_ANNOTATION_CLOSE}
    "冲突强度":82, ${NARRATIVE_ANNOTATION_OPEN}0—100整数${NARRATIVE_ANNOTATION_CLOSE}
    "张力变化":6, ${NARRATIVE_ANNOTATION_OPEN}-10—15整数${NARRATIVE_ANNOTATION_CLOSE}
    "行动规模":"中", ${NARRATIVE_ANNOTATION_OPEN}${AI_ACTION_SCALES.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "不可逆":true, ${NARRATIVE_ANNOTATION_OPEN}布尔值${NARRATIVE_ANNOTATION_CLOSE}
    "影响范围":"关系圈", ${NARRATIVE_ANNOTATION_OPEN}${AI_IMPACT_SCOPES.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "叙事语域":"命运", ${NARRATIVE_ANNOTATION_OPEN}${AI_NARRATIVE_REGISTERS.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "语域理由":"救援使你被军府锁定",
    "情节类型":"任务", ${NARRATIVE_ANNOTATION_OPEN}剧情结构：${AI_ARC_TYPES.aiValues.join('、')}；不得填写“冲突”等事件类型${NARRATIVE_ANNOTATION_CLOSE}
    "关系变化":[{"姓名":"阿禾","类型":"结盟","说明":"共同承担风险"}], ${NARRATIVE_ANNOTATION_OPEN}类型：${AI_RELATIONSHIP_TYPES.aiValues.join('、')}；无则省略${NARRATIVE_ANNOTATION_CLOSE}
    "已回收伏笔编号":["伏笔_林舟的铜扣"] ${NARRATIVE_ANNOTATION_OPEN}无则省略${NARRATIVE_ANNOTATION_CLOSE}
  },
  "命运分支":true, ${NARRATIVE_ANNOTATION_OPEN}只在不可逆重要选择时与标题、选项同现；没有分支时三项省略，禁止输出 false${NARRATIVE_ANNOTATION_CLOSE}
  "分支标题":"决定航向",
  "分支选项":["驶入海雾","转向旧礁群"], ${NARRATIVE_ANNOTATION_OPEN}二至四个行动或立场，不承诺结果${NARRATIVE_ANNOTATION_CLOSE}
  "命运意图判定":{ ${NARRATIVE_ANNOTATION_OPEN}仅当前意图存在时输出；编号照抄${NARRATIVE_ANNOTATION_CLOSE}
    "意图编号":"命运分支:带阿禾离开",
    "可行性":"有条件", ${NARRATIVE_ANNOTATION_OPEN}${AI_INTENT_FEASIBILITIES.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "执行方式":"逐步执行", ${NARRATIVE_ANNOTATION_OPEN}${AI_INTENT_EXECUTION_MODES.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "状态":"推进中", ${NARRATIVE_ANNOTATION_OPEN}${AI_INTENT_STATUSES.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "风险等级":"高", ${NARRATIVE_ANNOTATION_OPEN}${AI_INTENT_RISK_LEVELS.aiValues.join('、')}${NARRATIVE_ANNOTATION_CLOSE}
    "进度":65, ${NARRATIVE_ANNOTATION_OPEN}0—100${NARRATIVE_ANNOTATION_CLOSE}
    "阻碍":["追船逼近"], ${NARRATIVE_ANNOTATION_OPEN}无则省略${NARRATIVE_ANNOTATION_CLOSE}
    "前置条件":["选择航线"], ${NARRATIVE_ANNOTATION_OPEN}无则省略${NARRATIVE_ANNOTATION_CLOSE}
    "代价":["遭军府通缉"], ${NARRATIVE_ANNOTATION_OPEN}无则省略${NARRATIVE_ANNOTATION_CLOSE}
    "预计耗时":"多个节点",
    "判定理由":"已救人但未脱险",
    "下一步":"处理追击" ${NARRATIVE_ANNOTATION_OPEN}无则省略${NARRATIVE_ANNOTATION_CLOSE}
  },
  "新延迟因果":[{"类型":"恩情","严重程度":"重大","已成立事实":"你救出阿禾","相关人物":"阿禾","相关势力":"林舟一方"}] ${NARRATIVE_ANNOTATION_OPEN}类型：${AI_DEFERRED_CAUSAL_TYPES.aiValues.join('、')}；严重程度：${AI_DEFERRED_CAUSAL_SEVERITIES.aiValues.join('、')}；无则省略${NARRATIVE_ANNOTATION_CLOSE}
}
${NARRATIVE_END_TAG}`
}

/** 仅在一次格式修复调用中加载的最小提醒，不重复标准示例字段清单。 */
export function buildNarrativeAIProtocolRepairReminder(): string[] {
  return [
    '按系统提示词末尾的唯一标准示例重写；正式输出不要复制示例说明。',
    '没有内容的结构化字段直接省略，不输出空数组、空对象、空字符串或 null。',
    `至少完整返回 ${NARRATIVE_BODY_TAG}、${NARRATIVE_SUMMARY_TAG} 与 ${NARRATIVE_END_TAG}。`,
  ]
}
