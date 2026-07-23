import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-player-content-'))
process.env.PLAYER_CONTENT_DB_PATH = path.join(tempRoot, 'player-content.sqlite')
process.env.PORTRAIT_ASSET_ROOT = path.join(tempRoot, 'portrait-assets')

const contract = await import('../../../../src/core/player-content/player-content-contract.ts')
const databaseModule = await import('../../../../src/core/player-content/player-content-database.ts')
const service = await import('../../../../src/core/player-content/player-content-service.ts')
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

function gameRecord(overrides = {}) {
  return {
    recordId: 'record-default',
    completedAt: 10,
    characterName: '林见星',
    worldName: '测试世界',
    finalAge: 101,
    rounds: 101,
    died: false,
    moralityLabel: '至善',
    overallScore: 98,
    dimensions: [{ label: '心智', value: 99 }],
    destinyNames: ['照夜星'],
    achievements: [{ id: 'event-1', kind: 'choice', title: '守望', detail: '保全了完整记录', timeLabel: '第 80 轮' }],
    gameVersion: '5.2.9',
    ...overrides,
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
  assert.equal(service.projectLeaderboardRecord('boundary-score', gameRecord({ recordId: 'score-97', overallScore: 97 })), null)
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
  assert.equal(features.isPlayerMailboxEnabled(), false)

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

  service.deletePlayerContentForAccount('account-a')
  assert.equal(service.readCloudManualSaveSummary('account-a'), null)
  assert.equal(service.getPlayerContentAggregateCounts().queuedPortraitJobs, 0)

  console.log('[player-content-smoke] PASS')
} finally {
  databaseModule.closePlayerContentDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
