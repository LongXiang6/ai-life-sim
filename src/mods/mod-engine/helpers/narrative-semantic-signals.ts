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
export const NARRATIVE_INTENT_FEASIBILITIES = ['executable', 'conditional', 'blocked', 'impossible'] as const
export const NARRATIVE_INTENT_EXECUTION_MODES = ['immediate', 'progressive', 'deferred'] as const
export const NARRATIVE_INTENT_STATUSES = ['progressing', 'blocked', 'succeeded', 'partially_succeeded', 'failed'] as const
export const NARRATIVE_INTENT_RISK_LEVELS = ['low', 'medium', 'high', 'extreme'] as const
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
  entities: z.array(z.string().min(1)),
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

export const NarrativeIntentResolutionSchema = z.object({
  intentId: z.string().min(1),
  feasibility: z.enum(NARRATIVE_INTENT_FEASIBILITIES),
  executionMode: z.enum(NARRATIVE_INTENT_EXECUTION_MODES),
  status: z.enum(NARRATIVE_INTENT_STATUSES),
  riskLevel: z.enum(NARRATIVE_INTENT_RISK_LEVELS),
  progress: z.coerce.number().min(0).max(100),
  blockers: z.array(z.string().min(1)),
  prerequisites: z.array(z.string().min(1)),
  costs: z.array(z.string().min(1)),
  timeHorizon: z.string().min(1),
  reason: z.string().min(1),
  nextStep: z.string().min(1).optional(),
}).strict()

export const NarrativeDeferredCausalitySchema = z.object({
  type: z.enum(NARRATIVE_DEFERRED_CAUSAL_TYPES),
  severity: z.enum(NARRATIVE_DEFERRED_CAUSAL_SEVERITIES),
  description: z.string().min(1),
  relatedPerson: z.string().min(1).optional(),
  relatedFaction: z.string().min(1).optional(),
}).strict()

/** 主叙事 AI 的完整语义包。任一字段非法时，消费方不得零散采信其余字段。 */
export const NarrativeRoundMetadataSchema = z.object({
  notableEvents: z.array(z.string().min(1)).optional(),
  creations: z.array(NarrativeCreationSchema).optional(),
  foreshadowing: z.array(NarrativeForeshadowingMarkSchema).optional(),
  importance: z.enum(['HIGH', 'NORMAL', 'LOW']),
  digest: z.string().min(1),
  keyEvents: z.array(NarrativeKeyEventSchema),
  arcStatus: z.enum(['start', 'ongoing', 'end']),
  semanticSignals: NarrativeSemanticSignalsSchema,
  branch: z.boolean().optional(),
  branchTitle: z.string().min(1).optional(),
  branchOptions: z.array(z.string().min(1)).min(2).max(4).optional(),
  intentResolution: NarrativeIntentResolutionSchema.optional(),
  deferredCausality: z.array(NarrativeDeferredCausalitySchema).optional(),
})

/** 标签信封 META 的完整运行时 Schema；预生成与主叙事质量门禁共用。 */
export const NarrativeResponseSchema = NarrativeRoundMetadataSchema.extend({
  changes: z.array(z.object({
    id: z.string(),
    description: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }).strict()),
}).strict()

/**
 * 仅做协议形状兼容，不判断正文语义或改写字段值。
 *
 * 某些模型会把约定的
 *   { id, description, changes: { physiqueDelta: 1 } }
 * 误写成
 *   { id, description, physiqueDelta: 1 }
 * 这里把同级字段机械收回 changes 对象，随后仍交给同一份严格 Schema
 * 和字段白名单校验；无法明确归类的内容不做猜测，继续让 Schema 拒绝。
 */
export function normalizeNarrativeResponseMetadata(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw

  const record = raw as Record<string, unknown>
  let normalized = false

  let changes = record.changes
  if (Array.isArray(record.changes)) {
    changes = record.changes.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry

      const item = entry as Record<string, unknown>
      if (item.changes && typeof item.changes === 'object' && !Array.isArray(item.changes)) {
        return item
      }

      const { id, description, ...flatChanges } = item
      if (Object.keys(flatChanges).length === 0) return item

      normalized = true
      return { id, description, changes: flatChanges }
    })
  }

  // 结构兼容：模型有时把约定的字符串选项写成
  //   {title:"...", description:"..."}
  // 对象。分支在通过 Schema 后仍以字符串数组作为唯一运行时契约；这里只做
  // 协议层的机械拼接，不从正文推断或创造分支语义。
  if (Array.isArray(record.branchOptions)) {
    const branchOptions = record.branchOptions.map((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return option

      const item = option as Record<string, unknown>
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const description = typeof item.description === 'string' ? item.description.trim() : ''
      if (!title && !description) return option

      normalized = true
      if (title && description) return `${title}：${description}`
      return title || description
    })

    return normalized ? { ...record, changes, branchOptions } : raw
  }

  return normalized ? { ...record, changes } : raw
}

export type NarrativeSemanticSignals = z.infer<typeof NarrativeSemanticSignalsSchema>
export type NarrativeRelationshipUpdate = NarrativeSemanticSignals['relationshipUpdates'][number]
export type NarrativeIntentResolution = z.infer<typeof NarrativeIntentResolutionSchema>
export type NarrativeDeferredCausality = z.infer<typeof NarrativeDeferredCausalitySchema>
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
