/**
 * Purpose: Verify local AI text mirrors preserve raw content, Beijing names, retention, and production shutdown.
 * Owner: quality:narrative
 * Responsibility: One isolated development-log mirror lifecycle only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-development-log-mirror-'))
const originalCwd = process.cwd()
const originalNodeEnv = process.env.NODE_ENV

process.chdir(tempRoot)
process.env.NODE_ENV = 'development'

const mirror = await import('../../../../src/core/logger/development-log-mirror.server.ts')

try {
  globalThis.__developmentLogMirrorLastTimestamp = undefined
  const root = mirror.getDevelopmentLogMirrorRoot()
  const oldDirectory = path.join(root, 'narrative-main')
  const oldFile = path.join(oldDirectory, '发送-2026-08-19_20-00-00-000.txt')
  await fs.mkdir(oldDirectory, { recursive: true })
  await fs.writeFile(oldFile, 'old mirror', 'utf8')
  const oldTime = new Date('2026-08-19T12:00:00.000Z')
  await fs.utimes(oldFile, oldTime, oldTime)

  const outbound = JSON.stringify([
    { role: 'system', content: '系统原始文本' },
    { role: 'user', content: '用户原始文本' },
  ])
  await mirror.writeDevelopmentLogMirror({
    callKind: 'narrative-main',
    direction: '发送',
    text: outbound,
  }, new Date('2026-08-23T12:34:56.789Z'))

  const currentFile = path.join(oldDirectory, '发送-2026-08-23_20-34-56-789.txt')
  assert.equal(await fs.readFile(currentFile, 'utf8'), outbound)
  await assert.rejects(() => fs.access(oldFile))

  process.env.NODE_ENV = 'production'
  await mirror.writeDevelopmentLogMirror({
    callKind: 'narrative-main',
    direction: '接收',
    text: '生产环境不写入',
  }, new Date('2026-08-23T12:34:57.000Z'))
  await assert.rejects(() => fs.access(path.join(oldDirectory, '接收-2026-08-23_20-34-57-000.txt')))

  console.log('[development-log-mirror-smoke] PASS')
} finally {
  globalThis.__developmentLogMirrorLastTimestamp = undefined
  process.chdir(originalCwd)
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  await fs.rm(tempRoot, { recursive: true, force: true })
}
