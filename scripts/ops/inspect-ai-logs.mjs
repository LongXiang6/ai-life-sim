#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'

const gunzipAsync = promisify(gunzip)

function printHelp() {
  console.log(`Usage: node scripts/ops/inspect-ai-logs.mjs [options]

Options:
  --root <path>          Log root (default: AI_LOG_DIR, /var/log/ai-life-sim, or ./logs)
  --since-hours <n>      Inspect the latest n hours (default: 24)
  --all                  Inspect all retained files
  --ip <address>         Filter by exact server-derived source IP
  --player-code <code>   Filter by six-character player diagnostic code
  --request-id <id>      Filter by AI request ID
  --feedback-id <id>     Filter by player feedback ID and correlate its source
  --limit <n>            Maximum recent issue rows (default: 20)
  --include-content      Include full sanitized Prompt/response trace records
  --help                 Show this help

The default output excludes full player Prompt, response, story, and feedback content.`)
}

function defaultRoot() {
  const candidates = [
    process.env.AI_LOG_DIR,
    '/var/log/ai-life-sim',
    path.join(process.cwd(), 'logs'),
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates.at(-1)
}

function parseArgs(argv) {
  const options = {
    root: defaultRoot(),
    sinceHours: 24,
    all: false,
    ip: undefined,
    playerCode: undefined,
    requestId: undefined,
    feedbackId: undefined,
    limit: 20,
    includeContent: false,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} 缺少参数`)
      return value
    }
    if (arg === '--root') options.root = path.resolve(next())
    else if (arg === '--since-hours') options.sinceHours = Number(next())
    else if (arg === '--all') options.all = true
    else if (arg === '--ip') options.ip = next()
    else if (arg === '--player-code') options.playerCode = next().trim().toUpperCase()
    else if (arg === '--request-id') options.requestId = next()
    else if (arg === '--feedback-id') options.feedbackId = next()
    else if (arg === '--limit') options.limit = Number(next())
    else if (arg === '--include-content') options.includeContent = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }

  if (!options.all && (!Number.isFinite(options.sinceHours) || options.sinceHours <= 0)) {
    throw new Error('--since-hours 必须为正数')
  }
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
    throw new Error('--limit 必须为正整数')
  }
  if (options.playerCode && !/^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{6}$/.test(options.playerCode)) {
    throw new Error('--player-code 必须为六位大写字母与数字')
  }
  return options
}

function safeLogSegment(value) {
  const normalized = String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  return normalized.slice(0, 96) || 'unknown'
}

function classifyJsonlFile(name) {
  if (name.startsWith('proxy-access-')) return 'access'
  if (name.startsWith('ai-trace-') || name.startsWith('trace-index-')) return 'trace'
  if (name.startsWith('client-events-')) return 'client'
  if (name.startsWith('feedback-')) return 'feedback'
  if (name.startsWith('ai-debug-') || name.startsWith('ai-debug-index-')) return 'debug'
  if (name.startsWith('raw-responses-')) return 'raw'
  return undefined
}

function resolveScanRoot(root, options) {
  if (options.playerCode) {
    const playerRoot = path.join(root, 'players', options.playerCode)
    if (fs.existsSync(playerRoot)) return { path: playerRoot, indexesOnly: true }
  }
  if (options.ip) {
    const sourceRoot = path.join(root, 'sources', `ip-${safeLogSegment(options.ip)}`)
    if (fs.existsSync(sourceRoot)) return { path: sourceRoot, indexesOnly: true }
  }
  return { path: root, indexesOnly: false }
}

async function collectJsonlFiles(root, cutoffMs, options) {
  const files = []
  const scan = resolveScanRoot(root, options)
  async function visit(dir) {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (
          !scan.indexesOnly
          && ['sources', 'players', 'diagnostic-identities', 'content'].includes(entry.name)
        ) continue
        await visit(target)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const kind = classifyJsonlFile(entry.name)
        if (!kind) continue
        const stat = await fsp.stat(target)
        if (cutoffMs && stat.mtimeMs < cutoffMs - (48 * 60 * 60 * 1000)) continue
        files.push({ path: target, kind })
      }
    }
  }
  await visit(scan.path)
  return files
}

function isContentRef(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.storage === 'sha256-gzip'
    && value.algorithm === 'sha256'
    && typeof value.path === 'string'
    && (value.format === 'json' || value.format === 'text'),
  )
}

async function readContentRef(root, reference) {
  if (!isContentRef(reference)) return undefined
  const target = path.resolve(root, reference.path)
  const resolvedRoot = path.resolve(root)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`内容引用越界：${reference.path}`)
  }
  const serialized = await gunzipAsync(await fsp.readFile(target))
  const digest = createHash('sha256')
    .update(reference.format)
    .update('\0')
    .update(serialized)
    .digest('hex')
  if (digest !== reference.hash) throw new Error(`内容哈希校验失败：${reference.path}`)
  const text = serialized.toString('utf8')
  return reference.format === 'json' ? JSON.parse(text) : text
}

const CONTENT_REF_FIELDS = {
  requestRef: 'request',
  responseRef: 'responseBody',
  rawRequestRef: 'rawRequestBody',
  argsRef: 'args',
  contextRef: 'context',
  rawRef: 'raw',
  promptRef: 'prompt',
  metaRef: 'meta',
  submissionRef: 'submission',
}

async function hydrateRecordContent(root, record) {
  const hydrated = { ...record }
  await Promise.all(Object.entries(CONTENT_REF_FIELDS).map(async ([refField, contentField]) => {
    if (!isContentRef(record[refField])) return
    hydrated[contentField] = await readContentRef(root, record[refField])
  }))
  return hydrated
}

function timestampMs(record) {
  const raw = record.timestamp ?? record.receivedAt
  const numeric = typeof raw === 'number' ? raw : Date.parse(String(raw ?? ''))
  return Number.isFinite(numeric) ? numeric : 0
}

async function readJsonLines(file, cutoffMs, output) {
  const input = fs.createReadStream(file, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (!cutoffMs || timestampMs(record) >= cutoffMs) output.push(record)
    } catch {
      // A partially written terminal line is ignored; the source file remains available for inspection.
    }
  }
}

async function readFeedbackSubmission(root, feedbackId) {
  const submissionsRoot = path.join(root, 'feedback', 'submissions')
  let dates
  try {
    dates = await fsp.readdir(submissionsRoot, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of dates) {
    if (!entry.isDirectory()) continue
    const target = path.join(submissionsRoot, entry.name, `${feedbackId}.json`)
    try {
      return JSON.parse(await fsp.readFile(target, 'utf8'))
    } catch {
      // Continue searching retained date directories.
    }
  }
  return undefined
}

function sourceIp(record) {
  return record.sourceIp ?? record.ip ?? 'unknown'
}

function sourceId(record) {
  return record.sourceId ?? record.source_id ?? 'unknown'
}

function diagnosticCode(record) {
  return record.diagnosticCode ?? record.diagnostic_code
}

function summarizeTrace(record, includeContent) {
  if (includeContent) return record
  const request = record.request && typeof record.request === 'object' ? record.request : undefined
  const messages = Array.isArray(request?.messages) ? request.messages : []
  return {
    timestamp: record.timestamp,
    requestId: record.requestId,
    event: record.event,
    sourceIp: sourceIp(record),
    sourceId: sourceId(record),
    diagnosticCode: diagnosticCode(record),
    status: record.status,
    provider: record.provider ?? request?.providerId,
    model: record.selectedModel ?? record.requestedModel ?? request?.model,
    messageCount: (record.requestMessageCount ?? messages.length) || undefined,
    promptChars: record.requestPromptChars ?? (messages.length > 0
      ? messages.reduce((sum, message) => sum + String(message?.content ?? '').length, 0)
      : undefined),
    responseBodyChars: record.responseBodyChars
      ?? (typeof record.responseBody === 'string' ? record.responseBody.length : undefined),
    error: record.error,
    upstreamError: record.upstreamError,
    contentWriteFailed: record.contentWriteFailed,
  }
}

function takeRecent(records, limit) {
  return [...records].sort((a, b) => timestampMs(b) - timestampMs(a)).slice(0, limit)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const cutoffMs = options.all ? 0 : Date.now() - options.sinceHours * 60 * 60 * 1000
  if (!fs.existsSync(options.root)) {
    throw new Error(`日志目录不存在：${options.root}`)
  }

  const files = await collectJsonlFiles(options.root, cutoffMs, options)
  const access = []
  const traces = []
  const clients = []
  const feedback = []
  const debug = []
  const rawResponses = []
  for (const file of files) {
    const target = file.kind === 'access'
      ? access
      : file.kind === 'trace'
        ? traces
        : file.kind === 'feedback'
          ? feedback
          : file.kind === 'debug'
            ? debug
            : file.kind === 'raw'
              ? rawResponses
              : clients
    await readJsonLines(file.path, cutoffMs, target)
  }

  const filteredFeedback = feedback.filter((record) =>
    (!options.ip || sourceIp(record) === options.ip)
    && (!options.playerCode || diagnosticCode(record) === options.playerCode)
    && (!options.requestId || record.requestId === options.requestId)
    && (!options.feedbackId || record.feedbackId === options.feedbackId))
  const feedbackSources = new Set(filteredFeedback.map(sourceIp).filter((ip) => ip !== 'unknown'))

  const requestSources = new Map()
  const requestPlayers = new Map()
  for (const record of access) requestSources.set(record.request_id, sourceIp(record))
  for (const record of access) {
    const code = diagnosticCode(record)
    if (code) requestPlayers.set(record.request_id, code)
  }
  for (const record of traces) {
    const ip = sourceIp(record)
    if (ip !== 'unknown') requestSources.set(record.requestId, ip)
    const code = diagnosticCode(record)
    if (code) requestPlayers.set(record.requestId, code)
  }

  const matchesSource = (record, requestIdField) => {
    if (!options.ip && !options.feedbackId) return true
    const direct = sourceIp(record)
    const requestId = record[requestIdField]
    return direct === options.ip
      || requestSources.get(requestId) === options.ip
      || feedbackSources.has(direct)
      || feedbackSources.has(requestSources.get(requestId))
  }
  const matchesPlayer = (record, requestIdField) => {
    if (!options.playerCode) return true
    const requestId = record[requestIdField]
    return diagnosticCode(record) === options.playerCode
      || requestPlayers.get(requestId) === options.playerCode
  }
  const matchesRequest = (record, field) => !options.requestId || record[field] === options.requestId

  const filteredAccess = access.filter((record) =>
    matchesSource(record, 'request_id')
      && matchesPlayer(record, 'request_id')
      && matchesRequest(record, 'request_id'))
  const filteredTraces = traces.filter((record) =>
    matchesSource(record, 'requestId')
      && matchesPlayer(record, 'requestId')
      && matchesRequest(record, 'requestId'))
  const filteredClients = clients.filter((record) =>
    matchesSource(record, 'requestId')
      && matchesPlayer(record, 'requestId')
      && matchesRequest(record, 'requestId'))
  const filteredDebug = debug.filter((record) =>
    matchesSource(record, 'requestId')
      && matchesPlayer(record, 'requestId')
      && matchesRequest(record, 'requestId'))
  const filteredRawResponses = rawResponses.filter((record) =>
    matchesSource(record, 'requestId')
      && matchesPlayer(record, 'requestId')
      && matchesRequest(record, 'requestId'))

  const statusCounts = {}
  for (const record of filteredAccess) {
    const status = String(record.status ?? 'unknown')
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
  }

  const sources = new Set(filteredAccess.map(sourceIp).filter((ip) => ip !== 'unknown'))
  const proxyIssues = filteredAccess.filter((record) => Number(record.status) !== 200)
  const clientIssues = filteredClients.filter((record) => record.level === 'warn' || record.level === 'error')
  const debugIssues = filteredDebug.filter((record) => (
    record.failed === true
    || record.validationPassed === false
    || Boolean(record.failureReason)
    || Boolean(record.validationError)
  ))

  const selectedFeedbackRecord = options.feedbackId
    ? filteredFeedback.find((record) => record.feedbackId === options.feedbackId)
    : undefined
  let feedbackContent
  if (options.feedbackId && options.includeContent) {
    if (selectedFeedbackRecord?.submissionRef) {
      feedbackContent = (await hydrateRecordContent(options.root, selectedFeedbackRecord)).submission
    } else {
      feedbackContent = await readFeedbackSubmission(options.root, options.feedbackId)
    }
  }

  const hydratedTraces = options.includeContent
    ? await Promise.all(takeRecent(filteredTraces, options.limit).map((record) => (
      hydrateRecordContent(options.root, record)
    )))
    : undefined
  const hydratedClients = options.includeContent
    ? await Promise.all(takeRecent(filteredClients, options.limit).map((record) => (
      hydrateRecordContent(options.root, record)
    )))
    : undefined
  const hydratedDebug = options.includeContent
    ? await Promise.all(takeRecent(filteredDebug, options.limit).map((record) => (
      hydrateRecordContent(options.root, record)
    )))
    : undefined
  const hydratedRawResponses = options.includeContent
    ? await Promise.all(takeRecent(filteredRawResponses, options.limit).map((record) => (
      hydrateRecordContent(options.root, record)
    )))
    : undefined

  const result = {
    root: options.root,
    window: options.all ? 'all retained logs' : `${options.sinceHours} hours`,
    filters: {
      ip: options.ip,
      playerCode: options.playerCode,
      requestId: options.requestId,
      feedbackId: options.feedbackId,
      includeContent: options.includeContent,
    },
    totals: {
      requests: filteredAccess.length,
      traceEvents: filteredTraces.length,
      clientEvents: filteredClients.length,
      debugEvents: filteredDebug.length,
      rawResponses: filteredRawResponses.length,
      feedbackSubmissions: filteredFeedback.length,
      distinctSources: sources.size,
      statusCounts,
    },
    recentProxyIssues: takeRecent(proxyIssues, options.limit).map((record) => ({
      timestamp: record.timestamp,
      requestId: record.request_id,
      sourceIp: sourceIp(record),
      sourceId: sourceId(record),
      diagnosticCode: diagnosticCode(record),
      provider: record.provider,
      model: record.model,
      status: record.status,
      durationMs: record.duration_ms,
      retryCount: record.retry_count,
      error: record.error,
    })),
    recentClientIssues: takeRecent(clientIssues, options.limit).map((record) => ({
      timestamp: record.timestamp,
      receivedAt: record.receivedAt,
      requestId: record.requestId,
      sourceIp: sourceIp(record),
      sourceId: sourceId(record),
      diagnosticCode: diagnosticCode(record),
      level: record.level,
      module: record.module,
      eventType: record.eventType,
      path: record.path ?? record.context?.path,
      message: record.message,
      error: record.error,
      rawChars: record.rawChars ?? (typeof record.raw === 'string' ? record.raw.length : undefined),
    })),
    recentDebugIssues: takeRecent(debugIssues, options.limit).map((record) => ({
      timestamp: record.timestamp,
      requestId: record.requestId,
      sourceIp: sourceIp(record),
      sourceId: sourceId(record),
      diagnosticCode: diagnosticCode(record),
      category: record.category,
      round: record.round,
      age: record.age,
      model: record.model,
      callKind: record.callKind,
      failed: record.failed,
      failureReason: record.failureReason,
      validationPassed: record.validationPassed,
      validationError: record.validationError,
      promptChars: record.promptChars,
      responseChars: record.responseChars,
    })),
    recentRawResponses: takeRecent(filteredRawResponses, options.limit).map((record) => ({
      timestamp: record.timestamp,
      requestId: record.requestId,
      sourceIp: sourceIp(record),
      sourceId: sourceId(record),
      diagnosticCode: diagnosticCode(record),
      provider: record.provider,
      model: record.model,
      status: record.status,
      responseChars: record.responseChars,
    })),
    recentFeedback: takeRecent(filteredFeedback, options.limit).map((record) => ({
      feedbackId: record.feedbackId,
      receivedAt: record.receivedAt,
      sourceIp: sourceIp(record),
      sourceId: sourceId(record),
      diagnosticCode: diagnosticCode(record),
      category: record.category,
      subject: record.subject,
      page: record.page,
      appVersion: record.appVersion,
      diagnosticSessionId: record.diagnosticSessionId,
      recentStoryEntries: record.recentStoryEntries,
      recentStoryChars: record.recentStoryChars,
      recentClientLogEntries: record.recentClientLogEntries,
    })),
    recentRequests: options.playerCode
      ? takeRecent(filteredAccess, options.limit).map((record) => ({
        timestamp: record.timestamp,
        requestId: record.request_id,
        diagnosticCode: diagnosticCode(record),
        provider: record.provider,
        model: record.model,
        status: record.status,
        durationMs: record.duration_ms,
        retryCount: record.retry_count,
      }))
      : undefined,
    recentClientEvents: options.playerCode
      ? takeRecent(filteredClients, options.limit).map((record) => ({
        timestamp: record.timestamp,
        receivedAt: record.receivedAt,
        requestId: record.requestId,
        diagnosticCode: diagnosticCode(record),
        level: record.level,
        module: record.module,
        eventType: record.eventType,
        action: record.action,
        path: record.path ?? record.context?.path,
        message: record.message,
        error: record.error,
      }))
      : undefined,
    recentDebugEvents: options.playerCode
      ? takeRecent(filteredDebug, options.limit).map((record) => ({
        timestamp: record.timestamp,
        requestId: record.requestId,
        diagnosticCode: diagnosticCode(record),
        category: record.category,
        round: record.round,
        age: record.age,
        model: record.model,
        callKind: record.callKind,
        failed: record.failed,
        validationPassed: record.validationPassed,
        promptChars: record.promptChars,
        responseChars: record.responseChars,
      }))
      : undefined,
    feedbackContent,
    traces: (options.requestId || options.playerCode || options.includeContent)
      ? (hydratedTraces ?? takeRecent(filteredTraces, options.limit))
        .map((record) => summarizeTrace(record, options.includeContent))
      : undefined,
    clientEvents: options.includeContent ? hydratedClients : undefined,
    debugEvents: options.includeContent ? hydratedDebug : undefined,
    rawResponseContent: options.includeContent ? hydratedRawResponses : undefined,
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(`[inspect-ai-logs] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
