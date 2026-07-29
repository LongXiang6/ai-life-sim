#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000
const DIAGNOSTIC_CODE_PATTERN = /^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{6}$/u

function usage() {
  console.log(`Usage: node scripts/ops/send-player-mail.mjs [target] --title <title> (--body <body> | --body-file <path>) [options]

Targets (choose exactly one):
  --broadcast                 Send one shared message to every account and anonymous mailbox
  --account <username>        Send to one registered account
  --diagnostic <code>         Send to one diagnostic mailbox

Options:
  --database <path>           Account database path
  --player-content-database <path>
  --sender <label>            Display sender (default: 开发者)
  --id <uuid>                 Stable idempotency identifier
`)
}

function readValue(argv, index, name) {
  const value = argv[index + 1]
  if (value === undefined) throw new Error(`${name} 缺少参数`)
  return value
}

function parseArgs(argv) {
  const options = {
    database: process.env.ACCOUNT_DB_PATH || '/var/lib/ai-life-sim/accounts.sqlite',
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || '/var/lib/ai-life-sim/player-content.sqlite',
    sender: '开发者',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--broadcast') options.broadcast = true
    else if (argument === '--account') options.account = readValue(argv, index++, argument)
    else if (argument === '--diagnostic') options.diagnostic = readValue(argv, index++, argument)
    else if (argument === '--title') options.title = readValue(argv, index++, argument)
    else if (argument === '--body') options.body = readValue(argv, index++, argument)
    else if (argument === '--body-file') options.bodyFile = readValue(argv, index++, argument)
    else if (argument === '--sender') options.sender = readValue(argv, index++, argument)
    else if (argument === '--id') options.id = readValue(argv, index++, argument)
    else if (argument === '--database') options.database = readValue(argv, index++, argument)
    else if (argument === '--player-content-database') options.playerContentDatabase = readValue(argv, index++, argument)
    else if (argument === '--help' || argument === '-h') {
      usage()
      process.exit(0)
    } else throw new Error(`未知参数：${argument}`)
  }
  const targetCount = Number(Boolean(options.broadcast)) + Number(Boolean(options.account)) + Number(Boolean(options.diagnostic))
  if (targetCount !== 1) throw new Error('必须且只能选择一种收件目标')
  if (typeof options.title !== 'string' || options.title.length === 0) throw new Error('邮件标题不能为空')
  if (Boolean(options.body !== undefined) === Boolean(options.bodyFile)) {
    throw new Error('--body 与 --body-file 必须且只能提供一个')
  }
  const body = options.bodyFile
    ? fs.readFileSync(path.resolve(options.bodyFile), 'utf8')
    : options.body
  if (body.length === 0) throw new Error('邮件正文不能为空')
  return {
    ...options,
    id: options.id || randomUUID(),
    body,
    database: path.resolve(options.database),
    playerContentDatabase: path.resolve(options.playerContentDatabase),
  }
}

function assertSchema(database, table, expected) {
  const row = database.prepare(`SELECT value FROM ${table} WHERE key = 'schema_version'`).get()
  if (row?.value !== expected) {
    throw new Error(`不支持的数据库 Schema 版本：${row?.value ?? 'missing'}`)
  }
}

const options = parseArgs(process.argv.slice(2))
const playerDatabase = new Database(options.playerContentDatabase)
let accountDatabase
try {
  playerDatabase.pragma('foreign_keys = ON')
  playerDatabase.pragma('busy_timeout = 5000')
  assertSchema(playerDatabase, 'player_content_meta', '5')

  let audience = 'direct'
  let recipientKey = null
  let recipientLabel = null
  if (options.account) {
    accountDatabase = new Database(options.database, { readonly: true })
    accountDatabase.pragma('busy_timeout = 5000')
    assertSchema(accountDatabase, 'account_meta', '5')
    const canonical = options.account.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
    const account = accountDatabase.prepare(`
      SELECT id, username FROM accounts WHERE username_canonical = ?
    `).get(canonical)
    if (!account) throw new Error('收件账号不存在')
    recipientKey = `account:${account.id}`
    recipientLabel = account.username
  } else if (options.diagnostic) {
    const diagnosticCode = options.diagnostic.trim().toUpperCase()
    if (!DIAGNOSTIC_CODE_PATTERN.test(diagnosticCode)) throw new Error('诊断编号格式无效')
    const now = Date.now()
    playerDatabase.prepare(`
      INSERT INTO diagnostic_mailboxes(
        diagnostic_code, device_provenance_id, created_at, last_seen_at
      ) VALUES (?, NULL, ?, ?)
      ON CONFLICT(diagnostic_code) DO NOTHING
    `).run(diagnosticCode, now, now)
    recipientKey = `diagnostic:${diagnosticCode}`
    recipientLabel = diagnosticCode
  } else {
    audience = 'broadcast'
  }

  const now = Date.now()
  const inserted = playerDatabase.prepare(`
    INSERT INTO player_mail_messages(
      id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
      title, body, record_id, asset_id, created_at, expires_at
    ) VALUES (?, ?, 'message', 'developer:operations', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    options.id,
    audience,
    options.sender,
    recipientKey,
    recipientLabel,
    options.title,
    options.body,
    now,
    now + RETENTION_MS,
  )
  const existing = playerDatabase.prepare(`
    SELECT audience, recipient_label, created_at, expires_at
    FROM player_mail_messages WHERE id = ? AND sender_key = 'developer:operations'
  `).get(options.id)
  if (!existing) throw new Error('邮件 ID 已被其他发件人占用')
  console.log(JSON.stringify({
    ok: true,
    created: inserted.changes > 0,
    id: options.id,
    audience: existing.audience,
    recipient: existing.recipient_label,
    createdAt: existing.created_at,
    expiresAt: existing.expires_at,
  }))
} finally {
  accountDatabase?.close()
  playerDatabase.close()
}
