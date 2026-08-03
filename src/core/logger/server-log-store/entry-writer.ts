/**
 * Purpose: Append one plaintext server-log record to the hot SQLite database.
 * Owner: core:logger
 * Responsibility: Single-row writes and cleanup scheduling only.
 */

import { randomUUID } from 'node:crypto'

import type { ServerLogEntryInput } from './contracts'
import { getServerLogDatabase } from './database'
import { scheduleServerLogCleanup } from './retention-cleanup'
import { plaintextJson } from './serialization'

export async function appendServerLogEntry(input: ServerLogEntryInput): Promise<boolean> {
  try {
    const source = input.source
    getServerLogDatabase().prepare(`
      INSERT INTO log_entries(
        id, created_at, client_timestamp, entry_type, category, level, module,
        message, event, request_id, source_ip, source_id, diagnostic_code, device_provenance_id,
        is_registered, account_id, username, feedback_id, round, age, era,
        provider, model, call_kind, strategy, status, prompt, response, error,
        stack, meta_json, payload_json
      ) VALUES (
        @id, @createdAt, @clientTimestamp, @entryType, @category, @level, @module,
        @message, @event, @requestId, @sourceIp, @sourceId, @diagnosticCode, @deviceProvenanceId,
        @isRegistered, @accountId, @username, @feedbackId, @round, @age, @era,
        @provider, @model, @callKind, @strategy, @status, @prompt, @response,
        @error, @stack, @metaJson, @payloadJson
      )
    `).run({
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? Date.now(),
      clientTimestamp: input.clientTimestamp ?? null,
      entryType: input.entryType,
      category: input.category ?? null,
      level: input.level ?? null,
      module: input.module ?? null,
      message: input.message ?? null,
      event: input.event ?? null,
      requestId: input.requestId ?? null,
      sourceIp: source?.ip ?? 'unknown',
      sourceId: source?.sourceId ?? 'ip-unknown',
      diagnosticCode: source?.diagnosticCode ?? null,
      deviceProvenanceId: source?.deviceProvenanceId ?? null,
      isRegistered: source?.isRegistered ? 1 : 0,
      accountId: source?.accountId ?? null,
      username: source?.username ?? null,
      feedbackId: input.feedbackId ?? null,
      round: input.round ?? null,
      age: input.age ?? null,
      era: input.era ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      callKind: input.callKind ?? null,
      strategy: input.strategy ?? null,
      status: input.status ?? null,
      prompt: input.prompt ?? null,
      response: input.response ?? null,
      error: input.error ?? null,
      stack: input.stack ?? null,
      metaJson: plaintextJson(input.meta),
      payloadJson: plaintextJson(input.payload),
    })
    scheduleServerLogCleanup()
    return true
  } catch (error) {
    console.error('[server-log-store] SQLite 明文日志写入失败', error)
    return false
  }
}
