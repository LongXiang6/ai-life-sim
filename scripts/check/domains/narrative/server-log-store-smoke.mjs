#!/usr/bin/env node
/**
 * Purpose: Regress plaintext hot/archive server-log persistence, querying, retention, and conflicts.
 * Owner: quality:narrative
 * Responsibility: One isolated server-log storage lifecycle scenario only.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import { assertMatchingLogEntrySchemas } from '../../../../src/core/logger/server-log-store/archive-sql.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const schemaOrderDatabase = new Database(':memory:')
try {
  schemaOrderDatabase.exec(`
    CREATE TABLE log_entries (id TEXT, device_provenance_id TEXT);
    ATTACH DATABASE ':memory:' AS archive_logs;
    CREATE TABLE archive_logs.log_entries (device_provenance_id TEXT, id TEXT);
  `)
  assert(
    assertMatchingLogEntrySchemas(schemaOrderDatabase).join(',') === 'id,device_provenance_id',
    'archive compatibility must compare named columns rather than physical column order',
  )
  schemaOrderDatabase.exec('ALTER TABLE archive_logs.log_entries ADD COLUMN extra_column TEXT')
  let schemaMismatch
  try {
    assertMatchingLogEntrySchemas(schemaOrderDatabase)
  } catch (error) {
    schemaMismatch = error
  }
  assert(schemaMismatch instanceof Error, 'archive compatibility must still reject a different column set')
} finally {
  schemaOrderDatabase.close()
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
    prompt,
    response,
    meta,
    payload: { nested: { password: 'plain-password' } },
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
  const retained = store.queryServerLogEntries({})
  assert(retained.entries.some((row) => row.id === 'today-entry'), 'today row must be retained')
  assert(retained.entries.some((row) => row.id === 'yesterday-entry'), 'yesterday row must be retained')
  assert(retained.entries.some((row) => row.id === 'expired-entry'), 'archived rows must remain visible through the public query')
  assert(retained.total === 3, 'public queries must count hot and archived rows exactly once')

  store.closeServerLogDatabaseForTests()
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const raw = database.prepare('SELECT prompt, response, meta_json, payload_json FROM log_entries WHERE id = ?').get('today-entry')
    assert(raw.prompt === prompt && raw.response === response, 'SQLite columns must contain directly readable text')
    assert(raw.meta_json.includes('plain-secret-key') && raw.payload_json.includes('plain-password'), 'SQLite JSON columns must contain exact plaintext values')
    const columns = database.pragma('table_info(log_entries)').map((column) => column.name)
    assert(!columns.some((name) => /ref|hash|cipher|encrypted|compressed/i.test(name)), 'schema must not contain content references, hashes, encryption, or compression columns')
    assert(!database.prepare('SELECT 1 FROM log_entries WHERE id = ?').get('expired-entry'), 'expired rows must leave the active database after archival')
  } finally {
    database.close()
  }

  const archiveDatabasePath = path.join(tempRoot, 'logs-archive.sqlite')
  const archiveDatabase = new Database(archiveDatabasePath, { readonly: true, fileMustExist: true })
  try {
    const archived = archiveDatabase.prepare(`
      SELECT prompt, response, meta_json, payload_json
      FROM log_entries
      WHERE id = ?
    `).get('expired-entry')
    assert(
      archived?.prompt === prompt
        && archived?.response === response
        && archived?.meta_json.includes('plain-secret-key')
        && archived?.payload_json.includes('plain-password'),
      'expired rows must be archived with the exact plaintext columns',
    )
  } finally {
    archiveDatabase.close()
  }

  assert(await store.appendServerLogEntry({
    id: 'expired-entry',
    createdAt: beforeYesterday,
    entryType: 'client-log',
    source,
    message: 'conflicting-hot-copy',
  }), 'conflicting hot fixture row must be written')
  let queryError
  try {
    store.queryServerLogEntries({})
  } catch (error) {
    queryError = error
  }
  assert(
    queryError instanceof Error && /日志归档 ID 冲突：expired-entry/u.test(queryError.message),
    'public queries must reject same-ID rows with different content',
  )
  let cleanupError
  try {
    await store.cleanupServerLogsNow(now)
  } catch (error) {
    cleanupError = error
  }
  assert(
    cleanupError instanceof Error && /日志归档 ID 冲突：expired-entry/u.test(cleanupError.message),
    'archive migration must fail explicitly on a same-ID content conflict',
  )
  store.closeServerLogDatabaseForTests()
  const retainedConflict = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    assert(
      retainedConflict.prepare('SELECT message FROM log_entries WHERE id = ?').get('expired-entry')?.message === 'conflicting-hot-copy',
      'failed archive migration must retain the original hot row',
    )
  } finally {
    retainedConflict.close()
  }

  const artifacts = await fs.readdir(tempRoot)
  assert(!artifacts.some((name) => name.endsWith('.gz') || name.endsWith('.jsonl')), 'log store must not create gzip or JSONL artifacts')
  console.log('[server-log-store-smoke] PASS')
} finally {
  store.closeServerLogDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
}
