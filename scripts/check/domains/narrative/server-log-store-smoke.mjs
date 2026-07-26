#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-sim-plaintext-log-'))
const databasePath = path.join(tempRoot, 'logs.sqlite')
process.env.AI_LOG_DB_PATH = databasePath

const store = await import('../../../../src/core/logger/server-log-store.ts')

try {
  const now = new Date('2026-07-25T12:00:00+08:00')
  const yesterday = new Date('2026-07-24T12:00:00+08:00').getTime()
  const beforeYesterday = new Date('2026-07-23T23:59:59+08:00').getTime()
  const source = {
    ip: '203.0.113.7',
    sourceId: 'ip-203.0.113.7',
    diagnosticCode: '7K3M9Q',
    deviceProvenanceId: 'DEV-0123456789ABCDEF0123456789ABCDEF',
    isRegistered: true,
    accountId: 'account-plain-001',
    username: '明文测试用户',
  }
  const prompt = '完整 Prompt：apiKey=plain-secret-key'
  const response = '完整 AI 返回：故事没有被压缩。'
  const meta = { apiKey: 'plain-secret-key', authorization: 'Bearer plain-token' }

  assert(await store.appendServerLogEntry({
    id: 'today-entry',
    createdAt: now.getTime(),
    clientTimestamp: now.getTime() - 10,
    entryType: 'ai-call',
    category: 'narrative-rounds',
    level: 'info',
    module: 'smoke',
    message: 'plaintext-round',
    requestId: 'request-plain-001',
    source,
    prompt,
    response,
    meta,
    payload: { nested: { password: 'plain-password' } },
  }), 'plaintext log row must be written')
  assert(await store.appendServerLogEntry({
    id: 'yesterday-entry',
    createdAt: yesterday,
    entryType: 'client-log',
    source,
    message: 'keep-yesterday',
  }), 'yesterday row must be written')
  assert(await store.appendServerLogEntry({
    id: 'expired-entry',
    createdAt: beforeYesterday,
    entryType: 'client-log',
    source,
    message: 'delete-before-yesterday',
  }), 'expired fixture row must be written')

  const queried = store.queryServerLogEntries({ requestId: 'request-plain-001' })
  assert(queried.total === 1, 'request query must return exactly one database row')
  const entry = queried.entries[0]
  assert(entry.prompt === prompt, 'Prompt must round-trip directly from the plaintext column')
  assert(entry.response === response, 'AI response must round-trip directly from the plaintext column')
  assert(entry.meta.apiKey === 'plain-secret-key', 'meta fields must not be redacted')
  assert(entry.meta.authorization === 'Bearer plain-token', 'authorization fields must not be redacted')
  assert(entry.payload.nested.password === 'plain-password', 'payload fields must remain plaintext')
  assert(entry.isRegistered && entry.accountId === source.accountId && entry.username === source.username, 'account identity must be queryable on the row')
  assert(entry.deviceProvenanceId === source.deviceProvenanceId, 'device provenance ID must be queryable independently from the diagnostic code')

  await store.cleanupServerLogsNow(now)
  assert(store.queryServerLogEntries({}).entries.some((row) => row.id === 'today-entry'), 'today row must be retained')
  assert(store.queryServerLogEntries({}).entries.some((row) => row.id === 'yesterday-entry'), 'yesterday row must be retained')
  assert(!store.queryServerLogEntries({}).entries.some((row) => row.id === 'expired-entry'), 'rows before yesterday must be deleted')

  store.closeServerLogDatabaseForTests()
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const raw = database.prepare('SELECT prompt, response, meta_json, payload_json FROM log_entries WHERE id = ?').get('today-entry')
    assert(raw.prompt === prompt && raw.response === response, 'SQLite columns must contain directly readable text')
    assert(raw.meta_json.includes('plain-secret-key') && raw.payload_json.includes('plain-password'), 'SQLite JSON columns must contain exact plaintext values')
    const columns = database.pragma('table_info(log_entries)').map((column) => column.name)
    assert(!columns.some((name) => /ref|hash|cipher|encrypted|compressed/i.test(name)), 'schema must not contain content references, hashes, encryption, or compression columns')
  } finally {
    database.close()
  }

  const artifacts = await fs.readdir(tempRoot)
  assert(!artifacts.some((name) => name.endsWith('.gz') || name.endsWith('.jsonl')), 'log store must not create gzip or JSONL artifacts')
  console.log('[server-log-store-smoke] PASS')
} finally {
  store.closeServerLogDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
}
