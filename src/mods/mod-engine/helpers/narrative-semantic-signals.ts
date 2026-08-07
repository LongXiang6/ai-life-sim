/**
 * Purpose: Define validated semantic-signal types used by accepted narrative metadata.
 * Owner: mod-engine
 * Responsibility: Own semantic enums and Schema validation without inferring signals from story text.
 */

import { z } from 'zod'

export const NARRATIVE_EVENT_TYPES = [
  'routine',
  'relationship',
  'conflict',
  'journey',
  'discovery',
  'achievement',
  'loss',
  'health',
  'creation',
  'other',
] as const

export const NARRATIVE_IMPACT_SCOPES = [
  'personal',
  'relationship',
  'community',
  'society',
  'civilization',
] as const

export const NARRATIVE_REGISTERS = ['life', 'fate', 'legacy'] as const
export const NARRATIVE_ACTION_SCALES = ['small', 'medium', 'large'] as const
export const NARRATIVE_ARC_TYPES = [
  'battle',
  'journey',
  'task',
  'relationship',
  'life_stage',
  'none',
] as const

export const NARRATIVE_RELATIONSHIP_TYPES = [
  'first_meeting',
  'conflict',
  'alliance',
  'betrayal',
  'marriage',
  'death',
  'other',
] as const

export const NARRATIVE_DEFERRED_CAUSAL_TYPES = ['kindness', 'grudge', 'promise', 'debt'] as const
export const NARRATIVE_DEFERRED_CAUSAL_SEVERITIES = ['minor', 'normal', 'major', 'critical'] as const

export const NarrativeSemanticSignalsSchema = z.object({
  eventType: z.enum(NARRATIVE_EVENT_TYPES),
  conflictIntensity: z.coerce.number().int().min(0).max(100),
  tensionDelta: z.coerce.number().int().min(-10).max(15),
  actionScale: z.enum(NARRATIVE_ACTION_SCALES),
  irreversible: z.boolean(),
  impactScope: z.enum(NARRATIVE_IMPACT_SCOPES),
  narrativeRegister: z.enum(NARRATIVE_REGISTERS),
  registerReason: z.string().min(1),
  arcType: z.enum(NARRATIVE_ARC_TYPES),
  relationshipUpdates: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(NARRATIVE_RELATIONSHIP_TYPES),
    summary: z.string().min(1),
  }).strict()),
  resolvedForeshadowingIds: z.array(z.string().min(1)),
}).strict()

export const NarrativeKeyEventSchema = z.object({
  text: z.string().min(1),
  importance: z.coerce.number().min(0).max(100),
  entities: z.array(z.string().min(1)).min(1).optional(),
}).strict()

export const NarrativeForeshadowingMarkSchema = z.object({
  type: z.enum([
    'prophecy',
    'mysterious_item',
    'secret_identity',
    'unfinished_business',
    'oath',
    'mysterious_person',
    'hidden_power',
    'ancient_ruin',
    'other',
  ]),
  description: z.string().min(1),
  priority: z.coerce.number().min(1).max(10),
}).strict()

export const NarrativeCreationSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['power_system', 'technique', 'ability', 'rule', 'object', 'other']),
}).strict()

export const NarrativeDeferredCausalitySchema = z.object({
  type: z.enum(NARRATIVE_DEFERRED_CAUSAL_TYPES),
  severity: z.enum(NARRATIVE_DEFERRED_CAUSAL_SEVERITIES),
  description: z.string().min(1),
  relatedPerson: z.string().min(1).optional(),
  relatedFaction: z.string().min(1).optional(),
}).strict()

export const NarrativeDeliveredCausalDispositionSchema = z.object({
  causalId: z.string().min(1),
  status: z.enum(['resolved', 'continuing', 'not-touched']),
  reason: z.string().min(1),
  continuationDelayDays: z.number().int().min(1).optional(),
}).strict().superRefine((disposition, context) => {
  if (disposition.status === 'resolved' && disposition.continuationDelayDays !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['continuationDelayDays'],
      message: '已解决因果不得继续延期',
    })
  }
  if (disposition.status !== 'resolved' && disposition.continuationDelayDays === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['continuationDelayDays'],
      message: '继续或未触及的因果必须提供新的合法延迟天数',
    })
  }
})

export const NarrativeHistoricalEventCandidateDispositionSchema = z.object({
  candidateId: z.string().min(1),
  status: z.enum(['accepted', 'continuing', 'rejected', 'expired']),
  reason: z.string().min(1),
}).strict()

const NarrativeNonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  '文本不能为空白',
)

/**
 * 主叙事摘要是可选的轻量索引；其余结构化数据按需出现。
 * 语义核心与命运分支分别作为不可拆散的条件契约。
 */
