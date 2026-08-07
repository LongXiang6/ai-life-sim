/**
 * Purpose: Define the Chinese AI protocols, Schemas, and strict runtime translations used by narrative calls.
 * Owner: mod-engine
 * Responsibility: Validate and translate declared AI fields atomically without owning simulation state.
 *
 * @module narrative-ai-protocol.ts
 * @description 主叙事与后台分析 AI 的中文协议、Schema 与内部契约严格转译
 * @mod mod-engine
 *
 * AI 只接触本文件声明的中文字段和值；内部运行态继续使用稳定英文标识。
 * 未知系统、字段、枚举或形状必须让整个数据区失败，禁止部分翻译后提交。
 */

import { z } from 'zod'
import type {
  ContextCapability,
  HistoricalEventCandidateInput,
  SubSystemChanges,
} from '@/foundation'
import { parseAIJSON } from '@/core/ai-service/parse-ai-json'

import {
  NarrativeRoundMetadataSchema,
  type NarrativeRoundMetadata,
} from './narrative-semantic-signals'
import { translateNarrativeAISystemInstructionToInternal } from './subsystem-field-registry'

export const NARRATIVE_BODY_TAG = '⟦正文⟧'
export const NARRATIVE_BRANCH_TAG = '⟦分支⟧'

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

export const AI_DELIVERED_CAUSAL_STATUSES = createEnumTranslator([
  ['resolved', '已解决'],
  ['continuing', '继续'],
  ['not-touched', '未触及'],
] as const)

export const AI_HISTORICAL_EVENT_CANDIDATE_STATUSES = createEnumTranslator([
  ['accepted', '已接纳'],
  ['continuing', '继续等待'],
  ['rejected', '已拒绝'],
  ['expired', '已过期'],
] as const)

export const AI_EVENT_CANDIDATE_SCOPES = createEnumTranslator([
  ['context', '当前上下文'],
  ['global', '全局'],
] as const)

export const AI_CONTEXT_CAPABILITIES = createEnumTranslator([
  ['life', '生命'],
  ['space', '空间'],
  ['npc', '人物'],
  ['economy', '经济'],
  ['politics', '政治'],
  ['technology', '科技'],
  ['supernatural', '超自然'],
] as const)

export function toNarrativeAIForeshadowingId(internalId: string): string {
  return internalId.startsWith('fs_') ? `伏笔_${internalId.slice(3)}` : internalId
}

export function fromNarrativeAIForeshadowingId(aiId: string): string {
  return aiId.startsWith('伏笔_') ? `fs_${aiId.slice(3)}` : aiId
}

const NarrativeAIRelationshipUpdateSchema = z.object({
  姓名: z.string().min(1),
  类型: AI_RELATIONSHIP_TYPES.schema,
  说明: z.string().min(1),
}).strict()

const NarrativeAISemanticSignalsSchema = z.object({
  事件类型: AI_EVENT_TYPES.schema,
  冲突强度: z.number().int().min(0).max(100),
  张力变化: z.number().int().min(-10).max(15),
  行动规模: AI_ACTION_SCALES.schema,
  不可逆: z.boolean(),
  影响范围: AI_IMPACT_SCOPES.schema,
  叙事语域: AI_NARRATIVE_REGISTERS.schema,
  语域理由: z.string().min(1),
  情节类型: AI_ARC_TYPES.schema,
  关系变化: z.array(NarrativeAIRelationshipUpdateSchema).optional(),
  已回收伏笔编号: z.array(z.string().min(1)).optional(),
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
  重要度: z.number().min(0).max(100),
  涉及实体: z.array(z.string().min(1)).optional(),
}).strict()

const NarrativeAICreationSchema = z.object({
  名称: z.string().min(1),
  说明: z.string().min(1),
  类别: AI_CREATION_CATEGORIES.schema,
}).strict()

const NarrativeAIForeshadowingSchema = z.object({
  类型: AI_FORESHADOWING_TYPES.schema,
  说明: z.string().min(1),
  优先级: z.number().min(1).max(10),
}).strict()

export const NarrativeAISystemInstructionSchema = z.object({
  系统: z.string().min(1),
  目标对象: z.string().min(1),
  目标上下文: z.string().min(1),
  操作: z.string().min(1),
  说明: z.string().min(1),
  变更: z.record(z.string(), z.unknown()),
  依据事件: z.array(z.string().min(1)),
}).strict()

