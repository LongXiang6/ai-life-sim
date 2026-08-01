/**
 * @module route.ts
 * @description AI API 代理路由 —— 玩家自有 API 转发
 * @mod app
 *
 * 为什么需要代理：
 *   浏览器直接调用 AI API 会暴露 API Key 且受 CORS 限制。
 *   通过 Next.js API Route 代理，API Key 仅在服务端可用，
 *   同时可以添加限流、日志、错误处理等中间件逻辑。
 *
 * 支持：
 *   - POST JSON 请求体转发
 *   - SSE 流式透传（stream: true）
 *   - 由服务端可信账号或设备来源分配业务 user_id
 *   - response_format JSON Mode（由客户端传入）
 *   - 玩家自有 OpenAI 兼容 API 路由
 *   - thinking 参数透传（推理强度）
 *   - 代理访问日志（明文 SQLite 记录每次调用）
 *   - 上游错误响应原文保存
 */

import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'

import { DEFAULT_AI_PROVIDER_ID } from '@/core/ai-service/provider-config'
import {
  isRegisteredServerProviderBaseUrl,
  isTrustedServerPromptTarget,
} from '@/core/ai-service/server-provider-targets'
import {
  AI_STREAM_IDLE_TIMEOUT_MS,
  readStreamWithIdleTimeout,
} from '@/core/ai-service/stream-timeout'
import { normalizeProxyStorySeedInput } from '@/core/ai-service/story-seed'
import {
  appendServerLogEntry,
  getServerRequestSource,
  type ServerRequestSource,
} from '@/core/logger/server-log-store'
import {
  appendNarrativeRoundExchange,
  type NarrativeRoundTraceContext,
} from '@/core/logger/narrative-round-archive'
import { appendDevelopmentSystemEvents } from '@/core/logger/development-system-diagnostic.server'
import { resolveModEngineServerPromptAsset } from '@/mods/mod-engine/server-prompt-assets'

// ---- 常量 ----

/** 最大请求体大小 512KB */
const MAX_BODY_SIZE = 512 * 1024

/**
 * 上游请求超时（毫秒）。覆盖「建立连接 + 首字节响应」阶段；
 * 流式响应一旦开始透传即清除该超时，由客户端 signal 控制后续生命周期。
 */
const UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000

// ---- Zod 校验 Schema ----

const ProxyRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  stream_options: z.object({ include_usage: z.boolean() }).strict().optional(),
  response_format: z.object({ type: z.string() }).optional(),
  user_id: z.string().optional(),
  top_p: z.number().min(0).max(1).optional(),
  // 兼容仍在浏览器缓存中的旧客户端：JSON.stringify(NaN) 会写成 null。
  // null 只表示“没有可用种子”，不得让整轮剧情请求因此被 400 拒绝。
  seed: z.preprocess(
    normalizeProxyStorySeedInput,
    z.number().finite().optional(),
  ),
  thinking: z.union([
    z.object({ budget_tokens: z.number().int().positive() }).strict(),
    z.object({ type: z.literal('disabled') }).strict(),
    z.object({
      type: z.literal('enabled'),
      budget_tokens: z.number().int().positive().optional(),
    }).strict(),
  ]).optional(),
  reasoning_effort: z.enum(['high', 'max']).optional(),
  // Provider 路由
  providerId: z.string().default(DEFAULT_AI_PROVIDER_ID),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  /** 服务端固定 Prompt 资产；客户端不得同时提交 system 消息。 */
  prompt_asset: z.string().min(1).max(128).optional(),
  /** 仅供代理落盘关联；该对象不会进入上游请求体。 */
  trace_context: z.object({
    lifeRunId: z.string().min(1).max(160),
    round: z.number().int().positive(),
    callKind: z.string().min(1).max(96),
    executionKind: z.string().min(1).max(32).optional(),
    promptVersion: z.string().min(1).max(64).optional(),
    targetWordCount: z.number().int().positive().optional(),
    styleSource: z.enum(['default', 'custom']).optional(),
    styleText: z.string().optional(),
    styleVersion: z.number().int().nonnegative().optional(),
  }).strict().optional(),
})

type ProxyRequest = z.infer<typeof ProxyRequestSchema>

interface UpstreamAttempt {
  model: string
  status?: number
  durationMs: number
  error?: string
}

