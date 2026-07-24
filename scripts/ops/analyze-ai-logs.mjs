#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import {
  buildCanonicalStoryRepetitionSet,
  diagnosticCodeOf,
  operationalTimestamp,
  summarizeStoryRepetitionRows,
} from './lib/story-repetition-analytics.mjs'
import { classifyUpstreamError } from './lib/error-classification.mjs'

const DEFAULT_ROOT = process.env.AI_LOG_DIR || '/var/log/ai-life-sim'
const DEFAULT_SINCE_HOURS = 24
const DEFAULT_BUCKET_MINUTES = 60
const DEFAULT_TOP = 10
const DEFAULT_MIN_TERM_COUNT = 3
const TIME_ZONE = 'Asia/Shanghai'

function printHelp() {
  console.log(`Usage: node scripts/ops/analyze-ai-logs.mjs [options]

Options:
  --root <path>              Log root (default: AI_LOG_DIR or /var/log/ai-life-sim)
  --since-hours <n>          Inspect the latest n hours (default: 24)
  --from <ISO>               Inclusive start time; overrides --since-hours
  --to <ISO>                 Exclusive end time (default: now)
  --compare-at <ISO>         Split the window into before/after release slices
  --player-code <code>       Filter to one player diagnostic code; the code is not printed
  --bucket-minutes <n>       Traffic bucket size (default: 60)
  --top <n>                  Number of top rows (default: 10)
  --min-term-count <n>       Minimum branch-term cohort count (default: 3)
  --help                     Show this help

The report is aggregate-only: it does not print IPs, diagnostic codes, account IDs,
raw messages, story text, Prompt content, or low-frequency branch terms.`)
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    sinceHours: DEFAULT_SINCE_HOURS,
    from: undefined,
    to: undefined,
    compareAt: undefined,
    playerCode: undefined,
    bucketMinutes: DEFAULT_BUCKET_MINUTES,
    top: DEFAULT_TOP,
    minTermCount: DEFAULT_MIN_TERM_COUNT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { ...options, help: true }
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} 缺少参数`)
      return value
    }
    if (arg === '--root') options.root = path.resolve(next())
    else if (arg === '--since-hours') options.sinceHours = Number(next())
    else if (arg === '--from') options.from = next()
    else if (arg === '--to') options.to = next()
    else if (arg === '--compare-at') options.compareAt = next()
    else if (arg === '--player-code') options.playerCode = next().trim().toUpperCase()
    else if (arg === '--bucket-minutes') options.bucketMinutes = Number(next())
    else if (arg === '--top') options.top = Number(next())
    else if (arg === '--min-term-count') options.minTermCount = Number(next())
    else throw new Error(`未知参数：${arg}`)
  }
  if (!Number.isFinite(options.sinceHours) || options.sinceHours <= 0) throw new Error('--since-hours 必须为正数')
  if (options.playerCode && !/^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{6}$/u.test(options.playerCode)) {
    throw new Error('--player-code 必须为六位大写字母与数字')
  }
  for (const [key, value] of [['bucket-minutes', options.bucketMinutes], ['top', options.top], ['min-term-count', options.minTermCount]]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${key} 必须为正整数`)
  }
  return options
}

function parseTimestamp(value, label) {
  const parsed = Date.parse(String(value))
  if (!Number.isFinite(parsed)) throw new Error(`${label} 不是有效的 ISO-8601 时间`)
  return parsed
}

function resolveWindow(options, nowMs = Date.now()) {
  const fromMs = options.from ? parseTimestamp(options.from, '--from') : nowMs - options.sinceHours * 60 * 60 * 1000
  const toMs = options.to ? parseTimestamp(options.to, '--to') : nowMs
  if (fromMs >= toMs) throw new Error('日志窗口必须满足 from < to')
  const compareAtMs = options.compareAt ? parseTimestamp(options.compareAt, '--compare-at') : undefined
  if (compareAtMs !== undefined && (compareAtMs <= fromMs || compareAtMs >= toMs)) {
    throw new Error('--compare-at 必须位于日志窗口内部')
  }
  return { fromMs, toMs, compareAtMs }
}

function classifyFile(name) {
  if (name.startsWith('proxy-access-')) return 'access'
  if (name.startsWith('client-events-')) return 'client'
  return undefined
}

