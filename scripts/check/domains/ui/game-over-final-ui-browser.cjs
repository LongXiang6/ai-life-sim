/**
 * Purpose: Verify the finalized game-over page in an isolated browser fixture.
 * Owner: quality:ui
 * Responsibility: Exercise game-over presentation and real footer navigation only.
 */

const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const viewportWidth = Number.parseInt(process.env.UI_VIEWPORT_WIDTH || '430', 10)
const viewportHeight = Number.parseInt(process.env.UI_VIEWPORT_HEIGHT || '932', 10)
const screenshotDir = process.env.UI_SCREENSHOT_DIR

const mythic = {
  id: 'final-ui-mythic',
  lineageId: 'final-ui-mythic',
  version: 1,
  name: '未熄之诺',
  description: '承诺',
  category: 'expression',
  rarity: 'mythic',
  effect: '重要承诺会持续留下可追溯的行动方向。',
  attrBonus: {},
  strengthenLevel: 1,
  acquiredAt: 20260724,
  source: { worldName: '潮汐城邦', characterName: '沈砚', finalAge: 73, runId: 'final-ui-life' },
}

const leaderboardEntry = {
  rank: 1,
  username: '守灯人',
  score: 86,
  rounds: 120,
  recordId: 'leaderboard-final-ui-life',
  completedAt: Date.UTC(2026, 7, 11),
  characterName: '沈砚',
  worldName: '潮汐城邦',
  finalAge: 73,
  dimensions: [
    ['tide-craft', '潮律掌握', 86],
    ['civic-trust', '城邦信义', 88],
    ['voyage-impact', '航路回响', 84],
    ['legacy', '传承延续', 90],
    ['self-choice', '自我抉择', 82],
  ].map(([id, label, value]) => ({ id, label, description: `${label}的人生含义`, value, comment: `${label}已有完整证据。`, evidenceIds: ['narrative:record-1'] })),
  endingReview: {
    perspective: 'micro',
    review: '你把一座灯塔守成了群岛之间可以信任的路。',
    verse: '潮痕落纸引归航\n旧塔连灯照海乡\n一卷残图传后手\n群舟今夜过长汀',
    evidenceIds: ['narrative:record-1'],
    source: 'ai',
  },
  achievements: [],
  portraitAssetId: null,
  portraitAssetUrl: null,
}

