/**
 * Purpose: Query a deterministic combined view of hot and archived server logs.
 * Owner: core:logger
 * Responsibility: Filter, page, conflict-check, and project read results only.
 */

import fs from 'node:fs'

import {
  assertMatchingLogEntrySchemas,
  assertNoLogEntryConflict,
  quoteSqliteIdentifier,
} from './archive-sql'
import type { ServerLogQuery, ServerLogRecord, ServerLogRow } from './contracts'
import { getServerLogArchiveDatabasePath, getServerLogDatabase } from './database'
import { mapServerLogRow } from './serialization'

function buildQueryWhere(query: ServerLogQuery): { clause: string; values: unknown[] } {
  const clauses: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: string | undefined) => {
    if (value === undefined) return
    clauses.push(`${column} = ?`)
    values.push(value)
  }
  add('entry_type', query.entryType)
  add('category', query.category)
  add('level', query.level)
  add('account_id', query.accountId)
  add('device_provenance_id', query.deviceProvenanceId)
  add('request_id', query.requestId)
  add('feedback_id', query.feedbackId)
  return { clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', values }
}

export function queryServerLogEntries(query: ServerLogQuery = {}): {
  entries: ServerLogRecord[]
  total: number
} {
  const database = getServerLogDatabase()
  const { clause, values } = buildQueryWhere(query)
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 100), 1), 500)
  const offset = Math.max(Math.trunc(query.offset ?? 0), 0)
  const archivePath = getServerLogArchiveDatabasePath()
  if (!fs.existsSync(archivePath)) {
    const rows = database.prepare(`
      SELECT * FROM log_entries ${clause}
      ORDER BY created_at DESC, rowid DESC, id ASC
      LIMIT ? OFFSET ?
    `).all(...values, limit, offset) as ServerLogRow[]
    const count = database.prepare(`SELECT COUNT(*) AS count FROM log_entries ${clause}`)
      .get(...values) as { count: number } | undefined
    return { entries: rows.map(mapServerLogRow), total: Number(count?.count ?? 0) }
  }

  database.prepare('ATTACH DATABASE ? AS archive_logs').run(archivePath)
  try {
    const columns = assertMatchingLogEntrySchemas(database)
    assertNoLogEntryConflict(database, columns)
    const columnList = columns.map(quoteSqliteIdentifier).join(', ')
    const hotProjection = columns.map((column) => (
      `hot_entry.${quoteSqliteIdentifier(column)} AS ${quoteSqliteIdentifier(column)}`
    )).join(', ')
    const archiveProjection = columns.map((column) => (
      `archive_entry.${quoteSqliteIdentifier(column)} AS ${quoteSqliteIdentifier(column)}`
    )).join(', ')
    const combinedLogs = `
      WITH combined_logs AS (
        SELECT ${hotProjection}, hot_entry.rowid AS __log_rowid, 0 AS __log_source_priority
        FROM main.log_entries AS hot_entry
        UNION ALL
        SELECT ${archiveProjection}, archive_entry.rowid AS __log_rowid, 1 AS __log_source_priority
        FROM archive_logs.log_entries AS archive_entry
        WHERE NOT EXISTS (
          SELECT 1 FROM main.log_entries AS hot_entry WHERE hot_entry.id = archive_entry.id
        )
      )
    `
    const rows = database.prepare(`
      ${combinedLogs}
      SELECT ${columnList} FROM combined_logs ${clause}
      ORDER BY created_at DESC, __log_source_priority ASC, __log_rowid DESC, id ASC
      LIMIT ? OFFSET ?
    `).all(...values, limit, offset) as ServerLogRow[]
    const count = database.prepare(`
      ${combinedLogs}
      SELECT COUNT(*) AS count FROM combined_logs ${clause}
    `).get(...values) as { count: number } | undefined
    return { entries: rows.map(mapServerLogRow), total: Number(count?.count ?? 0) }
  } finally {
    database.exec('DETACH DATABASE archive_logs')
  }
}
