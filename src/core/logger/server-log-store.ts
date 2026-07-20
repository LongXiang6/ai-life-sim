/**
 * @module server-log-store.ts
 * @description 服务端持久诊断日志存储：安全路径、密钥脱敏、轮转与过期清理
 * @mod core
 */

import 'server-only'

import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { gzip, gunzip } from 'zlib'

import {
  redactSensitiveData,
  type ServerRequestSource,
} from './server-log-safety'

export {
  getServerRequestSource,
  redactSensitiveData,
  safeLogSegment,
  type ServerRequestSource,
} from './server-log-safety'

const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024
const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000
const RETENTION_EXEMPT_ROOT_DIRECTORIES = new Set(['diagnostic-identities'])
const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

let lastCleanupAt = 0
let cleanupPromise: Promise<void> | null = null

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function getRetentionMs(): number {
  return readPositiveInteger('AI_LOG_RETENTION_DAYS', DEFAULT_RETENTION_DAYS) * 24 * 60 * 60 * 1000
}

function getMaxTotalBytes(): number {
  return readPositiveInteger('AI_LOG_MAX_TOTAL_BYTES', DEFAULT_MAX_TOTAL_BYTES)
}

function getMaxFileBytes(): number {
  return readPositiveInteger('AI_LOG_MAX_FILE_BYTES', DEFAULT_MAX_FILE_BYTES)
}

/** 日志根目录可通过 AI_LOG_DIR 指向发布目录外，避免原子部署时被一起移走。 */
export function getServerLogRoot(): string {
  const configured = process.env.AI_LOG_DIR?.trim()
  if (configured) return path.resolve(configured)
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'logs')
}

function resolveLogPath(relativePath: string): string {
  const root = getServerLogRoot()
  const target = path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`日志路径越界: ${relativePath}`)
  }
  return target
}

export type ServerLogContentFormat = 'text' | 'json'

export interface ServerLogContentRef {
  schemaVersion: 2
  storage: 'sha256-gzip'
  algorithm: 'sha256'
  hash: string
  path: string
  format: ServerLogContentFormat
  originalBytes: number
  compressedBytes: number
}

function serializeLogContent(
  value: unknown,
  format: ServerLogContentFormat,
): Buffer {
  const redacted = redactSensitiveData(value)
  if (format === 'json') return Buffer.from(JSON.stringify(redacted), 'utf8')
  return Buffer.from(String(redacted ?? ''), 'utf8')
}

/**
 * 将大段诊断内容按 SHA-256 寻址并 gzip 保存；相同内容只保留一份。
 * 重复命中会刷新 mtime，保证仍被近期事件引用的内容不会按保留期提前清理。
 */
export async function storeServerLogContent(
  value: unknown,
  format: ServerLogContentFormat,
): Promise<ServerLogContentRef | null> {
  try {
    const serialized = serializeLogContent(value, format)
    const hash = createHash('sha256')
      .update(format)
      .update('\0')
      .update(serialized)
      .digest('hex')
    const extension = format === 'json' ? 'json.gz' : 'txt.gz'
    const relativePath = `content/sha256/${hash.slice(0, 2)}/${hash}.${extension}`
    const target = resolveLogPath(relativePath)
    await ensureSecureDirectory(path.dirname(target))

    let compressedBytes = 0
    try {
      const compressed = await gzipAsync(serialized, { level: 9 })
      compressedBytes = compressed.length
      await fs.writeFile(target, compressed, { mode: 0o600, flag: 'wx' })
      await fs.chmod(target, 0o600).catch(() => undefined)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
      if (code !== 'EEXIST') throw error
      const now = new Date()
      await fs.utimes(target, now, now).catch(() => undefined)
      compressedBytes = (await fs.stat(target)).size
    }

    scheduleCleanup()
    return {
      schemaVersion: 2,
      storage: 'sha256-gzip',
      algorithm: 'sha256',
      hash,
      path: relativePath,
      format,
      originalBytes: serialized.length,
      compressedBytes,
    }
  } catch (error) {
    console.error('[server-log-store] 内容寻址写入失败', error)
    return null
  }
}

/** 供私有运维与回归测试还原内容；公开 API 不得调用。 */
export async function readServerLogContent(reference: ServerLogContentRef): Promise<unknown> {
  if (reference.storage !== 'sha256-gzip' || reference.algorithm !== 'sha256') {
    throw new Error('不支持的日志内容引用')
  }
  const target = resolveLogPath(reference.path)
  const serialized = await gunzipAsync(await fs.readFile(target))
  const digest = createHash('sha256')
    .update(reference.format)
    .update('\0')
    .update(serialized)
    .digest('hex')
  if (digest !== reference.hash) throw new Error('日志内容哈希校验失败')
  const text = serialized.toString('utf8')
  return reference.format === 'json' ? JSON.parse(text) : text
}

/** 在同一安全根目录下同时写入按 IP 与玩家诊断编号分类的 JSONL。 */
export async function appendSourceJsonLine(
  source: ServerRequestSource,
  relativePath: string,
  value: unknown,
): Promise<boolean> {
  const writes = [appendServerJsonLine(`sources/${source.sourceId}/${relativePath}`, value)]
  if (source.diagnosticCode) {
    writes.push(appendServerJsonLine(`players/${source.diagnosticCode}/${relativePath}`, value))
  }
  const results = await Promise.all(writes)
  return results.every(Boolean)
}

async function ensureSecureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.chmod(dir, 0o700).catch(() => undefined)
}

