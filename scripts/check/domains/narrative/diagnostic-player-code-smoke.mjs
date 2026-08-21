#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import Database from 'better-sqlite3'

const execFile = promisify(execFileCallback)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-sim-log-identity-'))
const logDatabasePath = path.join(tempRoot, 'logs.sqlite')
process.env.AI_LOG_DB_PATH = logDatabasePath
process.env.ACCOUNT_DB_PATH = path.join(tempRoot, 'accounts.sqlite')
process.env.PLAYER_CONTENT_DB_PATH = path.join(tempRoot, 'player-content.sqlite')

const [
  identityStore,
  codeContract,
  deviceIdentity,
  deviceContract,
  safety,
  store,
  accountContract,
  accountService,
  accountDatabase,
  playerContentDatabase,
] = await Promise.all([
  import('../../../../src/core/logger/diagnostic-player-identity.ts'),
  import('../../../../src/core/logger/diagnostic-player-code.ts'),
  import('../../../../src/core/logger/device-provenance-identity.ts'),
  import('../../../../src/core/logger/device-provenance.ts'),
  import('../../../../src/core/logger/server-log-safety.ts'),
  import('../../../../src/core/logger/server-log-store.ts'),
  import('../../../../src/core/account/account-contract.ts'),
  import('../../../../src/core/account/account-service.ts'),
  import('../../../../src/core/account/account-database.ts'),
  import('../../../../src/core/player-content/player-content-database.ts'),
])

try {
  const firstCode = accountContract.UsernameSchema
    ? codeContract.normalizeDiagnosticPlayerCode(await identityStore.ensureDiagnosticPlayerCode())
    : null
  assert(firstCode, 'allocated diagnostic code must use the six-character contract')
  assert(/[A-Z]/.test(firstCode) && /[0-9]/.test(firstCode), 'diagnostic code must mix uppercase letters and digits')
  assert(await identityStore.ensureDiagnosticPlayerCode(firstCode) === firstCode, 'existing diagnostic code must remain stable')
  const secondCode = await identityStore.ensureDiagnosticPlayerCode()
  assert(secondCode && secondCode !== firstCode, 'SQLite reservation must not reuse an occupied code')
  const firstDeviceId = await deviceIdentity.ensureDeviceProvenanceId()
  assert(deviceContract.normalizeDeviceProvenanceId(firstDeviceId) === firstDeviceId, 'device provenance ID must use the stable plaintext contract')
  assert(await deviceIdentity.ensureDeviceProvenanceId(firstDeviceId) === firstDeviceId, 'existing device provenance ID must remain stable')

  const registration = accountContract.RegisterRequestSchema.parse({
    username: '日志测试用户',
    qq: '',
    password: 'plain-password-123',
    confirmPassword: 'plain-password-123',
    initialData: {
      settings: {
        provider: 'deepseek',
        customUrl: '',
        customModel: 'deepseek-chat',
        temperature: 0.8,
        topP: 0.9,
        reasoningEffort: 'level-2',
        talentThinkingIntensity: 'level-2',
        aiTalentGeneration: true,
        storySeed: '',
        narrativeStyle: 'default',
        wordCountTarget: 1200,
        streamingMode: 'off',
        comfortableParagraphs: true,
        reduceMotion: false,
        theme: 'minimal-white',
      },
      saveApiKey: false,
      apiKey: null,
      characterDraft: accountContract.DEFAULT_CLOUD_CHARACTER_DRAFT,
      reincarnationTalents: [],
      gameRecords: [],
    },
  })
  const account = await accountService.registerAccount(registration)

  const request = new Request('http://localhost/api/debug-log', {
    headers: {
      'x-real-ip': '198.51.100.42',
      cookie: `${codeContract.DIAGNOSTIC_PLAYER_CODE_COOKIE}=${firstCode}; ${deviceContract.DEVICE_PROVENANCE_ID_COOKIE}=${firstDeviceId}; ${accountContract.ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(account.token)}`,
    },
  })
  const baseSource = safety.getServerRequestSource(request)
  assert(!baseSource.isRegistered, 'pure network source parser must not trust account headers')
  const source = store.getServerRequestSource(request)
  assert(source.diagnosticCode === firstCode, 'issued diagnostic Cookie must join the source')
  assert(source.deviceProvenanceId === firstDeviceId, 'issued device provenance Cookie must join the source independently')
  assert(source.isRegistered, 'valid server session must mark the source as registered')
  assert(source.username === '日志测试用户' && source.accountId, 'trusted account ID and username must join every row')

  await store.appendServerLogEntry({
    id: 'identity-smoke-entry',
    entryType: 'ai-call',
    category: 'narrative-rounds',
    source,
    requestId: 'identity-smoke-request',
    prompt: '用户身份关联 Prompt',
    response: '用户身份关联叙事',
    payload: { apiKey: 'visible-plain-value' },
  })
  const row = store.queryServerLogEntries({ requestId: 'identity-smoke-request' }).entries[0]
  assert(row.accountId === source.accountId && row.username === source.username, 'database query must return account identity')
  assert(row.deviceProvenanceId === firstDeviceId, 'database query must return the independent device provenance ID')
  assert(row.payload.apiKey === 'visible-plain-value', 'identity-associated payload must remain plaintext')

  const anonymous = store.getServerRequestSource(new Request('http://localhost/api/log', {
    headers: { 'x-real-ip': '203.0.113.9' },
  }))
  assert(!anonymous.isRegistered && !anonymous.accountId && !anonymous.username, 'missing session must remain explicitly anonymous')

  const database = new Database(logDatabasePath, { readonly: true, fileMustExist: true })
  try {
    assert(database.prepare('SELECT COUNT(*) AS count FROM diagnostic_identities').get().count === 2, 'diagnostic code reservations must be stored in SQLite')
    assert(database.prepare('SELECT COUNT(*) AS count FROM device_provenance_identities').get().count === 1, 'device provenance reservations must be stored in SQLite')
  } finally {
    database.close()
  }

  const inspected = await execFile(process.execPath, [
    path.resolve('scripts/ops/inspect-ai-logs.mjs'),
    '--database', logDatabasePath,
    '--all',
    '--account-id', source.accountId,
    '--device-id', firstDeviceId,
  ], { encoding: 'utf8' })
  const report = JSON.parse(inspected.stdout)
  assert(report.filters.accountId === source.accountId, 'inspector must expose the account filter')
  assert(report.filters.deviceId === firstDeviceId, 'inspector must expose the device provenance filter')
  assert(report.entries[0].username === '日志测试用户', 'inspector must show registered username')
  assert(report.entries[0].prompt === '用户身份关联 Prompt', 'inspector must show plaintext Prompt without an extra flag')
  assert(report.entries[0].response === '用户身份关联叙事', 'inspector must show plaintext response without an extra flag')

  console.log(`[diagnostic-player-code-smoke] PASS code=${firstCode}`)
} finally {
  store.closeServerLogDatabaseForTests()
  accountDatabase.closeAccountDatabaseForTests()
  playerContentDatabase.closePlayerContentDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
  delete process.env.ACCOUNT_DB_PATH
  delete process.env.PLAYER_CONTENT_DB_PATH
}
