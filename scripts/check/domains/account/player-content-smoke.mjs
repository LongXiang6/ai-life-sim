import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-player-content-'))
process.env.PLAYER_CONTENT_DB_PATH = path.join(tempRoot, 'player-content.sqlite')
process.env.PORTRAIT_ASSET_ROOT = path.join(tempRoot, 'portrait-assets')
process.env.ACCOUNT_DB_PATH = path.join(tempRoot, 'accounts.sqlite')

const contract = await import('../../../../src/core/player-content/player-content-contract.ts')
const databaseModule = await import('../../../../src/core/player-content/player-content-database.ts')
const accountDatabaseModule = await import('../../../../src/core/account/account-database.ts')
const service = await import('../../../../src/core/player-content/player-content-service.ts')
const scoring = await import('../../../../src/core/scoring/life-scoring.ts')
const features = await import('../../../../src/core/player-content/player-content-features.ts')
const provider = await import('../../../../src/core/player-content/portrait-image-provider.ts')
const portraitMail = await import('../../../../src/core/player-content/portrait-mail-service.ts')

const longNarrative = `完整人生正文：${'这段经历必须逐字保留，不能按字符或条数截断。'.repeat(20_000)}`
const payload = {
  engine: { totalRounds: 128, narrativeHistory: [{ id: 'life-1', text: longNarrative }] },
  character: { name: '林见星', memories: [longNarrative] },
  world: { worldConfig: { name: '测试世界', description: longNarrative } },
  orchestrator: { state: { summary: longNarrative } },
}
const metadata = {
  schemaVersion: 1,
  slot: 1,
  name: '唯一云端栏位',
  worldName: '测试世界',
  characterName: '林见星',
  totalRounds: 128,
  gameVersion: '5.2.9',
  savedAt: 1000,
}

const scoringProfile = {
  profileVersion: 1,
  worldId: 'test-world',
  dimensions: [
    { id: 'growth', label: '成长', description: '角色能力与心智成长', weight: 34, evidenceKinds: ['attributes'], curveId: 'growth' },
    { id: 'agency', label: '抉择', description: '关键选择与承担', weight: 33, evidenceKinds: ['choices'], curveId: 'agency' },
    { id: 'impact', label: '影响', description: '对世界和他人的影响', weight: 33, evidenceKinds: ['achievements', 'completion'], curveId: 'impact' },
  ],
}

