/**
 * Purpose: Serialize arbitrary log payloads and map SQLite rows to public records.
 * Owner: core:logger
 * Responsibility: Plaintext JSON conversion and row projection only.
 */

import type { ServerLogRecord, ServerLogRow } from './contracts'

export function plaintextJson(value: unknown): string | null {
  if (value === undefined) return null
  const ancestors: object[] = []
  return JSON.stringify(value, function (_key, child: unknown) {
    if (typeof child === 'bigint') return child.toString()
    if (child instanceof Error) {
      return {
        name: child.name,
        message: child.message,
        stack: child.stack,
        ...Object.fromEntries(Object.entries(child)),
      }
    }
    if (!child || typeof child !== 'object') return child
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
    if (ancestors.includes(child)) return '[Circular]'
    ancestors.push(child)
    return child
  }, 2) ?? null
}

function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function mapServerLogRow(row: ServerLogRow): ServerLogRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    clientTimestamp: row.client_timestamp,
    entryType: row.entry_type,
    category: row.category,
    level: row.level,
    module: row.module,
    message: row.message,
    event: row.event,
    requestId: row.request_id,
    sourceIp: row.source_ip,
    sourceId: row.source_id,
    diagnosticCode: row.diagnostic_code,
    deviceProvenanceId: row.device_provenance_id,
    isRegistered: row.is_registered === 1,
    accountId: row.account_id,
    username: row.username,
    feedbackId: row.feedback_id,
    round: row.round,
    age: row.age,
    era: row.era,
    provider: row.provider,
    model: row.model,
    callKind: row.call_kind,
    strategy: row.strategy,
    status: row.status,
    prompt: row.prompt,
    response: row.response,
    error: row.error,
    stack: row.stack,
    meta: parseJson(row.meta_json),
    payload: parseJson(row.payload_json),
  }
}
