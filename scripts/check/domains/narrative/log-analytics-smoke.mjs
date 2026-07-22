#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { extractAggregateTerms } from '../../../../src/core/logger/usage-metrics.ts'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-log-analytics-'))

try {
  await Promise.all([
    fs.mkdir(path.join(root, 'proxy-access'), { recursive: true }),
    fs.mkdir(path.join(root, 'client-events'), { recursive: true }),
  ])
  const access = [
    { timestamp: '2026-07-22T00:00:00.000Z', diagnostic_code: 'AAA222', status: 200, provider: 'deepseek', model: 'deepseek-v4-pro', duration_ms: 1000, prompt_chars: 8000 },
    { timestamp: '2026-07-22T00:10:00.000Z', diagnostic_code: 'AAA222', status: 400, provider: 'deepseek', model: 'deepseek-v4-pro', duration_ms: 200, prompt_chars: 9000, error: 'thinking: missing field `type` at line 1' },
    { timestamp: '2026-07-22T01:10:00.000Z', diagnostic_code: 'BBB333', status: 200, provider: 'managed', model: 'LongCat-2.0', duration_ms: 3000, prompt_chars: 5000 },
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
  assert.equal(result.stdout.includes('低频词'), false, 'low-cohort branch terms must stay suppressed')
  assert.equal(result.stdout.includes('AAA222'), false, 'diagnostic identifiers must never enter aggregate output')
  assert.deepEqual(extractAggregateTerms('然后继续修炼，寻找秘境突破。修炼！'), ['修炼', '寻找', '秘境', '突破'])
  assert.equal(extractAggregateTerms('联系QQ 123456789，password=secret').some((term) => /123456789|password|secret/u.test(term)), false)

  console.log('[log-analytics-smoke] PASS')
} finally {
  const resolved = path.resolve(root)
  assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
  await fs.rm(resolved, { recursive: true, force: true })
}
