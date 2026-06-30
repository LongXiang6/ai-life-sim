/**
 * @module warm-dev-server.mjs
 * @description 开发服务器路由预热 —— Ready 后后台请求基础路由，触发 Turbopack 提前编译
 *
 * 用法:
 *   node scripts/dev/warm-dev-server.mjs              # 默认 localhost:3000，预热 / 与 /welcome
 *   node scripts/dev/warm-dev-server.mjs --port 3001
 */

/** @type {readonly string[]} */
const DEFAULT_ROUTES = ['/', '/welcome']

const DEFAULT_PORT = 3000
const DEFAULT_HOST = '127.0.0.1'
const WAIT_TIMEOUT_MS = 120_000
const WAIT_INTERVAL_MS = 500
const FETCH_TIMEOUT_MS = 120_000

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * @param {string} baseUrl
 * @param {{ timeoutMs?: number; intervalMs?: number }} [options]
 */
async function waitForServer(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? WAIT_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? WAIT_INTERVAL_MS
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      })
      if (res.ok || res.status === 307 || res.status === 308) {
        return
      }
    } catch {
      // 服务尚未就绪，继续轮询
    }
    await sleep(intervalMs)
  }

  throw new Error(`[dev-warmup] 服务器 ${baseUrl} 在 ${timeoutMs}ms 内未就绪`)
}

/**
 * @param {{ port?: number; host?: string; routes?: readonly string[]; silent?: boolean }} [options]
 */
export async function warmDevServer(options = {}) {
  const envPort = Number(process.env.PORT)
  const port = options.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT)
  const host = options.host ?? process.env.HOSTNAME ?? DEFAULT_HOST
  const routes = options.routes ?? DEFAULT_ROUTES
  const silent = options.silent ?? false
  const baseUrl = `http://${host}:${port}`

  const log = silent ? () => {} : (...args) => { console.log(...args) }
  const warn = silent ? () => {} : (...args) => { console.warn(...args) }

  log(`[dev-warmup] 等待开发服务器就绪 (${baseUrl})…`)
  await waitForServer(baseUrl)

  log('[dev-warmup] 开始预热基础路由…')
  const startedAt = Date.now()

  for (const route of routes) {
    const url = route === '/' ? baseUrl : `${baseUrl}${route}`
    const routeStartedAt = Date.now()
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const elapsed = Date.now() - routeStartedAt
      log(`[dev-warmup] ${route} → HTTP ${res.status} (${elapsed}ms)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      warn(`[dev-warmup] ${route} 预热失败: ${message}`)
    }
  }

  log(`[dev-warmup] 预热完成，总耗时 ${Date.now() - startedAt}ms — 可以打开浏览器了`)
}

function parseArgs(argv) {
  /** @type {{ port?: number }} */
  const result = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) {
      result.port = Number(argv[i + 1])
      i += 1
    }
  }
  return result
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/dev/warm-dev-server.mjs')

if (isDirectRun) {
  warmDevServer(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
