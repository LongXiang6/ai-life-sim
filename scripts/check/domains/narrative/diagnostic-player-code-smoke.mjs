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
    schemaVersion: 2,
    eventId: 'diagnostic-code-smoke-event',
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

  const repeatedPrompt = '固定提示词与完整上下文。'.repeat(500)
  const firstRef = await store.storeServerLogContent(repeatedPrompt, 'text')
  const secondRef = await store.storeServerLogContent(repeatedPrompt, 'text')
  assert(firstRef?.hash === secondRef?.hash, 'identical large content must reuse one SHA-256 reference')
  assert(firstRef?.path === secondRef?.path, 'identical large content must reuse one gzip object path')
  assert(await store.readServerLogContent(firstRef) === repeatedPrompt, 'content reference must restore the complete text')

  const protectedRef = await store.storeServerLogContent({
    apiKey: 'player-secret-key',
    serialNumber: 'SERIAL-001',
    story: repeatedPrompt,
  }, 'json')
  const restoredProtected = await store.readServerLogContent(protectedRef)
  assert(restoredProtected.apiKey === '[REDACTED]', 'content store must redact API keys before hashing and writing')
  assert(restoredProtected.serialNumber === '[REDACTED]', 'content store must redact device serials before hashing and writing')
  assert(restoredProtected.story === repeatedPrompt, 'content store must preserve complete non-secret story text')

  const contextRef = await store.storeServerLogContent({
    path: '/game-story',
    environmentSnapshot: { viewportWidth: 390, deviceMemoryGiB: 8 },
  }, 'json')
  const v2Event = {
    schemaVersion: 2,
    eventId: 'diagnostic-code-v2-event',
    requestId: 'diagnostic-code-request',
    timestamp: new Date().toISOString(),
    receivedAt: Date.now(),
    level: 'info',
    module: 'diagnostic-session',
    message: 'environment-snapshot',
    eventType: 'log',
    path: '/game-story',
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    contextRef,
  }
  await Promise.all([
    store.appendServerJsonLine('client-events/client-events-2026-07-20.jsonl', v2Event),
    store.appendSourceJsonLine(source, 'client-events-2026-07-20.jsonl', v2Event),
    store.appendServerJsonLine('feedback/feedback-2026-07-20.jsonl', {
      schemaVersion: 2,
      feedbackId: 'FB-20260720-UNRELATED',
      receivedAt: Date.now(),
      sourceIp: source.ip,
      sourceId: source.sourceId,
      diagnosticCode: source.diagnosticCode,
      category: 'bug',
      subject: 'unrelated feedback',
    }),
  ])

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

  const inspectedContent = await execFile(process.execPath, [
    inspectorPath,
    '--root', tempRoot,
    '--all',
    '--player-code', firstCode,
    '--include-content',
  ], { encoding: 'utf8' })
  const contentReport = JSON.parse(inspectedContent.stdout)
  const environmentEvent = contentReport.clientEvents?.find((item) => item.eventId === 'diagnostic-code-v2-event')
  assert(environmentEvent?.context?.path === '/game-story', 'operator inspector must hydrate v2 content references')
  assert(environmentEvent?.context?.environmentSnapshot?.viewportWidth === 390, 'hydrated environment snapshot must remain complete')

  const inspectedRequest = await execFile(process.execPath, [
    inspectorPath,
    '--root', tempRoot,
    '--all',
    '--request-id', 'diagnostic-code-request',
  ], { encoding: 'utf8' })
  const requestReport = JSON.parse(inspectedRequest.stdout)
  assert(requestReport.totals.clientEvents === 1, 'request-id lookup must retain the matching client event')
  assert(requestReport.totals.feedbackSubmissions === 0, 'request-id lookup must exclude unrelated feedback metadata')
  assert(requestReport.recentFeedback.length === 0, 'request-id output must not attach unrelated feedback rows')

  console.log(`[diagnostic-player-code-smoke] PASS code=${firstCode}`)
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
