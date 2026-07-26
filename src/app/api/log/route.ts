/**
 * @module route.ts
 * @description 客户端系统诊断与错误日志明文 SQLite 写入入口
 * @mod app
 */

import { z } from 'zod'

import {
  appendServerLogEntry,
  getServerRequestSource,
  type ServerRequestSource,
} from '@/core/logger/server-log-store'

const MAX_BODY_SIZE = 4 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_COUNT = 120
const RATE_LIMIT_MAX_SOURCES = 4096
const USER_OPERATION_METRICS = new Set([
  'page_view',
  'narrative_advance',
  'time_step_selected',
  'branch_choice',
])
const recentLogRequests = new Map<string, { windowStartedAt: number; count: number }>()

function isRateLimited(sourceId: string, now: number): boolean {
  const current = recentLogRequests.get(sourceId)
  if (current && now - current.windowStartedAt < RATE_LIMIT_WINDOW_MS) {
    if (current.count >= RATE_LIMIT_COUNT) return true
    current.count += 1
    return false
  }
  if (current) recentLogRequests.delete(sourceId)
  for (const [key, bucket] of recentLogRequests) {
    if (now - bucket.windowStartedAt >= RATE_LIMIT_WINDOW_MS) recentLogRequests.delete(key)
  }
  while (recentLogRequests.size >= RATE_LIMIT_MAX_SOURCES) {
    const oldestKey = recentLogRequests.keys().next().value
    if (oldestKey === undefined) break
    recentLogRequests.delete(oldestKey)
  }
  recentLogRequests.set(sourceId, { windowStartedAt: now, count: 1 })
  return false
}

const StoryRepetitionMetricSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal('story_repetition'),
  lifeRunId: z.string().regex(/^life-[a-z0-9-]{8,80}$/u),
  round: z.number().int().min(1).max(1_000_000),
  windowSize: z.number().int().min(0).max(5),
  wordRepeatRate: z.number().min(0).max(1),
  maxRecentWordOverlap: z.number().min(0).max(1),
  maxRecentNgramSimilarity: z.number().min(0).max(1),
  qualityLevel: z.enum(['normal', 'watch', 'high']),
}).strict()

const ClientLogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  module: z.string(),
  message: z.string(),
  timestamp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  args: z.array(z.unknown()).optional(),
  raw: z.string().optional(),
  error: z.string().optional(),
  errorName: z.string().optional(),
  stack: z.string().optional(),
  requestId: z.string().optional(),
  eventType: z.enum(['log', 'exception', 'metric', 'user_action']).optional(),
  action: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  metric: z.unknown().optional(),
})

type ClientLogEntry = z.infer<typeof ClientLogSchema>

function isDisabled(): boolean {
  return process.env.AI_DIAGNOSTIC_LOGS_ENABLED === 'false'
}

function isUserOperation(entry: ClientLogEntry): boolean {
  if (entry.eventType === 'user_action' || entry.action !== undefined) return true
  if (entry.module === 'user-interface' || entry.module === 'navigation') return true
  const metricKind = entry.metric && typeof entry.metric === 'object' && 'kind' in entry.metric
    ? String((entry.metric as { kind?: unknown }).kind ?? '')
    : ''
  return USER_OPERATION_METRICS.has(metricKind)
}

function deriveStoryRepetitionQuality(metric: {
  maxRecentWordOverlap: number
  maxRecentNgramSimilarity: number
}): 'normal' | 'watch' | 'high' {
  if (metric.maxRecentWordOverlap >= 0.75 || metric.maxRecentNgramSimilarity >= 0.65) return 'high'
  if (metric.maxRecentWordOverlap >= 0.55 || metric.maxRecentNgramSimilarity >= 0.35) return 'watch'
  return 'normal'
}

async function writeLogAsync(entry: ClientLogEntry, source: ServerRequestSource): Promise<boolean> {
  let metric: z.infer<typeof StoryRepetitionMetricSchema> | undefined
  if (entry.metric !== undefined) {
    const parsed = StoryRepetitionMetricSchema.safeParse(entry.metric)
    if (parsed.success) {
      metric = {
        ...parsed.data,
        qualityLevel: deriveStoryRepetitionQuality(parsed.data),
      }
    }
  }

  return appendServerLogEntry({
    createdAt: Date.now(),
    clientTimestamp: entry.timestamp,
    entryType: metric ? 'quality-metric' : 'client-log',
    category: metric ? 'story-repetition' : 'client-diagnostic',
    level: metric ? 'info' : entry.level,
    module: metric ? 'story-quality' : entry.module,
    message: metric ? 'story_repetition' : entry.message,
    event: metric ? 'metric' : entry.eventType,
    requestId: entry.requestId,
    source,
    round: metric?.round,
    response: entry.raw,
    error: entry.error,
    stack: entry.stack,
    meta: entry.context,
    payload: {
      ...entry,
      metric,
    },
  })
}

export async function POST(request: Request): Promise<Response> {
  if (isDisabled()) return Response.json({ error: '日志已禁用' }, { status: 403 })

  const source = getServerRequestSource(request)
  if (isRateLimited(source.sourceId, Date.now())) {
    return Response.json(
      { error: '日志请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_MS / 1000) } },
    )
  }

  const bodyText = await request.text().catch(() => null)
  if (!bodyText) return Response.json({ error: '请求体为空' }, { status: 400 })
  if (Buffer.byteLength(bodyText) > MAX_BODY_SIZE) {
    return Response.json({ error: '请求体超大' }, { status: 413 })
  }

  try {
    const entry = ClientLogSchema.parse(JSON.parse(bodyText))
    if (isUserOperation(entry)) {
      return Response.json({ ok: true, ignored: 'user-operation' })
    }
    const written = await writeLogAsync(entry, source)
    return written
      ? Response.json({ ok: true })
      : Response.json({ error: '日志写入失败' }, { status: 500 })
  } catch {
    return Response.json({ error: '请求体格式不正确' }, { status: 400 })
  }
}
