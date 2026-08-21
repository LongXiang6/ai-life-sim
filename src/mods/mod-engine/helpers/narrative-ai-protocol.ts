/**
 * Purpose: Define the Chinese AI Schemas used by the approved 01/02/03 narrative calls.
 * Owner: mod-engine
 * Responsibility: Validate declared AI fields without owning simulation state.
 */

import { z } from 'zod'
import { parseAIJSON } from '@/core/ai-service/parse-ai-json'

const NarrativeAINonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  '文本不能为空白',
)

export const NarrativeAIBranchSchema = z.object({
  选项: z.array(NarrativeAINonBlankStringSchema).min(2).max(4),
})

export const NarrativeAIEndingSchema = z.object({
  四字评语: NarrativeAINonBlankStringSchema.refine(
    (value) => Array.from(value.trim()).length === 4,
    '四字评语必须恰好四个字符',
  ),
})

export const NarrativeAIStoryResultSchema = z.object({
  正文: NarrativeAINonBlankStringSchema,
  分支: NarrativeAIBranchSchema.nullable(),
  结局: NarrativeAIEndingSchema.nullable(),
}).superRefine((data, context) => {
  if (data.分支 !== null && data.结局 !== null) {
    context.addIssue({ code: 'custom', message: '分支与结局必须互斥' })
  }
})

const NarrativeAITalentAttributeBonusSchema = z.object({
  体魄: z.number().int().optional(),
  心智: z.number().int().optional(),
  悟性: z.number().int().optional(),
  魅力: z.number().int().optional(),
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
  时间: z.string().trim().min(1).max(120),
  事实: z.string().trim().min(1).max(1000),
  权重: z.number().int().min(2).max(10),
}))

export const NarrativeAIStoryContinuityFutureEventsSchema = z.array(
  z.string().trim().min(1).max(1000),
)

export const NarrativeAIStoryContinuityEnvelopeSchema = z.object({
  本轮记忆: z.unknown(),
  未来事件: z.unknown(),
})

export const NarrativeAIStoryContinuityDataSchema = z.object({
  本轮记忆: NarrativeAIStoryContinuityMemorySchema,
  未来事件: NarrativeAIStoryContinuityFutureEventsSchema,
})

export type NarrativeAIBranch = z.infer<typeof NarrativeAIBranchSchema>
export type NarrativeAIEnding = z.infer<typeof NarrativeAIEndingSchema>
export type NarrativeAIStoryResult = z.infer<typeof NarrativeAIStoryResultSchema>
export type NarrativeAITalentGrowthData = z.infer<typeof NarrativeAITalentGrowthDataSchema>
export type NarrativeAIStoryContinuityData = z.infer<typeof NarrativeAIStoryContinuityDataSchema>

/** Read one JSON candidate; field ownership remains with each post-call normalizer. */
export function parseNarrativeAIJson(source: string): unknown {
  const parsed = parseAIJSON(source)
  if (parsed === null) throw new Error('协议段缺少唯一、完整且可解析的 JSON')
  return parsed
}
