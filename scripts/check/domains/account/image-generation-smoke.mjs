/**
 * Purpose: Regress private image credentials, account-isolated tasks, provider failures, and stored assets.
 * Owner: quality:account
 * Responsibility: One isolated player-owned illustration lifecycle smoke only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import sharp from 'sharp'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-image-generation-'))
const tempRootPrefix = `${path.resolve(os.tmpdir())}${path.sep}`
assert.ok(path.resolve(tempRoot).startsWith(tempRootPrefix), 'temporary test data must stay under the OS temp directory')
process.env.ACCOUNT_DB_PATH = path.join(tempRoot, 'accounts.sqlite')
process.env.PLAYER_CONTENT_DB_PATH = path.join(tempRoot, 'player-content.sqlite')
process.env.PORTRAIT_ASSET_ROOT = path.join(tempRoot, 'portrait-assets')
process.env.ACCOUNT_DATA_ENCRYPTION_KEY = 'a4'.repeat(32)
process.env.AI_LOG_DB_PATH = path.join(tempRoot, 'server-logs.sqlite')

const accountContract = await import('../../../../src/core/account/account-contract.ts')
const accountCrypto = await import('../../../../src/core/account/account-crypto.ts')
const accountDatabaseModule = await import('../../../../src/core/account/account-database.ts')
const accountService = await import('../../../../src/core/account/account-service.ts')
const imagePresetService = await import('../../../../src/core/account/image-api-preset-service.ts')
const imageKeyStore = await import('../../../../src/core/account/image-api-key-service.ts')
const guestProfileService = await import('../../../../src/core/account/guest-illustration-profile-service.ts')
const serverLogDatabaseModule = await import('../../../../src/core/logger/server-log-store/database.ts')
const playerContentDatabaseModule = await import('../../../../src/core/player-content/player-content-database.ts')
const illustration = await import('../../../../src/core/player-content/illustration-service.ts')
const endpointNormalizer = await import('../../../../src/core/shared/openai-compatible-endpoint.ts')
const providerConfig = await import('../../../../src/core/ai-service/provider-config.ts')
const illustrationHttpIdentity = await import('../../../../src/core/player-content/illustration-http-identity.ts')
const illustrationImport = await import('../../../../src/core/player-content/illustration-import-service.ts')
const assetStore = await import('../../../../src/core/player-content/portrait-asset-store.ts')
const keyRoute = await import('../../../../src/app/api/account/image-api-key/route.ts')
const keyMigrationRoute = await import('../../../../src/app/api/account/image-api-key/migrate/route.ts')
const imagePresetRoute = await import('../../../../src/app/api/account/image-api-presets/route.ts')
const guestSessionRoute = await import('../../../../src/app/api/account/illustrations/session/route.ts')
const guestConfigRoute = await import('../../../../src/app/api/account/illustrations/config/route.ts')
const imageTestRoute = await import('../../../../src/app/api/account/image-api-key/test/route.ts')
const importRoute = await import('../../../../src/app/api/account/illustrations/import/route.ts')
const assetRoute = await import('../../../../src/app/api/account/illustrations/assets/[assetId]/route.ts')

const endpointCases = [
  ['https://api.example.test', 'https://api.example.test/v1/chat/completions', 'https://api.example.test/v1/images/generations'],
  ['https://api.example.test/v1/', 'https://api.example.test/v1/chat/completions', 'https://api.example.test/v1/images/generations'],
  ['https://gw.example.test/custom/api/v2/', 'https://gw.example.test/custom/api/v2/chat/completions', 'https://gw.example.test/custom/api/v2/images/generations'],
  ['https://gw.example.test/custom/api/v2/chat/completions/', 'https://gw.example.test/custom/api/v2/chat/completions', 'https://gw.example.test/custom/api/v2/images/generations'],
  ['https://gw.example.test/custom/api/v2/images/generations/images/generations', 'https://gw.example.test/custom/api/v2/chat/completions', 'https://gw.example.test/custom/api/v2/images/generations'],
  ['https://api.example.test/v1/chat/completions/chat/completions', 'https://api.example.test/v1/chat/completions', 'https://api.example.test/v1/images/generations'],
]
for (const [baseUrl, chatExpected, imageExpected] of endpointCases) {
  assert.equal(
    endpointNormalizer.normalizeOpenAiCompatibleEndpoint(baseUrl, 'chat/completions').toString(),
    chatExpected,
  )
  assert.equal(
    endpointNormalizer.normalizeOpenAiCompatibleEndpoint(baseUrl, 'images/generations').toString(),
    imageExpected,
  )
}
assert.equal(providerConfig.isDeepSeekOfficialBaseUrl('https://api.deepseek.com'), true)
assert.equal(providerConfig.isDeepSeekOfficialBaseUrl('https://api.deepseek.com/v1/chat/completions'), true)
assert.equal(providerConfig.isDeepSeekOfficialBaseUrl('https://gateway.example.test/v1'), false)

const CloudSettingsSchema = accountContract.CloudSettingsSchema
const settings = CloudSettingsSchema.parse({
  provider: 'custom',
  customUrl: 'https://text.example.test/v1',
  customModel: 'text-model',
  temperature: 0.8,
  topP: 0.8,
  reasoningEffort: 'disabled',
  talentThinkingIntensity: 'disabled',
  aiTalentGeneration: true,
  preGenerateRounds: 1,
  narrativeStyle: 'default',
  narrativeStyleText: '',
  narrativeStyleVersion: 0,
  narrativeAddressing: 'second-person',
  wordCountTarget: 1200,
  streamingMode: 'off',
  comfortableParagraphs: true,
  reduceMotion: false,
  theme: 'paper',
  imageApiBaseUrl: 'https://images.example.test',
  imageModel: 'test-image-model',
})
assert.deepEqual(CloudSettingsSchema.parse(settings), settings, 'cloud settings must remain readable after canonical theme normalization')

function createAccount(accountId) {
  const database = accountDatabaseModule.getAccountDatabase()
  const now = Date.now()
  database.prepare(`
    INSERT INTO accounts(
      id, username, username_canonical, qq, password_hash, settings_json,
      character_draft_json, encrypted_api_key, save_api_key, revision, created_at, last_active_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 0, 1, ?, ?)
  `).run(
    accountId,
    accountId,
    accountId,
    'test-password-hash',
    JSON.stringify(settings),
    JSON.stringify(accountContract.DEFAULT_CLOUD_CHARACTER_DRAFT),
    now,
    now,
  )
  const token = accountCrypto.createSessionToken()
  database.prepare(`
    INSERT INTO account_sessions(token_hash, account_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(accountCrypto.hashSessionToken(token), accountId, now, now + 60_000, now)
  return token
}

function setSettings(accountId, patch) {
  const database = accountDatabaseModule.getAccountDatabase()
  const row = database.prepare('SELECT settings_json FROM accounts WHERE id = ?')
    .get(accountId)
  const next = CloudSettingsSchema.parse({ ...JSON.parse(row.settings_json), ...patch })
  database.prepare('UPDATE accounts SET settings_json = ? WHERE id = ?')
    .run(JSON.stringify(next), accountId)
}

function postKeyRequest(token, apiKey) {
  return new Request('http://localhost/api/account/image-api-key', {
    method: 'PUT',
    headers: {
      origin: 'http://localhost',
      cookie: `${accountContract.ACCOUNT_SESSION_COOKIE}=${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  })
}

function getRequest(url, token) {
  return new Request(url, {
    headers: { cookie: `${accountContract.ACCOUNT_SESSION_COOKIE}=${token}` },
  })
}

function getGuestRequest(url, cookie) {
  return new Request(url, { headers: { cookie } })
}

function putJsonRequest(url, cookie, body) {
  return new Request(url, {
    method: 'PUT',
    headers: {
      origin: 'http://localhost',
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function postJsonRequest(url, cookie, body) {
  return new Request(url, {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const accountAToken = createAccount('image-account-a')
const accountBToken = createAccount('image-account-b')
const privateKeyA = 'image-secret-fixture-account-a'
const privateKeyB = 'image-secret-fixture-account-b'

try {
  setSettings('image-account-a', {
    imageApiBaseUrl: 'https://dasuapi.com',
    imageModel: 'preserved-account-image-model',
  })
  setSettings('image-account-b', {
    imageApiBaseUrl: 'https://account-gateway.example.test/api/v2',
    imageModel: 'preserved-account-gateway-model',
  })
  accountDatabaseModule.closeAccountDatabaseForTests()
  const migratedDatabase = accountDatabaseModule.getAccountDatabase()
  const migratedAccountSettingsA = JSON.parse(migratedDatabase.prepare(
    'SELECT settings_json FROM accounts WHERE id = ?',
  ).get('image-account-a').settings_json)
  const migratedAccountSettingsB = JSON.parse(migratedDatabase.prepare(
    'SELECT settings_json FROM accounts WHERE id = ?',
  ).get('image-account-b').settings_json)
  assert.equal(migratedAccountSettingsA.imageApiBaseUrl, '')
  assert.equal(migratedAccountSettingsA.imageModel, 'preserved-account-image-model')
  assert.equal(migratedAccountSettingsB.imageApiBaseUrl, 'https://account-gateway.example.test/api/v2')
  assert.equal(migratedAccountSettingsB.imageModel, 'preserved-account-gateway-model')

  const defaultImagePresetSyncResponse = await imagePresetRoute.GET(getRequest(
    'http://localhost/api/account/image-api-presets',
    accountAToken,
  ))
  assert.deepEqual(await defaultImagePresetSyncResponse.json(), { enabled: false, presets: [] })
  const synchronizedPreset = {
    id: 'image-preset-a',
    name: 'Account image provider',
    baseUrl: 'https://image-gateway.example.test/api/v2',
    model: 'cloud-image-model',
    apiKey: 'image-secret-cloud-preset',
    updatedAt: Date.now(),
  }
  const enableImagePresetSyncResponse = await imagePresetRoute.PUT(putJsonRequest(
    'http://localhost/api/account/image-api-presets',
    `${accountContract.ACCOUNT_SESSION_COOKIE}=${accountAToken}`,
    { enabled: true, presets: [synchronizedPreset] },
  ))
  assert.deepEqual(await enableImagePresetSyncResponse.json(), { enabled: true })
  const encryptedPresetsRow = migratedDatabase.prepare(`
    SELECT presets_json FROM account_image_api_presets WHERE account_id = ?
  `).get('image-account-a')
  assert.equal(encryptedPresetsRow.presets_json.includes(synchronizedPreset.apiKey), false)
  assert.equal(imagePresetService.readImageApiPresetSync('image-account-a').presets[0].apiKey, synchronizedPreset.apiKey)
  const imagePresetCloudResponse = await imagePresetRoute.GET(getRequest(
    'http://localhost/api/account/image-api-presets',
    accountAToken,
  ))
  assert.deepEqual((await imagePresetCloudResponse.json()).presets, [synchronizedPreset])
  const revokeImagePresetSyncResponse = await imagePresetRoute.PUT(putJsonRequest(
    'http://localhost/api/account/image-api-presets',
    `${accountContract.ACCOUNT_SESSION_COOKIE}=${accountAToken}`,
    { enabled: false },
  ))
  assert.deepEqual(await revokeImagePresetSyncResponse.json(), { enabled: false })
  assert.equal(migratedDatabase.prepare(
    'SELECT 1 FROM account_image_api_presets WHERE account_id = ?',
  ).get('image-account-a'), undefined)
  assert.equal(imagePresetService.readImageApiPresetSync('image-account-a').enabled, false)

  const saveKeyResponse = await keyRoute.PUT(postKeyRequest(accountAToken, privateKeyA))
  assert.equal(saveKeyResponse.status, 200)
  assert.deepEqual(await saveKeyResponse.json(), { configured: true })
  const keyStatusResponse = await keyRoute.GET(getRequest(
    'http://localhost/api/account/image-api-key',
    accountAToken,
  ))
  const keyStatusBody = await keyStatusResponse.json()
  assert.deepEqual(keyStatusBody, { configured: true })

  imageKeyStore.saveAccountImageApiKey('image-account-b', privateKeyB)
  const credentialRow = accountDatabaseModule.getAccountDatabase().prepare(`
    SELECT encrypted_api_key FROM account_image_api_credentials WHERE account_id = ?
  `).get('image-account-a')
  assert.notEqual(credentialRow.encrypted_api_key, privateKeyA)
  assert.equal(imageKeyStore.readAccountImageApiKey('image-account-a'), privateKeyA)
  assert.throws(
    () => accountCrypto.decryptApiKey(credentialRow.encrypted_api_key, 'image-account-b'),
    'image key ciphertext must be bound to its owning account',
  )
  const sessionPayload = accountService.getSessionAccount(accountAToken)
  assert.ok(sessionPayload)
  assert.equal(JSON.stringify(sessionPayload).includes(privateKeyA), false)
  assert.equal(JSON.stringify(keyStatusBody).includes(privateKeyA), false)
  const legacyMigrationResponse = await keyMigrationRoute.POST(postJsonRequest(
    'http://localhost/api/account/image-api-key/migrate',
    `${accountContract.ACCOUNT_SESSION_COOKIE}=${accountAToken}`,
    {},
  ))
  assert.deepEqual(await legacyMigrationResponse.json(), { apiKey: privateKeyA })
  assert.equal(imageKeyStore.hasAccountImageApiKey('image-account-a'), true, 'reading a legacy key must not delete it')

  const imageKinds = [
    { kind: 'birth-scene', setting: 'imageBirthEnabled' },
    { kind: 'life-stage', setting: 'imageLifeStageEnabled' },
    { kind: 'ending-scene', setting: 'imageLifeStageEnabled' },
    { kind: 'character-card', setting: 'imageCharacterCardEnabled' },
    { kind: 'custom-world-card', setting: 'imageWorldCardEnabled' },
  ]
  let taskCounter = 0
  for (const { kind, setting } of imageKinds) {
    setSettings('image-account-a', {
      imageBirthEnabled: false,
      imageLifeStageEnabled: false,
      imageCharacterCardEnabled: false,
      imageWorldCardEnabled: false,
    })
    assert.throws(
      () => illustration.requestPlayerIllustrationTask('image-account-a', {
        action: 'create',
        key: `disabled:${kind}`,
        kind,
        prompt: 'should not be generated',
      }),
      (error) => error?.code === 'illustration_disabled',
    )
    setSettings('image-account-a', { [setting]: true })
    const taskKey = `enabled:${kind}:${++taskCounter}`
    assert.equal(illustration.requestPlayerIllustrationTask('image-account-a', {
      action: 'create',
      key: taskKey,
      kind,
      prompt: 'fixture prompt',
    }).shouldProcess, true)
  }

  setSettings('image-account-a', {
    imageBirthEnabled: true,
    imageLifeStageEnabled: false,
    imageCharacterCardEnabled: false,
    imageWorldCardEnabled: false,
  })
  const birthKey = 'life:run-a:birth'
  const firstRequest = illustration.requestPlayerIllustrationTask('image-account-a', {
    action: 'create',
    key: birthKey,
    kind: 'birth-scene',
    prompt: 'A quiet mountain village at dawn.',
    configuration: {
      baseUrl: 'https://images.example.test',
      model: 'test-image-model',
      apiKey: privateKeyA,
    },
  })
  assert.equal(firstRequest.shouldProcess, true)
  const duplicateRequest = illustration.requestPlayerIllustrationTask('image-account-a', {
    action: 'create',
    key: birthKey,
    kind: 'birth-scene',
    prompt: 'A different prompt must not replace the first request.',
      configuration: {
        baseUrl: 'https://images.example.test',
        model: 'test-image-model',
        apiKey: privateKeyA,
      },
  })
  assert.equal(duplicateRequest.shouldProcess, false)
  assert.equal(duplicateRequest.task?.key, birthKey)
  assert.throws(
    () => illustration.requestPlayerIllustrationTask('image-account-a', {
      action: 'create',
      key: birthKey,
      kind: 'character-card',
      prompt: 'same identity, wrong kind',
    }),
    (error) => error?.code === 'illustration_task_kind_conflict',
  )
  assert.equal(illustration.readPlayerIllustrationTask('image-account-b', birthKey), null)

  const png = await sharp({
    create: { width: 1200, height: 900, channels: 4, background: '#6f887b' },
  }).png().toBuffer()
  let providerCalls = 0
  const accountImageConfiguration = {
    baseUrl: 'https://images.example.test',
    model: 'test-image-model',
    apiKey: privateKeyA,
  }
  const taskBeforeProcessing = playerContentDatabaseModule.getPlayerContentDatabase().prepare(`
    SELECT * FROM image_generation_jobs WHERE owner_type = 'account' AND owner_id = ? AND job_key = ?
  `).get('image-account-a', birthKey)
  assert.equal(JSON.stringify(taskBeforeProcessing).includes(privateKeyA), false, 'task records must not contain provider keys')
  const failedFetch = async (_url, init) => {
    providerCalls++
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${privateKeyA}`)
    return new Response('provider unavailable', { status: 503 })
  }
  await illustration.processPlayerIllustrationTask('image-account-a', birthKey, accountImageConfiguration, {
    fetchImplementation: failedFetch,
    lookupImplementation: async () => ['93.184.216.34'],
  })
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', birthKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', birthKey)?.errorCode, 'provider_http_503')

  const retry = illustration.requestPlayerIllustrationTask('image-account-a', {
    action: 'retry',
    key: birthKey,
  })
  assert.equal(retry.shouldProcess, true)
  const successfulFetch = async (_url, init) => {
    providerCalls++
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${privateKeyA}`)
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'test-image-model')
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  await illustration.processPlayerIllustrationTask('image-account-a', birthKey, accountImageConfiguration, {
    fetchImplementation: successfulFetch,
    lookupImplementation: async () => ['93.184.216.34'],
  })
  assert.equal(providerCalls, 2)
  const readyTask = illustration.readPlayerIllustrationTask('image-account-a', birthKey)
  assert.equal(readyTask?.status, 'ready')
  assert.match(readyTask?.assetUrl ?? '', /^\/api\/account\/illustrations\/assets\//u)

  const assetId = decodeURIComponent(readyTask.assetUrl.split('/').at(-1))
  const ownedAsset = illustration.readPlayerIllustrationAsset('image-account-a', assetId)
  assert.equal(ownedAsset?.mimeType, 'image/webp')
  assert.equal(illustration.readPlayerIllustrationAsset('image-account-b', assetId), null)
  const optimizedBytes = assetStore.readPortraitAsset(ownedAsset.storageKey)
  const metadata = await sharp(optimizedBytes).metadata()
  assert.equal(metadata.format, 'webp')
  assert.ok(metadata.width <= 896 && metadata.height <= 896)
  const unauthorizedAsset = await assetRoute.GET(
    getRequest(`http://localhost/api/account/illustrations/assets/${assetId}`, accountBToken),
    { params: Promise.resolve({ assetId }) },
  )
  assert.equal(unauthorizedAsset.status, 404)

  const repeatedReadyRequest = illustration.requestPlayerIllustrationTask('image-account-a', {
    action: 'create',
    key: birthKey,
    kind: 'birth-scene',
    prompt: 'Repeated rendering must not create a second image call.',
  })
  assert.equal(repeatedReadyRequest.shouldProcess, false)
  assert.equal(repeatedReadyRequest.task?.assetUrl, readyTask.assetUrl)

  setSettings('image-account-b', {
    imageBirthEnabled: true,
    imageApiBaseUrl: 'http://127.0.0.1/private',
  })
  const invalidProviderKey = 'life:run-b:birth'
  illustration.requestPlayerIllustrationTask('image-account-b', {
    action: 'create',
    key: invalidProviderKey,
    kind: 'birth-scene',
    prompt: 'invalid endpoint must fail before fetch',
  })
  await illustration.processPlayerIllustrationTask('image-account-b', invalidProviderKey, {
    baseUrl: 'http://127.0.0.1/private',
    model: 'test-image-model',
    apiKey: privateKeyB,
  }, {
    fetchImplementation: async () => {
      providerCalls++
      throw new Error('fetch must not run for a rejected URL')
    },
    lookupImplementation: async () => ['93.184.216.34'],
  })
  assert.equal(providerCalls, 2)
  assert.equal(
    illustration.readPlayerIllustrationTask('image-account-b', invalidProviderKey)?.errorCode,
    'unsafe_base_url',
  )

  const guestSessionResponse = await guestSessionRoute.POST(new Request(
    'http://localhost/api/account/illustrations/session',
    { method: 'POST', headers: { origin: 'http://localhost' }, body: '{}' },
  ))
  assert.equal(guestSessionResponse.status, 200)
  const guestSessionBody = await guestSessionResponse.json()
  assert.equal(guestSessionBody.owner.type, 'guest')
  const setGuestCookie = guestSessionResponse.headers.get('set-cookie') ?? ''
  assert.match(setGuestCookie, /HttpOnly/u)
  assert.match(setGuestCookie, /SameSite=strict/iu)
  assert.match(setGuestCookie, /Path=\//u)
  const guestCookie = setGuestCookie.slice(0, setGuestCookie.indexOf(';'))
  assert.match(guestCookie, /^ai_life_illustration_device=/u)
  const guestId = guestSessionBody.owner.id
  const guestOwner = { type: 'guest', id: guestId }
  const guestPrivateKey = 'image-secret-fixture-guest-device'
  const guestDatabase = accountDatabaseModule.getAccountDatabase()
  const guestSettingsRow = guestDatabase.prepare(
    'SELECT settings_json FROM guest_illustration_devices WHERE id = ?',
  ).get(guestId)
  const legacyGuestSettings = JSON.parse(guestSettingsRow.settings_json)
  legacyGuestSettings.imageApiBaseUrl = 'https://dasuapi.com'
  legacyGuestSettings.imageModel = 'preserved-guest-image-model'
  guestDatabase.prepare('UPDATE guest_illustration_devices SET settings_json = ? WHERE id = ?')
    .run(JSON.stringify(legacyGuestSettings), guestId)
  accountDatabaseModule.closeAccountDatabaseForTests()
  const migratedGuestSettings = guestProfileService.readGuestIllustrationConfig(guestId)
  assert.equal(migratedGuestSettings.imageApiBaseUrl, '')
  assert.equal(migratedGuestSettings.imageModel, 'preserved-guest-image-model')

  const guestSaveKeyResponse = await keyRoute.PUT(putJsonRequest(
    'http://localhost/api/account/image-api-key',
    guestCookie,
    { apiKey: guestPrivateKey },
  ))
  assert.equal(guestSaveKeyResponse.status, 200)
  assert.deepEqual(await guestSaveKeyResponse.json(), { configured: true })
  const guestKeyStatusResponse = await keyRoute.GET(getGuestRequest(
    'http://localhost/api/account/image-api-key',
    guestCookie,
  ))
  const guestKeyStatus = await guestKeyStatusResponse.json()
  assert.deepEqual(guestKeyStatus, { configured: true })
  assert.equal(JSON.stringify(guestKeyStatus).includes(guestPrivateKey), false)
  assert.equal(imageKeyStore.readImageApiKey(guestOwner), guestPrivateKey)
  const encryptedGuestKey = accountDatabaseModule.getAccountDatabase().prepare(`
    SELECT encrypted_api_key FROM guest_image_api_credentials WHERE guest_id = ?
  `).get(guestId)
  assert.notEqual(encryptedGuestKey.encrypted_api_key, guestPrivateKey)
  assert.notEqual(encryptedGuestKey.encrypted_api_key, credentialRow.encrypted_api_key)
  assert.throws(
    () => accountCrypto.decryptApiKey(encryptedGuestKey.encrypted_api_key, guestId),
    'guest credentials must use guest-scoped authenticated encryption',
  )
  assert.throws(
    () => illustration.requestPlayerIllustrationTask(guestOwner, {
      action: 'create',
      key: 'guest:disabled:birth',
      kind: 'birth-scene',
      prompt: 'A disabled guest scene must not be queued.',
    }),
    (error) => error?.code === 'illustration_disabled',
  )

  const guestConfig = {
    imageApiBaseUrl: 'https://93.184.216.34',
    imageModel: 'guest-test-image-model',
    imageBirthEnabled: true,
    imageLifeStageEnabled: false,
    imageCharacterCardEnabled: false,
    imageWorldCardEnabled: false,
  }
  const guestConfigResponse = await guestConfigRoute.PUT(putJsonRequest(
    'http://localhost/api/account/illustrations/config',
    guestCookie,
    guestConfig,
  ))
  assert.equal(guestConfigResponse.status, 200)
  assert.deepEqual((await guestConfigResponse.json()).config, guestConfig)
  const guestConfigReadResponse = await guestConfigRoute.GET(getGuestRequest(
    'http://localhost/api/account/illustrations/config',
    guestCookie,
  ))
  const guestConfigRead = await guestConfigReadResponse.json()
  assert.deepEqual(guestConfigRead, { config: guestConfig, apiKeyConfigured: true })
  assert.equal(JSON.stringify(guestConfigRead).includes(guestPrivateKey), false)

  const originalFetch = globalThis.fetch
  let guestProviderCalls = 0
  const guestImageConfiguration = {
    baseUrl: guestConfig.imageApiBaseUrl,
    model: guestConfig.imageModel,
    apiKey: guestPrivateKey,
  }
  globalThis.fetch = async (url, init) => {
    guestProviderCalls++
    assert.equal(new URL(url).hostname, '93.184.216.34')
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${guestPrivateKey}`)
    assert.equal(JSON.parse(init.body).model, guestConfig.imageModel)
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const guestTestResponse = await imageTestRoute.POST(postJsonRequest(
      'http://localhost/api/account/image-api-key/test',
      guestCookie,
      guestImageConfiguration,
    ))
    assert.equal(guestTestResponse.status, 200)
    assert.deepEqual(await guestTestResponse.json(), {
      ok: true,
      model: guestConfig.imageModel,
      mimeType: 'image/webp',
      byteLength: (await assetStore.optimizePortraitImage(png)).bytes.byteLength,
    })
    assert.equal(guestProviderCalls, 1)
    assert.equal(illustration.readPlayerIllustrationTask(guestOwner, 'guest:life:birth'), null)
    for (let count = 1; count < guestProfileService.GUEST_IMAGE_TEST_LIMIT; count++) {
      illustrationHttpIdentity.enforceGuestIllustrationRateLimit(guestOwner, 'test')
    }
    assert.throws(
      () => illustrationHttpIdentity.enforceGuestIllustrationRateLimit(guestOwner, 'test'),
      (error) => error?.status === 429 && error?.code === 'rate_limited',
    )
    for (let count = 0; count < guestProfileService.GUEST_IMAGE_GENERATION_LIMIT; count++) {
      illustrationHttpIdentity.enforceGuestIllustrationRateLimit(guestOwner, 'generation')
    }
    assert.throws(
      () => illustrationHttpIdentity.enforceGuestIllustrationRateLimit(guestOwner, 'generation'),
      (error) => error?.status === 429 && error?.code === 'rate_limited',
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  const guestBirthKey = 'guest:life:birth'
  assert.equal(illustration.requestPlayerIllustrationTask(guestOwner, {
    action: 'create',
    key: guestBirthKey,
    kind: 'birth-scene',
    prompt: 'A scene generated for one anonymous device.',
  }).shouldProcess, true)
  await illustration.processPlayerIllustrationTask(guestOwner, guestBirthKey, guestImageConfiguration, {
    fetchImplementation: async (url, init) => {
      guestProviderCalls++
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${guestPrivateKey}`)
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
    lookupImplementation: async () => ['93.184.216.34'],
  })
  assert.equal(guestProviderCalls, 2)
  const guestReadyTask = illustration.readPlayerIllustrationTask(guestOwner, guestBirthKey)
  assert.equal(guestReadyTask?.status, 'ready')
  const guestAssetId = decodeURIComponent(guestReadyTask.assetUrl.split('/').at(-1))
  assert.ok(illustration.readPlayerIllustrationAsset(guestOwner, guestAssetId))
  assert.equal(illustration.readPlayerIllustrationAsset('image-account-a', guestAssetId), null)

  const otherGuest = guestProfileService.createGuestIllustrationProfile()
  assert.equal(illustration.readPlayerIllustrationTask(otherGuest.identity, guestBirthKey), null)
  const guestAssetResponse = await assetRoute.GET(
    getGuestRequest(
      `http://localhost/api/account/illustrations/assets/${guestAssetId}`,
      guestCookie,
    ),
    { params: Promise.resolve({ assetId: guestAssetId }) },
  )
  assert.equal(guestAssetResponse.status, 200)
  const wrongGuestAssetResponse = await assetRoute.GET(
    getGuestRequest(
      `http://localhost/api/account/illustrations/assets/${guestAssetId}`,
      `${guestProfileService.GUEST_ILLUSTRATION_COOKIE}=${otherGuest.token}`,
    ),
    { params: Promise.resolve({ assetId: guestAssetId }) },
  )
  assert.equal(wrongGuestAssetResponse.status, 404)
  const wrongAccountAssetResponse = await assetRoute.GET(
    getRequest(`http://localhost/api/account/illustrations/assets/${guestAssetId}`, accountBToken),
    { params: Promise.resolve({ assetId: guestAssetId }) },
  )
  assert.equal(wrongAccountAssetResponse.status, 404)

  const deleteGuestResponse = await guestSessionRoute.DELETE(new Request(
    'http://localhost/api/account/illustrations/session',
    { method: 'DELETE', headers: { origin: 'http://localhost', cookie: guestCookie } },
  ))
  assert.equal(deleteGuestResponse.status, 200)
  assert.match(deleteGuestResponse.headers.get('set-cookie') ?? '', /Max-Age=0/u)
  assert.equal(imageKeyStore.hasImageApiKey(guestOwner), false)
  assert.equal(illustration.readPlayerIllustrationTask(guestOwner, guestBirthKey), null)
  const lostCookieAssetResponse = await assetRoute.GET(
    getGuestRequest(
      `http://localhost/api/account/illustrations/assets/${guestAssetId}`,
      guestCookie,
    ),
    { params: Promise.resolve({ assetId: guestAssetId }) },
  )
  assert.equal(lostCookieAssetResponse.status, 401)
  const replacementGuestResponse = await guestSessionRoute.POST(new Request(
    'http://localhost/api/account/illustrations/session',
    { method: 'POST', headers: { origin: 'http://localhost' }, body: '{}' },
  ))
  assert.equal(replacementGuestResponse.status, 200)
  const replacementGuest = await replacementGuestResponse.json()
  assert.notEqual(replacementGuest.owner.id, guestId)
  assert.deepEqual(replacementGuest.config, guestProfileService.DEFAULT_GUEST_ILLUSTRATION_CONFIG)
  assert.equal(replacementGuest.apiKeyConfigured, false)

  const importGuest = guestProfileService.createGuestIllustrationProfile()
  const importGuestId = importGuest.identity.id
  const importGuestOwner = importGuest.identity
  const importGuestKey = 'image-secret-fixture-import-guest'
  const importGuestConfig = {
    imageApiBaseUrl: 'https://guest-images.example.test',
    imageModel: 'guest-import-model',
    imageBirthEnabled: true,
    imageLifeStageEnabled: false,
    imageCharacterCardEnabled: false,
    imageWorldCardEnabled: false,
  }
  guestProfileService.writeGuestIllustrationConfig(importGuestId, importGuestConfig)
  imageKeyStore.saveImageApiKey(importGuestOwner, importGuestKey)
  setSettings('image-account-a', {
    imageApiBaseUrl: 'https://account-images.example.test',
    imageModel: 'account-image-model',
    imageBirthEnabled: true,
    imageLifeStageEnabled: false,
    imageCharacterCardEnabled: false,
    imageWorldCardEnabled: false,
  })

  const keepAccountKey = 'import-conflict-keep-account'
  const useGuestKey = 'import-conflict-use-guest'
  const guestOnlyKeys = ['import-guest-only', 'import-active-check', 'import-asset']
  for (const key of [keepAccountKey, useGuestKey]) {
    illustration.requestPlayerIllustrationTask('image-account-a', {
      action: 'create',
      key,
      kind: 'birth-scene',
      prompt: `Account version ${key}.`,
    })
  }
  for (const key of [keepAccountKey, useGuestKey, guestOnlyKeys[0], guestOnlyKeys[1]]) {
    illustration.requestPlayerIllustrationTask(importGuestOwner, {
      action: 'create',
      key,
      kind: 'birth-scene',
      prompt: `Guest version ${key}.`,
    })
  }
  const taskDatabase = playerContentDatabaseModule.getPlayerContentDatabase()
  taskDatabase.prepare(`
    UPDATE image_generation_jobs SET status = 'failed'
    WHERE owner_type = 'account' AND owner_id = ? AND job_key IN (?, ?)
  `).run('image-account-a', keepAccountKey, useGuestKey)
  taskDatabase.prepare(`
    UPDATE image_generation_jobs SET status = 'failed'
    WHERE owner_type = 'guest' AND owner_id = ? AND job_key IN (?, ?, ?)
  `).run(importGuestId, keepAccountKey, useGuestKey, guestOnlyKeys[0])
  assert.equal(illustration.requestPlayerIllustrationTask(importGuestOwner, {
    action: 'create',
    key: guestOnlyKeys[2],
    kind: 'birth-scene',
    prompt: 'Guest image asset to transfer.',
  }).shouldProcess, true)
  let importProviderCalls = 0
  await illustration.processPlayerIllustrationTask(importGuestOwner, guestOnlyKeys[2], {
    baseUrl: importGuestConfig.imageApiBaseUrl,
    model: importGuestConfig.imageModel,
    apiKey: importGuestKey,
  }, {
    fetchImplementation: async (_url, init) => {
      importProviderCalls++
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${importGuestKey}`)
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
    lookupImplementation: async () => ['93.184.216.34'],
  })
  assert.equal(importProviderCalls, 1)
  const importAssetId = decodeURIComponent(
    illustration.readPlayerIllustrationTask(importGuestOwner, guestOnlyKeys[2]).assetUrl.split('/').at(-1),
  )
  const importGuestCookie = `${guestProfileService.GUEST_ILLUSTRATION_COOKIE}=${importGuest.token}`
  const importRequest = (choices) => importRoute.POST(postJsonRequest(
    'http://localhost/api/account/illustrations/import',
    `${accountContract.ACCOUNT_SESSION_COOKIE}=${accountAToken}; ${importGuestCookie}`,
    choices,
  ))
  const importPreview = illustrationImport.readIllustrationImportPreview('image-account-a', importGuestId)
  assert.equal(importPreview.configConflict, true)
  assert.equal(importPreview.keyConflict, true)
  assert.equal(importPreview.tasks.filter((task) => task.conflict).length, 2)
  assert.equal(importPreview.guest.activeTaskCount, 1)
  const selections = {
    configSource: 'guest',
    keySource: 'guest',
    taskChoices: [
      { key: keepAccountKey, source: 'account' },
      { key: useGuestKey, source: 'guest' },
    ],
  }
  const activeImportResponse = await importRequest(selections)
  assert.equal(activeImportResponse.status, 409)
  assert.equal((await activeImportResponse.json()).code, 'illustration_import_tasks_active')
  taskDatabase.prepare(`
    UPDATE image_generation_jobs SET status = 'failed'
    WHERE owner_type = 'guest' AND owner_id = ? AND job_key = ?
  `).run(importGuestId, guestOnlyKeys[1])
  const missingConfigResponse = await importRequest({ keySource: 'guest', taskChoices: [] })
  assert.equal(missingConfigResponse.status, 400)
  assert.equal((await missingConfigResponse.json()).code, 'illustration_import_config_choice_required')
  const missingKeyResponse = await importRequest({ configSource: 'guest', taskChoices: [] })
  assert.equal(missingKeyResponse.status, 400)
  assert.equal((await missingKeyResponse.json()).code, 'illustration_import_key_choice_required')
  const missingTaskResponse = await importRequest({ configSource: 'guest', keySource: 'guest', taskChoices: [] })
  assert.equal(missingTaskResponse.status, 400)
  assert.equal((await missingTaskResponse.json()).code, 'illustration_import_task_choices_invalid')

  const accountDatabase = accountDatabaseModule.getAccountDatabase()
  accountDatabase.exec(`
    CREATE TRIGGER fail_illustration_import
    BEFORE UPDATE OF settings_json ON accounts
    WHEN OLD.id = 'image-account-a'
    BEGIN
      SELECT RAISE(ABORT, 'injected import failure');
    END;
  `)
  assert.throws(
    () => illustrationImport.importGuestIllustrationProfile('image-account-a', importGuestId, selections),
    /injected import failure/u,
  )
  accountDatabase.exec('DROP TRIGGER fail_illustration_import')
  assert.equal(illustration.readPlayerIllustrationTask(importGuestOwner, keepAccountKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask(importGuestOwner, useGuestKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', keepAccountKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', useGuestKey)?.status, 'failed')
  assert.equal(imageKeyStore.readImageApiKey(importGuestOwner), importGuestKey)
  assert.equal(imageKeyStore.readAccountImageApiKey('image-account-a'), privateKeyA)

  const callsBeforeImport = importProviderCalls
  const successfulImportResponse = await importRequest(selections)
  assert.equal(successfulImportResponse.status, 200)
  assert.deepEqual(await successfulImportResponse.json(), {
    ok: true,
    movedTasks: 4,
    keptGuestTasks: 1,
  })
  assert.equal(importProviderCalls, callsBeforeImport, 'import must not call the image provider')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', keepAccountKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask(importGuestOwner, keepAccountKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', useGuestKey)?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask(importGuestOwner, useGuestKey), null)
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', guestOnlyKeys[0])?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', guestOnlyKeys[1])?.status, 'failed')
  assert.equal(illustration.readPlayerIllustrationTask('image-account-a', guestOnlyKeys[2])?.status, 'ready')
  assert.equal(illustration.readPlayerIllustrationAsset('image-account-a', importAssetId)?.mimeType, 'image/webp')
  assert.equal(illustration.readPlayerIllustrationAsset(importGuestOwner, importAssetId), null)
  assert.equal(imageKeyStore.readAccountImageApiKey('image-account-a'), importGuestKey)
  assert.equal(imageKeyStore.readImageApiKey(importGuestOwner), null)
  assert.equal(guestProfileService.readGuestIllustrationConfig(importGuestId).imageBirthEnabled, false)
  assert.equal(imageKeyStore.hasAccountImageApiKey('image-account-a'), true)
  const transferredAssetResponse = await assetRoute.GET(
    getRequest(`http://localhost/api/account/illustrations/assets/${importAssetId}`, accountAToken),
    { params: Promise.resolve({ assetId: importAssetId }) },
  )
  assert.equal(transferredAssetResponse.status, 200)

  const finalAccountKeyClear = await keyRoute.DELETE(new Request('http://localhost/api/account/image-api-key', {
    method: 'DELETE',
    headers: {
      origin: 'http://localhost',
      cookie: `${accountContract.ACCOUNT_SESSION_COOKIE}=${accountAToken}`,
    },
  }))
  assert.deepEqual(await finalAccountKeyClear.json(), { configured: false })
  assert.equal(imageKeyStore.hasAccountImageApiKey('image-account-a'), false)
  assert.equal(imageKeyStore.readAccountImageApiKey('image-account-b'), privateKeyB)

  console.log('[image-generation-smoke] PASS')
} finally {
  playerContentDatabaseModule.closePlayerContentDatabaseForTests()
  accountDatabaseModule.closeAccountDatabaseForTests()
  serverLogDatabaseModule.closeServerLogDatabaseForTests()
  await fs.rm(tempRoot, { recursive: true, force: true })
}
