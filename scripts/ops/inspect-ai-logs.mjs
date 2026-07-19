#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

function printHelp() {
  console.log(`Usage: node scripts/ops/inspect-ai-logs.mjs [options]

Options:
  --root <path>          Log root (default: AI_LOG_DIR, /var/log/ai-life-sim, or ./logs)
  --since-hours <n>      Inspect the latest n hours (default: 24)
  --all                  Inspect all retained files
  --ip <address>         Filter by exact server-derived source IP
  --request-id <id>      Filter by AI request ID
  --limit <n>            Maximum recent issue rows (default: 20)
  --include-content      Include full sanitized Prompt/response trace records
  --help                 Show this help

The default output excludes full player Prompt and response content.`)
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
    requestId: undefined,
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
    else if (arg === '--request-id') options.requestId = next()
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
  return options
}

async function collectJsonlFiles(root, cutoffMs) {
  const files = []
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
        if (entry.name === 'sources') continue
        await visit(target)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const kind = entry.name.startsWith('proxy-access-')
          ? 'access'
          : entry.name.startsWith('ai-trace-')
            ? 'trace'
            : entry.name.startsWith('client-events-')
              ? 'client'
              : undefined
        if (!kind) continue
        const stat = await fsp.stat(target)
        if (cutoffMs && stat.mtimeMs < cutoffMs - (48 * 60 * 60 * 1000)) continue
        files.push({ path: target, kind })
      }
    }
  }
  await visit(root)
  return files
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

function sourceIp(record) {
  return record.sourceIp ?? record.ip ?? 'unknown'
}

function sourceId(record) {
  return record.sourceId ?? record.source_id ?? 'unknown'
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
    status: record.status,
    provider: request?.providerId,
    model: record.selectedModel ?? request?.model,
    messageCount: messages.length || undefined,
    promptChars: messages.length > 0
      ? messages.reduce((sum, message) => sum + String(message?.content ?? '').length, 0)
      : undefined,
    responseBodyChars: typeof record.responseBody === 'string' ? record.responseBody.length : undefined,
    error: record.error,
    upstreamError: record.upstreamError,
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

  const files = await collectJsonlFiles(options.root, cutoffMs)
  const access = []
  const traces = []
  const clients = []
  for (const file of files) {
    const target = file.kind === 'access' ? access : file.kind === 'trace' ? traces : clients
    await readJsonLines(file.path, cutoffMs, target)
  }

  const requestSources = new Map()
  for (const record of access) requestSources.set(record.request_id, sourceIp(record))
  for (const record of traces) {
    const ip = sourceIp(record)
    if (ip !== 'unknown') requestSources.set(record.requestId, ip)
  }

  const matchesSource = (record, requestIdField) => {
    if (!options.ip) return true
    const direct = sourceIp(record)
    const requestId = record[requestIdField]
    return direct === options.ip || requestSources.get(requestId) === options.ip
  }
  const matchesRequest = (record, field) => !options.requestId || record[field] === options.requestId

  const filteredAccess = access.filter((record) =>
    matchesSource(record, 'request_id') && matchesRequest(record, 'request_id'))
  const filteredTraces = traces.filter((record) =>
    matchesSource(record, 'requestId') && matchesRequest(record, 'requestId'))
  const filteredClients = clients.filter((record) =>
    matchesSource(record, 'requestId') && matchesRequest(record, 'requestId'))

  const statusCounts = {}
  for (const record of filteredAccess) {
    const status = String(record.status ?? 'unknown')
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
  }

  const sources = new Set(filteredAccess.map(sourceIp).filter((ip) => ip !== 'unknown'))
  const proxyIssues = filteredAccess.filter((record) => Number(record.status) !== 200)
  const clientIssues = filteredClients.filter((record) => record.level === 'warn' || record.level === 'error')

  const result = {
    root: options.root,
    window: options.all ? 'all retained logs' : `${options.sinceHours} hours`,
    filters: {
      ip: options.ip,
      requestId: options.requestId,
      includeContent: options.includeContent,
    },
    totals: {
      requests: filteredAccess.length,
      traceEvents: filteredTraces.length,
      clientEvents: filteredClients.length,
      distinctSources: sources.size,
      statusCounts,
    },
    recentProxyIssues: takeRecent(proxyIssues, options.limit).map((record) => ({
      timestamp: record.timestamp,
      requestId: record.request_id,
      sourceIp: sourceIp(record),
      sourceId: sourceId(record),
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
      level: record.level,
      module: record.module,
      eventType: record.eventType,
      path: record.context?.path,
      message: record.message,
      error: record.error,
      rawChars: typeof record.raw === 'string' ? record.raw.length : undefined,
    })),
    traces: (options.requestId || options.includeContent)
      ? takeRecent(filteredTraces, options.limit).map((record) => summarizeTrace(record, options.includeContent))
      : undefined,
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(`[inspect-ai-logs] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