async function collectFiles(root) {
  const files = []
  for (const kind of ['proxy-access', 'client-events']) {
    const directory = path.join(root, kind)
    let entries
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fileKind = classifyFile(entry.name)
      if (fileKind) files.push({ path: path.join(directory, entry.name), kind: fileKind })
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function readRecords(file, window, target) {
  const input = fs.createReadStream(file.path, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      const timestamp = operationalTimestamp(record)
      if (timestamp >= window.fromMs && timestamp < window.toMs) {
        target.push({ ...record, _kind: file.kind, _timestamp: timestamp, _sequence: target.length })
      }
    } catch {
      // Ignore a partially written terminal line; the source file remains inspectable.
    }
  }
}

function increment(map, key, amount = 1) {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + amount)
}

function sortedMap(map, limit) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }))
}

function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index]
}

function average(values) {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function localParts(timestamp) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(timestamp))
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

function localHour(timestamp) {
  return Number(localParts(timestamp).hour)
}

function bucketLabel(timestamp, bucketMinutes) {
  const bucketMs = bucketMinutes * 60 * 1000
  const parts = localParts(Math.floor(timestamp / bucketMs) * bucketMs)
  const minute = String(Math.floor(Number(parts.minute) / bucketMinutes) * bucketMinutes).padStart(2, '0')
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${minute}`
}

function metricOf(record) {
  return record.metric && typeof record.metric === 'object' ? record.metric : undefined
}

function playerKey(record) {
  const code = diagnosticCodeOf(record)
  return code ? `code:${code}` : undefined
}

function summarize(records, options, storyRepetitionRows) {
  const access = records.filter((record) => record._kind === 'access')
  const client = records.filter((record) => record._kind === 'client')
  const statusCounts = new Map()
  const errorCounts = new Map()
  const providers = new Map()
  const models = new Map()
  const latency = []
  const promptChars = []
  const requestPlayers = new Set()
  const metricPlayers = new Set()
  const bucketMap = new Map()
  const hourMap = Array.from({ length: 24 }, (_, hour) => ({ hour, requests: 0, pageViews: 0, narrativeAdvances: 0, players: new Set() }))
  const pageViews = new Map()
  const timeSteps = new Map()
  const branchTypes = new Map()
  const branchTerms = new Map()
  const metricKinds = new Map()

  for (const record of access) {
    increment(statusCounts, String(record.status ?? 'unknown'))
    increment(providers, record.provider ?? 'unknown')
    increment(models, record.model ?? 'unknown')
    const duration = Number(record.duration_ms)
    if (Number.isFinite(duration) && duration >= 0) latency.push(duration)
    const prompt = Number(record.prompt_chars)
    if (Number.isFinite(prompt) && prompt >= 0) promptChars.push(prompt)
    const player = playerKey(record)
    if (player) requestPlayers.add(player)
    const bucket = bucketLabel(record._timestamp, options.bucketMinutes)
    const bucketRow = bucketMap.get(bucket) ?? { bucket, requests: 0, failures: 0, players: new Set() }
    bucketRow.requests += 1
    if (Number(record.status) < 200 || Number(record.status) >= 400) bucketRow.failures += 1
    if (player) bucketRow.players.add(player)
    bucketMap.set(bucket, bucketRow)
    const hour = hourMap[localHour(record._timestamp)]
    hour.requests += 1
    if (player) hour.players.add(player)
    const normalizedError = classifyUpstreamError(record.error)
    if (Number(record.status) < 200 || Number(record.status) >= 400) increment(errorCounts, normalizedError ?? `http_${record.status}`)
  }

  for (const record of client) {
    const metric = metricOf(record)
    if (!metric) continue
    increment(metricKinds, metric.kind)
    const player = playerKey(record)
    if (player) metricPlayers.add(player)
    const hour = hourMap[localHour(record._timestamp)]
    if (player) hour.players.add(player)
    if (metric.kind === 'page_view') {
      const page = typeof metric.page === 'string' && metric.page.startsWith('/') ? metric.page : '/unknown'
      increment(pageViews, page)
      hour.pageViews += 1
    }
    if (metric.kind === 'narrative_advance') {
      increment(timeSteps, typeof metric.timeStepKey === 'string' ? metric.timeStepKey : 'unknown')
      hour.narrativeAdvances += 1
    }
    if (metric.kind === 'time_step_selected') increment(timeSteps, typeof metric.timeStepKey === 'string' ? metric.timeStepKey : 'unknown')
    if (metric.kind === 'branch_choice') {
      increment(branchTypes, metric.branchChoiceType === 'custom' ? 'custom' : 'preset')
      if (Array.isArray(metric.branchTerms)) {
        for (const term of new Set(metric.branchTerms)) increment(branchTerms, term)
      }
    }
  }

  const successful = access.filter((record) => Number(record.status) >= 200 && Number(record.status) < 300).length
  const failed = access.length - successful
  const activePlayers = new Set([...requestPlayers, ...metricPlayers])
  const buckets = [...bucketMap.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)).map((row) => ({
    bucket: row.bucket,
    requests: row.requests,
    failures: row.failures,
    estimatedPlayers: row.players.size,
  }))
  const hours = hourMap.map((row) => ({
    hour: row.hour,
    requests: row.requests,
    pageViews: row.pageViews,
    narrativeAdvances: row.narrativeAdvances,
    estimatedPlayers: row.players.size,
  }))
  const peak = (field) => [...hours].sort((a, b) => b[field] - a[field] || a.hour - b.hour)[0]
  const highFrequencyTerms = sortedMap(
    new Map([...branchTerms].filter(([, count]) => count >= options.minTermCount)),
    options.top,
  )
  return {
    window: {
      from: new Date(records.length ? Math.min(...records.map((record) => record._timestamp)) : 0).toISOString(),
      to: new Date(records.length ? Math.max(...records.map((record) => record._timestamp)) : 0).toISOString(),
    },
    traffic: {
      requests: access.length,
      successful,
      failed,
      successRate: access.length ? Number((successful / access.length).toFixed(4)) : null,
      estimatedActivePlayers: activePlayers.size,
      telemetryPlayers: metricPlayers.size,
      requestPlayers: requestPlayers.size,
      clientEvents: client.length,
    },
    statusCounts: Object.fromEntries(statusCounts),
    errors: sortedMap(errorCounts, options.top),
    providers: sortedMap(providers, options.top),
    models: sortedMap(models, options.top),
    latencyMs: { p50: percentile(latency, 0.5), p95: percentile(latency, 0.95), average: average(latency), samples: latency.length },
    promptChars: { p50: percentile(promptChars, 0.5), p95: percentile(promptChars, 0.95), average: average(promptChars), samples: promptChars.length },
    trafficBuckets: buckets,
    localHourDistribution: hours,
    peaks: {
      requests: peak('requests')?.hour ?? null,
      pageViews: peak('pageViews')?.hour ?? null,
      narrativeAdvances: peak('narrativeAdvances')?.hour ?? null,
    },
    pageViews: sortedMap(pageViews, options.top),
    timeSteps: sortedMap(timeSteps, options.top),
    branchChoices: {
      types: Object.fromEntries(branchTypes),
      highFrequencyTerms,
      suppressedTermsBelowCount: options.minTermCount,
    },
    metricKinds: Object.fromEntries(metricKinds),
    storyRepetition: summarizeStoryRepetitionRows(storyRepetitionRows, {
      includePerGame: Boolean(options.playerCode),
    }),
  }
}

function sliceRecords(records, fromMs, toMs) {
  return records.filter((record) => record._timestamp >= fromMs && record._timestamp < toMs)
}

function serializeReport(report, playerCode) {
  const serialized = JSON.stringify(report, null, 2)
  return playerCode ? serialized.replaceAll(playerCode, '[redacted]') : serialized
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  const window = resolveWindow(options)
  if (!fs.existsSync(options.root)) throw new Error(`日志目录不存在：${options.root}`)
  const records = []
  for (const file of await collectFiles(options.root)) await readRecords(file, window, records)
  const selectedRecords = options.playerCode
    ? records.filter((record) => playerKey(record) === `code:${options.playerCode}`)
    : records
  const canonicalRepetition = buildCanonicalStoryRepetitionSet(selectedRecords)
  const aggregateRecords = canonicalRepetition.records
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    privacy: {
      aggregateOnly: true,
      timeZone: TIME_ZONE,
      rawContentIncluded: false,
      identifiersIncluded: false,
      anonymousGameAliasesIncluded: Boolean(options.playerCode),
      playerFilterApplied: Boolean(options.playerCode),
    },
    requestedWindow: {
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString(),
      compareAt: window.compareAtMs === undefined ? null : new Date(window.compareAtMs).toISOString(),
    },
    overall: summarize(aggregateRecords, options, canonicalRepetition.rows),
  }
  if (window.compareAtMs !== undefined) {
    const before = sliceRecords(aggregateRecords, window.fromMs, window.compareAtMs)
    const after = sliceRecords(aggregateRecords, window.compareAtMs, window.toMs)
    const beforeRepetition = canonicalRepetition.rows.filter((row) => row.timestamp < window.compareAtMs)
    const afterRepetition = canonicalRepetition.rows.filter((row) => row.timestamp >= window.compareAtMs)
    report.comparison = {
      before: summarize(before, options, beforeRepetition),
      after: summarize(after, options, afterRepetition),
    }
  }
  console.log(serializeReport(report, options.playerCode))
}

main().catch((error) => {
  console.error(`[analyze-ai-logs] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