function seedPage(page) {
  return page.evaluateOnNewDocument((fixtureMythic) => {
    const transitionAudit = (round, narrativeId) => ({
      schemaVersion: 1,
      round,
      narrativeId,
      validatedWritePath: true,
      interceptorPassed: true,
      intentValidationPassed: true,
      historicalCommitPassed: true,
      structuredDataPresent: true,
      structuredDataAccepted: true,
      requestedChangeCount: 0,
      committedChangeCount: 0,
      rejectedChangeCount: 0,
      trusted: true,
      validationClean: true,
      reasons: [],
    })
    localStorage.clear()
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({
      version: 5,
      state: {
        worldConfig: {
          name: '潮汐城邦', eraName: '潮历', eraStartYear: 1, essenceTag: 'mixed',
          powerSystemTag: 'tide', powerFramework: { id: 'fixture:power', label: '潮汐力量体系', enabled: true, progression: 'bounded', ranks: [{ id: 'fixture:power:rank:1', index: 1, label: '潮息', description: '测试世界基础力量阶位' }], source: 'world-default' }, spatialForm: 'islands', civilizationStage: 'city-state',
          difficulty: 'normal', description: '群岛随潮汐改变航路，灯塔维系城邦之间的契约。', worldType: 'idealist',
        },
        initialized: true,
        worldCode: 2026072401,
        currentYear: 73,
        worldTags: ['群岛', '潮汐'],
        eraStartYear: 1,
        eraName: '潮历',
        entities: [],
        calibration: null,
        destinyPatternModifiers: {},
      },
    }))
    localStorage.setItem('mod-character:persist:character-state', JSON.stringify({
      version: 4,
      state: {
        characterId: 'character_final_ui',
        name: '沈砚', gender: 'male', race: 'human', background: '灯塔记录员', age: 73,
        worldCode: 2026072401,
        characterBase: {
          base: { physique: 8, mind: 10, talentAptitude: 9, charisma: 7 },
          current: { physique: 14, mind: 17, talentAptitude: 16, charisma: 12 },
          modifiers: { physique: 6, mind: 7, talentAptitude: 7, charisma: 5 },
          contextModifiers: {},
          startingAge: 18,
        },
        destinyPatterns: {
          candidates: [],
          patterns: [
            { id: 'pattern-1', name: '潮痕记忆', description: '记住每一次潮汐留下的变化。', rarity: 'rare', effect: '重要线索更容易被回想。', attrBonus: { mind: 2 } },
            { id: 'pattern-2', name: '守灯之心', description: '在混乱中保持方向。', rarity: 'fine', effect: '危机中更容易维持判断。', attrBonus: { physique: 1 } },
            { id: 'pattern-3', name: '远航余响', description: '旧旅程会成为新选择的依据。', rarity: 'rare', effect: '远行会带回新的关系线索。', attrBonus: { charisma: 1 } },
          ],
          rarityCount: { common: 0, fine: 1, rare: 2, epic: 0, legendary: 0 },
        },
        health: { entityId: 'character_final_ui', vitality: 0, maxVitality: 100, stamina: 0, spirit: 72, alive: false, conditions: [] },
        lifespan: {
          entityId: 'character_final_ui', raceId: 'human', displayName: '人类', clockMode: 'aging',
          baseLifespanDays: 70 * 365, maximumLifespanDays: 73 * 365,
          adjustments: [{ adjustmentId: 'lifespan-adjustment:tide-breathing', entityId: 'character_final_ui', deltaDays: 3 * 365, operation: 'adjust-maximum', description: '完成潮汐呼吸辅助装置。', occurredAtTotalDays: 54 * 365, evidenceEventIds: ['event:tide-breathing'] }],
        },
        lifecycle: { entityId: 'character_final_ui', ageDays: 73 * 365 },
        talents: [],
        equippedReincarnationTalents: [fixtureMythic],
      },
    }))
    localStorage.setItem('mod-character:persist:reincarnation-library', JSON.stringify({
      version: 1,
      state: { talents: [fixtureMythic] },
    }))
    localStorage.setItem('mod-engine:persist:engine-state', JSON.stringify({
      version: 5,
      state: {
        status: 'complete', totalRounds: 3, currentNarrative: '', narrativeError: null,
        narrativeHistory: [
          { id: 'record-1', text: '你第一次接过灯塔值守簿，记下了改变航路的异常潮汐。', isComplete: true, timestamp: 1, displayAge: 18, displayTimeLabel: '潮历18年', transitionAudit: transitionAudit(1, 'record-1') },
          { id: 'record-2', text: '你选择公开旧海图，并与邻岛建立了新的航行契约。', isComplete: true, timestamp: 2, displayAge: 41, displayTimeLabel: '潮历41年', resolvedChoice: '公开旧海图', transitionAudit: transitionAudit(2, 'record-2') },
          { id: 'record-3', text: '晚年的你把灯塔交给学生，亲眼看着新航线第一次贯通群岛。', isComplete: true, timestamp: 3, displayAge: 73, displayTimeLabel: '潮历73年', transitionAudit: transitionAudit(3, 'record-3') },
        ],
        compressedSummaries: { summaries: [] },
        compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, lastAt: 0 },
        resolvedBranches: {}, forceBranchNext: false,
      },
    }))
    localStorage.setItem('mod-settings:store', JSON.stringify({
      version: 11,
      state: { provider: 'custom', customKey: 'test-only-key', customUrl: 'https://api.deepseek.com', customModel: 'deepseek-v4-flash', reduceMotion: true },
    }))
  }, mythic)
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const consoleErrors = []
  const proxyRequests = []
  let settlementCallIndex = 0
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (new URL(request.url()).pathname === '/api/leaderboard' && request.method() === 'GET') {
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entries: [leaderboardEntry] }),
      })
    }
    if (!request.url().includes('/api/proxy')) return request.continue()
    if (request.method() === 'GET') {
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) })
    }
    proxyRequests.push(request.url())
    const scoreResponse = JSON.stringify({
      dimensions: [
        ['tide-craft', '潮律掌握', 86],
        ['civic-trust', '城邦信义', 88],
        ['voyage-impact', '航路回响', 84],
        ['legacy', '传承延续', 90],
        ['self-choice', '自我抉择', 82],
      ].map(([id, label, value], index) => ({
        id,
        label,
        description: `${label}在潮汐城邦中的人生含义`,
        value,
        comment: `你用第${index + 1}段经历让${label}留下了可见结果。`,
        evidenceIds: [`narrative:record-${Math.min(index + 1, 3)}`],
      })),
    })
    const reviewResponse = JSON.stringify({
      perspective: 'micro',
      review: '你接过灯塔值守簿时，只想把潮汐记准。后来旧海图在桌上摊开，邻岛的船依次亮起信号灯。晚年交出钥匙那天，学生沿着你留下的航线驶过窗前；纸页已经泛黄，群岛之间的灯却连成了路。',
      verse: '潮痕落纸引归航\n旧塔连灯照海乡\n一卷残图传后手\n群舟今夜过长汀',
      evidenceIds: ['narrative:record-1', 'narrative:record-2', 'narrative:record-3'],
    })
    const content = settlementCallIndex % 2 === 0 ? scoreResponse : reviewResponse
    settlementCallIndex += 1
    return request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
    })
  })
  await page.setViewport({ width: viewportWidth, height: viewportHeight })
  await seedPage(page)
  await page.goto(`${baseUrl}/game-over`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await page.waitForFunction(() => (
    document.querySelector('footer button[class*="confirmButton"]')?.disabled === false
    || Boolean(document.querySelector('[class*="reviewError"]'))
  ))
  const firstSettlementError = await page.$eval('[class*="reviewError"]', (node) => node.textContent?.trim()).catch(() => '')
  if (firstSettlementError) throw new Error(`结算夹具进入失败终态：${firstSettlementError}`)
  await page.evaluate(() => document.querySelector('footer')?.scrollIntoView({ block: 'end' }))

  const result = await page.evaluate(() => {
    const footer = document.querySelector('footer')
    const back = footer?.querySelector('button[class*="backButton"]')
    const primary = footer?.querySelector('button[class*="confirmButton"]')
    const semantic = [...document.querySelectorAll('[data-semantic-emoji]')]
    const rect = (element) => element?.getBoundingClientRect()
    const footerRect = rect(footer)
    const backRect = rect(back)
    const primaryRect = rect(primary)
    const metricRects = [...document.querySelectorAll('button[class*="metricButton"]')]
      .map((button) => button.getBoundingClientRect())
    const metricOverlapCount = metricRects.reduce((count, left, leftIndex) => (
      count + metricRects.slice(leftIndex + 1).filter((right) => (
        left.left < right.right
        && left.right > right.left
        && left.top < right.bottom
        && left.bottom > right.top
      )).length
    ), 0)
    const density = Number.parseFloat(getComputedStyle(document.querySelector('.final-flow-frame')).getPropertyValue('--final-flow-density-px'))
    return {
      route: location.pathname,
      viewport: [window.innerWidth, window.innerHeight],
      scrollWidth: document.documentElement.scrollWidth,
      title: document.querySelector('h1')?.textContent?.trim(),
      runningHead: document.querySelector('[data-flow-running-head]')?.textContent?.replace(/\s+/g, ' ').trim(),
      semanticCount: semantic.length,
      semanticHidden: semantic.every((node) => node.getAttribute('aria-hidden') === 'true'),
      metricNames: [...document.querySelectorAll('button[class*="metricButton"]')]
        .map((button) => button.getAttribute('aria-label')),
      metricOverlapCount,
      footerVisible: Boolean(footerRect && footerRect.top >= 0 && footerRect.bottom <= window.innerHeight + 1),
      footerBottom: footerRect ? window.innerHeight - footerRect.bottom : null,
      footerHeight: footerRect?.height,
      backSize: backRect ? [backRect.width, backRect.height] : null,
      primarySize: primaryRect ? [primaryRect.width, primaryRect.height] : null,
      density,
      retiredArrowPresent: Boolean(footer?.querySelector('[class*="newLifeArrow"]')),
    }
  })

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true })
    await page.screenshot({ path: path.join(screenshotDir, `${viewportWidth}-game-over-finalized.png`) })
  }

  await page.click('footer button[class*="backButton"]')
  await page.waitForFunction(() => location.pathname.endsWith('/welcome'))
  result.backRoute = await page.evaluate(() => location.pathname)

  await page.goto(`${baseUrl}/game-over`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (
    document.querySelector('footer button[class*="confirmButton"]')?.disabled === false
    || Boolean(document.querySelector('[class*="reviewError"]'))
  ))
  const secondSettlementError = await page.$eval('[class*="reviewError"]', (node) => node.textContent?.trim()).catch(() => '')
  if (secondSettlementError) throw new Error(`第二次结算夹具进入失败终态：${secondSettlementError}`)
  await page.click('footer button[class*="confirmButton"]')
  await page.waitForFunction(() => document.querySelector('footer button[class*="confirmButton"]')?.textContent?.includes('确认开启新人生'))
  await page.click('footer button[class*="confirmButton"]')
  await page.waitForFunction(() => location.pathname.endsWith('/world-select'))
  result.newLifeRoute = await page.evaluate(() => location.pathname)

  await page.goto(`${baseUrl}/leaderboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('li[class*="entry"]')
  result.leaderboard = await page.evaluate(() => ({
    route: location.pathname,
    dimensionCount: document.querySelectorAll('dl[class*="dimensionGrid"] > div').length,
    review: document.querySelector('[class*="endingReview"]')?.textContent?.trim(),
    verseLines: document.querySelector('[class*="endingVerse"]')?.textContent
      ?.split('\n')
      .map((line) => line.trim())
      .filter(Boolean).length,
    portraitCount: document.querySelectorAll('img[class*="leaderboardPortrait"]').length,
  }))
  if (screenshotDir) {
    await page.screenshot({ path: path.join(screenshotDir, `${viewportWidth}-leaderboard-finalized.png`) })
  }
  result.proxyRequests = proxyRequests.length
  result.consoleErrors = consoleErrors

  console.log(JSON.stringify(result, null, 2))
  await browser.close()

  const expectedButtonHeight = 38.333 * result.density
  const near = (value, expected) => typeof value === 'number'
    && typeof expected === 'number'
    && Math.abs(value - expected) <= 1
  if (
    result.route !== '/game-over'
    || result.scrollWidth > result.viewport[0] + 1
    || result.title !== '一生回望'
    || !result.runningHead?.includes('09 / 09')
    || result.semanticCount < 5
    || !result.semanticHidden
    || result.metricNames.length !== 5
    || result.metricNames.some((name) => !name)
    || result.metricOverlapCount !== 0
    || !result.footerVisible
    || !near(result.footerBottom, 0)
    || !(result.backSize?.[1] >= expectedButtonHeight)
    || !(result.primarySize?.[1] >= expectedButtonHeight)
    || !near(result.backSize?.[1], result.primarySize?.[1])
    || !near(result.backSize?.[0], result.primarySize?.[0])
    || result.retiredArrowPresent
    || result.backRoute !== '/welcome'
    || result.newLifeRoute !== '/new-game/world-select'
    || result.leaderboard?.route !== '/leaderboard'
    || result.leaderboard?.dimensionCount !== 5
    || result.leaderboard?.review !== leaderboardEntry.endingReview.review
    || result.leaderboard?.verseLines !== 4
    || result.leaderboard?.portraitCount !== 0
    || result.proxyRequests !== 4
    || result.consoleErrors.length > 0
  ) process.exit(1)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