function gameRecord(overrides = {}) {
  const recordId = overrides.recordId ?? 'record-default'
  const rounds = overrides.rounds ?? 101
  const targetScore = overrides.overallScore ?? 98
  const achievements = overrides.achievements ?? Array.from({ length: 5 }, (_, index) => ({
    id: `event-${index + 1}`,
    kind: 'choice',
    title: `守望 ${index + 1}`,
    detail: '保全了完整记录',
    timeLabel: `第 ${80 + index} 轮`,
  }))
  const narrativeIds = Array.from({ length: rounds }, (_, index) => `${recordId}-narrative-${index + 1}`)
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
  let attributes = overrides.attributes ?? { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 }
  let result
  if (!overrides.attributes) {
    for (let value = 0; value <= 100; value += 1) {
      const candidate = { physique: value, mind: value, talentAptitude: value, charisma: value }
      const candidateResult = scoring.calculateLifeScore({
        profile: scoringProfile,
        lifeRunId: `life-${recordId}`,
        attributeValues: Object.values(candidate),
        rounds,
        committedRounds: rounds,
        narrativeIds,
        resolvedChoiceCount: achievements.filter((item) => item.kind === 'choice').length,
        breakthroughCount: achievements.filter((item) => item.kind === 'breakthrough').length,
        achievementIds: achievements.map((item) => item.id),
        completed: true,
        terminalCommitted: true,
        stateTransitionsTrusted: true,
        hasValidationFailure: false,
        transitionAudits,
      })
      if (candidateResult.score === targetScore) {
        attributes = candidate
        result = candidateResult
        break
      }
    }
  }
  result ??= scoring.calculateLifeScore({
    profile: scoringProfile,
    lifeRunId: `life-${recordId}`,
    attributeValues: Object.values(attributes),
    rounds,
    committedRounds: rounds,
    narrativeIds,
    resolvedChoiceCount: achievements.filter((item) => item.kind === 'choice').length,
    breakthroughCount: achievements.filter((item) => item.kind === 'breakthrough').length,
    achievementIds: achievements.map((item) => item.id),
    completed: true,
    terminalCommitted: true,
    stateTransitionsTrusted: true,
    hasValidationFailure: false,
    transitionAudits,
  })
  assert.equal(result.score, targetScore, `无法构造目标分数 ${targetScore} 的有效测试记录`)
  return {
    recordId: 'record-default',
    completedAt: 10,
    characterName: '林见星',
    worldName: '测试世界',
    finalAge: 101,
    rounds,
    died: false,
    moralityLabel: '至善',
    overallScore: result.score,
    attributes,
    dimensions: result.dimensions,
    destinyNames: ['照夜星'],
    achievements,
    scoring: {
      version: result.version,
      profile: scoringProfile,
      rawScore: result.rawScore,
      validCompletedLife: result.validCompletedLife,
      evidence: result.evidence,
      integrity: result.integrity,
      audit: {
        schemaVersion: 1,
        lifeRunId: `life-${recordId}`,
        committedRounds: rounds,
        narrativeIds,
        resolvedChoiceCount: achievements.filter((item) => item.kind === 'choice').length,
        breakthroughCount: achievements.filter((item) => item.kind === 'breakthrough').length,
        achievementIds: achievements.map((item) => item.id),
        completed: true,
        terminalCommitted: true,
        stateTransitionsTrusted: true,
        hasValidationFailure: false,
        transitionAudits,
      },
    },
    endingReview: {
      perspective: 'macro',
      review: '你把这一生的选择变成了能够被后来者看见的结果。',
      evidenceIds: [achievements[0].id],
      source: 'local',
    },
    gameVersion: '5.2.9',
    ...overrides,
    recordId,
    rounds,
    overallScore: result.score,
    attributes,
    dimensions: result.dimensions,
    achievements,
  }
}

