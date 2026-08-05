/**
 * Purpose: Regress the configured DeepSeek-backed browser flow from setup through narrative progress.
 * Owner: quality:ui
 * Responsibility: One credential-aware Puppeteer session and its ordered assertions only.
 */

const puppeteer = require('puppeteer')
const fs = require('node:fs')
const path = require('node:path')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
// Read the transient test credential only when the caller supplied it; never commit it.
const providedKeyFingerprint = process.env.DEEPSEEK_API_KEY || '__deepseek_test_key_not_configured__'
const worldCode = 202607230002
const targetRounds = Number.parseInt(process.env.NARRATIVE_ROUNDS || '20', 10)
const reportPath = process.env.NARRATIVE_REPORT_PATH
  || path.join(process.cwd(), 'reports', `deepseek-${targetRounds}-round-flow.json`)

function seedPage(page) {
  return page.evaluateOnNewDocument((fixtureWorldCode) => {
    // Force the logger's fetch fallback so Puppeteer can inspect the JSON body;
    // a separate persisted-log assertion covers the normal sendBeacon path.
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: () => false,
    })
    if (sessionStorage.getItem('deepseekFullFlowFixtureInitialized') === '1') return
    sessionStorage.setItem('deepseekFullFlowFixtureInitialized', '1')
    localStorage.clear()
    localStorage.setItem('ai-life-sim:disclaimer-accepted', '2.3.0')
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({ version: 4, state: {
      worldConfig: { name: '现代地球', eraName: '公元', eraStartYear: 2000, essenceTag: 'modern', powerSystemTag: 'none',
        powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' }, spatialForm: 'plane', civilizationStage: 'modern', difficulty: 'normal', description: 'DeepSeek 全流程真实测试世界。', worldType: 'materialist' },
      entities: [], initialized: true, worldCode: fixtureWorldCode, currentYear: 2000, worldTags: ['现代', '现实'], eraStartYear: 2000, eraName: '公元',
      calibration: null, destinyPatternModifiers: {},
      worldInitAIStatus: { status: 'complete', currentStep: '完成', calibrationGenerated: true, tagsGenerated: true, configGenerated: true,
        entitiesGenerated: true, retryCount: 0, maxRetries: 3, errors: [] },
    } }))
    localStorage.setItem('mod-settings:store', JSON.stringify({ version: 8, state: {
      provider: 'deepseek', customKey: '', customUrl: '', customModel: 'deepseek-v4-flash', temperature: 0.8, topP: 0.8,
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
      return (state.narrativeHistory?.length || 0) >= expected || Boolean(state.narrativeError)
    } catch { return false }
  }, { timeout }, count)
  const state = await readEngineState(page)
  if (state.narrativeError) {
    throw new Error(`round ${state.totalRounds + 1} failed: ${state.narrativeError}`)
  }
}

async function readEngineState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {})
}

