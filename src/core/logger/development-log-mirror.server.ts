/**
 * Purpose: Persist local-development AI message mirrors without affecting proxy delivery or database logs.
 * Owner: core:logger
 * Responsibility: Development-only text files, Beijing timestamps, and mirror-file retention only.
 */

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import { safeLogSegment } from './server-log-safety'

type DevelopmentLogMirrorDirection = '发送' | '接收'

interface DevelopmentLogMirrorInput {
  callKind: string
  direction: DevelopmentLogMirrorDirection
  text: string
}

const MIRROR_RETENTION_MS = 3 * 24 * 60 * 60 * 1000

declare global {
  var __developmentLogMirrorLastTimestamp: number | undefined
}

export function getDevelopmentLogMirrorRoot(): string {
  return path.join(process.cwd(), 'docs', 'logs')
}

function nextMirrorTimestamp(now: Date): Date {
  const current = now.getTime()
  const previous = globalThis.__developmentLogMirrorLastTimestamp ?? 0
  const timestamp = Math.max(current, previous + 1)
  globalThis.__developmentLogMirrorLastTimestamp = timestamp
  return new Date(timestamp)
}

function formatBeijingTimestamp(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '00'
  return `${part('year')}-${part('month')}-${part('day')}_${part('hour')}-${part('minute')}-${part('second')}-${part('fractionalSecond')}`
}

async function cleanupMirrorFiles(root: string, now: Date): Promise<void> {
  const cutoff = now.getTime() - MIRROR_RETENTION_MS
  const callDirectories = await fs.promises.readdir(root, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  })

  await Promise.all(callDirectories.filter((entry) => entry.isDirectory()).map(async (directory) => {
    const directoryPath = path.join(root, directory.name)
    const files = await fs.promises.readdir(directoryPath, { withFileTypes: true })
    await Promise.all(files.filter((entry) => entry.isFile() && path.extname(entry.name) === '.txt').map(async (file) => {
      const filePath = path.join(directoryPath, file.name)
      const metadata = await fs.promises.stat(filePath)
      if (metadata.mtimeMs < cutoff) await fs.promises.unlink(filePath)
    }))
  }))
}

/** Writes one raw request or response text file when Next runs in local development. */
export async function writeDevelopmentLogMirror(input: DevelopmentLogMirrorInput, now = new Date()): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return

  const root = getDevelopmentLogMirrorRoot()
  const directory = path.join(root, safeLogSegment(input.callKind))
  const timestamp = formatBeijingTimestamp(nextMirrorTimestamp(now))
  await fs.promises.mkdir(directory, { recursive: true })
  await cleanupMirrorFiles(root, now)
  await fs.promises.writeFile(
    path.join(directory, `${input.direction}-${timestamp}.txt`),
    input.text,
    { encoding: 'utf8', flag: 'wx' },
  )
}

/** Keeps the mirror best-effort so diagnostics never delay or fail an AI call. */
export function scheduleDevelopmentLogMirror(input: DevelopmentLogMirrorInput): void {
  void writeDevelopmentLogMirror(input).catch((error) => {
    console.error('[development-log-mirror] 写入失败', error)
  })
}
