/**
 * Purpose: Project the public, read-only player-feedback list from server logs.
 * Owner: core:logger
 * Responsibility: Feedback content/status projection only; sensitive diagnostics stay server-side.
 */

import 'server-only'

import {
  FeedbackCategorySchema,
  FeedbackStatusSchema,
  type FeedbackStatus,
  type PlayerFeedbackListResponse,
} from './feedback-contract'
import { queryServerLogEntries } from './server-log-store'

interface QueryOptions {
  limit?: number
  offset?: number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readTimestamp(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function resolveStatus(feedbackId: string): { status: FeedbackStatus; statusUpdatedAt: number | null } {
  const statusRows = queryServerLogEntries({ feedbackId, entryType: 'feedback-status', limit: 500 }).entries
  const latest = statusRows
    .map((row) => ({ row, payload: asRecord(row.payload) }))
    .filter(({ payload }) => FeedbackStatusSchema.safeParse(payload?.status).success)
    .sort((left, right) => right.row.createdAt - left.row.createdAt)[0]
  if (!latest) return { status: 'new', statusUpdatedAt: null }
  return {
    status: FeedbackStatusSchema.parse(latest.payload?.status),
    statusUpdatedAt: readTimestamp(latest.payload, 'timestamp') ?? latest.row.createdAt,
  }
}

export function queryPlayerFeedback(options: QueryOptions = {}): PlayerFeedbackListResponse {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100)
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0)
  const page = queryServerLogEntries({ entryType: 'feedback', limit, offset })
  const items = page.entries.flatMap((row) => {
    const payload = asRecord(row.payload)
    const category = FeedbackCategorySchema.safeParse(row.category ?? payload?.category)
    if (!category.success || !row.feedbackId) return []
    const message = readString(payload, 'message') ?? row.message ?? ''
    if (!message.trim()) return []
    const status = resolveStatus(row.feedbackId)
    return [{
      feedbackId: row.feedbackId,
      category: category.data,
      subject: readString(payload, 'subject') ?? row.message ?? '玩家反馈',
      message,
      submittedAt: readTimestamp(payload, 'submittedAt') ?? row.clientTimestamp ?? row.createdAt,
      ...status,
    }]
  })
  return {
    items,
    total: page.total,
    limit,
    offset,
    hasMore: offset + page.entries.length < page.total,
  }
}
