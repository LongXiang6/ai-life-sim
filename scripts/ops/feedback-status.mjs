#!/usr/bin/env node

import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

import {
  logDatabasesExist,
  readLogRows,
  resolveLogDatabasePath,
} from './lib/log-databases.mjs'

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

function defaultDatabasePath() {
  if (process.env.AI_LOG_DB_PATH) return path.resolve(process.env.AI_LOG_DB_PATH)
  if (process.env.AI_LOG_DIR) return path.join(path.resolve(process.env.AI_LOG_DIR), 'logs.sqlite')
  return '/var/lib/ai-life-sim/logs.sqlite'
}

function databasePathFromRoot(value) {
  return resolveLogDatabasePath(value)
}

function printHelp() {
  console.log(`Usage:
  node scripts/ops/feedback-status.mjs --database <path> --feedback-id <id> --status <status> --operator <name> [options]
  node scripts/ops/feedback-status.mjs --database <path> --feedback-id <id> --show

Statuses: new, in_progress, resolved, rejected, duplicate, reopened
Options:
  --database <path>      Plaintext SQLite log database
  --root <path>          Compatibility alias: directory containing logs.sqlite
  --feedback-id <id>     Feedback ID to inspect or update
  --status <status>      New status
  --operator <name>      Operator label
  --note <text>          Operator note, max 2000 characters
  --evidence <text>      Resolution evidence, required for resolved
  --duplicate-of <id>    Canonical feedback ID, required for duplicate
  --show                 Print the derived current status without writing
  --help                 Show this help`)
}

function parseArgs(argv) {
  const options = {
    database: defaultDatabasePath(),
    feedbackId: undefined,
    status: undefined,
    operator: undefined,
    note: undefined,
    evidence: undefined,
    duplicateOf: undefined,
    show: false,
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
    else if (arg === '--feedback-id') options.feedbackId = next()
    else if (arg === '--status') options.status = next()
    else if (arg === '--operator') options.operator = next()
    else if (arg === '--note') options.note = next()
    else if (arg === '--evidence') options.evidence = next()
    else if (arg === '--duplicate-of') options.duplicateOf = next()
    else if (arg === '--show') options.show = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else throw new Error(`未知参数：${arg}`)
  }
  if (!options.feedbackId) throw new Error('--feedback-id 必须提供')
  if (!/^FB-[0-9]{8}-[A-Z0-9]{8,32}$/.test(options.feedbackId)) throw new Error('--feedback-id 格式不正确')
  if (!options.show && (!options.status || !STATUS_LABELS[options.status])) throw new Error('--status 必须是受支持的状态')
  if (!options.show && (!options.operator || options.operator.length > 80)) throw new Error('--operator 必须提供且不超过 80 字符')
  for (const [name, value] of [['note', options.note], ['evidence', options.evidence]]) {
    if (value && value.length > 2000) throw new Error(`--${name} 不能超过 2000 字符`)
  }
  if (options.status === 'resolved' && !options.evidence?.trim()) throw new Error('resolved 必须提供 --evidence')
  if (options.status === 'rejected' && !options.note?.trim()) throw new Error('rejected 必须提供 --note')
  if (options.status === 'duplicate' && !options.duplicateOf) throw new Error('duplicate 必须提供 --duplicate-of')
  return options
}

function parsePayload(value) {
  try { return JSON.parse(value) } catch { return {} }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!logDatabasesExist(options.database)) throw new Error(`日志数据库不存在：${options.database}`)
  const feedback = readLogRows(options.database, {
    where: "entry_type = 'feedback' AND feedback_id = ?",
    values: [options.feedbackId],
  })[0]
  if (!feedback) throw new Error(`找不到反馈：${options.feedbackId}`)

  const history = readLogRows(options.database, {
    where: "entry_type = 'feedback-status' AND feedback_id = ?",
    values: [options.feedbackId],
  }).sort((left, right) => (
    left.created_at - right.created_at || String(left.id).localeCompare(String(right.id))
  )).map((row) => ({ ...parsePayload(row.payload_json), timestamp: row.created_at }))
  const current = history.at(-1)
  if (options.show) {
    console.log(JSON.stringify({
      feedbackId: options.feedbackId,
      status: current?.status ?? 'new',
      statusLabel: STATUS_LABELS[current?.status ?? 'new'],
      statusUpdatedAt: current?.timestamp ?? null,
      history: history.length,
    }, null, 2))
    return
  }

  const previousStatus = current?.status ?? 'new'
  if (previousStatus === options.status) throw new Error(`反馈已经是${STATUS_LABELS[options.status]}`)
  if (!TRANSITIONS[previousStatus]?.has(options.status)) throw new Error(`不允许从 ${previousStatus} 转为 ${options.status}`)
  if (options.status === 'duplicate' && options.duplicateOf === options.feedbackId) throw new Error('duplicate-of 不能指向自身')
  if (!fs.existsSync(options.database)) throw new Error(`活动日志数据库不存在：${options.database}`)

  const database = new Database(options.database)
  try {
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
    database.prepare(`
      INSERT INTO log_entries(
        id, created_at, entry_type, category, level, module, message, event,
        source_ip, source_id, is_registered, feedback_id, payload_json
      ) VALUES (?, ?, 'feedback-status', 'feedback', 'info', 'feedback-status', ?,
        'feedback-status', 'operator', 'operator', 0, ?, ?)
    `).run(event.eventId, timestamp, options.status, options.feedbackId, JSON.stringify(event, null, 2))
    console.log(JSON.stringify({
      ok: true,
      feedbackId: options.feedbackId,
      status: options.status,
      statusLabel: STATUS_LABELS[options.status],
      timestamp,
    }, null, 2))
  } finally {
    database.close()
  }
}

try {
  main()
} catch (error) {
  console.error(`[feedback-status] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
