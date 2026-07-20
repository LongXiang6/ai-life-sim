#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-sim-player-code-'))
process.env.AI_LOG_DIR = tempRoot

try {
  const [identityStore, codeContract, safety, store] = await Promise.all([
    import('../../../../src/core/logger/diagnostic-player-identity.ts'),
    import('../../../../src/core/logger/diagnostic-player-code.ts'),
    import('../../../../src/core/logger/server-log-safety.ts'),
    import('../../../../src/core/logger/server-log-store.ts'),
  ])

  const firstCode = codeContract.normalizeDiagnosticPlayerCode(
    await identityStore.ensureDiagnosticPlayerCode(),
  )
  assert(firstCode, 'allocated diagnostic code must use the six-character contract')
  assert(/[A-Z]/.test(firstCode) && /[0-9]/.test(firstCode), 'diagnostic code must mix uppercase letters and digits')
  assert(
    await identityStore.ensureDiagnosticPlayerCode(firstCode) === firstCode,
    'an existing issued code must remain stable across requests and IP changes',
  )

  const source = safety.getServerRequestSource(new Request('http://localhost/api/log', {
    headers: {
      'x-real-ip': '198.51.100.42',
      'x-player-code': 'ZZZ999',
      cookie: `${codeContract.DIAGNOSTIC_PLAYER_CODE_COOKIE}=${firstCode}`,
    },
  }))
  assert(source.diagnosticCode === firstCode, 'server log classification must read the issued Cookie code')
  assert(source.diagnosticCode !== 'ZZZ999', 'client-controlled headers must not override the diagnostic code')

  const secondCode = await identityStore.ensureDiagnosticPlayerCode()
  assert(secondCode !== firstCode, 'atomic allocation must not reuse an occupied code')

  const event = {
    timestamp: new Date().toISOString(),
    level: 'info',
    module: 'diagnostic-code-smoke',
    message: 'player action',
    eventType: 'user_action',
    action: 'smoke-action',
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
  }
  await Promise.all([
    store.appendServerJsonLine('client-events/client-events-2026-07-19.jsonl', event),
    store.appendSourceJsonLine(source, 'client-events-2026-07-19.jsonl', event),
  ])

  const playerIndex = path.join(tempRoot, 'players', firstCode, 'client-events-2026-07-19.jsonl')
  assert((await fs.readFile(playerIndex, 'utf8')).includes(firstCode), 'per-player log index must carry the diagnostic code')
  await fs.access(path.join(tempRoot, 'diagnostic-identities', 'codes', `${firstCode}.json`))

  const inspectorPath = path.resolve('scripts/ops/inspect-ai-logs.mjs')
  const inspected = await execFile(process.execPath, [
    inspectorPath,
    '--root', tempRoot,
    '--all',
    '--player-code', firstCode,
  ], { encoding: 'utf8' })
  const report = JSON.parse(inspected.stdout)
  assert(report.filters.playerCode === firstCode, 'operator inspector must expose the active player-code filter')
  assert(report.recentClientEvents?.[0]?.diagnosticCode === firstCode, 'player-code lookup must return correlated client actions')

  console.log(`[diagnostic-player-code-smoke] PASS code=${firstCode}`)
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
