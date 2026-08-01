/**
 * @module server-log-store.ts
 * @description 服务端明文诊断日志 SQLite 存储、查询与保留期清理
 * @mod core
 */

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import Database from 'better-sqlite3'

import { ACCOUNT_SESSION_COOKIE } from '@/core/account/account-contract'
import { getSessionAccountIdentity } from '@/core/account/account-service'

import {
  getServerRequestSource as getBaseServerRequestSource,
  type ServerRequestSource,
} from './server-log-safety'

export { safeLogSegment, type ServerRequestSource } from './server-log-safety'

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000

declare global {
  var __aiLifeLogDatabase: Database.Database | undefined
  var __aiLifeLogDatabasePath: string | undefined
  var __aiLifeLogCleanupTimer: NodeJS.Timeout | undefined
}

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

interface ServerLogRow {
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

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

/** 账号身份只从服务端会话 Cookie 解析，请求体和自定义请求头均不能覆盖。 */
export function getServerRequestSource(request: Request): ServerRequestSource {
  const source = getBaseServerRequestSource(request)
  const token = readCookie(request, ACCOUNT_SESSION_COOKIE)
  if (!token) return source
  try {
    const identity = getSessionAccountIdentity(token)
    if (!identity) return source
    return {
      ...source,
      isRegistered: true,
      accountId: identity.accountId,
      username: identity.username,
    }
  } catch {
    return source
  }
}

/** 日志数据库可显式配置；兼容既有 AI_LOG_DIR 时写入该目录。 */
export function getServerLogDatabasePath(): string {
  const configuredDatabase = process.env.AI_LOG_DB_PATH?.trim()
  if (configuredDatabase) return path.resolve(configuredDatabase)
  const configuredDirectory = process.env.AI_LOG_DIR?.trim()
  if (configuredDirectory) return path.join(path.resolve(configuredDirectory), 'logs.sqlite')
  return process.env.NODE_ENV === 'production'
    ? '/var/lib/ai-life-sim/logs.sqlite'
    : path.join(process.cwd(), '.data', 'logs.sqlite')
}

/** 兼容运维调用：日志根目录即明文数据库所在目录。 */
export function getServerLogRoot(): string {
  return path.dirname(getServerLogDatabasePath())
}

/** 旧日志先无损迁入独立归档库，再清出主库，保证完整保留。 */
export function getServerLogArchiveDatabasePath(): string {
  return path.join(getServerLogRoot(), 'logs-archive.sqlite')
}

function enforceDatabaseFilePermissions(databasePath: string): void {
  if (process.platform === 'win32') return
  for (const target of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      fs.chmodSync(target, 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS log_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      client_timestamp INTEGER,
      entry_type TEXT NOT NULL,
      category TEXT,
      level TEXT,
      module TEXT,
      message TEXT,
      event TEXT,
      request_id TEXT,
      source_ip TEXT NOT NULL DEFAULT 'unknown',
      source_id TEXT NOT NULL DEFAULT 'ip-unknown',
      diagnostic_code TEXT,
      device_provenance_id TEXT,
      is_registered INTEGER NOT NULL DEFAULT 0 CHECK (is_registered IN (0, 1)),
      account_id TEXT,
      username TEXT,
      feedback_id TEXT,
      round INTEGER,
      age REAL,
      era TEXT,
      provider TEXT,
      model TEXT,
      call_kind TEXT,
      strategy TEXT,
      status INTEGER,
      prompt TEXT,
      response TEXT,
      error TEXT,
      stack TEXT,
      meta_json TEXT,
      payload_json TEXT
    );

    CREATE INDEX IF NOT EXISTS log_entries_created_idx
      ON log_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_type_created_idx
      ON log_entries(entry_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_category_created_idx
      ON log_entries(category, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_request_idx
      ON log_entries(request_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_account_idx
      ON log_entries(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_diagnostic_idx
      ON log_entries(diagnostic_code, created_at DESC);
    CREATE INDEX IF NOT EXISTS log_entries_feedback_idx
      ON log_entries(feedback_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS diagnostic_identities (
      code TEXT PRIMARY KEY,
      issued_at INTEGER NOT NULL,
      format_version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_provenance_identities (
      id TEXT PRIMARY KEY,
      issued_at INTEGER NOT NULL,
      format_version INTEGER NOT NULL
    );

    INSERT INTO log_meta(key, value) VALUES ('schema_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    INSERT INTO log_meta(key, value) VALUES ('storage_format', 'plaintext-sqlite')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `)
  const logColumns = database.pragma('table_info(log_entries)') as Array<{ name: string }>
  if (!logColumns.some((column) => column.name === 'device_provenance_id')) {
    database.exec('ALTER TABLE log_entries ADD COLUMN device_provenance_id TEXT')
  }
  database.exec('CREATE INDEX IF NOT EXISTS log_entries_device_provenance_idx ON log_entries(device_provenance_id, created_at DESC)')
}

export function getServerLogDatabase(): Database.Database {
  const databasePath = getServerLogDatabasePath()
  if (
    globalThis.__aiLifeLogDatabase?.open
    && globalThis.__aiLifeLogDatabasePath === databasePath
  ) {
    return globalThis.__aiLifeLogDatabase
  }
  if (globalThis.__aiLifeLogDatabase?.open) globalThis.__aiLifeLogDatabase.close()

  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })
  try { fs.chmodSync(path.dirname(databasePath), 0o700) } catch { /* Windows or restricted runtime. */ }

  const database = new Database(databasePath)
  try {
    database.pragma('journal_mode = WAL')
    database.pragma('busy_timeout = 5000')
    database.pragma('synchronous = NORMAL')
    database.pragma('journal_size_limit = 67108864')
    database.transaction(() => initializeSchema(database))()
    enforceDatabaseFilePermissions(databasePath)
    globalThis.__aiLifeLogDatabase = database
    globalThis.__aiLifeLogDatabasePath = databasePath
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

function plaintextJson(value: unknown): string | null {
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

function mapRow(row: ServerLogRow): ServerLogRecord {
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

/** 每次调用写入一条记录，不生成副本、内容引用或旁路文件。 */
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
    scheduleCleanup()
    return true
  } catch (error) {
    console.error('[server-log-store] SQLite 明文日志写入失败', error)
    return false
  }
}

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
  return {
    clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  }
}

function quoteSqliteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function getLogEntryColumns(database: Database.Database, schema = 'main'): string[] {
  return (database.pragma(`${schema}.table_info(log_entries)`) as Array<{ name: string }>)
    .map((column) => column.name)
}

function assertMatchingLogEntrySchemas(database: Database.Database): string[] {
  const hotColumns = getLogEntryColumns(database)
  const archiveColumns = getLogEntryColumns(database, 'archive_logs')
  if (
    hotColumns.length !== archiveColumns.length
    || hotColumns.some((column, index) => column !== archiveColumns[index])
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

function findUnarchivedLogEntry(
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

function assertNoLogEntryConflict(
  database: Database.Database,
  columns: string[],
  where = '',
  values: unknown[] = [],
): void {
  const conflictId = findLogEntryConflict(database, columns, where, values)
  if (conflictId) throw new Error(`日志归档 ID 冲突：${conflictId}`)
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
    const countRow = database.prepare(`
      SELECT COUNT(*) AS count FROM log_entries ${clause}
    `).get(...values) as { count: number } | undefined
    return { entries: rows.map(mapRow), total: Number(countRow?.count ?? 0) }
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
    const countRow = database.prepare(`
      ${combinedLogs}
      SELECT COUNT(*) AS count FROM combined_logs ${clause}
    `).get(...values) as { count: number } | undefined
    return { entries: rows.map(mapRow), total: Number(countRow?.count ?? 0) }
  } finally {
    database.exec('DETACH DATABASE archive_logs')
  }
}

function getRetentionCutoffMs(now = new Date()): number {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  startOfToday.setDate(startOfToday.getDate() - 1)
  return startOfToday.getTime()
}

/** 前天及更早的行先完整迁入归档库，再清出主库；归档失败时保留主库原行。 */
export async function cleanupServerLogsNow(now = new Date()): Promise<void> {
  const database = getServerLogDatabase()
  const cutoff = getRetentionCutoffMs(now)
  const expired = database.prepare(`
    SELECT COUNT(*) AS count
    FROM log_entries
    WHERE created_at < ?
  `).get(cutoff) as { count: number }

  if (expired.count > 0) {
    const archivePath = getServerLogArchiveDatabasePath()
    fs.mkdirSync(path.dirname(archivePath), { recursive: true, mode: 0o700 })
    const archive = new Database(archivePath)
    try {
      archive.pragma('journal_mode = WAL')
      archive.pragma('busy_timeout = 5000')
      archive.transaction(() => initializeSchema(archive))()
      enforceDatabaseFilePermissions(archivePath)
    } finally {
      archive.close()
    }

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

let lastCleanupAt = 0

function scheduleCleanup(): void {
  if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = Date.now()
  void cleanupServerLogsNow().catch((error) => {
    console.error('[server-log-store] SQLite 日志清理失败', error)
  })
}

if (!globalThis.__aiLifeLogCleanupTimer) {
  globalThis.__aiLifeLogCleanupTimer = setInterval(scheduleCleanup, CLEANUP_INTERVAL_MS)
  globalThis.__aiLifeLogCleanupTimer.unref?.()
}
scheduleCleanup()

export type DiagnosticIdentityReservationResult = 'created' | 'exists' | 'failed'

export async function reserveDiagnosticIdentity(
  code: string,
  issuedAt = Date.now(),
): Promise<DiagnosticIdentityReservationResult> {
  try {
    const result = getServerLogDatabase().prepare(`
      INSERT OR IGNORE INTO diagnostic_identities(code, issued_at, format_version)
      VALUES (?, ?, 1)
    `).run(code, issuedAt)
    return result.changes === 1 ? 'created' : 'exists'
  } catch (error) {
    console.error('[server-log-store] 诊断编号占用失败', error)
    return 'failed'
  }
}

export async function reserveDeviceProvenanceIdentity(
  id: string,
  issuedAt = Date.now(),
): Promise<DiagnosticIdentityReservationResult> {
  try {
    const result = getServerLogDatabase().prepare(`
      INSERT OR IGNORE INTO device_provenance_identities(id, issued_at, format_version)
      VALUES (?, ?, 1)
    `).run(id, issuedAt)
    return result.changes === 1 ? 'created' : 'exists'
  } catch (error) {
    console.error('[server-log-store] 设备来源编号占用失败', error)
    return 'failed'
  }
}

export function closeServerLogDatabaseForTests(): void {
  globalThis.__aiLifeLogDatabase?.close()
  globalThis.__aiLifeLogDatabase = undefined
  globalThis.__aiLifeLogDatabasePath = undefined
}
