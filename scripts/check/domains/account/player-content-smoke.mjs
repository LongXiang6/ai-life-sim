/**
 * Purpose: Regress player-content persistence, assets, mail, and record behavior in one temporary store.
 * Owner: quality:account
 * Responsibility: One isolated player-content database smoke transaction only.
 */

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
const playerMail = await import('../../../../src/core/player-content/player-mail-service.ts')
const scoring = await import('../../../../src/core/scoring/life-scoring.ts')
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
  const attributes = overrides.attributes ?? { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 }
  const audit = {
    schemaVersion: 1,
    lifeRunId: `life-${recordId}`,
    committedRounds: rounds,
    narrativeIds,
    resolvedChoiceCount: achievements.filter((item) => item.kind === 'choice').length,
    achievementIds: achievements.map((item) => item.id),
    completed: true,
    terminalCommitted: true,
    stateTransitionsTrusted: true,
    hasValidationFailure: false,
    transitionAudits,
  }
  const evidenceIds = [
    ...narrativeIds.map((id) => `narrative:${id}`),
    ...achievements.map((item) => `achievement:${item.id}`),
  ]
  const result = scoring.createLifeScoringResult({
    response: {
      dimensions: Array.from({ length: 5 }, (_, index) => ({
        id: `dimension-${index + 1}`,
        label: `世界维度${index + 1}`,
        description: `测试世界中的第${index + 1}项人生衡量`,
        value: targetScore,
        comment: `你在第${index + 1}项维度留下了完整证据。`,
        evidenceIds: [evidenceIds[index]],
      })),
    },
    allowedEvidenceIds: evidenceIds,
    audit,
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
    overallScore: result.score,
    attributes,
    dimensions: result.dimensions,
    destinyNames: ['照夜星'],
    achievements,
    scoring: {
      ...result,
      audit,
    },
    endingReview: {
      perspective: 'macro',
      review: '你把这一生的选择变成了能够被后来者看见的结果。',
      verse: '长路回声落故城\n旧灯照见后来人\n一生取舍留青简\n此夜星河照远程',
      evidenceIds: [evidenceIds[0]],
      source: 'ai',
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

  assert.equal(service.projectLeaderboardRecord('boundary-round', gameRecord({ recordId: 'round-100', rounds: 100 })), null)
  assert.equal(service.projectLeaderboardRecord('boundary-score', gameRecord({ recordId: 'score-97', overallScore: 97 })).score, 97)
  const missingVerse = gameRecord({ recordId: 'missing-verse', overallScore: 98 })
  delete missingVerse.endingReview.verse
  assert.equal(service.projectLeaderboardRecord('missing-verse', missingVerse), null)
  const forgedScore = gameRecord({ recordId: 'forged-score', overallScore: 98 })
  forgedScore.overallScore = 99
  assert.equal(service.projectLeaderboardRecord('forged-score', forgedScore), null)
  const missingAudit = gameRecord({ recordId: 'missing-audit', overallScore: 99 })
  delete missingAudit.scoring.audit
  assert.throws(() => service.projectLeaderboardRecord('missing-audit', missingAudit))
  assert.deepEqual(service.projectLeaderboardRecord('account-a', gameRecord({ recordId: 'score-98', overallScore: 98, rounds: 101 })), {
    score: 98, rounds: 101, recordId: 'score-98', completedAt: 10,
  })
  assert.equal(service.projectLeaderboardRecord('account-a', gameRecord({ recordId: 'same-account-longer', overallScore: 98, rounds: 1000 })).rounds, 1000)
  assert.equal(service.projectLeaderboardRecord('account-a', gameRecord({ recordId: 'score-99', overallScore: 99, rounds: 101 })).score, 99)
  assert.equal(service.projectLeaderboardRecord('account-b', gameRecord({ recordId: 'b-score-99', overallScore: 99, rounds: 900 })).rounds, 900)
  const ranked = service.readLeaderboardEntries(new Map([['account-a', '甲'], ['account-b', '乙']]))
  assert.deepEqual(ranked.map((entry) => [entry.username, entry.score, entry.rounds]), [
    ['乙', 99, 900],
    ['甲', 99, 101],
    ['甲', 98, 1000],
    ['甲', 98, 101],
  ])
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM leaderboard_best_runs WHERE account_id = 'account-a'
  `).get().count, 3)

  database.prepare('DELETE FROM leaderboard_best_runs').run()
  const firstSyncedRun = gameRecord({ recordId: 'sync-first', overallScore: 97 })
  const secondSyncedRun = gameRecord({ recordId: 'sync-second', overallScore: 98 })
  service.projectStructuredGameRecords('sync-account', [firstSyncedRun], 20)
  service.projectStructuredGameRecords('sync-account', [secondSyncedRun], 21)
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM leaderboard_best_runs WHERE account_id = 'sync-account'
  `).get().count, 2)

  database.prepare('DELETE FROM leaderboard_best_runs').run()
  const retentionBase = gameRecord({ recordId: 'retention-base', overallScore: 97 })
  for (let index = 0; index < 55; index += 1) {
    service.projectLeaderboardRecord('retention-account', {
      ...retentionBase,
      recordId: `retention-${String(index).padStart(2, '0')}`,
      completedAt: 100 + index,
    })
  }
  const retained = service.readLeaderboardEntries(new Map([['retention-account', '留名者']]))
  assert.equal(retained.length, 50)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM leaderboard_best_runs').get().count, 50)
  assert.equal(retained[0].recordId, 'retention-00')
  assert.equal(retained.at(-1).recordId, 'retention-49')
  assert.equal(service.getPlayerContentAggregateCounts().eligibleLeaderboardRecords, 50)

  const perfect = gameRecord({ recordId: 'perfect', overallScore: 100, rounds: 120 })
  assert.equal(service.queuePortraitMailJob('account-a', perfect), false)
  assert.equal(service.getPlayerContentAggregateCounts().queuedPortraitJobs, 0)

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

  delete process.env.PORTRAIT_IMAGE_ENABLED
  let providerCalls = 0
  await assert.rejects(
    () => portraitMail.processPortraitMailRequest('account-a', { recordId: 'perfect', lifeSummary: '完整总结' }, {
      fetchImplementation: async () => { providerCalls += 1; return new Response() },
    }),
    (error) => error?.code === 'feature_disabled',
  )
  assert.equal(providerCalls, 0)

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

  // 邮箱同时覆盖诊断身份、幂等发送、已读/删除、单份广播和唯一天赋托管。
  const mailNow = Date.now() + 10_000
  const senderRecord = gameRecord({ recordId: 'mail-sender-record', overallScore: 98 })
  const receiverRecord = gameRecord({ recordId: 'mail-receiver-record', overallScore: 98 })
  ensureAccountRecord('mail-sender', senderRecord)
  ensureAccountRecord('mail-receiver', receiverRecord)
  const diagnosticA = 'AAAAA2'
  const diagnosticB = 'BBBBB3'
  const deviceA = `DEV-${'A'.repeat(32)}`
  const deviceB = `DEV-${'B'.repeat(32)}`
  assert.equal(playerMail.bindDiagnosticMailboxIdentity(diagnosticA, deviceA, mailNow), diagnosticA)
  assert.equal(playerMail.bindDiagnosticMailboxIdentity(diagnosticB, deviceB, mailNow), diagnosticB)
  assert.equal(playerMail.bindDiagnosticMailboxIdentity(diagnosticA, `DEV-${'C'.repeat(32)}`, mailNow), null)

  const transferableTalent = {
    id: 'reincarnation-mail-transfer',
    lineageId: 'mail-transfer-lineage',
    version: 1,
    name: '星河留灯',
    description: '为远行者留下回程的光',
    category: 'cognition',
    rarity: 'mythic',
    effect: '在最困难的选择中仍记得当初的承诺',
    attrBonus: {},
    strengthenLevel: 1,
    acquiredAt: mailNow - 1_000,
    source: { worldName: '测试世界', characterName: '林见星', runId: 'mail-source-run' },
  }
  accountDatabase.prepare(`
    INSERT INTO account_reincarnation_talents(account_id, slot, talent_id, data_json, updated_at)
    VALUES ('mail-sender', 1, ?, ?, ?)
  `).run(transferableTalent.id, JSON.stringify(transferableTalent), mailNow)

  const firstMailId = crypto.randomUUID()
  const firstSend = playerMail.sendPlayerMail({
    identity: { accountId: 'mail-sender', username: 'mail-sender' },
    requestId: firstMailId,
    recipient: { type: 'diagnostic', value: diagnosticA },
    title: '给你的一盏灯',
    body: '这是一封保留完整正文的测试邮件。',
    talent: transferableTalent,
    now: mailNow,
  })
  assert.equal(firstSend.updated, true)
  assert.equal(accountDatabase.prepare(`
    SELECT COUNT(*) AS count FROM account_reincarnation_talents
    WHERE account_id = 'mail-sender' AND talent_id = ?
  `).get(transferableTalent.id).count, 0)
  assert.equal(playerMail.sendPlayerMail({
    identity: { accountId: 'mail-sender', username: 'mail-sender' },
    requestId: firstMailId,
    recipient: { type: 'diagnostic', value: diagnosticA },
    title: '给你的一盏灯',
    body: '这是一封保留完整正文的测试邮件。',
    talent: transferableTalent,
    now: mailNow,
  }).updated, false)

  const anonymousInbox = playerMail.readPlayerMailboxPage({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    folder: 'inbox',
    now: mailNow + 1,
  })
  assert.equal(anonymousInbox.messages.length, 1)
  assert.equal(anonymousInbox.unreadCount, 1)
  assert.equal(anonymousInbox.messages[0].talent.talent.id, transferableTalent.id)
  assert.equal(anonymousInbox.messages[0].expiresAt, mailNow + databaseModule.PLAYER_MAIL_RETENTION_MS)
  playerMail.markPlayerMailboxMessageRead({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    messageId: firstMailId,
    now: mailNow + 2,
  })
  assert.equal(playerMail.readPlayerMailboxPage({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    folder: 'inbox',
    now: mailNow + 3,
  }).unreadCount, 0)
  assert.equal(playerMail.acceptPlayerMailboxTalent({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    messageId: firstMailId,
    now: mailNow + 4,
  }).acceptedTalent.id, transferableTalent.id)

  const relayMailId = crypto.randomUUID()
  playerMail.sendPlayerMail({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    requestId: relayMailId,
    recipient: { type: 'account', value: 'mail-receiver' },
    title: '把灯传下去',
    body: '现在它属于你。',
    talent: transferableTalent,
    now: mailNow + 5,
  })
  const receiverAccept = playerMail.acceptPlayerMailboxTalent({
    identity: { accountId: 'mail-receiver', username: 'mail-receiver' },
    messageId: relayMailId,
    now: mailNow + 6,
  })
  assert.equal(receiverAccept.acceptedTalent.id, transferableTalent.id)
  assert.equal(accountDatabase.prepare(`
    SELECT COUNT(*) AS count FROM account_reincarnation_talents
    WHERE account_id = 'mail-receiver' AND talent_id = ?
  `).get(transferableTalent.id).count, 1)
  assert.equal(playerMail.reconcileAccountMailTalents({
    accountId: 'mail-sender',
    talents: [transferableTalent],
    now: mailNow + 7,
  }).length, 0)

  const returnedTalent = {
    ...transferableTalent,
    id: 'reincarnation-mail-return',
    name: '未寄出的潮声',
    source: { ...transferableTalent.source, runId: 'mail-return-run' },
  }
  accountDatabase.prepare(`
    INSERT INTO account_reincarnation_talents(account_id, slot, talent_id, data_json, updated_at)
    VALUES ('mail-sender', 2, ?, ?, ?)
  `).run(returnedTalent.id, JSON.stringify(returnedTalent), mailNow)
  const returnMailId = crypto.randomUUID()
  playerMail.sendPlayerMail({
    identity: { accountId: 'mail-sender', username: 'mail-sender' },
    requestId: returnMailId,
    recipient: { type: 'diagnostic', value: diagnosticB },
    title: '可以退回的邮件',
    body: '删除后天赋应回到发件人。',
    talent: returnedTalent,
    now: mailNow + 8,
  })
  playerMail.deletePlayerMailboxMessage({
    identity: { diagnosticCode: diagnosticB, deviceProvenanceId: deviceB },
    messageId: returnMailId,
    now: mailNow + 9,
  })
  assert.equal(accountDatabase.prepare(`
    SELECT COUNT(*) AS count FROM account_reincarnation_talents
    WHERE account_id = 'mail-sender' AND talent_id = ?
  `).get(returnedTalent.id).count, 1)

  const broadcastId = crypto.randomUUID()
  database.prepare(`
    INSERT INTO player_mail_messages(
      id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
      title, body, record_id, asset_id, created_at, expires_at
    ) VALUES (?, 'broadcast', 'message', 'developer:operations', '开发者', NULL, NULL,
      '全体测试通知', '这封邮件在数据库中只保存一份。', NULL, NULL, ?, ?)
  `).run(broadcastId, mailNow + 10, mailNow + 10 + databaseModule.PLAYER_MAIL_RETENTION_MS)
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM player_mail_messages WHERE id = ?
  `).get(broadcastId).count, 1)
  assert.equal(playerMail.readPlayerMailboxPage({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    folder: 'inbox',
    now: mailNow + 11,
  }).messages.some((message) => message.id === broadcastId), true)
  assert.equal(playerMail.readPlayerMailboxPage({
    identity: { accountId: 'mail-receiver', username: 'mail-receiver' },
    folder: 'inbox',
    now: mailNow + 11,
  }).messages.some((message) => message.id === broadcastId), true)
  playerMail.deletePlayerMailboxMessage({
    identity: { diagnosticCode: diagnosticA, deviceProvenanceId: deviceA },
    messageId: broadcastId,
    now: mailNow + 12,
  })
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM player_mail_messages WHERE id = ?
  `).get(broadcastId).count, 1)

  const expiryTalent = {
    ...returnedTalent,
    id: 'reincarnation-mail-expiry',
    name: '三日归途',
    source: { ...returnedTalent.source, runId: 'mail-expiry-run' },
  }
  accountDatabase.prepare(`
    INSERT INTO account_reincarnation_talents(account_id, slot, talent_id, data_json, updated_at)
    VALUES ('mail-sender', 3, ?, ?, ?)
  `).run(expiryTalent.id, JSON.stringify(expiryTalent), mailNow)
  const expiryMailId = crypto.randomUUID()
  playerMail.sendPlayerMail({
    identity: { accountId: 'mail-sender', username: 'mail-sender' },
    requestId: expiryMailId,
    recipient: { type: 'diagnostic', value: diagnosticB },
    title: '三天到期',
    body: '超时后邮件删除，未领天赋退回。',
    talent: expiryTalent,
    now: mailNow + 20,
  })
  const cleanup = playerMail.cleanupExpiredPlayerMail(
    mailNow + 20 + databaseModule.PLAYER_MAIL_RETENTION_MS + 1,
  )
  assert.equal(cleanup.deletedMessages > 0, true)
  assert.equal(cleanup.returnedTalents > 0, true)
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM player_mail_messages WHERE id = ?
  `).get(expiryMailId).count, 0)
  assert.equal(accountDatabase.prepare(`
    SELECT COUNT(*) AS count FROM account_reincarnation_talents
    WHERE account_id = 'mail-sender' AND talent_id = ?
  `).get(expiryTalent.id).count, 1)

  service.deletePlayerContentForAccount('account-a')
  assert.equal(service.readCloudManualSaveSummary('account-a'), null)
  assert.equal(service.getPlayerContentAggregateCounts().queuedPortraitJobs, 0)

  console.log('[player-content-smoke] PASS')
} finally {
  databaseModule.closePlayerContentDatabaseForTests()
  accountDatabaseModule.closeAccountDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
