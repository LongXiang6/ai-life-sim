/**
 * Purpose: Expose plaintext SQLite debug-log reads and safe projections.
 * Owner: app:api
 * Responsibility: Project queried proxy traces without credentials; writes belong to the canonical log routes.
 *
 * @module route.ts
 * @description 明文 SQLite 日志 API：只读开发查看
 * @mod app
 */

import { projectProxyTraceEntry } from '@/core/logger/debug-log-projection'
import {
  queryServerLogEntries,
} from '@/core/logger/server-log-store'

function isPublicReadDisabled(): boolean {
  return process.env.NODE_ENV === 'production'
    || process.env.NEXT_PUBLIC_DISABLE_DEBUG_LOGS === 'true'
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
  return Response.json({
    ...result,
    entries: result.entries.map((entry) => projectProxyTraceEntry(entry)),
  })
}