async function rotateIfNeeded(target: string, incomingBytes: number): Promise<void> {
  try {
    const stat = await fs.stat(target)
    if (stat.size + incomingBytes <= getMaxFileBytes()) return
    const parsed = path.parse(target)
    const suffix = new Date().toISOString().replace(/[:.]/g, '-')
    await fs.rename(target, path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`))
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
    if (code !== 'ENOENT') throw error
  }
}

interface StoredFile {
  path: string
  size: number
  mtimeMs: number
}

async function collectStoredFiles(dir: string, output: StoredFile[]): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (
      dir === getServerLogRoot()
      && entry.isDirectory()
      && RETENTION_EXEMPT_ROOT_DIRECTORIES.has(entry.name)
    ) {
      continue
    }
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectStoredFiles(target, output)
    } else if (entry.isFile()) {
      const stat = await fs.stat(target).catch(() => null)
      if (stat) output.push({ path: target, size: stat.size, mtimeMs: stat.mtimeMs })
    }
  }
}

export type ServerLogReservationResult = 'created' | 'exists' | 'failed'

/** 原子创建不可覆盖的服务端文件，用于占用短诊断编号。 */
export async function reserveServerLogFile(
  relativePath: string,
  value: unknown,
): Promise<ServerLogReservationResult> {
  try {
    const target = resolveLogPath(relativePath)
    const serialized = JSON.stringify(redactSensitiveData(value), null, 2)
    await ensureSecureDirectory(path.dirname(target))
    await fs.writeFile(target, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.chmod(target, 0o600).catch(() => undefined)
    return 'created'
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
    if (code === 'EEXIST') return 'exists'
    console.error('[server-log-store] 原子保留文件失败', error)
    return 'failed'
  }
}

/** 将完整文件同时写入按 IP 与玩家诊断编号分类的目录。 */
export async function writeSourceLogFile(
  source: ServerRequestSource,
  relativePath: string,
  content: string | Buffer | unknown,
): Promise<boolean> {
  const writes = [writeServerLogFile(`sources/${source.sourceId}/${relativePath}`, content)]
  if (source.diagnosticCode) {
    writes.push(writeServerLogFile(`players/${source.diagnosticCode}/${relativePath}`, content))
  }
  const results = await Promise.all(writes)
  return results.every(Boolean)
}

async function cleanupServerLogs(): Promise<void> {
  const root = getServerLogRoot()
  const files: StoredFile[] = []
  await collectStoredFiles(root, files)

  const expiryCutoff = Date.now() - getRetentionMs()
  const retained: StoredFile[] = []
  for (const file of files) {
    if (file.mtimeMs < expiryCutoff) {
      await fs.unlink(file.path).catch(() => undefined)
    } else {
      retained.push(file)
    }
  }

  const maxTotalBytes = getMaxTotalBytes()
  let totalBytes = retained.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes <= maxTotalBytes) return

  retained.sort((a, b) => a.mtimeMs - b.mtimeMs)
  for (const file of retained) {
    if (totalBytes <= maxTotalBytes) break
    const removed = await fs.unlink(file.path).then(() => true).catch(() => false)
    if (removed) totalBytes -= file.size
  }
}

function scheduleCleanup(): void {
  if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS || cleanupPromise) return
  lastCleanupAt = Date.now()
  cleanupPromise = cleanupServerLogs()
    .catch((error) => console.error('[server-log-store] 日志清理失败', error))
    .finally(() => {
      cleanupPromise = null
    })
}

/** 追加一条完整 JSONL 记录；写入失败只影响诊断能力，不影响玩家主流程。 */
export async function appendServerJsonLine(relativePath: string, value: unknown): Promise<boolean> {
  try {
    const target = resolveLogPath(relativePath)
    const line = `${JSON.stringify(redactSensitiveData(value))}\n`
    const bytes = Buffer.byteLength(line)
    await ensureSecureDirectory(path.dirname(target))
    await rotateIfNeeded(target, bytes)
    await fs.appendFile(target, line, { encoding: 'utf8', mode: 0o600 })
    await fs.chmod(target, 0o600).catch(() => undefined)
    scheduleCleanup()
    return true
  } catch (error) {
    console.error('[server-log-store] JSONL 写入失败', error)
    return false
  }
}

/** 追加纯文本日志，沿用同一安全目录、轮转与清理策略。 */
export async function appendServerText(relativePath: string, content: string): Promise<boolean> {
  try {
    const target = resolveLogPath(relativePath)
    const redacted = String(redactSensitiveData(content))
    const bytes = Buffer.byteLength(redacted)
    await ensureSecureDirectory(path.dirname(target))
    await rotateIfNeeded(target, bytes)
    await fs.appendFile(target, redacted, { encoding: 'utf8', mode: 0o600 })
    await fs.chmod(target, 0o600).catch(() => undefined)
    scheduleCleanup()
    return true
  } catch (error) {
    console.error('[server-log-store] 文本写入失败', error)
    return false
  }
}

/** 写入单独的完整诊断文件；适合上游原始错误或一次调用的完整快照。 */
export async function writeServerLogFile(
  relativePath: string,
  content: string | Buffer | unknown,
): Promise<boolean> {
  try {
    const target = resolveLogPath(relativePath)
    const serialized = typeof content === 'string' || Buffer.isBuffer(content)
      ? String(redactSensitiveData(Buffer.isBuffer(content) ? content.toString('utf8') : content))
      : JSON.stringify(redactSensitiveData(content), null, 2)
    await ensureSecureDirectory(path.dirname(target))
    await fs.writeFile(target, serialized, { mode: 0o600 })
    await fs.chmod(target, 0o600).catch(() => undefined)
    scheduleCleanup()
    return true
  } catch (error) {
    console.error('[server-log-store] 文件写入失败', error)
    return false
  }
}
