import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-ops-dashboard-'))
const logRoot = path.join(tempRoot, 'logs')
const logDatabasePath = path.join(logRoot, 'logs.sqlite')
const accountDatabasePath = path.join(tempRoot, 'accounts.sqlite')
const playerContentDatabasePath = path.join(tempRoot, 'player-content.sqlite')
process.env.ACCOUNT_DB_PATH = accountDatabasePath
process.env.PLAYER_CONTENT_DB_PATH = playerContentDatabasePath
process.env.PORTRAIT_ASSET_ROOT = path.join(tempRoot, 'portrait-assets')
process.env.AI_LOG_DB_PATH = logDatabasePath

const accountDatabaseModule = await import('../../../../src/core/account/account-database.ts')
const playerContentDatabaseModule = await import('../../../../src/core/player-content/player-content-database.ts')
const playerContentService = await import('../../../../src/core/player-content/player-content-service.ts')
const logStore = await import('../../../../src/core/logger/server-log-store.ts')
const dashboard = await import('../../../ops/operations-dashboard.mjs')
const dashboardService = await fs.readFile(new URL('../../../ops/systemd/ai-life-sim-operations-dashboard.service', import.meta.url), 'utf8')

const loggedValues = {
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
  `).run(loggedValues.username, loggedValues.username, now, now)
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
    overallScore: 98,
    attributes: { physique: 12, mind: 12, talentAptitude: 12, charisma: 12 },
    dimensions: [
      { id: 'growth', label: '成长', description: '角色成长', weight: 34, value: 98, comment: '你持续完成了成长。' },
      { id: 'agency', label: '抉择', description: '关键选择', weight: 33, value: 98, comment: '你承担了关键选择。' },
      { id: 'impact', label: '影响', description: '世界影响', weight: 33, value: 98, comment: '你留下了清晰影响。' },
    ],
    destinyNames: [],
    achievements: [{ id: 'event-a', kind: 'choice', title: '完成测试', detail: '保留了完整记录', timeLabel: '第 120 轮' }],
    scoring: {
      version: 1,
      profile: {
        profileVersion: 1,
        worldId: 'test-world',
        dimensions: [
          { id: 'growth', label: '成长', description: '角色成长', weight: 34, evidenceKinds: ['attributes'], curveId: 'growth' },
          { id: 'agency', label: '抉择', description: '关键选择', weight: 33, evidenceKinds: ['choices'], curveId: 'agency' },
          { id: 'impact', label: '影响', description: '世界影响', weight: 33, evidenceKinds: ['achievements'], curveId: 'impact' },
        ],
      },
      rawScore: 98,
      validCompletedLife: true,
      evidence: { attributes: 98, journey: 100, choices: 100, 'lifespan-adjustments': 0, achievements: 100, completion: 100 },
      integrity: { passed: true, perfectGatePassed: false, checks: { terminalCommitted: true }, reasons: [] },
    },
    endingReview: { perspective: 'macro', review: '你完成了这一段可验证的人生。', evidenceIds: ['event-a'], source: 'local' },
    gameVersion: '5.2.9',
  }, now)
  // 本测试只验证运营聚合读取；排行榜资格不在此处重复构造评分审计。
  playerContentDatabaseModule.getPlayerContentDatabase().prepare(`
    INSERT OR IGNORE INTO leaderboard_best_runs(
      account_id, record_id, score, rounds, completed_at, record_json,
      portrait_asset_id, updated_at
    ) VALUES ('account-a', 'dashboard-record', 98, 120, ?, '{}', NULL, ?)
  `).run(now, now)
  playerContentDatabaseModule.closePlayerContentDatabaseForTests()

  const source = {
    ip: loggedValues.ip,
    sourceId: `ip-${loggedValues.ip}`,
    diagnosticCode: loggedValues.code,
    isRegistered: true,
    accountId: 'account-a',
    username: loggedValues.username,
  }
  await logStore.appendServerLogEntry({
    createdAt: now,
    entryType: 'quality-metric',
    category: 'story-repetition',
    level: 'info',
    module: 'story-quality',
    message: 'story_repetition',
    event: 'metric',
    source,
    payload: {
      receivedAt: now,
      metric: {
        schemaVersion: 2,
        kind: 'story_repetition',
        lifeRunId: 'life-dashboard-test',
        round: 2,
        windowSize: 1,
        wordRepeatRate: 0.625,
        maxRecentWordOverlap: 0.5,
        maxRecentNgramSimilarity: 0.4,
        qualityLevel: 'watch',
      },
    },
  })
  await logStore.appendServerLogEntry({
    createdAt: now,
    entryType: 'proxy-access',
    category: 'ai-proxy',
    level: 'info',
    module: 'api-proxy',
    requestId: 'dashboard-request',
    source,
    provider: 'test',
    model: 'test',
    status: 200,
    prompt: loggedValues.story,
    meta: { apiKey: loggedValues.key },
    payload: {
      timestamp: new Date(now).toISOString(),
      status: 200,
      provider: 'test',
      model: 'test',
      duration_ms: 50,
      prompt_chars: loggedValues.story.length,
    },
  })
  const storedRequest = logStore.queryServerLogEntries({ requestId: 'dashboard-request' }).entries[0]
  assert.equal(storedRequest.username, loggedValues.username)
  assert.equal(storedRequest.prompt, loggedValues.story)
  assert.equal(storedRequest.meta.apiKey, loggedValues.key)
  logStore.closeServerLogDatabaseForTests()

  const options = { logRoot, accountDatabase: accountDatabasePath, playerContentDatabase: playerContentDatabasePath }
  const snapshot = await dashboard.buildDashboardSnapshot(options, now + 1)
  assert.equal(snapshot.traffic.estimatedPlayers, 1)
  assert.equal(snapshot.traffic.aiRequests, 1)
  assert.equal(snapshot.traffic.failures, 0)
  assert.equal(snapshot.accounts.registered, 1)
  assert.equal(snapshot.accounts.registeredToday, 1)
  assert.equal(snapshot.content.cloudSaves, 1)
  assert.equal(snapshot.content.leaderboardAccounts, 1)
  assert.equal(snapshot.traffic.storyRepetition.observedGames, 1)
  assert.equal(snapshot.traffic.storyRepetition.observedRounds, 1)
  assert.equal(snapshot.traffic.storyRepetition.comparedRounds, 1)
  assert.equal(snapshot.traffic.storyRepetition.averageWordRepeatRate, 0.625)
  assert.equal(snapshot.traffic.storyRepetition.recentAverageWordRepeatRate, 0.625)
  assert.equal(snapshot.traffic.storyRepetition.peakWordRepeatRate, 0.625)
  assert.equal(snapshot.traffic.storyRepetition.highRepeatRounds, 0)
  assert.equal(snapshot.traffic.storyRepetition.highRepeatRatio, 0)
  assert.equal(snapshot.traffic.storyRepetition.risingGames, 0)
  assert.equal('privacy' in snapshot, false)
  assert.equal('pageViews' in snapshot.traffic, false)
  assert.equal('narrativeAdvances' in snapshot.traffic, false)

  server = dashboard.createOperationsDashboardServer(options)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  const page = await fetch(baseUrl).then((response) => response.text())
  assert.match(page, /运营统计/u)
  assert.match(page, /AI 请求与失败/u)
  assert.match(page, /重复率上升局数/u)
  assert.doesNotMatch(page, /页面访问|故事推进/u)
  const appScript = await fetch(`${baseUrl}/app.js`).then((response) => response.text())
  for (const field of ['observedGames', 'observedRounds', 'comparedRounds', 'averageWordRepeatRate', 'recentAverageWordRepeatRate', 'peakWordRepeatRate', 'highRepeatRounds', 'highRepeatRatio', 'risingGames']) {
    assert.equal(appScript.includes(field), true, `dashboard must render ${field}`)
  }
  assert.equal(appScript.includes('pageViews'), false)
  assert.equal(appScript.includes('narrativeAdvances'), false)
  assert.equal((await fetch(`${baseUrl}/favicon.ico`)).status, 204)
  const apiResponse = await fetch(`${baseUrl}/api/stats`)
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store')
  assert.equal((await apiResponse.json()).accounts.registered, 1)
  assert.match(dashboardService, /--host 127\.0\.0\.1 --port 4317/u)
  assert.match(dashboardService, /ProtectSystem=strict/u)
  assert.match(dashboardService, /^ReadWritePaths=\/var\/lib\/ai-life-sim$/mu)
  assert.match(
    dashboardService,
    /^ReadOnlyPaths=\/var\/log\/ai-life-sim \/var\/lib\/ai-life-sim\/accounts\.sqlite \/var\/lib\/ai-life-sim\/player-content\.sqlite$/mu,
  )
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
  logStore.closeServerLogDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
}
