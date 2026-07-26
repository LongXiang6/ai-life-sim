/**
 * @module player-feedback-store.ts
 * @description 将完整玩家反馈与诊断数据写入明文日志数据库
 * @mod core
 */

import 'server-only'

import { randomUUID } from 'node:crypto'

import type { PlayerFeedbackEnvelope } from './feedback-contract'
import {
  appendServerLogEntry,
  type ServerRequestSource,
} from './server-log-store'

export interface StoredPlayerFeedback {
  feedbackId: string
  receivedAt: number
}

function createFeedbackId(receivedAt: number): string {
  const date = new Date(receivedAt).toISOString().slice(0, 10).replaceAll('-', '')
  return `FB-${date}-${randomUUID().slice(0, 8).toUpperCase()}`
}

export async function storePlayerFeedback(
  envelope: PlayerFeedbackEnvelope,
  source: ServerRequestSource,
): Promise<StoredPlayerFeedback | null> {
  const receivedAt = Date.now()
  const feedbackId = createFeedbackId(receivedAt)
  const written = await appendServerLogEntry({
    createdAt: receivedAt,
    clientTimestamp: envelope.submittedAt,
    entryType: 'feedback',
    category: envelope.category,
    level: 'info',
    module: 'player-feedback',
    message: envelope.subject,
    feedbackId,
    source,
    payload: {
      feedbackId,
      receivedAt,
      sourceIp: source.ip,
      sourceId: source.sourceId,
      diagnosticCode: source.diagnosticCode,
      deviceProvenanceId: source.deviceProvenanceId,
      isRegistered: source.isRegistered,
      accountId: source.accountId,
      username: source.username,
      ...envelope,
    },
  })
  return written ? { feedbackId, receivedAt } : null
}