const NarrativeAIDeferredCausalitySchema = z.object({
  类型: AI_DEFERRED_CAUSAL_TYPES.schema,
  严重程度: AI_DEFERRED_CAUSAL_SEVERITIES.schema,
  已成立事实: z.string().min(1),
  相关人物: z.string().min(1).optional(),
  相关势力: z.string().min(1).optional(),
}).strict()

const NarrativeAIDeliveredCausalDispositionSchema = z.object({
  因果编号: z.string().min(1),
  状态: AI_DELIVERED_CAUSAL_STATUSES.schema,
  判定理由: z.string().min(1),
  继续延迟天数: z.number().int().min(1).optional(),
}).strict().superRefine((disposition, context) => {
  if (disposition.状态 === '已解决' && disposition.继续延迟天数 !== undefined) {
    context.addIssue({ code: 'custom', path: ['继续延迟天数'], message: '已解决因果不得继续延期' })
  }
  if (disposition.状态 !== '已解决' && disposition.继续延迟天数 === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['继续延迟天数'],
      message: '继续或未触及的因果必须提供新的合法延迟天数',
    })
  }
})

const NarrativeAIHistoricalEventCandidateDispositionSchema = z.object({
  候选编号: z.string().min(1),
  状态: AI_HISTORICAL_EVENT_CANDIDATE_STATUSES.schema,
  判定理由: z.string().min(1),
}).strict()

/** 第一次调用唯一可返回的玩家可见分支。 */
const NarrativeAINonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  '文本不能为空白',
)

export const NarrativeAIBranchSchema = z.object({
  标题: NarrativeAINonBlankStringSchema,
  选项: z.array(NarrativeAINonBlankStringSchema).min(2).max(4),
}).strict()

const NarrativeAIEventMetadataSchema = z.object({
  摘要: z.string().min(1),
  注册事件: z.array(NarrativeAIKeyEventSchema),
  长期事件: z.array(z.string().min(1)).optional(),
  原创内容: z.array(NarrativeAICreationSchema).optional(),
  新伏笔: z.array(NarrativeAIForeshadowingSchema).optional(),
  重要程度: AI_IMPORTANCE_LEVELS.schema.optional(),
  情节状态: AI_ARC_STATUSES.schema.optional(),
  语义信号: NarrativeAISemanticSignalsSchema.optional(),
  新延迟因果: z.array(NarrativeAIDeferredCausalitySchema).optional(),
  到期因果判定: z.array(NarrativeAIDeliveredCausalDispositionSchema).optional(),
  到期候选判定: z.array(NarrativeAIHistoricalEventCandidateDispositionSchema).optional(),
}).strict().superRefine((data, context) => {
  const semanticCore = [data.重要程度, data.情节状态, data.语义信号]
  const semanticCoreCount = semanticCore.filter((value) => value !== undefined).length
  if (semanticCoreCount > 0 && semanticCoreCount < semanticCore.length) {
    context.addIssue({ code: 'custom', message: '重要程度、情节状态与语义信号必须同时提交或同时省略' })
  }
})

const NarrativeAIEventCandidateSchema = z.object({
  类型: z.string().min(1),
  标题: z.string().min(1),
  说明: z.string().min(1),
  作用域: AI_EVENT_CANDIDATE_SCOPES.schema,
  触发条件: z.string().min(1),
  延迟天数: z.number().int().min(1).optional(),
  相关人物: z.array(z.string().min(1)).optional(),
  相关地点: z.array(z.string().min(1)).optional(),
  所需能力: z.array(AI_CONTEXT_CAPABILITIES.schema).optional(),
  标签: z.array(z.string().min(1)).optional(),
}).strict().superRefine((candidate, context) => {
  const duplicateFields: Array<[string, readonly string[] | undefined]> = [
    ['相关人物', candidate.相关人物],
    ['相关地点', candidate.相关地点],
    ['所需能力', candidate.所需能力],
    ['标签', candidate.标签],
  ]
  for (const [field, values] of duplicateFields) {
    if (values && new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', path: [field], message: `${field} 不得包含重复项` })
    }
  }
  if (candidate.作用域 === '全局' && (candidate.所需能力?.length ?? 0) > 0) {
    context.addIssue({ code: 'custom', path: ['所需能力'], message: '全局候选不得声明上下文能力' })
  }
})

