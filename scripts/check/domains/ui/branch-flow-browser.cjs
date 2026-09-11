/**
 * Purpose: Regress the complete browser branch-selection and continuation flow.
 * Owner: quality:ui
 * Responsibility: One Puppeteer session, its fixtures, and ordered UI assertions only.
 */

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
const thirdParagraphs = [
  '新盟约稳定下来后，两条通往不同人生的道路同时摆在你面前，你需要亲自决定下一步。',
]
function narrativeResponse(paragraphs, branch) {
  return `⟦正文⟧${paragraphs.join('\n\n')}${branch ? `\n\n⟦分支⟧${JSON.stringify(branch)}` : ''}`
}

const storyContinuityResponse = JSON.stringify({ 本轮剧情: [], 未来事件: [] })
const talentGrowthResponse = JSON.stringify({ 成长判定: { 需要成长: false } })
const eventLibraryResponse = JSON.stringify({ 候选事件: [] })

const narrativeResponses = [
  narrativeResponse(firstParagraphs),
  narrativeResponse(secondParagraphs),
  narrativeResponse(thirdParagraphs, {
    标题: '选择新的道路',
    选项: ['留在此地巩固同盟', '前往远方追寻线索'],
  }),
]
const useUnavailableApiFixture = process.env.UNAVAILABLE_API_FIXTURE === '1'
const useLongCustomNameFixture = process.env.LONG_CUSTOM_NAME_FIXTURE === '1'
const customChoiceFixture = '把印记交给守约者前，先请守约者说明旧盟约的代价'

function seedPage(page) {
  return page.evaluateOnNewDocument((fixtureWorldCode) => {
    localStorage.clear()
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({
      version: 5,
      state: {
        worldConfig: {
          name: '现代地球', eraName: '公元', eraStartYear: 2000, essenceTag: 'modern',
          powerSystemTag: 'none', powerFramework: { id: 'fixture:power', label: '无超常力量体系', enabled: false, progression: 'bounded', ranks: [], source: 'world-default' }, spatialForm: 'plane', civilizationStage: 'modern',
          difficulty: 'normal', description: '分支按钮真实链路夹具。', worldType: 'materialist',
        },
        entities: [], initialized: true, worldCode: fixtureWorldCode, currentYear: 2000,
        worldTags: ['现代', '现实'], eraStartYear: 2000, eraName: '公元', calibration: null,
        destinyPatternModifiers: {},
      },
    }))
    localStorage.setItem('mod-settings:store', JSON.stringify({ version: 11, state: {
      provider: 'managed', customKey: '', customUrl: '', customModel: 'LongCat-2.0', temperature: 0.8,
      topP: 0.8, reasoningEffort: 'disabled', talentThinkingIntensity: 'disabled',
      aiTalentGeneration: false, storySeed: '20260723', narrativeStyle: 'default',
      wordCountTarget: 200, streamingMode: 'off', comfortableParagraphs: true, reduceMotion: true,
    }}))
    localStorage.setItem('mod-character:persist:reincarnation-library', JSON.stringify({ version: 1, state: { talents: [
      { id: 'fixture-mythic-1', lineageId: 'fixture-mythic-1', version: 1, name: '未熄之诺', description: '承诺', category: 'expression', rarity: 'mythic', effect: '重要承诺会留下可追溯的行动方向。', attrBonus: {}, strengthenLevel: 1, acquiredAt: 1, source: { worldName: '夹具世界', characterName: '旧角色' } },
      { id: 'fixture-mythic-2', lineageId: 'fixture-mythic-2', version: 1, name: '回声拾光', description: '记忆', category: 'cognition', rarity: 'mythic', effect: '重要关系会保留可回到现场的线索。', attrBonus: {}, strengthenLevel: 1, acquiredAt: 2, source: { worldName: '夹具世界', characterName: '旧角色' } },
    ] } }))
  }, worldCode)
}