// ---- 请求指纹 + 重试追踪（内存缓存，无持久化开销） ----

/** 指纹 → 最近一次出现时间（毫秒时间戳），用于检测同内容重试 */
const recentFingerprints = new Map<string, { firstSeen: number; retryCount: number }>()
const FINGERPRINT_TTL_MS = 30000 // 30秒窗口内相同指纹视为重试

/** 定期清理过期指纹 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [fp, data] of recentFingerprints) {
      if (now - data.firstSeen > FINGERPRINT_TTL_MS) {
        recentFingerprints.delete(fp)
      }
    }
  }, 60_000)
}

/** 计算消息内容 SHA256 指纹（用于去重 + 重试关联） */
function computeFingerprint(messages: Array<{ role: string; content: string }>): string {
  // 只对首条系统消息 + 末条用户消息取指纹（稳定且轻量，不随轮次上下文变化）
  const systemMsg = messages.find(m => m.role === 'system')
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const seed = `${systemMsg?.content.slice(0, 200) ?? ''}|${lastUserMsg?.content.slice(0, 200) ?? ''}`
  return createHash('sha256').update(seed).digest('hex').slice(0, 12)
}

/** 检查并记录指纹，仅用于观测重试，不以固定次数拒绝产品所需的持续请求。 */
function trackFingerprint(fp: string): { isRetry: boolean; retryCount: number } {
  const existing = recentFingerprints.get(fp)
  if (existing) {
    existing.retryCount++
    return { isRetry: true, retryCount: existing.retryCount }
  }
  recentFingerprints.set(fp, { firstSeen: Date.now(), retryCount: 0 })
  return { isRetry: false, retryCount: 0 }
}

// ---- 智能访问日志（明文 SQLite，含指纹 + IP + 重试追踪） ----

interface SmartAccessEntry {
  timestamp: string
  request_id: string
  ip: string
  source_id: string
  diagnostic_code?: string
  device_provenance_id?: string
  provider: string
  model: string
  fingerprint: string
  status: number
  duration_ms: number
  is_retry: boolean
  retry_count: number
  stream: boolean
  request_bytes: number
  message_count: number
  prompt_chars: number
  error: string
  round?: number
  call_kind?: string
  life_run_id?: string
  execution_kind?: string
}

async function writeAccessLogAsync(
  requestId: string,
  providerId: string,
  model: string,
  status: number,
  durationMs: number,
  fingerprint: string,
  isRetry: boolean,
  retryCount: number,
  isStream: boolean,
  source: ServerRequestSource,
  requestBytes: number,
  messageCount: number,
  promptChars: number,
  error?: string,
  trace?: NarrativeRoundTraceContext,
): Promise<void> {
  const now = new Date()
  const entry: SmartAccessEntry = {
    timestamp: now.toISOString(),
    request_id: requestId,
    ip: source.ip,
    source_id: source.sourceId,
    diagnostic_code: source.diagnosticCode,
    device_provenance_id: source.deviceProvenanceId,
    provider: providerId,
    model,
    round: trace?.round,
    call_kind: trace?.callKind,
    life_run_id: trace?.lifeRunId,
    execution_kind: trace?.executionKind,
    fingerprint,
    status,
    duration_ms: durationMs,
    is_retry: isRetry,
    retry_count: retryCount,
    stream: isStream,
    request_bytes: requestBytes,
    message_count: messageCount,
    prompt_chars: promptChars,
    error: error ?? '',
  }
  await appendServerLogEntry({
    createdAt: now.getTime(),
    entryType: 'proxy-access',
    category: 'ai-proxy',
    level: status >= 400 ? 'error' : 'info',
    module: 'api-proxy',
    message: error || `HTTP ${status}`,
    requestId,
    source,
    provider: providerId,
    model,
    status,
    error,
    round: trace?.round,
    callKind: trace?.callKind,
    meta: {
      ...(trace ? {
        lifeRunId: trace.lifeRunId,
        round: trace.round,
        callKind: trace.callKind,
        executionKind: trace.executionKind,
      } : {}),
    },
    payload: entry,
  })
}

// ---- 错误响应保存 ----

