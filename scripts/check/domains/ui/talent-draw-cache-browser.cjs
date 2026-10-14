/**
 * Purpose: Verify cached candidate handoff, background filling, and optional talent selection.
 * Owner: quality:ui
 * Responsibility: Browser interactions and fixture AI responses only, not live generation quality.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')
const baseUrl = process.env.UI_BASE_URL || 'http://localhost:3000'
const categories = ['enhancement', 'control', 'perception', 'summoning', 'creation']
const labels = ['强化与变身', '操控与投射', '感知与信息', '召唤与分身', '创造与转化']
const suffixes = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑']
const candidates = categories.flatMap((category, categoryIndex) => suffixes.map((suffix, index) => ({
  id: `ai-optional-${category}-${index}`, lineageId: `ai-optional-${category}-${index}`, version: 1,
  name: `${labels[categoryIndex]}${suffix}印`, category, rarity: 'common',
  description: '唤出可见的能力面板，记录自身修炼成果。',
  effect: '完整效果：能力按自身机制真实生效，可在无超常力量体系的现代世界中使用。',
  attrBonus: {},
})))
const promptSource = fs.readFileSync(
  path.resolve(__dirname, '../../../../src/mods/mod-character/prompts/destiny-pattern-prompt.ts'), 'utf8',
)
const version = promptSource.match(/DESTINY_PATTERN_PROMPT_VERSION = '([^']+)'/)[1]

async function clickText(page, fragment) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')]
    .some(button => button.textContent.includes(text) && !button.disabled), {}, fragment)
  await page.evaluate(text => [...document.querySelectorAll('button')]
    .find(button => button.textContent.includes(text) && !button.disabled).click(), fragment)
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  const pageErrors = [], proxyRequests = [], results = [], layouts = []
  const categoryRequests = Object.fromEntries(categories.map(category => [category, 0]))
  page.on('pageerror', error => pageErrors.push(error.message))
  try {
    await page.setViewport({ width: 848, height: 1030 })
    await page.setRequestInterception(true)
    page.on('request', async request => {
      if (!request.url().includes('/api/proxy')) return request.continue()
      if (request.method() === 'GET') return request.respond({
        status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }),
      })
      const body = JSON.parse(request.postData() || '{}')
      proxyRequests.push(body)
      const categoryIndex = labels.findIndex(label => JSON.stringify(body.messages).includes(`主机制族：${label}`))
      const batch = categoryIndex < 0 ? 0 : ++categoryRequests[categories[categoryIndex]]
      const response = categoryIndex >= 0 ? {
        天赋: candidates.filter((pattern, index) => pattern.category === categories[categoryIndex]
          && index % suffixes.length >= batch * 4 && index % suffixes.length < (batch + 1) * 4)
          .map(pattern => ({
            类别: labels[categoryIndex], 名称: pattern.name,
            设定描述: pattern.description, 效果: pattern.effect, 属性加成: pattern.attrBonus,
          })),
      } : {
        出生地点: '城北医院', 家庭结构: '父母与孩子', 照料者: '父母',
        家庭资源: '普通工薪家庭', 社会处境: '现代城市普通居民',
        叙事背景: '你来到一个秩序稳定却变化迅速的城市世界，出生地点是一所普通的公立医院，窗外的街道正被新的交通、通信与生活方式一点点改写。护士将你交到父母怀中时，你还不知道自己已经站在怎样的人生起点上。父亲的工作给这个家庭带来稳定但有限的收入，母亲承担着日常照料；你最早熟悉的是不大的住房、固定的生活节奏，以及父母为维持家庭而反复计算的时间和开支。你能够接触附近的学校、街道和正在普及的新技术，也会受到家庭积蓄、社会位置和照料者精力的限制。往后的路尚未确定，但你已经从这样的资源、关系与边界中开始。',
        机会: ['邻里与学校', '正在普及的新技术'], 限制: ['家庭资源有限', '照料者精力有限'],
      }
      await request.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: 'stop' }] }),
      })
    })
    await page.evaluateOnNewDocument(currentVersion => {
      window.__cachedTalentDraw = { drawSeen: false }
      const installObserver = () => {
        if (!document.documentElement) return requestAnimationFrame(installObserver)
        new MutationObserver(() => {
          if (location.pathname.endsWith('/talent-draw')
            && document.querySelector('#talent-page-title')?.textContent.trim() === '命格抽取') {
            window.__cachedTalentDraw.drawSeen = true
          }
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      }
      installObserver()
      if (localStorage.getItem('optional-loadout-qa')) return
      localStorage.setItem('optional-loadout-qa', '1')
      localStorage.setItem(`ai-life-sim:mod-character:cache:destiny-pool:stale-before-${currentVersion}:1`,
        JSON.stringify({ data: [{ id: 'stale-candidate' }], ts: Date.now() }))
      localStorage.setItem('ai-life-sim:mod-pages:config:talent-draw:1',
        JSON.stringify({ phase: 'selecting', slots: [], loadoutSlots: [], aiTalentGeneration: true }))
      localStorage.setItem('mod-settings:store', JSON.stringify({
        version: 15, state: {
          provider: 'custom', customKey: 'fixture-key', customUrl: 'https://fixture.invalid/v1',
          customModel: 'fixture-model', aiTalentGeneration: true, preGenerateRounds: 0,
          streamingMode: 'off', reduceMotion: true,
        },
      }))
      localStorage.setItem('mod-character:persist:reincarnation-library', JSON.stringify({
        version: 1, state: { talents: [{
          id: 'optional-mythic', lineageId: 'optional-mythic', version: 1, name: '轮回面板',
          description: '保留可见的系统面板。', category: 'perception', rarity: 'mythic',
          effect: '完整轮回效果仍供故事消费。', attrBonus: {}, strengthenLevel: 1, acquiredAt: 1,
          source: { worldName: '旧世界', characterName: '旧角色' },
        }] },
      }))
    }, version)
    await page.goto(`${baseUrl}/new-game/world-select`, { waitUntil: 'domcontentloaded' })
    await clickText(page, '预设')
    await page.waitForFunction(currentVersion => (
      localStorage.getItem(`ai-life-sim:mod-character:cache:destiny-pool:stale-before-${currentVersion}:1`) === null
      && localStorage.getItem('ai-life-sim:mod-pages:config:talent-draw:1') === null
    ), {}, version)
    assert.equal(await page.$('button[aria-label="清除该世界命格缓存：现代地球"]'), null)
    await clickText(page, '现代地球')
    await clickText(page, '确认世界')
    await page.waitForFunction(() => location.pathname.endsWith('/new-game/character-create')
      && document.querySelector('#character-name'))
    const cacheKey = await page.evaluate(({ patterns, version }) => {
      const world = JSON.parse(localStorage.getItem('mod-world:persist:world-state')).state
      const key = `ai-life-sim:mod-character:cache:destiny-pool:${version}:${world.worldCode}`
      localStorage.setItem(key, JSON.stringify({ data: patterns, ts: Date.now() }))
      return key
    }, { patterns: candidates.filter((_, index) => index % suffixes.length < 4), version })
    await page.type('#character-name', '天赋验证')
    await clickText(page, '确认角色')
    await page.waitForFunction(() => document.querySelector('#talent-page-title')?.textContent.trim() === '选择命格')
    assert.equal(await page.evaluate(() => window.__cachedTalentDraw.drawSeen), false)
    await page.waitForFunction(({ key, categories }) => {
      const patterns = JSON.parse(localStorage.getItem(key) || '{}').data || []
      return patterns.length === 60
        && categories.every(category => patterns.filter(pattern => pattern.category === category).length === 12)
    }, {}, { key: cacheKey, categories })
    assert(categories.every(category => categoryRequests[category] === 2))
    const requestsAfterFill = proxyRequests.length
    assert.equal(requestsAfterFill, 10)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('#talent-page-title')?.textContent.trim() === '选择命格')
    assert.equal(await page.evaluate(() => window.__cachedTalentDraw.drawSeen), false)
    assert.equal(proxyRequests.length, requestsAfterFill)
    assert.equal(await page.$$eval('[class*="candidateCopy"] > i', elements => elements.length), 0)
    for (const viewport of [{ width: 390, height: 844 }, { width: 848, height: 1030 }, { width: 1440, height: 900 }]) {
      await page.setViewport(viewport)
      await page.screenshot({ path: `reports/optional-talents-${viewport.width}.png` })
      const layout = await page.evaluate(() => {
        const confirm = [...document.querySelectorAll('button')].find(button => button.textContent.includes('确认命格'))
        const rect = confirm.getBoundingClientRect()
        return {
          width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
          confirmDisabled: confirm.disabled, confirmInViewport: rect.top >= 0 && rect.bottom <= innerHeight,
        }
      })
      assert.equal(layout.overflow, false)
      assert.equal(layout.confirmDisabled, false)
      assert.equal(layout.confirmInViewport, true)
      layouts.push(layout)
    }
    await page.setViewport({ width: 848, height: 1030 })
    for (let count = 0; count <= 4; count++) {
      await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="移除"]')].forEach(button => button.click()))
      const ordinaryCount = count === 2 ? 1 : count
      for (let index = 0; index < ordinaryCount; index++) {
        await page.click(`button[aria-label="${candidates[index].name}，选择普通命格"]`)
      }
      if (count === 2) {
        await clickText(page, '轮回天赋')
        assert.equal(await page.$$eval('[class*="candidateCopy"] > i', elements => elements.length), 0)
        await page.click('button[aria-label="轮回面板，选择轮回天赋"]')
      }
      if (count === 4) {
        await page.click(`button[aria-label="${candidates[4].name}，选择普通命格"]`)
        assert.equal(await page.$$eval('button[aria-label^="移除"]', elements => elements.length), 4)
      }
      await clickText(page, '确认命格')
      await page.waitForFunction(() => location.pathname.endsWith('/attribute-alloc')
        && document.body.innerText.includes('属性分配'))
      const state = await page.evaluate(() => JSON.parse(localStorage.getItem('mod-character:persist:character-state')).state)
      assert.equal(state.destinyPatterns.patterns.length + state.equippedReincarnationTalents.length, count)
      assert(state.destinyPatterns.patterns.every(pattern => pattern.effect.includes('完整效果')))
      if (count === 0) assert.deepEqual(state.destinyPatterns.patterns, [])
      if (count === 2) assert.equal(state.equippedReincarnationTalents[0].effect, '完整轮回效果仍供故事消费。')
      await clickText(page, '平均分配')
      await clickText(page, '确认属性')
      await page.waitForFunction(() => location.pathname.endsWith('/fate-preview')
        && document.body.innerText.includes('核对命书'))
      await page.waitForFunction(() => [...document.querySelectorAll('button')]
        .some(button => button.textContent.includes('开始人生') && !button.disabled))
      const fatePreviewText = await page.evaluate(() => document.body.innerText)
      const birthNarrative = await page.$eval('p[class*="birthNarrative"]', element => element.textContent.trim())
      assert(fatePreviewText.includes('初临此世'))
      assert(fatePreviewText.includes('你的来处'))
      assert(fatePreviewText.includes('城北医院'))
      assert(birthNarrative.includes('你'))
      assert(!birthNarrative.includes('天赋验证'))
      assert(!/^\d{4}年/u.test(birthNarrative))
      assert(fatePreviewText.includes('秩序稳定却变化迅速的城市世界'))
      assert(fatePreviewText.includes('父母为维持家庭而反复计算的时间和开支'))
      assert(fatePreviewText.includes('往后的路尚未确定，但你已经从这样的资源、关系与边界中开始'))
      results.push({
        selected: count, ordinary: state.destinyPatterns.patterns.length,
        reincarnation: state.equippedReincarnationTalents.length, fatePreviewStartEnabled: true,
      })
      if (count < 4) {
        await clickText(page, '返回确认属性')
        await page.waitForFunction(() => location.pathname.endsWith('/attribute-alloc'))
        await clickText(page, '返回命格选择')
        await page.waitForFunction(() => document.querySelector('#talent-page-title')?.textContent.trim() === '选择命格')
      }
    }
    assert.deepEqual(pageErrors, [])
    console.log(JSON.stringify({
      mode: 'browser UI integration with fixture AI responses, not live generation',
      status: 'pass', results, layouts, categoryRequests,
      birthCalls: proxyRequests.length - requestsAfterFill, pageErrors,
    }, null, 2))
  } catch (error) {
    console.error('Browser evidence:', JSON.stringify({
      url: page.url(), text: await page.evaluate(() => document.body.innerText), pageErrors,
      proxyCalls: proxyRequests.length,
    }))
    await page.screenshot({ path: 'reports/optional-talents-failure.png' })
    throw error
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