export const NarrativeRoundMetadataSchema = z.object({
  notableEvents: z.array(z.string().min(1)).optional(),
  creations: z.array(NarrativeCreationSchema).optional(),
  foreshadowing: z.array(NarrativeForeshadowingMarkSchema).optional(),
  importance: z.enum(['HIGH', 'NORMAL', 'LOW']).optional(),
  digest: z.string().min(1).optional(),
  keyEvents: z.array(NarrativeKeyEventSchema).optional(),
  arcStatus: z.enum(['start', 'ongoing', 'end']).optional(),
  semanticSignals: NarrativeSemanticSignalsSchema.optional(),
  branch: z.boolean().optional(),
  branchTitle: NarrativeNonBlankStringSchema.optional(),
  branchOptions: z.array(NarrativeNonBlankStringSchema).min(2).max(4).optional(),
  deferredCausality: z.array(NarrativeDeferredCausalitySchema).optional(),
  deliveredCausalDispositions: z.array(NarrativeDeliveredCausalDispositionSchema).optional(),
  historicalEventCandidateDispositions: z.array(
    NarrativeHistoricalEventCandidateDispositionSchema,
  ).optional(),
}).strict().superRefine((metadata, context) => {
  const semanticCore = [metadata.importance, metadata.arcStatus, metadata.semanticSignals]
  const semanticCoreCount = semanticCore.filter((value) => value !== undefined).length
  if (semanticCoreCount > 0 && semanticCoreCount < semanticCore.length) {
    context.addIssue({
      code: 'custom',
      message: '重要程度、情节状态与语义信号必须同时提交或同时省略',
    })
  }

  const branchFields = [metadata.branch, metadata.branchTitle, metadata.branchOptions]
  const branchFieldCount = branchFields.filter((value) => value !== undefined).length
  if (branchFieldCount > 0 && branchFieldCount < branchFields.length) {
    context.addIssue({
      code: 'custom',
      message: '命运分支、分支标题与分支选项必须同时提交或同时省略',
    })
  }
  if (metadata.branch === false) {
    context.addIssue({
      code: 'custom',
      path: ['branch'],
      message: '没有命运分支时应省略字段，不输出 false',
    })
  }
  if (metadata.branch && semanticCoreCount !== semanticCore.length) {
    context.addIssue({
      code: 'custom',
      message: '命运分支必须同时提交完整语义核心',
    })
  }
  if (metadata.branch) {
    if (metadata.importance !== 'HIGH') {
      context.addIssue({ code: 'custom', path: ['importance'], message: '命运分支的重要程度必须为高' })
    }
    if (metadata.semanticSignals?.irreversible !== true) {
      context.addIssue({ code: 'custom', path: ['semanticSignals', 'irreversible'], message: '命运分支必须是不可逆变化' })
    }
    if (
      metadata.semanticSignals
      && metadata.semanticSignals.narrativeRegister !== 'fate'
      && metadata.semanticSignals.narrativeRegister !== 'legacy'
    ) {
      context.addIssue({ code: 'custom', path: ['semanticSignals', 'narrativeRegister'], message: '命运分支必须使用命运或传承语域' })
    }
  }
})

export type NarrativeSemanticSignals = z.infer<typeof NarrativeSemanticSignalsSchema>
export type NarrativeRelationshipUpdate = NarrativeSemanticSignals['relationshipUpdates'][number]
export type NarrativeDeferredCausality = z.infer<typeof NarrativeDeferredCausalitySchema>
export type NarrativeDeliveredCausalDisposition = z.infer<
  typeof NarrativeDeliveredCausalDispositionSchema
>
export type NarrativeHistoricalEventCandidateDisposition = z.infer<
  typeof NarrativeHistoricalEventCandidateDispositionSchema
>
export type NarrativeRoundMetadata = z.infer<typeof NarrativeRoundMetadataSchema>

/** 无有效 AI 语义时的可识别、中立降级；不得由正文扫描补全。 */
export function createNeutralNarrativeSemanticSignals(): NarrativeSemanticSignals {
  return {
    eventType: 'other',
    conflictIntensity: 0,
    tensionDelta: 0,
    actionScale: 'medium',
    irreversible: false,
    impactScope: 'personal',
    narrativeRegister: 'life',
    registerReason: '结构化语义缺失，使用生活层中立降级',
    arcType: 'none',
    relationshipUpdates: [],
    resolvedForeshadowingIds: [],
  }
}

export const NARRATIVE_SEMANTIC_SIGNALS_JSON_SCHEMA = {
  type: 'object',
  required: [
    'eventType',
    'conflictIntensity',
    'tensionDelta',
    'actionScale',
    'irreversible',
    'impactScope',
    'narrativeRegister',
    'registerReason',
    'arcType',
    'relationshipUpdates',
    'resolvedForeshadowingIds',
  ],
  additionalProperties: false,
  properties: {
    eventType: { type: 'string', enum: [...NARRATIVE_EVENT_TYPES] },
    conflictIntensity: { type: 'integer', minimum: 0, maximum: 100 },
    tensionDelta: { type: 'integer', minimum: -10, maximum: 15 },
    actionScale: { type: 'string', enum: [...NARRATIVE_ACTION_SCALES] },
    irreversible: { type: 'boolean' },
    impactScope: { type: 'string', enum: [...NARRATIVE_IMPACT_SCOPES] },
    narrativeRegister: { type: 'string', enum: [...NARRATIVE_REGISTERS] },
    registerReason: { type: 'string', minLength: 1 },
    arcType: { type: 'string', enum: [...NARRATIVE_ARC_TYPES] },
    relationshipUpdates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type', 'summary'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: [...NARRATIVE_RELATIONSHIP_TYPES] },
          summary: { type: 'string', minLength: 1 },
        },
      },
    },
    resolvedForeshadowingIds: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
} as const
