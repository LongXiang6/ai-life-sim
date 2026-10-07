/**
 * Purpose: Regress cached AI destiny-pattern handoff and background pool filling.
 * Owner: quality:ui
 * Responsibility: One Playwright scenario, its fixtures, and UI/storage assertions only.
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../../..')
const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const configuredChromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const categoryLabels = {
  action: '行动',
  cognition: '认知',
  expression: '表达',
  stewardship: '经营',
  misc: '杂类',
}

function unavailable(message) {
  console.error(`[talent-draw-cache-browser] UNAVAILABLE: ${message}`)
  process.exit(2)
}

let puppeteer
try {
  puppeteer = require('puppeteer')
} catch {
  unavailable('Puppeteer is not installed.')
}

function readPromptVersion() {
  const source = fs.readFileSync(
    path.join(root, 'src/mods/mod-character/prompts/destiny-pattern-prompt.ts'),
    'utf8',
  )
  const version = source.match(/DESTINY_PATTERN_PROMPT_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1]
  if (!version) unavailable('Unable to read DESTINY_PATTERN_PROMPT_VERSION.')
  return version
}

function createPattern(category, index, promptVersion) {
  const label = categoryLabels[category]
  const id = `ai-cache-${promptVersion}-${category}-${index}`
  return {
    lineageId: id,
    version: 1,
    id,
    name: `${label}初${index + 1}`,
    description: `${label}分类的缓存候选${index + 1}`,
    category,
    rarity: 'common',
    effect: `${label}分类的正向稳定收益${index + 1}`,
    attrBonus: {},
  }
}

function identifyCategory(body) {
  const serialized = JSON.stringify(body.messages ?? [])
  return Object.entries(categoryLabels)
    .find(([, label]) => serialized.includes(`分类：${label}`))?.[0]
}

function createResponse(category, batchIndex) {
  const label = categoryLabels[category]
  const suffixes = ['甲', '乙', '丙', '丁']
  return JSON.stringify({
    天赋: suffixes.map((suffix, index) => ({
      类别: label,
      名称: `${label}${batchIndex}${suffix}`,
      设定描述: `${label}能力在明确条件下提供第${batchIndex}批正向优势。`,
      效果: `满足对应条件时，提高${label}相关行动的稳定性，并保留现实边界。`,
      属性加成: {},
    })),
  })
}

async function readCachedPatterns(page, cacheKey) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.data) ? parsed.data : []
  }, cacheKey)
}

async function main() {
  const promptVersion = readPromptVersion()
  const initialPatterns = Object.keys(categoryLabels).flatMap((category) => (
    Array.from({ length: 4 }, (_, index) => createPattern(category, index, promptVersion))
  ))
  let cacheKey = ''
  const launchOptions = { headless: true }
  if (fs.existsSync(configuredChromePath)) launchOptions.executablePath = configuredChromePath

  launchOptions.args = ['--no-sandbox']
  const browser = await puppeteer.launch(launchOptions)
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844 })
  const requestCounts = Object.fromEntries(Object.keys(categoryLabels).map((category) => [category, 0]))
  const pageErrors = []
  let proxyPostCount = 0

  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (!request.url().includes('/api/proxy')) {
      await request.continue()
      return
    }
    if (request.method() === 'GET') {
      await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) })
      return
    }

    proxyPostCount += 1
    const body = (() => {
      try {
        return JSON.parse(request.postData() || '{}')
      } catch {
        return {}
      }
    })()
    const category = identifyCategory(body)
    if (!category) {
      await request.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'unknown destiny category' }) })
      return
    }
    requestCounts[category] += 1
    const content = createResponse(category, requestCounts[category])
    await request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
    })
  })

  await page.evaluateOnNewDocument((currentPromptVersion) => {
    if (!localStorage.getItem('talent-draw-cache-browser:initialized')) {
      localStorage.clear()
      localStorage.setItem('talent-draw-cache-browser:initialized', '1')
      localStorage.setItem(
        `ai-life-sim:mod-character:cache:destiny-pool:stale-before-${currentPromptVersion}:1`,
        JSON.stringify({ data: [{ id: 'stale-candidate' }], ts: Date.now() }),
      )
      localStorage.setItem('ai-life-sim:mod-pages:config:talent-draw:1', JSON.stringify({
        phase: 'selecting',
        slots: [],
        loadoutSlots: [],
        aiTalentGeneration: true,
      }))
      localStorage.setItem('mod-settings:store', JSON.stringify({
        version: 15,
        state: {
          provider: 'custom',
          customKey: 'fixture-key',
          customUrl: 'https://fixture.invalid/v1',
          customModel: 'LongCat-2.0',
          customModelProfiles: [],
          temperature: 0.8,
          topP: 0.8,
          reasoningEffort: 'disabled',
          talentThinkingIntensity: 'disabled',
          aiTalentGeneration: true,
          preGenerateRounds: 0,
          narrativeStyle: 'default',
          narrativeStyleText: '',
          narrativeStyleVersion: 0,
          narrativeAddressing: 'second-person',
          wordCountTarget: 200,
          streamingMode: 'off',
          comfortableParagraphs: true,
          reduceMotion: true,
        },
      }))
    }

    window.__talentDrawObservation = { drawHeadingSeen: false, selectionHeadingSeen: false }
    const observe = () => {
      if (!location.pathname.endsWith('/talent-draw')) return
      const heading = document.querySelector('#talent-page-title')?.textContent?.trim()
      if (heading === '命格抽取') window.__talentDrawObservation.drawHeadingSeen = true
      if (heading === '选择命格') window.__talentDrawObservation.selectionHeadingSeen = true
    }
    const installObserver = () => {
      if (!document.documentElement) {
        requestAnimationFrame(installObserver)
        return
      }
      new MutationObserver(observe).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      observe()
    }
    installObserver()
    window.addEventListener('popstate', observe)
  }, promptVersion)

  await page.goto(`${baseUrl}/new-game/world-select`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText?.includes('选择世界'))
  const staleCacheResetLabel = '清除该世界命格缓存：现代地球'
  await page.waitForFunction((version) => (
    localStorage.getItem(`ai-life-sim:mod-character:cache:destiny-pool:stale-before-${version}:1`) === null
      && localStorage.getItem('ai-life-sim:mod-pages:config:talent-draw:1') === null
  ), {}, promptVersion)
  const staleCacheButtonSeen = await page.$(`button[aria-label="${staleCacheResetLabel}"]`) !== null
  const staleCacheRemoved = await page.evaluate((version) => (
    localStorage.getItem(`ai-life-sim:mod-character:cache:destiny-pool:stale-before-${version}:1`) === null
  ), promptVersion)
  const staleDrawStateRemoved = await page.evaluate(() => (
    localStorage.getItem('ai-life-sim:mod-pages:config:talent-draw:1') === null
  ))
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')]
    .find((button) => button.textContent?.includes('预设'))?.click())
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('现代地球'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((button) => button.textContent?.includes('确认世界') && !button.disabled))
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('确认世界') && !button.disabled)?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/new-game/character-create'))
  await page.waitForFunction(() => document.querySelector('#character-name') && document.body.innerText?.includes('角色姓名'))
  cacheKey = await page.evaluate(({ version, patterns }) => {
    const worldState = JSON.parse(localStorage.getItem('mod-world:persist:world-state') || '{}').state || {}
    const key = `ai-life-sim:mod-character:cache:destiny-pool:${version}:${worldState.worldCode}`
    localStorage.setItem(key, JSON.stringify({ data: patterns, ts: Date.now() }))
    return key
  }, { version: promptVersion, patterns: initialPatterns })
  await page.focus('#character-name')
  await page.keyboard.type('缓存测试')
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('确认角色') && !button.disabled)?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw'))
  await page.waitForFunction(() => document.querySelector('#talent-page-title')?.textContent?.trim() === '选择命格')

  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    const patterns = JSON.parse(raw)?.data
    if (!Array.isArray(patterns) || patterns.length !== 60) return false
    const categories = ['action', 'cognition', 'expression', 'stewardship', 'misc']
    return categories.every((category) => patterns.filter((pattern) => pattern.category === category).length === 12)
  }, { timeout: 60000 }, cacheKey)

  const observation = await page.evaluate(() => window.__talentDrawObservation)
  const filledPatterns = await readCachedPatterns(page, cacheKey)
  const counts = Object.fromEntries(Object.keys(categoryLabels).map((category) => [
    category,
    filledPatterns.filter((pattern) => pattern.category === category).length,
  ]))
  const postsAfterFill = proxyPostCount

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#talent-page-title')?.textContent?.trim() === '选择命格')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const reloadedObservation = await page.evaluate(() => window.__talentDrawObservation)

  const failures = []
  if (staleCacheButtonSeen) failures.push('old prompt-version cache still exposed the world reset control')
  if (!staleCacheRemoved) failures.push('world reset control did not remove the old prompt-version cache')
  if (!staleDrawStateRemoved) failures.push('AI draw state without a current prompt-version pool was not removed')
  if (!observation.selectionHeadingSeen || observation.drawHeadingSeen) failures.push(`cached entry did not render selection directly: ${JSON.stringify(observation)}`)
  if (filledPatterns.length !== 60) failures.push(`expected 60 cached patterns, observed ${filledPatterns.length}`)
  if (Object.values(counts).some((count) => count !== 12)) failures.push(`category counts did not reach 12: ${JSON.stringify(counts)}`)
  if (postsAfterFill !== 10) failures.push(`expected 10 background requests, observed ${postsAfterFill}`)
  if (Object.values(requestCounts).some((count) => count !== 2)) failures.push(`each category should receive two background requests: ${JSON.stringify(requestCounts)}`)
  if (proxyPostCount !== postsAfterFill) failures.push(`reload triggered unexpected fill requests: ${proxyPostCount - postsAfterFill}`)
  if (reloadedObservation.drawHeadingSeen) failures.push(`reload displayed draw heading: ${JSON.stringify(reloadedObservation)}`)
  if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    status: failures.length === 0 ? 'pass' : 'fail',
    promptVersion,
    staleCacheButtonSeen,
    staleCacheRemoved,
    staleDrawStateRemoved,
    observation,
    reloadedObservation,
    proxyPostCount,
    requestCounts,
    cachedPatternCount: filledPatterns.length,
    categoryCounts: counts,
    pageErrors,
    failures,
  }, null, 2))

  await browser.close()
  if (failures.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('[talent-draw-cache-browser] FAIL', error)
  process.exit(1)
})
