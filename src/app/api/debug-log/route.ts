/**
 * @module route.ts
 * @description 明文 SQLite 日志 API：AI 日志写入与开发查看
 * @mod app
 */

import { z } from 'zod'

import {
  appendServerLogEntry,
  deleteServerLogEntries,
  getServerRequestSource,
  queryServerLogEntries,
} from '@/core/logger/server-log-store'

const MAX_BODY_SIZE = 8 * 1024 * 1024
const DEBUG_CATEGORIES = [
  'narrative-rounds',
  'world-init',
  'talent-generate',
  'epilogue',
  'background-events',
] as const

const DebugLogSchema = z.object({
  category: z.enum(DEBUG_CATEGORIES),
  timestamp: z.number(),
  round: z.number().optional(),
  age: z.number().optional(),
  era: z.string().optional(),
  prompt: z.string().optional(),
  response: z.string().optional(),
  requestId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

function isWriteDisabled(): boolean {
  return process.env.AI_DIAGNOSTIC_LOGS_ENABLED === 'false'
}

function isPublicReadDisabled(): boolean {
  return process.env.NODE_ENV === 'production'
    || process.env.NEXT_PUBLIC_DISABLE_DEBUG_LOGS === 'true'
}

export async function POST(request: Request): Promise<Response> {
  if (isWriteDisabled()) {
    return Response.json({ error: '调试日志已禁用' }, { status: 403 })
  }

  const bodyText = await request.text().catch(() => null)
  if (!bodyText) return Response.json({ error: '请求体为空' }, { status: 400 })
  if (Buffer.byteLength(bodyText) > MAX_BODY_SIZE) {
    return Response.json({ error: '请求体超大' }, { status: 413 })
  }

  try {
    const entry = DebugLogSchema.parse(JSON.parse(bodyText))
    const meta = entry.meta ?? {}
    const written = await appendServerLogEntry({
      createdAt: Date.now(),
      clientTimestamp: entry.timestamp,
      entryType: 'ai-call',
      category: entry.category,
      level: meta.failed === true || meta.validationPassed === false ? 'error' : 'info',
      module: 'ai-debug',
      message: typeof meta.callKind === 'string' ? meta.callKind : entry.category,
      requestId: entry.requestId,
      source: getServerRequestSource(request),
      round: entry.round,
      age: entry.age,
      era: entry.era,
      model: typeof meta.model === 'string' ? meta.model : undefined,
      callKind: typeof meta.callKind === 'string' ? meta.callKind : undefined,
      strategy: typeof meta.strategy === 'string' ? meta.strategy : undefined,
      prompt: entry.prompt,
      response: entry.response,
      error: typeof meta.validationError === 'string'
        ? meta.validationError
        : typeof meta.failureReason === 'string' ? meta.failureReason : undefined,
      meta,
      payload: entry,
    })
    return written
      ? Response.json({ ok: true })
      : Response.json({ error: '日志写入失败' }, { status: 500 })
  } catch {
    return Response.json({ error: '请求体格式不正确' }, { status: 400 })
  }
}

export async function GET(request: Request): Promise<Response> {
  if (isPublicReadDisabled()) {
    return Response.json({ error: '调试日志已禁用' }, { status: 403 })
  }

  const url = new URL(request.url)
  const category = url.searchParams.get('category')?.trim() || undefined
  const entryType = url.searchParams.get('entryType')?.trim() || undefined
  const level = url.searchParams.get('level')?.trim() || undefined
  const accountId = url.searchParams.get('accountId')?.trim() || undefined
  const deviceProvenanceId = url.searchParams.get('deviceProvenanceId')?.trim() || undefined
  const requestId = url.searchParams.get('requestId')?.trim() || undefined
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '100', 10)
  const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10)
  const result = queryServerLogEntries({
    category,
    entryType,
    level,
    accountId,
    deviceProvenanceId,
    requestId,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  })
  return Response.json(result)
}

export async function DELETE(request: Request): Promise<Response> {
  if (isPublicReadDisabled()) {
    return Response.json({ error: '调试日志已禁用' }, { status: 403 })
  }
  const url = new URL(request.url)
  const category = url.searchParams.get('category')?.trim() || undefined
  const entryType = url.searchParams.get('entryType')?.trim() || undefined
  const deleted = deleteServerLogEntries({ category, entryType })
  return Response.json({ ok: true, deleted })
}
