/**
 * @module development-system-diagnostic.server.ts
 * @description 本地开发系统诊断的明文 JSONL 写入器。
 */

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import type { DevelopmentSystemEvent } from './development-system-diagnostic'

declare global {
  var __developmentSystemDiagnosticQueue: Promise<void> | undefined
  var __developmentSystemDiagnosticLastCleanupAt: number | undefined
}
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const DIAGNOSTIC_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/u

function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDevelopmentSystemDiagnosticRoot(): string {
  const configured = process.env.DEVELOPMENT_SYSTEM_DIAGNOSTIC_DIR?.trim()
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), '.data', 'development-diagnostics')
}

export function getDevelopmentSystemDiagnosticPath(now = new Date()): string {
  return path.join(getDevelopmentSystemDiagnosticRoot(), `${localDateKey(now)}.jsonl`)
}

/** 删除前天及更早的诊断文件，只保留昨天和今天。 */
export async function cleanupDevelopmentSystemDiagnosticsNow(now = new Date()): Promise<void> {
  const root = getDevelopmentSystemDiagnosticRoot()
  const yesterday = new Date(now)
  yesterday.setHours(0, 0, 0, 0)
  yesterday.setDate(yesterday.getDate() - 1)
  const oldestRetainedKey = localDateKey(yesterday)
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  })
  await Promise.all(entries.flatMap((entry) => (
    entry.isFile()
      && DIAGNOSTIC_FILE_PATTERN.test(entry.name)
      && entry.name.slice(0, 10) < oldestRetainedKey
      ? [fs.promises.unlink(path.join(root, entry.name))]
      : []
  )))
}

async function maybeCleanup(now: Date): Promise<void> {
  const current = now.getTime()
  const last = globalThis.__developmentSystemDiagnosticLastCleanupAt ?? 0
  if (current - last < CLEANUP_INTERVAL_MS) return
  globalThis.__developmentSystemDiagnosticLastCleanupAt = current
  await cleanupDevelopmentSystemDiagnosticsNow(now)
}

/**
 * 在开发环境把事件原样序列化为明文 JSONL；生产环境不创建该本地诊断副本。
 */
export async function appendDevelopmentSystemEvents(
  events: readonly DevelopmentSystemEvent[],
): Promise<void> {
  if (process.env.NODE_ENV !== 'development' || events.length === 0) return
  const now = new Date()
  const filePath = getDevelopmentSystemDiagnosticPath(now)
  const previous = globalThis.__developmentSystemDiagnosticQueue ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await maybeCleanup(now)
    const lines = events.map((event) => JSON.stringify(event)).join('\n') + '\n'
    await fs.promises.appendFile(filePath, lines, 'utf8')
  })
  globalThis.__developmentSystemDiagnosticQueue = next
  try {
    await next
  } finally {
    if (globalThis.__developmentSystemDiagnosticQueue === next) {
      globalThis.__developmentSystemDiagnosticQueue = undefined
    }
  }
}
