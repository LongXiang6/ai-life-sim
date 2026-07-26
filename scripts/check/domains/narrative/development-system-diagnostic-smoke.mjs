import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-system-diagnostic-'))
const previousNodeEnv = process.env.NODE_ENV
process.env.NODE_ENV = 'development'
process.env.DEVELOPMENT_SYSTEM_DIAGNOSTIC_DIR = tempRoot

const diagnostic = await import('../../../../src/core/logger/development-system-diagnostic.server.ts')

try {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const old = new Date(now)
  old.setDate(old.getDate() - 2)
  const key = (value) => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
  await fs.writeFile(path.join(tempRoot, `${key(old)}.jsonl`), '{"old":true}\n', 'utf8')
  await fs.writeFile(path.join(tempRoot, `${key(yesterday)}.jsonl`), '{"yesterday":true}\n', 'utf8')

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
  await diagnostic.appendDevelopmentSystemEvents([event])

  const lines = (await fs.readFile(diagnostic.getDevelopmentSystemDiagnosticPath(now), 'utf8'))
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line))
  assert.deepEqual(lines.at(-1), event)
  await assert.rejects(() => fs.access(path.join(tempRoot, `${key(old)}.jsonl`)))
  await fs.access(path.join(tempRoot, `${key(yesterday)}.jsonl`))

  process.env.NODE_ENV = 'production'
  const before = await fs.readFile(diagnostic.getDevelopmentSystemDiagnosticPath(now), 'utf8')
  await diagnostic.appendDevelopmentSystemEvents([{ ...event, timestamp: Date.now(), event: 'production-skip' }])
  const after = await fs.readFile(diagnostic.getDevelopmentSystemDiagnosticPath(now), 'utf8')
  assert.equal(after, before)

  console.log('[development-system-diagnostic-smoke] PASS')
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
  delete process.env.DEVELOPMENT_SYSTEM_DIAGNOSTIC_DIR
  await fs.rm(tempRoot, { recursive: true, force: true })
}
