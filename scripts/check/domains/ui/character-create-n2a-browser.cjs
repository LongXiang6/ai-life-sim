const path = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:63303'
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
    await page.goto(`${baseUrl}/new-game/character-create`, { waitUntil: 'networkidle' })

    if (width === 768) {
      const metrics = await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, hasPage: document.body.textContent?.includes('角色设定') ?? false }))
      if (metrics.scrollWidth > metrics.viewportWidth) { failed++; console.error('FAIL 768: horizontal overflow') }
      if (!metrics.hasPage) { failed++; console.error('FAIL 768: desktop transition content missing') }
      if (errors.length) { failed++; console.error(`FAIL 768: ${errors.join(' | ')}`) }
      await page.screenshot({ path: path.join(reportDir, 'character-create-n2a-real-768.png'), fullPage: false })
      await page.close(); continue
    }

    await page.getByRole('heading', { name: '塑造你的角色' }).waitFor()
    await page.getByRole('button', { name: /更多选择/ }).click()
    const customGenderVisible = await page.getByPlaceholder('输入性别名称...').isVisible()
    await page.getByRole('button', { name: /种族目录/ }).click()
    const raceSearchVisible = await page.getByPlaceholder('搜索种族...').isVisible()
    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="角色创建操作"]')
      const buttons = [...(nav?.querySelectorAll('button') ?? [])].map((button) => {
        const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height }
      })
      return {
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        buttons,
        softGroups: document.querySelectorAll('[class*="softGroup"]').length,
        hasDivider: [...document.querySelectorAll('main *')].some((element) => element.className?.toString().toLowerCase().includes('divider')),
      }
    })
    const checks = [
      [metrics.scrollWidth <= metrics.viewportWidth, 'horizontal overflow'],
      [customGenderVisible, 'custom gender inline panel did not open'],
      [raceSearchVisible, 'race catalog inline panel did not open'],
      [metrics.softGroups === 3, `expected 3 same-tone identity groups, got ${metrics.softGroups}`],
      [!metrics.hasDivider, 'identity divider reappeared'],
      [metrics.buttons.length === 2 && Math.abs(metrics.buttons[0].width - 64) < 1 && Math.abs(metrics.buttons[1].width - 112) < 1, `bottom widths changed: ${JSON.stringify(metrics.buttons)}`],
      [metrics.buttons.every((button) => Math.abs(button.height - 32) < 1), `bottom heights changed: ${JSON.stringify(metrics.buttons)}`],
      [errors.length === 0, `console errors: ${errors.join(' | ')}`],
    ]
    for (const [ok, message] of checks) if (!ok) { failed++; console.error(`FAIL ${width}: ${message}`) }
    await page.screenshot({ path: path.join(reportDir, `character-create-n2a-real-${width}.png`), fullPage: false })
    console.log(JSON.stringify({ width, metrics, errors }))
    await page.close()
  }
  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => { console.error(error); process.exit(1) })
