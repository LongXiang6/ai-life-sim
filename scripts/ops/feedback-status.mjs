#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

const STATUS_LABELS = {
  new: '待处理',
  in_progress: '处理中',
  resolved: '已完成',
  rejected: '已拒绝',
  duplicate: '重复反馈',
  reopened: '已重新打开',
}

const TRANSITIONS = {
  new: new Set(['in_progress', 'rejected', 'duplicate']),
  in_progress: new Set(['resolved', 'rejected', 'duplicate']),
  resolved: new Set(['reopened']),
  rejected: new Set(['reopened']),
  duplicate: new Set(['reopened']),
  reopened: new Set(['in_progress', 'rejected', 'duplicate']),
}

function printHelp() {
  console.log(`Usage:
  node scripts/ops/feedback-status.mjs --root <path> --feedback-id <id> --status <status> --operator <name> [options]
  node scripts/ops/feedback-status.mjs --root <path> --feedback-id <id> --show

Statuses: new, in_progress, resolved, rejected, duplicate, reopened
Options:
  --root <path>          Log root (default: AI_LOG_DIR, /var/log/ai-life-sim, or ./logs)
  --feedback-id <id>     Feedback ID to inspect or update
  --status <status>      New status
  --operator <name>      Private operator label
  --note <text>          Operator note, max 2000 characters
  --evidence <text>      Resolution evidence, required for resolved
  --duplicate-of <id>    Canonical feedback ID, required for duplicate
  --show                 Print the derived current status without writing
  --help                 Show this help`)
}

function defaultRoot() {
  const candidates = [process.env.AI_LOG_DIR, '/var/log/ai-life-sim', path.join(process.cwd(), 'logs')].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates.at(-1)
}

function parseArgs(argv) {
  const options = { root: defaultRoot(), feedbackId: undefined, status: undefined, operator: undefined, note: undefined, evidence: undefined, duplicateOf: undefined, show: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} 缺少参数`)
      return value
    }
    if (arg === '--root') options.root = path.resolve(next())
    else if (arg === '--feedback-id') options.feedbackId = next()
    else if (arg === '--status') options.status = next()
    else if (arg === '--operator') options.operator = next()
    else if (arg === '--note') options.note = next()
    else if (arg === '--evidence') options.evidence = next()
    else if (arg === '--duplicate-of') options.duplicateOf = next()
    else if (arg === '--show') options.show = true
    else if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0) }
    else throw new Error(`未知参数：${arg}`)
  }
  if (!options.feedbackId) throw new Error('--feedback-id 必须提供')
  if (!/^FB-[0-9]{8}-[A-Z0-9]{8,32}$/.test(options.feedbackId)) throw new Error('--feedback-id 格式不正确')
  if (!options.show && (!options.status || !STATUS_LABELS[options.status])) throw new Error('--status 必须是受支持的状态')
  if (!options.show && (!options.operator || options.operator.length > 80)) throw new Error('--operator 必须提供且不超过 80 字符')
  for (const [name, value] of [['note', options.note], ['evidence', options.evidence]]) {
    if (value && (value.length > 2000 || /api[_ -]?key|authorization|bearer|password|secret|token|cookie/i.test(value))) {
      throw new Error(`--${name} 不能包含秘密或超过 2000 字符`)
    }
  }
  if (options.status === 'resolved' && !options.evidence?.trim()) throw new Error('resolved 必须提供 --evidence')
  if (options.status === 'rejected' && !options.note?.trim()) throw new Error('rejected 必须提供 --note')
  if (options.status === 'duplicate' && !options.duplicateOf) throw new Error('duplicate 必须提供 --duplicate-of')
  return options
}

function timestampMs(record) {
  const raw = record.timestamp ?? record.receivedAt
  const numeric = typeof raw === 'number' ? raw : Date.parse(String(raw ?? ''))
  return Number.isFinite(numeric) ? numeric : 0
}

async function readJsonLines(file, output) {
  const input = fs.createReadStream(file, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    try { output.push(JSON.parse(line)) } catch { /* Ignore a partial terminal line. */ }
  }
}

async function collectRecords(root, prefix) {
  const records = []
  let entries = []
  try { entries = await fsp.readdir(root, { withFileTypes: true }) } catch { return records }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.jsonl')) {
      await readJsonLines(path.join(root, entry.name), records)
    }
  }
  return records
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(options.root)) throw new Error(`日志目录不存在：${options.root}`)
  const feedbackRows = await collectRecords(path.join(options.root, 'feedback'), 'feedback-')
  const statusRows = await collectRecords(path.join(options.root, 'feedback-status'), 'feedback-status-')
  if (!feedbackRows.some((record) => record.feedbackId === options.feedbackId)) throw new Error(`找不到反馈：${options.feedbackId}`)

  const history = statusRows
    .filter((record) => record.feedbackId === options.feedbackId)
    .sort((a, b) => timestampMs(a) - timestampMs(b))
  const current = history.at(-1)
  if (options.show) {
    console.log(JSON.stringify({ feedbackId: options.feedbackId, status: current?.status ?? 'new', statusLabel: STATUS_LABELS[current?.status ?? 'new'], statusUpdatedAt: current?.timestamp ?? null, history: history.length }, null, 2))
    return
  }

  const previousStatus = current?.status ?? 'new'
  if (previousStatus === options.status) throw new Error(`反馈已经是${STATUS_LABELS[options.status]}`)
  if (!TRANSITIONS[previousStatus]?.has(options.status)) throw new Error(`不允许从 ${previousStatus} 转为 ${options.status}`)
  if (options.status === 'duplicate' && options.duplicateOf === options.feedbackId) throw new Error('duplicate-of 不能指向自身')

  const timestamp = Date.now()
  const event = {
    schemaVersion: 1,
    eventType: 'feedback-status',
    eventId: randomUUID(),
    timestamp,
    feedbackId: options.feedbackId,
    previousStatus,
    status: options.status,
    operator: options.operator.trim(),
    note: options.note?.trim() || undefined,
    evidence: options.evidence?.trim() || undefined,
    duplicateOf: options.duplicateOf,
  }
  const targetDir = path.join(options.root, 'feedback-status')
  await fsp.mkdir(targetDir, { recursive: true, mode: 0o700 })
  await fsp.chmod(targetDir, 0o700).catch(() => undefined)
  const date = new Date(timestamp).toISOString().slice(0, 10)
  const target = path.join(targetDir, `feedback-status-${date}.jsonl`)
  await fsp.appendFile(target, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fsp.chmod(target, 0o600).catch(() => undefined)
  console.log(JSON.stringify({ ok: true, feedbackId: options.feedbackId, status: options.status, statusLabel: STATUS_LABELS[options.status], timestamp }, null, 2))
}

main().catch((error) => {
  console.error(`[feedback-status] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
