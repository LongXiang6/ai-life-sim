const path = require('node:path')
const { chromium } = require('playwright')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:63300'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const reportDir = path.resolve(process.cwd(), 'reports', 'mobile-ui-tournament-2026-07-11')

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath })
  let failed = 0

  for (const width of [375, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: width >= 1280 ? 900 : 844 } })
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    const disclaimerAccept = page.getByRole('button', { name: '我已知晓', exact: true })
    if (await disclaimerAccept.count()) await disclaimerAccept.click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '模型设置', exact: true }).click()
    await page.getByText('每轮叙事大致字数').waitFor()

    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
      const closeButton = document.querySelector('button[aria-label="关闭设置"]')
      const modal = dialog?.firstElementChild
      const rect = modal?.getBoundingClientRect()
      const rootStyle = getComputedStyle(document.documentElement)
      const modalStyle = modal ? getComputedStyle(modal) : null
      const firstSection = document.querySelector('section > div:last-child')
      const sectionStyle = firstSection ? getComputedStyle(firstSection) : null
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        dialog: rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left } : null,
        activeTabHeight: activeTab?.getBoundingClientRect().height ?? 0,
        activeTabLabel: activeTab?.textContent?.trim() ?? '',
        closeHeight: closeButton?.getBoundingClientRect().height ?? 0,
        tabLabels: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim()),
        sectionCount: document.querySelectorAll('section').length,
        hasDefaultWordCount: document.body.textContent?.includes('200字') ?? false,
        hasPromptPreview: document.body.textContent?.includes('提示词预览') ?? false,
        glassModalToken: rootStyle.getPropertyValue('--glass-modal-bg').trim(),
        glassElevatedToken: rootStyle.getPropertyValue('--glass-elevated-bg').trim(),
        modalBackground: modalStyle?.backgroundColor ?? '',
        sectionBackground: sectionStyle?.backgroundColor ?? '',
      }
    })

    const checks = [
      [metrics.scrollWidth <= metrics.viewportWidth, 'horizontal overflow'],
      [metrics.dialog && metrics.dialog.left >= 0 && metrics.dialog.right <= metrics.viewportWidth, 'dialog outside viewport'],
      [metrics.tabLabels.join('|') === '个性化|模型设置|模型调用', 'tab labels changed'],
      [!metrics.hasPromptPreview, 'internal prompt preview is visible'],
      [metrics.activeTabLabel === '模型设置', 'model settings tab did not become active'],
      [metrics.activeTabHeight >= 32 && metrics.activeTabHeight <= 44, 'active tab density outside 32-44px reference'],
      [Math.abs(metrics.closeHeight - 34) < 1, 'settings close control is not the shared 34px size'],
      [metrics.sectionCount >= 4, 'independent section cards missing'],
      [metrics.hasDefaultWordCount, 'default 200-word setting missing'],
      [metrics.glassModalToken.length > 0 && metrics.glassElevatedToken.length > 0, 'foundation glass tokens are not loaded'],
      [metrics.modalBackground !== 'rgba(0, 0, 0, 0)', 'settings modal background is transparent'],
      [metrics.sectionBackground !== 'rgba(0, 0, 0, 0)', 'settings section cards are transparent'],
      [errors.length === 0, `console errors: ${errors.join(' | ')}`],
    ]

    for (const [ok, message] of checks) {
      if (!ok) {
        failed++
        console.error(`FAIL ${width}: ${message}`)
      }
    }

    await page.screenshot({
      path: path.join(reportDir, `settings-r1-real-${width}.png`),
      fullPage: false,
    })
    console.log(JSON.stringify({ width, metrics, errors }))
    await page.close()
  }

  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
