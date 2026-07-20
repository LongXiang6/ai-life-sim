/**
 * @module player-feedback-store.ts
 * @description 将完整玩家反馈诊断包安全写入生产诊断目录
 * @mod core
 */

import 'server-only'

import { randomUUID } from 'crypto'

import type { PlayerFeedbackEnvelope } from './feedback-contract'
import {
  appendSourceJsonLine,
  appendServerJsonLine,
  type ServerRequestSource,
  writeServerLogFile,
} from './server-log-store'
import { redactSensitiveData } from './redact-sensitive-data'

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
  const date = new Date(receivedAt).toISOString().slice(0, 10)
  const feedbackId = createFeedbackId(receivedAt)
  const redactedEnvelope = redactSensitiveData(envelope) as PlayerFeedbackEnvelope
  const storyChars = redactedEnvelope.diagnostics.recentStory.reduce((sum, entry) => {
    const text = typeof entry.text === 'string' ? entry.text : ''
    return sum + text.length
  }, 0)
  const storedRecord = {
    feedbackId,
    receivedAt,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    ...redactedEnvelope,
  }
  const indexRecord = {
    feedbackId,
    receivedAt,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    category: redactedEnvelope.category,
    subject: redactedEnvelope.subject,
    page: redactedEnvelope.diagnostics.app.page,
    appVersion: redactedEnvelope.diagnostics.app.version,
    diagnosticSessionId: redactedEnvelope.diagnostics.app.diagnosticSessionId,
    recentStoryEntries: redactedEnvelope.diagnostics.recentStory.length,
    recentStoryChars: storyChars,
    recentClientLogEntries: redactedEnvelope.diagnostics.recentClientLogs.length,
  }

  const [submissionWritten, indexWritten, sourceIndexWritten] = await Promise.all([
    writeServerLogFile(`feedback/submissions/${date}/${feedbackId}.json`, storedRecord),
    appendServerJsonLine(`feedback/feedback-${date}.jsonl`, indexRecord),
    appendSourceJsonLine(source, `feedback-${date}.jsonl`, indexRecord),
  ])

  if (!submissionWritten || !indexWritten || !sourceIndexWritten) return null
  return { feedbackId, receivedAt }
}
