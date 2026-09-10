/**
 * Purpose: Regress the character-first narrative path in one browser session.
 * Owner: quality:ui
 * Responsibility: One Puppeteer scenario, its fixtures, and ordered UI assertions only.
 */

const fs = require('node:fs')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const configuredChromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const worldCode = 202607180001

const narrativeParagraphs = [
  '雨刚停，你从城南车站走进这座陌生城市。潮湿的柏油路映着清晨的灯牌，你把仅有的行李放在脚边，先记下周围的街道与人声。',
  '旧书店的门铃在风里轻响。店主没有追问你的来历，只把一张招工启事推到柜台边；你读完条件，意识到这份工作既能维持生活，也能让你慢慢认识附近的人。',
  '你收起启事，决定今天先熟悉街区，再在傍晚回来答复。第一步并不宏大，但这座城市已经给了你一个可以继续追寻的方向。',
]

const narrativeResponse = `⟦正文⟧${narrativeParagraphs.join('\n\n')}`
const specialistResponses = {
  'mod-engine:narrative-story-continuity:': JSON.stringify({ 本轮剧情: [], 未来事件: [] }),
  'mod-engine:narrative-talent-growth:': JSON.stringify({ 成长判定: { 需要成长: false } }),
}

function unavailable(message) {
  console.error(`[character-first-narrative-browser] UNAVAILABLE: ${message}`)
  process.exit(2)
}

let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  unavailable('Playwright is not installed. Run the static slice now; use this runner in an existing Playwright-compatible environment without changing project dependencies.')
}

async function waitForEnabled(page, name, timeout = 30000) {
  await page.waitForFunction(
    (buttonName) => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes(buttonName) && !button.disabled),
    name,
    { timeout },
  )
}

