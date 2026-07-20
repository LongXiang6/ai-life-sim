/**
 * @module route.ts
 * @description AI 调试日志 API 路由 —— POST 写入 / GET 查询 / DELETE 清理
 * @mod app
 *
 * 日志分类：
 *   - narrative-rounds   叙事轮次
 *   - world-init         世界初始化
 *   - talent-generate    天赋生成
 *   - epilogue           结语/来世
 *   - background-events  背景事件
 *
 * 存储策略：
 *   - 每类每天一个固定字段 JSONL 行表
 *   - 完整 Prompt、响应与 meta 按内容哈希去重并 gzip 保存
 *   - 与服务端代理日志共享按天数、总容量和单文件大小的轮转清理
 *   - 受 NEXT_PUBLIC_DISABLE_DEBUG_LOGS 环境变量控制
 *   - 完整保留 AI 输入/输出（不截断）
 */

import { z } from 'zod'
import path from 'path'
import { randomUUID } from 'crypto'

import {
  appendSourceJsonLine,
  appendServerJsonLine,
  getServerRequestSource,
  getServerLogRoot,
  readServerLogContent,
  storeServerLogContent,
  type ServerLogContentRef,
  type ServerRequestSource,
} from '@/core/logger/server-log-store'

const MAX_BODY_SIZE = 8 * 1024 * 1024

