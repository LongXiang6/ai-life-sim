#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

interface Options {
  mode: 'apply' | 'rollback' | 'verify'
  logDatabase: string
  backupDirectory?: string
}

interface LogDatabaseSummary {
  archiveRows: number
  duplicateRows: number
  expiredHotRows: number
  hotRows: number
}

const ARCHIVE_DATABASE_NAME = 'logs-archive.sqlite'

function parseArgs(argv: string[]): Options {
  const mode = argv.shift()
  if (mode !== 'apply' && mode !== 'rollback' && mode !== 'verify') {
    throw new Error('Usage: migrate-log-archive-v1.ts <apply|rollback|verify> [options]')
  }
  const options: Options = {
    mode,
    logDatabase: process.env.AI_LOG_DB_PATH
      || (process.env.AI_LOG_DIR ? path.join(process.env.AI_LOG_DIR, 'logs.sqlite') : '')
      || '/var/lib/ai-life-sim/logs.sqlite',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${argv[index - 1]} missing value`)
      return value
    }
    if (argv[index] === '--log-database') options.logDatabase = next()
    else if (argv[index] === '--backup-directory') options.backupDirectory = next()
    else throw new Error(`Unknown argument: ${argv[index]}`)
  }
  options.logDatabase = path.resolve(options.logDatabase)
  if (options.backupDirectory) options.backupDirectory = path.resolve(options.backupDirectory)
  if (mode === 'rollback' && !options.backupDirectory) {
    throw new Error('rollback requires --backup-directory')
  }
  return options
}

function archiveDatabasePath(logDatabase: string): string {
  const archivePath = path.join(path.dirname(logDatabase), ARCHIVE_DATABASE_NAME)
  if (archivePath === logDatabase) throw new Error('active and archive log databases must differ')
  return archivePath
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function retentionCutoffMs(now = new Date()): number {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  startOfToday.setDate(startOfToday.getDate() - 1)
  return startOfToday.getTime()
}

function assertDatabase(databasePath: string): void {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const quickCheck = database.pragma('quick_check') as Array<{ quick_check: string }>
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${databasePath}`)
    }
    const meta = database.prepare(`
      SELECT key, value FROM log_meta
      WHERE key IN ('schema_version', 'storage_format')
      ORDER BY key ASC
    `).all() as Array<{ key: string; value: string }>
    if (
      meta.length !== 2
      || meta[0]?.key !== 'schema_version'
      || meta[0]?.value !== '1'
      || meta[1]?.key !== 'storage_format'
      || meta[1]?.value !== 'plaintext-sqlite'
    ) {
      throw new Error(`Unexpected log database metadata: ${databasePath}`)
    }
  } finally {
    database.close()
  }
}

function logEntryColumns(databasePath: string): string[] {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    return (database.pragma('table_info(log_entries)') as Array<{ name: string }>)
      .map((column) => column.name)
  } finally {
    database.close()
  }
}

function queryCount(
  database: Database.Database,
  sql: string,
  ...values: unknown[]
): number {
  const row = database.prepare(sql).get(...values) as { count: number } | undefined
  return Number(row?.count ?? 0)
}

function inspectDatabases(logDatabase: string, requireNoExpiredRows: boolean): LogDatabaseSummary {
  const archivePath = archiveDatabasePath(logDatabase)
  assertDatabase(logDatabase)
  assertDatabase(archivePath)
  const hotColumns = logEntryColumns(logDatabase)
  const archiveColumns = logEntryColumns(archivePath)
  if (
    hotColumns.length === 0
    || hotColumns.length !== archiveColumns.length
    || hotColumns.some((column, index) => column !== archiveColumns[index])
  ) {
    throw new Error('Log archive schema does not match the active database')
  }

  const database = new Database(logDatabase, { fileMustExist: true })
  database.prepare('ATTACH DATABASE ? AS archive_logs').run(archivePath)
  try {
    const equality = hotColumns.map((column) => (
      `hot_entry.${quoteIdentifier(column)} IS archive_entry.${quoteIdentifier(column)}`
    )).join(' AND ')
    const conflict = database.prepare(`
      SELECT hot_entry.id AS id
      FROM main.log_entries AS hot_entry
      INNER JOIN archive_logs.log_entries AS archive_entry
        ON archive_entry.id = hot_entry.id
      WHERE NOT (${equality})
      ORDER BY hot_entry.id ASC
      LIMIT 1
    `).get() as { id: string } | undefined
    if (conflict) throw new Error(`Log archive ID conflict: ${conflict.id}`)

    const expiredHotRows = queryCount(
      database,
      'SELECT COUNT(*) AS count FROM main.log_entries WHERE created_at < ?',
      retentionCutoffMs(),
    )
    if (requireNoExpiredRows && expiredHotRows > 0) {
      throw new Error(`Expired rows remain in the active log database: ${expiredHotRows}`)
    }
    return {
      hotRows: queryCount(database, 'SELECT COUNT(*) AS count FROM main.log_entries'),
      archiveRows: queryCount(database, 'SELECT COUNT(*) AS count FROM archive_logs.log_entries'),
      duplicateRows: queryCount(database, `
        SELECT COUNT(*) AS count
        FROM main.log_entries AS hot_entry
        INNER JOIN archive_logs.log_entries AS archive_entry
          ON archive_entry.id = hot_entry.id
      `),
      expiredHotRows,
    }
  } finally {
    database.exec('DETACH DATABASE archive_logs')
    database.close()
  }
}