async function main() {
  const launchOptions = { headless: true }
  if (fs.existsSync(configuredChromePath)) launchOptions.executablePath = configuredChromePath

  const browser = await chromium.launch(launchOptions)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const consoleErrors = []
  const visitedPaths = []
  let proxyPostCount = 0
  const promptAssets = []
  let managedRequestWithoutClientKey = false

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visitedPaths.push(new URL(frame.url()).pathname)
  })

  await page.route('**/api/proxy**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) })
      return
    }

    proxyPostCount += 1
    const body = request.postDataJSON()
    const promptAsset = String(body.prompt_asset || '')
    promptAssets.push(promptAsset)
    const fixtureResponse = Object.entries(specialistResponses)
      .find(([asset]) => promptAsset.includes(asset))?.[1] ?? narrativeResponse
    if (body.providerId === 'managed' && body.model === 'LongCat-2.0' && body.apiKey === undefined) {
      managedRequestWithoutClientKey = true
    }
    if (body.stream === true) {
      const event = JSON.stringify({ choices: [{ delta: { content: fixtureResponse }, finish_reason: 'stop' }] })
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
        body: `data: ${event}\n\ndata: [DONE]\n\n`,
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: fixtureResponse }, finish_reason: 'stop' }] }),
    })
  })

  await page.addInitScript(({ fixtureWorldCode }) => {
    localStorage.clear()
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({
      version: 5,
      state: {
        worldConfig: {
          name: '现代地球',
          eraName: '公元',
          eraStartYear: 2000,
          essenceTag: 'modern',
          powerSystemTag: 'none',
          powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' },
          spatialForm: 'plane',
          civilizationStage: 'modern',
          difficulty: 'normal',
          description: '用于角色创建到首轮叙事的可重复浏览器夹具。',
          worldType: 'materialist',
        },
        entities: [],
        initialized: true,
        worldCode: fixtureWorldCode,
        currentYear: 2000,
        worldTags: ['现代', '现实'],
        eraStartYear: 2000,
        eraName: '公元',
        calibration: null,
        destinyPatternModifiers: {},
      },
    }))
    localStorage.setItem('mod-settings:store', JSON.stringify({
      version: 11,
      state: {
        provider: 'managed',
        customKey: '',
        customUrl: '',
        customModel: 'LongCat-2.0',
        temperature: 0.8,
        topP: 0.8,
        reasoningEffort: 'disabled',
        talentThinkingIntensity: 'disabled',
        aiTalentGeneration: false,
        storySeed: '20260718',
        narrativeStyle: 'default',
        wordCountTarget: 200,
        streamingMode: 'off',
        comfortableParagraphs: true,
        reduceMotion: true,
      },
    }))
    localStorage.setItem('mod-character:persist:reincarnation-library', JSON.stringify({
      version: 1,
      state: {
        talents: [
          {
            id: 'fixture-mythic-1',
            lineageId: 'fixture-mythic-1',
            version: 1,
            name: '未熄之诺',
            description: '承诺',
            category: 'expression',
            rarity: 'mythic',
            effect: '重要承诺会留下可追溯的行动方向。',
            attrBonus: {},
            strengthenLevel: 1,
            acquiredAt: 1,
            source: { worldName: '夹具世界', characterName: '旧角色' },
          },
          {
            id: 'fixture-mythic-2',
            lineageId: 'fixture-mythic-2',
            version: 1,
            name: '回声拾光',
            description: '记忆',
            category: 'expression',
            rarity: 'mythic',
            effect: '重要关系会保留可回到现场的线索。',
            attrBonus: {},
            strengthenLevel: 1,
            acquiredAt: 2,
            source: { worldName: '夹具世界', characterName: '旧角色' },
          },
        ],
      },
    }))
  }, { fixtureWorldCode: worldCode })

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '塑造角色' }).waitFor()
  await page.getByLabel('角色姓名').fill('林序')
  await page.getByRole('button', { name: /确认角色/ }).click()
  await page.waitForURL('**/talent-draw')

  await page.getByRole('button', { name: /开始抽取/ }).click()
  await waitForEnabled(page, '进入命格选择')
  await page.getByRole('button', { name: /进入命格选择/ }).click()
  await page.getByRole('heading', { name: '选择命格' }).waitFor()

  await page.getByRole('tab', { name: '轮回天赋' }).click()
  await page.getByRole('button', { name: '未熄之诺，选择轮回天赋' }).click()
  await page.getByRole('button', { name: '回声拾光，选择轮回天赋' }).click()

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: /，选择普通命格$/ }).first().evaluate((button) => button.click())
    await page.waitForFunction(
      (count) => document.querySelectorAll('button[aria-pressed="true"][aria-label$="，已选择"]').length === count,
      index + 1,
    )
  }
  await waitForEnabled(page, '确认命格')
  await page.getByRole('button', { name: /确认命格/ }).click()
  await page.waitForURL('**/attribute-alloc')
  await page.getByRole('heading', { name: '属性分配' }).waitFor()

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: '提高体魄' }).click()
  }
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: '提高心智' }).click()
  }
  await page.getByRole('button', { name: /确认属性/ }).click()
  await page.waitForURL('**/fate-preview')

  await waitForEnabled(page, '开始人生')
  await page.getByRole('button', { name: /开始人生/ }).click()
  await page.waitForURL('**/game-story')
  await page.getByRole('heading', { name: '故事进行中' }).waitFor()

  await waitForEnabled(page, '轻触，让岁月流转', 60000)
  await page.getByRole('button', { name: /轻触，让岁月流转/ }).click()
  try {
    await page.getByText(narrativeParagraphs[0], { exact: true }).waitFor({ timeout: 60000 })
  } catch (error) {
    const failedState = await page.evaluate(() => {
      const engine = JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {}
      return {
        narrativeError: engine.narrativeError,
        narrativeEntries: engine.narrativeHistory?.length ?? 0,
        visibleText: document.body.textContent?.slice(-1200),
      }
    })
    console.error(JSON.stringify({ proxyPostCount, promptAssets, consoleErrors, failedState }, null, 2))
    throw error
  }
  for (const paragraph of narrativeParagraphs) {
    await page.getByText(paragraph, { exact: true }).waitFor()
  }
  const requestDeadline = Date.now() + 60000
  while (proxyPostCount < 3 && Date.now() < requestDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const persistedState = await page.evaluate(() => {
    const parse = (key) => JSON.parse(localStorage.getItem(key) || '{}').state || {}
    return {
      character: parse('mod-character:persist:character-state'),
      engine: parse('mod-engine:persist:engine-state'),
    }
  })

  const failures = []
  const expectedRouteOrder = ['/new-game/character-create', '/talent-draw', '/attribute-alloc', '/fate-preview', '/game-story']
  let routeCursor = -1
  for (const expected of expectedRouteOrder) {
    const index = visitedPaths.indexOf(expected, routeCursor + 1)
    if (index < 0) failures.push(`route not observed in order: ${expected}`)
    else routeCursor = index
  }
  if (persistedState.character.name !== '林序') failures.push('character name was not persisted')
  if (!managedRequestWithoutClientKey) failures.push('managed provider request without a browser API key was not observed')
  if (persistedState.character.destinyPatterns?.patterns?.length !== 3) failures.push('three destiny patterns were not persisted')
  if (persistedState.character.equippedReincarnationTalents?.length !== 2) failures.push('two equipped reincarnation talents were not persisted')
  const base = persistedState.character.characterBase?.base ?? {}
  if ([base.physique, base.mind, base.talentAptitude, base.charisma].join(',') !== '10,5,0,0') {
    failures.push(`base attributes were not persisted: ${JSON.stringify(base)}`)
  }
  if ((persistedState.engine.narrativeHistory?.length ?? 0) < 1) failures.push('first narrative was not committed to engine history')
  if (proxyPostCount !== 3) failures.push(`expected one narrative and two post-story proxy POSTs, observed ${proxyPostCount}`)
  if (promptAssets.filter((asset) => asset.includes('mod-engine:narrative:')).length !== 1) failures.push('first narrative prompt asset was not requested exactly once')
  if (promptAssets.filter((asset) => asset.includes('mod-engine:narrative-story-continuity:')).length !== 1) failures.push('story-continuity prompt asset was not requested exactly once')
  if (promptAssets.filter((asset) => asset.includes('mod-engine:narrative-talent-growth:')).length !== 1) failures.push('talent-growth prompt asset was not requested exactly once')
  if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(' | ')}`)

  console.log(JSON.stringify({
    status: failures.length === 0 ? 'pass' : 'fail',
    visitedPaths,
    proxyPostCount,
    promptAssets,
    narrativeParagraphs: narrativeParagraphs.length,
    persistedDestinyPatterns: persistedState.character.destinyPatterns?.patterns?.length ?? 0,
    persistedNarrativeEntries: persistedState.engine.narrativeHistory?.length ?? 0,
    consoleErrors,
    failures,
  }, null, 2))

  await browser.close()
  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('[character-first-narrative-browser] FAIL', error)
  process.exit(1)
})
