/**
 * Purpose: Archive expired hot-log rows and schedule bounded retention maintenance.
 * Owner: core:logger
 * Responsibility: Retention cutoff, verified archive migration, and cleanup scheduling only.
 */

import fs from 'node:fs'

import {
  assertMatchingLogEntrySchemas,
  assertNoLogEntryConflict,
  findUnarchivedLogEntry,
  quoteSqliteIdentifier,
} from './archive-sql'
import {
  enforceDatabaseFilePermissions,
  getServerLogArchiveDatabasePath,
  getServerLogDatabase,
  getServerLogDatabasePath,
  prepareServerLogArchiveDatabase,
} from './database'

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000
let lastCleanupAt = 0

declare global {
  var __aiLifeLogCleanupTimer: NodeJS.Timeout | undefined
}

function getRetentionCutoffMs(now = new Date()): number {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  startOfToday.setDate(startOfToday.getDate() - 1)
  return startOfToday.getTime()
}

export async function cleanupServerLogsNow(now = new Date()): Promise<void> {
  const database = getServerLogDatabase()
  const cutoff = getRetentionCutoffMs(now)
  const expired = database.prepare(`
    SELECT COUNT(*) AS count FROM log_entries WHERE created_at < ?
  `).get(cutoff) as { count: number }

  if (expired.count > 0) {
    const archivePath = prepareServerLogArchiveDatabase()
    database.prepare('ATTACH DATABASE ? AS archive_logs').run(archivePath)
    try {
      const columns = assertMatchingLogEntrySchemas(database)
      const columnList = columns.map(quoteSqliteIdentifier).join(', ')
      database.transaction(() => {
        assertNoLogEntryConflict(database, columns)
        database.prepare(`
          INSERT INTO archive_logs.log_entries (${columnList})
          SELECT ${columns.map((column) => `hot_entry.${quoteSqliteIdentifier(column)}`).join(', ')}
          FROM main.log_entries AS hot_entry
          WHERE hot_entry.created_at < ?
            AND NOT EXISTS (
              SELECT 1 FROM archive_logs.log_entries AS archive_entry
              WHERE archive_entry.id = hot_entry.id
            )
        `).run(cutoff)
        const missingId = findUnarchivedLogEntry(database, columns, cutoff)
        if (missingId) throw new Error(`日志归档核验失败：${missingId}`)
      })()
      database.transaction(() => {
        assertNoLogEntryConflict(database, columns)
        const missingId = findUnarchivedLogEntry(database, columns, cutoff)
        if (missingId) throw new Error(`日志归档核验失败：${missingId}`)
        database.prepare('DELETE FROM log_entries WHERE created_at < ?').run(cutoff)
      })()
    } finally {
      database.exec('DETACH DATABASE archive_logs')
    }
  }

  database.pragma('wal_checkpoint(PASSIVE)')
  enforceDatabaseFilePermissions(getServerLogDatabasePath())
  const archivePath = getServerLogArchiveDatabasePath()
  if (fs.existsSync(archivePath)) enforceDatabaseFilePermissions(archivePath)
}

export function scheduleServerLogCleanup(): void {
  if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = Date.now()
  void cleanupServerLogsNow().catch((error) => {
    console.error('[server-log-store] SQLite 日志清理失败', error)
  })
}

if (!globalThis.__aiLifeLogCleanupTimer) {
  globalThis.__aiLifeLogCleanupTimer = setInterval(scheduleServerLogCleanup, CLEANUP_INTERVAL_MS)
  globalThis.__aiLifeLogCleanupTimer.unref?.()
}
scheduleServerLogCleanup()
