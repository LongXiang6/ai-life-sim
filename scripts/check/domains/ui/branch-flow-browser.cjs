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

const useBranchRepairFixture = process.env.FORCED_BRANCH_REPAIR_FIXTURE === '1'
const useCustomChoiceFixture = process.env.BRANCH_CUSTOM_CHOICE === '1'
const useUnavailableApiFixture = process.env.UNAVAILABLE_API_FIXTURE === '1'
const useLongCustomNameFixture = process.env.LONG_CUSTOM_NAME_FIXTURE === '1'
const customChoiceFixture = '把印记交给守约者前，先请守约者说明旧盟约的代价'
const bodyOnlyFirstResponse = [
  '⟦正文⟧',
  firstParagraphs.join('\n\n'),
  '⟦摘要⟧',
  '家族印记把你带到一个必须作出长期决定的现场。',
  '⟦结束⟧',
].join('\n')
const branchRepairResponse = JSON.stringify({
  分支标题: '你愿意让这份印记指向哪条道路？',
  分支选项: ['交给守约者，承担旧盟约的责任', '带走印记，独自寻找新的道路'],
})

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

async function assertCreationUiContract(page, expected) {
  const result = await page.evaluate((contract) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const runningHead = [...document.querySelectorAll('header, [class*="meta"], [class*="runningHead"]')]
      .map((node) => node.textContent || '')
      .find((value) => value.includes(contract.header)) || ''
    const titleMark = [...document.querySelectorAll('[class*="titleMark"]')]
      .find((node) => visible(node))?.textContent?.trim() || ''
    const nextNumber = [...document.querySelectorAll('[class*="nextNumber"], [class*="confirmNumber"]')]
      .find((node) => visible(node))?.textContent?.trim() || ''
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
    const checks = {
      header: runningHead.includes(contract.header),
      titleMark: !contract.titleMark || titleMark === contract.titleMark,
      nextNumber: !contract.nextNumber || nextNumber === contract.nextNumber,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1 && maxRight <= window.innerWidth + 1,
      bottomVisible: Boolean(bottomRect && bottomRect.bottom >= 0 && bottomRect.top <= window.innerHeight),
      primaryTouchTarget: !contract.primaryText || Boolean(primaryRect && primaryRect.width >= 32 && primaryRect.height >= 32),
      ...(contract.candidates === undefined ? {} : { candidates: document.querySelectorAll('[aria-label="普通命格候选"] > button').length === contract.candidates }),
      ...(contract.mythicSlots === undefined ? {} : { mythicSlots: document.querySelectorAll('[aria-label="已选择的轮回天赋"] > button').length === contract.mythicSlots }),
      ...(contract.ordinarySlots === undefined ? {} : { ordinarySlots: document.querySelectorAll('[aria-label="已选普通命格"] > button').length === contract.ordinarySlots }),
      ...(contract.attributeRows === undefined ? {} : { attributeRows: ['体魄', '心智', '悟性', '魅力'].every((name) => document.querySelector(`button[aria-label="增加${name}"]`)) }),
      ...(contract.includes === undefined ? {} : { includes: contract.includes.every((value) => (document.body.innerText || '').includes(value)) }),
    }
    return { checks, details: { runningHead, titleMark, nextNumber, scrollWidth: document.documentElement.scrollWidth, maxRight, viewport: window.innerWidth } }
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
  let responseIndex = 0
  let mainNarrativeRequestCount = 0
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
    if (useBranchRepairFixture && promptAsset.includes('narrative-branch-repair')) {
      content = branchRepairResponse
    } else if (useBranchRepairFixture && promptAsset.includes('mod-engine:narrative:')) {
      content = mainNarrativeRequestCount++ === 0
        ? bodyOnlyFirstResponse
        : responses[1]
    } else {
      content = responses[Math.min(responseIndex++, responses.length - 1)]
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
  await assertCreationUiContract(page, {
    header: '01 / 08', titleMark: '01', nextNumber: '02', primaryText: '确认世界',
    includes: ['选择世界', '已保存', '预设', '自定义', '人生难度'],
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

  await page.goto(`${baseUrl}/new-game/world-customize`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await assertCreationUiContract(page, {
    header: '02 / 08', titleMark: '02', nextNumber: '03', primaryText: '确认世界',
    includes: ['配置世界', '世界描述', '世界规则', 'AI', '选择', '自定'],
  })
  await capture('world-customize')

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await assertCreationUiContract(page, { header: '03 / 08', titleMark: '03', nextNumber: '04', primaryText: '确认角色' })
  await capture('character')
  await page.focus('#character-name')
  await page.keyboard.type('分支测试')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认角色'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始抽取') && !button.disabled))
  await assertCreationUiContract(page, { header: '04 / 08', titleMark: '04', nextNumber: '05', primaryText: '开始抽取', includes: ['十二个候选'] })
  await capture('draw-idle')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始抽取') && !button.disabled)?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('进入命格选择') && !button.disabled))
  await assertCreationUiContract(page, { header: '04 / 08', titleMark: '04', nextNumber: '05', primaryText: '进入命格选择', includes: ['十二道命印', '12 / 12'] })
  await capture('draw-ready')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('进入命格选择'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw') && document.body.textContent?.includes('选择命格'))
  for (const [slotIndex, name] of [[1, '未熄之诺'], [2, '回声拾光']]) {
    await page.click(`button[aria-label^="轮回天赋槽${slotIndex}"]`)
    await page.waitForSelector('#mythic-library-sheet')
    await page.evaluate((patternName) => [...document.querySelectorAll('#mythic-library-sheet button')].find((button) => button.textContent?.includes(patternName))?.click(), name)
    await page.waitForSelector('#mythic-library-sheet', { hidden: true })
  }
  for (let index = 0; index < 3; index += 1) {
    await page.waitForSelector('button[aria-label$="选择普通命格"]')
    await page.evaluate(() => document.querySelector('button[aria-label$="选择普通命格"]')?.click())
  }
  await assertCreationUiContract(page, {
    header: '05 / 08', titleMark: '05', nextNumber: '06', primaryText: '确认命格',
    candidates: 12, mythicSlots: 2, ordinarySlots: 3, includes: ['轮回天赋', '普通命格候选 12 / 12 条'],
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
  await page.waitForSelector('button[aria-label="增加体魄"]')
  await assertCreationUiContract(page, { header: '06 / 08', titleMark: '06', nextNumber: '07', primaryText: '确认属性', attributeRows: 4, includes: ['/ 15', '四项基础属性'] })
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
  await assertCreationUiContract(page, { header: '07 / 08', titleMark: '07', primaryText: '开始人生', includes: ['世界与角色', '轮回天赋', '四项属性'] })
  await capture('preview')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始人生'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/game-story'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 60000 })
  if (useBranchRepairFixture) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('强制下一轮分支') && !button.disabled)?.click())
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('轻触，让岁月流转'))?.click())
  try {
    await page.waitForFunction((paragraph) => document.body.textContent?.includes(paragraph), { timeout: 60000 }, firstParagraphs[0])
  } catch (error) {
    console.error('NARRATIVE_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-5000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled })) })))
    throw error
  }
  // A forced branch may arrive in a separate background response after the
  // complete body is already visible; wait for the branch control itself.
  await page.waitForSelector('input[type="radio"]', { timeout: 60000 })
  const option = await page.$('input[type="radio"]')
  if (!option) {
    console.error('BRANCH_RADIO_MISSING', await page.evaluate(() => ({
      text: document.body.innerText.slice(-2800),
      requests: window.__branchRequests,
      inputs: [...document.querySelectorAll('input')].map((input) => ({ type: input.type, checked: input.checked, name: input.name })),
      buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
    })))
    throw new Error('branch radio was not rendered')
  }
  let selectedAfterClick
  if (useCustomChoiceFixture) {
    await page.focus('textarea[placeholder="也可以写下你的做法……"]')
    await page.keyboard.type(customChoiceFixture)
    selectedAfterClick = await page.$eval('textarea[placeholder="也可以写下你的做法……"]', (node) => node.value)
  } else {
    await option.click()
    selectedAfterClick = await page.$eval('input[type="radio"]', (node) => node.checked)
  }
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
  if (useBranchRepairFixture) {
    result.branchRepairRequestCount = requests.filter((request) => String(request.prompt_asset || '').includes('narrative-branch-repair')).length
    result.branchRepairTitleRendered = await page.evaluate(() => document.body.textContent?.includes('你愿意让这份印记指向哪条道路？'))
    result.bodyPreserved = await page.evaluate((paragraph) => document.body.textContent?.includes(paragraph), firstParagraphs[0])
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  const expectedChoice = useCustomChoiceFixture ? customChoiceFixture : '交给守约者，承担旧盟约的责任'
  const repairPass = !useBranchRepairFixture
    || (result.branchRepairRequestCount === 1 && result.branchRepairTitleRendered && result.bodyPreserved && result.requestCount >= 3)
  const choicePass = useCustomChoiceFixture ? selectedAfterClick === customChoiceFixture : selectedAfterClick === true
  if (!choicePass || result.resolvedChoice !== expectedChoice || result.requestCount < 2 || result.consoleErrors.length > 0 || !repairPass) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