async function assertCreationUiContract(page, expected) {
  const result = await page.evaluate((contract) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const runningHead = [...document.querySelectorAll('header, [data-flow-running-head], [class*="meta"], [class*="runningHead"]')]
      .map((node) => node.textContent || '')
      .find((value) => value.includes(contract.header)) || ''
    const titleMark = [...document.querySelectorAll('[class*="titleMark"]')]
      .find((node) => visible(node))?.textContent?.trim() || ''
    const nextNumber = [...document.querySelectorAll('[data-step], [class*="nextNumber"], [class*="confirmNumber"]')]
      .find((node) => visible(node))?.getAttribute('data-step') || ''
    const bottom = [...document.querySelectorAll('nav, footer, [class*="bar"]')]
      .find((node) => visible(node) && (node.getAttribute('aria-label')?.includes('操作') || node.querySelector('[class*="nextButton"], [class*="confirmButton"]')))
    const bottomRect = bottom?.getBoundingClientRect()
    const maxRight = [...document.querySelectorAll('body *')].reduce((max, node) => {
      if (!(node instanceof HTMLElement)) return max
      const rect = node.getBoundingClientRect()
      return Math.max(max, rect.right)
    }, 0)
    const primary = [...document.querySelectorAll('button')].find((node) => visible(node) && (
      node.textContent?.includes(contract.primaryText)
      || node.getAttribute('aria-label')?.includes(contract.primaryText)
    ))
    const primaryRect = primary?.getBoundingClientRect()
    const candidateCards = [...document.querySelectorAll('[aria-label="普通命格候选"] > button')]
    const candidateRects = candidateCards.map((card) => card.getBoundingClientRect())
    const candidateCardsContained = candidateCards.every((card, index) => {
      const cardRect = candidateRects[index]
      const maxChildBottom = [...card.querySelectorAll('*')].reduce((max, child) => {
        if (!(child instanceof HTMLElement)) return max
        return Math.max(max, child.getBoundingClientRect().bottom)
      }, cardRect.top)
      return card.scrollHeight <= card.clientHeight + 1 && maxChildBottom <= cardRect.bottom + 1
    })
    const candidateCardsSeparated = candidateRects.every((rect, index) => (
      index === candidateRects.length - 1 || rect.bottom <= candidateRects[index + 1].top + 1
    ))
    const checks = {
      header: runningHead.includes(contract.header),
      titleMark: !contract.titleMark || titleMark === contract.titleMark,
      nextNumber: !contract.nextNumber || nextNumber === contract.nextNumber,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1 && maxRight <= window.innerWidth + 1,
      bottomVisible: Boolean(bottomRect && bottomRect.bottom >= 0 && bottomRect.top <= window.innerHeight),
      primaryTouchTarget: !contract.primaryText || Boolean(primaryRect && primaryRect.width >= 32 && primaryRect.height >= 32),
      ...(contract.candidates === undefined ? {} : {
        candidates: candidateCards.length === contract.candidates,
        candidateCardsContained,
        candidateCardsSeparated,
      }),
      ...(contract.loadoutSlots === undefined ? {} : { loadoutSlots: document.querySelectorAll('[aria-label^="移除普通命格："], [aria-label^="移除轮回天赋："]').length === contract.loadoutSlots }),
      ...(contract.attributeRows === undefined ? {} : { attributeRows: ['体魄', '心智', '悟性', '魅力'].every((name) => document.querySelector(`button[aria-label="提高${name}"]`)) }),
      ...(contract.includes === undefined ? {} : { includes: contract.includes.every((value) => (document.body.innerText || '').includes(value)) }),
    }
    return {
      checks,
      details: {
        runningHead,
        titleMark,
        nextNumber,
        scrollWidth: document.documentElement.scrollWidth,
        maxRight,
        viewport: window.innerWidth,
        candidateHeights: candidateRects.map((rect) => Math.round(rect.height)),
      },
    }
  }, expected)
  const failed = Object.entries(result.checks).filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length > 0) {
    throw new Error(`creation UI contract failed (${failed.join(', ')}): ${JSON.stringify(result.details)}`)
  }
  return result.details
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const viewportWidth = Number.parseInt(process.env.UI_VIEWPORT_WIDTH || '1280', 10)
  const viewportHeight = Number.parseInt(process.env.UI_VIEWPORT_HEIGHT || '932', 10)
  await page.setViewport({ width: Number.isFinite(viewportWidth) ? viewportWidth : 1280, height: Number.isFinite(viewportHeight) ? viewportHeight : 932 })
  const consoleErrors = []
  const nativeDialogs = []
  const requests = []
  let narrativeResponseIndex = 0
  const screenshotDir = process.env.UI_SCREENSHOT_DIR
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true })
  const capture = async (name) => {
    if (screenshotDir) await page.screenshot({ path: require('node:path').join(screenshotDir, `${viewportWidth}-${name}.png`), fullPage: true })
  }
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message())
    await dialog.dismiss()
  })
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (!request.url().includes('/api/proxy')) return request.continue()
    if (request.method() === 'GET') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: !useUnavailableApiFixture }) })
    const body = (() => { try { return JSON.parse(request.postData() || '{}') } catch { return {} } })()
    requests.push(body)
    const promptAsset = String(body.prompt_asset || '')
    let content
    if (promptAsset.includes('mod-engine:narrative-story-continuity:')) {
      content = storyContinuityResponse
    } else if (promptAsset.includes('mod-engine:narrative-talent-growth:')) {
      content = talentGrowthResponse
    } else if (promptAsset.includes('mod-engine:narrative-event-library:')) {
      content = eventLibraryResponse
    } else {
      content = narrativeResponses[Math.min(narrativeResponseIndex++, narrativeResponses.length - 1)]
    }
    if (body.stream) {
      const event = JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })
      return request.respond({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, body: `data: ${event}\n\ndata: [DONE]\n\n` })
    }
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) })
  })
  await seedPage(page)

  await page.goto(`${baseUrl}/new-game/world-select`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await page.waitForFunction(() => (
    document.body.innerText?.includes('选择世界')
      && document.body.innerText?.includes('预设世界')
      && document.body.innerText?.includes('确认世界')
  ))
  await assertCreationUiContract(page, {
    header: '01 / 07', nextNumber: '02', primaryText: '确认世界',
    includes: ['选择世界', '已保存', '预设世界', '自定义', '普通'],
  })
  await capture('world-select')

  if (useLongCustomNameFixture) {
    const longName = '世'.repeat(120)
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent?.includes('自定义'))?.click())
    await page.waitForSelector('input[placeholder^="世界名称"]')
    await page.type('input[placeholder^="世界名称"]', longName)
    const result = await page.$eval('input[placeholder^="世界名称"]', (input) => ({
      valueLength: input.value.length,
      maxLength: input.getAttribute('maxlength'),
      countRendered: document.body.textContent?.includes(`${input.value.length} 字`) === true,
    }))
    console.log(JSON.stringify(result, null, 2))
    await browser.close()
    if (result.valueLength !== longName.length || result.maxLength !== null || !result.countRendered || nativeDialogs.length > 0 || consoleErrors.length > 0) process.exit(1)
    return
  }

  if (useUnavailableApiFixture) {
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent?.includes('预设'))?.click())
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('现代地球'))?.click())
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认世界') && !button.disabled))
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认世界') && !button.disabled)?.click())
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('当前主叙事模型不可用'))
    const result = {
      route: await page.evaluate(() => location.pathname),
      inlineError: await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent || ''),
      nativeDialogs,
      consoleErrors,
    }
    console.log(JSON.stringify(result, null, 2))
    await browser.close()
    if (!result.route.endsWith('/world-select') || !result.inlineError.includes('当前主叙事模型不可用') || nativeDialogs.length > 0 || consoleErrors.length > 0) process.exit(1)
    return
  }

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent?.includes('预设'))?.click())
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('现代地球'))?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认世界') && !button.disabled))
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认世界') && !button.disabled)?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/new-game/character-create'))
  await page.waitForSelector('[data-flow-running-head]')
  await page.waitForFunction(() => (
    document.body.innerText?.includes('角色姓名')
      && document.body.innerText?.includes('确认角色')
  ))
  await assertCreationUiContract(page, {
    header: '02 / 07', nextNumber: '03', primaryText: '确认角色',
    includes: ['角色姓名'],
  })
  await capture('character')
  await page.focus('#character-name')
  await page.keyboard.type('分支测试')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认角色'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始抽取') && !button.disabled))
  await assertCreationUiContract(page, { header: '03 / 07', nextNumber: '04', primaryText: '开始抽取', includes: ['命格抽取'] })
  await capture('draw-idle')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始抽取') && !button.disabled)?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('进入命格选择') && !button.disabled))
  await assertCreationUiContract(page, { header: '03 / 07', nextNumber: '04', primaryText: '进入命格选择', includes: ['五类首批命印', '20 / 20'] })
  await capture('draw-ready')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('进入命格选择'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw') && document.body.textContent?.includes('选择命格'))
  await page.evaluate(() => [...document.querySelectorAll('button[role="tab"]')].find((button) => button.textContent?.includes('轮回天赋'))?.click())
  for (const name of ['未熄之诺', '回声拾光']) {
    await page.waitForSelector('button[aria-label$="选择轮回天赋"]')
    await page.evaluate((patternName) => [...document.querySelectorAll('button[aria-label$="选择轮回天赋"]')].find((button) => button.textContent?.includes(patternName))?.click(), name)
  }
  await page.evaluate(() => [...document.querySelectorAll('button[role="tab"]')].find((button) => button.textContent?.trim() === '行动')?.click())
  for (let index = 0; index < 2; index += 1) {
    await page.waitForSelector('button[aria-label$="选择普通命格"]')
    await page.evaluate(() => document.querySelector('button[aria-label$="选择普通命格"]')?.click())
  }
  await assertCreationUiContract(page, {
    header: '04 / 07', nextNumber: '05', primaryText: '确认命格',
    loadoutSlots: 4, includes: ['轮回天赋', '携带命格', '4 / 4'],
  })
  await capture('selection-filled')
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认命格') && !button.disabled))
  } catch (error) {
    console.error('DESTINY_CONFIRM_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-3000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled, title: button.title })) })))
    throw error
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认命格'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/attribute-alloc'))
  await page.waitForSelector('button[aria-label="提高体魄"]')
  await assertCreationUiContract(page, { header: '05 / 07', nextNumber: '06', primaryText: '确认属性', attributeRows: 4, includes: ['/ 4', '四项基础属性'] })
  await capture('attribute')
  for (let i = 0; i < 4; i += 1) {
    const label = i < 2 ? '提高体魄' : '提高心智'
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
  await assertCreationUiContract(page, { header: '06 / 07', primaryText: '开始人生', includes: ['核对命书', '此界此身', '根基既定', '同因同果'] })
  await capture('preview')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始人生'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/game-story'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 60000 })
  await page.click('button[aria-label="请求下一轮命运分叉"]')
  await page.waitForFunction(() => document.body.textContent?.includes('已请求命运分叉'))
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('轻触，让岁月流转'))?.click())
  try {
    await page.waitForFunction((paragraph) => document.body.textContent?.includes(paragraph), { timeout: 60000 }, firstParagraphs[0])
  } catch (error) {
    console.error('NARRATIVE_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-5000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled })) })))
    throw error
  }
  // 即使 AI 未返回分支，强制分叉也必须提交一个仅含自定义输入的分叉点。
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('写下自己的做法')))
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('写下自己的做法'))?.click())
  await page.waitForSelector('textarea[placeholder="写下你的做法……"]', { timeout: 60000 })
  const radioCount = await page.$$eval('input[type="radio"]', (nodes) => nodes.length)
  if (radioCount !== 0) throw new Error(`forced custom-only branch unexpectedly rendered ${radioCount} radio options`)
  await page.focus('textarea[placeholder="写下你的做法……"]')
  await page.keyboard.type(customChoiceFixture)
  const selectedAfterClick = await page.$eval('textarea[placeholder="写下你的做法……"]', (node) => node.value)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认写下做法') && !button.disabled), { timeout: 60000 })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认写下做法'))?.click())
  await page.waitForFunction(() => !document.body.textContent?.includes('确认写下做法') || document.body.textContent?.includes('你的选择：'), { timeout: 60000 })
  await page.waitForFunction(() => {
    try {
      const state = JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {}
      return (state.narrativeHistory?.length || 0) >= 2
    } catch {
      return false
    }
  }, { timeout: 60000 })
  const requestDeadline = Date.now() + 60000
  while (requests.length < 6 && Date.now() < requestDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mod-engine:persist:engine-state') || '{}').state || {})
  await page.click('button[aria-label="展开当前信息"]')
  await page.waitForFunction(() => (
    document.body.textContent?.includes('叙事重复观测 · 近五轮')
    && document.querySelector('[aria-label="当前信息"]')?.textContent?.includes('第 2 轮')
  ))
  const repetitionRoundsText = await page.$eval(
    '[aria-label="当前信息"]',
    (node) => node.textContent || '',
  )
  await capture('information-panel-top')
  const informationPanel = await page.$eval('[aria-label="当前信息"]', (panel) => {
    const labels = ['手动存档', '反馈与建议', '返回主界面']
    const actionButtons = labels.map((label) => (
      [...panel.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)
    ))
    const actionGroup = actionButtons[0]?.parentElement
    const ledger = panel.querySelector('details')
    const panelRect = panel.getBoundingClientRect()
    const actionRects = actionButtons.map((button) => button?.getBoundingClientRect())
    const actionsVisibleAtOpen = actionRects.every((rect) => (
      rect && rect.top >= panelRect.top - 1 && rect.bottom <= Math.min(panelRect.bottom, innerHeight) + 1
    ))
    const actionsBeforeLedger = Boolean(
      actionGroup
      && ledger
      && (actionGroup.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING),
    )

    panel.scrollTop = panel.scrollHeight
    const maxScrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight)

    return {
      viewportHeight: innerHeight,
      top: Math.round(panelRect.top),
      bottom: Math.round(panelRect.bottom),
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      viewportContained: panelRect.top >= -1 && panelRect.bottom <= innerHeight + 1,
      actionsVisibleAtOpen,
      actionsBeforeLedger,
      bottomReachable: panel.scrollTop >= maxScrollTop - 1,
    }
  })
  await capture('information-panel-bottom')
  const result = {
    selectedAfterClick,
    requestCount: requests.length,
    narrativeRequestCount: requests.filter((request) => String(request.prompt_asset || '').includes('mod-engine:narrative:')).length,
    storyContinuityRequestCount: requests.filter((request) => String(request.prompt_asset || '').includes('mod-engine:narrative-story-continuity:')).length,
    eventLibraryRequestCount: requests.filter((request) => String(request.prompt_asset || '').includes('mod-engine:narrative-event-library:')).length,
    talentGrowthRequestCount: requests.filter((request) => String(request.prompt_asset || '').includes('mod-engine:narrative-talent-growth:')).length,
    requestChoices: requests.map((request) => request.messages?.map((message) => message.content).join('\n').includes('交给守约者')),
    radioCount,
    resolvedChoice: stored.narrativeHistory?.[0]?.resolvedChoice,
    narrativeEntries: stored.narrativeHistory?.length,
    repetitionMetricRounds: stored.narrativeHistory?.map((entry) => entry.repetitionMetric?.round),
    repetitionSummaryRounds: stored.storyRepetitionStats?.rounds,
    repetitionSummaryMeasuredRounds: stored.storyRepetitionStats?.measuredRounds,
    repetitionRoundsVisible: repetitionRoundsText.includes('第 1 轮') && repetitionRoundsText.includes('第 2 轮'),
    informationPanel,
    consoleErrors,
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  const expectedChoice = customChoiceFixture
  const choicePass = selectedAfterClick === customChoiceFixture
  const expectedMetricRounds = '[1,2]'
  const expectedRoundCount = 2
  const repetitionPass = JSON.stringify(result.repetitionMetricRounds) === expectedMetricRounds
    && result.repetitionSummaryRounds === expectedRoundCount
    && result.repetitionSummaryMeasuredRounds === expectedRoundCount - 1
    && result.repetitionRoundsVisible
  if (
    !choicePass
    || result.radioCount !== 0
    || result.resolvedChoice !== expectedChoice
    || result.requestCount < expectedRoundCount * 3
    || result.narrativeRequestCount < expectedRoundCount
    || result.storyContinuityRequestCount !== expectedRoundCount
    || result.eventLibraryRequestCount !== expectedRoundCount
    || result.narrativeEntries !== expectedRoundCount
    || result.consoleErrors.length > 0
    || !repetitionPass
    || !result.informationPanel.viewportContained
    || !result.informationPanel.actionsVisibleAtOpen
    || !result.informationPanel.actionsBeforeLedger
    || !result.informationPanel.bottomReachable
  ) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
