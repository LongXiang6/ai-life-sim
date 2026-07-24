const puppeteer = require('puppeteer')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3001'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
// Read the transient test credential only when the caller supplied it; never commit it.
const providedKeyFingerprint = process.env.DEEPSEEK_API_KEY || '__deepseek_test_key_not_configured__'
const worldCode = 202607230002

function seedPage(page) {
  return page.evaluateOnNewDocument((fixtureWorldCode) => {
    localStorage.clear()
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({ version: 4, state: {
      worldConfig: { name: '现代地球', eraName: '公元', eraStartYear: 2000, essenceTag: 'modern', powerSystemTag: 'none',
        powerCeiling: 8, spatialForm: 'plane', civilizationStage: 'modern', difficulty: 'normal', description: 'DeepSeek 全流程真实测试世界。', worldType: 'materialist' },
      entities: [], initialized: true, worldCode: fixtureWorldCode, currentYear: 2000, worldTags: ['现代', '现实'], eraStartYear: 2000, eraName: '公元',
      calibration: null, destinyPatternModifiers: {},
      worldInitAIStatus: { status: 'complete', currentStep: '完成', calibrationGenerated: true, tagsGenerated: true, configGenerated: true,
        entitiesGenerated: true, retryCount: 0, maxRetries: 3, errors: [] },
    } }))
    localStorage.setItem('mod-settings:store', JSON.stringify({ version: 8, state: {
      provider: 'deepseek', customKey: '', customUrl: '', customModel: 'deepseek-v4-flash', temperature: 0.8, topP: 0.8, maxTokens: 4096,
      reasoningEffort: 'disabled', talentThinkingIntensity: 'disabled', aiTalentGeneration: false, preGenerateRounds: 0, storySeed: '20260723-live',
      narrativeStyle: 'default', wordCountTarget: 200, streamingMode: 'off', comfortableParagraphs: true, reduceMotion: true, theme: 'minimal-white',
    }}))
    localStorage.setItem('mod-character:persist:mythic-library', JSON.stringify({ version: 2, state: { patterns: [
      { id: 'live-mythic-1', name: '未熄之诺', concept: '承诺', effect: '重要承诺会留下可追溯的行动方向。', acquiredAt: 1, source: { worldName: '真实测试', characterName: '旧角色' } },
      { id: 'live-mythic-2', name: '回声拾光', concept: '记忆', effect: '重要关系会保留可回到现场的线索。', acquiredAt: 2, source: { worldName: '真实测试', characterName: '旧角色' } },
    ] } }))
  }, worldCode)
}

async function clickText(page, text, selector = 'button') {
  await page.evaluate(({ text: expected, selector: query }) => {
    const node = [...document.querySelectorAll(query)].find((item) => item.textContent?.includes(expected) && !item.disabled)
    if (!node) throw new Error(`未找到可点击控件: ${expected}`)
    node.click()
  }, { text, selector })
}

