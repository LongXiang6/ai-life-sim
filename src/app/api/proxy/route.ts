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
import { createHash } from 'crypto'

import { AI_PROVIDERS } from '@/core/ai-service/provider-config'

// ---- 常量 ----

/** 最大请求体大小 512KB */
const MAX_BODY_SIZE = 512 * 1024

/** 最大重试次数硬上限（同一指纹重试超过此值 → 拒绝请求，避免无效请求风暴） */
const MAX_RETRY_COUNT = 5

/** 日志文件最大大小 50MB */
const MAX_LOG_SIZE = 50 * 1024 * 1024

/**
 * 上游请求超时（毫秒）。覆盖「建立连接 + 首字节响应」阶段；
 * 流式响应一旦开始透传即清除该超时，由客户端 signal 控制后续生命周期。
 */
const UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000

// ---- 服务端 API Key 映射 ----

const SERVER_API_KEYS: Record<string, string> = {
  deepseek: process.env.DEEPSEEK_API_KEY ?? '',
  zhipu: process.env.ZHIPU_API_KEY ?? '',
  aliyun: process.env.ALIBUN_API_KEY ?? '',
  bytedance: process.env.BYTEDANCE_API_KEY ?? '',
  tencent: process.env.TENCENT_API_KEY ?? '',
  baidu: process.env.BAIDU_API_KEY ?? '',
}

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
  seed: z.number().optional(),
  thinking: z.union([
    z.object({ budget_tokens: z.number().int().positive() }).strict(),
    z.object({ type: z.enum(['enabled', 'disabled']) }).strict(),
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

/** 检查并记录指纹 → 返回是否为重试及重试次数。超过硬上限时标记 shouldReject */
function trackFingerprint(fp: string): { isRetry: boolean; retryCount: number; shouldReject: boolean } {
  const existing = recentFingerprints.get(fp)
  if (existing) {
    existing.retryCount++
    // 重试次数超过硬上限 → 拒绝请求，避免无效请求风暴
    if (existing.retryCount > MAX_RETRY_COUNT) {
      return { isRetry: true, retryCount: existing.retryCount, shouldReject: true }
    }
    return { isRetry: true, retryCount: existing.retryCount, shouldReject: false }
  }
  recentFingerprints.set(fp, { firstSeen: Date.now(), retryCount: 0 })
  return { isRetry: false, retryCount: 0, shouldReject: false }
}

// ---- 智能访问日志（JSONL 格式，含指纹 + IP + 重试追踪） ----

interface SmartAccessEntry {
  time: string
  ip: string
  provider: string
  model: string
  fingerprint: string
  status: number
  duration_ms: number
  is_retry: boolean
  retry_count: number
  stream: boolean
  error: string
}

async function writeAccessLogAsync(
  providerId: string,
  model: string,
  status: number,
  durationMs: number,
  fingerprint: string,
  isRetry: boolean,
  retryCount: number,
  isStream: boolean,
  ip: string,
  error?: string,
): Promise<void> {
  try {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const timeStr = now.toISOString().slice(11, 23)
    const logFile = `logs/proxy-access-${dateStr}.jsonl`

    const entry: SmartAccessEntry = {
      time: timeStr,
      ip,
      provider: providerId,
      model,
      fingerprint,
      status,
      duration_ms: durationMs,
      is_retry: isRetry,
      retry_count: retryCount,
      stream: isStream,
      error: error ?? '',
    }

    const fs = await import('fs/promises')
    const path = await import('path')
    const fullPath = path.join(process.cwd(), logFile)

    try {
      const stat = await fs.stat(fullPath)
      if (stat.size > MAX_LOG_SIZE) {
        const backupPath = fullPath.replace('.jsonl', `-${Date.now()}.jsonl`)
        await fs.rename(fullPath, backupPath)
      }
    } catch {
      // 文件不存在，首次写入
    }

    await fs.appendFile(fullPath, JSON.stringify(entry) + '\n')
  } catch {
    // 日志写入失败静默忽略，不影响主流程
  }
}

/** 提取请求 IP */
function getClientIP(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
}

// 同步包装（保持向后兼容）
function writeAccessLog(
  providerId: string,
  model: string,
  status: number,
  durationMs: number,
  fingerprint: string,
  isRetry: boolean,
  retryCount: number,
  isStream: boolean,
  ip: string,
  error?: string,
): void {
  void writeAccessLogAsync(providerId, model, status, durationMs, fingerprint, isRetry, retryCount, isStream, ip, error)
}

// ---- 错误响应保存 ----

async function saveRawResponse(providerId: string, model: string, status: number, body: string): Promise<void> {
  try {
    const [{ existsSync, mkdirSync, writeFileSync }, { join }] = await Promise.all([
      import('fs'),
      import('path'),
    ])
    const dir = join(process.cwd(), 'logs', 'raw-responses')

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${providerId}-${model}-${status}-${timestamp}.json`
    const content = {
      timestamp: new Date().toISOString(),
      provider: providerId,
      model,
      status,
      responseBody: body,
    }
    writeFileSync(join(dir, filename), JSON.stringify(content, null, 2))
  } catch {
    // 保存失败静默忽略
  }
}

// ---- 主处理 ----

/** 仅暴露服务端是否已有可用密钥，不返回 Provider、密钥或其他配置细节。 */
export function GET(request: Request): Response {
  const providerId = new URL(request.url).searchParams.get('providerId') || 'deepseek'
  const configured = Object.prototype.hasOwnProperty.call(SERVER_API_KEYS, providerId)
    && Boolean(SERVER_API_KEYS[providerId])
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
  const ip = getClientIP(request)
  // 上游超时/取消守卫清理函数（try 内接线，catch/各出口调用，避免定时器与监听器泄漏）
  let clearUpstreamGuards: () => void = () => {}
  let providerId = 'deepseek'
  let model = ''
  let fingerprint = 'unknown'
  let isStream = false
  let trackResult = { isRetry: false, retryCount: 0, shouldReject: false }

  try {
    // 1. 读取请求体
    const bodyText = await request.text().catch(() => null)
    if (!bodyText) {
      return Response.json({ error: '请求体为空' }, { status: 400 })
    }
    if (bodyText.length > MAX_BODY_SIZE) {
      return Response.json({ error: '请求体超大' }, { status: 413 })
    }

    // 2. JSON 解析 + Zod 校验
    let body: ProxyRequest
    try {
      const raw = JSON.parse(bodyText)
      body = ProxyRequestSchema.parse(raw)
    } catch {
      return Response.json({ error: '请求体格式不正确' }, { status: 400 })
    }

    providerId = body.providerId
    model = body.model
    isStream = body.stream === true

    // 计算请求指纹 + 重试追踪
    fingerprint = computeFingerprint(body.messages)
    trackResult = trackFingerprint(fingerprint)

    // 重试次数超过硬上限 → 直接拒绝，避免无效请求风暴消耗上游配额
    if (trackResult.shouldReject) {
      const duration = Date.now() - startTime
      writeAccessLog(providerId, model, 429, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, `Retry limit exceeded (max ${MAX_RETRY_COUNT})`)
      return Response.json({ error: `重试次数超过上限(${MAX_RETRY_COUNT}次)，请稍后再试` }, { status: 429 })
    }

    // 3. 解析目标 Provider 配置
    const providerConfig = AI_PROVIDERS[providerId]
    const isCustom = providerId === 'custom'

    // 确定 baseUrl
    const baseUrl = isCustom
      ? (body.baseUrl || '')
      : (providerConfig?.baseUrl ?? '')

    // 确定 API Key：请求体传入 > 服务端 env
    const apiKey = body.apiKey || SERVER_API_KEYS[providerId] || ''

    if (!baseUrl) {
      const duration = Date.now() - startTime
      writeAccessLog(providerId, model, 500, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, 'Missing baseUrl')
      return Response.json({ error: 'API Base URL 未配置' }, { status: 500 })
    }

    if (!apiKey) {
      const duration = Date.now() - startTime
      writeAccessLog(providerId, model, 500, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, 'Missing API Key')
      return Response.json({ error: 'API Key 未配置' }, { status: 500 })
    }

    // 4. 构建转发请求体
    const forwardBody: Record<string, unknown> = {
      model: body.model,
      messages: body.messages,
    }

    if (body.temperature !== undefined) forwardBody.temperature = body.temperature
    if (body.max_tokens !== undefined) forwardBody.max_tokens = body.max_tokens
    if (body.stream !== undefined) forwardBody.stream = body.stream
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
      writeAccessLog(providerId, model, 499, Date.now() - startTime, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, 'Client aborted before upstream')
      return Response.json({ error: '客户端已取消请求' }, { status: 499 })
    }

    const upstreamController = new AbortController()
    let upstreamSettled = false
    // 客户端取消 → 一并取消上游，避免泄漏请求 / 继续消耗 token 配额
    const onClientAbort = () => upstreamController.abort()
    request.signal.addEventListener('abort', onClientAbort, { once: true })
    // 服务端超时上限（连接 + 首字节）
    const timeoutId = setTimeout(() => upstreamController.abort(), UPSTREAM_TIMEOUT_MS)
    clearUpstreamGuards = () => {
      if (upstreamSettled) return
      upstreamSettled = true
      clearTimeout(timeoutId)
      request.signal.removeEventListener('abort', onClientAbort)
    }

    const upstreamResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(forwardBody),
      signal: upstreamController.signal,
    }).catch((_err) => {
      // console.error(`[API Proxy] ${providerId} 请求失败:`, _err)
      return null
    })

    const duration = Date.now() - startTime

    if (!upstreamResp) {
      clearUpstreamGuards()
      // 区分「客户端主动取消」与「真正的连接失败」
      if (request.signal.aborted) {
        writeAccessLog(providerId, model, 499, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, 'Client aborted')
        return Response.json({ error: '客户端已取消请求' }, { status: 499 })
      }
      writeAccessLog(providerId, model, 502, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, 'Connection failed or timeout')
      return Response.json({ error: `${providerId} API 连接失败或超时` }, { status: 502 })
    }

    // 6. 处理错误响应
    if (!upstreamResp.ok) {
      clearUpstreamGuards()
      const errorText = await upstreamResp.text().catch(() => '未知错误')
      // console.error(`[API Proxy] ${providerId} ${upstreamResp.status}:`, errorText.slice(0, 500))

      // 保存错误响应原文
      void saveRawResponse(providerId, model, upstreamResp.status, errorText)

      // 写入访问日志
      writeAccessLog(providerId, model, upstreamResp.status, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, errorText.slice(0, 200))

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

      return Response.json(errorBody, { status: upstreamResp.status })
    }

    // 7. 流式透传
    if (isStream && upstreamResp.body) {
      // 首字节已到，连接超时使命完成；但保留 client-abort 接线直到流结束，
      // 以便流中途客户端断开时仍能取消上游。用显式 reader pump 捕获上游读取错误，
      // 避免中途断流仍只留下成功 200 日志。
      clearTimeout(timeoutId)
      let logged = false
      const logStreamEnd = (status: number, error?: string) => {
        if (logged) return
        logged = true
        writeAccessLog(providerId, model, status, Date.now() - startTime, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, error)
      }

      const reader = upstreamResp.body.getReader()
      const passthrough = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              logStreamEnd(200)
              clearUpstreamGuards()
              controller.close()
              return
            }
            controller.enqueue(value)
          } catch (err) {
            const aborted = request.signal.aborted
            const message = err instanceof Error ? err.message : String(err ?? 'unknown')
            logStreamEnd(aborted ? 499 : 502, aborted ? 'Client aborted mid-stream' : `Stream error: ${message}`)
            upstreamController.abort()
            clearUpstreamGuards()
            controller.error(err)
          }
        },
        cancel(reason) {
          const aborted = request.signal.aborted
          logStreamEnd(
            aborted ? 499 : 502,
            aborted ? 'Client aborted mid-stream' : `Stream canceled: ${reason instanceof Error ? reason.message : String(reason ?? 'unknown')}`,
          )
          upstreamController.abort()
          clearUpstreamGuards()
          void reader.cancel(reason).catch(() => undefined)
        },
      })
      return new Response(passthrough, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // 8. 非流式直接返回
    clearUpstreamGuards()
    // 写入成功访问日志（非流式：响应体一次性到位，此处即终态）
    writeAccessLog(providerId, model, 200, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip)
    const data = await upstreamResp.json()
    return Response.json(data)
  } catch (err) {
    clearUpstreamGuards()
    const duration = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    // console.error('[API Proxy] 未处理错误:', err)
    // 客户端主动取消不算服务端错误
    if (request.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      writeAccessLog(providerId, model, 499, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, 'Aborted')
      return Response.json({ error: '请求已取消或超时' }, { status: 499 })
    }
    writeAccessLog(providerId, model, 500, duration, fingerprint, trackResult.isRetry, trackResult.retryCount, isStream, ip, errorMsg)
    return Response.json({ error: '代理服务器内部错误' }, { status: 500 })
  }
}
