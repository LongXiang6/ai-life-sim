const path = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:63304'
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
    await page.goto(`${baseUrl}/new-game/world-customize`, { waitUntil: 'networkidle' })

    if (width === 768) {
      const metrics = await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, hasPage: document.body.textContent?.includes('世界自定义') ?? false }))
      if (metrics.scrollWidth > metrics.viewportWidth) { failed++; console.error('FAIL 768: horizontal overflow') }
      if (!metrics.hasPage) { failed++; console.error('FAIL 768: desktop transition content missing') }
      if (errors.length) { failed++; console.error(`FAIL 768: ${errors.join(' | ')}`) }
      await page.screenshot({ path: path.join(reportDir, 'world-customize-m2-real-768.png'), fullPage: false })
      await page.close(); continue
    }

    await page.getByRole('heading', { name: '配置你的世界' }).waitFor()
    const firstCard = page.locator('section').filter({ hasText: '世界空间形态' }).first()
    await firstCard.getByRole('button', { name: '选择', exact: true }).click()
    const selectVisible = await firstCard.getByText('请选择', { exact: true }).isVisible()
    await firstCard.getByRole('button', { name: '自定', exact: true }).click()
    const customVisible = await firstCard.getByPlaceholder('输入自定义内容…').isVisible()
    const metrics = await page.evaluate(() => {
      const modeGroups = [...document.querySelectorAll('[aria-label$="设定方式"]')]
      const navButtons = [...document.querySelectorAll('nav[aria-label="世界配置操作"] button')].map((button) => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height } })
      return {
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        modeGroups: modeGroups.length,
        modeLabels: modeGroups.map((group) => [...group.querySelectorAll('button')].map((button) => button.textContent?.trim()).join('|')),
        navButtons,
      }
    })
    const checks = [
      [metrics.scrollWidth <= metrics.viewportWidth, 'horizontal overflow'],
      [metrics.modeGroups === 4, `expected 4 mode groups, got ${metrics.modeGroups}`],
      [metrics.modeLabels.every((labels) => labels === 'AI|选择|自定'), `mode labels changed: ${metrics.modeLabels.join(',')}`],
      [selectVisible && customVisible, 'adaptive/custom controls did not render inline'],
      [metrics.navButtons.length === 2 && Math.abs(metrics.navButtons[0].width - 64) < 1 && Math.abs(metrics.navButtons[1].width - 112) < 1, `bottom widths changed: ${JSON.stringify(metrics.navButtons)}`],
      [metrics.navButtons.every((button) => Math.abs(button.height - 32) < 1), `bottom heights changed: ${JSON.stringify(metrics.navButtons)}`],
      [errors.length === 0, `console errors: ${errors.join(' | ')}`],
    ]
    for (const [ok, message] of checks) if (!ok) { failed++; console.error(`FAIL ${width}: ${message}`) }
    await page.screenshot({ path: path.join(reportDir, `world-customize-m2-real-${width}.png`), fullPage: false })
    console.log(JSON.stringify({ width, metrics, errors }))
    await page.close()
  }
  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => { console.error(error); process.exit(1) })