try {
  const first = service.saveCloudManualSave('account-a', { metadata, payload }, 2000)
  assert.equal(first.slot, 1)
  assert.ok(first.compressedBytes < first.uncompressedBytes)
  assert.equal(service.decodeCloudManualSave('account-a').payload.engine.narrativeHistory[0].text, longNarrative)

  assert.throws(() => service.saveCloudManualSave('account-a', {
    metadata: { ...metadata, schemaVersion: 2 },
    payload,
  }))
  assert.equal(service.decodeCloudManualSave('account-a').summary.name, '唯一云端栏位')

  const second = service.saveCloudManualSave('account-a', {
    metadata: { ...metadata, name: '覆盖后的云端栏位', savedAt: 3000 },
    payload: { ...payload, engine: { ...payload.engine, totalRounds: 129 } },
  }, 3000)
  assert.equal(second.name, '覆盖后的云端栏位')
  assert.equal(service.getPlayerContentAggregateCounts().cloudSaves, 1)

  const database = databaseModule.getPlayerContentDatabase()
  const intact = database.prepare('SELECT payload_gzip, compressed_bytes FROM cloud_manual_saves WHERE account_id = ?').get('account-a')
  database.prepare('UPDATE cloud_manual_saves SET payload_gzip = ?, compressed_bytes = ? WHERE account_id = ?')
    .run(Buffer.from('invalid-gzip'), 12, 'account-a')
  assert.throws(() => service.decodeCloudManualSave('account-a'), (error) => error?.code === 'cloud_save_corrupt')
  database.prepare('UPDATE cloud_manual_saves SET payload_gzip = ?, compressed_bytes = ? WHERE account_id = ?')
    .run(intact.payload_gzip, intact.compressed_bytes, 'account-a')

  assert.equal(contract.CloudManualSaveWriteSchema.safeParse({
    metadata,
    payload: { ...payload, futureSegment: {} },
  }).success, false)

  assert.equal(service.projectLeaderboardRecord('boundary-round', gameRecord({ recordId: 'round-100', rounds: 100 })).rounds, 100)
  assert.equal(service.projectLeaderboardRecord('boundary-score', gameRecord({ recordId: 'score-97', overallScore: 97 })), null)
  const forgedScore = gameRecord({ recordId: 'forged-score', overallScore: 98 })
  forgedScore.overallScore = 99
  assert.equal(service.projectLeaderboardRecord('forged-score', forgedScore), null)
  const missingAudit = gameRecord({ recordId: 'missing-audit', overallScore: 99 })
  delete missingAudit.scoring.audit
  assert.equal(service.projectLeaderboardRecord('missing-audit', missingAudit), null)
  assert.deepEqual(service.projectLeaderboardRecord('account-a', gameRecord({ recordId: 'score-98', overallScore: 98, rounds: 101 })), {
    score: 98, rounds: 101, recordId: 'score-98', completedAt: 10,
  })
  assert.equal(service.projectLeaderboardRecord('account-a', gameRecord({ recordId: 'same-shorter', overallScore: 98, rounds: 1000 })).rounds, 1000)
  assert.equal(service.projectLeaderboardRecord('account-a', gameRecord({ recordId: 'score-99', overallScore: 99, rounds: 101 })).score, 99)
  assert.equal(service.projectLeaderboardRecord('account-b', gameRecord({ recordId: 'b-score-99', overallScore: 99, rounds: 900 })).rounds, 900)
  const ranked = service.readLeaderboardEntries(new Map([['account-a', '甲'], ['account-b', '乙']]))
  assert.deepEqual(ranked.map((entry) => [entry.username, entry.score, entry.rounds]), [['乙', 99, 900], ['甲', 99, 101]])

  const perfect = gameRecord({ recordId: 'perfect', overallScore: 100, rounds: 120 })
  assert.equal(service.queuePortraitMailJob('account-a', perfect), true)
  assert.equal(service.queuePortraitMailJob('account-a', perfect), false)
  assert.equal(service.getPlayerContentAggregateCounts().queuedPortraitJobs, 1)

  const accountDatabase = accountDatabaseModule.getAccountDatabase()
  const ensureAccountRecord = (accountId, record) => {
    accountDatabase.prepare(`
      INSERT OR IGNORE INTO accounts(
        id, username, username_canonical, qq, password_hash, settings_json,
        character_draft_json, encrypted_api_key, save_api_key, revision,
        created_at, last_active_at
      ) VALUES (?, ?, ?, NULL, ?, '{}', '{}', NULL, 0, 0, 1, 1)
    `).run(accountId, accountId, accountId, 'test-hash')
    accountDatabase.prepare(`
      INSERT INTO account_game_records(account_id, slot, record_id, data_json, updated_at)
      VALUES (?, 1, ?, ?, 1)
      ON CONFLICT(account_id, slot) DO UPDATE SET record_id = excluded.record_id,
        data_json = excluded.data_json, updated_at = excluded.updated_at
    `).run(accountId, record.recordId, JSON.stringify(record))
  }

  delete process.env.PLAYER_MAILBOX_ENABLED
  delete process.env.PORTRAIT_IMAGE_ENABLED
  let providerCalls = 0
  await assert.rejects(
    () => portraitMail.processPortraitMailRequest('account-a', { recordId: 'perfect', lifeSummary: '完整总结' }, {
      fetchImplementation: async () => { providerCalls += 1; return new Response() },
    }),
    (error) => error?.code === 'feature_disabled',
  )
  assert.equal(providerCalls, 0)
  assert.equal(features.isPlayerMailboxEnabled(), true)

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x49, 0x45, 0x4e, 0x44])
  assert.deepEqual(provider.parsePortraitImageResponse({ data: [{ b64_json: png.toString('base64') }] }), {
    kind: 'base64', value: png.toString('base64'),
  })
  assert.deepEqual(provider.parsePortraitImageResponse({ data: [{ url: 'https://cdn.example.test/portrait.png' }] }), {
    kind: 'url', value: 'https://cdn.example.test/portrait.png',
  })
  assert.throws(() => provider.parsePortraitImageResponse({ data: [{ url: 'http://127.0.0.1/internal' }] }))
  assert.throws(() => provider.parsePortraitImageResponse({ data: [{ url: 'https://127.0.0.1/internal' }] }))
  await assert.rejects(
    () => provider.assertPublicHttpsUrl('https://cdn.example.test/portrait.png', async () => ['10.0.0.8']),
    (error) => error?.code === 'unsafe_image_url',
  )

  process.env.PORTRAIT_IMAGE_API_KEY = 'test-only-key'
  process.env.PORTRAIT_IMAGE_BASE_URL = 'https://images.example.test'
  process.env.PORTRAIT_IMAGE_MODEL = 'gpt-image-2'
  let requestUrl = ''
  const generated = await provider.generatePortraitImage('测试画像提示', async (url, init) => {
    requestUrl = String(url)
    const request = JSON.parse(init.body)
    assert.equal(request.model, 'gpt-image-2')
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }, async () => ['93.184.216.34'])
  assert.equal(requestUrl, 'https://images.example.test/v1/images/generations')
  assert.deepEqual(generated.bytes, png)
  assert.equal(generated.mimeType, 'image/png')

  await assert.rejects(
    () => provider.generatePortraitImage('测试画像提示', async () => new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('<svg/>').toString('base64') }],
    }), { status: 200 }), async () => ['93.184.216.34']),
    (error) => error?.code === 'invalid_image_type',
  )

  // 画像任务必须先入队、再由 worker 消费；重复消费和失败重试均有明确边界。
  process.env.PLAYER_MAILBOX_ENABLED = '1'
  process.env.PORTRAIT_IMAGE_ENABLED = '1'
  process.env.PORTRAIT_IMAGE_API_KEY = 'test-only-key'
  process.env.PORTRAIT_IMAGE_BASE_URL = 'https://api.openai.com'
  const portraitSuccess = gameRecord({ recordId: 'portrait-success', overallScore: 100, rounds: 120 })
  ensureAccountRecord('portrait-success-account', portraitSuccess)
  assert.equal(service.queuePortraitMailJob('portrait-success-account', portraitSuccess), true)
  let successProviderCalls = 0
  const successFetch = async () => {
    successProviderCalls += 1
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  await portraitMail.processPortraitMailJobForTests(
    'portrait-success-account',
    portraitSuccess.recordId,
    successFetch,
  )
  const readyJob = database.prepare(`
    SELECT status, attempts FROM portrait_mail_jobs WHERE account_id = ? AND record_id = ?
  `).get('portrait-success-account', portraitSuccess.recordId)
  assert.deepEqual(readyJob, { status: 'ready', attempts: 1 })
  assert.equal(service.readPlayerMail('portrait-success-account')[0].status, 'ready')
  await portraitMail.processPortraitMailJobForTests(
    'portrait-success-account',
    portraitSuccess.recordId,
    successFetch,
  )
  assert.equal(successProviderCalls, 1)

  const portraitFailure = gameRecord({ recordId: 'portrait-failure', overallScore: 100, rounds: 120 })
  ensureAccountRecord('portrait-failure-account', portraitFailure)
  assert.equal(service.queuePortraitMailJob('portrait-failure-account', portraitFailure), true)
  let failureProviderCalls = 0
  const failureFetch = async () => {
    failureProviderCalls += 1
    return new Response('provider failure', { status: 503 })
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await portraitMail.processPortraitMailJobForTests(
      'portrait-failure-account',
      portraitFailure.recordId,
      failureFetch,
    )
  }
  const failedJob = database.prepare(`
    SELECT status, attempts, last_error_code FROM portrait_mail_jobs
    WHERE account_id = ? AND record_id = ?
  `).get('portrait-failure-account', portraitFailure.recordId)
  assert.equal(failedJob.status, 'failed')
  assert.equal(failedJob.attempts, 3)
  assert.equal(failureProviderCalls, 3)
  assert.equal(service.readPlayerMail('portrait-failure-account')[0].status, 'failed')
  await portraitMail.processPortraitMailJobForTests(
    'portrait-failure-account',
    portraitFailure.recordId,
    failureFetch,
  )
  assert.equal(failureProviderCalls, 3)

  service.deletePlayerContentForAccount('account-a')
  assert.equal(service.readCloudManualSaveSummary('account-a'), null)
  assert.equal(service.getPlayerContentAggregateCounts().queuedPortraitJobs, 0)

  console.log('[player-content-smoke] PASS')
} finally {
  databaseModule.closePlayerContentDatabaseForTests()
  accountDatabaseModule.closeAccountDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
