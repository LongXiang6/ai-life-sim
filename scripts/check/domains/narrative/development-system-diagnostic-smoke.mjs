#!/usr/bin/env node

/**
 * Purpose: Regress canonical SQLite persistence for execution diagnostics.
 * Owner: quality:narrative
 * Responsibility: One isolated development-event write and query check.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-system-diagnostic-'))
process.env.AI_LOG_DB_PATH = path.join(tempRoot, 'logs.sqlite')

const [diagnostic, store] = await Promise.all([
  import('../../../../src/core/logger/development-system-diagnostic.server.ts'),
  import('../../../../src/core/logger/server-log-store.ts'),
])

try {
  const event = {
    schemaVersion: 1,
    timestamp: Date.now(),
    system: 'summary-compressor',
    event: 'compression-completed',
    status: 'ok',
    lifeRunId: 'life-diagnostic-smoke',
    round: 9,
    durationMs: 12,
    details: {
      level: 'L1',
      sourceRounds: [1, 2, 3, 4],
      message: '完整明文诊断内容',
    },
  }
  await diagnostic.appendDevelopmentSystemEvents([event], {
    ip: '198.51.100.7',
    sourceId: 'ip-198.51.100.7',
    diagnosticCode: 'ABC234',
    isRegistered: false,
  })

  const row = store.queryServerLogEntries({ entryType: 'development-event' }).entries[0]
  assert.equal(row.module, event.system)
  assert.equal(row.message, event.event)
  assert.equal(row.round, event.round)
  assert.equal(row.payload.event, event.event)
  assert.equal(row.payload.details.message, event.details.message)
  assert.equal(row.sourceIp, '198.51.100.7')
  console.log('[development-system-diagnostic-smoke] PASS')
} finally {
  store.closeServerLogDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
}
