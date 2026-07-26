#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

import {
  buildCanonicalStoryRepetitionSet,
  summarizeStoryRepetitionRows,
} from './lib/story-repetition-analytics.mjs'

const FEEDBACK_STATUS_LABELS = {
  new: '待处理',
  in_progress: '处理中',
  resolved: '已完成',
  rejected: '已拒绝',
  duplicate: '重复反馈',
  reopened: '已重新打开',
}

function defaultDatabasePath() {
  const candidates = [
    process.env.AI_LOG_DB_PATH,
    process.env.AI_LOG_DIR ? path.join(process.env.AI_LOG_DIR, 'logs.sqlite') : undefined,
    '/var/lib/ai-life-sim/logs.sqlite',
    '/var/log/ai-life-sim/logs.sqlite',
    path.join(process.cwd(), '.data', 'logs.sqlite'),
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates.at(-1)
}

function databasePathFromRoot(value) {
  const resolved = path.resolve(value)
  if (path.extname(resolved).toLowerCase() === '.sqlite') return resolved
  return path.join(resolved, 'logs.sqlite')
}

function printHelp() {
  console.log(`Usage: node scripts/ops/inspect-ai-logs.mjs [options]

Options:
  --database <path>      Plaintext SQLite log database
  --root <path>          Compatibility alias: directory containing logs.sqlite
  --since-hours <n>      Inspect the latest n hours (default: 24)
  --all                  Inspect all retained rows
  --ip <address>         Filter by exact server-derived source IP
  --player-code <code>   Filter by six-character diagnostic code
  --device-id <id>       Filter by stable device provenance ID
  --account-id <id>      Filter by registered account ID
  --username <name>      Filter by exact registered username
  --request-id <id>      Filter by AI request ID
  --feedback-id <id>     Filter by feedback ID
  --entry-type <type>    Filter by log entry type
  --limit <n>            Maximum recent rows in each list (default: 20)
  --include-content      Compatibility flag; plaintext content is always included
  --help                 Show this help`)
}

function parseArgs(argv) {
  const options = {
    database: defaultDatabasePath(),
    sinceHours: 24,
    all: false,
    ip: undefined,
    playerCode: undefined,
    deviceId: undefined,
    accountId: undefined,
    username: undefined,
    requestId: undefined,
    feedbackId: undefined,
    entryType: undefined,
    limit: 20,
    includeContent: true,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} 缺少参数`)
      return value
    }
    if (arg === '--database') options.database = path.resolve(next())
    else if (arg === '--root') options.database = databasePathFromRoot(next())
    else if (arg === '--since-hours') options.sinceHours = Number(next())
    else if (arg === '--all') options.all = true
    else if (arg === '--ip') options.ip = next()
    else if (arg === '--player-code') options.playerCode = next().trim().toUpperCase()
    else if (arg === '--device-id') options.deviceId = next().trim().toUpperCase()
    else if (arg === '--account-id') options.accountId = next()
    else if (arg === '--username') options.username = next()
    else if (arg === '--request-id') options.requestId = next()
    else if (arg === '--feedback-id') options.feedbackId = next()
    else if (arg === '--entry-type') options.entryType = next()
    else if (arg === '--limit') options.limit = Number(next())
    else if (arg === '--include-content') options.includeContent = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else throw new Error(`未知参数：${arg}`)
  }
  if (!options.all && (!Number.isFinite(options.sinceHours) || options.sinceHours <= 0)) {
    throw new Error('--since-hours 必须为正数')
  }
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) throw new Error('--limit 必须为正整数')
  if (options.playerCode && !/^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{6}$/u.test(options.playerCode)) {
    throw new Error('--player-code 必须为六位大写字母与数字')
  }
  return options
}

function parseJson(value) {
  if (value === null || value === undefined) return null
  try { return JSON.parse(value) } catch { return value }
}

function mapRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    timestamp: new Date(row.created_at).toISOString(),
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
    deviceProvenanceId: row.device_provenance_id ?? null,
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
    meta_json: row.meta_json,
    payload_json: row.payload_json,
  }
}

function payloadRecord(entry) {
  const payload = entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
    ? entry.payload
    : {}
  return {
    ...payload,
    id: entry.id,
    timestamp: payload.timestamp ?? entry.timestamp,
    receivedAt: payload.receivedAt ?? entry.createdAt,
    requestId: payload.requestId ?? entry.requestId,
    request_id: payload.request_id ?? entry.requestId,
    sourceIp: entry.sourceIp,
    sourceId: entry.sourceId,
    diagnosticCode: entry.diagnosticCode,
    isRegistered: entry.isRegistered,
    accountId: entry.accountId,
    username: entry.username,
    feedbackId: entry.feedbackId ?? payload.feedbackId,
    level: entry.level ?? payload.level,
    module: entry.module ?? payload.module,
    message: entry.message ?? payload.message,
    eventType: entry.event ?? payload.eventType,
    category: entry.category ?? payload.category,
    status: entry.status ?? payload.status,
    provider: entry.provider ?? payload.provider,
    model: entry.model ?? payload.model,
    prompt: entry.prompt,
    response: entry.response,
    error: entry.error ?? payload.error,
    stack: entry.stack ?? payload.stack,
    meta: entry.meta,
  }
}

function takeRecent(rows, limit) {
  return [...rows].sort((left, right) => right.createdAt - left.createdAt).slice(0, limit)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(options.database)) throw new Error(`日志数据库不存在：${options.database}`)
  const database = new Database(options.database, { readonly: true, fileMustExist: true })
  try {
    const clauses = []
    const values = []
    if (!options.all) {
      clauses.push('created_at >= ?')
      values.push(Date.now() - options.sinceHours * 60 * 60 * 1000)
    }
    for (const [column, value] of [
      ['source_ip', options.ip],
      ['diagnostic_code', options.playerCode],
      ['device_provenance_id', options.deviceId],
      ['account_id', options.accountId],
      ['username', options.username],
      ['request_id', options.requestId],
      ['feedback_id', options.feedbackId],
      ['entry_type', options.entryType],
    ]) {
      if (value === undefined) continue
      clauses.push(`${column} = ?`)
      values.push(value)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    let rows = database.prepare(`SELECT * FROM log_entries ${where} ORDER BY created_at DESC, rowid DESC`).all(...values).map(mapRow)

    const relatedFeedbackIds = [...new Set(rows.map((entry) => entry.feedbackId).filter(Boolean))]
    if (relatedFeedbackIds.length > 0) {
      const placeholders = relatedFeedbackIds.map(() => '?').join(', ')
      const relatedStatusRows = database.prepare(`
        SELECT * FROM log_entries
        WHERE entry_type = 'feedback-status' AND feedback_id IN (${placeholders})
        ORDER BY created_at DESC, rowid DESC
      `).all(...relatedFeedbackIds).map(mapRow)
      const rowIds = new Set(rows.map((entry) => entry.id))
      rows = [...rows, ...relatedStatusRows.filter((entry) => !rowIds.has(entry.id))]
        .sort((left, right) => right.createdAt - left.createdAt)
    }

    const access = rows.filter((entry) => entry.entryType === 'proxy-access')
    const traces = rows.filter((entry) => entry.entryType === 'proxy-trace')
    const clients = rows.filter((entry) => entry.entryType === 'client-log' || entry.entryType === 'quality-metric')
    const debug = rows.filter((entry) => entry.entryType === 'ai-call')
    const rawResponses = rows.filter((entry) => entry.entryType === 'raw-response')
    const feedback = rows.filter((entry) => entry.entryType === 'feedback')
    const feedbackStatus = rows.filter((entry) => entry.entryType === 'feedback-status')
    const accessPayloads = access.map(payloadRecord)
    const clientPayloads = clients.map(payloadRecord)
    const canonicalRepetition = buildCanonicalStoryRepetitionSet(clientPayloads)

    const statusCounts = {}
    for (const entry of access) {
      const key = String(entry.status ?? 'unknown')
      statusCounts[key] = (statusCounts[key] ?? 0) + 1
    }
    const latestFeedbackStatus = new Map()
    for (const entry of [...feedbackStatus].sort((a, b) => a.createdAt - b.createdAt)) {
      latestFeedbackStatus.set(entry.feedbackId, payloadRecord(entry))
    }
    const feedbackStatusCounts = { new: 0 }
    for (const entry of feedback) {
      const status = latestFeedbackStatus.get(entry.feedbackId)?.status ?? 'new'
      feedbackStatusCounts[status] = (feedbackStatusCounts[status] ?? 0) + 1
    }
    const distinctSources = new Set(rows.map((entry) => entry.sourceId).filter(Boolean)).size

    const result = {
      database: options.database,
      window: options.all ? 'all retained rows' : `${options.sinceHours} hours`,
      filters: {
        ip: options.ip,
        playerCode: options.playerCode,
        deviceId: options.deviceId,
        accountId: options.accountId,
        username: options.username,
        requestId: options.requestId,
        feedbackId: options.feedbackId,
        entryType: options.entryType,
      },
      totals: {
        entries: rows.length,
        requests: access.length,
        traceEvents: traces.length,
        clientEvents: clients.length,
        debugEvents: debug.length,
        rawResponses: rawResponses.length,
        feedbackSubmissions: feedback.length,
        feedbackStatusEvents: feedbackStatus.length,
        feedbackStatusCounts,
        registeredEntries: rows.filter((entry) => entry.isRegistered).length,
        anonymousEntries: rows.filter((entry) => !entry.isRegistered).length,
        distinctSources,
        statusCounts,
        storyRepetition: summarizeStoryRepetitionRows(canonicalRepetition.rows),
      },
      recentProxyIssues: takeRecent(access.filter((entry) => entry.status !== 200), options.limit),
      recentClientIssues: takeRecent(clients.filter((entry) => entry.level === 'warn' || entry.level === 'error'), options.limit),
      recentDebugIssues: takeRecent(debug.filter((entry) => entry.level === 'error' || entry.error), options.limit),
      recentRawResponses: takeRecent(rawResponses, options.limit),
      recentFeedback: takeRecent(feedback, options.limit).map((entry) => {
        const status = latestFeedbackStatus.get(entry.feedbackId)?.status ?? 'new'
        return {
          ...entry,
          status,
          statusLabel: FEEDBACK_STATUS_LABELS[status],
          statusUpdatedAt: latestFeedbackStatus.get(entry.feedbackId)?.timestamp ?? null,
        }
      }),
      recentFeedbackStatusEvents: takeRecent(feedbackStatus, options.limit).map(payloadRecord),
      recentRequests: takeRecent(access, options.limit),
      recentClientEvents: takeRecent(clients, options.limit),
      recentDebugEvents: takeRecent(debug, options.limit),
      storyRepetition: options.playerCode || options.accountId
        ? summarizeStoryRepetitionRows(canonicalRepetition.rows, { includePerGame: true })
        : undefined,
      feedbackContent: options.feedbackId ? feedback[0]?.payload ?? null : undefined,
      traces: takeRecent(traces, options.limit),
      clientEvents: takeRecent(clients, options.limit),
      debugEvents: takeRecent(debug, options.limit),
      rawResponseContent: takeRecent(rawResponses, options.limit),
      entries: takeRecent(rows, options.limit),
      accessPayloads: takeRecent(accessPayloads.map((payload, index) => ({ ...payload, createdAt: access[index]?.createdAt ?? 0 })), options.limit),
    }
    console.log(JSON.stringify(result, null, 2))
  } finally {
    database.close()
  }
}

try {
  main()
} catch (error) {
  console.error(`[inspect-ai-logs] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
