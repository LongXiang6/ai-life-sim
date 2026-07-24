const puppeteer = require('puppeteer')
const fs = require('node:fs')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const worldCode = 202607230001
const firstParagraphs = [
  '城门外的风压过旷野，你握住那枚家族留下的印记，知道今天必须决定它将被交给谁。',
  '印记的纹路在掌心发热，旧盟约与新道路同时向你敞开，任何一个选择都会改变往后的生活。',
]
const secondParagraphs = [
  '你把印记交给了守约者。新的同盟从这一刻开始，往后的每一步都将留下清晰的回声。',
]
const branchMeta = {
  重要程度: '高',
  关键事件: [{ 内容: '家族印记引发不可逆的长期抉择', 重要度: 95, 涉及实体: ['家族印记', '守约者'] }],
  情节状态: '开始',
  语义信号: {
    事件类型: '冲突',
    冲突强度: 72,
    张力变化: 12,
    行动规模: '大',
    不可逆: true,
    影响范围: '个人',
    叙事语域: '命运',
    语域理由: '家族印记的归属会永久改变角色的长期关系与身份轨迹',
    情节类型: '任务',
  },
  命运分支: true,
  分支标题: '你愿意让这份印记指向哪条道路？',
  分支选项: ['交给守约者，承担旧盟约的责任', '带走印记，独自寻找新的道路'],
}

function envelope(paragraphs, summary, metadata) {
  return `⟦正文⟧\n${paragraphs.join('\n\n')}\n⟦摘要⟧\n${summary}\n⟦数据⟧\n${JSON.stringify(metadata)}\n⟦结束⟧`
}

const responses = [
  envelope(firstParagraphs, '家族印记带来一项不可逆的长期抉择。', branchMeta),
  envelope(secondParagraphs, '你选择守约者，新的同盟已经建立。', {
    重要程度: '普通',
    关键事件: [{ 内容: '你将印记交给守约者并建立新的同盟', 重要度: 72, 涉及实体: ['守约者'] }],
    情节状态: '进行中',
    语义信号: {
      事件类型: '关系',
      冲突强度: 20,
      张力变化: 4,
      行动规模: '个人',
      不可逆: false,
      影响范围: '个人',
      叙事语域: '生活',
      语域理由: '新同盟进入日常相处阶段',
      情节类型: '人生阶段',
    },
  }),
]