export const NarrativeAIDataAnalysisDataSchema = z.object({
  系统操作: z.array(NarrativeAISystemInstructionSchema),
}).strict()

const BASIC_ATTRIBUTE_AI_FIELDS = new Set([
  '体魄变化',
  '心智变化',
  '悟性变化',
  '魅力变化',
])

export const NarrativeAIBasicAttributeAnalysisDataSchema = z.object({
  系统操作: z.array(NarrativeAISystemInstructionSchema).max(1),
}).strict().superRefine((data, context) => {
  const instruction = data.系统操作[0]
  if (!instruction) return
  if (instruction.系统 !== '角色状态') {
    context.addIssue({ code: 'custom', path: ['系统操作', 0, '系统'], message: '只能分析基础属性' })
  }
  if (instruction.目标对象 !== 'player:current') {
    context.addIssue({ code: 'custom', path: ['系统操作', 0, '目标对象'], message: '基础属性只能指向 player:current' })
  }
  if (instruction.操作 !== '调整属性') {
    context.addIssue({ code: 'custom', path: ['系统操作', 0, '操作'], message: '基础属性只允许调整属性操作' })
  }
  const entries = Object.entries(instruction.变更)
  if (entries.length === 0) {
    context.addIssue({ code: 'custom', path: ['系统操作', 0, '变更'], message: '无变化时应返回空系统操作数组' })
  }
  for (const [field, value] of entries) {
    if (!BASIC_ATTRIBUTE_AI_FIELDS.has(field)) {
      context.addIssue({ code: 'custom', path: ['系统操作', 0, '变更', field], message: `未知基础属性字段：${field}` })
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value === 0) {
      context.addIssue({ code: 'custom', path: ['系统操作', 0, '变更', field], message: '基础属性变化必须是非零整数' })
    }
  }
})

/** 事件识别同时拥有已发生事件元数据与未来候选。 */
export const NarrativeAIEventRecognitionDataSchema = z.object({
  回合事件: NarrativeAIEventMetadataSchema,
  待触发事件: z.array(NarrativeAIEventCandidateSchema),
}).strict()

export type NarrativeAIBranch = z.infer<typeof NarrativeAIBranchSchema>
export type NarrativeAISystemInstruction = z.infer<typeof NarrativeAISystemInstructionSchema>
export type NarrativeAIDataAnalysisData = z.infer<typeof NarrativeAIDataAnalysisDataSchema>
export type NarrativeAIBasicAttributeAnalysisData = z.infer<typeof NarrativeAIBasicAttributeAnalysisDataSchema>
export type NarrativeAIEventRecognitionData = z.infer<typeof NarrativeAIEventRecognitionDataSchema>

/** 读取唯一完整 JSON；字段和值仍由所属严格 Schema 校验。 */
export function parseNarrativeAIJson(source: string): unknown {
  const parsed = parseAIJSON(source)
  if (parsed === null) throw new Error('协议段缺少唯一、完整且可解析的 JSON')
  return parsed
}

export interface TranslateNarrativeAISystemAnalysisOptions {
  allowedEvidenceEventIds: readonly string[]
  allowedSubsystemIds: readonly string[]
  allowedOperationsBySubsystem?: Readonly<Record<string, readonly string[]>>
}

function translateNarrativeAISystemInstructions(
  rawInstructions: readonly unknown[],
  options: TranslateNarrativeAISystemAnalysisOptions,
): SubSystemChanges[] {
  const instructions = z.array(NarrativeAISystemInstructionSchema).parse(rawInstructions)
  const allowedEvidenceIds = new Set(options.allowedEvidenceEventIds)

  for (const instruction of instructions) {
    const unknownEvidenceIds = instruction.依据事件.filter((eventId) => !allowedEvidenceIds.has(eventId))
    if (unknownEvidenceIds.length > 0) {
      throw new Error(`依据事件未在本次分析输入中提供：${unknownEvidenceIds.join('、')}`)
    }
  }

  return instructions.map((change) => translateNarrativeAISystemInstructionToInternal({
      systemName: change.系统,
      operation: change.操作,
      targetObjectId: change.目标对象,
      targetContextId: change.目标上下文,
      evidenceEventIds: change.依据事件,
      description: change.说明,
      fields: change.变更,
    }, options.allowedSubsystemIds, options.allowedOperationsBySubsystem))
}

