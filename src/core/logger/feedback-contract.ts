/**
 * @module feedback-contract.ts
 * @description 玩家反馈与诊断包的公开请求契约
 * @mod core
 */

import { z } from 'zod'

const JsonObjectSchema = z.record(z.string(), z.unknown())

export const FeedbackCategorySchema = z.enum(['bug', 'suggestion', 'experience', 'other'])
export const FeedbackStatusSchema = z.enum(['new', 'in_progress', 'resolved', 'rejected', 'duplicate', 'reopened'])

export const PlayerFeedbackEnvelopeSchema = z.object({
  category: FeedbackCategorySchema,
  subject: z.string().trim().min(1),
  message: z.string().trim().min(1),
  submittedAt: z.number().finite(),
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
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>
export type PlayerFeedbackEnvelope = z.infer<typeof PlayerFeedbackEnvelopeSchema>

export interface PlayerFeedbackListItem {
  feedbackId: string
  category: FeedbackCategory
  subject: string
  message: string
  submittedAt: number
  status: FeedbackStatus
  statusUpdatedAt: number | null
}

export interface PlayerFeedbackListResponse {
  items: PlayerFeedbackListItem[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
