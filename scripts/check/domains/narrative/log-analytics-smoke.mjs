#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  extractAggregateTerms,
  storyRepetitionUsageMetricKey,
  storyRepetitionUsageMetricRevision,
} from '../../../../src/core/logger/usage-metrics.ts'
import {
  buildCanonicalStoryRepetitionSet,
  summarizeStoryRepetitionRows,
} from '../../../ops/lib/story-repetition-analytics.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-log-analytics-'))

try {
  await Promise.all([
    fs.mkdir(path.join(root, 'proxy-access'), { recursive: true }),
    fs.mkdir(path.join(root, 'client-events'), { recursive: true }),
  ])
  process.env.AI_LOG_DIR = root
  process.env.AI_DIAGNOSTIC_LOGS_ENABLED = 'true'
  const { POST: postClientLog } = await import('../../../../src/app/api/log/route.ts')
  const routeTimestamp = Date.now()
  const routeResponse = await postClientLog(new Request('http://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: 'warn',
      module: 'hostile-client',
      message: 'PRIVATE_ROUTE_CANARY',
      timestamp: routeTimestamp,
      raw: 'PRIVATE_ROUTE_CANARY',
      context: { story: 'PRIVATE_ROUTE_CANARY' },
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-route-test-0003',
        round: 2,
        windowSize: 1,
        wordRepeatRate: 0.81,
        maxRecentWordOverlap: 0.7,
        maxRecentNgramSimilarity: 0.75,
        qualityLevel: 'normal',
      },
    }),
  }))
  assert.equal(routeResponse.status, 200)
  const routeFile = path.join(
    root,
    'client-events',
    `client-events-${new Date().toISOString().slice(0, 10)}.jsonl`,
  )
  const routeEntry = JSON.parse((await fs.readFile(routeFile, 'utf8')).trim())
  assert.equal(routeEntry.module, 'usage-metric')
  assert.equal(routeEntry.message, 'story_repetition')
  assert.equal(routeEntry.timestamp, routeTimestamp)
  assert.equal(Number.isSafeInteger(routeEntry.receivedAt), true)
  assert.equal(JSON.stringify(routeEntry).includes('PRIVATE_ROUTE_CANARY'), false)
  assert.equal(routeEntry.rawRef, undefined)
  assert.equal(routeEntry.contextRef, undefined)
  assert.equal(routeEntry.metric.qualityLevel, 'high', 'server must derive quality from numeric rates')

  for (const [round, windowSize] of [[1, 1], [2, 2], [7, 6]]) {
    const invalidWindowResponse = await postClientLog(new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        module: 'usage-metric',
        message: 'story_repetition',
        timestamp: routeTimestamp,
        metric: {
          schemaVersion: 2,
          kind: 'story_repetition',
          lifeRunId: 'life-route-test-0003',
          round,
          windowSize,
          wordRepeatRate: 0.2,
          maxRecentWordOverlap: 0.1,
          maxRecentNgramSimilarity: 0.1,
          qualityLevel: 'normal',
        },
      }),
    }))
    assert.equal(invalidWindowResponse.status, 400, `round ${round} must reject window ${windowSize}`)
  }

  let rateLimitedResponse
  for (let attempt = 0; attempt < 130; attempt += 1) {
    const response = await postClientLog(new Request('http://localhost/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }))
    if (response.status === 429) {
      rateLimitedResponse = response
      break
    }
  }
  assert.equal(rateLimitedResponse?.status, 429, 'client log route must enforce a per-source rate limit')
  assert.equal(rateLimitedResponse?.headers.get('Retry-After'), '60')

  const access = [
    { timestamp: '2026-07-22T00:00:00.000Z', diagnostic_code: 'AAA222', status: 200, provider: 'deepseek', model: 'deepseek-v4-pro', duration_ms: 1000, prompt_chars: 8000 },
    { timestamp: '2026-07-22T00:10:00.000Z', diagnostic_code: 'AAA222', status: 400, provider: 'deepseek', model: 'deepseek-v4-pro', duration_ms: 200, prompt_chars: 9000, error: 'thinking: missing field `type` at line 1' },
    { timestamp: '2026-07-22T01:10:00.000Z', diagnostic_code: 'BBB333', status: 200, provider: 'managed', model: 'LongCat-2.0', duration_ms: 3000, prompt_chars: 5000 },
    { timestamp: '2026-07-22T03:00:00.000Z', request_id: 'unknown-error-test', diagnostic_code: 'AAA222', status: 502, provider: 'deepseek', model: 'deepseek-v4-pro', duration_ms: 400, prompt_chars: 7000, error: 'PRIVATE_UPSTREAM_ERROR_CANARY echoed from an upstream body' },
  ]
  const metrics = [
    { timestamp: Date.parse('2026-07-22T00:05:00.000Z'), diagnosticCode: 'AAA222', metric: { schemaVersion: 1, kind: 'page_view', page: '/welcome' } },
    { timestamp: Date.parse('2026-07-22T01:05:00.000Z'), diagnosticCode: 'BBB333', metric: { schemaVersion: 1, kind: 'narrative_advance', timeStepKey: 'year:1' } },
    ...Array.from({ length: 3 }, (_, index) => ({
      timestamp: Date.parse(`2026-07-22T01:${10 + index}:00.000Z`),
      diagnosticCode: 'BBB333',
      metric: {
        schemaVersion: 1,
        kind: 'branch_choice',
        branchChoiceType: 'custom',
        branchTerms: index === 0 ? ['修炼', '低频词'] : ['修炼'],
        branchChars: 12,
      },
    })),
    ...[0.1, 0.15, 0.2, 0.6, 0.7, 0.9, 0].map((wordRepeatRate, index) => ({
      timestamp: Date.parse(index === 5
        ? '2026-07-22T01:55:00.000Z'
        : `2026-07-22T01:${20 + index}:00.000Z`),
      receivedAt: Date.parse(index === 5
        ? '2026-07-22T00:55:00.000Z'
        : `2026-07-22T01:${20 + index}:00.000Z`),
      diagnosticCode: 'BBB333',
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-test-run-0001',
        round: index + 1,
        windowSize: index === 6 ? 0 : Math.min(index, 5),
        wordRepeatRate,
        maxRecentWordOverlap: Math.max(0, wordRepeatRate - 0.05),
        maxRecentNgramSimilarity: Math.max(0, wordRepeatRate - 0.1),
        qualityLevel: wordRepeatRate >= 0.8 ? 'high' : wordRepeatRate >= 0.6 ? 'watch' : 'normal',
      },
    })),
    {
      // Same life/round is a later server receipt even though its client clock
      // points backward. This repair must replace the initial 0.9 sample.
      timestamp: Date.parse('2026-07-22T00:15:00.000Z'),
      receivedAt: Date.parse('2026-07-22T01:40:00.000Z'),
      diagnosticCode: 'BBB333',
      raw: 'PRIVATE_STORY_CANARY',
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-test-run-0001',
        round: 6,
        windowSize: 5,
        wordRepeatRate: 0.3,
        maxRecentWordOverlap: 0.25,
        maxRecentNgramSimilarity: 0.2,
        qualityLevel: 'normal',
        storyText: 'PRIVATE_STORY_CANARY',
      },
    },
    {
      // Equal receipt times resolve by input sequence, and the stored client
      // quality label is ignored in favor of the numeric rates.
      timestamp: Date.parse('2026-07-22T00:20:00.000Z'),
      receivedAt: Date.parse('2026-07-22T01:40:00.000Z'),
      diagnosticCode: 'BBB333',
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-test-run-0001',
        round: 6,
        windowSize: 5,
        wordRepeatRate: 0.35,
        maxRecentWordOverlap: 0.3,
        maxRecentNgramSimilarity: 0.25,
        qualityLevel: 'high',
      },
    },
    {
      timestamp: Date.parse('2026-07-22T00:30:00.000Z'),
      receivedAt: Date.parse('2026-07-22T01:35:00.000Z'),
      diagnosticCode: 'BBB333',
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-test-run-0002',
        round: 2,
        windowSize: 1,
        wordRepeatRate: 0.4,
        maxRecentWordOverlap: 0.3,
        maxRecentNgramSimilarity: 0.2,
        qualityLevel: 'normal',
      },
    },
    {
      timestamp: Date.parse('2026-07-22T00:10:00.000Z'),
      receivedAt: Date.parse('2026-07-22T01:30:00.000Z'),
      diagnosticCode: 'CCC444',
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-test-run-0001',
        round: 2,
        windowSize: 1,
        wordRepeatRate: 0.8,
        maxRecentWordOverlap: 0.7,
        maxRecentNgramSimilarity: 0.6,
        qualityLevel: 'high',
      },
    },
  ]
  await Promise.all([
    fs.writeFile(path.join(root, 'proxy-access', 'proxy-access-2026-07-22.jsonl'), `${access.map(JSON.stringify).join('\n')}\n`),
    fs.writeFile(path.join(root, 'client-events', 'client-events-2026-07-22.jsonl'), `${metrics.map(JSON.stringify).join('\n')}\n`),
  ])

  const result = spawnSync(process.execPath, [
    'scripts/ops/analyze-ai-logs.mjs',
    '--root', root,
    '--from', '2026-07-22T00:00:00.000Z',
    '--to', '2026-07-22T02:00:00.000Z',
    '--compare-at', '2026-07-22T01:00:00.000Z',
    '--min-term-count', '3',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.overall.traffic.requests, 3)
  assert.equal(report.comparison.before.traffic.failed, 1)
  assert.equal(report.comparison.after.traffic.successful, 1)
  assert.deepEqual(report.overall.timeSteps, [{ key: 'year:1', count: 1 }])
  assert.deepEqual(report.overall.branchChoices.highFrequencyTerms, [{ key: '修炼', count: 3 }])
  assert.equal(report.overall.metricKinds.story_repetition, 9)
  assert.deepEqual(report.overall.storyRepetition, {
    observedGames: 3,
    observedRounds: 9,
    comparedRounds: 7,
    averageWordRepeatRate: 0.4571,
    recentAverageWordRepeatRate: 0.4571,
    peakWordRepeatRate: 0.8,
    highRepeatRounds: 1,
    highRepeatRatio: 0.1429,
    risingGames: 1,
  })
  assert.equal('perGame' in report.overall.storyRepetition, false)
  assert.equal(result.stdout.includes('life-test-run'), false, 'default aggregate output must not expose life run IDs')
  assert.deepEqual(report.comparison.before.storyRepetition, {
    observedGames: 0,
    observedRounds: 0,
    comparedRounds: 0,
    averageWordRepeatRate: 0,
    recentAverageWordRepeatRate: 0,
    peakWordRepeatRate: 0,
    highRepeatRounds: 0,
    highRepeatRatio: 0,
    risingGames: 0,
  })
  assert.deepEqual(report.comparison.after.storyRepetition, report.overall.storyRepetition)
  assert.equal(result.stdout.includes('低频词'), false, 'low-cohort branch terms must stay suppressed')
  assert.equal(result.stdout.includes('AAA222'), false, 'diagnostic identifiers must never enter aggregate output')
  assert.equal(result.stdout.includes('"lifeRunId"'), false, 'default output must not contain a lifeRunId field')
  assert.equal(result.stdout.includes('PRIVATE_STORY_CANARY'), false, 'story summaries must allowlist numbers and omit text')
  assert.deepEqual(extractAggregateTerms('然后继续修炼，寻找秘境突破。修炼！'), ['修炼', '寻找', '秘境', '突破'])
  assert.equal(extractAggregateTerms('联系QQ 123456789，password=secret').some((term) => /123456789|password|secret/u.test(term)), false)
  const initialRoundMetric = metrics.find((entry) => entry.metric.kind === 'story_repetition' && entry.metric.round === 6).metric
  const finalRoundMetric = metrics.findLast((entry) => entry.metric.kind === 'story_repetition' && entry.metric.round === 6).metric
  assert.equal(storyRepetitionUsageMetricKey(initialRoundMetric), storyRepetitionUsageMetricKey(finalRoundMetric))
  assert.notEqual(storyRepetitionUsageMetricRevision(initialRoundMetric), storyRepetitionUsageMetricRevision(finalRoundMetric))

  const unknownErrorResult = spawnSync(process.execPath, [
    'scripts/ops/analyze-ai-logs.mjs',
    '--root', root,
    '--from', '2026-07-22T02:30:00.000Z',
    '--to', '2026-07-22T03:30:00.000Z',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(unknownErrorResult.status, 0, unknownErrorResult.stderr)
  assert.deepEqual(JSON.parse(unknownErrorResult.stdout).overall.errors, [
    { key: 'unclassified_upstream_error', count: 1 },
  ])
  assert.equal(unknownErrorResult.stdout.includes('PRIVATE_UPSTREAM_ERROR_CANARY'), false)

  const unknownErrorInspectResult = spawnSync(process.execPath, [
    'scripts/ops/inspect-ai-logs.mjs',
    '--root', root,
    '--all',
    '--request-id', 'unknown-error-test',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(unknownErrorInspectResult.status, 0, unknownErrorInspectResult.stderr)
  assert.equal(
    JSON.parse(unknownErrorInspectResult.stdout).recentProxyIssues[0].error,
    'unclassified_upstream_error',
  )
  assert.equal(unknownErrorInspectResult.stdout.includes('PRIVATE_UPSTREAM_ERROR_CANARY'), false)

  const playerReportResult = spawnSync(process.execPath, [
    'scripts/ops/analyze-ai-logs.mjs',
    '--root', root,
    '--from', '2026-07-22T00:00:00.000Z',
    '--to', '2026-07-22T02:00:00.000Z',
    '--compare-at', '2026-07-22T01:00:00.000Z',
    '--player-code', 'BBB333',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(playerReportResult.status, 0, playerReportResult.stderr)
  const playerReport = JSON.parse(playerReportResult.stdout)
  assert.equal(playerReport.privacy.playerFilterApplied, true)
  assert.equal(playerReport.overall.traffic.requests, 1)
  assert.equal(playerReport.overall.storyRepetition.observedGames, 2)
  assert.equal(playerReport.overall.storyRepetition.observedRounds, 8)
  assert.equal(playerReport.overall.storyRepetition.comparedRounds, 6)
  assert.deepEqual(playerReport.overall.storyRepetition.perGame.map((game) => game.gameAlias), ['game-1', 'game-2'])
  assert.equal(playerReport.overall.storyRepetition.perGame[0].observedRounds, 7)
  assert.equal(playerReport.overall.storyRepetition.perGame[0].recentAverageWordRepeatRate, 0.4)
  assert.equal(playerReport.overall.storyRepetition.perGame[0].peakWordRepeatRate, 0.7)
  assert.equal(playerReport.overall.storyRepetition.perGame[0].highRepeatRounds, 0)
  assert.equal(playerReport.overall.storyRepetition.perGame[0].peakRound, 5)
  assert.equal(playerReport.overall.storyRepetition.perGame[0].trend, 'rising')
  assert.deepEqual(playerReport.overall.storyRepetition.perGame[0].recentRounds.map((row) => row.round), [2, 3, 4, 5, 6])
  assert.equal(playerReport.overall.storyRepetition.perGame[0].recentRounds.at(-1).wordRepeatRate, 0.35)
  assert.deepEqual(
    playerReport.comparison.after.storyRepetition.perGame.map((game) => game.gameAlias),
    ['game-1', 'game-2'],
  )
  assert.equal(playerReportResult.stdout.includes('life-test-run'), false)
  assert.equal(playerReportResult.stdout.includes('"lifeRunId"'), false)
  assert.equal(playerReportResult.stdout.includes('BBB333'), false, 'player-filtered aggregate output must not echo the diagnostic code')

  const playerTopResult = spawnSync(process.execPath, [
    'scripts/ops/analyze-ai-logs.mjs',
    '--root', root,
    '--from', '2026-07-22T00:00:00.000Z',
    '--to', '2026-07-22T02:00:00.000Z',
    '--player-code', 'BBB333',
    '--top', '1',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(playerTopResult.status, 0, playerTopResult.stderr)
  assert.equal(JSON.parse(playerTopResult.stdout).overall.storyRepetition.perGame.length, 2, '--top must not truncate player games')

  const inspectResult = spawnSync(process.execPath, [
    'scripts/ops/inspect-ai-logs.mjs',
    '--root', root,
    '--all',
    '--player-code', 'BBB333',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(inspectResult.status, 0, inspectResult.stderr)
  const inspected = JSON.parse(inspectResult.stdout)
  assert.equal(inspected.storyRepetition.observedGames, 2)
  assert.equal(inspected.storyRepetition.observedRounds, 8)
  assert.deepEqual(inspected.storyRepetition.perGame.map((game) => game.gameAlias), ['game-1', 'game-2'])
  assert.equal(inspected.storyRepetition.perGame[0].comparedRounds, 5)
  assert.equal(inspected.storyRepetition.perGame[0].recentAverageWordRepeatRate, 0.4)
  assert.equal(inspected.storyRepetition.perGame[0].peakWordRepeatRate, 0.7)
  assert.equal(inspected.storyRepetition.perGame[0].highRepeatRounds, 0)
  assert.equal(inspected.storyRepetition.perGame[0].peakRound, 5)
  assert.equal(inspected.storyRepetition.perGame[0].trend, 'rising')
  assert.deepEqual(inspected.storyRepetition.perGame[0].recentRounds.map((row) => row.round), [2, 3, 4, 5, 6])
  assert.equal(inspected.storyRepetition.perGame[0].recentRounds.at(-1).wordRepeatRate, 0.35)
  const inspectedSummaryText = JSON.stringify(inspected.storyRepetition)
  assert.equal(inspectedSummaryText.includes('life-test-run'), false)
  assert.equal(inspectedSummaryText.includes('BBB333'), false, 'player summaries must use aliases and omit the filter code')
  assert.equal(inspectResult.stdout.includes('PRIVATE_STORY_CANARY'), false, 'inspect summary must not expose story text')

  const inspectDefaultResult = spawnSync(process.execPath, [
    'scripts/ops/inspect-ai-logs.mjs',
    '--root', root,
    '--all',
  ], { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(inspectDefaultResult.status, 0, inspectDefaultResult.stderr)
  const inspectedDefault = JSON.parse(inspectDefaultResult.stdout)
  assert.equal('perGame' in inspectedDefault.totals.storyRepetition, false)
  assert.equal(JSON.stringify(inspectedDefault.totals.storyRepetition).includes('life-test-run'), false)

  const directSummary = summarizeStoryRepetitionRows(buildCanonicalStoryRepetitionSet(metrics).rows)
  assert.deepEqual(directSummary, report.overall.storyRepetition, 'overall output must derive from the shared canonical set')
  const playerCanonical = buildCanonicalStoryRepetitionSet(metrics.filter((entry) => entry.diagnosticCode === 'BBB333'))
  const secondGameOnly = summarizeStoryRepetitionRows(
    playerCanonical.rows.filter((row) => row.gameAlias === 'game-2'),
    { includePerGame: true },
  )
  assert.equal(secondGameOnly.perGame[0].gameAlias, 'game-2', 'comparison slices must retain canonical aliases')
  const chronologicalAliases = buildCanonicalStoryRepetitionSet([
    {
      receivedAt: 10,
      diagnosticCode: 'BBB333',
      metric: {
        kind: 'story_repetition', lifeRunId: 'life-z-first-game', round: 2, windowSize: 1,
        wordRepeatRate: 0.2, maxRecentWordOverlap: 0.1, maxRecentNgramSimilarity: 0.1,
      },
    },
    {
      receivedAt: 20,
      diagnosticCode: 'BBB333',
      metric: {
        kind: 'story_repetition', lifeRunId: 'life-a-second-game', round: 2, windowSize: 1,
        wordRepeatRate: 0.3, maxRecentWordOverlap: 0.2, maxRecentNgramSimilarity: 0.2,
      },
    },
  ]).rows
  assert.deepEqual(
    chronologicalAliases.map((row) => row.gameAlias),
    ['game-1', 'game-2'],
    'game aliases must follow first observation time instead of random ID ordering',
  )
  const anonymousSummary = summarizeStoryRepetitionRows(buildCanonicalStoryRepetitionSet([
    {
      timestamp: 10,
      metric: {
        kind: 'story_repetition', lifeRunId: 'life-anonymous-test', round: 2, windowSize: 1,
        wordRepeatRate: 0.9, maxRecentWordOverlap: 0.8, maxRecentNgramSimilarity: 0.8,
      },
    },
    {
      timestamp: 10,
      metric: {
        kind: 'story_repetition', lifeRunId: 'life-anonymous-test', round: 2, windowSize: 1,
        wordRepeatRate: 0.2, maxRecentWordOverlap: 0.1, maxRecentNgramSimilarity: 0.1,
      },
    },
  ]).rows)
  assert.equal(anonymousSummary.observedGames, 1)
  assert.equal(anonymousSummary.observedRounds, 1)
  assert.equal(anonymousSummary.averageWordRepeatRate, 0.2, 'anonymous equal-time revisions must use input sequence')

  console.log('[log-analytics-smoke] PASS')
} finally {
  const resolved = path.resolve(root)
  assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
  await fs.rm(resolved, { recursive: true, force: true })
}