export function translateNarrativeAIDataAnalysis(
  rawData: unknown,
  options: TranslateNarrativeAISystemAnalysisOptions,
): SubSystemChanges[] {
  const data = NarrativeAIDataAnalysisDataSchema.parse(rawData)
  return translateNarrativeAISystemInstructions(data.系统操作, options)
}

export function translateNarrativeAIBasicAttributeAnalysis(
  rawData: unknown,
  options: TranslateNarrativeAISystemAnalysisOptions,
): SubSystemChanges[] {
  const data = NarrativeAIBasicAttributeAnalysisDataSchema.parse(rawData)
  return translateNarrativeAISystemInstructions(data.系统操作, options)
}

function translateNarrativeAIEventMetadata(rawData: unknown): NarrativeRoundMetadata {
  const data = NarrativeAIEventMetadataSchema.parse(rawData)
  const translated: NarrativeRoundMetadata = {
    digest: data.摘要,
    notableEvents: data.长期事件,
    creations: data.原创内容?.map((item) => ({
      name: item.名称,
      description: item.说明,
      category: AI_CREATION_CATEGORIES.toInternal(item.类别),
    })),
    foreshadowing: data.新伏笔?.map((item) => ({
      type: AI_FORESHADOWING_TYPES.toInternal(item.类型),
      description: item.说明,
      priority: item.优先级,
    })),
    importance: data.重要程度 ? AI_IMPORTANCE_LEVELS.toInternal(data.重要程度) : undefined,
    keyEvents: data.注册事件.length > 0 ? data.注册事件.map((event) => ({
      text: event.内容,
      importance: event.重要度,
      entities: event.涉及实体 && event.涉及实体.length > 0 ? event.涉及实体 : undefined,
    })) : undefined,
    arcStatus: data.情节状态 ? AI_ARC_STATUSES.toInternal(data.情节状态) : undefined,
    semanticSignals: data.语义信号
      ? {
          eventType: AI_EVENT_TYPES.toInternal(data.语义信号.事件类型),
          conflictIntensity: data.语义信号.冲突强度,
          tensionDelta: data.语义信号.张力变化,
          actionScale: AI_ACTION_SCALES.toInternal(data.语义信号.行动规模),
          irreversible: data.语义信号.不可逆,
          impactScope: AI_IMPACT_SCOPES.toInternal(data.语义信号.影响范围),
          narrativeRegister: AI_NARRATIVE_REGISTERS.toInternal(data.语义信号.叙事语域),
          registerReason: data.语义信号.语域理由,
          arcType: AI_ARC_TYPES.toInternal(data.语义信号.情节类型),
          relationshipUpdates: (data.语义信号.关系变化 ?? []).map((update) => ({
            name: update.姓名,
            type: AI_RELATIONSHIP_TYPES.toInternal(update.类型),
            summary: update.说明,
          })),
          resolvedForeshadowingIds: (data.语义信号.已回收伏笔编号 ?? [])
            .map(fromNarrativeAIForeshadowingId),
        }
      : undefined,
    deferredCausality: data.新延迟因果?.map((item) => ({
      type: AI_DEFERRED_CAUSAL_TYPES.toInternal(item.类型),
      severity: AI_DEFERRED_CAUSAL_SEVERITIES.toInternal(item.严重程度),
      description: item.已成立事实,
      relatedPerson: item.相关人物,
      relatedFaction: item.相关势力,
    })),
    deliveredCausalDispositions: data.到期因果判定?.map((item) => ({
      causalId: item.因果编号,
      status: AI_DELIVERED_CAUSAL_STATUSES.toInternal(item.状态),
      reason: item.判定理由,
      continuationDelayDays: item.继续延迟天数,
    })),
    historicalEventCandidateDispositions: data.到期候选判定?.map((item) => ({
      candidateId: item.候选编号,
      status: AI_HISTORICAL_EVENT_CANDIDATE_STATUSES.toInternal(item.状态),
      reason: item.判定理由,
    })),
  }

  return NarrativeRoundMetadataSchema.parse(translated)
}