/** 请求体 Zod 校验 */
const DebugLogSchema = z.object({
  category: z.enum(['narrative-rounds', 'world-init', 'talent-generate', 'epilogue', 'background-events']),
  timestamp: z.number(),
  round: z.number().optional(),
  age: z.number().optional(),
  era: z.string().optional(),
  prompt: z.string().optional(),
  response: z.string().optional(),
  requestId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

type DebugLogEntry = z.infer<typeof DebugLogSchema>

/** 日志正文用：带时区说明的北京时间 */
function formatBeijingLogTime(ts: number): string {
  const d = new Date(ts + 8 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${ms} (北京时间)`
}

/** 获取分类目录路径 */
function getCategoryDir(category: string): string {
  return path.join(getServerLogRoot(), 'ai-debug', category)
}

/** 检查是否禁用 */
function isWriteDisabled(): boolean {
  return process.env.AI_DIAGNOSTIC_LOGS_ENABLED === 'false'
}

function isPublicReadDisabled(): boolean {
  return process.env.NODE_ENV === 'production'
    || process.env.NEXT_PUBLIC_DISABLE_DEBUG_LOGS === 'true'
}

/** 写入日志条目（每个调用创建独立文件） */
async function writeLogEntry(
  category: string,
  entry: DebugLogEntry,
  source: ServerRequestSource,
): Promise<void> {
  const receivedAt = Date.now()
  const [promptRef, responseRef, metaRef] = await Promise.all([
    entry.prompt === undefined ? null : storeServerLogContent(entry.prompt, 'text'),
    entry.response === undefined ? null : storeServerLogContent(entry.response, 'text'),
    entry.meta === undefined ? null : storeServerLogContent(entry.meta, 'json'),
  ])
  const date = new Date(receivedAt).toISOString().slice(0, 10)
  const relativePath = `ai-debug/${category}/${category}-${date}.jsonl`
  const meta = entry.meta ?? {}
  const record = {
    schemaVersion: 2,
    eventId: randomUUID(),
    timestamp: new Date(entry.timestamp).toISOString(),
    clientTimestamp: entry.timestamp,
    receivedAt,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    category,
    requestId: entry.requestId,
    round: entry.round,
    age: entry.age,
    era: entry.era,
    model: meta.model,
    callKind: meta.callKind,
    strategy: meta.strategy,
    pool: meta.pool,
    cacheHitTokens: meta.cacheHitTokens,
    cacheMissTokens: meta.cacheMissTokens,
    cacheHitRate: meta.cacheHitRate,
    completionTokens: meta.completionTokens,
    maxTokens: meta.maxTokens,
    finishReason: meta.finishReason,
    failed: meta.failed,
    failureReason: meta.failureReason,
    validationPassed: meta.validationPassed,
    validationError: meta.validationError,
    promptChars: entry.prompt?.length,
    responseChars: entry.response?.length,
    promptRef: promptRef ?? undefined,
    responseRef: responseRef ?? undefined,
    metaRef: metaRef ?? undefined,
    contentWriteFailed: (
      (entry.prompt !== undefined && !promptRef)
      || (entry.response !== undefined && !responseRef)
      || (entry.meta !== undefined && !metaRef)
    ) || undefined,
  }
  await Promise.all([
    appendServerJsonLine(relativePath, record),
    appendSourceJsonLine(source, `ai-debug-index-${date}.jsonl`, record),
  ])
}

function isContentRef(value: unknown): value is ServerLogContentRef {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as ServerLogContentRef).storage === 'sha256-gzip'
    && typeof (value as ServerLogContentRef).path === 'string',
  )
}

function buildMetaLines(meta: Record<string, unknown>): string[] {
  const lines: string[] = []
  if (meta.trigger) lines.push(`触发位置: ${meta.trigger}`)
  if (meta.callKind) lines.push(`调用类型: ${meta.callKind}`)
  if (meta.strategy) lines.push(`KV策略: ${meta.strategy}`)
  if (meta.pool) lines.push(`缓存池: ${meta.pool}`)
  if (meta.model) lines.push(`模型: ${meta.model}`)
  if (meta.cacheHitTokens !== undefined) lines.push(`缓存命中 tokens: ${meta.cacheHitTokens}`)
  if (meta.cacheMissTokens !== undefined) lines.push(`缓存未命中 tokens: ${meta.cacheMissTokens}`)
  if (meta.cacheHitRate !== undefined) lines.push(`命中率: ${meta.cacheHitRate}%`)
  if (meta.completionTokens !== undefined) lines.push(`输出 tokens: ${meta.completionTokens}`)
  if (meta.maxTokens !== undefined) lines.push(`maxTokens 预算: ${meta.maxTokens}`)
  if (meta.truncated === true) lines.push('截断: 是（可能触顶 maxTokens）')
  if (meta.finishReason) lines.push(`finish_reason: ${meta.finishReason}`)
  if (meta.failed) lines.push('状态: 调用失败')
  if (meta.failureReason) lines.push(`失败原因: ${meta.failureReason}`)
  if (meta.validationPassed === false) lines.push('校验: 失败')
  if (meta.validationError) lines.push(`校验错误: ${meta.validationError}`)
  return lines
}

async function formatStoredDebugEntry(record: Record<string, unknown>): Promise<string> {
  const [prompt, response, restoredMeta] = await Promise.all([
    isContentRef(record.promptRef) ? readServerLogContent(record.promptRef) : undefined,
    isContentRef(record.responseRef) ? readServerLogContent(record.responseRef) : undefined,
    isContentRef(record.metaRef) ? readServerLogContent(record.metaRef) : undefined,
  ])
  const meta = restoredMeta && typeof restoredMeta === 'object' && !Array.isArray(restoredMeta)
    ? restoredMeta as Record<string, unknown>
    : {}
  const clientTimestamp = typeof record.clientTimestamp === 'number'
    ? record.clientTimestamp
    : Date.parse(String(record.timestamp ?? ''))
  return [
    `时间: ${formatBeijingLogTime(clientTimestamp)}`,
    `服务端接收: ${new Date(Number(record.receivedAt)).toISOString()}`,
    `来源 IP: ${String(record.sourceIp ?? 'unknown')}`,
    record.diagnosticCode ? `诊断编号: ${record.diagnosticCode}` : '',
    record.requestId ? `请求 ID: ${record.requestId}` : '',
    record.round !== undefined ? `轮次: ${record.round} | 年龄: ${record.age ?? '?'} | 纪元: ${record.era ?? '?'}` : '',
    Object.keys(meta).length > 0 ? `【元信息】\n${buildMetaLines(meta).join('\n') || JSON.stringify(meta)}` : '',
    typeof prompt === 'string' ? `【发送给 AI】(${prompt.length} 字符)\n${prompt}` : '',
    typeof response === 'string' ? `【AI 返回】(${response.length} 字符)\n${response}` : '',
  ].filter(Boolean).join('\n\n') + '\n'
}

// ---- POST: 写入日志 ----

/**
 * 写入调试日志
 * @param request - HTTP 请求
 * @returns 操作结果
 */
export async function POST(request: Request): Promise<Response> {
  if (isWriteDisabled()) {
    return Response.json({ error: '调试日志已禁用' }, { status: 403 })
  }

  const bodyText = await request.text().catch(() => null)
  if (!bodyText) {
    return Response.json({ error: '请求体为空' }, { status: 400 })
  }
  if (Buffer.byteLength(bodyText) > MAX_BODY_SIZE) {
    return Response.json({ error: '请求体超大' }, { status: 413 })
  }

  try {
    const raw = JSON.parse(bodyText)
    const entry = DebugLogSchema.parse(raw)
    await writeLogEntry(entry.category, entry, getServerRequestSource(request))
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: '请求体格式不正确' }, { status: 400 })
  }
}

// ---- GET: 查询日志 ----

/**
 * 查询调试日志
 * @param request - HTTP 请求（查询参数：category, limit）
 * @returns 日志条目列表
 */
export async function GET(request: Request): Promise<Response> {
  if (isPublicReadDisabled()) {
    return Response.json({ error: '调试日志已禁用' }, { status: 403 })
  }

  const url = new URL(request.url)
  const category = url.searchParams.get('category') ?? 'narrative-rounds'
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

  const [{ existsSync, readdirSync, readFileSync }] = await Promise.all([
    import('fs'),
  ])
  const dir = getCategoryDir(category)

  if (!existsSync(dir)) {
    return Response.json({ entries: [], category })
  }

  // 读取最近的固定字段行表，再按内容引用还原开发视图。
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse()
  const records: Record<string, unknown>[] = []
  for (const file of files) {
    const lines = readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/u).filter(Boolean).reverse()
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        // 忽略未完整写入的末行。
      }
      if (records.length >= limit) break
    }
    if (records.length >= limit) break
  }
  const entries = await Promise.all(records.map(formatStoredDebugEntry))

  return Response.json({ entries, category, total: entries.length })
}

// ---- DELETE: 清理日志 ----

/**
 * 清理调试日志
 * @param request - HTTP 请求（查询参数：category 指定分类，不传则清理全部）
 * @returns 操作结果
 */
export async function DELETE(request: Request): Promise<Response> {
  if (isPublicReadDisabled()) {
    return Response.json({ error: '调试日志已禁用' }, { status: 403 })
  }

  const url = new URL(request.url)
  const category = url.searchParams.get('category')

  const [{ existsSync, rmSync }] = await Promise.all([
    import('fs'),
  ])
  const baseDir = path.join(getServerLogRoot(), 'ai-debug')

  if (category) {
    // 删除指定分类目录
    const dir = getCategoryDir(category)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
  } else {
    // 删除所有分类
    if (existsSync(baseDir)) {
      rmSync(baseDir, { recursive: true, force: true })
    }
  }

  return Response.json({ ok: true })
}
