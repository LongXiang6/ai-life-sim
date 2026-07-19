#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  buildCleanupPlan,
  checkLocalHealth,
  isExecutedModule,
  parseArgs,
  removePlannedReleases,
} from '../../../ops/cleanup-old-releases.mjs'

const HOUR_MS = 60 * 60 * 1000
const nowMs = Date.now()
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-release-cleanup-'))

try {
  const releases = path.join(tempRoot, 'releases')
  const activeRelease = path.join(releases, 'active-release')
  const staleRelease = path.join(releases, 'stale-release')
  const freshRelease = path.join(releases, 'fresh-release')
  const activeLink = path.join(tempRoot, 'active')
  await Promise.all([
    fs.mkdir(activeRelease, { recursive: true }),
    fs.mkdir(staleRelease, { recursive: true }),
    fs.mkdir(freshRelease, { recursive: true }),
  ])
  await Promise.all([
    fs.writeFile(path.join(activeRelease, 'marker.txt'), 'active'),
    fs.writeFile(path.join(staleRelease, 'marker.txt'), 'stale'),
    fs.writeFile(path.join(freshRelease, 'marker.txt'), 'fresh'),
  ])
  await fs.symlink(activeRelease, activeLink, process.platform === 'win32' ? 'junction' : 'dir')
  await fs.utimes(staleRelease, new Date(nowMs - 120 * HOUR_MS), new Date(nowMs - 120 * HOUR_MS))
  await fs.utimes(freshRelease, new Date(nowMs - 12 * HOUR_MS), new Date(nowMs - 12 * HOUR_MS))

  const youngPlan = await buildCleanupPlan({
    releaseRoot: releases,
    activeLink,
    minAgeHours: 72,
    nowMs,
    activeActivatedAtMs: nowMs - 24 * HOUR_MS,
  })
  assert.equal(youngPlan.skippedReason, 'active-soak-incomplete')
  assert.deepEqual(youngPlan.candidates, [], 'a newly activated release must preserve every rollback directory')

  const maturePlan = await buildCleanupPlan({
    releaseRoot: releases,
    activeLink,
    minAgeHours: 72,
    nowMs,
    activeActivatedAtMs: nowMs - 96 * HOUR_MS,
  })
  assert.deepEqual(maturePlan.candidates.map((candidate) => candidate.name), ['stale-release'])
  await removePlannedReleases(maturePlan)
  await assert.rejects(fs.stat(staleRelease), { code: 'ENOENT' })
  assert.equal((await fs.stat(activeRelease)).isDirectory(), true, 'the active release must never be removed')
  assert.equal((await fs.stat(freshRelease)).isDirectory(), true, 'releases younger than 72 hours must remain')

  const parsed = parseArgs(['--min-age-hours', '72', '--execute'])
  assert.equal(parsed.minAgeHours, 72)
  assert.equal(parsed.execute, true)
  await assert.rejects(checkLocalHealth('https://example.com'), /local HTTP/)

  const opsDirectory = path.resolve('scripts/ops')
  const linkedOpsDirectory = path.join(tempRoot, 'ops-link')
  await fs.symlink(opsDirectory, linkedOpsDirectory, process.platform === 'win32' ? 'junction' : 'dir')
  const linkedScript = path.join(linkedOpsDirectory, 'cleanup-old-releases.mjs')
  const realScriptUrl = pathToFileURL(path.join(opsDirectory, 'cleanup-old-releases.mjs')).href
  assert.equal(
    await isExecutedModule(linkedScript, realScriptUrl),
    true,
    'the cleanup CLI must recognize execution through the active release symlink',
  )

  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    assert.equal(await checkLocalHealth(`http://127.0.0.1:${address.port}/`), 200)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }

  console.log('[release-cleanup-smoke] PASS')
} finally {
  const resolvedTemp = path.resolve(tempRoot)
  const resolvedOsTemp = path.resolve(os.tmpdir())
  assert.ok(resolvedTemp.startsWith(`${resolvedOsTemp}${path.sep}`), 'test cleanup must stay inside the OS temp root')
  await fs.rm(resolvedTemp, { recursive: true, force: true })
}
