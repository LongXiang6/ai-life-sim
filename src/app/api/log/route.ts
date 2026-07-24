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
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_COUNT = 120
const RATE_LIMIT_MAX_SOURCES = 4096
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

function deriveStoryRepetitionQuality(metric: {
  wordRepeatRate: number
  maxRecentNgramSimilarity: number
}): 'normal' | 'watch' | 'high' {
  if (metric.wordRepeatRate >= 0.8 || metric.maxRecentNgramSimilarity >= 0.85) return 'high'
  if (metric.wordRepeatRate >= 0.6 || metric.maxRecentNgramSimilarity >= 0.7) return 'watch'
  return 'normal'
}

const AggregateUsageMetricSchema = z.discriminatedUnion('kind', [
  z.object({
    schemaVersion: z.literal(1),
    kind: z.literal('page_view'),
    page: z.string().startsWith('/').max(160),
  }).strict(),
  z.object({
    schemaVersion: z.literal(1),
    kind: z.literal('narrative_advance'),
    timeStepKey: z.string().min(1).max(32),
  }).strict(),
  z.object({
    schemaVersion: z.literal(1),
    kind: z.literal('time_step_selected'),
    timeStepKey: z.string().min(1).max(32),
  }).strict(),
  z.object({
    schemaVersion: z.literal(1),
    kind: z.literal('branch_choice'),
    branchChoiceType: z.enum(['custom', 'preset']),
    branchTerms: z.array(z.string().min(2).max(16)).max(12).optional(),
    branchChars: z.number().int().min(0).max(2000).optional(),
  }).strict(),
  z.object({
    schemaVersion: z.literal(2),
    kind: z.literal('story_repetition'),
    lifeRunId: z.string().regex(/^life-[a-z0-9-]{8,80}$/u),
    round: z.number().int().min(1).max(1000000),
    windowSize: z.number().int().min(0).max(5),
    wordRepeatRate: z.number().min(0).max(1),
    maxRecentWordOverlap: z.number().min(0).max(1),
    maxRecentNgramSimilarity: z.number().min(0).max(1),
    qualityLevel: z.enum(['normal', 'watch', 'high']),
  }).strict(),
]).superRefine((metric, context) => {
  if (metric.kind !== 'story_repetition') return
  if (metric.windowSize > Math.min(metric.round - 1, 5)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['windowSize'],
      message: 'windowSize exceeds the available prior rounds',
    })
  }
})

/** 请求体 Zod 校验 */
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
  eventType: z.enum(['log', 'exception', 'user_action']).optional(),
  action: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  metric: AggregateUsageMetricSchema.optional(),
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
  // Repetition telemetry is a numeric-only operational observation. Do not let
  // a custom client attach story text through the otherwise generic log envelope.
  const normalizedMetric = entry.metric?.kind === 'story_repetition'
    ? {
        ...entry.metric,
        qualityLevel: deriveStoryRepetitionQuality(entry.metric),
      }
    : entry.metric
  const normalizedEntry: ClientLogEntry = entry.metric?.kind === 'story_repetition'
    ? {
        level: 'info',
        module: 'usage-metric',
        message: 'story_repetition',
        timestamp: entry.timestamp,
        eventType: 'user_action',
        action: 'story_repetition',
        metric: normalizedMetric,
      }
    : entry
  const { args, context, raw, ...inlineEntry } = normalizedEntry
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
    metric: normalizedEntry.metric,
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

  const source = getServerRequestSource(request)
  if (isRateLimited(source.sourceId, Date.now())) {
    return Response.json(
      { error: '日志请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_MS / 1000) } },
    )
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
    await writeLogAsync(entry, source)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: '请求体格式不正确' }, { status: 400 })
  }
}
