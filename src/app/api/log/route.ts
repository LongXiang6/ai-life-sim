/**
 * @module route.ts
 * @description 客户端错误日志 API 路由 —— POST 接收客户端日志
 * @mod app
 *
 * 功能：
 *   - 按日期写入固定字段 JSONL 行表
 *   - 大段 args/context/raw 以 SHA-256 内容引用单份 gzip 保存
 *   - 与 AI 代理日志共享脱敏、轮转与过期清理策略
 */

import { randomUUID } from 'crypto'
import { z } from 'zod'

import {
  appendSourceJsonLine,
  appendServerJsonLine,
  getServerRequestSource,
  storeServerLogContent,
  type ServerRequestSource,
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
  const { args, context, raw, ...inlineEntry } = entry
  const [argsRef, contextRef, rawRef] = await Promise.all([
    args === undefined ? null : storeServerLogContent(args, 'json'),
    context === undefined ? null : storeServerLogContent(context, 'json'),
    raw === undefined ? null : storeServerLogContent(raw, 'text'),
  ])
  const storedEntry = {
    schemaVersion: 2,
    eventId: randomUUID(),
    ...inlineEntry,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    receivedAt,
    path: typeof context?.path === 'string' ? context.path : undefined,
    diagnosticSessionId: typeof context?.diagnosticSessionId === 'string'
      ? context.diagnosticSessionId
      : undefined,
    hasEnvironmentSnapshot: Boolean(context?.environmentSnapshot) || undefined,
    argsCount: args?.length,
    argsRef: argsRef ?? undefined,
    contextRef: contextRef ?? undefined,
    rawChars: raw?.length,
    rawRef: rawRef ?? undefined,
    contentWriteFailed: (
      (args !== undefined && !argsRef)
      || (context !== undefined && !contextRef)
      || (raw !== undefined && !rawRef)
    ) || undefined,
  }

  await Promise.all([
    appendServerJsonLine(`client-events/client-events-${dateStr}.jsonl`, storedEntry),
    appendSourceJsonLine(source, `client-events-${dateStr}.jsonl`, storedEntry),
  ])
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
