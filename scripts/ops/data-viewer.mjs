#!/usr/bin/env node

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4318
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const MEMORY_TABLES = {
  summaries: { table: 'summary_nodes', order: 'level ASC, start_round ASC, summary_id ASC' },
  archives: { table: 'l1_archives', order: 'start_round ASC, summary_id ASC' },
  events: { table: 'memory_events', order: 'permanent DESC, active DESC, current_weight DESC, occurrence_time ASC, event_id ASC' },
  links: { table: 'summary_event_links', order: 'summary_id ASC, event_id ASC' },
}

function defaultPaths() {
  const dataRoot = path.resolve(process.cwd(), '.data')
  return {
    logDatabase: process.env.AI_LOG_DB_PATH || path.join(dataRoot, 'logs.sqlite'),
    accountDatabase: process.env.ACCOUNT_DB_PATH || path.join(dataRoot, 'accounts.sqlite'),
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || path.join(dataRoot, 'player-content.sqlite'),
    memoryRoot: process.env.NARRATIVE_MEMORY_DIR || path.join(dataRoot, 'narrative-memory'),
    roundRoot: process.env.NARRATIVE_ROUND_LOG_DIR || path.join(dataRoot, 'narrative-rounds'),
    diagnosticRoot: process.env.DEVELOPMENT_SYSTEM_DIAGNOSTIC_DIR || path.join(dataRoot, 'development-diagnostics'),
  }
}