async function backupDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  if (!fs.existsSync(destinationPath)) {
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    try {
      await source.backup(destinationPath)
    } finally {
      source.close()
    }
    fs.chmodSync(destinationPath, 0o600)
  }
  assertDatabase(destinationPath)
}

async function preserveCandidateDatabase(
  sourcePath: string,
  destinationPath: string,
): Promise<boolean> {
  const discardMarker = `${destinationPath}.discarded`
  if (fs.existsSync(discardMarker)) return false
  if (!fs.existsSync(sourcePath)) {
    fs.writeFileSync(discardMarker, `resource=${path.basename(sourcePath)}\nreason=missing-candidate\n`)
    fs.chmodSync(discardMarker, 0o600)
    return false
  }
  try {
    await backupDatabase(sourcePath, destinationPath)
    return true
  } catch {
    removeDatabaseFiles(destinationPath)
    fs.writeFileSync(discardMarker, `resource=${path.basename(sourcePath)}\nreason=unreadable-candidate\n`)
    fs.chmodSync(discardMarker, 0o600)
    return false
  }
}

function removeDatabaseFiles(databasePath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true })
  }
}

async function restoreDatabase(activePath: string, baselinePath: string): Promise<void> {
  assertDatabase(baselinePath)
  const restorePath = `${activePath}.log-archive-v1-restore`
  removeDatabaseFiles(restorePath)
  await backupDatabase(baselinePath, restorePath)
  removeDatabaseFiles(activePath)
  fs.renameSync(restorePath, activePath)
  fs.chmodSync(activePath, 0o600)
  assertDatabase(activePath)
}

async function applyMigration(options: Options): Promise<LogDatabaseSummary> {
  if (!fs.existsSync(options.logDatabase)) {
    throw new Error(`Active log database does not exist: ${options.logDatabase}`)
  }
  assertDatabase(options.logDatabase)
  process.env.AI_LOG_DB_PATH = options.logDatabase
  const store = await import('../../src/core/logger/server-log-store')
  try {
    const preparedArchive = store.prepareServerLogArchiveDatabase()
    if (preparedArchive !== archiveDatabasePath(options.logDatabase)) {
      throw new Error('Log Store resolved an unexpected archive database path')
    }
    await store.cleanupServerLogsNow()
  } finally {
    store.closeServerLogDatabaseForTests()
  }
  return inspectDatabases(options.logDatabase, true)
}

async function rollbackMigration(options: Options): Promise<void> {
  const backupDirectory = options.backupDirectory!
  const archivePath = archiveDatabasePath(options.logDatabase)
  const hotBaseline = path.join(backupDirectory, 'logs.sqlite')
  const archiveBaseline = path.join(backupDirectory, ARCHIVE_DATABASE_NAME)
  const hotRollbackArchive = path.join(backupDirectory, 'logs-log-archive-v1-rollback.sqlite')
  const archiveRollbackArchive = path.join(
    backupDirectory,
    'logs-archive-log-archive-v1-rollback.sqlite',
  )

  const preserved: string[] = []
  const discarded: string[] = []
  if (await preserveCandidateDatabase(options.logDatabase, hotRollbackArchive)) {
    preserved.push(path.basename(hotRollbackArchive))
  } else {
    discarded.push(path.basename(options.logDatabase))
  }
  if (fs.existsSync(archivePath)) {
    if (await preserveCandidateDatabase(archivePath, archiveRollbackArchive)) {
      preserved.push(path.basename(archiveRollbackArchive))
    } else {
      discarded.push(path.basename(archivePath))
    }
  }

  await restoreDatabase(options.logDatabase, hotBaseline)
  if (fs.existsSync(archiveBaseline)) {
    await restoreDatabase(archivePath, archiveBaseline)
    inspectDatabases(options.logDatabase, false)
  } else {
    removeDatabaseFiles(archivePath)
  }
  console.log(JSON.stringify({
    ok: true,
    mode: 'rollback',
    restored: [path.basename(options.logDatabase)],
    archiveBaselineRestored: fs.existsSync(archiveBaseline),
    preserved,
    discarded,
  }))
}

const options = parseArgs(process.argv.slice(2))
if (options.mode === 'apply') {
  console.log(JSON.stringify({ ok: true, mode: 'apply', ...(await applyMigration(options)) }))
} else if (options.mode === 'verify') {
  console.log(JSON.stringify({ ok: true, mode: 'verify', ...inspectDatabases(options.logDatabase, true) }))
} else {
  await rollbackMigration(options)
}
