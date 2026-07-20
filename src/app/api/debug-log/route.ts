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
 *   - 每次 AI 调用生成独立文件，文件名带时间戳
 *   - 路径：AI_LOG_DIR/ai-debug/{category}/{category}-{timestamp}-{uniqueId}.log
 *   - 与服务端代理日志共享按天数、总容量和单文件大小的轮转清理
 *   - 受 NEXT_PUBLIC_DISABLE_DEBUG_LOGS 环境变量控制
 *   - 完整保留 AI 输入/输出（不截断）
 */

import { z } from 'zod'
import { randomUUID } from 'crypto'
import path from 'path'

import {
  appendSourceJsonLine,
  getServerRequestSource,
  getServerLogRoot,
  safeLogSegment,
  type ServerRequestSource,
  writeServerLogFile,
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

/** 格式化为北京时间（UTC+8），用于日志正文与文件名 */
function formatBeijingTimestamp(ts: number): string {
  const d = new Date(ts + 8 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`
}

/** 日志正文用：带时区说明的北京时间 */
function formatBeijingLogTime(ts: number): string {
  const d = new Date(ts + 8 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${ms} (北京时间)`
}

/** 格式化时间戳为文件名（北京时间） */
function formatTimestamp(ts: number): string {
  return formatBeijingTimestamp(ts)
}

/** 获取分类目录路径 */
function getCategoryDir(category: string): string {
  return path.join(getServerLogRoot(), 'ai-debug', safeLogSegment(category))
}

/** 获取日志文件路径（独立文件，带时间戳） */
function getLogFilePath(category: string, timestamp: number): string {
  const dir = getCategoryDir(category)
  return path.join(dir, `${safeLogSegment(category)}-${formatTimestamp(timestamp)}-${randomUUID()}.log`)
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
  const logPath = getLogFilePath(category, receivedAt)

  // 格式化日志内容
  const time = formatBeijingLogTime(entry.timestamp)
  const metaLines: string[] = []
  if (entry.meta) {
    const m = entry.meta
    if (m.trigger) metaLines.push(`触发位置: ${m.trigger}`)
    if (m.callKind) metaLines.push(`调用类型: ${m.callKind}`)
    if (m.strategy) metaLines.push(`KV策略: ${m.strategy}`)
    if (m.pool) metaLines.push(`缓存池: ${m.pool}`)
    if (m.model) metaLines.push(`模型: ${m.model}`)
    if (m.cacheHitTokens !== undefined) metaLines.push(`缓存命中 tokens: ${m.cacheHitTokens}`)
    if (m.cacheMissTokens !== undefined) metaLines.push(`缓存未命中 tokens: ${m.cacheMissTokens}`)
    if (m.cacheHitRate !== undefined) metaLines.push(`命中率: ${m.cacheHitRate}%`)
    if (m.completionTokens !== undefined) metaLines.push(`输出 tokens: ${m.completionTokens}`)
    if (m.maxTokens !== undefined) metaLines.push(`maxTokens 预算: ${m.maxTokens}`)
    if (m.truncated === true) metaLines.push(`截断: 是（可能触顶 maxTokens）`)
    if (m.finishReason) metaLines.push(`finish_reason: ${m.finishReason}`)
    if (m.failed) metaLines.push(`状态: 调用失败`)
    if (m.failureReason) metaLines.push(`失败原因: ${m.failureReason}`)
    if (m.resilientAttempt !== undefined) {
      const max = m.resilientMaxAttempts ?? '?'
      metaLines.push(`resilient 尝试: ${m.resilientAttempt}/${max}`)
    }
    if (m.validationPassed === false) metaLines.push(`校验: 失败`)
    if (m.validationError) metaLines.push(`校验错误: ${m.validationError}`)
    if (m.validationDetails) metaLines.push(`校验详情: ${m.validationDetails}`)
    if (m.truncatedDetected === true) metaLines.push(`截断检测: 是`)
    if (m.w02Parsed === false) metaLines.push(`W02 解析: 失败`)
    if (m.w02Parsed === true) metaLines.push(`W02 解析: 成功`)
    if (m.worldTagsCount !== undefined) metaLines.push(`worldTags 数量: ${m.worldTagsCount}`)
    if (m.fallback) metaLines.push(`兜底: ${m.fallbackReason ?? 'local-fallback'}`)
    if (m.messageCount !== undefined) metaLines.push(`messages 条数: ${m.messageCount}`)
  }

  const lines = [
    `时间: ${time}`,
    `服务端接收: ${new Date(receivedAt).toISOString()}`,
    `来源 IP: ${source.ip}`,
    source.diagnosticCode ? `诊断编号: ${source.diagnosticCode}` : '',
    entry.requestId ? `请求 ID: ${entry.requestId}` : '',
    entry.round !== undefined ? `轮次: ${entry.round} | 年龄: ${entry.age ?? '?'} | 纪元: ${entry.era ?? '?'}` : '',
    metaLines.length > 0 ? `【元信息】\n${metaLines.join('\n')}` : entry.meta ? `【元信息】${JSON.stringify(entry.meta)}` : '',
    entry.prompt ? `【发送给 AI】(${entry.prompt.length} 字符)\n${entry.prompt}` : '',
    entry.response ? `【AI 返回】(${entry.response.length} 字符)\n${entry.response}` : '',
  ].filter(Boolean).join('\n\n') + '\n'

  const relativePath = path.relative(getServerLogRoot(), logPath)
  await Promise.all([
    writeServerLogFile(relativePath, lines),
    appendSourceJsonLine(source, `ai-debug-index-${new Date(receivedAt).toISOString().slice(0, 10)}.jsonl`, {
      timestamp: new Date(receivedAt).toISOString(),
      sourceIp: source.ip,
      sourceId: source.sourceId,
      diagnosticCode: source.diagnosticCode,
      category,
      requestId: entry.requestId,
      logFile: relativePath.replaceAll('\\', '/'),
    }),
  ])
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

  // 读取最近 N 个日志文件
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.log'))
    .sort()
    .reverse() // 最新的在前
    .slice(0, limit)

  const entries = files.map(f => {
    try {
      return readFileSync(path.join(dir, f), 'utf-8')
    } catch {
      return `[读取失败] ${f}`
    }
  })

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
