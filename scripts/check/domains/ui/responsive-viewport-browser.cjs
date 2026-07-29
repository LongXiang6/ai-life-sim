/**
 * @module responsive-viewport-browser.cjs
 * @description Verifies that runtime pages use the real browser viewport without page scaling.
 */

const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:63310'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const reportDir = path.resolve('reports', 'responsive-viewport')

const viewports = [
  { name: 'phone-320x568', width: 320, height: 568 },
  { name: 'phone-360x640', width: 360, height: 640 },
  { name: 'phone-390x664', width: 390, height: 664 },
  { name: 'phone-393x727', width: 393, height: 727 },
  { name: 'phone-430x740', width: 430, height: 740 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
]

const coreRoutes = [
  { name: 'welcome', path: '/welcome' },
  { name: 'settings', path: '/settings' },
  { name: 'world-select', path: '/new-game/world-select' },
]

const auxiliaryRoutes = [
  { name: 'help', path: '/help' },
  { name: 'account', path: '/account' },
  { name: 'feedback', path: '/feedback' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'mailbox', path: '/mailbox' },
  { name: 'save-manager', path: '/save-manager' },
]

function approximately(actual, expected, tolerance = 1) {
  return Math.abs(actual - expected) <= tolerance
}

function assertCheck(condition, label, failures) {
  if (!condition) failures.push(label)
}

async function inspectRoute(page, viewport, route) {
  const errors = []
  const onPageError = (error) => errors.push(error.message)
  page.on('pageerror', onPageError)

  await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle2', timeout: 60000 })
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
    const title = document.querySelector('h1')
    const actions = document.querySelector('main section:last-of-type')
    const tabPanel = document.querySelector('[role="tabpanel"]')
    const frameStyle = getComputedStyle(frame)
    const layoutStyle = getComputedStyle(layout)

    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      frame: readRect(frame),
      responsiveViewport: readRect(responsiveViewport),
      layout: readRect(layout),
      bottomBar: readRect(bottomBar),
      title: readRect(title),
      actions: readRect(actions),
      titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : null,
      frameTransform: frameStyle.transform,
      layoutTransform: layoutStyle.transform,
      inlineTransform: layout instanceof HTMLElement ? layout.style.transform : '',
      legacyNodeCount: document.querySelectorAll('.final-flow-design-fit, .final-flow-design-canvas').length,
      tabPanel: tabPanel ? {
        overflowY: getComputedStyle(tabPanel).overflowY,
        clientHeight: tabPanel.clientHeight,
        scrollHeight: tabPanel.scrollHeight,
      } : null,
    }
  })

  const failures = []
  const { width, height } = viewport
  assertCheck(metrics.documentWidth <= width + 1, 'document has horizontal overflow', failures)
  assertCheck(metrics.frame && approximately(metrics.frame.left, 0) && approximately(metrics.frame.top, 0), 'frame does not start at the viewport origin', failures)
  assertCheck(metrics.frame && approximately(metrics.frame.right, width) && approximately(metrics.frame.bottom, height), 'frame does not match the browser viewport', failures)
  assertCheck(metrics.frameTransform === 'none' && metrics.layoutTransform === 'none' && metrics.inlineTransform === '', 'page frame or layout is transformed or scaled', failures)
  assertCheck(metrics.legacyNodeCount === 0, 'legacy design-canvas nodes remain in the DOM', failures)
  assertCheck(metrics.layout && metrics.responsiveViewport && approximately(metrics.layout.width, metrics.responsiveViewport.width) && approximately(metrics.layout.height, metrics.responsiveViewport.height), 'layout does not match its responsive viewport', failures)

  if (width < 768) {
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.left, 0) && approximately(metrics.responsiveViewport.right, width), 'mobile content leaves horizontal gutters', failures)
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.top, 0) && approximately(metrics.responsiveViewport.bottom, height), 'mobile content does not use the visible height', failures)
  } else {
    assertCheck(metrics.responsiveViewport && metrics.responsiveViewport.width <= 480.5, 'desktop reading width exceeds the responsive maximum', failures)
    assertCheck(metrics.responsiveViewport && approximately(metrics.responsiveViewport.left + metrics.responsiveViewport.right, width), 'desktop content is not centered', failures)
  }

  if (metrics.bottomBar) {
    assertCheck(metrics.bottomBar.left >= 0 && metrics.bottomBar.right <= width + 1, 'bottom bar exceeds horizontal viewport bounds', failures)
    assertCheck(metrics.bottomBar.top >= 0 && metrics.bottomBar.bottom <= height + 1, 'bottom bar is outside the visible height', failures)
  }

  if (route.name === 'welcome') {
    assertCheck(metrics.actions && metrics.actions.bottom <= height + 1, 'welcome actions exceed the visible height', failures)
    assertCheck(metrics.titleFontSize !== null && metrics.titleFontSize >= 20 && metrics.titleFontSize <= 32, 'welcome title is abnormally scaled', failures)
  }

  if (route.name === 'settings') {
    assertCheck(metrics.tabPanel && metrics.tabPanel.overflowY === 'auto', 'settings content is not independently scrollable', failures)
    if (metrics.tabPanel && metrics.tabPanel.scrollHeight > metrics.tabPanel.clientHeight + 1) {
      const clearsBottomBar = await page.evaluate(() => {
        const tabPanel = document.querySelector('[role="tabpanel"]')
        const bottomBar = document.querySelector('[data-flow-bottom-bar]')
        if (!(tabPanel instanceof HTMLElement) || !(bottomBar instanceof HTMLElement)) return false
        tabPanel.scrollTop = tabPanel.scrollHeight
        const lastContent = tabPanel.lastElementChild
        return lastContent instanceof HTMLElement
          && lastContent.getBoundingClientRect().bottom <= bottomBar.getBoundingClientRect().top + 1
      })
      assertCheck(clearsBottomBar, 'settings content cannot scroll clear of the bottom bar', failures)
    }
  }

  assertCheck(errors.length === 0, `console errors: ${errors.join(' | ')}`, failures)

  await page.screenshot({
    path: path.join(reportDir, `${viewport.name}-${route.name}.png`),
    fullPage: false,
  })
  page.off('pageerror', onPageError)
  return { failures, metrics }
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

    for (const route of coreRoutes) {
      const result = await inspectRoute(page, viewport, route)
      if (result.failures.length > 0) {
        failed += result.failures.length
        console.error(`FAIL ${viewport.name} ${route.name}: ${result.failures.join(' | ')}`)
      }
    }

    if (viewport.width === 390) {
      for (const route of auxiliaryRoutes) {
        const result = await inspectRoute(page, viewport, route)
        if (result.failures.length > 0) {
          failed += result.failures.length
          console.error(`FAIL ${viewport.name} ${route.name}: ${result.failures.join(' | ')}`)
        }
      }
    }

    await page.close()
  }

  await browser.close()
  if (failed > 0) process.exit(1)
  console.log(`PASS: responsive viewport browser regression (${viewports.length} viewports, ${coreRoutes.length + auxiliaryRoutes.length} routes)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
