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
}

function narrativeResponse(paragraphs, branch) {
  return `⟦正文⟧${paragraphs.join('\n\n')}${branch ? `\n\n⟦分支⟧${JSON.stringify(branch)}` : ''}`
}

function settlementResponse(summary, metadata, intentId) {
  const data = {
    摘要: summary,
    ...metadata,
    ...(intentId
      ? {
          命运意图判定: {
            意图编号: intentId,
            可行性: '可执行',
            执行方式: '立即执行',
            状态: '成功',
            风险等级: '低',
            进度: 100,
            预计耗时: '本轮',
            判定理由: '你已把印记交给守约者并建立新的同盟。',
            下一步: '在后续行动中巩固同盟。',
          },
        }
      : {}),
  }
  return `⟦数据⟧${JSON.stringify(data)}`
}

function readIntentId(body) {
  const prompt = (body.messages ?? []).map((message) => String(message.content ?? '')).join('\n')
  const intentId = prompt.match(/意图编号必须严格等于 (命运分支:[^；"\\\s]+)/u)?.[1]
  if (!intentId) throw new Error('第二轮结算输入缺少当前命运分支编号')
  return intentId
}

const narrativeResponses = [
  narrativeResponse(firstParagraphs),
  narrativeResponse(secondParagraphs),
]
const settlementFixtures = [
  ['家族印记带来一项不可逆的长期抉择。', branchMeta],
  ['你选择守约者，新的同盟已经建立。', {
    重要程度: '普通',
    关键事件: [{ 内容: '你将印记交给守约者并建立新的同盟', 重要度: 72, 涉及实体: ['守约者'] }],
    情节状态: '进行中',
    语义信号: {
      事件类型: '关系',
      冲突强度: 20,
      张力变化: 4,
      行动规模: '中',
      不可逆: false,
      影响范围: '个人',
      叙事语域: '生活',
      语域理由: '新同盟进入日常相处阶段',
      情节类型: '人生阶段',
    },
  }],
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
    localStorage.setItem('mod-settings:store', JSON.stringify({ version: 11, state: {
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
      ...(contract.mythicSlots === undefined ? {} : { mythicSlots: document.querySelectorAll('[aria-label="已选择的轮回天赋"] > button').length === contract.mythicSlots }),
      ...(contract.ordinarySlots === undefined ? {} : { ordinarySlots: document.querySelectorAll('[aria-label="已选普通命格"] > button').length === contract.ordinarySlots }),
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
  let settlementResponseIndex = 0
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
    if (promptAsset.includes('mod-engine:narrative-settlement:')) {
      const index = Math.min(settlementResponseIndex++, settlementFixtures.length - 1)
      const [summary, metadata] = settlementFixtures[index]
      content = settlementResponse(summary, metadata, index === 1 ? readIntentId(body) : undefined)
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
  await assertCreationUiContract(page, {
    header: '01 / 08', nextNumber: '02', primaryText: '确认世界',
    includes: ['选择世界', '已保存', '预设世界', '自定义', '难度'],
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
    header: '02 / 08', nextNumber: '03', primaryText: '确认世界',
    includes: ['配置世界', '规则摘要', '世界规则', 'AI', '选择', '自定'],
  })
  await capture('world-customize')

  await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await assertCreationUiContract(page, { header: '03 / 08', nextNumber: '04', primaryText: '确认角色' })
  await capture('character')
  await page.focus('#character-name')
  await page.keyboard.type('分支测试')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('确认角色'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/talent-draw'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('开始抽取') && !button.disabled))
  await assertCreationUiContract(page, { header: '04 / 08', nextNumber: '05', primaryText: '开始抽取', includes: ['命格抽取'] })
  await capture('draw-idle')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始抽取') && !button.disabled)?.click())
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('进入命格选择') && !button.disabled))
  await assertCreationUiContract(page, { header: '04 / 08', nextNumber: '05', primaryText: '进入命格选择', includes: ['十二道命印', '12 / 12'] })
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
    header: '05 / 08', nextNumber: '06', primaryText: '确认命格',
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
  await page.waitForSelector('button[aria-label="提高体魄"]')
  await assertCreationUiContract(page, { header: '06 / 08', nextNumber: '07', primaryText: '确认属性', attributeRows: 4, includes: ['/ 15', '四项基础属性'] })
  await capture('attribute')
  for (let i = 0; i < 15; i += 1) {
    const label = i < 10 ? '提高体魄' : '提高心智'
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
  await assertCreationUiContract(page, { header: '07 / 08', primaryText: '开始人生', includes: ['世界与角色', '轮回天赋', '属性与命格'] })
  await capture('preview')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('开始人生'))?.click())
  await page.waitForFunction(() => location.pathname.endsWith('/game-story'))
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('轻触，让岁月流转') && !button.disabled), { timeout: 60000 })
  await page.click('button[aria-label="强制下一轮分支"]')
  await page.waitForFunction(() => document.body.textContent?.includes('已请求命运分叉'))
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('轻触，让岁月流转'))?.click())
  try {
    await page.waitForFunction((paragraph) => document.body.textContent?.includes(paragraph), { timeout: 60000 }, firstParagraphs[0])
  } catch (error) {
    console.error('NARRATIVE_TIMEOUT', await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-5000), buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent, disabled: button.disabled })) })))
    throw error
  }
  // 即使 AI 未返回分支，强制分叉也必须提交一个仅含自定义输入的分叉点。
  await page.waitForSelector('textarea[placeholder="也可以写下你的做法……"]', { timeout: 60000 })
  const radioCount = await page.$$eval('input[type="radio"]', (nodes) => nodes.length)
  if (radioCount !== 0) throw new Error(`forced custom-only branch unexpectedly rendered ${radioCount} radio options`)
  await page.focus('textarea[placeholder="也可以写下你的做法……"]')
  await page.keyboard.type(customChoiceFixture)
  const selectedAfterClick = await page.$eval('textarea[placeholder="也可以写下你的做法……"]', (node) => node.value)
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
  await page.click('button[aria-label="展开当前信息"]')
  await page.waitForFunction(() => (
    document.body.textContent?.includes('叙事重复观测 · 近五轮')
    && document.querySelector('[aria-label="近五轮词语重复率"]')?.textContent?.includes('第2轮')
  ))
  const repetitionRoundsText = await page.$eval(
    '[aria-label="近五轮词语重复率"]',
    (node) => node.textContent || '',
  )
  const result = {
    selectedAfterClick,
    requestCount: requests.length,
    narrativeRequestCount: requests.filter((request) => String(request.prompt_asset || '').includes('mod-engine:narrative:')).length,
    settlementRequestCount: requests.filter((request) => String(request.prompt_asset || '').includes('mod-engine:narrative-settlement:')).length,
    requestChoices: requests.map((request) => request.messages?.map((message) => message.content).join('\n').includes('交给守约者')),
    firstNarrativeRequestedBranch: requests.find((request) => String(request.prompt_asset || '').includes('mod-engine:narrative:'))
      ?.messages?.map((message) => message.content).join('\n').includes('正文停在玩家需要作出选择的现场'),
    radioCount,
    resolvedChoice: stored.narrativeHistory?.[0]?.resolvedChoice,
    narrativeEntries: stored.narrativeHistory?.length,
    repetitionMetricRounds: stored.narrativeHistory?.map((entry) => entry.repetitionMetric?.round),
    repetitionSummaryRounds: stored.storyRepetitionStats?.rounds,
    repetitionSummaryMeasuredRounds: stored.storyRepetitionStats?.measuredRounds,
    repetitionRoundsVisible: repetitionRoundsText.includes('第1轮') && repetitionRoundsText.includes('第2轮'),
    consoleErrors,
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  const expectedChoice = customChoiceFixture
  const choicePass = selectedAfterClick === customChoiceFixture
  const repetitionPass = JSON.stringify(result.repetitionMetricRounds) === '[1,2]'
    && result.repetitionSummaryRounds === 2
    && result.repetitionSummaryMeasuredRounds === 1
    && result.repetitionRoundsVisible
  if (
    !choicePass
    || result.radioCount !== 0
    || result.firstNarrativeRequestedBranch !== true
    || result.resolvedChoice !== expectedChoice
    || result.requestCount !== 4
    || result.narrativeRequestCount !== 2
    || result.settlementRequestCount !== 2
    || result.consoleErrors.length > 0
    || !repetitionPass
  ) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
