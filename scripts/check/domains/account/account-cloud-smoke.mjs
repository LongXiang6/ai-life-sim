import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-account-'))
process.env.ACCOUNT_DB_PATH = path.join(tempRoot, 'accounts.sqlite')
process.env.ACCOUNT_DATA_ENCRYPTION_KEY = '11'.repeat(32)
process.env.ACCOUNT_USERNAME_BLOCKLIST = '自定义禁词'
process.env.QQ_BOT_INTEGRATION_SECRET = 'integration-test-secret-'.repeat(2)

const contract = await import('../../../../src/core/account/account-contract.ts')
const crypto = await import('../../../../src/core/account/account-crypto.ts')
const databaseModule = await import('../../../../src/core/account/account-database.ts')
const http = await import('../../../../src/core/account/account-http.ts')
const service = await import('../../../../src/core/account/account-service.ts')
const qqBot = await import('../../../../src/core/account/qq-bot-integration.ts')
const qqPoints = await import('../../../../src/core/account/qq-points-service.ts')
const usernamePolicy = await import('../../../../src/core/account/username-policy.ts')

const settings = {
  provider: 'deepseek',
  customUrl: '',
  customModel: 'deepseek-v4-flash',
  temperature: 0.8,
  topP: 0.9,
  maxTokens: 8192,
  reasoningEffort: 'level-2',
  talentThinkingIntensity: 'level-2',
  aiTalentGeneration: true,
  preGenerateRounds: 1,
  storySeed: '',
  narrativeStyle: 'default',
  wordCountTarget: 1200,
  streamingMode: 'off',
  comfortableParagraphs: true,
  reduceMotion: false,
  theme: 'minimal-white',
}

const longBackground = `玩家原创背景：${'完整保留，不得截断。'.repeat(1500)}`
const characterDraft = {
  schemaVersion: 1,
  name: '林见星',
  gender: '无性别',
  race: '星海旅者',
  background: longBackground,
  attributes: { physique: 3, mind: 8, talentAptitude: 9, charisma: 6 },
  manualLifespan: '360',
  manualStartingAge: '18',
  customGenders: ['无性别'],
  customRaces: ['星海旅者'],
  backgroundPresets: { 星海来客: longBackground },
}

const initialData = {
  settings,
  saveApiKey: true,
  apiKey: 'sk-account-secret',
  characterDraft,
  mythicTalents: [{
    id: 'mythic-1',
    name: '照夜星',
    concept: '守望',
    effect: '在关键时刻保持清醒。',
    acquiredAt: 1,
    source: { worldName: '测试世界', characterName: '林见星', runId: 'run-1' },
  }],
  gameRecords: [{
    recordId: 'record-1',
    completedAt: 2,
    characterName: '林见星',
    worldName: '测试世界',
    finalAge: 88,
    rounds: 20,
    died: true,
    moralityLabel: '守序',
    overallScore: 90,
    dimensions: [{ label: '体魄', value: 8 }],
    destinyNames: ['照夜星'],
    gameVersion: '5.2.2',
  }],
}

