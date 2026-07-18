const path = require('node:path')
const { chromium } = require('playwright')
const { version: appVersion } = require('../../../../package.json')

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
    await page.getByRole('button', { name: '说明', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: '说明' })
    await dialog.getByText('AI 人生模拟器 - 功能说明').waitFor()
    const closeButton = dialog.getByRole('button', { name: '关闭说明' })
    const chapterNav = dialog.getByRole('navigation', { name: '说明章节' })
    const contentViewport = dialog.locator('[role="tabpanel"]')

    await chapterNav.getByRole('button', { name: '角色创建', exact: true }).click()
    const docsMetrics = await dialog.evaluate((node) => {
      const close = node.querySelector('button[aria-label="关闭说明"]')
      const modal = node.firstElementChild
      const viewport = node.querySelector('[role="tabpanel"]')
      const activeChapter = node.querySelector('[aria-pressed="true"]')
      const firstParagraph = node.querySelector('.help-doc-section p')
      const modalRect = modal?.getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        modalRect: modalRect ? { left: modalRect.left, right: modalRect.right, top: modalRect.top, bottom: modalRect.bottom } : null,
        closeSize: close ? { width: close.getBoundingClientRect().width, height: close.getBoundingClientRect().height } : null,
        chapterCount: node.querySelectorAll('nav[aria-label="说明章节"] button').length,
        sectionCount: node.querySelectorAll('.help-doc-section').length,
        activeChapter: activeChapter?.textContent?.trim() ?? '',
        contentScrollTop: viewport?.scrollTop ?? 0,
        bodyLineHeight: firstParagraph ? parseFloat(getComputedStyle(firstParagraph).lineHeight) / parseFloat(getComputedStyle(firstParagraph).fontSize) : 0,
        modalBackground: modal ? getComputedStyle(modal).backgroundColor : '',
      }
    })

    await page.screenshot({ path: path.join(reportDir, `help-c3-real-${width}.png`), fullPage: false })

    await dialog.getByRole('tab', { name: '更新日志', exact: true }).click()
    await dialog.getByText(appVersion, { exact: true }).waitFor()
    const changelogVisible = await dialog.getByText('新增任务完成后的游戏版本递增与更新日志记录流程。', { exact: true }).isVisible()
    await page.screenshot({ path: path.join(reportDir, `help-c3-changelog-${width}.png`), fullPage: false })

    const checks = [
      [docsMetrics.scrollWidth <= docsMetrics.viewportWidth, 'horizontal overflow'],
      [docsMetrics.modalRect && docsMetrics.modalRect.left >= 0 && docsMetrics.modalRect.right <= docsMetrics.viewportWidth, 'dialog outside viewport'],
      [docsMetrics.closeSize && Math.abs(docsMetrics.closeSize.width - 34) < 1 && Math.abs(docsMetrics.closeSize.height - 34) < 1, 'C3 close control is not 34px'],
      [docsMetrics.chapterCount === 10 && docsMetrics.sectionCount === 10, 'H1 chapter navigation/content mismatch'],
      [docsMetrics.activeChapter === '角色创建' && docsMetrics.contentScrollTop > 0, 'chapter navigation did not move reading position'],
      [docsMetrics.bodyLineHeight >= 1.7, 'help body line height is too tight'],
      [docsMetrics.modalBackground !== 'rgba(0, 0, 0, 0)', 'help modal background is transparent'],
      [changelogVisible, 'changelog content did not load'],
      [errors.length === 0, `console errors: ${errors.join(' | ')}`],
    ]

    for (const [ok, message] of checks) {
      if (!ok) {
        failed++
        console.error(`FAIL ${width}: ${message}`)
      }
    }

    await closeButton.click()
    if (await dialog.count()) {
      failed++
      console.error(`FAIL ${width}: close control did not dismiss help dialog`)
    }

    console.log(JSON.stringify({ width, docsMetrics, changelogVisible, errors }))
    await page.close()
  }

  await browser.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
