/**
 * Purpose: Define the Chinese AI Schemas used by the approved narrative calls.
 * Owner: mod-engine
 * Responsibility: Validate declared AI fields without owning simulation state.
 */

import { z } from 'zod'
import { parseAIJSON } from '@/core/ai-service/parse-ai-json'
import type { CharacterDeathCauseKind } from '@/foundation'

const NarrativeAINonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  '文本不能为空白',
)

export const NarrativeAIBranchSchema = z.object({
  选项: z.array(NarrativeAINonBlankStringSchema).min(2).max(4),
})

export const NarrativeAIEndingSchema = z.object({
  评语: NarrativeAINonBlankStringSchema.refine(
    (value) => Array.from(value.trim()).length === 4,
    '评语必须恰好四个字符',
  ),
  总结: NarrativeAINonBlankStringSchema,
})

export const NarrativeAICharacterDeathSchema = z.union([
  z.literal(false),
  z.object({
    死因类型: z.enum(['story', 'condition', 'trauma', 'life-ending']),
    死因: NarrativeAINonBlankStringSchema,
  }),
])

export const NarrativeAITalentEvidenceHintSchema = z.object({
  引用: z.string().trim().min(1),
  可观察结果: NarrativeAINonBlankStringSchema,
})

const NarrativeAIAttributeDeltaSchema = z.number().int().min(-3).max(3).refine(
  (value) => value !== 0,
  '属性变化不能为0',
)

export const NarrativeAIAttributeChangesSchema = z.object({
  心智: NarrativeAIAttributeDeltaSchema.optional(),
  体魄: NarrativeAIAttributeDeltaSchema.optional(),
  魅力: NarrativeAIAttributeDeltaSchema.optional(),
  财富: NarrativeAIAttributeDeltaSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  '属性变化对象至少需要一个非零属性变化',
)

const NarrativeAIReportedAttributesSchema = z.object({
  心智: z.number().int().optional(),
  体魄: z.number().int().optional(),
  魅力: z.number().int().optional(),
  财富: z.number().int().optional(),
})

export const NarrativeAIStoryResultSchema = z.object({
  事件卡消费: z.array(NarrativeAINonBlankStringSchema).optional(),
  天赋表现线索: z.array(NarrativeAITalentEvidenceHintSchema).optional(),
  正文: NarrativeAINonBlankStringSchema,
  属性: NarrativeAIReportedAttributesSchema,
  角色死亡: NarrativeAICharacterDeathSchema,
  命运分支: z.union([
    z.literal(false),
    z.array(NarrativeAINonBlankStringSchema).min(2).max(4),
  ]),
  结局: z.union([
    z.literal(false),
    NarrativeAINonBlankStringSchema.refine(
      (value) => Array.from(value.trim()).length === 4,
      '结局评语必须恰好四个字符',
    ),
  ]),
}).superRefine((data, context) => {
  if (data.命运分支 !== false && data.结局 !== false) {
    context.addIssue({ code: 'custom', message: '命运分支与结局必须互斥' })
  }
  if (data.角色死亡 !== false && data.命运分支 !== false) {
    context.addIssue({ code: 'custom', message: '角色死亡不能同时返回命运分支' })
  }
  if (data.角色死亡 !== false && data.结局 === false) {
    context.addIssue({ code: 'custom', message: '角色死亡必须同时返回结局' })
  }
})

const NarrativeAITalentAttributeBonusSchema = z.object({
  心智: z.number().int().optional(),
  体魄: z.number().int().optional(),
  魅力: z.number().int().optional(),
  财富: z.number().int().optional(),
  气运: z.number().int().optional(),
})

export const NarrativeAITalentGrowthDataSchema = z.object({
  成长判定: z.discriminatedUnion('需要成长', [
    z.object({ 需要成长: z.literal(false) }),
    z.object({
      需要成长: z.literal(true),
      命格血脉编号: z.string().trim().min(1),
      成长依据: z.string().trim().min(1).max(300),
      依据窗口编号: z.array(z.string().trim().min(1)).min(1),
      下一阶方向: z.array(z.object({
        路线: z.enum(['深度强化', '广度强化', '转变强化']),
        名称: z.string().trim().min(2).max(6),
        详细介绍: z.string().trim().min(1).max(300),
        效果描述: z.string().trim().min(1).max(300),
        属性加成: NarrativeAITalentAttributeBonusSchema,
      })),
    }),
  ]),
})

export const NarrativeAIStoryContinuityMemorySchema = z.array(z.object({
  来源回合: z.number().int().positive().optional(),
  时间: z.string().trim().min(1),
  剧情: z.string().trim().min(1),
  权重: z.number().int().min(2).max(10),
}))

export const NarrativeAIStoryContinuityFutureEventsSchema = z.array(
  z.string().trim().min(1),
)

export const NarrativeAIStoryContinuityEnvelopeSchema = z.object({
  本轮剧情: z.unknown(),
  未来事件: z.unknown(),
})

export const NarrativeAIStoryContinuityDataSchema = z.object({
  本轮剧情: NarrativeAIStoryContinuityMemorySchema,
  未来事件: NarrativeAIStoryContinuityFutureEventsSchema,
})

export type NarrativeAIBranch = z.infer<typeof NarrativeAIBranchSchema>
export type NarrativeAIEnding = z.infer<typeof NarrativeAIEndingSchema>
export type NarrativeAICharacterDeath = Exclude<
  z.infer<typeof NarrativeAICharacterDeathSchema>,
  false
> & { 死因类型: CharacterDeathCauseKind }
export type NarrativeAITalentEvidenceHint = z.infer<typeof NarrativeAITalentEvidenceHintSchema>
export type NarrativeAIAttributeChanges = z.infer<typeof NarrativeAIAttributeChangesSchema>
export type NarrativeAIStoryResult = z.infer<typeof NarrativeAIStoryResultSchema>
export type NarrativeAITalentGrowthData = z.infer<typeof NarrativeAITalentGrowthDataSchema>
export type NarrativeAIStoryContinuityData = z.infer<typeof NarrativeAIStoryContinuityDataSchema>

/** Read one JSON candidate; field ownership remains with each post-call normalizer. */
export function parseNarrativeAIJson(source: string): unknown {
  const parsed = parseAIJSON(source)
  if (parsed === null) throw new Error('协议段缺少唯一、完整且可解析的 JSON')
  return parsed
}