async function saveRawResponse(
  source: ServerRequestSource,
  requestId: string,
  providerId: string,
  model: string,
  status: number,
  body: string,
): Promise<void> {
  const now = new Date()
  const timestamp = now.toISOString()
  const record = {
    timestamp,
    requestId,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    deviceProvenanceId: source.deviceProvenanceId,
    provider: providerId,
    model,
    status,
    responseChars: body.length,
  }
  await appendServerLogEntry({
    createdAt: now.getTime(),
    entryType: 'raw-response',
    category: 'ai-proxy',
    level: 'error',
    module: 'api-proxy',
    message: `上游返回 HTTP ${status}`,
    requestId,
    source,
    provider: providerId,
    model,
    status,
    response: body,
    error: body,
    payload: record,
  })
}

function buildTraceRequest(
  body: ProxyRequest,
  upstreamMessages: Array<{ role: string; content: string }>,
): Record<string, unknown> {
  return {
    providerId: body.providerId,
    model: body.model,
    promptAssetId: body.prompt_asset,
    messages: upstreamMessages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    stream: body.stream,
    response_format: body.response_format,
    user_id: body.user_id,
    top_p: body.top_p,
    seed: body.seed,
    thinking: body.thinking,
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
  }
}

async function writeProxyTrace(
  source: ServerRequestSource,
  requestId: string,
  event: 'request' | 'response' | 'rejected' | 'exception',
  details: Record<string, unknown>,
  trace?: NarrativeRoundTraceContext,
): Promise<void> {
  const now = new Date()
  const {
    request: requestContent,
    responseBody: responseContent,
    rawRequestBody,
    ...inlineDetails
  } = details
  const request = requestContent && typeof requestContent === 'object'
    ? requestContent as Record<string, unknown>
    : undefined
  const requestMessages = Array.isArray(request?.messages) ? request.messages : []
  const record = {
    timestamp: now.toISOString(),
    requestId,
    event,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    deviceProvenanceId: source.deviceProvenanceId,
    ...inlineDetails,
    ...(trace ? { trace: { ...trace } } : {}),
    request: requestContent,
    responseBody: responseContent,
    rawRequestBody,
    provider: typeof request?.providerId === 'string' ? request.providerId : undefined,
    requestedModel: typeof request?.model === 'string' ? request.model : undefined,
    promptAssetId: typeof request?.promptAssetId === 'string' ? request.promptAssetId : undefined,
    requestMessageCount: requestMessages.length || undefined,
    requestPromptChars: requestMessages.length > 0
      ? requestMessages.reduce((sum, message) => (
        sum + String((message as { content?: unknown })?.content ?? '').length
      ), 0)
      : undefined,
    responseBodyChars: typeof responseContent === 'string' ? responseContent.length : undefined,
  }
  const prompt = requestContent === undefined
    ? typeof rawRequestBody === 'string' ? rawRequestBody : undefined
    : JSON.stringify(requestContent, null, 2)
  await appendServerLogEntry({
    createdAt: now.getTime(),
    entryType: 'proxy-trace',
    category: 'ai-proxy',
    level: event === 'exception' || event === 'rejected' || Number(inlineDetails.status) >= 400
      ? 'error'
      : 'info',
    module: 'api-proxy',
    message: event,
    event,
    requestId,
    source,
    provider: typeof request?.providerId === 'string' ? request.providerId : undefined,
    model: typeof request?.model === 'string' ? request.model : undefined,
    status: typeof inlineDetails.status === 'number' ? inlineDetails.status : undefined,
    round: trace?.round,
    callKind: trace?.callKind,
    prompt,
    response: typeof responseContent === 'string' ? responseContent : undefined,
    error: typeof inlineDetails.error === 'string'
      ? inlineDetails.error
      : typeof inlineDetails.reason === 'string' ? inlineDetails.reason : undefined,
    stack: typeof inlineDetails.stack === 'string' ? inlineDetails.stack : undefined,
    meta: {
      ...inlineDetails,
      ...(trace ? {
        lifeRunId: trace.lifeRunId,
        round: trace.round,
        callKind: trace.callKind,
        executionKind: trace.executionKind,
      } : {}),
    },
    payload: record,
  })
}

interface UpstreamErrorDiagnostic {
  message?: string
  type?: string
  param?: unknown
  code?: string
}

