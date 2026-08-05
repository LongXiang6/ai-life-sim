/**
 * Purpose: Forward player-owned OpenAI-compatible requests through the server.
 * Owner: app:api
 * Responsibility: Own the ordered HTTP transport transaction, cancellation, timeout, and stream lifecycle.
 */

import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'

import { DEFAULT_AI_PROVIDER_ID } from '@/core/ai-service/provider-config'
import { computeAiCallDeadlineMs } from '@/core/ai-service/ai-call-deadline'
import {
  isRegisteredServerProviderBaseUrl,
  isTrustedServerPromptTarget,
} from '@/core/ai-service/server-provider-targets'
import {
  AI_STREAM_IDLE_TIMEOUT_MS,
  readStreamWithIdleTimeout,
} from '@/core/ai-service/stream-timeout'
import {
  appendServerLogEntry,
  getServerRequestSource,
} from '@/core/logger/server-log-store'
import {
  type NarrativeRoundTraceContext,
} from '@/core/logger/narrative-round-archive'
import { appendDevelopmentSystemEvents } from '@/core/logger/development-system-diagnostic.server'
import { resolveModEngineServerPromptAsset } from '@/mods/mod-engine/server-prompt-assets'
import {
  ProxyRequestSchema,
  type ProxyRequest,
  type UpstreamAttempt,
} from './route/contracts'
import {
  appendNarrativeRoundExchange,
  buildTraceRequest,
  saveRawResponse,
  writeAccessLogAsync,
  writeProxyTrace,
} from './route/proxy-logging'
import {
  computeFingerprint,
  trackFingerprint,
} from './route/request-fingerprint'
import {
  getUpstreamHeaderSnapshot,
  jsonWithRequestId,
  parseUpstreamErrorDiagnostic,
} from './route/response-helpers'

// ---- 常量 ----

