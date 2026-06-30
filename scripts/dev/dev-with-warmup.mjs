/**
 * @module dev-with-warmup.mjs
 * @description 启动 next dev 并在 Ready 后自动后台预热基础路由
 *
 * 用法: node scripts/dev/dev-with-warmup.mjs
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { warmDevServer } from './warm-dev-server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const nextEntry = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

/** @type {import('node:child_process').ChildProcess | null} */
let child = null
let warmupStarted = false
let exiting = false

function startWarmup() {
  if (warmupStarted || exiting) return
  warmupStarted = true

  void warmDevServer().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[dev-warmup] ${message}`)
  })
}

/**
 * @param {Buffer | string} chunk
 */
function handleOutput(chunk) {
  const text = chunk.toString()
  if (!warmupStarted && text.includes('Ready')) {
    startWarmup()
  }
}

function shutdown(code = 0) {
  if (exiting) return
  exiting = true
  if (child && !child.killed) {
    child.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => { shutdown(130) })
process.on('SIGTERM', () => { shutdown(143) })

child = spawn(process.execPath, [nextEntry, 'dev', '--turbopack'], {
  cwd: ROOT,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
})

child.stdout?.on('data', (chunk) => {
  process.stdout.write(chunk)
  handleOutput(chunk)
})

child.stderr?.on('data', (chunk) => {
  process.stderr.write(chunk)
  handleOutput(chunk)
})

child.on('error', (err) => {
  console.error('[dev-with-warmup] 无法启动 next dev:', err.message)
  shutdown(1)
})

child.on('exit', (code, signal) => {
  if (exiting) return
  if (signal) {
    shutdown(130)
    return
  }
  shutdown(code ?? 1)
})

// Ready 日志格式变更时的兜底：端口可用即开始预热
setTimeout(() => {
  if (!warmupStarted && !exiting) {
    startWarmup()
  }
}, 3_000)
