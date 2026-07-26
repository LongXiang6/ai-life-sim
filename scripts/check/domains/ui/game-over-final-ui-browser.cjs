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
  name: '未熄之诺',
  concept: '承诺',
  effect: '重要承诺会持续留下可追溯的行动方向。',
  strengthTier: 'legacy',
  sourceScore: 86,
  acquiredAt: 20260724,
  source: { worldName: '潮汐城邦', characterName: '沈砚', finalAge: 73, runId: 'final-ui-life' },
}

function seedPage(page) {
  return page.evaluateOnNewDocument((fixtureMythic) => {
    localStorage.clear()
    localStorage.setItem('mod-world:persist:world-state', JSON.stringify({
      version: 4,
      state: {
        worldConfig: {
          name: '潮汐城邦', eraName: '潮历', eraStartYear: 1, essenceTag: 'mixed',
          powerSystemTag: 'tide', powerCeiling: 3, spatialForm: 'islands', civilizationStage: 'city-state',
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
        worldInitAIStatus: {
          status: 'complete', currentStep: '完成', calibrationGenerated: true,
          tagsGenerated: true, configGenerated: true, entitiesGenerated: true,
          retryCount: 0, maxRetries: 3, errors: [],
        },
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
            { id: 'pattern-1', name: '潮痕记忆', description: '记住每一次潮汐留下的变化。', rarity: 'rare', polarity: 'positive', effect: '重要线索更容易被回想。', attrBonus: { mind: 2 } },
            { id: 'pattern-2', name: '守灯之心', description: '在混乱中保持方向。', rarity: 'fine', polarity: 'positive', effect: '危机中更容易维持判断。', attrBonus: { physique: 1 } },
            { id: 'pattern-3', name: '远航余响', description: '旧旅程会成为新选择的依据。', rarity: 'rare', polarity: 'mixed', effect: '远行会带回新的关系线索。', attrBonus: { charisma: 1 } },
          ],
          rarityCount: { common: 0, fine: 1, rare: 2, epic: 0, legendary: 0 },
        },
        health: { hp: 0, maxHp: 100, stamina: 0, spirit: 72, diseases: [], injuries: [], isDead: true, deathCause: '寿终' },
        lifespan: {
          maxAge: 73, baseMaxAge: 70,
          race: { name: '人类', baseMaxAge: 70, goldenAgeRatio: [0.18, 0.4], decayMultiplier: 1 },
          breakthroughs: [{ pathway: 'techEnhancement', year: 54, yearsGained: 3, description: '完成潮汐呼吸辅助装置。' }],
          breakthroughChance: 0.1,
        },
        morality: { value: 34, level: 'good', roundDelta: 0 },
        talents: [],
        mythicCandidates: [fixtureMythic, {
          name: '潮线回望', concept: '记忆', effect: '关键地点会保留往事的回声。', strengthTier: 'legacy', sourceScore: 86,
        }, {
          name: '灯塔余光', concept: '指引', effect: '迷失时会出现一条由旧选择建立的方向。', strengthTier: 'legacy', sourceScore: 86,
        }],
        equippedMythicPatterns: [],
        sealedMythicPatternId: fixtureMythic.id,
      },
    }))
    localStorage.setItem('mod-character:persist:mythic-library', JSON.stringify({
      version: 2,
      state: { patterns: [fixtureMythic] },
    }))
    localStorage.setItem('mod-engine:persist:engine-state', JSON.stringify({
      version: 2,
      state: {
        status: 'complete', totalRounds: 3, currentNarrative: '', streamingNarrative: '', narrativeError: null,
        narrativeHistory: [
          { id: 'record-1', text: '你第一次接过灯塔值守簿，记下了改变航路的异常潮汐。', isComplete: true, timestamp: 1, displayAge: 18, displayTimeLabel: '潮历18年' },
          { id: 'record-2', text: '你选择公开旧海图，并与邻岛建立了新的航行契约。', isComplete: true, timestamp: 2, displayAge: 41, displayTimeLabel: '潮历41年', resolvedChoice: '公开旧海图' },
          { id: 'record-3', text: '晚年的你把灯塔交给学生，亲眼看着新航线第一次贯通群岛。', isComplete: true, timestamp: 3, displayAge: 73, displayTimeLabel: '潮历73年' },
        ],
        compressedSummaries: { summaries: [] },
        compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, lastAt: 0 },
        resolvedBranches: {}, forceBranchNext: false, branchRepairPending: false,
      },
    }))
    localStorage.setItem('mod-settings:store', JSON.stringify({
      version: 7,
      state: { provider: 'managed', customKey: '', customUrl: '', customModel: 'LongCat-2.0', preGenerateRounds: 0, reduceMotion: true, theme: 'minimal-white' },
    }))
  }, mythic)
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const consoleErrors = []
  const proxyRequests = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('request', (request) => { if (request.url().includes('/api/proxy')) proxyRequests.push(request.url()) })
  await page.setViewport({ width: viewportWidth, height: viewportHeight })
  await seedPage(page)
  await page.goto(`${baseUrl}/game-over`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  await page.waitForFunction(() => document.querySelector('footer button[class*="newLifeButton"]')?.disabled === false)
  await page.evaluate(() => document.querySelector('footer')?.scrollIntoView({ block: 'end' }))

  const result = await page.evaluate(() => {
    const footer = document.querySelector('footer')
    const back = footer?.querySelector('button[aria-label="返回首页"]')
    const primary = footer?.querySelector('button[class*="newLifeButton"]')
    const arrow = footer?.querySelector('[class*="newLifeArrow"]')
    const semantic = [...document.querySelectorAll('[data-semantic-emoji]')]
    const rect = (element) => element?.getBoundingClientRect()
    const footerRect = rect(footer)
    const backRect = rect(back)
    const primaryRect = rect(primary)
    const arrowRect = rect(arrow)
    return {
      route: location.pathname,
      viewport: [window.innerWidth, window.innerHeight],
      scrollWidth: document.documentElement.scrollWidth,
      semanticCount: semantic.length,
      semanticHidden: semantic.every((node) => node.getAttribute('aria-hidden') === 'true'),
      metricNames: [...document.querySelectorAll('button[aria-label*="查看评语"], button[aria-label*="卓越"], button[aria-label*="出众"]')].map((button) => button.getAttribute('aria-label')),
      footerVisible: Boolean(footerRect && footerRect.top >= 0 && footerRect.bottom <= window.innerHeight + 1),
      footerHeight: footerRect?.height,
      backSize: backRect ? [backRect.width, backRect.height] : null,
      primaryHeight: primaryRect?.height,
      arrowSize: arrowRect ? [arrowRect.width, arrowRect.height] : null,
    }
  })

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true })
    await page.screenshot({ path: path.join(screenshotDir, `${viewportWidth}-game-over-footer.png`) })
  }

  await page.click('footer button[aria-label="返回首页"]')
  await page.waitForFunction(() => location.pathname.endsWith('/welcome'))
  result.backRoute = await page.evaluate(() => location.pathname)

  await page.goto(`${baseUrl}/game-over`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('footer button[class*="newLifeButton"]')?.disabled === false)
  await page.click('footer button[class*="newLifeButton"]')
  await page.waitForFunction(() => document.querySelector('footer button[class*="newLifeButton"]')?.textContent?.includes('确认开启新人生'))
  await page.click('footer button[class*="newLifeButton"]')
  await page.waitForFunction(() => location.pathname.endsWith('/world-select'))
  result.newLifeRoute = await page.evaluate(() => location.pathname)
  result.proxyRequests = proxyRequests.length
  result.consoleErrors = consoleErrors

  console.log(JSON.stringify(result, null, 2))
  await browser.close()

  const scale = result.backSize?.[0] / 38
  const nearScaled = (value, expected) => typeof value === 'number'
    && typeof scale === 'number'
    && Math.abs(value - expected * scale) <= 1
  if (
    result.route !== '/game-over'
    || result.scrollWidth > result.viewport[0] + 1
    || result.semanticCount !== 5
    || !result.semanticHidden
    || result.metricNames.length !== 4
    || !result.footerVisible
    || !nearScaled(result.backSize?.[0], 38)
    || !nearScaled(result.backSize?.[1], 38)
    || !nearScaled(result.primaryHeight, 48)
    || !nearScaled(result.arrowSize?.[0], 25)
    || !nearScaled(result.arrowSize?.[1], 25)
    || result.backRoute !== '/welcome'
    || result.newLifeRoute !== '/new-game/world-select'
    || result.proxyRequests !== 0
    || result.consoleErrors.length > 0
  ) process.exit(1)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
