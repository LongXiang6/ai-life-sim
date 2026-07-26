#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  storyRepetitionUsageMetricKey,
  storyRepetitionUsageMetricRevision,
} from '../../../../src/core/logger/usage-metrics.ts'
import {
  buildCanonicalStoryRepetitionSet,
  summarizeStoryRepetitionRows,
} from '../../../ops/lib/story-repetition-analytics.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-log-analytics-'))
process.env.AI_LOG_DB_PATH = path.join(root, 'logs.sqlite')
process.env.AI_DIAGNOSTIC_LOGS_ENABLED = 'true'

const logStore = await import('../../../../src/core/logger/server-log-store.ts')

try {
  const { POST: postClientLog } = await import('../../../../src/app/api/log/route.ts')
  const now = Date.now()
  const source = {
    ip: '198.51.100.88',
    sourceId: 'ip-198.51.100.88',
    diagnosticCode: 'BBB333',
    isRegistered: false,
  }
  const metric = {
    schemaVersion: 2,
    kind: 'story_repetition',
    lifeRunId: 'life-route-test-0003',
    round: 2,
    windowSize: 1,
    wordRepeatRate: 0.81,
    maxRecentWordOverlap: 0.7,
    maxRecentNgramSimilarity: 0.75,
    qualityLevel: 'normal',
  }
  const routeResponse = await postClientLog(new Request('http://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': source.ip },
    body: JSON.stringify({
      level: 'info',
      module: 'story-quality',
      message: 'story_repetition',
      timestamp: now,
      eventType: 'metric',
      metric,
    }),
  }))
  assert.equal(routeResponse.status, 200)
  const routeEntry = logStore.queryServerLogEntries({ entryType: 'quality-metric' }).entries[0]
  assert.equal(routeEntry.payload.metric.qualityLevel, 'high', 'server must derive quality from numeric rates')
  assert.equal(routeEntry.payload.metric.lifeRunId, metric.lifeRunId, 'quality data must remain plaintext')

  const countBeforeAction = logStore.queryServerLogEntries({}).total
  const ignoredAction = await postClientLog(new Request('http://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.99' },
    body: JSON.stringify({
      level: 'info',
      module: 'user-interface',
      message: 'control-activated',
      timestamp: now,
      eventType: 'user_action',
      action: 'button-clicked',
      context: { label: '推进' },
    }),
  }))
  assert.equal(ignoredAction.status, 200)
  assert.equal((await ignoredAction.json()).ignored, 'user-operation')
  assert.equal(logStore.queryServerLogEntries({}).total, countBeforeAction, 'user-operation payload must not create a row')

  const ignoredLegacyMetric = await postClientLog(new Request('http://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.100' },
    body: JSON.stringify({
      level: 'info',
      module: 'usage-metric',
      message: 'page_view',
      timestamp: now,
      eventType: 'log',
      metric: { schemaVersion: 1, kind: 'page_view', page: '/game-story' },
    }),
  }))
  assert.equal((await ignoredLegacyMetric.json()).ignored, 'user-operation')
  assert.equal(logStore.queryServerLogEntries({}).total, countBeforeAction, 'legacy page-view metric must not create a row')

  await logStore.appendServerLogEntry({
    createdAt: now - 3_000,
    entryType: 'proxy-access',
    category: 'ai-proxy',
    requestId: 'analytics-success',
    source,
    provider: 'deepseek',
    model: 'deepseek-chat',
    status: 200,
    payload: { duration_ms: 1000, prompt_chars: 8000, status: 200, provider: 'deepseek', model: 'deepseek-chat' },
  })
  await logStore.appendServerLogEntry({
    createdAt: now - 2_000,
    entryType: 'proxy-access',
    category: 'ai-proxy',
    requestId: 'analytics-error',
    source,
    provider: 'deepseek',
    model: 'deepseek-chat',
    status: 502,
    error: 'PRIVATE_UPSTREAM_ERROR_CANARY',
    payload: { duration_ms: 200, prompt_chars: 9000, status: 502, error: 'PRIVATE_UPSTREAM_ERROR_CANARY' },
  })
  await logStore.appendServerLogEntry({
    createdAt: now - 1_000,
    entryType: 'raw-response',
    category: 'ai-proxy',
    requestId: 'analytics-error',
    source,
    status: 502,
    response: 'PRIVATE_UPSTREAM_BODY_CANARY',
    error: 'PRIVATE_UPSTREAM_BODY_CANARY',
    payload: { body: 'PRIVATE_UPSTREAM_BODY_CANARY' },
  })

  const from = new Date(now - 60_000).toISOString()
  const to = new Date(now + 60_000).toISOString()
  const analysisResult = spawnSync(process.execPath, [
    'scripts/ops/analyze-ai-logs.mjs',
    '--root', root,
    '--from', from,
    '--to', to,
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(analysisResult.status, 0, analysisResult.stderr)
  const report = JSON.parse(analysisResult.stdout)
  assert.equal(report.overall.traffic.requests, 2)
  assert.equal(report.overall.traffic.successful, 1)
  assert.equal(report.overall.traffic.failed, 1)
  assert.equal(report.overall.metricKinds.story_repetition, 1)
  assert.equal(report.overall.metricKinds.page_view, undefined, 'removed user-operation metrics must not appear in analytics')
  assert.equal(report.overall.storyRepetition.observedRounds, 1)

  const inspectResult = spawnSync(process.execPath, [
    'scripts/ops/inspect-ai-logs.mjs',
    '--root', root,
    '--all',
    '--request-id', 'analytics-error',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(inspectResult.status, 0, inspectResult.stderr)
  const inspected = JSON.parse(inspectResult.stdout)
  assert.equal(inspected.totals.entries, 2)
  assert.equal(inspected.entries.some((entry) => entry.response === 'PRIVATE_UPSTREAM_BODY_CANARY'), true, 'inspector must expose plaintext upstream response')
  assert.equal(inspectResult.stdout.includes('PRIVATE_UPSTREAM_ERROR_CANARY'), true, 'inspector must not redact error text')

  const revisedMetric = { ...metric, wordRepeatRate: 0.25, maxRecentWordOverlap: 0.2, maxRecentNgramSimilarity: 0.1 }
  assert.equal(storyRepetitionUsageMetricKey(metric), storyRepetitionUsageMetricKey(revisedMetric))
  assert.notEqual(storyRepetitionUsageMetricRevision(metric), storyRepetitionUsageMetricRevision(revisedMetric))
  const canonical = buildCanonicalStoryRepetitionSet([
    { receivedAt: now - 1, diagnosticCode: 'BBB333', metric },
    { receivedAt: now, diagnosticCode: 'BBB333', metric: revisedMetric },
  ])
  const summary = summarizeStoryRepetitionRows(canonical.rows)
  assert.equal(summary.observedRounds, 1)
  assert.equal(summary.averageWordRepeatRate, 0.25)

  console.log('[log-analytics-smoke] PASS')
} finally {
  logStore.closeServerLogDatabaseForTests()
  const resolved = path.resolve(root)
  assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
  await fs.rm(resolved, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
  delete process.env.AI_DIAGNOSTIC_LOGS_ENABLED
}