export interface TranslateNarrativeAIEventRecognitionOptions {
  currentContextId: string
  currentTotalDays: number
}

export interface NarrativeAIEventRecognitionResult {
  metadata: NarrativeRoundMetadata
  candidates: HistoricalEventCandidateInput[]
}

/** 将事件识别结果转成已发生回合元数据和未来候选，不分配稳定 ID。 */
export function translateNarrativeAIEventRecognition(
  rawData: unknown,
  options: TranslateNarrativeAIEventRecognitionOptions,
): NarrativeAIEventRecognitionResult {
  const data = NarrativeAIEventRecognitionDataSchema.parse(rawData)
  const currentContextId = options.currentContextId.trim()
  if (!currentContextId) throw new Error('事件识别缺少当前上下文')
  if (!Number.isSafeInteger(options.currentTotalDays) || options.currentTotalDays < 0) {
    throw new Error('事件识别的当前规范天数无效')
  }

  const candidates = data.待触发事件.map((candidate) => {
    const scopeKind = AI_EVENT_CANDIDATE_SCOPES.toInternal(candidate.作用域)
    const dueTotalDays = candidate.延迟天数 === undefined
      ? undefined
      : options.currentTotalDays + candidate.延迟天数
    if (dueTotalDays !== undefined && !Number.isSafeInteger(dueTotalDays)) {
      throw new Error(`待触发事件“${candidate.标题}”的到期天数超出规范范围`)
    }
    const requiredCapabilities = (candidate.所需能力 ?? [])
      .map((capability) => AI_CONTEXT_CAPABILITIES.toInternal(capability))
      .sort() as ContextCapability[]

    return {
      eventType: candidate.类型.trim(),
      title: candidate.标题.trim(),
      description: candidate.说明.trim(),
      scope: scopeKind === 'context'
        ? { kind: 'context' as const, contextIds: [currentContextId] }
        : { kind: 'global' as const, contextIds: [] },
      participants: (candidate.相关人物 ?? []).map((label) => ({
        label: label.trim(),
        ...(scopeKind === 'context' ? { contextId: currentContextId } : {}),
        role: 'related-person',
      })),
      locations: (candidate.相关地点 ?? []).map((label) => ({
        label: label.trim(),
        ...(scopeKind === 'context' ? { contextId: currentContextId } : {}),
        role: 'related-location',
      })),
      ...(dueTotalDays === undefined ? {} : { schedule: { dueTotalDays } }),
      triggerConditionLabel: candidate.触发条件.trim(),
      requiredCapabilities,
      tags: (candidate.标签 ?? []).map((tag) => tag.trim()),
    }
  })

  return {
    metadata: translateNarrativeAIEventMetadata(data.回合事件),
    candidates,
  }
}

function normalizeCandidateFingerprintText(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() ?? ''
}

/** 用于识别同一候选是否已经注册；不替代账本的稳定 ID。 */
export function buildNarrativeEventCandidateFingerprint(
  candidate: Pick<
    HistoricalEventCandidateInput,
    'eventType' | 'title' | 'description' | 'scope' | 'triggerConditionLabel'
  >,
): string {
  return JSON.stringify({
    eventType: normalizeCandidateFingerprintText(candidate.eventType),
    title: normalizeCandidateFingerprintText(candidate.title),
    description: normalizeCandidateFingerprintText(candidate.description),
    scope: {
      kind: candidate.scope.kind,
      contextIds: [...candidate.scope.contextIds].sort(),
    },
    triggerConditionLabel: normalizeCandidateFingerprintText(candidate.triggerConditionLabel),
  })
}

/** 第一次调用格式修复使用的最小提醒。 */
export function buildNarrativeAIProtocolRepairReminder(requestBranch = false): string[] {
  return [
    '参照系统提示词末尾的唯一 content 返回结构示例，重写完整最终结果。',
    `content 直接以 ${NARRATIVE_BODY_TAG} 紧接完整正文开始${requestBranch ? `；高优先级事实允许真实分叉时，再空一行写 ${NARRATIVE_BRANCH_TAG}单行JSON` : `；确有命运抉择时，再空一行写 ${NARRATIVE_BRANCH_TAG}单行JSON`}。`,
    '正文自然段之间空一行；正文和可选分支构成完整 content，系统变化、基础属性和事件元数据由后续独立 AI 处理。',
  ]
}
