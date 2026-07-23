import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-ops-dashboard-'))
const logRoot = path.join(tempRoot, 'logs')
const accountDatabasePath = path.join(tempRoot, 'accounts.sqlite')
const playerContentDatabasePath = path.join(tempRoot, 'player-content.sqlite')
process.env.ACCOUNT_DB_PATH = accountDatabasePath
process.env.PLAYER_CONTENT_DB_PATH = playerContentDatabasePath
process.env.PORTRAIT_ASSET_ROOT = path.join(tempRoot, 'portrait-assets')

const accountDatabaseModule = await import('../../../../src/core/account/account-database.ts')
const playerContentDatabaseModule = await import('../../../../src/core/player-content/player-content-database.ts')
const playerContentService = await import('../../../../src/core/player-content/player-content-service.ts')
const dashboard = await import('../../../ops/operations-dashboard.mjs')
const dashboardService = await fs.readFile(new URL('../../../ops/systemd/ai-life-sim-operations-dashboard.service', import.meta.url), 'utf8')

const privateValues = {
  username: 'private_test_user',
  ip: '203.0.113.42',
  code: 'ABC123',
  story: '不应出现在运营面板的故事正文',
  key: 'sk-private-dashboard-test',
}

let server
try {
  const now = Date.now()
  const accounts = accountDatabaseModule.getAccountDatabase()
  accounts.prepare(`
    INSERT INTO accounts(
      id, username, username_canonical, password_hash, settings_json,
      character_draft_json, created_at, last_active_at
    ) VALUES ('account-a', ?, ?, 'hash', '{}', '{}', ?, ?)
  `).run(privateValues.username, privateValues.username, now, now)
  accountDatabaseModule.closeAccountDatabaseForTests()

  playerContentService.saveCloudManualSave('account-a', {
    metadata: {
      schemaVersion: 1,
      slot: 1,
      name: '云端栏位',
      worldName: '测试世界',
      characterName: '测试角色',
      totalRounds: 120,
      gameVersion: '5.2.9',
      savedAt: now,
    },
    payload: { engine: {}, character: {}, world: {} },
  }, now)
  playerContentService.projectLeaderboardRecord('account-a', {
    recordId: 'record-a',
    completedAt: now,
    characterName: '测试角色',
    worldName: '测试世界',
    finalAge: 100,
    rounds: 120,
    died: false,
    moralityLabel: '至善',
    overallScore: 100,
    dimensions: [],
    destinyNames: [],
    gameVersion: '5.2.9',
  }, now)
  playerContentDatabaseModule.closePlayerContentDatabaseForTests()

  await fs.mkdir(path.join(logRoot, 'client-events'), { recursive: true })
  await fs.mkdir(path.join(logRoot, 'proxy-access'), { recursive: true })
  await fs.writeFile(path.join(logRoot, 'client-events', 'client-events-test.jsonl'), `${JSON.stringify({
    timestamp: now,
    diagnostic_code: privateValues.code,
    ip: privateValues.ip,
    metric: { kind: 'page_view', page: '/welcome', customText: privateValues.story },
  })}\n`, 'utf8')
  await fs.writeFile(path.join(logRoot, 'proxy-access', 'proxy-access-test.jsonl'), `${JSON.stringify({
    timestamp: now,
    diagnostic_code: privateValues.code,
    ip: privateValues.ip,
    status: 200,
    provider: 'test',
    model: 'test',
    duration_ms: 50,
    prompt: privateValues.story,
    apiKey: privateValues.key,
  })}\n`, 'utf8')

  const options = { logRoot, accountDatabase: accountDatabasePath, playerContentDatabase: playerContentDatabasePath }
  const snapshot = await dashboard.buildDashboardSnapshot(options, now + 1)
  assert.equal(snapshot.traffic.pageViews, 1)
  assert.equal(snapshot.traffic.estimatedPlayers, 1)
  assert.equal(snapshot.accounts.registered, 1)
  assert.equal(snapshot.accounts.registeredToday, 1)
  assert.equal(snapshot.content.cloudSaves, 1)
  assert.equal(snapshot.content.leaderboardAccounts, 1)
  assert.deepEqual(snapshot.privacy, { aggregateOnly: true, identifiersIncluded: false, rawContentIncluded: false })
  const serialized = JSON.stringify(snapshot)
  for (const value of Object.values(privateValues)) assert.equal(serialized.includes(value), false, value)

  server = dashboard.createOperationsDashboardServer(options)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  const page = await fetch(baseUrl).then((response) => response.text())
  assert.match(page, /运营统计/u)
  assert.equal(page.includes(privateValues.username), false)
  assert.equal((await fetch(`${baseUrl}/favicon.ico`)).status, 204)
  const apiResponse = await fetch(`${baseUrl}/api/stats`)
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await apiResponse.json()).accounts.registered, 1)
  assert.match(dashboardService, /--host 127\.0\.0\.1 --port 4317/u)
  assert.match(dashboardService, /ProtectSystem=strict/u)
  assert.doesNotMatch(dashboardService, /0\.0\.0\.0/u)

  const dashboardScriptPath = fileURLToPath(new URL('../../../ops/operations-dashboard.mjs', import.meta.url))
  const linkedOpsDirectory = path.join(tempRoot, 'linked-ops')
  await fs.symlink(
    path.dirname(dashboardScriptPath),
    linkedOpsDirectory,
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.equal(
    dashboard.isDirectExecution(path.join(linkedOpsDirectory, path.basename(dashboardScriptPath))),
    true,
  )
  assert.equal(dashboard.isDirectExecution(path.join(tempRoot, 'missing-dashboard.mjs')), false)

  console.log('[operations-dashboard-smoke] PASS')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  accountDatabaseModule.closeAccountDatabaseForTests()
  playerContentDatabaseModule.closePlayerContentDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
