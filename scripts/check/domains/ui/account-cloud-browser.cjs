const fs = require('node:fs')
const path = require('node:path')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const configuredChromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('[account-cloud-browser] UNAVAILABLE: Playwright is not installed')
  process.exit(2)
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  if (dimensions.document > dimensions.viewport) {
    throw new Error(`${label} horizontal overflow: ${dimensions.document} > ${dimensions.viewport}`)
  }
}

async function main() {
  const launchOptions = { headless: true }
  if (fs.existsSync(configuredChromePath)) launchOptions.executablePath = configuredChromePath

  const browser = await chromium.launch(launchOptions)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const consoleErrors = []
  const failedResponses = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`)
  })

  const cloudKey = 'sk-browser-cloud-secret'
  const originalBackground = `浏览器长期背景：${'原文完整保留。'.repeat(80)}`
  const cloudNarrative = `浏览器云端人生：${'完整叙事不得截断。'.repeat(1200)}`
  const username = `cloud_${Date.now()}`
  const password = '浏览器测试 password 123'

  await page.addInitScript(({ apiKey }) => {
    if (sessionStorage.getItem('accountCloudFixtureInitialized')) return
    sessionStorage.setItem('accountCloudFixtureInitialized', '1')
    localStorage.clear()
    localStorage.setItem('mod-settings:store', JSON.stringify({
      version: 8,
      state: {
        provider: 'deepseek',
        customKey: apiKey,
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
      },
    }))
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({
      version: 4,
      state: {
        worldConfig: {
          name: '现代地球',
          eraName: '公元',
          eraStartYear: 2000,
          essenceTag: 'modern',
          powerSystemTag: 'none',
          powerCeiling: 8,
          spatialForm: 'plane',
          civilizationStage: 'modern',
          difficulty: 'normal',
          description: '账号云同步浏览器夹具',
          worldType: 'materialist',
        },
        entities: [],
        initialized: true,
        worldCode: 2026072101,
        currentYear: 2000,
        worldTags: ['现代', '现实'],
        eraStartYear: 2000,
        eraName: '公元',
        calibration: null,
        destinyPatternModifiers: {},
        worldInitAIStatus: {
          status: 'complete',
          currentStep: '完成',
          calibrationGenerated: true,
          tagsGenerated: true,
          configGenerated: true,
          entitiesGenerated: true,
          retryCount: 0,
          maxRetries: 3,
          errors: [],
        },
      },
    }))
  }, { apiKey: cloudKey })

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('角色姓名').fill('沈云归')

  await page.getByRole('button', { name: '更多选择⌄' }).click()
  await page.getByPlaceholder('输入性别名称...').fill('流光性别')
  await page.getByPlaceholder('输入性别名称...').locator('..').getByRole('button', { name: '添加' }).click()
  await page.getByRole('button', { name: '流光性别', exact: true }).click()

  await page.getByRole('button', { name: '自定义种族' }).click()
  await page.getByPlaceholder('输入种族名称...').fill('云上住民')
  await page.getByPlaceholder('输入种族名称...').locator('..').getByRole('button', { name: '添加' }).click()

  await page.getByRole('tab', { name: '02 · 寿命' }).click()
  await page.getByLabel('寿命上限').fill('360')
  await page.getByLabel('起始年龄').fill('18')
  await page.getByRole('tab', { name: '03 · 背景' }).click()
  await page.getByPlaceholder('告诉命运编织者更多关于你的角色的事...').fill(originalBackground)
  await page.getByRole('button', { name: '+ 保存为预设' }).click()
  await page.getByPlaceholder('预设名称...').fill('云城来客')
  await page.getByPlaceholder('预设名称...').locator('..').getByRole('button', { name: '保存' }).click()
  await assertNoOverflow(page, 'character-create-390')

  await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /注册账号/u }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('QQ 号（选填）').fill('123456789')
  await page.locator('input[type="password"]').nth(0).fill(password)
  await page.locator('input[type="password"]').nth(1).fill(password)
  await page.getByLabel('加密保存当前 API Key').check()
  await page.getByRole('button', { name: '注册并同步当前数据' }).click()
  await page.getByRole('heading', { name: username }).waitFor()
  await page.getByText('沈云归 · 云上住民', { exact: true }).waitFor()
  await page.getByText('已使用服务端密钥加密保存', { exact: true }).waitFor()

  const cloudWrite = await page.evaluate(async ({ narrative }) => {
    const input = {
      metadata: {
        schemaVersion: 1,
        slot: 1,
        name: '浏览器云端人生',
        worldName: '现代地球',
        characterName: '沈云归',
        totalRounds: 128,
        gameVersion: '5.3.0',
        savedAt: Date.now(),
      },
      payload: {
        engine: { totalRounds: 128, narrativeHistory: [{ id: 'browser-life', text: narrative }] },
        character: { name: '沈云归' },
        world: { worldConfig: { name: '现代地球' } },
        orchestrator: { status: 'running' },
      },
    }
    const compressed = await new Response(
      new Blob([JSON.stringify(input)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()
    const response = await fetch('/api/account/cloud-save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/gzip' },
      body: compressed,
    })
    return { status: response.status, body: await response.json() }
  }, { narrative: cloudNarrative })
  if (cloudWrite.status !== 200 || cloudWrite.body?.save?.name !== '浏览器云端人生') {
    throw new Error(`manual cloud save failed: ${JSON.stringify(cloudWrite)}`)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: username }).waitFor()
  await page.getByText('浏览器云端人生', { exact: true }).waitFor()
  await page.getByText('1 / 1', { exact: true }).waitFor()

  const restoredNarrative = await page.evaluate(async () => {
    const response = await fetch('/api/account/cloud-save?payload=1', { cache: 'no-store' })
    const body = await response.json()
    return body.payload?.engine?.narrativeHistory?.[0]?.text
  })
  if (restoredNarrative !== cloudNarrative) throw new Error('manual cloud save narrative was not restored exactly')

  const reportDir = path.resolve('reports', 'browser')
  fs.mkdirSync(reportDir, { recursive: true })
  await page.screenshot({ path: path.join(reportDir, 'account-cloud-mobile.png'), fullPage: true })
  await assertNoOverflow(page, 'account-390')

  await page.getByRole('button', { name: '退出登录' }).click()
  await page.waitForURL('**/welcome')
  const keyAfterLogout = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('mod-settings:store') || '{}').state?.customKey
  ))
  if (keyAfterLogout !== '') throw new Error('logout did not clear the decrypted API Key')

  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mod-settings:store') || '{}')
    settings.state.customKey = 'sk-local-stale-key'
    localStorage.setItem('mod-settings:store', JSON.stringify(settings))
    const persisted = JSON.parse(localStorage.getItem('mod-pages:persist:character-creation-draft') || '{}')
    persisted.state.draft.name = '本地待覆盖'
    persisted.state.draft.background = '这段本地内容应被云端覆盖'
    localStorage.setItem('mod-pages:persist:character-creation-draft', JSON.stringify(persisted))
  })

  await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('用户名').fill(username)
  await page.locator('input[type="password"]').first().fill(password)
  await page.getByRole('button', { name: '登录并载入云端' }).click()
  await page.getByRole('heading', { name: username }).waitFor()
  await page.waitForFunction(({ expectedKey, expectedBackground }) => {
    const settings = JSON.parse(localStorage.getItem('mod-settings:store') || '{}').state
    const draft = JSON.parse(localStorage.getItem('mod-pages:persist:character-creation-draft') || '{}').state?.draft
    return settings?.customKey === expectedKey
      && draft?.name === '沈云归'
      && draft?.background === expectedBackground
      && draft?.manualLifespan === '360'
      && draft?.manualStartingAge === '18'
  }, { expectedKey: cloudKey, expectedBackground: originalBackground })

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('角色姓名').waitFor()
  if (await page.getByLabel('角色姓名').inputValue() !== '沈云归') throw new Error('cloud name was not restored')
  if (await page.getByLabel('寿命上限').inputValue() !== '360') throw new Error('cloud lifespan was not restored')
  if (await page.getByLabel('起始年龄').inputValue() !== '18') throw new Error('cloud starting age was not restored')
  if (await page.getByPlaceholder('告诉命运编织者更多关于你的角色的事...').inputValue() !== originalBackground) {
    throw new Error('cloud background was not restored exactly')
  }

  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 900 })
    await assertNoOverflow(page, `character-create-${width}`)
  }
  await page.screenshot({ path: path.join(reportDir, 'character-draft-desktop.png'), fullPage: true })

  await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: username }).waitFor()
  await page.getByText('浏览器云端人生', { exact: true }).waitFor()
  await assertNoOverflow(page, 'account-1280')
  await page.screenshot({ path: path.join(reportDir, 'account-cloud-desktop.png'), fullPage: true })

  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await page.getByText('云端栏位为空', { exact: true }).waitFor()
  const deletedCloudSave = await page.evaluate(async () => (
    await fetch('/api/account/cloud-save', { cache: 'no-store' }).then((response) => response.json())
  ))
  if (deletedCloudSave.save !== null) throw new Error('manual cloud save remained after explicit deletion')

  await page.getByRole('button', { name: '删除账号' }).click()
  await page.getByPlaceholder('输入当前密码').fill(password)
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.waitForURL('**/welcome')
  const keyAfterDelete = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('mod-settings:store') || '{}').state?.customKey
  ))
  if (keyAfterDelete !== '') throw new Error('account deletion did not clear the decrypted API Key')
  if (consoleErrors.length > 0) throw new Error(`console errors: ${consoleErrors.join(' | ')}`)
  if (failedResponses.length > 0) throw new Error(`server errors: ${failedResponses.join(' | ')}`)

  console.log(JSON.stringify({
    status: 'pass',
    username,
    verifiedWidths: [320, 390, 768, 1280],
    cloudOverwrite: true,
    manualCloudSlot: true,
    logoutClearedApiKey: true,
    accountDeleted: true,
    consoleErrors,
    failedResponses,
  }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error('[account-cloud-browser] FAIL', error)
  process.exit(1)
})