async function waitForNarrativeCount(page, count, timeout = 240000) {
  await page.waitForFunction((expected) => {
    try {
      const state = JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {}
      return (state.narrativeHistory?.length || 0) >= expected
    } catch { return false }
  }, { timeout }, count)
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const viewportWidth = Number.parseInt(process.env.UI_VIEWPORT_WIDTH || '430', 10)
  const viewportHeight = Number.parseInt(process.env.UI_VIEWPORT_HEIGHT || '932', 10)
  await page.setViewport({
    width: Number.isFinite(viewportWidth) ? viewportWidth : 430,
    height: Number.isFinite(viewportHeight) ? viewportHeight : 932,
  })
  page.setDefaultTimeout(240000)
  page.setDefaultNavigationTimeout(240000)
  const consoleErrors = []
  const proxyRequests = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  // A real DeepSeek key is supplied only to this transient test runner. The
  // page never receives it; interception adds it at the local proxy boundary
  // and the original browser-authored payload remains what we audit below.
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (!request.url().includes('/api/proxy') || request.method() !== 'POST') return request.continue()
    let body = {}
    try { body = JSON.parse(request.postData() || '{}') } catch { /* ignore malformed telemetry */ }
    proxyRequests.push({
      providerId: body.providerId,
      model: body.model,
      promptAsset: String(body.prompt_asset || ''),
      hasClientKey: typeof body.apiKey === 'string' && body.apiKey.length > 0,
      stream: body.stream === true,
    })
    const transientKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (transientKey && body.providerId === 'deepseek' && !body.apiKey) {
      const headers = { ...request.headers() }
      delete headers['content-length']
      return request.continue({
        headers,
        postData: JSON.stringify({ ...body, apiKey: transientKey }),
      })
    }
    return request.continue()
  })
  await seedPage(page)

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#character-name')
  await page.focus('#character-name')
  await page.keyboard.type('DeepSeek实测')
  await clickText(page, '确认角色')
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始抽取') && !button.disabled))
  await clickText(page, '开始抽取')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('进入命格选择') && !button.disabled), { timeout: 60000 })
  await clickText(page, '进入命格选择')
  for (const [slotIndex, patternName] of [[1, '未熄之诺'], [2, '回声拾光']]) {
    await page.click(`button[aria-label^="轮回天赋槽${slotIndex}"]`)
    await page.waitForSelector('#mythic-library-sheet')
    await clickText(page, patternName, '#mythic-library-sheet button')
    await page.waitForSelector('#mythic-library-sheet', { hidden: true })
  }
  await page.waitForSelector('button[aria-label$="选择普通命格"]')
  for (let index = 0; index < 3; index += 1) {
    await page.evaluate(() => document.querySelector('button[aria-label$="选择普通命格"]')?.click())
  }
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认命格') && !button.disabled))
  await clickText(page, '确认命格')
  await page.waitForFunction(() => location.pathname.endsWith('/attribute-alloc'))
  await page.waitForSelector('button[aria-label="增加体魄"]')
  for (let index = 0; index < 15; index += 1) {
    await page.click(`button[aria-label="${index < 10 ? '增加体魄' : '增加心智'}"]`)
  }
  await clickText(page, '确认属性')
  await page.waitForFunction(() => location.pathname.endsWith('/fate-preview'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始人生') && !button.disabled), { timeout: 120000 })
  await clickText(page, '开始人生')
  await page.waitForFunction(() => location.pathname.endsWith('/game-story'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 120000 })

  await clickText(page, '轻触，让岁月流转')
  await waitForNarrativeCount(page, 1)
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {})

  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 240000 })
  await clickText(page, '轻触，让岁月流转')
  await waitForNarrativeCount(page, 2)

  let branchObserved = await page.$('input[type="radio"]') !== null
  let branchResolved = false
  let forcedRoundCount = 2
  if (!branchObserved) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('强制下一轮分支') && !button.disabled)?.click())
    // A complete body may arrive before optional branch META. Keep the body and
    // retry the forced intent a small number of times. A successful background
    // repair presents the branch before the advance button becomes available.
    for (let attempt = 0; attempt < 2 && !branchObserved; attempt += 1) {
      await page.waitForFunction(() => (
        document.querySelector('input[type="radio"]') !== null
        || [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled)
      ), { timeout: 240000 })
      branchObserved = await page.$('input[type="radio"]') !== null
      if (branchObserved) break
      await clickText(page, '轻触，让岁月流转')
      forcedRoundCount += 1
      await waitForNarrativeCount(page, forcedRoundCount, 240000)
      branchObserved = await page.$('input[type="radio"]') !== null
    }
  }
  if (branchObserved) {
    await page.click('input[type="radio"]')
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认选择') && !button.disabled))
    await clickText(page, '确认选择')
    await page.waitForFunction(() => document.body.textContent?.includes('你的选择：'), { timeout: 120000 })
    await waitForNarrativeCount(page, forcedRoundCount + 1, 240000)
    branchResolved = true
  }

  const persisted = await page.evaluate(() => {
    const parse = (key) => JSON.parse(localStorage.getItem(key) || '{}').state || {}
    return {
      character: parse('mod-character:persist:character-state'),
      engine: parse('mod-engine:persist:engine-state'),
      storageValues: Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''),
    }
  })
  const result = {
    provider: 'deepseek', model: 'deepseek-v4-flash',
    viewport: { width: viewportWidth, height: viewportHeight },
    route: await page.evaluate(() => location.pathname),
    proxyRequests,
    mainNarrativeRequests: proxyRequests.filter((request) => request.promptAsset.includes('mod-engine:narrative:')).length,
    branchRepairRequests: proxyRequests.filter((request) => request.promptAsset.includes('narrative-branch-repair')).length,
    narrativeEntries: persisted.engine.narrativeHistory?.length || 0,
    firstNarrativeChars: first.narrativeHistory?.[0]?.text?.length || 0,
    equippedMythicPatterns: persisted.character.equippedMythicPatterns?.length || 0,
    forcedRoundCount,
    branchObserved, branchResolved,
    branchRepairPending: persisted.engine.branchRepairPending === true,
    forceBranchNext: persisted.engine.forceBranchNext === true,
    keySentToBrowserRequest: proxyRequests.some((request) => request.hasClientKey),
    keyPersistedInBrowser: persisted.storageValues.some((value) => value.includes(providedKeyFingerprint)),
    consoleErrors,
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  if (
    result.route !== '/game-story'
    || result.narrativeEntries < 3
    || result.firstNarrativeChars < 20
    || result.equippedMythicPatterns !== 2
    || !result.branchObserved
    || !result.branchResolved
    || result.branchRepairPending
    || result.forceBranchNext
    || result.keySentToBrowserRequest
    || result.keyPersistedInBrowser
    || result.consoleErrors.length > 0
  ) process.exit(1)
}

main().catch((error) => { console.error(error?.stack || error?.message || String(error)); process.exit(1) })