export function parseDataViewerArgs(argv) {
  const options = { host: DEFAULT_HOST, port: DEFAULT_PORT, ...defaultPaths() }
  for (let index = 0; index < argv.length; index += 1) {
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${argv[index - 1]} 缺少参数`)
      return value
    }
    if (argv[index] === '--host') options.host = next()
    else if (argv[index] === '--port') options.port = Number(next())
    else if (argv[index] === '--log-database') options.logDatabase = next()
    else if (argv[index] === '--account-database') options.accountDatabase = next()
    else if (argv[index] === '--player-content-database') options.playerContentDatabase = next()
    else if (argv[index] === '--memory-root') options.memoryRoot = next()
    else if (argv[index] === '--round-root') options.roundRoot = next()
    else if (argv[index] === '--diagnostic-root') options.diagnosticRoot = next()
    else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: data-viewer.mjs [--host 127.0.0.1] [--port 4318] [--log-database <path>] [--account-database <path>] [--player-content-database <path>] [--memory-root <path>] [--round-root <path>] [--diagnostic-root <path>]')
      process.exit(0)
    } else {
      throw new Error(`未知参数：${argv[index]}`)
    }
  }
  if (!LOOPBACK_HOSTS.has(options.host)) throw new Error('数据查看器只允许监听本机回环地址')
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('--port 必须是有效端口')
  }
  return {
    ...options,
    logDatabase: path.resolve(options.logDatabase),
    accountDatabase: path.resolve(options.accountDatabase),
    playerContentDatabase: path.resolve(options.playerContentDatabase),
    memoryRoot: path.resolve(options.memoryRoot),
    roundRoot: path.resolve(options.roundRoot),
    diagnosticRoot: path.resolve(options.diagnosticRoot),
  }
}

function openReadonly(databasePath) {
  if (!fs.existsSync(databasePath)) return null
  return new Database(databasePath, { readonly: true, fileMustExist: true })
}

function withReadonly(databasePath, fallback, read) {
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

function tableExists(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function columnExists(database, table, column) {
  if (!tableExists(database, table)) return false
  return database.pragma(`table_info("${table.replaceAll('"', '""')}")`)
    .some((candidate) => candidate.name === column)
}

function parsePlaintextJson(value) {
  if (value === null || value === undefined || value === '') return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function pageInput(searchParams) {
  const page = positiveInteger(searchParams.get('page'), 1)
  const pageSize = positiveInteger(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function shanghaiDayStart(now) {
  const offset = 8 * 60 * 60 * 1000
  const local = new Date(now + offset)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function numeric(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0
}

function extractUsageObject(response) {
  if (typeof response !== 'string' || !response.trim()) return null
  const candidates = []
  try {
    candidates.push(JSON.parse(response))
  } catch {
    for (const line of response.split(/\r?\n/u)) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try { candidates.push(JSON.parse(payload)) } catch { /* Keep scanning the complete stream. */ }
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const usage = asObject(asObject(candidates[index]).usage)
    if (Object.keys(usage).length > 0) return usage
  }
  return null
}

function normalizeUsage(usage) {
  const source = asObject(usage)
  const promptDetails = asObject(source.prompt_tokens_details)
  const completionDetails = asObject(source.completion_tokens_details)
  const hitTokens = numeric(source.prompt_cache_hit_tokens ?? promptDetails.cached_tokens)
  const promptTokens = numeric(source.prompt_tokens)
  const explicitMiss = source.prompt_cache_miss_tokens
  const missTokens = explicitMiss === undefined
    ? Math.max(0, promptTokens - hitTokens)
    : numeric(explicitMiss)
  return {
    hitTokens,
    missTokens,
    completionTokens: numeric(source.completion_tokens),
    reasoningTokens: numeric(source.reasoning_tokens ?? completionDetails.reasoning_tokens),
    totalTokens: numeric(source.total_tokens),
  }
}

function logTraceContext(row) {
  const meta = asObject(parsePlaintextJson(row.meta_json))
  const payload = asObject(parsePlaintextJson(row.payload_json))
  const trace = asObject(payload.trace ?? payload.traceContext ?? meta.trace)
  return {
    lifeRunId: String(
      meta.lifeRunId ?? payload.lifeRunId ?? payload.life_run_id
      ?? trace.lifeRunId ?? trace.life_run_id ?? '',
    ).trim(),
    round: Number(row.round ?? meta.round ?? payload.round ?? trace.round ?? 0),
    callKind: String(row.call_kind ?? meta.callKind ?? payload.callKind ?? trace.callKind ?? '').trim(),
    attempt: Number(meta.attempt ?? payload.attempt ?? trace.attempt ?? 0),
    durationMs: numeric(meta.durationMs ?? payload.durationMs ?? payload.duration_ms),
    meta,
    payload,
  }
}

function aggregateLogWindow(database, from, to) {
  const rows = database.prepare(`
    SELECT * FROM log_entries
    WHERE created_at >= ? AND created_at < ?
      AND entry_type IN ('proxy-access', 'proxy-trace', 'narrative-round-commit')
    ORDER BY created_at ASC, rowid ASC
  `).all(from, to)
  const result = {
    rows: rows.length,
    calls: 0,
    successes: 0,
    failures: 0,
    repairs: 0,
    adoptedRounds: 0,
    repairedRounds: 0,
    registeredCalls: 0,
    anonymousCalls: 0,
    latencySamples: 0,
    latencyMsTotal: 0,
    latencyMaxMs: 0,
    hitTokens: 0,
    missTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    byPool: {},
  }
  for (const row of rows) {
    const trace = logTraceContext(row)
    if (row.entry_type === 'proxy-access') {
      result.calls += 1
      if (Number(row.status) >= 200 && Number(row.status) < 400) result.successes += 1
      else result.failures += 1
      if (row.is_registered === 1) result.registeredCalls += 1
      else result.anonymousCalls += 1
      if (trace.durationMs > 0) {
        result.latencySamples += 1
        result.latencyMsTotal += trace.durationMs
        result.latencyMaxMs = Math.max(result.latencyMaxMs, trace.durationMs)
      }
      if (trace.callKind.includes('repair')) result.repairs += 1
      continue
    }
    if (row.entry_type === 'narrative-round-commit') {
      const outcome = asObject(trace.payload.outcome ?? trace.payload)
      if (outcome.narrativeAdopted === true) result.adoptedRounds += 1
      if (numeric(outcome.repairAttempts) > 0) result.repairedRounds += 1
      continue
    }
    if (row.entry_type !== 'proxy-trace' || row.event !== 'response') continue
    const usage = normalizeUsage(extractUsageObject(row.response))
    const pool = trace.callKind || 'unclassified'
    const bucket = result.byPool[pool] ?? {
      calls: 0,
      hitTokens: 0,
      missTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
    bucket.calls += 1
    for (const key of ['hitTokens', 'missTokens', 'completionTokens', 'totalTokens']) {
      bucket[key] += usage[key]
      result[key] += usage[key]
    }
    result.reasoningTokens += usage.reasoningTokens
    result.byPool[pool] = bucket
  }
  return {
    ...result,
    successRate: percent(result.successes, result.calls),
    repairRate: percent(result.repairedRounds, result.adoptedRounds),
    cacheHitRate: percent(result.hitTokens, result.hitTokens + result.missTokens),
    averageLatencyMs: result.latencySamples > 0
      ? Math.round(result.latencyMsTotal / result.latencySamples)
      : 0,
    byPool: Object.fromEntries(Object.entries(result.byPool).map(([pool, bucket]) => [pool, {
      ...bucket,
      cacheHitRate: percent(bucket.hitTokens, bucket.hitTokens + bucket.missTokens),
    }])),
  }
}

function countIfTable(database, table) {
  return tableExists(database, table)
    ? Number(database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count ?? 0)
    : 0
}

function listFiles(root, predicate) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => predicate(entry))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function buildDataOverview(options, now = Date.now()) {
  const today = shanghaiDayStart(now)
  const yesterday = today - 24 * 60 * 60 * 1000
  const logs = withReadonly(options.logDatabase, { available: false }, (database) => {
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
    roundSaves: listFiles(options.roundRoot, (entry) => entry.isDirectory()).length,
    memorySaves: listFiles(options.memoryRoot, (entry) => entry.isFile() && entry.name.endsWith('.sqlite')).length,
    diagnosticFiles: listFiles(options.diagnosticRoot, (entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(entry.name)).length,
  }
}

export function queryDevelopmentSystemDiagnostics(options, input = {}) {
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const query = String(input.query ?? '').trim().toLowerCase()
  const system = String(input.system ?? '').trim().toLowerCase()
  const status = String(input.status ?? '').trim().toLowerCase()
  const entries = []
  const files = listFiles(
    options.diagnosticRoot,
    (entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(entry.name),
  ).reverse()

  for (const fileName of files) {
    const filePath = path.join(options.diagnosticRoot, fileName)
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!line) continue
      try {
        const event = JSON.parse(line)
        entries.push({ ...event, sourceFile: fileName, sourceLine: index + 1 })
      } catch (error) {
        entries.push({
          schemaVersion: 1,
          timestamp: 0,
          system: 'diagnostic-reader',
          event: 'invalid-jsonl-line',
          status: 'error',
          sourceFile: fileName,
          sourceLine: index + 1,
          details: { rawLine: line },
          error: { message: error instanceof Error ? error.message : String(error) },
        })
      }
    }
  }

  const filtered = entries.filter((entry) => {
    if (system && String(entry.system ?? '').toLowerCase() !== system) return false
    if (status && String(entry.status ?? '').toLowerCase() !== status) return false
    if (!query) return true
    return JSON.stringify(entry).toLowerCase().includes(query)
  }).sort((left, right) => (
    Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0)
      || String(right.sourceFile).localeCompare(String(left.sourceFile))
      || Number(right.sourceLine ?? 0) - Number(left.sourceLine ?? 0)
  ))
  const bySystem = {}
  const byStatus = {}
  for (const entry of filtered) {
    const systemName = String(entry.system ?? 'unknown')
    const statusName = String(entry.status ?? 'unknown')
    bySystem[systemName] = (bySystem[systemName] ?? 0) + 1
    byStatus[statusName] = (byStatus[statusName] ?? 0) + 1
  }
  const offset = (page - 1) * pageSize
  return {
    available: fs.existsSync(options.diagnosticRoot),
    root: options.diagnosticRoot,
    total: filtered.length,
    page,
    pageSize,
    bySystem,
    byStatus,
    entries: filtered.slice(offset, offset + pageSize),
  }
}

function mapLogRow(row) {
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
  return withReadonly(options.logDatabase, { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }, (database) => {
    if (!tableExists(database, 'log_entries')) return { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }
    const page = positiveInteger(input.page, 1)
    const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const clauses = ["entry_type IN ('ai-call', 'proxy-trace', 'proxy-access', 'raw-response', 'narrative-round-archive-error', 'narrative-round-commit', 'narrative-round-diagnostic')"]
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
      ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?
    `).all(...values, pageSize, offset)
    return { available: true, total, page, pageSize, entries: rows.map(mapLogRow) }
  })
}

function parseRoundArchiveExchanges(content) {
  const source = Buffer.from(content, 'utf8')
  const begin = Buffer.from('===== EXCHANGE BEGIN =====\n', 'utf8')
  const requestBegin = Buffer.from('----- REQUEST BEGIN -----\n', 'utf8')
  const requestEnd = Buffer.from('\n----- REQUEST END -----\n----- RESPONSE BEGIN -----\n', 'utf8')
  const responseEnd = Buffer.from('\n----- RESPONSE END -----\n===== EXCHANGE END =====', 'utf8')
  const exchanges = []
  let cursor = 0
  while (cursor < source.length) {
    const blockStart = source.indexOf(begin, cursor)
    if (blockStart < 0) break
    const headerStart = blockStart + begin.length
    const bodyStartMarker = source.indexOf(requestBegin, headerStart)
    if (bodyStartMarker < 0) break
    const header = source.subarray(headerStart, bodyStartMarker).toString('utf8')
    const fields = Object.fromEntries(header.split(/\r?\n/u).flatMap((entry) => {
      const separator = entry.indexOf(':')
      return separator > 0 ? [[entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()]] : []
    }))
    const requestLength = Number(fields.request_utf8_bytes)
    const responseLength = Number(fields.response_utf8_bytes)
    if (!Number.isSafeInteger(requestLength) || requestLength < 0
      || !Number.isSafeInteger(responseLength) || responseLength < 0) break
    const requestStart = bodyStartMarker + requestBegin.length
    const requestEndAt = requestStart + requestLength
    if (!source.subarray(requestEndAt, requestEndAt + requestEnd.length).equals(requestEnd)) break
    const responseStart = requestEndAt + requestEnd.length
    const responseEndAt = responseStart + responseLength
    if (!source.subarray(responseEndAt, responseEndAt + responseEnd.length).equals(responseEnd)) break
    exchanges.push({
      requestId: fields.request_id || '',
      callKind: fields.call_kind || '',
      executionKind: fields.execution_kind || '',
      provider: fields.provider || '',
      model: fields.model || '',
      attempt: Number(fields.attempt) || 1,
      status: fields.status ? Number(fields.status) : null,
      transportError: fields.transport_error || '',
      request: source.subarray(requestStart, requestEndAt).toString('utf8'),
      response: source.subarray(responseStart, responseEndAt).toString('utf8'),
      usage: normalizeUsage(extractUsageObject(source.subarray(responseStart, responseEndAt).toString('utf8'))),
    })
    cursor = responseEndAt + responseEnd.length
  }
  return exchanges
}

function completeTextDiff(left, right) {
  const before = String(left ?? '')
  const after = String(right ?? '')
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  return {
    identical: before === after,
    commonPrefixChars: prefix,
    commonSuffixChars: suffix,
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix),
  }
}

function readRoundMemoryLinks(options, lifeRunId, round) {
  const databasePath = pathInside(options.memoryRoot, `${lifeRunId}.sqlite`)
  return withReadonly(databasePath, { available: false, summaries: [], events: [] }, (database) => {
    const summaries = tableExists(database, 'summary_nodes')
      ? database.prepare(`
          SELECT * FROM summary_nodes
          WHERE start_round <= ? AND end_round >= ?
          ORDER BY level ASC, start_round ASC, summary_id ASC
        `).all(round, round)
      : []
    const events = tableExists(database, 'memory_events')
      ? database.prepare(`
          SELECT DISTINCT events.* FROM memory_events AS events, json_each(events.source_rounds_json) AS source_round
          WHERE json_valid(events.source_rounds_json) AND CAST(source_round.value AS INTEGER) = ?
          ORDER BY events.level ASC, events.occurrence_time ASC, events.event_id ASC
        `).all(round)
      : []
    return { available: true, summaries, events }
  })
}

function readRoundOutcome(options, lifeRunId, round) {
  return withReadonly(options.logDatabase, null, (database) => {
    if (!tableExists(database, 'log_entries')) return null
    const pattern = `%${lifeRunId}%`
    const rows = database.prepare(`
      SELECT * FROM log_entries
      WHERE entry_type IN ('narrative-round-commit', 'narrative-round-diagnostic')
        AND round = ? AND (meta_json LIKE ? OR payload_json LIKE ?)
      ORDER BY created_at ASC, rowid ASC
    `).all(round, pattern, pattern)
    return rows.map(mapLogRow)
  })
}

export function queryNarrativeRoundChains(options, input = {}) {
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, 20, 100)
  const query = String(input.query ?? '').trim().toLowerCase()
  const requestedLifeRunId = input.lifeRunId ? assertSafeSegment(input.lifeRunId, 'lifeRunId') : ''
  const requestedRound = input.round ? positiveInteger(input.round, 0) : 0
  const index = listRoundArchives(options)
  const flattened = index.saves.flatMap((save) => save.rounds.map((entry) => ({
    ...entry,
    lifeRunId: save.lifeRunId,
  }))).filter((entry) => (
    (!requestedLifeRunId || entry.lifeRunId === requestedLifeRunId)
    && (!requestedRound || entry.round === requestedRound)
    && (!query || `${entry.lifeRunId} ${entry.round}`.toLowerCase().includes(query))
  )).sort((left, right) => right.round - left.round || right.lifeRunId.localeCompare(left.lifeRunId))
  const selected = flattened.slice((page - 1) * pageSize, page * pageSize)
  const entries = selected.map((entry) => {
    const archive = readRoundArchive(options, entry.lifeRunId, entry.round)
    const exchanges = parseRoundArchiveExchanges(archive.content)
    const grouped = new Map()
    for (const exchange of exchanges) {
      const key = exchange.callKind || 'unclassified'
      const group = grouped.get(key) ?? []
      group.push(exchange)
      grouped.set(key, group)
    }
    const differences = []
    for (const [callKind, attempts] of grouped) {
      const ordered = [...attempts].sort((left, right) => left.attempt - right.attempt)
      for (let index = 1; index < ordered.length; index += 1) {
        differences.push({
          callKind,
          fromAttempt: ordered[index - 1].attempt,
          toAttempt: ordered[index].attempt,
          request: completeTextDiff(ordered[index - 1].request, ordered[index].request),
          response: completeTextDiff(ordered[index - 1].response, ordered[index].response),
        })
      }
    }
    return {
      ...entry,
      archiveAvailable: archive.available,
      exchanges,
      differences,
      outcome: readRoundOutcome(options, entry.lifeRunId, entry.round),
      memory: readRoundMemoryLinks(options, entry.lifeRunId, entry.round),
    }
  })
  return { available: index.available, total: flattened.length, page, pageSize, entries }
}

function assertSafeSegment(value, label) {
  const normalized = String(value ?? '').trim()
  if (!/^[a-zA-Z0-9._-]+$/u.test(normalized)) throw new Error(`${label} 不合法`)
  return normalized
}

function pathInside(root, ...segments) {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...segments)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('目标路径超出数据目录')
  }
  return target
}

export function listRoundArchives(options) {
  const saves = listFiles(options.roundRoot, (entry) => entry.isDirectory()).map((lifeRunId) => {
    const directory = pathInside(options.roundRoot, lifeRunId)
    const rounds = listFiles(directory, (entry) => entry.isFile() && /^round-\d{6}\.txt$/u.test(entry.name))
      .map((fileName) => ({
        round: Number(fileName.slice(6, 12)),
        fileName,
        bytes: fs.statSync(path.join(directory, fileName)).size,
      }))
    return { lifeRunId, rounds }
  })
  return { available: fs.existsSync(options.roundRoot), saves }
}

export function readRoundArchive(options, lifeRunId, round) {
  const safeLifeRunId = assertSafeSegment(lifeRunId, 'lifeRunId')
  const safeRound = positiveInteger(round, 0)
  if (!safeRound) throw new Error('round 必须是正整数')
  const fileName = `round-${String(safeRound).padStart(6, '0')}.txt`
  const filePath = pathInside(options.roundRoot, safeLifeRunId, fileName)
  if (!fs.existsSync(filePath)) return { available: false, lifeRunId: safeLifeRunId, round: safeRound, content: '', bytes: 0 }
  const content = fs.readFileSync(filePath, 'utf8')
  return { available: true, lifeRunId: safeLifeRunId, round: safeRound, content, bytes: Buffer.byteLength(content, 'utf8') }
}

export function listMemoryDatabases(options) {
  const saves = listFiles(options.memoryRoot, (entry) => entry.isFile() && /^[a-zA-Z0-9._-]+\.sqlite$/u.test(entry.name))
    .map((fileName) => ({
      lifeRunId: fileName.slice(0, -'.sqlite'.length),
      bytes: fs.statSync(path.join(options.memoryRoot, fileName)).size,
    }))
  return { available: fs.existsSync(options.memoryRoot), saves }
}

export function queryMemoryRows(options, input) {
  const lifeRunId = assertSafeSegment(input.lifeRunId, 'lifeRunId')
  const target = MEMORY_TABLES[input.view] ?? MEMORY_TABLES.events
  const databasePath = pathInside(options.memoryRoot, `${lifeRunId}.sqlite`)
  const page = positiveInteger(input.page, 1)
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  return withReadonly(databasePath, { available: false, lifeRunId, view: input.view, total: 0, page, pageSize, entries: [] }, (database) => {
    if (!tableExists(database, target.table)) return { available: false, lifeRunId, view: input.view, total: 0, page, pageSize, entries: [] }
    const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM "${target.table}"`).get()?.count ?? 0)
    const entries = database.prepare(`SELECT * FROM "${target.table}" ORDER BY ${target.order} LIMIT ? OFFSET ?`)
      .all(pageSize, (page - 1) * pageSize)
    return { available: true, lifeRunId, view: input.view, total, page, pageSize, entries }
  })
}

export function queryUserLinks(options, input = {}) {
  return withReadonly(options.logDatabase, { available: false, total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, entries: [] }, (database) => {
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
      ORDER BY last_seen_at DESC, account_id ASC, device_provenance_id ASC
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

function resolveSchemaSource(options, source) {
  if (source === 'logs') return { label: '日志数据库', databasePath: options.logDatabase }
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
  if (!sql) return { available: fs.existsSync(resolved.databasePath), source, sql, total: 0, page, pageSize, columns: [], rows: [] }
  if (sql.includes('\0')) throw new Error('查询包含非法字符')
  if (!/^(SELECT|WITH)\b/iu.test(sql)) throw new Error('只允许 SELECT 或以 SELECT 结束的 WITH 查询')
  return withReadonly(
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
  return withReadonly(resolved.databasePath, { available: false, source, label: resolved.label, databasePath: resolved.databasePath, wal: false, tables: [] }, (database) => {
    const names = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC").all()
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
    return {
      available: true,
      source,
      label: resolved.label,
      databasePath: resolved.databasePath,
      bytes: fs.statSync(resolved.databasePath).size,
      wal: fs.existsSync(`${resolved.databasePath}-wal`),
      journalMode: String(database.pragma('journal_mode', { simple: true })),
      tables,
    }
  })
}

const viewerHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Life Sim 数据查看器</title><link rel="stylesheet" href="/styles.css"></head>
<body><header><div><p>AI LIFE SIM / DATA</p><h1>数据查看器</h1></div><div class="live"><i></i><span>本机只读</span><small id="updated">尚未读取</small></div></header>
<div class="shell"><nav aria-label="数据视图"><button class="active" data-view="overview">总览</button><button data-view="calls">AI 调用</button><button data-view="rounds">回合链路</button><button data-view="diagnostics">系统诊断</button><button data-view="memory">压缩记忆</button><button data-view="users">用户关联</button><button data-view="schema">数据库结构</button><button data-view="query">只读查询</button></nav><main id="main" aria-live="polite"></main></div>
<script src="/app.js" defer></script></body></html>`

const viewerCss = `:root{color-scheme:light;--paper:#f3f5f4;--surface:#fff;--ink:#1b2226;--muted:#68737a;--line:#d9dfe1;--accent:#496a7c;--green:#4f735f;--danger:#9a4b45}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"PingFang SC","Microsoft YaHei UI",sans-serif}button,input,select{font:inherit}header{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;border-bottom:1px solid var(--line);background:var(--surface)}header p{margin:0;color:var(--muted);font-size:10px;font-weight:700}h1{margin:4px 0 0;font-size:22px;letter-spacing:0}.live{display:grid;grid-template-columns:auto auto;align-items:center;gap:3px 7px;text-align:right;font-size:12px}.live i{width:7px;height:7px;border-radius:50%;background:var(--green)}.live small{grid-column:1/-1;color:var(--muted)}.shell{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:calc(100vh - 76px)}nav{padding:18px 14px;border-right:1px solid var(--line);background:var(--surface)}nav button{display:block;width:100%;padding:10px 12px;border:0;border-left:2px solid transparent;background:transparent;color:var(--muted);text-align:left;cursor:pointer}nav button:hover{color:var(--ink);background:var(--paper)}nav button.active{border-left-color:var(--accent);color:var(--ink);font-weight:700}main{min-width:0;padding:24px clamp(16px,3vw,40px) 48px}.view-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:18px}.view-head h2{margin:0;font-size:20px}.view-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.toolbar{display:flex;flex-wrap:wrap;gap:8px}.toolbar input,.toolbar select{min-height:36px;padding:0 10px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink)}.toolbar input{width:min(360px,60vw)}button.command{min-height:36px;padding:0 14px;border:1px solid var(--accent);border-radius:4px;background:var(--accent);color:#fff;cursor:pointer}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);background:var(--surface)}.metric{min-width:0;padding:16px;border-right:1px solid var(--line)}.metric:nth-child(4n){border-right:0}.metric span,.metric small{display:block;color:var(--muted);font-size:11px}.metric strong{display:block;margin:6px 0;font-size:26px;letter-spacing:0}.panel{margin-top:14px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line)}.panel-head h3{margin:0;font-size:14px}.panel-head span,.muted{color:var(--muted);font-size:11px}.rows{display:grid}.row{border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}.row summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px 14px;cursor:pointer;list-style:none}.row summary::-webkit-details-marker{display:none}.row-title{min-width:0}.row-title strong,.row-title span{display:block;overflow-wrap:anywhere}.row-title span{margin-top:4px;color:var(--muted);font-size:11px}.tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}.tag{padding:2px 6px;border:1px solid var(--line);border-radius:3px;color:var(--muted);font-size:10px}.detail{padding:0 14px 16px;border-top:1px solid var(--line)}dl.meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}dl.meta div{min-width:0}dt{color:var(--muted);font-size:10px}dd{margin:3px 0 0;overflow-wrap:anywhere;font-size:12px}details.block{margin-top:8px;border:1px solid var(--line);border-radius:4px}details.block summary{display:block;padding:8px 10px;background:var(--paper);font-size:11px;font-weight:700}pre{max-height:560px;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.65 Consolas,"SFMono-Regular",monospace}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}th{position:sticky;top:0;background:var(--paper);color:var(--muted);font-size:10px}.empty{padding:44px 16px;text-align:center;color:var(--muted);font-size:12px}.pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 14px}.pager button{padding:5px 9px;border:1px solid var(--line);border-radius:3px;background:var(--surface);cursor:pointer}.pager button:disabled{opacity:.4}.source-path{padding:10px 14px;border-bottom:1px solid var(--line);overflow-wrap:anywhere;color:var(--muted);font:11px Consolas,monospace}.error{padding:16px;border:1px solid #e4c5c2;background:#fff8f7;color:var(--danger)}@media(max-width:820px){header{height:68px;padding:0 16px}.shell{display:block}.shell nav{position:sticky;top:0;z-index:2;display:flex;overflow-x:auto;padding:8px;border-right:0;border-bottom:1px solid var(--line)}nav button{flex:0 0 auto;width:auto;border-left:0;border-bottom:2px solid transparent}nav button.active{border-left:0;border-bottom-color:var(--accent)}main{padding:18px 12px 36px}.view-head{align-items:start;flex-direction:column}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(2n){border-right:0}dl.meta{grid-template-columns:repeat(2,minmax(0,1fr))}.row summary{display:block}.tags{justify-content:flex-start;margin-top:8px}.toolbar,.toolbar input,.toolbar select,.toolbar .command{width:100%}}`

const viewerJs = `const main=document.getElementById('main');const updated=document.getElementById('updated');let active='overview';let callPage=1;let userPage=1;let roundIndex=null;let memoryIndex=null;const esc=(value)=>String(value??'');const fmt=(value)=>Number(value??0).toLocaleString('zh-CN');const time=(value)=>value?new Date(value).toLocaleString('zh-CN'):'-';const json=(value)=>typeof value==='string'?value:JSON.stringify(value??null,null,2);async function api(url){const response=await fetch(url,{cache:'no-store'});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'读取失败');updated.textContent=new Date().toLocaleString('zh-CN');return body}function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element}function head(title,subtitle,toolbar){const wrap=node('div','view-head');const copy=node('div');copy.append(node('h2','',title),node('p','',subtitle));wrap.append(copy);if(toolbar)wrap.append(toolbar);return wrap}function metrics(items){const wrap=node('section','metrics');items.forEach(([label,value,note])=>{const item=node('article','metric');item.append(node('span','',label),node('strong','',fmt(value)),node('small','',note));wrap.append(item)});return wrap}function panel(title,note){const wrap=node('section','panel');const top=node('div','panel-head');top.append(node('h3','',title),node('span','',note));wrap.append(top);return wrap}function toolbarSearch(id,placeholder,onSubmit){const form=node('form','toolbar');const input=node('input');input.id=id;input.placeholder=placeholder;input.value=new URLSearchParams(location.search).get('q')||'';const button=node('button','command','查询');button.type='submit';form.append(input,button);form.addEventListener('submit',(event)=>{event.preventDefault();onSubmit(input.value)});return form}function detailBlock(title,value){const block=node('details','block');const label=node('summary','',title);const pre=node('pre','',value||'');block.append(label,pre);return block}function pager(current,total,pageSize,onPage){const pages=Math.max(1,Math.ceil(total/pageSize));const wrap=node('div','pager');const previous=node('button','','上一页');previous.disabled=current<=1;previous.onclick=()=>onPage(current-1);const label=node('span','muted',current+' / '+pages+' 页 · '+fmt(total)+' 条');const next=node('button','','下一页');next.disabled=current>=pages;next.onclick=()=>onPage(current+1);wrap.append(previous,label,next);return wrap}async function renderOverview(){const data=await api('/api/overview');main.replaceChildren(head('总览','现有 SQLite、WAL 与逐轮原文的只读投影'));const today=data.logs.today||{};main.append(metrics([['今日上游调用',today.calls,'proxy-access'],['今日失败',today.failures,'HTTP 异常'],['今日修复',today.repairs,'修复调用记录'],['日志总行数',data.logs.totalRows,'昨天与今天'],['注册账号',data.accounts.total,'账号数据库'],['排行榜记录',data.content.leaderboard,'当前最佳人生'],['站内邮件',data.content.mail,'画像邮件'],['记忆存档',data.memorySaves,'独立 SQLite']]));const sources=panel('数据源','实时只读');const table=node('div','table-wrap');table.innerHTML='<table><thead><tr><th>来源</th><th>状态</th><th>记录</th></tr></thead><tbody><tr><td>明文日志</td><td>'+(data.logs.available?'可用':'不存在')+'</td><td>'+fmt(data.logs.totalRows)+'</td></tr><tr><td>逐轮 TXT</td><td>'+(data.roundSaves?'可用':'暂无')+'</td><td>'+fmt(data.roundSaves)+' 个存档</td></tr><tr><td>压缩记忆</td><td>'+(data.memorySaves?'可用':'暂无')+'</td><td>'+fmt(data.memorySaves)+' 个存档</td></tr></tbody></table>';sources.append(table);main.append(sources)}function logRow(entry){const details=node('details','row');const summary=node('summary');const title=node('div','row-title');title.append(node('strong','',entry.callKind||entry.message||entry.entryType),node('span','',time(entry.createdAt)+' · '+(entry.username||'匿名')+' · '+(entry.requestId||'无请求 ID')));const tags=node('div','tags');[entry.entryType,entry.provider,entry.model,entry.status===null?null:'HTTP '+entry.status].filter(Boolean).forEach((value)=>tags.append(node('span','tag',value)));summary.append(title,tags);const body=node('div','detail');const meta=node('dl','meta');[['设备来源',entry.deviceProvenanceId],['诊断编号',entry.diagnosticCode],['账号 ID',entry.accountId],['来源 IP',entry.sourceIp],['轮次',entry.round],['策略',entry.strategy],['分类',entry.category],['日志 ID',entry.id]].forEach(([label,value])=>{const item=node('div');item.append(node('dt','',label),node('dd','',value??'-'));meta.append(item)});body.append(meta,detailBlock('完整 Prompt / 发送内容',entry.prompt),detailBlock('完整 AI 返回 / 接收内容',entry.response),detailBlock('错误与堆栈',[entry.error,entry.stack].filter(Boolean).join('\n\n')),detailBlock('Meta',json(entry.meta)),detailBlock('完整记录',json(entry.payload)));details.append(summary,body);return details}async function renderCalls(query=''){const bar=toolbarSearch('call-query','请求 ID、用户、设备、调用类型或正文',value=>{callPage=1;renderCalls(value)});main.replaceChildren(head('AI 调用','完整发送、完整接收、模型、用量、缓存与失败链',bar));const data=await api('/api/ai-calls?page='+callPage+'&q='+encodeURIComponent(query));const wrap=panel('调用记录',fmt(data.total)+' 条');const rows=node('div','rows');if(!data.entries.length)rows.append(node('div','empty','暂无匹配记录'));else data.entries.forEach(entry=>rows.append(logRow(entry)));wrap.append(rows,pager(data.page,data.total,data.pageSize,page=>{callPage=page;renderCalls(query)}));main.append(wrap)}async function ensureRoundIndex(){roundIndex=roundIndex||await api('/api/rounds');return roundIndex}async function renderRounds(lifeRunId,round){const index=await ensureRoundIndex();const bar=node('div','toolbar');const saveSelect=node('select');saveSelect.append(node('option','','选择存档'));index.saves.forEach(save=>{const option=node('option','',save.lifeRunId);option.value=save.lifeRunId;option.selected=save.lifeRunId===lifeRunId;saveSelect.append(option)});const roundSelect=node('select');roundSelect.append(node('option','','选择轮次'));const current=index.saves.find(save=>save.lifeRunId===(lifeRunId||saveSelect.value));(current?.rounds||[]).forEach(item=>{const option=node('option','','第 '+item.round+' 轮 · '+fmt(item.bytes)+' B');option.value=String(item.round);option.selected=item.round===Number(round);roundSelect.append(option)});saveSelect.onchange=()=>renderRounds(saveSelect.value);roundSelect.onchange=()=>renderRounds(saveSelect.value,roundSelect.value);bar.append(saveSelect,roundSelect);main.replaceChildren(head('叙事轮次','按 lifeRunId 与 round 查看逐字上游归档',bar));if(!lifeRunId||!round){main.append(node('div','empty','选择存档和轮次后读取完整 TXT'));return}const data=await api('/api/round?lifeRunId='+encodeURIComponent(lifeRunId)+'&round='+round);const wrap=panel('第 '+data.round+' 轮',fmt(data.bytes)+' UTF-8 字节');wrap.append(node('pre','',data.content));main.append(wrap)}async function ensureMemoryIndex(){memoryIndex=memoryIndex||await api('/api/memory');return memoryIndex}async function renderMemory(lifeRunId,view='events',page=1){const index=await ensureMemoryIndex();const bar=node('div','toolbar');const saveSelect=node('select');saveSelect.append(node('option','','选择存档'));index.saves.forEach(save=>{const option=node('option','',save.lifeRunId);option.value=save.lifeRunId;option.selected=save.lifeRunId===lifeRunId;saveSelect.append(option)});const viewSelect=node('select');[['events','记忆事件'],['summaries','摘要节点'],['archives','L1 原始归档'],['links','来源关联']].forEach(([value,label])=>{const option=node('option','',label);option.value=value;option.selected=value===view;viewSelect.append(option)});saveSelect.onchange=()=>renderMemory(saveSelect.value,view);viewSelect.onchange=()=>renderMemory(saveSelect.value,viewSelect.value);bar.append(saveSelect,viewSelect);main.replaceChildren(head('压缩记忆','L1 / L2 / L3、来源、权重、衰减与原始压缩结果',bar));if(!lifeRunId){main.append(node('div','empty','选择记忆存档后读取'));return}const data=await api('/api/memory/rows?lifeRunId='+encodeURIComponent(lifeRunId)+'&view='+view+'&page='+page);const wrap=panel(lifeRunId,fmt(data.total)+' 条');const rows=node('div','rows');data.entries.forEach((entry,index)=>{const item=detailBlock((entry.event_id||entry.summary_id||entry.id||view+'-'+index),json(entry));item.classList.add('row');rows.append(item)});if(!data.entries.length)rows.append(node('div','empty','暂无记录'));wrap.append(rows,pager(data.page,data.total,data.pageSize,next=>renderMemory(lifeRunId,view,next)));main.append(wrap)}async function renderUsers(query=''){const bar=toolbarSearch('user-query','账号、用户名、诊断编号、设备来源或 IP',value=>{userPage=1;renderUsers(value)});main.replaceChildren(head('用户关联','账号或匿名来源与生成记录的关联入口',bar));const data=await api('/api/users?page='+userPage+'&q='+encodeURIComponent(query));const wrap=panel('身份来源',fmt(data.total)+' 组');const table=node('div','table-wrap');const element=node('table');element.innerHTML='<thead><tr><th>身份</th><th>设备来源</th><th>诊断编号</th><th>IP</th><th>AI / 日志</th><th>最后出现</th></tr></thead>';const body=node('tbody');data.entries.forEach(entry=>{const row=node('tr');[entry.isRegistered?(entry.username+'\n'+entry.accountId):'匿名',entry.deviceProvenanceId||'-',entry.diagnosticCode||'-',entry.sourceIp,fmt(entry.aiCount)+' / '+fmt(entry.logCount),time(entry.lastSeenAt)].forEach(value=>row.append(node('td','',value)));row.title='点击后在 AI 调用中查询该来源';row.onclick=()=>{active='calls';document.querySelectorAll('nav button').forEach(button=>button.classList.toggle('active',button.dataset.view==='calls'));callPage=1;renderCalls(entry.deviceProvenanceId||entry.accountId||entry.diagnosticCode||entry.sourceIp)};body.append(row)});element.append(body);table.append(element);wrap.append(table,pager(data.page,data.total,data.pageSize,page=>{userPage=page;renderUsers(query)}));main.append(wrap)}async function renderSchema(source='logs'){const memory=await ensureMemoryIndex();const bar=node('div','toolbar');const select=node('select');[['logs','日志数据库'],['accounts','账号数据库'],['player-content','玩家内容数据库'],...memory.saves.map(save=>['memory:'+save.lifeRunId,'记忆 · '+save.lifeRunId])].forEach(([value,label])=>{const option=node('option','',label);option.value=value;option.selected=value===source;select.append(option)});select.onchange=()=>renderSchema(select.value);bar.append(select);main.replaceChildren(head('数据库结构','表、列、行数、WAL 状态与文件位置',bar));const data=await api('/api/schema?source='+encodeURIComponent(source));const wrap=panel(data.label,data.available?(fmt(data.bytes)+' B · '+data.journalMode):'不存在');wrap.append(node('div','source-path',data.databasePath));if(!data.available){wrap.append(node('div','empty','数据库文件不存在'));main.append(wrap);return}data.tables.forEach(table=>{const block=node('details','block');const summary=node('summary','',table.name+' · '+fmt(table.rows)+' 行');const pre=node('pre','',table.columns.map(column=>column.name+'  '+column.type+(column.primaryKey?'  PRIMARY KEY':'')+(column.notNull?'  NOT NULL':'')).join('\n'));block.append(summary,pre);wrap.append(block)});main.append(wrap)}async function render(){try{if(active==='overview')await renderOverview();else if(active==='calls')await renderCalls();else if(active==='rounds')await renderRounds();else if(active==='memory')await renderMemory();else if(active==='users')await renderUsers();else await renderSchema()}catch(error){main.replaceChildren(node('div','error',error instanceof Error?error.message:String(error)))}}document.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>{active=button.dataset.view;document.querySelectorAll('nav button').forEach(item=>item.classList.toggle('active',item===button));render()}));render();`

// The embedded client is kept on one physical line; all runtime newlines are string escapes.
const viewerEnhancementJs = `
const ratio = (value) => Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '%';
const duration = (value) => Number(value ?? 0).toLocaleString('zh-CN') + ' ms';
metrics = function metricsEnhanced(items) {
  const wrap = node('section', 'metrics');
  items.forEach(([label, value, note]) => {
    const item = node('article', 'metric');
    item.append(
      node('span', '', label),
      node('strong', '', typeof value === 'number' ? fmt(value) : String(value ?? '-')),
      node('small', '', note),
    );
    wrap.append(item);
  });
  return wrap;
};

renderOverview = async function renderOverviewEnhanced() {
  const data = await api('/api/overview');
  const today = data.logs.today || {};
  const yesterday = data.logs.yesterday || {};
  main.replaceChildren(head('总览', '今天与昨天的完整明文日志只读聚合'));
  main.append(metrics([
    ['今日调用', today.calls, '成功率 ' + ratio(today.successRate)],
    ['修复轮次', today.repairedRounds, '修复率 ' + ratio(today.repairRate)],
    ['缓存命中', ratio(today.cacheHitRate), fmt(today.hitTokens) + ' / ' + fmt((today.hitTokens || 0) + (today.missTokens || 0)) + ' Token'],
    ['平均延迟', duration(today.averageLatencyMs), '最大 ' + duration(today.latencyMaxMs)],
    ['输入 Token', (today.hitTokens || 0) + (today.missTokens || 0), '命中 + 未命中'],
    ['输出 Token', today.completionTokens, '思考 ' + fmt(today.reasoningTokens)],
    ['注册 / 匿名', fmt(today.registeredCalls) + ' / ' + fmt(today.anonymousCalls), '按代理请求'],
    ['昨日调用', yesterday.calls, '成功率 ' + ratio(yesterday.successRate)],
  ]));
  const pools = panel('今日调用池', Object.keys(today.byPool || {}).length + ' 个');
  const poolTable = node('div', 'table-wrap');
  const table = node('table');
  table.innerHTML = '<thead><tr><th>调用池</th><th>调用</th><th>命中</th><th>未命中</th><th>命中率</th><th>输出</th></tr></thead>';
  const body = node('tbody');
  Object.entries(today.byPool || {}).forEach(([pool, item]) => {
    const row = node('tr');
    [pool, fmt(item.calls), fmt(item.hitTokens), fmt(item.missTokens), ratio(item.cacheHitRate), fmt(item.completionTokens)].forEach((value) => row.append(node('td', '', value)));
    body.append(row);
  });
  if (!body.children.length) {
    const row = node('tr'); const cell = node('td', 'muted', '今天暂无可聚合调用'); cell.colSpan = 6; row.append(cell); body.append(row);
  }
  table.append(body); poolTable.append(table); pools.append(poolTable); main.append(pools);
  const sources = panel('数据源', '实时只读');
  const sourceTable = node('div', 'table-wrap');
  sourceTable.innerHTML = '<table><thead><tr><th>来源</th><th>状态</th><th>记录</th></tr></thead><tbody><tr><td>明文日志</td><td>' + (data.logs.available ? '可用' : '不存在') + '</td><td>' + fmt(data.logs.totalRows) + '</td></tr><tr><td>逐轮 TXT</td><td>' + (data.roundSaves ? '可用' : '暂无') + '</td><td>' + fmt(data.roundSaves) + ' 个存档</td></tr><tr><td>系统诊断 JSONL</td><td>' + (data.diagnosticFiles ? '可用' : '暂无') + '</td><td>' + fmt(data.diagnosticFiles) + ' 个日期文件</td></tr><tr><td>压缩记忆</td><td>' + (data.memorySaves ? '可用' : '暂无') + '</td><td>' + fmt(data.memorySaves) + ' 个存档</td></tr></tbody></table>';
  sources.append(sourceTable); main.append(sources);
};

let roundChainPage = 1;
renderRounds = async function renderRoundChains(lifeRunId = '', round = '') {
  const bar = toolbarSearch('round-query', 'lifeRunId 或轮次', (value) => { roundChainPage = 1; renderRounds(value); });
  main.replaceChildren(head('回合链路', 'lifeRunId -> round -> attempt -> exchange -> memory', bar));
  const params = new URLSearchParams({ page: String(roundChainPage), q: lifeRunId });
  if (round) params.set('round', String(round));
  const data = await api('/api/narrative-rounds?' + params);
  const wrap = panel('回合记录', fmt(data.total) + ' 轮');
  const rows = node('div', 'rows');
  data.entries.forEach((entry) => {
    const item = node('details', 'row');
    const summary = node('summary');
    const title = node('div', 'row-title');
    const outcomeRows = entry.outcome || [];
    const outcomePayload = outcomeRows.map((row) => row.payload && (row.payload.outcome || row.payload)).find(Boolean) || {};
    title.append(node('strong', '', entry.lifeRunId + ' · 第 ' + entry.round + ' 轮'), node('span', '', entry.exchanges.length + ' 次上游交换 · ' + (outcomePayload.narrativeAdopted === true ? '已采用' : outcomeRows.length ? '未采用' : '仅确认已返回')));
    const tags = node('div', 'tags');
    [entry.archiveAvailable ? 'TXT' : null, entry.memory.available ? 'MEMORY' : null, outcomeRows.length ? 'OUTCOME' : null].filter(Boolean).forEach((value) => tags.append(node('span', 'tag', value)));
    summary.append(title, tags);
    const detail = node('div', 'detail');
    entry.exchanges.forEach((exchange) => {
      const label = (exchange.callKind || '未分类') + ' · attempt ' + exchange.attempt + ' · ' + (exchange.status === null ? '无状态' : 'HTTP ' + exchange.status);
      detail.append(detailBlock(label + ' / 完整发送', exchange.request), detailBlock(label + ' / 完整接收', exchange.response), detailBlock(label + ' / usage', json(exchange.usage)));
    });
    entry.differences.forEach((difference) => detail.append(detailBlock('尝试差异 · ' + difference.callKind + ' ' + difference.fromAttempt + ' -> ' + difference.toAttempt, json(difference))));
    detail.append(detailBlock('最终采用与诊断', json(outcomeRows)), detailBlock('关联压缩记忆', json(entry.memory)));
    item.append(summary, detail); rows.append(item);
  });
  if (!data.entries.length) rows.append(node('div', 'empty', '暂无匹配回合'));
  wrap.append(rows, pager(data.page, data.total, data.pageSize, (page) => { roundChainPage = page; renderRounds(lifeRunId, round); }));
  main.append(wrap);
};

let diagnosticPage = 1;
let diagnosticQuery = '';
let diagnosticStatus = '';
async function renderDiagnostics(page = 1) {
  diagnosticPage = page;
  const form = node('form', 'toolbar');
  const input = node('input'); input.placeholder = '系统、事件、lifeRunId、错误或详情'; input.value = diagnosticQuery;
  const select = node('select');
  [['', '全部状态'], ['error', '错误'], ['warning', '警告'], ['ok', '正常'], ['skipped', '跳过']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; option.selected = value === diagnosticStatus; select.append(option); });
  const submit = node('button', 'command', '查询'); submit.type = 'submit';
  form.append(input, select, submit);
  form.addEventListener('submit', (event) => { event.preventDefault(); diagnosticQuery = input.value; diagnosticStatus = select.value; void renderDiagnostics(1); });
  select.addEventListener('change', () => { diagnosticStatus = select.value; void renderDiagnostics(1); });
  main.replaceChildren(head('系统诊断', '开发环境关键系统边界的明文事件，不含用户操作', form));
  const params = new URLSearchParams({ page: String(page), q: diagnosticQuery, status: diagnosticStatus });
  const data = await api('/api/system-diagnostics?' + params);
  main.append(metrics([
    ['错误', data.byStatus.error || 0, '需要优先检查'],
    ['警告', data.byStatus.warning || 0, '降级、等待或部分拒绝'],
    ['正常', data.byStatus.ok || 0, '已完成边界'],
    ['跳过', data.byStatus.skipped || 0, '带原因的预期跳过'],
  ]));
  const wrap = panel('诊断事件', fmt(data.total) + ' 条 · ' + data.root);
  const rows = node('div', 'rows');
  data.entries.forEach((entry) => {
    const item = node('details', 'row');
    const summary = node('summary');
    const title = node('div', 'row-title');
    title.append(node('strong', '', (entry.system || 'unknown') + ' · ' + (entry.event || 'unknown')), node('span', '', time(entry.timestamp) + (entry.lifeRunId ? ' · ' + entry.lifeRunId : '') + (entry.round ? ' · 第 ' + entry.round + ' 轮' : '')));
    const tags = node('div', 'tags');
    [String(entry.status || 'unknown').toUpperCase(), entry.durationMs !== undefined ? duration(entry.durationMs) : null, entry.sourceFile || null].filter(Boolean).forEach((value) => tags.append(node('span', 'tag', value)));
    summary.append(title, tags);
    const detail = node('div', 'detail'); detail.append(detailBlock('完整诊断事件', json(entry)));
    item.append(summary, detail); rows.append(item);
  });
  if (!data.entries.length) rows.append(node('div', 'empty', '暂无匹配的系统诊断事件'));
  wrap.append(rows, pager(data.page, data.total, data.pageSize, (next) => { void renderDiagnostics(next); })); main.append(wrap);
}

let readonlyQueryPage = 1;
let readonlyQuerySql = 'SELECT * FROM log_entries ORDER BY created_at DESC, rowid DESC';
let readonlyQuerySource = 'logs';
async function renderReadonlyQuery(page = 1) {
  readonlyQueryPage = page;
  const memory = await ensureMemoryIndex();
  const controls = node('form', 'query-form');
  const select = node('select');
  [['logs', '日志数据库'], ['accounts', '账号数据库'], ['player-content', '玩家内容数据库'], ...memory.saves.map((save) => ['memory:' + save.lifeRunId, '记忆 · ' + save.lifeRunId])].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; option.selected = value === readonlyQuerySource; select.append(option); });
  const textarea = node('textarea'); textarea.value = readonlyQuerySql; textarea.spellcheck = false;
  const submit = node('button', 'command', '执行 SELECT'); submit.type = 'submit';
  controls.append(select, textarea, submit);
  controls.addEventListener('submit', (event) => { event.preventDefault(); readonlyQuerySource = select.value; readonlyQuerySql = textarea.value; void runReadonlyQuery(1, controls); });
  main.replaceChildren(head('只读查询', '仅接受 SELECT / WITH；源数据库以 query_only 打开'), controls);
  await runReadonlyQuery(page, controls);
}
async function runReadonlyQuery(page, controls) {
  [...main.querySelectorAll('.query-result')].forEach((element) => element.remove());
  const data = await api('/api/query?source=' + encodeURIComponent(readonlyQuerySource) + '&page=' + page + '&sql=' + encodeURIComponent(readonlyQuerySql));
  const wrap = panel('查询结果', fmt(data.total) + ' 行'); wrap.classList.add('query-result');
  const tableWrap = node('div', 'table-wrap'); const table = node('table');
  const thead = node('thead'); const header = node('tr'); data.columns.forEach((column) => header.append(node('th', '', column))); thead.append(header); table.append(thead);
  const tbody = node('tbody'); data.rows.forEach((entry) => { const row = node('tr'); data.columns.forEach((column) => row.append(node('td', '', typeof entry[column] === 'object' ? json(entry[column]) : String(entry[column] ?? '')))); tbody.append(row); }); table.append(tbody); tableWrap.append(table);
  wrap.append(tableWrap, pager(data.page, data.total, data.pageSize, (next) => { void runReadonlyQuery(next, controls); })); main.append(wrap);
}

render = async function renderEnhanced() {
  try {
    if (active === 'overview') await renderOverview();
    else if (active === 'calls') await renderCalls();
    else if (active === 'rounds') await renderRounds();
    else if (active === 'diagnostics') await renderDiagnostics();
    else if (active === 'memory') await renderMemory();
    else if (active === 'users') await renderUsers();
    else if (active === 'schema') await renderSchema();
    else await renderReadonlyQuery();
  } catch (error) {
    main.replaceChildren(node('div', 'error', error instanceof Error ? error.message : String(error)));
  }
};
render();
`

const servedViewerJs = viewerJs.replaceAll('\n', '\\n') + '\n' + viewerEnhancementJs
const servedViewerCss = viewerCss + `.query-form{display:grid;grid-template-columns:180px minmax(280px,640px) auto;gap:8px;align-items:start}.query-form select,.query-form textarea{width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink);font:12px/1.55 Consolas,"SFMono-Regular",monospace}.query-form textarea{min-height:86px;resize:vertical}.query-result td{max-width:520px;white-space:pre-wrap;font-family:Consolas,"SFMono-Regular",monospace}@media(max-width:820px){.query-form{width:100%;grid-template-columns:1fr}.query-form .command{width:100%}}`

function jsonResponse(response, value, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function textResponse(response, value, contentType) {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(value)
}

export function createDataViewerServer(options) {
  return http.createServer((request, response) => {
    if (request.method !== 'GET') return jsonResponse(response, { error: '只读查看器仅接受 GET' }, 405)
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
      if (url.pathname === '/') return textResponse(response, viewerHtml, 'text/html; charset=utf-8')
      if (url.pathname === '/styles.css') return textResponse(response, servedViewerCss, 'text/css; charset=utf-8')
      if (url.pathname === '/app.js') return textResponse(response, servedViewerJs, 'text/javascript; charset=utf-8')
      if (url.pathname === '/api/overview') return jsonResponse(response, buildDataOverview(options))
      if (url.pathname === '/api/ai-calls') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryAiCalls(options, { ...page, query: url.searchParams.get('q') ?? '', callKind: url.searchParams.get('callKind') ?? '' }))
      }
      if (url.pathname === '/api/rounds') return jsonResponse(response, listRoundArchives(options))
      if (url.pathname === '/api/round') return jsonResponse(response, readRoundArchive(options, url.searchParams.get('lifeRunId'), url.searchParams.get('round')))
      if (url.pathname === '/api/narrative-rounds') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryNarrativeRoundChains(options, {
          ...page,
          query: url.searchParams.get('q') ?? '',
          lifeRunId: url.searchParams.get('lifeRunId') ?? '',
          round: url.searchParams.get('round') ?? '',
        }))
      }
      if (url.pathname === '/api/system-diagnostics') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryDevelopmentSystemDiagnostics(options, {
          ...page,
          query: url.searchParams.get('q') ?? '',
          system: url.searchParams.get('system') ?? '',
          status: url.searchParams.get('status') ?? '',
        }))
      }
      if (url.pathname === '/api/memory') return jsonResponse(response, listMemoryDatabases(options))
      if (url.pathname === '/api/memory/rows') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryMemoryRows(options, { ...page, lifeRunId: url.searchParams.get('lifeRunId'), view: url.searchParams.get('view') ?? 'events' }))
      }
      if (url.pathname === '/api/users') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryUserLinks(options, { ...page, query: url.searchParams.get('q') ?? '' }))
      }
      if (url.pathname === '/api/schema') return jsonResponse(response, inspectDatabaseSchema(options, url.searchParams.get('source') ?? 'logs'))
      if (url.pathname === '/api/query') {
        const page = pageInput(url.searchParams)
        return jsonResponse(response, queryReadonlyDatabase(options, {
          ...page,
          source: url.searchParams.get('source') ?? 'logs',
          sql: url.searchParams.get('sql') ?? '',
        }))
      }
      return jsonResponse(response, { error: '未找到' }, 404)
    } catch (error) {
      return jsonResponse(response, { error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })
}

export function isDirectExecution(argvEntry, moduleUrl = import.meta.url) {
  if (!argvEntry) return false
  return path.resolve(argvEntry) === fileURLToPath(moduleUrl)
}

if (isDirectExecution(process.argv[1])) {
  const options = parseDataViewerArgs(process.argv.slice(2))
  const server = createDataViewerServer(options)
  server.listen(options.port, options.host, () => {
    console.log(`[data-viewer] http://${options.host}:${options.port}`)
    console.log(`[data-viewer] logs=${options.logDatabase}`)
    console.log(`[data-viewer] rounds=${options.roundRoot}`)
    console.log(`[data-viewer] memory=${options.memoryRoot}`)
    console.log(`[data-viewer] diagnostics=${options.diagnosticRoot}`)
  })
}