function seedPage(page) {
  return page.evaluateOnNewDocument((fixtureWorldCode) => {
    localStorage.clear()
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({
      version: 4,
      state: {
        worldConfig: {
          name: '现代地球', eraName: '公元', eraStartYear: 2000, essenceTag: 'modern',
          powerSystemTag: 'none', powerCeiling: 8, spatialForm: 'plane', civilizationStage: 'modern',
          difficulty: 'normal', description: '分支按钮真实链路夹具。', worldType: 'materialist',
        },
        entities: [], initialized: true, worldCode: fixtureWorldCode, currentYear: 2000,
        worldTags: ['现代', '现实'], eraStartYear: 2000, eraName: '公元', calibration: null,
        destinyPatternModifiers: {},
        worldInitAIStatus: { status: 'complete', currentStep: '完成', calibrationGenerated: true,
          tagsGenerated: true, configGenerated: true, entitiesGenerated: true, retryCount: 0, maxRetries: 3, errors: [] },
      },
    }))
    localStorage.setItem('mod-settings:store', JSON.stringify({ version: 7, state: {
      provider: 'managed', customKey: '', customUrl: '', customModel: 'LongCat-2.0', temperature: 0.8,
      topP: 0.8, maxTokens: 4096, reasoningEffort: 'disabled', talentThinkingIntensity: 'disabled',
      aiTalentGeneration: false, preGenerateRounds: 0, storySeed: '20260723', narrativeStyle: 'default',
      wordCountTarget: 200, streamingMode: 'off', comfortableParagraphs: true, reduceMotion: true, theme: 'minimal-white',
    }}))
    localStorage.setItem('mod-character:persist:mythic-library', JSON.stringify({ version: 2, state: { patterns: [
      { id: 'fixture-mythic-1', name: '未熄之诺', concept: '承诺', effect: '重要承诺会留下可追溯的行动方向。', acquiredAt: 1, source: { worldName: '夹具世界', characterName: '旧角色' } },
      { id: 'fixture-mythic-2', name: '回声拾光', concept: '记忆', effect: '重要关系会保留可回到现场的线索。', acquiredAt: 2, source: { worldName: '夹具世界', characterName: '旧角色' } },
    ] } }))
  }, worldCode)
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const viewportWidth = Number.parseInt(process.env.UI_VIEWPORT_WIDTH || '1280', 10)
  const viewportHeight = Number.parseInt(process.env.UI_VIEWPORT_HEIGHT || '932', 10)
  await page.setViewport({ width: Number.isFinite(viewportWidth) ? viewportWidth : 1280, height: Number.isFinite(viewportHeight) ? viewportHeight : 932 })
  const consoleErrors = []
  const requests = []
  let responseIndex = 0
  const screenshotDir = process.env.UI_SCREENSHOT_DIR
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true })
  const capture = async (name) => {
    if (screenshotDir) await page.screenshot({ path: require('node:path').join(screenshotDir, `${viewportWidth}-${name}.png`), fullPage: true })
  }
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (!request.url().includes('/api/proxy')) return request.continue()
    if (request.method() === 'GET') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) })
    const body = (() => { try { return JSON.parse(request.postData() || '{}') } catch { return {} } })()
    requests.push(body)
    const content = responses[Math.min(responseIndex++, responses.length - 1)]
    if (body.stream) {
      const event = JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })
      return request.respond({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, body: `data: ${event}\n\ndata: [DONE]\n\n` })
    }
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) })
  })
  await seedPage(page)

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await capture('character')
  await page.focus('#character-name')
  await page.keyboard.type('分支测试')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认角色'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw'))
  await capture('draw-idle')
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始抽取') && !button.disabled))
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始抽取') && !button.disabled)?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('进入命格选择') && !button.disabled))
  await capture('draw-ready')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('进入命格选择'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw') && document.body.textContent?.includes('选择命格'))
  for (const [slotIndex, name] of [[1, '未熄之诺'], [2, '回声拾光']]) {
    await page.click(`button[aria-label^="转世天赋槽${slotIndex}"]`)
    await page.waitForSelector('#mythic-library-sheet')
    await page.evaluate((patternName) => [...document.querySelectorAll('#mythic-library-sheet button')].find((button) => button.textContent?.includes(patternName))?.click(), name)
    await page.waitForSelector('#mythic-library-sheet', { hidden: true })
  }
  for (let index = 0; index < 3; index += 1) {
    await page.waitForSelector('button[aria-label$="选择普通命格"]')
    await page.evaluate(() => document.querySelector('button[aria-label$="选择普通命格"]')?.click())
  }
  await capture('selection-filled')
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认命格') && !button.disabled))
  } catch (error) {
    console.error('DESTINY_CONFIRM_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-3000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled, title: button.title })) })))
    throw error
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认命格'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/attribute-alloc'))
  await page.waitForSelector('button[aria-label="增加体魄"]')
  await capture('attribute')
  for (let i = 0; i < 15; i += 1) {
    const label = i < 10 ? '增加体魄' : '增加心智'
    await page.click(`button[aria-label="${label}"]`)
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认属性'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/fate-preview'))
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始人生') && !button.disabled), { timeout: 60000 })
  } catch (error) {
    console.error('FATE_PREVIEW_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-4000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled, title: button.title })) })))
    throw error
  }
  await capture('preview')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始人生'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/game-story'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 60000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('轻触，让岁月流转'))?.click())
  try {
    await page.waitForFunction((paragraph) => document.body.textContent?.includes(paragraph), { timeout: 60000 }, firstParagraphs[0])
  } catch (error) {
    console.error('NARRATIVE_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-5000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled })) })))
    throw error
  }
  const option = await page.$('input[type="radio"]')
  if (!option) throw new Error('branch radio was not rendered')
  await option.click()
  const selectedAfterClick = await page.$eval('input[type="radio"]', (node) => node.checked)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认选择') && !button.disabled), { timeout: 60000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认选择'))?.click())
  await page.waitForFunction(() => !document.body.textContent?.includes('确认选择') || document.body.textContent?.includes('你的选择：'), { timeout: 60000 })
  await page.waitForFunction(() => {
    try {
      const state = JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {}
      return (state.narrativeHistory?.length || 0) >= 2
    } catch {
      return false
    }
  }, { timeout: 60000 })
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {})
  const result = {
    selectedAfterClick,
    requestCount: requests.length,
    requestChoices: requests.map((request) => request.messages?.map((message) => message.content).join('\n').includes('交给守约者')),
    resolvedChoice: stored.narrativeHistory?.[0]?.resolvedChoice,
    narrativeEntries: stored.narrativeHistory?.length,
    consoleErrors,
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  if (!selectedAfterClick || result.resolvedChoice !== '交给守约者，承担旧盟约的责任' || result.requestCount < 2 || result.consoleErrors.length > 0) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
