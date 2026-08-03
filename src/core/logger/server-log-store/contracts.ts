/**
 * Purpose: Define stable inputs, records, queries, and database rows for server logging.
 * Owner: core:logger
 * Responsibility: Type contracts only; no database access or lifecycle behavior.
 */

import type { ServerRequestSource } from '../server-log-safety'

export interface ServerLogEntryInput {
  id?: string
  createdAt?: number
  clientTimestamp?: number
  entryType: string
  category?: string
  level?: string
  module?: string
  message?: string
  event?: string
  requestId?: string
  source?: ServerRequestSource
  feedbackId?: string
  round?: number
  age?: number
  era?: string
  provider?: string
  model?: string
  callKind?: string
  strategy?: string
  status?: number
  prompt?: string
  response?: string
  error?: string
  stack?: string
  meta?: unknown
  payload?: unknown
}

export interface ServerLogRecord {
  id: string
  createdAt: number
  clientTimestamp: number | null
  entryType: string
  category: string | null
  level: string | null
  module: string | null
  message: string | null
  event: string | null
  requestId: string | null
  sourceIp: string
  sourceId: string
  diagnosticCode: string | null
  deviceProvenanceId: string | null
  isRegistered: boolean
  accountId: string | null
  username: string | null
  feedbackId: string | null
  round: number | null
  age: number | null
  era: string | null
  provider: string | null
  model: string | null
  callKind: string | null
  strategy: string | null
  status: number | null
  prompt: string | null
  response: string | null
  error: string | null
  stack: string | null
  meta: unknown
  payload: unknown
}

export interface ServerLogQuery {
  entryType?: string
  category?: string
  level?: string
  accountId?: string
  deviceProvenanceId?: string
  requestId?: string
  feedbackId?: string
  limit?: number
  offset?: number
}

export interface ServerLogRow {
  id: string
  created_at: number
  client_timestamp: number | null
  entry_type: string
  category: string | null
  level: string | null
  module: string | null
  message: string | null
  event: string | null
  request_id: string | null
  source_ip: string
  source_id: string
  diagnostic_code: string | null
  device_provenance_id: string | null
  is_registered: number
  account_id: string | null
  username: string | null
  feedback_id: string | null
  round: number | null
  age: number | null
  era: string | null
  provider: string | null
  model: string | null
  call_kind: string | null
  strategy: string | null
  status: number | null
  prompt: string | null
  response: string | null
  error: string | null
  stack: string | null
  meta_json: string | null
  payload_json: string | null
}
