const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')

const baseUrl = process.env.UI_BASE_URL || 'http://127.0.0.1:3000'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const screenshotDir = process.env.UI_SCREENSHOT_DIR

async function clickText(page, text, selector = 'button') {
  await page.waitForFunction(({ expected, query }) => (
    [...document.querySelectorAll(query)].some((node) => node.textContent?.includes(expected) && !node.disabled)
  ), {}, { expected: text, query: selector })
  await page.evaluate(({ expected, query }) => {
    const node = [...document.querySelectorAll(query)].find((item) => item.textContent?.includes(expected) && !item.disabled)
    if (!(node instanceof HTMLElement)) throw new Error(`missing control: ${expected}`)
    node.click()
  }, { expected: text, query: selector })
}

async function fillLabel(page, label, value, index = 0) {
  const handle = await page.evaluateHandle(({ expected, targetIndex }) => {
    const matches = [...document.querySelectorAll('label')].filter((node) => node.textContent?.includes(expected))
    return matches[targetIndex]?.querySelector('input, textarea, select') || null
  }, { expected: label, targetIndex: index })
  const element = handle.asElement()
  if (!element) throw new Error(`missing labelled field: ${label}`)
  await element.click({ clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.keyboard.type(value)
  await handle.dispose()
}

async function assertPage(page, label) {
  const metrics = await page.evaluate(() => ({
    path: location.pathname,
    viewportWidth: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    heading: document.querySelector('h1')?.textContent?.replace(/\s+/gu, ' ').trim() || '',
  }))
  if (metrics.scrollWidth > metrics.viewportWidth + 1) {
    throw new Error(`${label}: horizontal overflow ${metrics.scrollWidth} > ${metrics.viewportWidth}`)
  }
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true })
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`), fullPage: true })
  }
  return metrics
}

async function testWelcomeUtilities(page) {
  await page.goto(`${baseUrl}/welcome`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  const welcome = await assertPage(page, 'welcome')

  await clickText(page, '设置')
  await page.waitForSelector('[role="dialog"]')
  for (const tab of ['模型设置', '模型调用', '个性化']) {
    await clickText(page, tab, '[role="tab"]')
    await page.waitForFunction((expected) => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes(expected), {}, tab)
  }
  const settings = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('[role="tab"]')].map((node) => node.textContent?.trim()),
    dialogInsideViewport: (() => {
      const rect = document.querySelector('[role="dialog"]')?.firstElementChild?.getBoundingClientRect()
      return Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight)
    })(),
  }))
  if (!settings.dialogInsideViewport || settings.tabs.length !== 3) throw new Error(`settings contract failed: ${JSON.stringify(settings)}`)
  await page.click('button[aria-label="关闭设置"]')

  await clickText(page, '游戏说明')
  await page.waitForSelector('[role="dialog"] nav[aria-label="说明章节"]')
  const chapters = await page.$$('[role="dialog"] nav[aria-label="说明章节"] button')
  for (const chapter of chapters) await chapter.click()
  const chapterCount = chapters.length
  await clickText(page, '更新日志', '[role="tab"]')
  const help = await page.evaluate((chaptersBeforeChangelog) => ({
    chapters: chaptersBeforeChangelog,
    changelogVisible: document.querySelector('[role="dialog"]')?.textContent?.includes('更新日志') === true,
  }), chapterCount)
  if (help.chapters === 0 || !help.changelogVisible) throw new Error(`help contract failed: ${JSON.stringify(help)}`)
  await page.click('button[aria-label="关闭说明"]')
  return { welcome, settings, help }
}

async function testWorldSelection(page) {
  await page.goto(`${baseUrl}/new-game/world-select`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('武道割据')))
  const difficultyLabels = []
  for (let index = 0; index < 4; index += 1) {
    const label = await page.$eval('button[aria-label^="切换人生难度"]', (button) => button.textContent?.replace(/\s+/gu, ' ').trim())
    difficultyLabels.push(label)
    await page.click('button[aria-label^="切换人生难度"]')
  }
  if (new Set(difficultyLabels).size !== 4) throw new Error(`difficulty did not cycle: ${difficultyLabels.join(' -> ')}`)

  await clickText(page, '武道割据')
  await page.waitForSelector('button[aria-label*="武道割据"][aria-label*="缓存"]')
  await page.click('button[aria-label*="武道割据"][aria-label*="缓存"]')
  await page.waitForFunction(() => document.body.textContent?.includes('重置「武道割据」的生成内容'))
  await clickText(page, '确认重置')
  await page.waitForFunction(() => !document.querySelector('button[aria-label*="武道割据"][aria-label*="缓存"]'))
  const pageMetrics = await assertPage(page, 'world-select')
  return { difficultyLabels, cacheReset: true, pageMetrics }
}

async function testWorldCustomize(page) {
  await page.goto(`${baseUrl}/new-game/world-customize`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  const groups = await page.$$('[aria-label$="设定方式"]')
  const dialogs = []
  for (let index = 0; index < groups.length; index += 1) {
    await page.evaluate((cardIndex) => {
      const group = [...document.querySelectorAll('[aria-label$="设定方式"]')][cardIndex]
      group?.closest('li')?.scrollIntoView({ block: 'center', behavior: 'instant' })
    }, index)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const modeClicked = await page.evaluate((cardIndex) => {
      const group = [...document.querySelectorAll('[aria-label$="设定方式"]')][cardIndex]
      const button = [...(group?.querySelectorAll('button') || [])].find((node) => node.textContent?.trim() === '选择')
      button?.click()
      return Boolean(button)
    }, index)
    if (!modeClicked) throw new Error(`world customize card ${index + 1}: missing selection mode`)
    await page.waitForFunction((cardIndex) => {
      const group = [...document.querySelectorAll('[aria-label$="设定方式"]')][cardIndex]
      return group?.closest('li')?.querySelector('button[aria-haspopup="listbox"]') !== null
    }, {}, index)
    await page.evaluate((cardIndex) => {
      const group = [...document.querySelectorAll('[aria-label$="设定方式"]')][cardIndex]
      const trigger = group?.closest('li')?.querySelector('button[aria-haspopup="listbox"]')
      if (!(trigger instanceof HTMLElement)) throw new Error(`missing choice trigger: ${cardIndex + 1}`)
      trigger.click()
    }, index)
    await page.waitForSelector('[role="listbox"]')
    const dialog = await page.$eval('[role="listbox"]', (listbox) => {
      const container = listbox.parentElement?.parentElement
      const rect = container?.getBoundingClientRect()
      return {
        label: listbox.getAttribute('aria-label'),
        options: listbox.querySelectorAll('[role="option"]').length,
        describedOptions: [...listbox.querySelectorAll('[role="option"]')].filter((option) => option.querySelector('small')?.textContent?.trim()).length,
        insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
        scrollable: listbox.scrollHeight <= listbox.clientHeight + 1 || getComputedStyle(listbox).overflowY === 'auto',
        rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        viewport: { width: innerWidth, height: innerHeight },
      }
    })
    dialogs.push(dialog)
    if (!dialog.insideViewport || !dialog.scrollable || dialog.options === 0) {
      throw new Error(`world customize dialog ${index + 1}: ${JSON.stringify(dialog)}`)
    }
    if (dialog.label?.includes('力量上限') && dialog.describedOptions !== dialog.options) {
      throw new Error(`power descriptions missing: ${JSON.stringify(dialog)}`)
    }
    await page.click('[role="listbox"] [role="option"]')
  }
  if (groups.length !== 4) throw new Error(`world customize expected 4 dimensions, got ${groups.length}`)
  const summary = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="当前世界规则摘要"]')
    const rect = section?.getBoundingClientRect()
    return {
      visible: Boolean(rect && rect.height > 0),
      contentContained: Boolean(section && section.scrollHeight <= section.clientHeight + 1),
      scrollHeight: section?.scrollHeight,
      clientHeight: section?.clientHeight,
    }
  })
  if (!summary.visible || !summary.contentContained) throw new Error(`world summary clipped: ${JSON.stringify(summary)}`)
  return { dialogs, summary, pageMetrics: await assertPage(page, 'world-customize') }
}

async function testFeedback(page) {
  await page.goto(`${baseUrl}/feedback`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('textarea[placeholder="描述问题或建议"]')
  await page.type('textarea[placeholder="描述问题或建议"]', '全局浏览器自动化测试：验证诊断包和操作日志链。')
  await page.click('input[type="checkbox"]')
  await clickText(page, '提交反馈')
  await page.waitForFunction(() => document.body.textContent?.includes('反馈已完整保存'), { timeout: 120000 })
  const result = await page.evaluate(() => ({
    feedbackId: [...document.querySelectorAll('section strong')].map((node) => node.textContent?.trim()).find((value) => value?.startsWith('FB-')),
    disclosure: document.body.textContent?.includes('近期完整故事') && document.body.textContent?.includes('不包含 API Key、认证信息或设备序列号'),
  }))
  if (!result.feedbackId || !result.disclosure) throw new Error(`feedback contract failed: ${JSON.stringify(result)}`)
  await assertPage(page, 'feedback')
  return result
}

async function testAccount(page) {
  const username = `global_${Date.now()}`
  const password = 'BrowserPass123!'
  await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await clickText(page, '注册账号')
  await fillLabel(page, '账号', username)
  await fillLabel(page, '密码', password)
  await fillLabel(page, '确认密码', password)
  await clickText(page, '注册并同步')
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), { timeout: 120000 }, username)
  await clickText(page, '云存档', '[role="tab"]')
  await page.waitForFunction(() => document.body.textContent?.includes('云端人生'))
  await clickText(page, '个人数据', '[role="tab"]')
  await clickText(page, '生成绑定码')
  await page.waitForFunction(() => document.body.textContent?.includes('/绑定游戏'))
  const qqLinkGenerated = await page.evaluate(() => document.body.textContent?.includes('/绑定游戏') === true)
  await clickText(page, '删除账号')
  await page.type('input[placeholder="输入当前密码"]', password)
  await clickText(page, '确认删除')
  await page.waitForFunction(() => location.pathname.endsWith('/welcome'), { timeout: 120000 })
  return { username, qqLinkGenerated, deleted: true }
}

async function testSaveManager(page) {
  await page.goto(`${baseUrl}/save-manager`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  const metrics = await assertPage(page, 'save-manager')
  await page.click('button[aria-label="返回欢迎页"]')
  await page.waitForFunction(() => location.pathname.endsWith('/welcome'))
  return { ...metrics, returned: true }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844 })
  page.setDefaultTimeout(120000)
  page.setDefaultNavigationTimeout(120000)
  const consoleErrors = []
  const serverErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`) })
  await page.evaluateOnNewDocument(() => {
    localStorage.clear()
    localStorage.setItem('ai-life-sim:disclaimer-accepted', '2.3.0')
    localStorage.setItem('ai-life-sim:mod-character:cache:destiny-pool:2', JSON.stringify({ cached: true }))
    localStorage.setItem('mod-settings:store', JSON.stringify({ version: 8, state: {
      provider: 'managed', customKey: '', customUrl: '', customModel: 'LongCat-2.0', temperature: 0.8,
      topP: 0.8, maxTokens: 4096, reasoningEffort: 'disabled', talentThinkingIntensity: 'disabled',
      aiTalentGeneration: false, preGenerateRounds: 0, storySeed: 'global-user-journey', narrativeStyle: 'default',
      wordCountTarget: 200, streamingMode: 'off', comfortableParagraphs: true, reduceMotion: true, theme: 'minimal-white',
    }}))
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({ version: 6, state: {
      worldConfig: { name: '现代地球', eraName: '公元', eraStartYear: 2000, essenceTag: 'modern', powerSystemTag: 'none',
        powerCeiling: 8, spatialForm: 'plane', civilizationStage: 'modern', difficulty: 'normal',
        description: '2000年的现代世界，科技与互联网正在改变日常生活。', worldType: 'materialist' },
      entities: [], initialized: true, worldCode: 1, currentYear: 2000, worldTags: ['现代', '现实'], eraStartYear: 2000,
      eraName: '公元', calibration: null, destinyPatternModifiers: {},
      worldInitAIStatus: { status: 'complete', currentStep: '完成', calibrationGenerated: true, tagsGenerated: true,
        configGenerated: true, entitiesGenerated: true, retryCount: 0, maxRetries: 3, errors: [] },
    }}))
  })

  const results = {
    welcome: await testWelcomeUtilities(page),
    worldSelect: await testWorldSelection(page),
    worldCustomize: await testWorldCustomize(page),
    feedback: await testFeedback(page),
    account: await testAccount(page),
    saveManager: await testSaveManager(page),
  }
  results.consoleErrors = consoleErrors
  results.serverErrors = serverErrors
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
  if (consoleErrors.length > 0 || serverErrors.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('[global-user-journey-browser] FAIL', error?.stack || error?.message || String(error))
  process.exit(1)
})