try {
  assert.equal(contract.UsernameSchema.safeParse('bad-name').success, false)
  assert.equal(contract.PasswordSchema.safeParse('1234567').success, false)
  assert.throws(
    () => http.assertSameOrigin(new Request('https://example.test/api/account', {
      headers: { origin: 'https://attacker.test' },
    })),
    (error) => error?.code === 'invalid_origin',
  )
  assert.doesNotThrow(() => http.assertSameOrigin(new Request('http://ai-mnrs.icu/api/account', {
    headers: {
      origin: 'https://ai-mnrs.icu',
      'x-forwarded-proto': 'https',
    },
  })))
  assert.throws(
    () => http.assertSameOrigin(new Request('http://ai-mnrs.icu/api/account', {
      headers: {
        origin: 'https://ai-mnrs.icu',
        'x-forwarded-proto': 'http',
      },
    })),
    (error) => error?.code === 'invalid_origin',
  )
  await assert.rejects(
    () => http.parseAccountJson(new Request('https://example.test/api/account', {
      method: 'POST',
      body: 'x'.repeat(contract.ACCOUNT_SYNC_BODY_LIMIT + 1),
    })),
    (error) => error?.code === 'body_too_large' && error?.status === 413,
  )
  const cookieResponse = http.jsonNoStore({ ok: true })
  http.setSessionCookie(cookieResponse, 'session-token')
  assert.match(cookieResponse.headers.get('set-cookie') ?? '', /HttpOnly/u)
  assert.match(cookieResponse.headers.get('set-cookie') ?? '', /SameSite=Strict/iu)
  assert.equal(cookieResponse.headers.get('cache-control'), 'no-store')
  assert.equal(contract.RegisterRequestSchema.safeParse({
    username: 'test_user',
    qq: '',
    password: 'password-1',
    confirmPassword: 'password-2',
    initialData,
  }).success, false)
  assert.throws(() => usernamePolicy.validateUsernamePolicy('系统'))
  assert.throws(() => usernamePolicy.validateUsernamePolicy('玩家_自定义禁词'))

  const registration = contract.RegisterRequestSchema.parse({
    username: 'Ｔｅｓｔ_用户',
    qq: '123456789',
    password: '正确密码 password',
    confirmPassword: '正确密码 password',
    initialData,
  })
  const created = await service.registerAccount(registration)
  assert.equal(created.payload.account.username, 'Test_用户')
  assert.equal(created.payload.snapshot.characterDraft.background, longBackground)
  assert.equal(created.payload.snapshot.apiKey, 'sk-account-secret')

  const linkNow = Date.UTC(2026, 6, 21, 2, 0, 0)
  const linkCode = qqBot.createAccountQqLinkCode(created.token, linkNow)
  assert.match(linkCode.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/u)
  const linked = qqBot.bindQqAccount('123456789', linkCode.code, linkNow + 1)
  assert.equal(linked.username, 'Test_用户')
  assert.equal(linked.reincarnationTalentCount, 1)
  assert.equal(linked.pointsBalance, 0)
  assert.equal(qqBot.readQqBotAccountStatus('123456789', linkNow + 2)?.linked, true)
  assert.equal(qqBot.readQqBotProjectStatus().capabilities.sharedPoints, true)

  const signedBody = JSON.stringify({ qq: '123456789' })
  const signedTimestamp = String(Math.floor(linkNow / 1000))
  const signedPath = '/api/integrations/qq-bot/account-status'
  const createSignedRequest = (nonce, forwardingHeaders = {}) => new Request(
    `http://127.0.0.1:3000${signedPath}`,
    {
      method: 'POST',
      headers: {
        'x-ai-life-bot-timestamp': signedTimestamp,
        'x-ai-life-bot-nonce': nonce,
        'x-ai-life-bot-signature': qqBot.buildQqBotSignature(
          'POST',
          signedPath,
          signedBody,
          signedTimestamp,
          nonce,
          process.env.QQ_BOT_INTEGRATION_SECRET,
        ),
        ...forwardingHeaders,
      },
    },
  )
  const signedRequest = createSignedRequest('account-link-test-nonce')
  qqBot.verifyQqBotRequest(signedRequest, signedBody, linkNow)
  assert.throws(
    () => qqBot.verifyQqBotRequest(signedRequest, signedBody, linkNow),
    (error) => error?.code === 'integration_auth_failed',
  )
  assert.doesNotThrow(() => qqBot.verifyQqBotRequest(
    createSignedRequest('loopback-forwarded-test', { 'x-forwarded-for': '127.0.0.2, 127.255.255.254' }),
    signedBody,
    linkNow,
  ))
  assert.doesNotThrow(() => qqBot.verifyQqBotRequest(
    createSignedRequest('mapped-loopback-test', {
      'x-forwarded-for': '::ffff:127.0.0.1',
      'x-real-ip': '::1',
    }),
    signedBody,
    linkNow,
  ))
  assert.throws(
    () => qqBot.verifyQqBotRequest(
      createSignedRequest('public-forwarded-test', {
        'x-forwarded-for': '127.0.0.1, 203.0.113.1',
      }),
      signedBody,
      linkNow,
    ),
    (error) => error?.code === 'integration_loopback_required',
  )

  const groupKey = '123456'
  const firstCheckin = qqPoints.executeQqPointRequest({
    operation: 'checkin', qq: '123456789', groupKey,
  }, Date.UTC(2026, 6, 20, 16, 0, 0))
  const repeatedCheckin = qqPoints.executeQqPointRequest({
    operation: 'checkin', qq: '123456789', groupKey,
  }, Date.UTC(2026, 6, 21, 2, 0, 0))
  const secondCheckin = qqPoints.executeQqPointRequest({
    operation: 'checkin', qq: '123456789', groupKey,
  }, Date.UTC(2026, 6, 21, 16, 0, 0))
  assert.deepEqual(
    [firstCheckin.repeated, repeatedCheckin.repeated, secondCheckin.streak],
    [false, true, 2],
  )
  const transferInput = {
    operation: 'transfer',
    qq: '123456789',
    targetQq: '987654321',
    groupKey,
    amount: 1,
    idempotencyKey: 'transfer:test:0001',
  }
  const transfer = qqPoints.executeQqPointRequest(transferInput, linkNow + 10)
  const repeatedTransfer = qqPoints.executeQqPointRequest(transferInput, linkNow + 11)
  assert.deepEqual(repeatedTransfer, transfer)
  assert.throws(
    () => qqPoints.executeQqPointRequest({ ...transferInput, amount: 2 }, linkNow + 12),
    (error) => error?.code === 'idempotency_conflict',
  )
  assert.equal(qqPoints.readQqPointBalance('123456789'), 1)
  assert.equal(qqPoints.readQqPointBalance('987654321'), 1)
  assert.throws(
    () => qqPoints.executeQqPointRequest({
      operation: 'adjust',
      qq: '987654321',
      groupKey,
      delta: -2,
      reason: '测试扣减',
      idempotencyKey: 'adjust:test:0001',
    }, linkNow + 13),
    (error) => error?.code === 'insufficient_points',
  )
  const refreshedAccount = service.getSessionAccount(created.token)
  assert.equal(refreshedAccount?.account.linkedQq, '123456789')
  assert.equal(refreshedAccount?.account.pointsBalance, 1)

  await assert.rejects(
    () => service.registerAccount({ ...registration, username: 'test_用户' }),
    (error) => error?.code === 'username_exists' && error?.status === 409,
  )
  await assert.rejects(
    () => service.loginAccount({ username: 'test_用户', password: '错误密码' }),
    (error) => error?.code === 'invalid_credentials',
  )

  const database = databaseModule.getAccountDatabase()
  assert.equal(database.prepare("SELECT value FROM account_meta WHERE key = 'schema_version'").get().value, '5')
  if (process.platform !== 'win32') {
    for (const target of [
      process.env.ACCOUNT_DB_PATH,
      `${process.env.ACCOUNT_DB_PATH}-wal`,
      `${process.env.ACCOUNT_DB_PATH}-shm`,
    ]) {
      assert.equal((await fs.stat(target)).mode & 0o777, 0o600, `${target} must use mode 0600`)
    }
  }
  const accountRow = database.prepare('SELECT * FROM accounts').get()
  assert.notEqual(accountRow.password_hash, '正确密码 password')
  assert.equal(await crypto.verifyPassword('正确密码 password', accountRow.password_hash), true)
  assert.notEqual(accountRow.encrypted_api_key, 'sk-account-secret')
  assert.equal(JSON.parse(accountRow.character_draft_json).background, longBackground)
  const sessionRow = database.prepare('SELECT token_hash FROM account_sessions').get()
  assert.notEqual(sessionRow.token_hash, created.token)

  const encryptedApiKey = accountRow.encrypted_api_key
  process.env.ACCOUNT_DATA_ENCRYPTION_KEY = '22'.repeat(32)
  assert.throws(() => crypto.decryptApiKey(encryptedApiKey, accountRow.id))
  process.env.ACCOUNT_DATA_ENCRYPTION_KEY = '11'.repeat(32)
  assert.equal(crypto.decryptApiKey(encryptedApiKey, accountRow.id), 'sk-account-secret')

  const synced = service.syncAccount(created.token, {
    ...initialData,
    saveApiKey: false,
    apiKey: null,
    baseRevision: created.payload.snapshot.revision,
  })
  assert.equal(synced.snapshot.revision, created.payload.snapshot.revision + 1)
  assert.equal(synced.snapshot.apiKey, null)
  assert.equal(synced.snapshot.characterDraft.background, longBackground)
  assert.throws(
    () => service.syncAccount(created.token, {
      ...initialData,
      baseRevision: created.payload.snapshot.revision,
    }),
    (error) => error?.code === 'revision_conflict',
  )

  const forbiddenStory = '不应写入账号数据库的完整故事正文'
  assert.equal(contract.CloudSyncRequestSchema.safeParse({
    ...initialData,
    baseRevision: synced.snapshot.revision,
    storyBody: forbiddenStory,
  }).success, false)
  assert.equal(JSON.stringify(database.prepare('SELECT * FROM accounts').all()).includes(forbiddenStory), false)

  database.prepare('UPDATE accounts SET character_draft_json = ?').run(JSON.stringify({ schemaVersion: 99 }))
  assert.throws(() => service.getSessionAccount(created.token))
  database.prepare('UPDATE accounts SET character_draft_json = ?').run(JSON.stringify(characterDraft))

  const elevenRecords = Array.from({ length: 11 }, (_, index) => ({
    ...initialData.gameRecords[0],
    recordId: `record-${index}`,
  }))
  assert.equal(contract.CloudSyncRequestSchema.safeParse({
    ...initialData,
    gameRecords: elevenRecords,
    baseRevision: synced.snapshot.revision,
  }).success, false)

  service.enforceAccountRateLimit('test:rate', 2, 60_000, 1000)
  service.enforceAccountRateLimit('test:rate', 2, 60_000, 1001)
  assert.throws(
    () => service.enforceAccountRateLimit('test:rate', 2, 60_000, 1002),
    (error) => error?.code === 'rate_limited',
  )

  databaseModule.closeAccountDatabaseForTests()
  const restored = service.getSessionAccount(created.token)
  assert.equal(restored?.snapshot.characterDraft.background, longBackground)
  assert.equal(restored?.snapshot.gameRecords.length, 1)

  const reopened = databaseModule.getAccountDatabase()
  const accountId = reopened.prepare('SELECT id FROM accounts').get().id
  const cleanupNow = Date.now() + contract.ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const cutoff = cleanupNow - contract.ACCOUNT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  reopened.prepare('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(cutoff, accountId)
  assert.equal(service.cleanupInactiveAccounts(cleanupNow).deletedAccounts, 0)
  reopened.prepare('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(cutoff - 1, accountId)
  assert.equal(service.cleanupInactiveAccounts(cleanupNow).deletedAccounts, 1)
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM account_mythic_talents').get().count, 0)
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM account_game_records').get().count, 0)

  databaseModule.closeAccountDatabaseForTests()
  const futureDatabasePath = path.join(tempRoot, 'future.sqlite')
  const futureDatabase = new Database(futureDatabasePath)
  futureDatabase.exec(`
    CREATE TABLE account_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO account_meta(key, value) VALUES ('schema_version', '99');
  `)
  futureDatabase.close()
  process.env.ACCOUNT_DB_PATH = futureDatabasePath
  assert.throws(() => databaseModule.getAccountDatabase(), /Schema 版本：99/u)

  console.log('[account-cloud-smoke] PASS')
} finally {
  databaseModule.closeAccountDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
