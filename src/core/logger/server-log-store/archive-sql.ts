/**
 * Purpose: Provide shared SQL invariants for hot and archived server-log rows.
 * Owner: core:logger
 * Responsibility: Schema comparison and row-conflict detection only.
 */

import type Database from 'better-sqlite3'

export function quoteSqliteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function getLogEntryColumns(database: Database.Database, schema = 'main'): string[] {
  return (database.pragma(`${schema}.table_info(log_entries)`) as Array<{ name: string }>)
    .map((column) => column.name)
}

export function assertMatchingLogEntrySchemas(database: Database.Database): string[] {
  const hotColumns = getLogEntryColumns(database)
  const archiveColumns = getLogEntryColumns(database, 'archive_logs')
  const archiveColumnSet = new Set(archiveColumns)
  if (
    hotColumns.length !== archiveColumns.length
    || hotColumns.some((column) => !archiveColumnSet.has(column))
  ) {
    throw new Error('日志归档 Schema 与热库不一致')
  }
  return hotColumns
}

function logEntryEqualitySql(columns: string[]): string {
  return columns.map((column) => (
    `hot_entry.${quoteSqliteIdentifier(column)} IS archive_entry.${quoteSqliteIdentifier(column)}`
  )).join(' AND ')
}

function findLogEntryConflict(
  database: Database.Database,
  columns: string[],
  where = '',
  values: unknown[] = [],
): string | undefined {
  const scope = where ? `${where} AND ` : ''
  const row = database.prepare(`
    SELECT hot_entry.id AS id
    FROM main.log_entries AS hot_entry
    INNER JOIN archive_logs.log_entries AS archive_entry
      ON archive_entry.id = hot_entry.id
    WHERE ${scope}NOT (${logEntryEqualitySql(columns)})
    ORDER BY hot_entry.id ASC
    LIMIT 1
  `).get(...values) as { id: string } | undefined
  return row?.id
}

export function findUnarchivedLogEntry(
  database: Database.Database,
  columns: string[],
  cutoff: number,
): string | undefined {
  const row = database.prepare(`
    SELECT hot_entry.id AS id
    FROM main.log_entries AS hot_entry
    LEFT JOIN archive_logs.log_entries AS archive_entry
      ON archive_entry.id = hot_entry.id
    WHERE hot_entry.created_at < ?
      AND (archive_entry.id IS NULL OR NOT (${logEntryEqualitySql(columns)}))
    ORDER BY hot_entry.id ASC
    LIMIT 1
  `).get(cutoff) as { id: string } | undefined
  return row?.id
}

export function assertNoLogEntryConflict(
  database: Database.Database,
  columns: string[],
  where = '',
  values: unknown[] = [],
): void {
  const conflictId = findLogEntryConflict(database, columns, where, values)
  if (conflictId) throw new Error(`日志归档 ID 冲突：${conflictId}`)
}
