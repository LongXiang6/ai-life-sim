import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

const ARCHIVE_DATABASE_NAME = 'logs-archive.sqlite'

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function attachedTableColumns(database, schema, tableName) {
  return database.prepare(
    `SELECT name FROM ${quoteIdentifier(schema)}.pragma_table_info(?) ORDER BY cid ASC`,
  ).all(tableName).map((row) => row.name)
}

function attachedTableNames(database, schema) {
  return database.prepare(
    `SELECT name FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
  ).all().map((row) => row.name)
}

function assertNoLogEntryConflicts(database, sources, columns) {
  const hot = sources.find((source) => source.schema === 'hot_logs')
  const archive = sources.find((source) => source.schema === 'archive_logs')
  if (!hot?.tables.includes('log_entries') || !archive?.tables.includes('log_entries')) return

  const hotColumns = new Set(attachedTableColumns(database, hot.schema, 'log_entries'))
  const archiveColumns = new Set(attachedTableColumns(database, archive.schema, 'log_entries'))
  if (!hotColumns.has('id') || !archiveColumns.has('id')) {
    throw new Error('日志表缺少稳定 ID 列')
  }

  const mismatch = columns.map((column) => {
    const hotValue = hotColumns.has(column) ? `hot_entry.${quoteIdentifier(column)}` : 'NULL'
    const archiveValue = archiveColumns.has(column) ? `archive_entry.${quoteIdentifier(column)}` : 'NULL'
    return `NOT (${hotValue} IS ${archiveValue})`
  }).join(' OR ')
  const conflict = database.prepare(`
    SELECT hot_entry.id AS id
    FROM hot_logs.log_entries AS hot_entry
    INNER JOIN archive_logs.log_entries AS archive_entry
      ON archive_entry.id = hot_entry.id
    WHERE ${mismatch}
    ORDER BY hot_entry.id ASC
    LIMIT 1
  `).get()
  if (conflict) throw new Error(`日志归档 ID 冲突：${conflict.id}`)
}

export function resolveLogDatabasePath(value) {
  const resolved = path.resolve(String(value))
  return path.extname(resolved).toLowerCase() === '.sqlite'
    ? resolved
    : path.join(resolved, 'logs.sqlite')
}

export function resolveLogArchiveDatabasePath(databasePathOrRoot) {
  const databasePath = resolveLogDatabasePath(databasePathOrRoot)
  return path.join(path.dirname(databasePath), ARCHIVE_DATABASE_NAME)
}

export function logDatabasesExist(databasePathOrRoot) {
  const databasePath = resolveLogDatabasePath(databasePathOrRoot)
  return fs.existsSync(databasePath) || fs.existsSync(resolveLogArchiveDatabasePath(databasePath))
}

function createUnionLogQueryDatabase(databasePath) {
  const archivePath = resolveLogArchiveDatabasePath(databasePath)
  const queryDatabase = new Database(':memory:')
  const sources = []
  try {
    if (fs.existsSync(databasePath)) {
      queryDatabase.prepare('ATTACH DATABASE ? AS hot_logs').run(databasePath)
      sources.push({ schema: 'hot_logs', priority: 0, tables: attachedTableNames(queryDatabase, 'hot_logs') })
    }
    if (archivePath !== databasePath && fs.existsSync(archivePath)) {
      queryDatabase.prepare('ATTACH DATABASE ? AS archive_logs').run(archivePath)
      sources.push({ schema: 'archive_logs', priority: 1, tables: attachedTableNames(queryDatabase, 'archive_logs') })
    }
    if (sources.length === 0) throw new Error(`日志数据库不存在：${databasePath}`)

    const tableNames = [...new Set(sources.flatMap((source) => source.tables))]
    for (const tableName of tableNames) {
      const columns = [...new Set(sources.flatMap((source) => (
        source.tables.includes(tableName)
          ? attachedTableColumns(queryDatabase, source.schema, tableName)
          : []
      )))]
      if (tableName === 'log_entries') {
        assertNoLogEntryConflicts(queryDatabase, sources, columns)
        const hotSource = sources.find((source) => source.schema === 'hot_logs')
        const selects = sources.filter((source) => source.tables.includes(tableName)).map((source) => {
          const available = new Set(attachedTableColumns(queryDatabase, source.schema, tableName))
          if (!available.has('id')) throw new Error(`日志表缺少稳定 ID 列：${source.schema}`)
          const fields = columns.map((column) => (
            available.has(column)
              ? `${quoteIdentifier(source.schema)}.${quoteIdentifier(tableName)}.${quoteIdentifier(column)} AS ${quoteIdentifier(column)}`
              : `NULL AS ${quoteIdentifier(column)}`
          ))
          fields.push(`${quoteIdentifier(source.schema)}.${quoteIdentifier(tableName)}.rowid AS rowid`)
          const filter = hotSource && source.schema === 'archive_logs'
            ? ' WHERE NOT EXISTS (SELECT 1 FROM hot_logs.log_entries AS hot_entry WHERE hot_entry.id = archive_logs.log_entries.id)'
            : ''
          return `SELECT ${fields.join(', ')} FROM ${quoteIdentifier(source.schema)}.${quoteIdentifier(tableName)}${filter}`
        })
        queryDatabase.exec(`CREATE TEMP VIEW ${quoteIdentifier(tableName)} AS ${selects.join(' UNION ALL ')}`)
        continue
      }

      const source = sources.find((candidate) => candidate.tables.includes(tableName))
      if (!source) continue
      queryDatabase.exec(`CREATE TEMP VIEW ${quoteIdentifier(tableName)} AS SELECT * FROM ${quoteIdentifier(source.schema)}.${quoteIdentifier(tableName)}`)
    }
    queryDatabase.pragma('query_only = ON')
    queryDatabase.pragma('busy_timeout = 5000')
    return queryDatabase
  } catch (error) {
    queryDatabase.close()
    throw error
  }
}

export function withReadonlyLogQueryDatabase(databasePathOrRoot, read) {
  const databasePath = resolveLogDatabasePath(databasePathOrRoot)
  const database = createUnionLogQueryDatabase(databasePath)
  try {
    return read(database)
  } finally {
    database.close()
  }
}

export function readLogRows(databasePathOrRoot, options = {}) {
  return withReadonlyLogQueryDatabase(databasePathOrRoot, (database) => {
    const clause = options.where ? `WHERE ${options.where}` : ''
    return database.prepare(`
      SELECT *
      FROM log_entries
      ${clause}
      ORDER BY created_at DESC, rowid DESC, id ASC
    `).all(...(options.values ?? []))
  })
}
