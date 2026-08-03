/**
 * Purpose: Execute bounded read-only SQL and inspect supported database schemas.
 * Owner: operations
 * Responsibility: Database inspection only; source ownership and mutations remain outside the viewer.
 */

import fs from 'node:fs'

import {
  assertSafeSegment,
  DEFAULT_PAGE_SIZE,
  logDatabasesExist,
  MAX_PAGE_SIZE,
  pathInside,
  positiveInteger,
  resolveLogArchiveDatabasePath,
  resolveLogDatabasePath,
  withReadonly,
  withReadonlyLogs,
} from './shared.mjs'

function resolveSchemaSource(options, source) {
  if (source === 'logs') return { label: '日志数据库（热库 + 归档库）', databasePath: options.logDatabase, logUnion: true }
  if (source === 'accounts') return { label: '账号数据库', databasePath: options.accountDatabase }
  if (source === 'player-content') return { label: '玩家内容数据库', databasePath: options.playerContentDatabase }
  if (source.startsWith('memory:')) {
    const lifeRunId = assertSafeSegment(source.slice('memory:'.length), 'lifeRunId')
    return { label: `压缩记忆 · ${lifeRunId}`, databasePath: pathInside(options.memoryRoot, `${lifeRunId}.sqlite`) }
  }
  throw new Error('未知数据库来源')
}

export function queryReadonlyDatabase(options, input = {}) {
  const source = String(input.source ?? 'logs')
  const resolved = resolveSchemaSource(options, source)
  const sql = String(input.sql ?? '').trim().replace(/;\s*$/u, '')
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const available = resolved.logUnion ? logDatabasesExist(resolved.databasePath) : fs.existsSync(resolved.databasePath)
  if (!sql) return { available, source, sql, total: 0, page, pageSize, columns: [], rows: [] }
  if (sql.includes('\0')) throw new Error('查询包含非法字符')
  if (!/^(SELECT|WITH)\b/iu.test(sql)) throw new Error('只允许 SELECT 或以 SELECT 结束的 WITH 查询')
  const readDatabase = resolved.logUnion ? withReadonlyLogs : withReadonly
  return readDatabase(
    resolved.databasePath,
    { available: false, source, sql, total: 0, page, pageSize, columns: [], rows: [] },
    (database) => {
      const countStatement = database.prepare(`SELECT COUNT(*) AS count FROM (${sql}) AS __viewer_count`)
      const pageStatement = database.prepare(`SELECT * FROM (${sql}) AS __viewer_page LIMIT ? OFFSET ?`)
      if (countStatement.reader !== true || pageStatement.reader !== true) {
        throw new Error('只读查询校验失败')
      }
      const total = Number(countStatement.get()?.count ?? 0)
      const rows = pageStatement.all(pageSize, (page - 1) * pageSize)
      const columns = pageStatement.columns().map((column) => column.name)
      return { available: true, source, sql, total, page, pageSize, columns, rows }
    },
  )
}

export function inspectDatabaseSchema(options, source = 'logs') {
  const resolved = resolveSchemaSource(options, source)
  const readDatabase = resolved.logUnion ? withReadonlyLogs : withReadonly
  return readDatabase(resolved.databasePath, { available: false, source, label: resolved.label, databasePath: resolved.databasePath, wal: false, tables: [] }, (database) => {
    const names = database.prepare(`
      SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
      UNION
      SELECT name FROM sqlite_temp_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all()
    const tables = names.map(({ name }) => ({
      name,
      rows: Number(database.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get()?.count ?? 0),
      columns: database.pragma(`table_info("${name.replaceAll('"', '""')}")`).map((column) => ({
        name: column.name,
        type: column.type,
        notNull: column.notnull === 1,
        primaryKey: column.pk > 0,
        defaultValue: column.dflt_value,
      })),
    }))
    const databasePaths = resolved.logUnion
      ? [resolveLogDatabasePath(resolved.databasePath), resolveLogArchiveDatabasePath(resolved.databasePath)]
      : [resolved.databasePath]
    const existingPaths = databasePaths.filter((databasePath) => fs.existsSync(databasePath))
    return {
      available: true,
      source,
      label: resolved.label,
      databasePath: existingPaths.join(' + '),
      bytes: existingPaths.reduce((sum, databasePath) => sum + fs.statSync(databasePath).size, 0),
      wal: existingPaths.some((databasePath) => fs.existsSync(`${databasePath}-wal`)),
      journalMode: resolved.logUnion ? 'readonly-union' : String(database.pragma('journal_mode', { simple: true })),
      tables,
    }
  })
}