function parseUpstreamErrorDiagnostic(errorText: string): UpstreamErrorDiagnostic | undefined {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: UpstreamErrorDiagnostic | string
      message?: string
      type?: string
      param?: unknown
      code?: string
    }
    if (parsed.error && typeof parsed.error === 'object') return parsed.error
    if (typeof parsed.error === 'string') return { message: parsed.error }
    if (parsed.message || parsed.type || parsed.code) {
      return {
        message: parsed.message,
        type: parsed.type,
        param: parsed.param,
        code: parsed.code,
      }
    }
  } catch {
    if (errorText.trim()) return { message: errorText }
  }
  return undefined
}

function jsonWithRequestId(
  requestId: string,
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(
    { ...body, requestId },
    { status, headers: { 'x-ai-request-id': requestId } },
  )
}

function getUpstreamHeaderSnapshot(headers: Headers): Record<string, string> {
  const names = [
    'content-type',
    'retry-after',
    'x-request-id',
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-tokens',
  ]
  const snapshot: Record<string, string> = {}
  for (const name of names) {
    const value = headers.get(name)
    if (value) snapshot[name] = value
  }
  return snapshot
}

// ---- 主处理 ----

/** 只验证玩家填写的目标是否可用于受保护 Prompt，不读取任何服务端 AI 凭据。 */
export function GET(request: Request): Response {
  const searchParams = new URL(request.url).searchParams
  const providerId = searchParams.get('providerId') || DEFAULT_AI_PROVIDER_ID
  const configured = providerId === DEFAULT_AI_PROVIDER_ID
    && isRegisteredServerProviderBaseUrl(searchParams.get('baseUrl') ?? '')
  return Response.json(
    { configured },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * AI API 代理 —— 动态多 Provider 转发
 * @param request - HTTP 请求（JSON body 包含 model/messages/providerId 等）
 * @returns AI API 响应或错误
 */
export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now()
  const requestId = randomUUID()
  const source = getServerRequestSource(request)
  // 上游超时/取消守卫清理函数（try 内接线，catch/各出口调用，避免定时器与监听器泄漏）
  let clearUpstreamGuards: () => void = () => {}
  let providerId = DEFAULT_AI_PROVIDER_ID
  let model = ''
  let fingerprint = 'unknown'
  let isStream = false
  let requestBytes = 0
  let messageCount = 0
  let promptChars = 0
  let trackResult = { isRetry: false, retryCount: 0 }
  let narrativeTrace: NarrativeRoundTraceContext | undefined

  const writeCurrentTrace = (
    event: 'request' | 'response' | 'rejected' | 'exception',
    details: Record<string, unknown>,
  ): Promise<void> => writeProxyTrace(source, requestId, event, details, narrativeTrace)

  const writeCurrentAccessLog = async (status: number, error?: string): Promise<void> => {
    const durationMs = Date.now() - startTime
    await Promise.all([
      writeAccessLogAsync(
        requestId,
        providerId,
        model,
        status,
        durationMs,
        fingerprint,
        trackResult.isRetry,
        trackResult.retryCount,
        isStream,
        source,
        requestBytes,
        messageCount,
        promptChars,
        error,
        narrativeTrace,
      ),
      appendDevelopmentSystemEvents([{
        schemaVersion: 1,
        timestamp: Date.now(),
        system: 'ai-proxy',
        event: 'request-completed',
        status: status >= 400 ? 'error' : 'ok',
        ...(narrativeTrace?.lifeRunId ? { lifeRunId: narrativeTrace.lifeRunId } : {}),
        ...(narrativeTrace?.round ? { round: narrativeTrace.round } : {}),
        durationMs,
        details: {
          requestId,
          providerId,
          model,
          httpStatus: status,
          callKind: narrativeTrace?.callKind,
          executionKind: narrativeTrace?.executionKind,
          retryCount: trackResult.retryCount,
          stream: isStream,
          requestBytes,
          promptChars,
          accountId: source.accountId,
          username: source.username,
          deviceProvenanceId: source.deviceProvenanceId,
          error: error ?? '',
        },
        ...(error ? { error: { message: error } } : {}),
      }]).catch((diagnosticError) => {
        console.error('[api-proxy] 开发系统诊断写入失败', diagnosticError)
      }),
    ])
  }

  const archiveCurrentExchange = async (input: {
    model: string
    attempt: number
    status?: number
    requestBody: string
    responseBody: string | Uint8Array
    transportError?: string
  }): Promise<void> => {
    if (!narrativeTrace) return
    try {
      await appendNarrativeRoundExchange({
        trace: narrativeTrace,
        requestId,
        providerId,
        deviceProvenanceId: source.deviceProvenanceId,
        accountId: source.accountId,
        username: source.username,
        styleFingerprint: narrativeTrace.styleText !== undefined
          ? createHash('sha256')
            .update(`narrative-style-v1\0${narrativeTrace.styleText}`, 'utf8')
            .digest('hex')
          : undefined,
        ...input,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appendServerLogEntry({
        entryType: 'narrative-round-archive-error',
        category: 'ai-proxy',
        level: 'error',
        module: 'api-proxy',
        message,
        requestId,
        source,
        provider: providerId,
        model: input.model,
        round: narrativeTrace.round,
        callKind: narrativeTrace.callKind,
        error: message,
        meta: { lifeRunId: narrativeTrace.lifeRunId, attempt: input.attempt },
      })
    }
  }

  try {
    // 1. 读取请求体
    const bodyText = await request.text().catch(() => null)
    requestBytes = bodyText ? Buffer.byteLength(bodyText) : 0
    if (!bodyText) {
      await Promise.all([
        writeCurrentTrace('rejected', { status: 400, reason: '请求体为空', requestBytes }),
        writeCurrentAccessLog(400, 'Empty request body'),
      ])
      return jsonWithRequestId(requestId, { error: '请求体为空' }, 400)
    }
    if (requestBytes > MAX_BODY_SIZE) {
      await Promise.all([
        writeCurrentTrace('rejected', { status: 413, reason: '请求体超大', requestBytes }),
        writeCurrentAccessLog(413, 'Request body too large'),
      ])
      return jsonWithRequestId(requestId, { error: '请求体超大' }, 413)
    }

    // 2. JSON 解析 + Zod 校验
    let body: ProxyRequest
    try {
      const raw = JSON.parse(bodyText)
      body = ProxyRequestSchema.parse(raw)
    } catch (error) {
      const validation = error instanceof z.ZodError
        ? error.issues
        : error instanceof Error ? error.message : String(error)
      await Promise.all([
        writeCurrentTrace('rejected', {
          status: 400,
          reason: '请求体格式不正确',
          requestBytes,
          validation,
          requestHash: createHash('sha256').update(bodyText).digest('hex'),
          rawRequestBody: bodyText,
        }),
        writeCurrentAccessLog(400, 'Invalid request body'),
      ])
      return jsonWithRequestId(requestId, { error: '请求体格式不正确', validation }, 400)
    }

    providerId = body.providerId
    model = body.model
    narrativeTrace = body.trace_context
    isStream = body.stream === true
    messageCount = body.messages.length
    promptChars = body.messages.reduce((sum, message) => sum + message.content.length, 0)

    // 3. 只接受玩家自有 API 配置
    if (providerId !== DEFAULT_AI_PROVIDER_ID) {
      await Promise.all([
        writeCurrentTrace('response', { status: 400, error: 'Player API required' }),
        writeCurrentAccessLog(400, 'Player API required'),
      ])
      return jsonWithRequestId(requestId, { error: '当前版本只支持玩家自己的 API Key' }, 400)
    }

    const baseUrl = body.baseUrl || ''

    let upstreamMessages = body.messages
    if (body.prompt_asset) {
      if (body.messages.some((message) => message.role === 'system')) {
        await Promise.all([
          writeCurrentTrace('rejected', { status: 400, error: 'Client system message rejected for protected prompt asset' }),
          writeCurrentAccessLog(400, 'Client system message rejected for protected prompt asset'),
        ])
        return jsonWithRequestId(requestId, { error: '受保护的提示词请求不能携带客户端 system 消息' }, 400)
      }

      const promptAsset = resolveModEngineServerPromptAsset(body.prompt_asset)
      if (!promptAsset) {
        await Promise.all([
          writeCurrentTrace('rejected', { status: 400, error: 'Unknown server prompt asset' }),
          writeCurrentAccessLog(400, 'Unknown server prompt asset'),
        ])
        return jsonWithRequestId(requestId, { error: '服务端提示词资产不可用' }, 400)
      }

      if (!isTrustedServerPromptTarget(providerId, baseUrl)) {
        await Promise.all([
          writeCurrentTrace('rejected', { status: 400, error: 'Untrusted target for protected prompt asset' }),
          writeCurrentAccessLog(400, 'Untrusted target for protected prompt asset'),
        ])
        return jsonWithRequestId(
          requestId,
          { error: '受保护的主叙事当前只支持 DeepSeek 官方接口；请填入 DeepSeek 预设并使用自己的 API Key' },
          400,
        )
      }

      upstreamMessages = [
        { role: 'system', content: promptAsset.systemPrompt },
        ...body.messages,
      ]
    }

    messageCount = upstreamMessages.length
    promptChars = upstreamMessages.reduce((sum, message) => sum + message.content.length, 0)
    fingerprint = computeFingerprint(upstreamMessages)
    trackResult = trackFingerprint(fingerprint)

    await writeCurrentTrace('request', {
      fingerprint,
      isRetry: trackResult.isRetry,
      retryCount: trackResult.retryCount,
      requestBytes,
      request: buildTraceRequest(body, upstreamMessages),
    })

    const apiKey = body.apiKey || ''

    if (!baseUrl) {
      await Promise.all([
        writeCurrentTrace('response', { status: 500, error: 'Missing baseUrl' }),
        writeCurrentAccessLog(500, 'Missing baseUrl'),
      ])
      return jsonWithRequestId(requestId, { error: 'API Base URL 未配置' }, 500)
    }

    if (!apiKey) {
      await Promise.all([
        writeCurrentTrace('response', { status: 500, error: 'Missing API Key' }),
        writeCurrentAccessLog(500, 'Missing API Key'),
      ])
      return jsonWithRequestId(requestId, { error: 'API Key 未配置' }, 500)
    }

    // 4. 构建转发请求体
    const forwardBody: Record<string, unknown> = {
      model: body.model,
      messages: upstreamMessages,
    }

    if (body.temperature !== undefined) forwardBody.temperature = body.temperature
    if (body.max_tokens !== undefined) forwardBody.max_tokens = body.max_tokens
    if (body.stream !== undefined) forwardBody.stream = body.stream
    if (body.response_format !== undefined) forwardBody.response_format = body.response_format
    const isDeepSeekTarget = body.model.toLowerCase().includes('deepseek')
    const trustedUserId = source.accountId
      ?? source.deviceProvenanceId
      ?? source.diagnosticCode
      ?? source.sourceId
    const normalizedTrustedUserId = trustedUserId.replace(/[^a-zA-Z0-9_-]+/gu, '_').slice(0, 512)
    if (isDeepSeekTarget) forwardBody.user_id = normalizedTrustedUserId
    else forwardBody.user = normalizedTrustedUserId
    if (body.stream_options !== undefined) forwardBody.stream_options = body.stream_options
    if (body.top_p !== undefined) forwardBody.top_p = body.top_p
    if (body.seed !== undefined) forwardBody.seed = body.seed

    // thinking 参数透传；自定义 DeepSeek 模型需要确保 thinking 格式正确。
    if (body.thinking !== undefined) {
      const normalizedModel = body.model.toLowerCase()
      if (normalizedModel.includes('deepseek') && body.thinking && 'budget_tokens' in body.thinking && !('type' in body.thinking)) {
        forwardBody.thinking = { type: 'enabled', budget_tokens: (body.thinking as { budget_tokens: number }).budget_tokens }
      } else {
        forwardBody.thinking = body.thinking
      }
    }
    if (body.reasoning_effort !== undefined) {
      forwardBody.reasoning_effort = body.reasoning_effort
    }

    // 5. 转发请求（带超时 + 客户端取消接线）
    const apiUrl = `${baseUrl}/chat/completions`

    // 若客户端已断开，直接放弃，避免发起注定被丢弃的上游调用
    if (request.signal.aborted) {
      await Promise.all([
        writeCurrentTrace('response', { status: 499, error: 'Client aborted before upstream' }),
        writeCurrentAccessLog(499, 'Client aborted before upstream'),
      ])
      return jsonWithRequestId(requestId, { error: '客户端已取消请求' }, 499)
    }

    let upstreamController = new AbortController()
    let clearConnectionTimeout: () => void = () => {}
    let connectionError = ''
    let upstreamResp: Response | null = null
    let upstreamErrorText = ''
    let upstreamRequestBody = ''
    let selectedAttempt = 0
    const upstreamAttempts: UpstreamAttempt[] = []
    const modelCandidates = [body.model]

    for (let index = 0; index < modelCandidates.length; index++) {
      const candidate = modelCandidates[index]
      const attemptStartedAt = Date.now()
      upstreamController = new AbortController()
      let upstreamSettled = false
      const onClientAbort = () => upstreamController.abort()
      request.signal.addEventListener('abort', onClientAbort, { once: true })
      const candidateTimeoutId = setTimeout(() => upstreamController.abort(), UPSTREAM_TIMEOUT_MS)
      clearConnectionTimeout = () => clearTimeout(candidateTimeoutId)
      const clearAttemptGuards = () => {
        if (upstreamSettled) return
        upstreamSettled = true
        clearConnectionTimeout()
        request.signal.removeEventListener('abort', onClientAbort)
      }
      clearUpstreamGuards = clearAttemptGuards
      connectionError = ''
      forwardBody.model = candidate
      model = candidate
      upstreamRequestBody = JSON.stringify(forwardBody)
      selectedAttempt = index + 1

      const candidateResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: upstreamRequestBody,
        signal: upstreamController.signal,
      }).catch((error) => {
        connectionError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        return null
      })

      if (!candidateResponse) {
        await archiveCurrentExchange({
          model: candidate,
          attempt: index + 1,
          requestBody: upstreamRequestBody,
          responseBody: '',
          transportError: connectionError || 'Connection failed or timeout',
        })
        upstreamAttempts.push({
          model: candidate,
          durationMs: Date.now() - attemptStartedAt,
          error: connectionError || 'Connection failed or timeout',
        })
        clearAttemptGuards()
        break
      }

      if (!candidateResponse.ok) {
        upstreamErrorText = await candidateResponse.text().catch(() => '未知错误')
        await archiveCurrentExchange({
          model: candidate,
          attempt: index + 1,
          status: candidateResponse.status,
          requestBody: upstreamRequestBody,
          responseBody: upstreamErrorText,
        })
        upstreamAttempts.push({
          model: candidate,
          status: candidateResponse.status,
          durationMs: Date.now() - attemptStartedAt,
          error: parseUpstreamErrorDiagnostic(upstreamErrorText)?.message || upstreamErrorText,
        })
      } else {
        upstreamAttempts.push({
          model: candidate,
          status: candidateResponse.status,
          durationMs: Date.now() - attemptStartedAt,
        })
      }

      upstreamResp = candidateResponse
      break
    }

    if (!upstreamResp) {
      clearUpstreamGuards()
      // 区分「客户端主动取消」与「真正的连接失败」
      if (request.signal.aborted) {
        await Promise.all([
          writeCurrentTrace('response', { status: 499, error: 'Client aborted' }),
          writeCurrentAccessLog(499, 'Client aborted'),
        ])
        return jsonWithRequestId(requestId, { error: '客户端已取消请求' }, 499)
      }
      await Promise.all([
        writeCurrentTrace('response', {
          status: 502,
          upstreamAttempts,
          error: connectionError || 'Connection failed or timeout',
        }),
        writeCurrentAccessLog(502, connectionError || 'Connection failed or timeout'),
      ])
      return jsonWithRequestId(requestId, { error: `${providerId} API 连接失败或超时` }, 502)
    }

    // 6. 处理错误响应
    if (!upstreamResp.ok) {
      clearUpstreamGuards()
      const errorText = upstreamErrorText || await upstreamResp.text().catch(() => '未知错误')
      const upstream = parseUpstreamErrorDiagnostic(errorText)
      await Promise.all([
        saveRawResponse(source, requestId, providerId, model, upstreamResp.status, errorText),
        writeCurrentTrace('response', {
          status: upstreamResp.status,
          upstreamHeaders: getUpstreamHeaderSnapshot(upstreamResp.headers),
          upstreamAttempts,
          upstreamError: upstream,
          responseBody: errorText,
        }),
        writeCurrentAccessLog(upstreamResp.status, upstream?.message || errorText),
      ])

      // 尝试解析错误响应中的 retryAfter
      let retryAfter: number | undefined
      try {
        const errData = JSON.parse(errorText)
        if (errData.retryAfter) retryAfter = errData.retryAfter
      } catch {
        // 非 JSON 错误响应
      }

      const errorBody: Record<string, unknown> = {
        error: `${providerId} API ${upstreamResp.status}`,
      }
      if (retryAfter) errorBody.retryAfter = retryAfter
      if (upstream) errorBody.upstream = upstream

      return jsonWithRequestId(requestId, errorBody, upstreamResp.status)
    }

    // 7. 流式透传；只有在任何正文交给浏览器之前才能安全切换备用模型。
    if (isStream && upstreamResp.body) {
      // 首字节已到，连接超时使命完成；但保留 client-abort 接线直到流结束，
      // 以便流中途客户端断开时仍能取消上游。用显式 reader pump 捕获上游读取错误，
      // 避免中途断流仍只留下成功 200 日志。
      clearConnectionTimeout()
      let logged = false
      const capturedChunks: Uint8Array[] = []
      const logStreamEnd = async (status: number, error?: string) => {
        if (logged) return
        logged = true
        const responseBody = Buffer.concat(capturedChunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
        const responseBytes = Buffer.concat(capturedChunks.map((chunk) => Buffer.from(chunk)))
        await Promise.all([
          archiveCurrentExchange({
            model,
            attempt: selectedAttempt,
            status,
            requestBody: upstreamRequestBody,
            responseBody: responseBytes,
            transportError: error,
          }),
          writeCurrentTrace('response', {
            status,
            upstreamHeaders: getUpstreamHeaderSnapshot(upstreamResp.headers),
            upstreamAttempts,
            responseBody,
            error,
          }),
          writeCurrentAccessLog(status, error),
        ])
      }

      const reader = upstreamResp.body.getReader()
      const passthrough = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await readStreamWithIdleTimeout(
              reader,
              AI_STREAM_IDLE_TIMEOUT_MS,
            )
            if (done) {
              await logStreamEnd(200)
              clearUpstreamGuards()
              controller.close()
              return
            }
            capturedChunks.push(value.slice())
            controller.enqueue(value)
          } catch (err) {
            const aborted = request.signal.aborted
            const message = err instanceof Error ? err.message : String(err ?? 'unknown')
            await logStreamEnd(aborted ? 499 : 502, aborted ? 'Client aborted mid-stream' : `Stream error: ${message}`)
            upstreamController.abort()
            clearUpstreamGuards()
            controller.error(err)
          }
        },
        async cancel(reason) {
          const aborted = request.signal.aborted
          await logStreamEnd(
            aborted ? 499 : 502,
            aborted ? 'Client aborted mid-stream' : `Stream canceled: ${reason instanceof Error ? reason.message : String(reason ?? 'unknown')}`,
          )
          upstreamController.abort()
          clearUpstreamGuards()
          await reader.cancel(reason).catch(() => undefined)
        },
      })
      return new Response(passthrough, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'x-ai-request-id': requestId,
        },
      })
    }

    // 8. 非流式直接返回
    clearUpstreamGuards()
    const responseBody = await upstreamResp.text()
    await Promise.all([
      archiveCurrentExchange({
        model,
        attempt: selectedAttempt,
        status: upstreamResp.status,
        requestBody: upstreamRequestBody,
        responseBody,
      }),
      writeCurrentTrace('response', {
        status: 200,
        upstreamHeaders: getUpstreamHeaderSnapshot(upstreamResp.headers),
        upstreamAttempts,
        responseBody,
      }),
      writeCurrentAccessLog(200),
    ])
    return new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': upstreamResp.headers.get('content-type') || 'application/json',
        'x-ai-request-id': requestId,
      },
    })
  } catch (err) {
    clearUpstreamGuards()
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    // 客户端主动取消不算服务端错误
    if (request.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      await Promise.all([
        writeCurrentTrace('exception', { status: 499, error: 'Aborted' }),
        writeCurrentAccessLog(499, 'Aborted'),
      ])
      return jsonWithRequestId(requestId, { error: '请求已取消或超时' }, 499)
    }
    await Promise.all([
      writeCurrentTrace('exception', {
        status: 500,
        error: errorMsg,
        stack: err instanceof Error ? err.stack : undefined,
      }),
      writeCurrentAccessLog(500, errorMsg),
    ])
    return jsonWithRequestId(requestId, { error: '代理服务器内部错误' }, 500)
  }
}
