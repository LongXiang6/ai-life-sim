#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-sim-memory-'))
process.env.NARRATIVE_MEMORY_DIR = tempRoot
const store = await import('../../../../src/core/storage/narrative-memory-store.ts')

const lifeRunId = 'life-memory-smoke'
const summary = {
  level: 1,
  startRound: 1,
  endRound: 4,
  createdRound: 4,
  content: '2026-01-01：普通日常[1，2026-01-01] | 重要事件[2，2026-01-02] | 永久事实[10，2026-01-03]',
  archiveContent: '2026-01-01：普通日常[1，2026-01-01] | 重要事件[2，2026-01-02] | 永久事实[10，2026-01-03]',
  rawCompressionResponse: '{"periods":[{"timeSpan":"2026-01-01","events":[]}],"completionMarker":"[SUMMARY_COMPLETE]"}',
  memoryEvents: [
    { id: 'e-1', timeSpan: '2026-01-01', text: '普通日常', occurrenceTime: '2026-01-01', sourceEventIds: [], sourceRounds: [1], initialWeight: 1, weightAnchorRound: 1, permanent: false },
    { id: 'e-2', timeSpan: '2026-01-02', text: '重要事件', occurrenceTime: '2026-01-02', sourceEventIds: [], sourceRounds: [2], initialWeight: 2, weightAnchorRound: 1, permanent: false },
    { id: 'e-10', timeSpan: '2026-01-03', text: '永久事实', occurrenceTime: '2026-01-03', sourceEventIds: [], sourceRounds: [3], initialWeight: 10, weightAnchorRound: 1, permanent: true },
  ],
}

try {
  store.syncNarrativeMemoryDatabase({ lifeRunId, currentRound: 1, summaries: [summary] })
  let results = store.searchNarrativeMemoryDatabase({ lifeRunId, currentRound: 1, terms: ['普通', '重要', '永久'] })
  assert.equal(results.length, 3, 'all L1 events must remain searchable, including archive-only weight 1')
  assert.equal(results.find((event) => event.eventId === 'e-1').active, false, 'weight 1 must leave the active projection immediately')
  assert.equal(results.find((event) => event.eventId === 'e-10').currentWeight, 10, 'weight 10 must be permanent')

  store.advanceNarrativeMemoryDatabase({ lifeRunId, currentRound: 3 })
  results = store.searchNarrativeMemoryDatabase({ lifeRunId, currentRound: 3, terms: ['重要'] })
  assert.equal(results[0].currentWeight, 0, 'weight 2 reaches zero after its configured decay interval')
  assert.equal(results[0].active, true, 'zero-weight memory remains visible for the zero round')

  store.advanceNarrativeMemoryDatabase({ lifeRunId, currentRound: 4 })
  results = store.searchNarrativeMemoryDatabase({ lifeRunId, currentRound: 4, terms: ['重要'] })
  assert.equal(results[0].active, false, 'zero-weight memory is forgotten on the following round')
  assert.equal(results[0].currentWeight, 0, 'forgotten memory remains searchable with weight zero')

  store.syncNarrativeMemoryDatabase({
    lifeRunId,
    currentRound: 4,
    summaries: [{ ...summary, rawCompressionResponse: '{"tampered":true}' }],
  })
  store.closeNarrativeMemoryDatabaseForTests()
  const database = new Database(store.getNarrativeMemoryDatabasePath(lifeRunId), { readonly: true })
  try {
    const archive = database.prepare('SELECT raw_ai_response, timeline_text, events_json FROM l1_archives WHERE summary_id = ?').get('L1:1-4')
    assert.equal(archive.raw_ai_response, summary.rawCompressionResponse, 'L1 archive must remain immutable')
    assert(archive.timeline_text.includes('普通日常[1'), 'L1 archive text must include weight 1 before active projection filtering')
    assert(archive.events_json.includes('永久事实'), 'L1 database archive must retain every original event')
    const storageFormat = database.prepare("SELECT value FROM memory_meta WHERE key = 'storage_format'").get().value
    assert.equal(storageFormat, 'plaintext-sqlite', 'memory database must declare plaintext storage')
  } finally {
    database.close()
  }
  console.log('PASS: narrative-memory-store-smoke')
} finally {
  store.closeNarrativeMemoryDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.NARRATIVE_MEMORY_DIR
}