/** 最大请求体大小 512KB */
const MAX_BODY_SIZE = 512 * 1024

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
  let upstreamDeadlineExpired = false
  let upstreamDeadlineMs: number | undefined
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
        writeCurrentTrace('response', { status: 400, error: 'Missing baseUrl' }),
        writeCurrentAccessLog(400, 'Missing baseUrl'),
      ])
      return jsonWithRequestId(requestId, { error: 'API Base URL 未配置' }, 400)
    }

    if (!apiKey) {
      await Promise.all([
        writeCurrentTrace('response', { status: 400, error: 'Missing API Key' }),
        writeCurrentAccessLog(400, 'Missing API Key'),
      ])
      return jsonWithRequestId(requestId, { error: 'API Key 未配置' }, 400)
    }

    // 4. 构建转发请求体
    const forwardBody: Record<string, unknown> = {
      model: body.model,
      messages: upstreamMessages,
    }

    if (body.temperature !== undefined) forwardBody.temperature = body.temperature
    if (body.stream !== undefined) forwardBody.stream = body.stream
    if (body.response_format !== undefined) forwardBody.response_format = body.response_format
    const isDeepSeekTarget = body.model.toLowerCase().includes('deepseek')
    const trustedUserId = source.accountId
      ?? source.deviceProvenanceId
      ?? source.diagnosticCode
      ?? source.sourceId
    const normalizedTrustedUserId = trustedUserId.replace(/[^a-zA-Z0-9_-]+/gu, '_').slice(0, 512)
    if (isDeepSeekTarget) {
      const subjectPoolHash = createHash('sha256')
        .update(`${normalizedTrustedUserId}|${body.cache_pool}`)
        .digest('hex')
        .slice(0, 40)
      forwardBody.user_id = `als_${body.cache_pool}_${subjectPoolHash}`
    } else {
      forwardBody.user = normalizedTrustedUserId
    }
    if (body.stream_options !== undefined) forwardBody.stream_options = body.stream_options
    if (body.top_p !== undefined) forwardBody.top_p = body.top_p
    if (!isDeepSeekTarget && body.seed !== undefined) forwardBody.seed = body.seed

    // thinking 只传递开关，不传递任何推理 Token 预算。
    if (body.thinking !== undefined) forwardBody.thinking = body.thinking
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

    upstreamDeadlineMs = computeAiCallDeadlineMs({
      callKind: body.deadline_context.callKind,
      reasoningEffort: body.deadline_context.reasoningEffort,
    })
    let upstreamController = new AbortController()
    let clearUpstreamDeadline: () => void = () => {}
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
      upstreamDeadlineExpired = false
      let upstreamSettled = false
      const onClientAbort = () => upstreamController.abort()
      request.signal.addEventListener('abort', onClientAbort, { once: true })
      const candidateTimeoutId = setTimeout(() => {
        upstreamDeadlineExpired = true
        upstreamController.abort()
      }, upstreamDeadlineMs)
      clearUpstreamDeadline = () => clearTimeout(candidateTimeoutId)
      const clearAttemptGuards = () => {
        if (upstreamSettled) return
        upstreamSettled = true
        clearUpstreamDeadline()
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
      if (upstreamDeadlineExpired) {
        await Promise.all([
          writeCurrentTrace('response', {
            status: 504,
            upstreamAttempts,
            deadlineMs: upstreamDeadlineMs,
            error: 'Upstream workload deadline exceeded',
          }),
          writeCurrentAccessLog(504, 'Upstream workload deadline exceeded'),
        ])
        return jsonWithRequestId(requestId, { error: `${providerId} API 超过本次工作量总时限` }, 504)
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
      // 总时限与 client-abort 接线保留到流结束；空闲时限单独检测无数据卡住。
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
              clearUpstreamGuards()
              await logStreamEnd(200)
              controller.close()
              return
            }
            capturedChunks.push(value.slice())
            controller.enqueue(value)
          } catch (err) {
            const aborted = request.signal.aborted
            const deadlineExceeded = !aborted && upstreamDeadlineExpired
            const message = err instanceof Error ? err.message : String(err ?? 'unknown')
            await logStreamEnd(
              aborted ? 499 : deadlineExceeded ? 504 : 502,
              aborted
                ? 'Client aborted mid-stream'
                : deadlineExceeded
                  ? `Stream workload deadline exceeded after ${upstreamDeadlineMs}ms`
                  : `Stream error: ${message}`,
            )
            upstreamController.abort()
            clearUpstreamGuards()
            controller.error(err)
          }
        },
        async cancel(reason) {
          const aborted = request.signal.aborted
          const deadlineExceeded = !aborted && upstreamDeadlineExpired
          await logStreamEnd(
            aborted ? 499 : deadlineExceeded ? 504 : 502,
            aborted
              ? 'Client aborted mid-stream'
              : deadlineExceeded
                ? `Stream workload deadline exceeded after ${upstreamDeadlineMs}ms`
                : `Stream canceled: ${reason instanceof Error ? reason.message : String(reason ?? 'unknown')}`,
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
    const responseBody = await upstreamResp.text()
    clearUpstreamGuards()
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
    if (request.signal.aborted) {
      await Promise.all([
        writeCurrentTrace('exception', { status: 499, error: 'Client aborted' }),
        writeCurrentAccessLog(499, 'Client aborted'),
      ])
      return jsonWithRequestId(requestId, { error: '客户端已取消请求' }, 499)
    }
    if (upstreamDeadlineExpired && err instanceof Error && err.name === 'AbortError') {
      await Promise.all([
        writeCurrentTrace('exception', {
          status: 504,
          deadlineMs: upstreamDeadlineMs,
          error: 'Upstream workload deadline exceeded',
        }),
        writeCurrentAccessLog(504, 'Upstream workload deadline exceeded'),
      ])
      return jsonWithRequestId(requestId, { error: '上游响应超过本次工作量总时限' }, 504)
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
