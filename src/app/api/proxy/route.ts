/**
 * @module route.ts
 * @description AI API 代理路由 —— 动态多 Provider 转发
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
 *   - user_id 缓存池（由客户端传入）
 *   - response_format JSON Mode（由客户端传入）
 *   - 动态 Provider 路由（6 家厂商 + 自定义）
 *   - thinking 参数透传（推理强度）
 *   - 代理访问日志（CSV 记录每次调用）
 *   - 上游错误响应原文保存
 */

import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'

import {
  AI_PROVIDERS,
  DEFAULT_AI_FALLBACK_MODEL,
  DEFAULT_AI_PROVIDER_ID,
  getProviderModelCandidates,
  shouldTryManagedFallback,
} from '@/core/ai-service/provider-config'
import {
  hasServerProviderApiKey,
  readServerProviderApiKey,
} from '@/core/ai-service/server-provider-credentials'
import {
  requestManagedAggregatedCompletion,
  type ManagedUpstreamAttempt,
} from '@/core/ai-service/managed-provider-execution'
import { normalizeProxyStorySeedInput } from '@/core/ai-service/story-seed'
import {
  appendSourceJsonLine,
  appendServerJsonLine,
  getServerRequestSource,
  safeLogSegment,
  type ServerRequestSource,
  writeServerLogFile,
} from '@/core/logger/server-log-store'

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
  // Provider 路由
  providerId: z.string().default('deepseek'),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
})

type ProxyRequest = z.infer<typeof ProxyRequestSchema>

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

// ---- 智能访问日志（JSONL 格式，含指纹 + IP + 重试追踪） ----

