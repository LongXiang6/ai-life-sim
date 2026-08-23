#!/usr/bin/env node

/**
 * Purpose: Send an operator-authored mailbox message to the declared player audience.
 * Owner: operations
 * Responsibility: One validated mail command and persistence transaction only.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Database from 'better-sqlite3'

import {
  RETENTION_MS,
  ensureRewardCampaignColumns,
  existingRewardCampaign,
  parseTimestamp,
  readExistingRewardWindow,
  readRewardTalent,
  resolveAccounts,
} from './player-mail-reward-ops.mjs'

const DIAGNOSTIC_CODE_PATTERN = /^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{6}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function usage() {
  console.log(`Usage: node scripts/ops/send-player-mail.mjs [target] --title <title> (--body <body> | --body-file <path>) [options]

Targets (choose exactly one):
  --broadcast                 Send one shared message to every account and anonymous mailbox
  --account <username>        Send to one registered account (repeatable)
  --diagnostic <code>         Send to one diagnostic mailbox

Options:
  --database <path>           Account database path
  --player-content-database <path>
  --sender <label>            Display sender (default: 开发者)
  --id <uuid>                 Stable idempotency identifier
  --reward-id <id>            Create a one-time custom talent reward campaign
  --talent-json <json>        Reward talent JSON (use --talent-file for a file)
  --talent-file <path>        Reward talent JSON file
  --eligibility <mode>        login-window (default) or registered-account
  --starts-at <time>          Reward start time (ISO timestamp or milliseconds)
  --ends-at <time>            Reward end time (ISO timestamp or milliseconds)
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
    accounts: [],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--broadcast') options.broadcast = true
    else if (argument === '--account') options.accounts.push(readValue(argv, index++, argument))
    else if (argument === '--diagnostic') options.diagnostic = readValue(argv, index++, argument)
    else if (argument === '--title') options.title = readValue(argv, index++, argument)
    else if (argument === '--body') options.body = readValue(argv, index++, argument)
    else if (argument === '--body-file') options.bodyFile = readValue(argv, index++, argument)
    else if (argument === '--sender') options.sender = readValue(argv, index++, argument)
    else if (argument === '--id') options.id = readValue(argv, index++, argument)
    else if (argument === '--reward-id') options.rewardId = readValue(argv, index++, argument)
    else if (argument === '--talent-json') options.talentJson = readValue(argv, index++, argument)
    else if (argument === '--talent-file') options.talentFile = readValue(argv, index++, argument)
    else if (argument === '--eligibility' || argument === '--eligibility-mode') options.eligibility = readValue(argv, index++, argument)
    else if (argument === '--starts-at') options.startsAt = readValue(argv, index++, argument)
    else if (argument === '--ends-at') options.endsAt = readValue(argv, index++, argument)
    else if (argument === '--database') options.database = readValue(argv, index++, argument)
    else if (argument === '--player-content-database') options.playerContentDatabase = readValue(argv, index++, argument)
    else if (argument === '--help' || argument === '-h') {
      usage()
      process.exit(0)
    } else throw new Error(`未知参数：${argument}`)
  }
  const targetCount = Number(Boolean(options.broadcast)) + Number(options.accounts.length > 0) + Number(Boolean(options.diagnostic))
  if (targetCount !== 1) throw new Error('必须且只能选择一种收件目标')
  if (options.diagnostic && (options.rewardId || options.talentJson || options.talentFile)) {
    throw new Error('礼包天赋不能发送到匿名诊断邮箱')
  }
  if (typeof options.title !== 'string' || options.title.length === 0) throw new Error('邮件标题不能为空')
  if (Boolean(options.body !== undefined) === Boolean(options.bodyFile)) {
    throw new Error('--body 与 --body-file 必须且只能提供一个')
  }
  const body = options.bodyFile
    ? fs.readFileSync(path.resolve(options.bodyFile), 'utf8')
    : options.body
  if (body.length === 0) throw new Error('邮件正文不能为空')
  if (options.talentJson && options.talentFile) throw new Error('--talent-json 与 --talent-file 必须且只能提供一个')
  const isReward = Boolean(options.rewardId || options.talentJson || options.talentFile)
  if (isReward && (!options.rewardId || (!options.talentJson && !options.talentFile))) {
    throw new Error('礼包邮件必须同时提供 --reward-id 与天赋 JSON')
  }
  if (options.eligibility && !['login-window', 'registered-account'].includes(options.eligibility)) {
    throw new Error('--eligibility 只能是 login-window 或 registered-account')
  }
  if (options.startsAt !== undefined) parseTimestamp(options.startsAt, '--starts-at')
  if (options.endsAt !== undefined) parseTimestamp(options.endsAt, '--ends-at')
  if (options.rewardId && (options.rewardId.trim().length === 0 || options.rewardId.trim().length > 200)) {
    throw new Error('--reward-id 长度无效')
  }
  const stableId = options.id || randomUUID()
  if (isReward && !UUID_PATTERN.test(stableId)) {
    throw new Error('礼包邮件的 --id 必须是 UUID（未提供时会自动生成）')
  }
  return {
    ...options,
    ...(options.rewardId ? { rewardId: options.rewardId.trim() } : {}),
    id: stableId,
    body,
    isReward,
    database: path.resolve(options.database),
    playerContentDatabase: path.resolve(options.playerContentDatabase),
  }
}

function assertSchema(database, table, expected) {
  const row = database.prepare(`SELECT value FROM ${table} WHERE key = 'schema_version'`).get()
  const accepted = Array.isArray(expected) ? expected : [expected]
  if (!accepted.includes(row?.value)) {
    throw new Error(`不支持的数据库 Schema 版本：${row?.value ?? 'missing'}`)
  }
}

const options = parseArgs(process.argv.slice(2))
const playerDatabase = new Database(options.playerContentDatabase)
let accountDatabase
try {
  playerDatabase.pragma('foreign_keys = ON')
  playerDatabase.pragma('busy_timeout = 5000')
  assertSchema(playerDatabase, 'player_content_meta', options.isReward ? '7' : ['6', '7'])
  if (options.isReward) ensureRewardCampaignColumns(playerDatabase)

  const now = Date.now()
  const storedRewardWindow = options.isReward
    ? readExistingRewardWindow(playerDatabase, options.rewardId)
    : null
  const startsAt = options.isReward
    ? (options.startsAt !== undefined
        ? parseTimestamp(options.startsAt, '--starts-at')
        : storedRewardWindow?.startsAt ?? now)
    : now
  const endsAt = options.isReward
    ? (options.endsAt !== undefined
        ? parseTimestamp(options.endsAt, '--ends-at')
        : storedRewardWindow?.endsAt ?? startsAt + RETENTION_MS)
    : now + RETENTION_MS
  if (options.isReward && endsAt <= startsAt) throw new Error('礼包结束时间必须晚于开始时间')

  const targetMode = options.broadcast ? 'broadcast' : options.accounts.length > 0 ? 'account' : 'diagnostic'
  if (options.isReward && targetMode === 'diagnostic') throw new Error('礼包不能发送到匿名诊断邮箱')

  let accountTargets = []
  if (options.accounts.length > 0) {
    accountDatabase = new Database(options.database, { readonly: true })
    accountDatabase.pragma('busy_timeout = 5000')
    assertSchema(accountDatabase, 'account_meta', '6')
    accountTargets = resolveAccounts(accountDatabase, options.accounts)
  }

  if (options.isReward) {
    const talent = readRewardTalent(options, startsAt)
    const rewardTargets = options.broadcast
      ? [{ recipientKind: 'broadcast', recipientKey: null, recipientLabel: null }]
      : accountTargets.map((target) => ({
          recipientKind: 'account', recipientKey: target.key, recipientLabel: target.label,
        }))
    const existing = existingRewardCampaign(playerDatabase, options, talent, startsAt, endsAt, rewardTargets)
    if (existing) {
      console.log(JSON.stringify({
        ok: true,
        reward: true,
        created: false,
        delivered: Boolean(existing.message),
        rewardId: options.rewardId,
        targetCount: rewardTargets.length,
        startsAt,
        endsAt,
      }))
    } else {
      let createdCampaign = false
      playerDatabase.transaction(() => {
        const insertedCampaign = playerDatabase.prepare(`
          INSERT INTO player_mail_reward_campaigns(
            reward_id, talent_id, talent_json, target_signature,
            title, body, eligibility_mode, starts_at, ends_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(reward_id) DO NOTHING
        `).run(
          options.rewardId.trim(),
          talent.id,
          JSON.stringify(talent),
          rewardTargets.map((target) => `${target.recipientKind}:${target.recipientKey ?? '*'}`).sort().join('|'),
          options.title,
          options.body,
          options.eligibility || 'login-window',
          startsAt,
          endsAt,
          now,
        )
        if (insertedCampaign.changes === 0) return
        createdCampaign = true
        rewardTargets.forEach((target) => {
          const messageId = rewardTargets.length === 1 && options.id
            ? options.id
            : randomUUID()
          playerDatabase.prepare(`
            INSERT INTO player_mail_messages(
              id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
              title, body, record_id, asset_id, created_at, expires_at
            ) VALUES (?, ?, 'message', 'developer:operations', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
          `).run(
            messageId,
            target.recipientKind === 'broadcast' ? 'broadcast' : 'direct',
            options.sender,
            target.recipientKey,
            target.recipientLabel,
            options.title,
            options.body,
            now,
            endsAt,
          )
          playerDatabase.prepare(`
            INSERT INTO player_mail_reward_targets(
              reward_id, message_id, recipient_kind, recipient_key, recipient_label
            ) VALUES (?, ?, ?, ?, ?)
          `).run(
            options.rewardId.trim(),
            messageId,
            target.recipientKind,
            target.recipientKey,
            target.recipientLabel,
          )
        })
      })()
      if (!createdCampaign) {
        existingRewardCampaign(playerDatabase, options, talent, startsAt, endsAt, rewardTargets)
      }
      console.log(JSON.stringify({
        ok: true,
        reward: true,
        created: createdCampaign,
        delivered: createdCampaign,
        rewardId: options.rewardId,
        targetCount: rewardTargets.length,
        startsAt,
        endsAt,
      }))
    }
  } else if (targetMode === 'diagnostic') {
    const diagnosticCode = options.diagnostic.trim().toUpperCase()
    if (!DIAGNOSTIC_CODE_PATTERN.test(diagnosticCode)) throw new Error('诊断编号格式无效')
    playerDatabase.prepare(`
      INSERT INTO diagnostic_mailboxes(
        diagnostic_code, device_provenance_id, created_at, last_seen_at
      ) VALUES (?, NULL, ?, ?)
      ON CONFLICT(diagnostic_code) DO NOTHING
    `).run(diagnosticCode, now, now)
    const inserted = playerDatabase.prepare(`
      INSERT INTO player_mail_messages(
        id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
        title, body, record_id, asset_id, created_at, expires_at
      ) VALUES (?, 'direct', 'message', 'developer:operations', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(options.id, options.sender, `diagnostic:${diagnosticCode}`, diagnosticCode, options.title, options.body, now, endsAt)
    const existing = playerDatabase.prepare(`
      SELECT audience, recipient_label, created_at, expires_at
      FROM player_mail_messages WHERE id = ? AND sender_key = 'developer:operations'
    `).get(options.id)
    if (!existing) throw new Error('邮件 ID 已被其他发件人占用')
    console.log(JSON.stringify({ ok: true, created: inserted.changes > 0, id: options.id, audience: existing.audience, recipient: existing.recipient_label, createdAt: existing.created_at, expiresAt: existing.expires_at }))
  } else if (targetMode === 'broadcast') {
    const inserted = playerDatabase.prepare(`
      INSERT INTO player_mail_messages(
        id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
        title, body, record_id, asset_id, created_at, expires_at
      ) VALUES (?, 'broadcast', 'message', 'developer:operations', ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(options.id, options.sender, options.title, options.body, now, endsAt)
    const existing = playerDatabase.prepare(`
      SELECT audience, recipient_label, created_at, expires_at
      FROM player_mail_messages WHERE id = ? AND sender_key = 'developer:operations'
    `).get(options.id)
    if (!existing) throw new Error('邮件 ID 已被其他发件人占用')
    console.log(JSON.stringify({ ok: true, created: inserted.changes > 0, id: options.id, audience: existing.audience, recipient: existing.recipient_label, createdAt: existing.created_at, expiresAt: existing.expires_at }))
  } else {
    let createdCount = 0
    playerDatabase.transaction(() => {
      accountTargets.forEach((target) => {
        const messageId = accountTargets.length === 1 ? options.id : randomUUID()
        const inserted = playerDatabase.prepare(`
          INSERT INTO player_mail_messages(
            id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
            title, body, record_id, asset_id, created_at, expires_at
          ) VALUES (?, 'direct', 'message', 'developer:operations', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `).run(messageId, options.sender, target.key, target.label, options.title, options.body, now, endsAt)
        createdCount += inserted.changes
        const existing = playerDatabase.prepare(`
          SELECT sender_key FROM player_mail_messages WHERE id = ?
        `).get(messageId)
        if (!existing || existing.sender_key !== 'developer:operations') throw new Error('邮件 ID 已被其他发件人占用')
      })
    })()
    console.log(JSON.stringify({ ok: true, created: createdCount > 0, targetCount: accountTargets.length, expiresAt: endsAt }))
  }
} finally {
  accountDatabase?.close()
  playerDatabase.close()
}
