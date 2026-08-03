/**
 * Purpose: Provide read-only database, pagination, safe-path, and file helpers for the data viewer.
 * Owner: operations
 * Responsibility: Shared infrastructure only; query modules own data interpretation and HTTP routing is separate.
 */

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import {
  logDatabasesExist,
  resolveLogArchiveDatabasePath,
  resolveLogDatabasePath,
  withReadonlyLogQueryDatabase,
} from '../lib/log-databases.mjs'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
export const MEMORY_TABLES = {
  summaries: { table: 'summary_nodes', order: 'level ASC, start_round ASC, summary_id ASC' },
  archives: { table: 'l1_archives', order: 'start_round ASC, summary_id ASC' },
  events: { table: 'memory_events', order: 'permanent DESC, active DESC, current_weight DESC, occurrence_time ASC, event_id ASC' },
  links: { table: 'summary_event_links', order: 'summary_id ASC, event_id ASC' },
}

export { logDatabasesExist, resolveLogArchiveDatabasePath, resolveLogDatabasePath }

export function openReadonly(databasePath) {
  if (!fs.existsSync(databasePath)) return null
  return new Database(databasePath, { readonly: true, fileMustExist: true })
}

export function withReadonly(databasePath, fallback, read) {
  const database = openReadonly(databasePath)
  if (!database) return fallback
  try {
    database.pragma('query_only = ON')
    database.pragma('busy_timeout = 5000')
    return read(database)
  } finally {
    database.close()
  }
}

export function withReadonlyLogs(databasePath, fallback, read) {
  if (!logDatabasesExist(databasePath)) return fallback
  return withReadonlyLogQueryDatabase(databasePath, read)
}

export function tableExists(database, table) {
  return Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?
    UNION ALL
    SELECT 1 FROM sqlite_temp_master WHERE type IN ('table', 'view') AND name = ?
    LIMIT 1
  `).get(table, table))
}

export function columnExists(database, table, column) {
  if (!tableExists(database, table)) return false
  return database.pragma(`table_info("${table.replaceAll('"', '""')}")`)
    .some((candidate) => candidate.name === column)
}

export function parsePlaintextJson(value) {
  if (value === null || value === undefined || value === '') return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

export function pageInput(searchParams) {
  const page = positiveInteger(searchParams.get('page'), 1)
  const pageSize = positiveInteger(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function listFiles(root, predicate) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => predicate(entry))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function assertSafeSegment(value, label) {
  const normalized = String(value ?? '').trim()
  if (!/^[a-zA-Z0-9._-]+$/u.test(normalized)) throw new Error(`${label} 不合法`)
  return normalized
}

export function pathInside(root, ...segments) {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...segments)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('目标路径超出数据目录')
  }
  return target
}
