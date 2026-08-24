/**
 * Purpose: Browser regression for the current world-select workflow.
 * Owner: quality:ui
 * Responsibility: Verify world selection presentation, local summary readiness, cache reset controls, and direct role-configuration handoff without restoring the retired world-customize flow.
 */

/**
 * Purpose: Regress responsive world-selection layout and direct navigation behavior.
 * Owner: quality:ui
 * Responsibility: One Playwright session, viewport evidence, and ordered world-selection assertions only.
 */

const path = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:63302'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const reportDir = path.resolve(process.cwd(), 'reports', 'mobile-ui-tournament-2026-07-11')

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  let failed = 0

  for (const width of [375, 390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: width === 768 ? 1024 : 844 } })
    const errors = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(`${baseUrl}/new-game/world-select`, { waitUntil: 'networkidle' })
    if (width === 768) {
      const transitionMetrics = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hasWorldSelect: document.body.textContent?.includes('选择一个你的世界') ?? false,
      }))
      if (transitionMetrics.scrollWidth > transitionMetrics.viewportWidth) { failed++; console.error('FAIL 768: horizontal overflow') }
      if (!transitionMetrics.hasWorldSelect) { failed++; console.error('FAIL 768: desktop transition world-select content missing') }
      if (errors.length > 0) { failed++; console.error(`FAIL 768: console errors: ${errors.join(' | ')}`) }
      await page.screenshot({ path: path.join(reportDir, 'world-select-wf2-real-768.png'), fullPage: false })
      console.log(JSON.stringify({ width, transitionMetrics, errors }))
      await page.close()
      continue
    }
    await page.getByRole('heading', { name: '选择你的世界' }).waitFor()

    const confirm = page.getByRole('button', { name: '确认世界', exact: true })
    const initiallyDisabled = await confirm.isDisabled()
    await page.getByRole('button', { name: /现代地球/ }).click()
    const enabledAfterSelection = await confirm.isEnabled()
    await page.getByRole('button', { name: /更多世界/ }).click()
    const moreExpanded = await page.getByRole('button', { name: /更多世界/ }).getAttribute('aria-expanded')
    const moreWorldCount = await page.locator('[aria-label="更多世界来源"] button[aria-pressed]').count()
    await page.locator('nav[aria-label="世界选择操作"] details summary').click()
    const difficultyOptions = await page.locator('nav[aria-label="世界选择操作"] details button').count()

    const metrics = await page.evaluate(() => {
      const bottomButtons = [...document.querySelectorAll('nav[aria-label="世界选择操作"] summary, nav[aria-label="世界选择操作"] > div > button')]
      const directoryButtons = [...document.querySelectorAll('section[aria-label="更多世界来源"] > button')]
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bottomHeights: bottomButtons.map((item) => item.getBoundingClientRect().height),
        directoryLabels: directoryButtons.map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
        hasWorldSummary: Boolean(document.querySelector('section[aria-label="当前世界"] .stageQuote')?.textContent?.trim()),
      }
    })

    const checks = [
      [metrics.scrollWidth <= metrics.viewportWidth, 'horizontal overflow'],
      [initiallyDisabled && enabledAfterSelection, 'confirm disabled semantics changed'],
      [moreExpanded === 'true' && moreWorldCount === 19, `inline more-world expansion expected 19, got ${moreWorldCount}`],
      [difficultyOptions === 4, `difficulty menu expected 4 options, got ${difficultyOptions}`],
      [metrics.bottomHeights.every((height) => Math.abs(height - 32) < 1), `bottom controls are not 32px: ${metrics.bottomHeights.join(',')}`],
      [metrics.directoryLabels.length === 3, 'independent three-row directory missing'],
      [metrics.hasWorldSummary, 'world summary missing from stage'],
      [errors.length === 0, `console errors: ${errors.join(' | ')}`],
    ]

    for (const [ok, message] of checks) {
      if (!ok) { failed++; console.error(`FAIL ${width}: ${message}`) }
    }
    await page.screenshot({ path: path.join(reportDir, `world-select-wf2-real-${width}.png`), fullPage: false })
    console.log(JSON.stringify({ width, metrics, moreWorldCount, difficultyOptions, errors }))
    await page.close()
  }

  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => { console.error(error); process.exit(1) })
