#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

import Database from 'better-sqlite3'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-life-sim-feedback-status-'))
const projectRoot = process.cwd()
const statusScript = path.join(projectRoot, 'scripts', 'ops', 'feedback-status.mjs')
const inspectorScript = path.join(projectRoot, 'scripts', 'ops', 'inspect-ai-logs.mjs')
const feedbackId = 'FB-20260721-TEST1234'
const playerCode = 'AB2CD3'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `command failed: ${script}`)
  return result.stdout.trim()
}

try {
  const databasePath = path.join(root, 'logs.sqlite')
  const database = new Database(databasePath)
  database.exec(`
    CREATE TABLE log_entries (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      client_timestamp INTEGER,
      entry_type TEXT NOT NULL,
      category TEXT,
      level TEXT,
      module TEXT,
      message TEXT,
      event TEXT,
      request_id TEXT,
      source_ip TEXT NOT NULL,
      source_id TEXT NOT NULL,
      diagnostic_code TEXT,
      device_provenance_id TEXT,
      is_registered INTEGER NOT NULL DEFAULT 0,
      account_id TEXT,
      username TEXT,
      feedback_id TEXT,
      round INTEGER,
      age REAL,
      era TEXT,
      provider TEXT,
      model TEXT,
      call_kind TEXT,
      strategy TEXT,
      status INTEGER,
      prompt TEXT,
      response TEXT,
      error TEXT,
      stack TEXT,
      meta_json TEXT,
      payload_json TEXT
    )
  `)
  const receivedAt = Date.now()
  database.prepare(`
    INSERT INTO log_entries(
      id, created_at, entry_type, category, level, module, message, event,
      source_ip, source_id, diagnostic_code, is_registered, account_id,
      username, feedback_id, payload_json
    ) VALUES (?, ?, 'feedback', 'bug', 'info', 'feedback', ?, 'feedback',
      '127.0.0.1', 'ip-127.0.0.1', ?, 1, 'account-test', '测试用户', ?, ?)
  `).run(
    'feedback-row',
    receivedAt,
    'test feedback',
    playerCode,
    feedbackId,
    JSON.stringify({
      feedbackId,
      receivedAt,
      diagnosticCode: playerCode,
      accountId: 'account-test',
      username: '测试用户',
      category: 'bug',
      subject: 'test feedback',
    }, null, 2),
  )
  const archivePath = path.join(root, 'logs-archive.sqlite')
  database.prepare('ATTACH DATABASE ? AS archive_logs').run(archivePath)
  database.exec(`
    CREATE TABLE archive_logs.log_entries AS SELECT * FROM main.log_entries WHERE 0;
    INSERT INTO archive_logs.log_entries SELECT * FROM main.log_entries;
    DELETE FROM main.log_entries;
  `)
  database.exec('DETACH DATABASE archive_logs')
  database.close()

  const initial = JSON.parse(run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--show']))
  assert(initial.status === 'new', 'feedback without status events must be new')

  run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--status', 'in_progress', '--operator', 'smoke'])
  run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--status', 'resolved', '--operator', 'smoke', '--evidence', 'commit and focused regression passed'])

  const resolved = JSON.parse(run(inspectorScript, ['--root', root, '--all', '--limit', '10']))
  assert(resolved.totals.feedbackStatusEvents === 2, 'inspector must count status events')
  assert(resolved.recentFeedback[0].status === 'resolved', 'inspector must expose the latest feedback status')
  assert(resolved.recentFeedback[0].statusLabel === '已完成', 'resolved status must have a player-independent Chinese label')
  assert(resolved.recentFeedbackStatusEvents[0].evidence === 'commit and focused regression passed', 'inspector must retain resolution evidence')
  assert(resolved.recentFeedback[0].username === '测试用户', 'inspector must expose the registered username in plaintext')

  const playerResolved = JSON.parse(run(inspectorScript, [
    '--root', root,
    '--all',
    '--player-code', playerCode,
    '--limit', '10',
  ]))
  assert(playerResolved.recentFeedback[0].status === 'resolved', 'player-code lookup must merge root feedback status events')
  assert(playerResolved.totals.feedbackStatusEvents === 2, 'player-code lookup must expose the correlated status history')

  const reopened = run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--show'])
  assert(JSON.parse(reopened).status === 'resolved', 'show must derive the latest status')

  const hot = new Database(databasePath, { readonly: true, fileMustExist: true })
  const archive = new Database(archivePath, { readonly: true, fileMustExist: true })
  try {
    assert(hot.prepare("SELECT COUNT(*) AS count FROM log_entries WHERE entry_type = 'feedback-status'").get().count === 2, 'status updates must write only to the active database')
    assert(archive.prepare("SELECT COUNT(*) AS count FROM log_entries WHERE entry_type = 'feedback'").get().count === 1, 'archived feedback must remain in the archive database')
  } finally {
    archive.close()
    hot.close()
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('[feedback-status-smoke] PASS')
