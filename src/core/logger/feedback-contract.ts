/**
 * @module feedback-contract.ts
 * @description 玩家反馈与诊断包的公开请求契约
 * @mod core
 */

import { z } from 'zod'

const JsonObjectSchema = z.record(z.string(), z.unknown())

export const FeedbackCategorySchema = z.enum(['bug', 'suggestion', 'experience', 'other'])

export const PlayerFeedbackEnvelopeSchema = z.object({
  category: FeedbackCategorySchema,
  subject: z.string().trim().min(1),
  message: z.string().trim().min(1),
  submittedAt: z.number().finite(),
  consent: z.literal(true),
  diagnostics: z.object({
    app: JsonObjectSchema,
    device: JsonObjectSchema,
    globalConfig: JsonObjectSchema,
    gameState: JsonObjectSchema,
    recentStory: z.array(JsonObjectSchema),
    recentClientLogs: z.array(JsonObjectSchema),
  }),
})

export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>
export type PlayerFeedbackEnvelope = z.infer<typeof PlayerFeedbackEnvelopeSchema>
