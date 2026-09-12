/**
 * Purpose: Regress operations-dashboard account and player-content aggregates against isolated databases.
 * Owner: quality:account
 * Responsibility: One temporary dashboard fixture, command invocation, and output assertion lifecycle only.
 */

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
const scoring = await import('../../../../src/core/scoring/life-scoring.ts')
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
  const narrativeIds = Array.from({ length: 120 }, (_, index) => `dashboard-narrative-${index + 1}`)
  const transitionAudits = narrativeIds.map((narrativeId, index) => ({
    schemaVersion: 1,
    round: index + 1,
    narrativeId,
    validatedWritePath: true,
    interceptorPassed: true,
    intentValidationPassed: true,
    historicalCommitPassed: true,
    structuredDataPresent: true,
    structuredDataAccepted: true,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: true,
    validationClean: true,
    reasons: [],
  }))
  const scoringAudit = {
    schemaVersion: 1,
    lifeRunId: 'life-dashboard-record',
    committedRounds: 120,
    narrativeIds,
    resolvedChoiceCount: 1,
    achievementIds: ['event-a'],
    completed: true,
    terminalCommitted: true,
    stateTransitionsTrusted: true,
    hasValidationFailure: false,
    transitionAudits,
  }
  const evidenceIds = narrativeIds.map((id) => `narrative:${id}`)
  const scoreResult = scoring.createLifeScoringResult({
    response: {
      dimensions: Array.from({ length: 5 }, (_, index) => ({
        id: `dashboard-dimension-${index + 1}`,
        label: `维度${index + 1}`,
        description: `测试世界维度${index + 1}`,
        value: 98,
        comment: `你在维度${index + 1}留下了完整记录。`,
        evidenceIds: [evidenceIds[index]],
      })),
    },
    allowedEvidenceIds: evidenceIds,
    audit: scoringAudit,
  })
  playerContentService.projectLeaderboardRecord('account-a', {
    recordId: 'record-a',
    completedAt: now,
    characterName: '测试角色',
    worldName: '测试世界',
    finalAge: 100,
    rounds: 120,
    died: false,
    overallScore: 98,
    attributes: { mind: 12, physique: 12, charisma: 12, familyBackground: 12 },
    dimensions: scoreResult.dimensions,
    destinyNames: [],
    achievements: [{ id: 'event-a', kind: 'choice', title: '完成测试', detail: '保留了完整记录', timeLabel: '第 120 轮' }],
    scoring: {
      ...scoreResult,
      audit: scoringAudit,
    },
    endingReview: {
      perspective: 'macro',
      review: '你完成了这一段可验证的人生。',
      verse: '长路回声入旧城\n灯前故纸照归程\n一生取舍留青简\n此夜星河伴远行',
      evidenceIds: ['event-a'],
      source: 'ai',
    },
    gameVersion: '5.2.9',
  }, now)
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
  await logStore.cleanupServerLogsNow(new Date(now + 3 * 24 * 60 * 60 * 1000))
  assert.equal(logStore.queryServerLogEntries({}).total, 2, 'dashboard source rows must remain queryable after archival')
  logStore.closeServerLogDatabaseForTests()

  const options = { logRoot, accountDatabase: accountDatabasePath, playerContentDatabase: playerContentDatabasePath }
  const snapshot = await dashboard.buildDashboardSnapshot(options, now + 1)
  assert.equal(snapshot.traffic.estimatedPlayers, 1)
  assert.equal(snapshot.traffic.aiRequests, 1)
  assert.equal(snapshot.traffic.failures, 0)
  assert.equal(snapshot.accounts.registered, 1)
  assert.equal(snapshot.accounts.registeredToday, 1)
  assert.equal(snapshot.content.cloudSaves, 1)
  assert.equal(snapshot.content.leaderboardRecords, 1)
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
  assert.match(
    dashboardService,
    /^ReadWritePaths=\/var\/lib\/ai-life-sim \/var\/log\/ai-life-sim$/mu,
  )
  assert.match(
    dashboardService,
    /^ReadOnlyPaths=\/var\/lib\/ai-life-sim\/accounts\.sqlite \/var\/lib\/ai-life-sim\/player-content\.sqlite -\/var\/log\/ai-life-sim\/logs-archive\.sqlite \/var\/log\/ai-life-sim\/logs\.sqlite$/mu,
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
