/**
 * Purpose: Verify the standalone settings page readability and keyboard contracts.
 * Owner: quality:ui
 * Responsibility: Settings semantics, typography, contrast, and keyboard browser assertions only.
 */

const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:63310'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const reportDir = path.resolve('reports', 'settings-readable')

const viewports = [
  { name: 'phone-320x568', width: 320, height: 568 },
  { name: 'phone-360x640', width: 360, height: 640 },
  { name: 'phone-375x812', width: 375, height: 812 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'phone-390x664', width: 390, height: 664 },
  { name: 'phone-393x727', width: 393, height: 727 },
  { name: 'phone-430x740', width: 430, height: 740 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'desktop-1024x768', width: 1024, height: 768 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1611x1272', width: 1611, height: 1272 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
]

const tabIds = ['appearance', 'narrative', 'model-call', 'statistics']
const themes = ['reading', 'night', 'white', 'colorful']
function approximately(actual, expected, tolerance = 1) {
  return Math.abs(actual - expected) <= tolerance
}
function assertCheck(condition, label, failures) {
  if (!condition) failures.push(label)
}
async function readSettingsMetrics(page) {
  return page.evaluate(() => {
    const readRect = (node) => {
      if (!node) return null
      const value = node.getBoundingClientRect()
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      }
    }
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
    }
    const settingsRoot = document.querySelector('[data-settings-modal-root]')
    const tabs = [...document.querySelectorAll('[data-settings-modal-root] [role="tab"]')]
    const textNodes = settingsRoot
      ? [...settingsRoot.querySelectorAll('h1, h2, h3, p, span, small, button, label, a')]
        .filter((node) => node.textContent?.trim() && visible(node) && !String(node.className).includes('dropdownArrow'))
        .map((node) => ({
          text: node.textContent.trim().slice(0, 48),
          fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
        }))
      : []
    return {
      hasDialogRole: settingsRoot?.getAttribute('role') === 'dialog',
      hasModalAria: settingsRoot?.getAttribute('aria-modal') === 'true',
      tabCount: tabs.length,
      tabRects: tabs.map((tab) => readRect(tab)),
      labels: tabs.map((tab) => tab.textContent?.trim() ?? ''),
      minimumTextSize: textNodes.length > 0 ? Math.min(...textNodes.map((node) => node.fontSize)) : 0,
      smallestText: textNodes.sort((left, right) => left.fontSize - right.fontSize)[0] ?? null,
    }
  })
}
async function readThemeContrast(page) {
  return page.evaluate(async (themeIds) => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
      const hex = value.trim().replace('#', '')
      if (/^[\da-f]{3}$/i.test(hex)) {
        return [
          parseInt(`${hex[0]}${hex[0]}`, 16),
          parseInt(`${hex[1]}${hex[1]}`, 16),
          parseInt(`${hex[2]}${hex[2]}`, 16),
          1,
        ]
      }
      if (/^[\da-f]{6}$/i.test(hex)) {
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1]
      }
      return null
    }
    const luminance = (color) => {
      const channels = color.slice(0, 3).map((channel) => channel / 255).map((channel) => (
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      ))
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    const contrast = (foreground, background) => {
      const foregroundColor = parseColor(foreground)
      const backgroundColor = parseColor(background)
      if (!foregroundColor || !backgroundColor || foregroundColor[3] < 1 || backgroundColor[3] < 1) return 0
      const foregroundLuminance = luminance(foregroundColor)
      const backgroundLuminance = luminance(backgroundColor)
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    }
    const values = {}
    for (const theme of themeIds) {
      const themeButton = document.querySelector(`[data-theme-option="${theme}"]`)
      if (!(themeButton instanceof HTMLElement)) {
        values[theme] = null
        continue
      }
      themeButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      const rootStyle = getComputedStyle(document.documentElement)
      const confirmButton = [...document.querySelectorAll('[data-flow-bottom-bar] button')].at(-1)
      const confirmStyle = confirmButton ? getComputedStyle(confirmButton) : null
      values[theme] = {
        mutedOnCanvas: contrast(
          rootStyle.getPropertyValue('--flow-muted'),
          rootStyle.getPropertyValue('--flow-canvas'),
        ),
        confirmTextOnAccent: confirmStyle
          ? contrast(confirmStyle.color, confirmStyle.backgroundColor)
          : 0,
      }
    }
    return values
  }, themes)
}
async function inspectSettings(page, viewport) {
  const failures = []
  const errors = []
  const onPageError = (error) => errors.push(error.message)
  page.on('pageerror', onPageError)
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('.flow-responsive-layout', { timeout: 30000 })
  const metrics = await page.evaluate(() => {
    const readRect = (node) => {
      if (!node) return null
      const value = node.getBoundingClientRect()
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      }
    }
    const frame = document.querySelector('.final-flow-frame')
    const responsiveViewport = document.querySelector('.flow-responsive-viewport')
    const layout = document.querySelector('.flow-responsive-layout')
    const bottomBar = document.querySelector('[data-flow-bottom-bar]')
    const title = document.querySelector('h1, h2')
    const tabPanel = document.querySelector('[role="tabpanel"]')
    const frameStyle = getComputedStyle(frame)
    const layoutStyle = getComputedStyle(layout)
    return {
      documentWidth: document.documentElement.scrollWidth,
      frame: readRect(frame),
      responsiveViewport: readRect(responsiveViewport),
      layout: readRect(layout),
      bottomBar: readRect(bottomBar),
      titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : null,
      densityPixelUnit: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--final-flow-density-px')),
      frameTransform: frameStyle.transform,
      layoutTransform: layoutStyle.transform,
      frameZoom: frameStyle.zoom,
      layoutZoom: layoutStyle.zoom,
      legacyNodeCount: document.querySelectorAll('.final-flow-design-fit, .final-flow-design-canvas').length,
      tabPanel: tabPanel ? {
        overflowY: getComputedStyle(tabPanel).overflowY,
        clientHeight: tabPanel.clientHeight,
        scrollHeight: tabPanel.scrollHeight,
      } : null,
    }
  })
  const { width, height } = viewport
  assertCheck(metrics.documentWidth <= width + 1, 'document has horizontal overflow', failures)
  assertCheck(metrics.frame && approximately(metrics.frame.left, 0) && approximately(metrics.frame.top, 0), 'frame does not start at the viewport origin', failures)
  assertCheck(metrics.frame && approximately(metrics.frame.right, width) && approximately(metrics.frame.bottom, height), 'frame does not match the browser viewport', failures)
  assertCheck(metrics.frameTransform === 'none' && metrics.layoutTransform === 'none', 'page frame or layout is transformed', failures)
  assertCheck(metrics.frameZoom === '1' && metrics.layoutZoom === '1', 'page frame or layout uses CSS zoom', failures)
  assertCheck(approximately(metrics.densityPixelUnit, 1.2, 0.01), 'non-core density is not exactly 1.2x', failures)
  assertCheck(metrics.legacyNodeCount === 0, 'legacy design-canvas nodes remain in the DOM', failures)
  assertCheck(
    metrics.layout
      && metrics.responsiveViewport
      && approximately(metrics.layout.width, metrics.responsiveViewport.width)
      && approximately(metrics.layout.height, metrics.responsiveViewport.height),
    'layout does not match its responsive viewport',
    failures,
  )
  if (width < 768) {
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.left, 0) && approximately(metrics.responsiveViewport.right, width), 'mobile content leaves horizontal gutters', failures)
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.top, 0) && approximately(metrics.responsiveViewport.bottom, height), 'mobile content does not use the visible height', failures)
  } else {
    const expectedDesktopWidth = Math.min(1184, width - 40)
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.width, expectedDesktopWidth), 'desktop content does not use the shared min(74rem, viewport minus 40px) width', failures)
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.left + metrics.responsiveViewport.right, width), 'desktop content is not centered', failures)
  }
  assertCheck(metrics.bottomBar && metrics.bottomBar.left >= 0 && metrics.bottomBar.right <= width + 1, 'bottom bar exceeds horizontal viewport bounds', failures)
  assertCheck(metrics.bottomBar && metrics.bottomBar.top >= 0 && metrics.bottomBar.bottom <= height + 1, 'bottom bar is outside the visible height', failures)
  assertCheck(metrics.titleFontSize !== null && approximately(metrics.titleFontSize, 28, 0.15), 'settings title does not match the current page heading contract', failures)
  assertCheck(metrics.tabPanel && metrics.tabPanel.overflowY === 'auto', 'settings content is not independently scrollable', failures)
  const settingsMetrics = await readSettingsMetrics(page)
  assertCheck(!settingsMetrics.hasDialogRole && !settingsMetrics.hasModalAria, 'standalone settings page still exposes modal semantics', failures)
  assertCheck(settingsMetrics.tabCount === 4, 'settings does not expose all four categories', failures)
  assertCheck(settingsMetrics.labels.join('|') === '📖 阅读与界面|📝 叙事偏好|🔌 模型与调用|📊 数据统计', 'settings category labels changed', failures)
  assertCheck(
    settingsMetrics.tabRects.every((rect) => rect.width > 0 && rect.height > 0),
    'one or more settings categories are not visible in the current viewport',
    failures,
  )
  assertCheck(
    settingsMetrics.minimumTextSize >= 12,
    `settings text falls below the 12px readability floor: ${JSON.stringify(settingsMetrics.smallestText)}`,
    failures,
  )
  for (const tabId of tabIds) {
    await page.click(`#settings-tab-${tabId}`)
    await page.waitForFunction((id) => document.querySelector(`#settings-tab-${id}[aria-selected="true"]`), {}, tabId)
    const tabMetrics = await readSettingsMetrics(page)
    assertCheck(tabMetrics.minimumTextSize >= 12, `${tabId} settings text falls below the 12px readability floor`, failures)
  }
  await page.click('#settings-tab-appearance')
  await page.evaluate(() => document.querySelector('[data-settings-modal-root]')?.focus())
  let keyboardReachedBottomBar = false
  for (let index = 0; index < 96; index += 1) {
    await page.keyboard.press('Tab')
    keyboardReachedBottomBar = await page.evaluate(() => {
      const active = document.activeElement
      return active instanceof HTMLElement && Boolean(active.closest('[data-flow-bottom-bar]'))
    })
    if (keyboardReachedBottomBar) break
  }
  assertCheck(keyboardReachedBottomBar, 'keyboard focus cannot reach standalone settings bottom actions', failures)
  const themeContrast = await readThemeContrast(page)
  for (const [theme, values] of Object.entries(themeContrast)) {
    assertCheck(values && values.mutedOnCanvas >= 4.5, `${theme} theme muted text contrast is below 4.5:1`, failures)
    assertCheck(values && values.confirmTextOnAccent >= 4.5, `${theme} theme confirm text contrast is below 4.5:1`, failures)
  }
  assertCheck(errors.length === 0, `console errors: ${errors.join(' | ')}`, failures)
  await page.screenshot({
    path: path.join(reportDir, `${viewport.name}.png`),
    fullPage: false,
  })
  page.off('pageerror', onPageError)
  return failures
}
async function main() {
  fs.mkdirSync(reportDir, { recursive: true })
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox'],
  })
  let failed = 0
  for (const viewport of viewports) {
    const page = await browser.newPage()
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 })
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('ai-life-sim:disclaimer-accepted', '2.3.0')
    })
    const failures = await inspectSettings(page, viewport)
    if (failures.length > 0) {
      failed += failures.length
      console.error(`FAIL ${viewport.name}: ${failures.join(' | ')}`)
    }
    await page.close()
  }
  await browser.close()
  if (failed > 0) process.exit(1)
  console.log(`PASS: settings readability browser regression (${viewports.length} viewports, ${themes.length} themes)`)
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
