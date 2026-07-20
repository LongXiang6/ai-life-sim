/**
 * @module route.ts
 * @description 客户端错误日志 API 路由 —— POST 接收客户端日志
 * @mod app
 *
 * 功能：
 *   - 按日期写入 AI_LOG_DIR/client-events/
 *   - 如有 raw 字段，额外保存完整原文到 AI_LOG_DIR/client-raw/
 *   - 与 AI 代理日志共享脱敏、轮转与过期清理策略
 */

import { z } from 'zod'

import {
  appendSourceJsonLine,
  appendServerJsonLine,
  appendServerText,
  getServerRequestSource,
  safeLogSegment,
  type ServerRequestSource,
  writeSourceLogFile,
  writeServerLogFile,
} from '@/core/logger/server-log-store'

const MAX_BODY_SIZE = 4 * 1024 * 1024

/** 请求体 Zod 校验 */
const ClientLogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  module: z.string(),
  message: z.string(),
  timestamp: z.number(),
  args: z.array(z.unknown()).optional(),
  raw: z.string().optional(),
  error: z.string().optional(),
  errorName: z.string().optional(),
  stack: z.string().optional(),
  requestId: z.string().optional(),
  eventType: z.enum(['log', 'exception', 'user_action']).optional(),
  action: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

type ClientLogEntry = z.infer<typeof ClientLogSchema>

/** 检查是否禁用 */
function isDisabled(): boolean {
  return process.env.AI_DIAGNOSTIC_LOGS_ENABLED === 'false'
}

/** 写入日志（异步） */
async function writeLogAsync(entry: ClientLogEntry, source: ServerRequestSource): Promise<void> {
  const receivedAt = Date.now()
  const dateStr = new Date(receivedAt).toISOString().slice(0, 10)
  const storedEntry = {
    ...entry,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    receivedAt,
  }

  // 格式化日志行
  const time = new Date(entry.timestamp).toISOString()
  const argsStr = entry.args ? ` | args: ${JSON.stringify(entry.args)}` : ''
  const errorStr = entry.error ? ` | error: ${entry.error}` : ''
  const stackStr = entry.stack ? ` | stack: ${entry.stack}` : ''
  const actionStr = entry.action ? ` | action: ${entry.action}` : ''
  const requestIdStr = entry.requestId ? ` | requestId: ${entry.requestId}` : ''
  const diagnosticCodeStr = source.diagnosticCode ? ` [${source.diagnosticCode}]` : ''
  const line = `[${time}] [${entry.level.toUpperCase()}] [${entry.module}] [${source.ip}]${diagnosticCodeStr} ${entry.message}${requestIdStr}${actionStr}${argsStr}${errorStr}${stackStr}\n`

  await Promise.all([
    appendServerText(`client-events/client-errors-${dateStr}.log`, line),
    appendServerJsonLine(`client-events/client-events-${dateStr}.jsonl`, storedEntry),
    appendSourceJsonLine(source, `client-events-${dateStr}.jsonl`, storedEntry),
  ])

  // 如果有 raw 字段，额外保存完整原文
  if (entry.raw) {
    const timestamp = new Date(entry.timestamp).toISOString().replace(/[:.]/g, '-')
    const rawFile = `${safeLogSegment(entry.module)}-${entry.level}-${timestamp}.txt`
    const rawContent = [
      `Timestamp: ${time}`,
      `Module: ${entry.module}`,
      `Level: ${entry.level}`,
      `Source IP: ${source.ip}`,
      ...(source.diagnosticCode ? [`Diagnostic Code: ${source.diagnosticCode}`] : []),
      ...(entry.requestId ? [`Request ID: ${entry.requestId}`] : []),
      `Message: ${entry.message}`,
      '',
      '--- Raw Content ---',
      entry.raw,
    ].join('\n')
    await Promise.all([
      writeServerLogFile(`client-raw/${rawFile}`, rawContent),
      writeSourceLogFile(source, `client-raw/${rawFile}`, rawContent),
    ])
  }
}

/**
 * 接收客户端错误日志
 * @param request - HTTP 请求
 * @returns 操作结果
 */
export async function POST(request: Request): Promise<Response> {
  if (isDisabled()) {
    return Response.json({ error: '日志已禁用' }, { status: 403 })
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
    const entry = ClientLogSchema.parse(raw)
    await writeLogAsync(entry, getServerRequestSource(request))
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: '请求体格式不正确' }, { status: 400 })
  }
}
