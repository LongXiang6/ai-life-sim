/**
 * Purpose: Query overview, AI call, and user-link projections for the data viewer.
 * Owner: operations
 * Responsibility: Read-only log and account projections; usage normalization belongs to log-analysis.
 */

import { aggregateLogWindow, logTraceContext, shanghaiDayStart } from './log-analysis.mjs'
import {
  columnExists,
  DEFAULT_PAGE_SIZE,
  listFiles,
  MAX_PAGE_SIZE,
  parsePlaintextJson,
  positiveInteger,
  tableExists,
  withReadonly,
  withReadonlyLogs,
} from './shared.mjs'

function countIfTable(database, table) {
  return tableExists(database, table)
    ? Number(database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count ?? 0)
    : 0
}

export function buildDataOverview(options, now = Date.now()) {
  const today = shanghaiDayStart(now)
  const yesterday = today - 24 * 60 * 60 * 1000
  const logs = withReadonlyLogs(options.logDatabase, { available: false }, (database) => {
    if (!tableExists(database, 'log_entries')) return { available: false }
    return {
      available: true,
      totalRows: countIfTable(database, 'log_entries'),
      today: aggregateLogWindow(database, today, now + 1),
      yesterday: aggregateLogWindow(database, yesterday, today),
    }
  })
  const accounts = withReadonly(options.accountDatabase, { available: false, total: 0 }, (database) => ({
    available: tableExists(database, 'accounts'),
    total: countIfTable(database, 'accounts'),
  }))
  const content = withReadonly(options.playerContentDatabase, { available: false }, (database) => ({
    available: true,
    leaderboard: countIfTable(database, 'leaderboard_best_runs'),
    mail: countIfTable(database, 'player_mail_messages'),
    portraitJobs: countIfTable(database, 'portrait_mail_jobs'),
    cloudSaves: countIfTable(database, 'cloud_manual_saves'),
  }))
  return {
    schemaVersion: 2,
    generatedAt: new Date(now).toISOString(),
    logs,
    accounts,
    content,
    memorySaves: listFiles(options.memoryRoot, (entry) => entry.isFile() && entry.name.endsWith('.sqlite')).length,
    developmentEvents: withReadonlyLogs(options.logDatabase, 0, (database) => (
      tableExists(database, 'log_entries')
        ? Number(database.prepare("SELECT COUNT(*) AS count FROM log_entries WHERE entry_type = 'development-event'").get()?.count ?? 0)
        : 0
    )),
  }
}

export function mapLogRow(row) {
  const trace = logTraceContext(row)
  return {
    id: row.id,
    createdAt: row.created_at,
    entryType: row.entry_type,
    category: row.category,
    level: row.level,
    module: row.module,
    message: row.message,
    requestId: row.request_id,
    sourceIp: row.source_ip,
    sourceId: row.source_id,
    diagnosticCode: row.diagnostic_code,
    deviceProvenanceId: row.device_provenance_id ?? null,
    isRegistered: row.is_registered === 1,
    accountId: row.account_id,
    username: row.username,
    round: row.round,
    provider: row.provider,
    model: row.model,
    callKind: row.call_kind,
    strategy: row.strategy,
    status: row.status,
    prompt: row.prompt,
    response: row.response,
    error: row.error,
    stack: row.stack,
    meta: parsePlaintextJson(row.meta_json),
    payload: parsePlaintextJson(row.payload_json),
    lifeRunId: trace.lifeRunId || null,
    attempt: trace.attempt || null,
    durationMs: trace.durationMs || null,
  }
}

export function queryAiCalls(options, input = {}) {
  return withReadonlyLogs(options.logDatabase, { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }, (database) => {
    if (!tableExists(database, 'log_entries')) return { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }
    const page = positiveInteger(input.page, 1)
    const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    // Keep historical row types readable while all new writes use server-log-store.
    const clauses = ["entry_type IN ('ai-call', 'proxy-trace', 'proxy-access', 'raw-response', 'narrative-round-commit', 'narrative-round-diagnostic')"]
    const values = []
    const hasDeviceColumn = columnExists(database, 'log_entries', 'device_provenance_id')
    const query = String(input.query ?? '').trim()
    if (query) {
      const pattern = `%${query}%`
      clauses.push(`(
        request_id LIKE ? OR account_id LIKE ? OR username LIKE ? OR diagnostic_code LIKE ?
        ${hasDeviceColumn ? 'OR device_provenance_id LIKE ?' : ''} OR call_kind LIKE ? OR message LIKE ? OR prompt LIKE ?
        OR response LIKE ? OR error LIKE ? OR meta_json LIKE ? OR payload_json LIKE ?
      )`)
      values.push(...Array.from({ length: hasDeviceColumn ? 12 : 11 }, () => pattern))
    }
    if (input.callKind) {
      clauses.push('call_kind = ?')
      values.push(String(input.callKind))
    }
    const where = `WHERE ${clauses.join(' AND ')}`
    const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM log_entries ${where}`).get(...values)?.count ?? 0)
    const offset = (page - 1) * pageSize
    const rows = database.prepare(`
      SELECT * FROM log_entries ${where}
      ORDER BY created_at DESC, rowid DESC, id ASC LIMIT ? OFFSET ?
    `).all(...values, pageSize, offset)
    return { available: true, total, page, pageSize, entries: rows.map(mapLogRow) }
  })
}

export function queryUserLinks(options, input = {}) {
  return withReadonlyLogs(options.logDatabase, { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }, (database) => {
    if (!tableExists(database, 'log_entries')) return { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }
    const page = positiveInteger(input.page, 1)
    const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const query = String(input.query ?? '').trim()
    const hasDeviceColumn = columnExists(database, 'log_entries', 'device_provenance_id')
    const deviceExpression = hasDeviceColumn ? 'device_provenance_id' : 'NULL'
    const where = query
      ? `WHERE account_id LIKE ? OR username LIKE ? OR diagnostic_code LIKE ? ${hasDeviceColumn ? 'OR device_provenance_id LIKE ?' : ''} OR source_ip LIKE ?`
      : ''
    const values = query ? Array.from({ length: hasDeviceColumn ? 5 : 4 }, () => `%${query}%`) : []
    const group = `account_id, username, diagnostic_code, ${deviceExpression}, source_ip, is_registered`
    const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM (SELECT 1 FROM log_entries ${where} GROUP BY ${group})`).get(...values)?.count ?? 0)
    const entries = database.prepare(`
      SELECT account_id, username, diagnostic_code, ${deviceExpression} AS device_provenance_id, source_ip, is_registered,
        COUNT(*) AS log_count,
        SUM(CASE WHEN entry_type IN ('ai-call', 'proxy-access') THEN 1 ELSE 0 END) AS ai_count,
        MIN(created_at) AS first_seen_at,
        MAX(created_at) AS last_seen_at
      FROM log_entries ${where}
      GROUP BY ${group}
      ORDER BY last_seen_at DESC, account_id ASC, username ASC, diagnostic_code ASC,
        device_provenance_id ASC, source_ip ASC, is_registered ASC
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize).map((row) => ({
      accountId: row.account_id,
      username: row.username,
      diagnosticCode: row.diagnostic_code,
      deviceProvenanceId: row.device_provenance_id,
      sourceIp: row.source_ip,
      isRegistered: row.is_registered === 1,
      logCount: Number(row.log_count),
      aiCount: Number(row.ai_count),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }))
    return { available: true, total, page, pageSize, entries }
  })
}