interface SmartAccessEntry {
  timestamp: string
  request_id: string
  ip: string
  source_id: string
  diagnostic_code?: string
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
): Promise<void> {
  const now = new Date()
  const entry: SmartAccessEntry = {
    timestamp: now.toISOString(),
    request_id: requestId,
    ip: source.ip,
    source_id: source.sourceId,
    diagnostic_code: source.diagnosticCode,
    provider: providerId,
    model,
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
  const date = now.toISOString().slice(0, 10)
  await Promise.all([
    appendServerJsonLine(`proxy-access/proxy-access-${date}.jsonl`, entry),
    appendSourceJsonLine(source, `proxy-access-${date}.jsonl`, entry),
  ])
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
  const timestamp = new Date().toISOString()
  const filename = [
    safeLogSegment(providerId),
    safeLogSegment(model),
    status,
    safeLogSegment(requestId),
    timestamp.replace(/[:.]/g, '-'),
  ].join('-') + '.json'
  await writeServerLogFile(`raw-responses/${filename}`, {
    timestamp,
    requestId,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    provider: providerId,
    model,
    status,
    responseBody: body,
  })
}

function sanitizeBaseUrlForLog(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined
  try {
    const parsed = new URL(baseUrl)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return '[invalid-url]'
  }
}

function buildTraceRequest(body: ProxyRequest): Record<string, unknown> {
  return {
    providerId: body.providerId,
    model: body.model,
    messages: body.messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    stream: body.stream,
    response_format: body.response_format,
    user_id: body.user_id,
    top_p: body.top_p,
    seed: body.seed,
    thinking: body.thinking,
    baseUrl: sanitizeBaseUrlForLog(body.baseUrl),
    credentialSource: body.apiKey ? 'request' : 'server-or-missing',
  }
}

async function writeProxyTrace(
  source: ServerRequestSource,
  requestId: string,
  event: 'request' | 'response' | 'rejected' | 'exception',
  details: Record<string, unknown>,
): Promise<void> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const traceFile = `ai-traces/ai-trace-${date}.jsonl`
  const record = {
    timestamp: now.toISOString(),
    requestId,
    event,
    sourceIp: source.ip,
    sourceId: source.sourceId,
    diagnosticCode: source.diagnosticCode,
    ...details,
  }
  await Promise.all([
    appendServerJsonLine(traceFile, record),
    appendSourceJsonLine(source, `trace-index-${date}.jsonl`, {
      timestamp: record.timestamp,
      requestId,
      event,
      diagnosticCode: source.diagnosticCode,
      status: typeof details.status === 'number' ? details.status : undefined,
      error: typeof details.error === 'string' ? details.error : undefined,
      traceFile,
    }),
  ])
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

/** 仅暴露服务端是否已有可用密钥，不返回 Provider、密钥或其他配置细节。 */
export function GET(request: Request): Response {
  const providerId = new URL(request.url).searchParams.get('providerId') || DEFAULT_AI_PROVIDER_ID
  const configured = Boolean(AI_PROVIDERS[providerId]) && hasServerProviderApiKey(providerId)
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

  const writeCurrentTrace = (
    event: 'request' | 'response' | 'rejected' | 'exception',
    details: Record<string, unknown>,
  ): Promise<void> => writeProxyTrace(source, requestId, event, details)

  const writeCurrentAccessLog = async (status: number, error?: string): Promise<void> => {
    await writeAccessLogAsync(
      requestId,
      providerId,
      model,
      status,
      Date.now() - startTime,
      fingerprint,
      trackResult.isRetry,
      trackResult.retryCount,
      isStream,
      source,
      requestBytes,
      messageCount,
      promptChars,
      error,
    )
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
        }),
        writeCurrentAccessLog(400, 'Invalid request body'),
      ])
      return jsonWithRequestId(requestId, { error: '请求体格式不正确', validation }, 400)
    }

    providerId = body.providerId
    model = body.model
    isStream = body.stream === true
    messageCount = body.messages.length
    promptChars = body.messages.reduce((sum, message) => sum + message.content.length, 0)

    // 计算请求指纹 + 重试追踪
    fingerprint = computeFingerprint(body.messages)
    trackResult = trackFingerprint(fingerprint)

    await writeCurrentTrace('request', {
      fingerprint,
      isRetry: trackResult.isRetry,
      retryCount: trackResult.retryCount,
      requestBytes,
      request: buildTraceRequest(body),
    })

    // 3. 解析目标 Provider 配置
    const providerConfig = AI_PROVIDERS[providerId]
    const isCustom = providerId === 'custom'

    if (!isCustom && !providerConfig) {
      await Promise.all([
        writeCurrentTrace('response', { status: 400, error: 'Unknown provider' }),
        writeCurrentAccessLog(400, 'Unknown provider'),
      ])
      return jsonWithRequestId(requestId, { error: '未知的 AI Provider' }, 400)
    }

    if (
      providerId === DEFAULT_AI_PROVIDER_ID
      && !providerConfig.models.some((candidate) => candidate.name === body.model)
    ) {
      await Promise.all([
        writeCurrentTrace('response', { status: 400, error: 'Managed model not allowed' }),
        writeCurrentAccessLog(400, 'Managed model not allowed'),
      ])
      return jsonWithRequestId(requestId, { error: '免费体验通道不支持该模型，请使用自定义接口' }, 400)
    }

    // 确定 baseUrl
    const baseUrl = isCustom
      ? (body.baseUrl || '')
      : (providerConfig?.baseUrl ?? '')

    // 确定 API Key：请求体传入 > 服务端 env
    const apiKey = body.apiKey || readServerProviderApiKey(providerId)

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
      messages: body.messages,
    }

    if (body.temperature !== undefined) forwardBody.temperature = body.temperature
    if (body.max_tokens !== undefined) forwardBody.max_tokens = body.max_tokens
    const aggregateManagedStream = providerId === DEFAULT_AI_PROVIDER_ID && !isStream
    if (body.stream !== undefined) forwardBody.stream = aggregateManagedStream ? true : body.stream
    if (body.response_format !== undefined) forwardBody.response_format = body.response_format
    if (body.user_id !== undefined) forwardBody.user = body.user_id
    if (body.top_p !== undefined) forwardBody.top_p = body.top_p
    if (body.seed !== undefined) forwardBody.seed = body.seed

    // thinking 参数透传
    if (body.thinking !== undefined) {
      forwardBody.thinking = body.thinking
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

    if (aggregateManagedStream) {
      const managedResult = await requestManagedAggregatedCompletion({
        apiUrl,
        apiKey,
        forwardBody,
        clientSignal: request.signal,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      })
      model = managedResult.model

      if (managedResult.kind === 'success') {
        await Promise.all([
          writeCurrentTrace('response', {
            status: 200,
            selectedModel: managedResult.model,
            fallbackUsed: managedResult.model === DEFAULT_AI_FALLBACK_MODEL,
            upstreamAttempts: managedResult.attempts,
            upstreamHeaders: getUpstreamHeaderSnapshot(managedResult.headers),
            responseBody: managedResult.responseBody,
            transport: 'managed-sse-aggregation',
            contentChars: managedResult.contentChars,
          }),
          writeCurrentAccessLog(200),
        ])
        return new Response(managedResult.responseBody, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-ai-request-id': requestId,
          },
        })
      }

      if (managedResult.kind === 'client-abort') {
        await Promise.all([
          writeCurrentTrace('response', {
            status: 499,
            selectedModel: managedResult.model,
            upstreamAttempts: managedResult.attempts,
            error: managedResult.error,
          }),
          writeCurrentAccessLog(499, managedResult.error),
        ])
        return jsonWithRequestId(requestId, { error: '客户端已取消请求' }, 499)
      }

      if (managedResult.kind === 'upstream-error') {
        const upstream = parseUpstreamErrorDiagnostic(managedResult.errorText)
        await Promise.all([
          saveRawResponse(source, requestId, providerId, managedResult.model, managedResult.status, managedResult.errorText),
          writeCurrentTrace('response', {
            status: managedResult.status,
            selectedModel: managedResult.model,
            upstreamAttempts: managedResult.attempts,
            upstreamHeaders: getUpstreamHeaderSnapshot(managedResult.headers),
            upstreamError: upstream,
            responseBody: managedResult.errorText,
          }),
          writeCurrentAccessLog(managedResult.status, upstream?.message || managedResult.errorText),
        ])
        return jsonWithRequestId(
          requestId,
          { error: `${providerId} API ${managedResult.status}`, upstream },
          managedResult.status,
        )
      }

      await Promise.all([
        writeCurrentTrace('response', {
          status: 502,
          selectedModel: managedResult.model,
          upstreamAttempts: managedResult.attempts,
          error: managedResult.error,
        }),
        writeCurrentAccessLog(502, managedResult.error),
      ])
      return jsonWithRequestId(requestId, { error: '托管通道主模型与备用模型均不可用' }, 502)
    }

    let upstreamController = new AbortController()
    let clearConnectionTimeout: () => void = () => {}
    let connectionError = ''
    let upstreamResp: Response | null = null
    let upstreamErrorText = ''
    const upstreamAttempts: ManagedUpstreamAttempt[] = []
    const modelCandidates = getProviderModelCandidates(providerId, body.model)

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

      const candidateResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(forwardBody),
        signal: upstreamController.signal,
      }).catch((error) => {
        connectionError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        return null
      })

      if (!candidateResponse) {
        upstreamAttempts.push({
          model: candidate,
          durationMs: Date.now() - attemptStartedAt,
          error: connectionError || 'Connection failed or timeout',
        })
        clearAttemptGuards()
        if (
          !request.signal.aborted
          && index < modelCandidates.length - 1
          && shouldTryManagedFallback()
        ) continue
        break
      }

      if (!candidateResponse.ok) {
        upstreamErrorText = await candidateResponse.text().catch(() => '未知错误')
        upstreamAttempts.push({
          model: candidate,
          status: candidateResponse.status,
          durationMs: Date.now() - attemptStartedAt,
          error: parseUpstreamErrorDiagnostic(upstreamErrorText)?.message || upstreamErrorText,
        })
        if (
          index < modelCandidates.length - 1
          && shouldTryManagedFallback(candidateResponse.status)
        ) {
          clearAttemptGuards()
          continue
        }
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
        await Promise.all([
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
            const { done, value } = await reader.read()
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