async function waitForNextSimulationControl(page, timeout = 240000) {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('button')]
    const canAdvance = buttons.some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled)
    const canConfirmBranch = buttons.some((button) => button.textContent?.includes('确认选择') && !button.disabled)
    let state = {}
    try { state = JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {} } catch { /* ignore */ }
    return canAdvance || canConfirmBranch || document.querySelector('input[type="radio"]') !== null || Boolean(state.narrativeError)
  }, { timeout })
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
  const proxyRequestIds = []
  const clientActions = []
  const debugLogRequests = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => {
    if (!response.url().includes('/api/proxy') || response.request().method() !== 'POST') return
    const requestId = response.headers()['x-ai-request-id']
    if (requestId) proxyRequestIds.push(requestId)
  })
  // A real DeepSeek key is supplied only to this transient test runner. The
  // page never receives it; interception adds it at the local proxy boundary
  // and the original browser-authored payload remains what we audit below.
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (request.url().includes('/api/log') && request.method() === 'POST') {
      try {
        const body = JSON.parse(request.postData() || '{}')
        if (body.eventType === 'user_action') {
          clientActions.push({ module: body.module, action: body.action, path: body.context?.path })
        }
      } catch { /* ignore malformed diagnostic probes */ }
      return request.continue()
    }
    if (request.url().includes('/api/debug-log') && request.method() === 'POST') {
      try {
        const body = JSON.parse(request.postData() || '{}')
        debugLogRequests.push({
          category: body.category,
          round: body.round,
          requestId: body.requestId || body.meta?.requestId,
          failed: body.meta?.failed === true,
        })
      } catch { /* ignore malformed diagnostic probes */ }
      return request.continue()
    }
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
  await page.waitForSelector('button[aria-label="提高体魄"]')
  for (let index = 0; index < 15; index += 1) {
    await page.click(`button[aria-label="${index < 10 ? '提高体魄' : '提高心智'}"]`)
  }
  await clickText(page, '确认属性')
  await page.waitForFunction(() => location.pathname.endsWith('/fate-preview'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始人生') && !button.disabled), { timeout: 120000 })
  await clickText(page, '开始人生')
  await page.waitForFunction(() => location.pathname.endsWith('/game-story'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 120000 })

  let branchObserved = false
  let branchResolved = false
  let branchObservedCount = 0
  let branchResolvedCount = 0
  let forcedBranchAttempts = 0
  let reloadVerified = false
  let reloadRound = 0
  const roundDurationsMs = []

  while ((await readEngineState(page)).narrativeHistory?.length < targetRounds) {
    await waitForNextSimulationControl(page)
    const before = await readEngineState(page)
    if (before.narrativeError) throw new Error(`round ${before.totalRounds + 1} failed: ${before.narrativeError}`)

    const radio = await page.$('input[type="radio"]')
    const startedAt = Date.now()
    if (radio) {
      branchObserved = true
      branchObservedCount += 1
      await radio.click()
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认选择') && !button.disabled))
      await clickText(page, '确认选择')
      await waitForNarrativeCount(page, before.narrativeHistory.length + 1)
      branchResolved = true
      branchResolvedCount += 1
    } else {
      if (!branchObserved && before.narrativeHistory.length >= 2 && forcedBranchAttempts < 3 && before.forceBranchNext !== true) {
        const toggled = await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('强制下一轮分支') && !item.disabled)
          button?.click()
          return Boolean(button)
        })
        if (toggled) forcedBranchAttempts += 1
      }
      await clickText(page, '轻触，让岁月流转')
      await waitForNarrativeCount(page, before.narrativeHistory.length + 1)
    }
    roundDurationsMs.push(Date.now() - startedAt)

    const after = await readEngineState(page)
    if (!reloadVerified && after.narrativeHistory.length >= Math.min(10, targetRounds)) {
      await waitForNextSimulationControl(page)
      const stableBeforeReload = await readEngineState(page)
      if (await page.$('input[type="radio"]') === null) {
        reloadRound = stableBeforeReload.narrativeHistory.length
        const lifeRunId = stableBeforeReload.lifeRunId
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction((expectedRounds, expectedLifeRunId) => {
          try {
            const state = JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {}
            return state.narrativeHistory?.length === expectedRounds && state.lifeRunId === expectedLifeRunId
          } catch { return false }
        }, { timeout: 120000 }, reloadRound, lifeRunId)
        await waitForNextSimulationControl(page)
        reloadVerified = true
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 2500))

  const persisted = await page.evaluate(() => {
    const parse = (key) => JSON.parse(localStorage.getItem(key) || '{}').state || {}
    return {
      character: parse('mod-character:persist:character-state'),
      engine: parse('mod-engine:persist:engine-state'),
      storageValues: Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''),
    }
  })
  const narrativeRounds = (persisted.engine.narrativeHistory || []).map((entry, index) => ({
    round: entry.repetitionMetric?.round || index + 1,
    displayAge: entry.displayAge,
    displayTimeLabel: entry.displayTimeLabel,
    totalDays: entry.totalDays,
    chars: entry.text?.length || 0,
    firstLine: String(entry.text || '').split(/\r?\n/u).find((line) => line.trim())?.trim() || '',
    text: entry.text,
    branchPoint: entry.isBranchPoint === true,
    branchResolved: entry.resolvedChoice !== undefined,
    repetition: entry.repetitionMetric,
  }))
  const normalizedOpenings = narrativeRounds.map((entry) => entry.firstLine.replace(/[，。！？].*$/u, '').slice(0, 18))
  const repeatedOpeningCount = normalizedOpenings.length - new Set(normalizedOpenings).size
  const mainDebugLogs = debugLogRequests.filter((entry) => entry.category === 'narrative-rounds')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    targetRounds,
    reloadRound,
    storyRepetitionStats: persisted.engine.storyRepetitionStats,
    rounds: narrativeRounds,
  }, null, 2))
  const result = {
    provider: 'deepseek', model: 'deepseek-v4-flash',
    targetRounds,
    viewport: { width: viewportWidth, height: viewportHeight },
    route: await page.evaluate(() => location.pathname),
    proxyRequestCount: proxyRequests.length,
    mainNarrativeRequests: proxyRequests.filter((request) => request.promptAsset.includes('mod-engine:narrative:')).length,
    dataAnalysisRequests: proxyRequests.filter((request) => request.promptAsset.includes('mod-engine:narrative-data-analysis:')).length,
    basicAttributeRequests: proxyRequests.filter((request) => request.promptAsset.includes('mod-engine:narrative-basic-attribute-analysis:')).length,
    eventRecognitionRequests: proxyRequests.filter((request) => request.promptAsset.includes('mod-engine:narrative-event-recognition:')).length,
    narrativeEntries: persisted.engine.narrativeHistory?.length || 0,
    incompleteNarrativeRounds: narrativeRounds.filter((entry) => entry.chars < 20).map((entry) => entry.round),
    missingRepetitionMetricRounds: narrativeRounds.filter((entry) => !entry.repetition).map((entry) => entry.round),
    repeatedOpeningCount,
    highRepeatRounds: narrativeRounds.filter((entry) => entry.repetition?.qualityLevel === 'high').map((entry) => entry.round),
    repetitionSummary: persisted.engine.storyRepetitionStats,
    roundDurationsMs,
    equippedMythicPatterns: persisted.character.equippedMythicPatterns?.length || 0,
    forcedBranchAttempts,
    branchObserved, branchResolved, branchObservedCount, branchResolvedCount,
    forceBranchNext: persisted.engine.forceBranchNext === true,
    reloadVerified,
    reloadRound,
    lastAutoSaveRound: persisted.engine.lastAutoSaveRound,
    proxyRequestIds: proxyRequestIds.length,
    uniqueProxyRequestIds: new Set(proxyRequestIds).size,
    mainDebugLogs: mainDebugLogs.length,
    debugLogsWithRequestId: mainDebugLogs.filter((entry) => entry.requestId).length,
    capturedUserActions: clientActions.length,
    capturedRoundCompletions: clientActions.filter((entry) => entry.action === 'round-advance-completed').length,
    capturedControlActivations: clientActions.filter((entry) => entry.action === 'control-activated').length,
    actionPaths: [...new Set(clientActions.map((entry) => entry.path).filter(Boolean))],
    keySentToBrowserRequest: proxyRequests.some((request) => request.hasClientKey),
    keyPersistedInBrowser: persisted.storageValues.some((value) => value.includes(providedKeyFingerprint)),
    reportPath,
    consoleErrors,
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  if (
    result.route !== '/game-story'
    || result.narrativeEntries !== targetRounds
    || result.incompleteNarrativeRounds.length > 0
    || result.missingRepetitionMetricRounds.length > 0
    || result.highRepeatRounds.length > 0
    || result.equippedMythicPatterns !== 2
    || !result.branchObserved
    || !result.branchResolved
    || result.mainNarrativeRequests < targetRounds
    || result.dataAnalysisRequests < targetRounds
    || result.basicAttributeRequests < targetRounds
    || result.eventRecognitionRequests < targetRounds
    || result.forceBranchNext
    || !result.reloadVerified
    || result.lastAutoSaveRound < targetRounds
    || result.proxyRequestIds === 0
    || result.uniqueProxyRequestIds !== result.proxyRequestIds
    || result.mainDebugLogs < targetRounds
    || result.debugLogsWithRequestId < targetRounds
    || result.capturedRoundCompletions < targetRounds
    || result.capturedControlActivations === 0
    || result.keySentToBrowserRequest
    || result.keyPersistedInBrowser
    || result.consoleErrors.length > 0
  ) process.exit(1)
}

main().catch((error) => { console.error(error?.stack || error?.message || String(error)); process.exit(1) })
