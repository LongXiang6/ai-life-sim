/**
 * @module ai-client.ts
 * @description AI 服务客户端 —— 多 Provider API 调用封装
 * @mod core
 *
 * 机制说明：
 *   1. KV Cache 优化：通过 user_id 隔离不同任务类型的缓存池
 *   2. JSON Mode：通过 AIModelConfig.responseFormat 配置，类型安全
 *   3. 缓存池：narrative / summary / worldInit / fate / lowFrequency 五种池
 *   4. 流式输出：支持 SSE 流式读取，逐 chunk 回调
 *   5. 重试机制：MAX_RETRY=3, RETRY_DELAY=1500ms，429 限流退避
 *   6. 超时控制：90s AbortController
 *   7. 缓存统计：从 usage 字段提取缓存命中/未命中，累加到 localStorage
 *   8. 多 Provider：通过 resolveProvider() 动态解析 Provider 配置
 */

import type { AIModelConfig } from '@/foundation'

import { z } from 'zod'
import type { ZodSchema } from 'zod'
import { parseAIJSON } from './parse-ai-json'
import type { DebugLogCategory } from '../logger/debug-logger'
import { logger } from '../logger/client-logger'
import {
  recordAICallLog,
  type AICallLogContext,
  type AICallUsageSnapshot,
} from '../logger/ai-call-log'
import { diagnoseApiError } from './api-error'
import {
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
  REASONING_BUDGET_MAP,
} from './provider-config'
import { isValidAiContent, mergeStreamTextChunk } from './stream-text-extractor'

// ══════════════ 全局 AI 错误通知器（由 UI 层注入） ══════════════
let onAiError: ((msg: string) => void) | null = null

/**
 * 设置 AI 调用错误的全局通知回调。
 * 在应用启动时由 UI 层调用，注入 Toast 通知函数。
 * @param cb - 错误回调函数
 */
export function setOnAiError(cb: (msg: string) => void): void {
  onAiError = cb
}

/** 429 限流错误：携带 provider 返回的 retryAfter（秒）提示 */
class RateLimitError extends Error {
  constructor(public readonly retryAfter?: number) {
    super('__RETRY_429__')
    this.name = 'RateLimitError'
  }
}

/** 代理或上游返回的 HTTP 错误，保留状态、完整诊断正文和关联请求 ID。 */
class AIHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseText: string,
    public readonly requestId?: string,
    stream = false,
  ) {
    super(`AI API ${stream ? 'stream ' : ''}error ${status}: ${responseText}`)
    this.name = 'AIHttpError'
  }
}

/** 401/403 表示凭据或权限配置不会通过同参数重试自行恢复。 */
export function isAiCredentialError(error: unknown): boolean {
  if (error instanceof AIHttpError) {
    return error.status === 401 || error.status === 403
  }
  if (!error || typeof error !== 'object' || !('status' in error)) return false
  const status = (error as { status?: unknown }).status
  return status === 401 || status === 403
}

/** 从 429 响应中解析 provider 的 retryAfter（秒），失败则返回 undefined */
async function parseRetryAfter(resp: Response): Promise<number | undefined> {
  try {
    const errData = (await resp.clone().json()) as { retryAfter?: number }
    if (typeof errData.retryAfter === 'number') return errData.retryAfter
  } catch {
    // 忽略解析失败，退回固定退避
  }
  return undefined
}

/** 判断是否为可重试的临时错误（429 / AbortError），不触发用户通知 */
function isRetryError(e: unknown): boolean {
  if (e instanceof Error) {
    if (e.message === '__RETRY_429__') return true
    if (e.name === 'AbortError') return true
  }
  return false
}

/** 400 等确定性参数错误不做无意义的同请求重试；仅临时故障进入内部退避。 */
function isRetryableAiError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true
  if (error instanceof AIHttpError) return error.status === 408 || error.status === 429 || error.status >= 500
  if (error instanceof Error && error.name === 'AbortError') return false
  return true
}

/** 格式化 AI 错误为简短用户消息，包含 API 诊断信息 */
function formatAiError(e: unknown, status?: number, errorText?: string): string {
  // 如果有状态码，使用诊断工具
  if (status && errorText) {
    const diag = diagnoseApiError(status, errorText)
    return `AI API 错误 ${status}：${diag.summary}`
  }
  if (e instanceof AIHttpError) {
    const diag = diagnoseApiError(e.status, e.responseText)
    const requestHint = e.requestId ? `（请求ID：${e.requestId}）` : ''
    return `AI API 错误 ${e.status}：${diag.summary}${requestHint}`
  }
  if (e instanceof Error) {
    const msg = e.message
    // 尝试从消息中提取状态码进行诊断
    const statusMatch = msg.match(/AI API (stream )?error (\d+)/)
    if (statusMatch) {
      const extractedStatus = parseInt(statusMatch[2])
      const restText = msg.slice(statusMatch[0].length).trim().slice(0, 2) === ': '
        ? msg.slice(statusMatch[0].length + 2).trim()
        : msg.slice(statusMatch[0].length).trim()
      const diag = diagnoseApiError(extractedStatus, restText || msg)
      return `AI API 错误 ${extractedStatus}：${diag.summary}`
    }
    if (msg.startsWith('AI API error')) return msg
    if (msg.includes('timeout') || msg.includes('Timeout')) return '请求超时'
    if (msg.includes('fetch')) return '网络连接失败'
    if (msg.includes('empty')) return 'AI 返回空响应'
    return msg.split('\n')[0].slice(0, 100)
  }
  return '未知错误'
}

// ---- 常量 ----

/** 请求超时时间（毫秒） */
const TIMEOUT_MS = 90000

/** 最大重试次数 */
const MAX_RETRY = 3

/** 重试基础延迟（毫秒） */
const RETRY_DELAY_MS = 1500

/** 缓存统计 localStorage 键 */
const CACHE_STATS_KEY = 'ai-cache-stats'

/** 每轮 KV 策略观测 localStorage 键（Phase 7 / 6D-6） */
const ROUND_CACHE_METRICS_KEY = 'roundCacheMetrics'

const MAX_ROUND_CACHE_METRICS = 10

/** 单轮 narrative 调用 KV 观测 */
export interface RoundCacheMetrics {
  timestamp: number
  strategy: 'S1' | 'S2' | 'S3' | 'S4'
  stablePrefixChars: number
  userMessageCount: number
}

// ---- 缓存池类型 ----

/** 任务类型 → 决定使用哪个 user_id 缓存池 */
export type CachePoolType = 'narrative' | 'summary' | 'worldInit' | 'fate' | 'lowFrequency' | 'adaptation'

/** 每个缓存池的 user_id 前缀 */
const POOL_PREFIX: Record<CachePoolType, string> = {
  narrative: 'narr',
  summary: 'summ',
  worldInit: 'winit',
  fate: 'fate',
  lowFrequency: 'lowf',
  adaptation: 'adap',
}

/** pool 类型 → 调试日志分类（用于自动记录每次 AI 调用） */
const POOL_TO_CATEGORY: Record<CachePoolType, DebugLogCategory> = {
  narrative: 'narrative-rounds',
  summary: 'background-events',
  worldInit: 'world-init',
  fate: 'talent-generate',
  lowFrequency: 'background-events',
  adaptation: 'background-events',
}

/** 获取日志分类：优先用显式传入的 logCategory，否则根据 pool 自动映射 */
function resolveLogCategory(pool: CachePoolType, logCategory?: DebugLogCategory): DebugLogCategory {
  return logCategory ?? POOL_TO_CATEGORY[pool]
}

// ---- 调用选项 ----

/** AI 调用选项 */
export interface AICallOptions {
  config: AIModelConfig
  /** 缓存池类型（默认 narrative） */
  pool?: CachePoolType
  /** 会话 ID（用于拼接 user_id，实现同会话同缓存） */
  sessionId?: string
  /** 流式回调 */
  onChunk?: (text: string) => void
  /**
   * 流式缓冲重置回调：在重试或降级前调用，通知消费端丢弃上一次尝试已 append 的部分文本。
   * 不实现时，重试/降级会把新文本拼接到旧的部分文本之后，导致 UI 出现重复/串字。
   */
  onResetStream?: () => void
  /** 信号（用于取消请求） */
  signal?: AbortSignal
  /** 单次调用覆盖 maxTokens（不修改 config） */
  overrideMaxTokens?: number
  /** 单次调用覆盖 temperature（不修改 config） */
  overrideTemperature?: number
  /** 单次调用覆盖 topP */
  overrideTopP?: number
  /** 是否 JSON 模式；false 时显式关闭（即使 config.responseFormat 已设） */
  jsonMode?: boolean
  /** 剧情一致性种子（最终转为 number 发送给 provider API） */
  storySeed?: string | number
  /** Provider ID（默认从 config.model 推断） */
  providerId?: string
  /** 自定义 API Key（优先于服务端 env） */
  apiKey?: string
  /** 自定义 API URL */
  customBaseUrl?: string
  /** 自定义模型名 */
  customModel?: string
  /** KV Cache 分段：多个 user 消息（首段稳定可缓存，末段变化） */
  userSegments?: string[]
  /** 追加在 userSegments 之后的额外 user 消息（如重试修正提示，不破坏 JSON 前缀） */
  extraUserMessages?: string[]
  /** 推理强度（7 级：disabled + level-1~6） */
  reasoningEffort?: string
  /** 调试日志分类（不传则根据 pool 自动映射） */
  logCategory?: DebugLogCategory
  /** 调试日志上下文（轮次 / 策略 / 调用类型，写入每条 debug-log） */
  logContext?: AICallLogContext
  /** 附加调试元信息（校验错误、重试序号等，写入 debug-log 元信息区） */
  logMeta?: Record<string, unknown>
  /** 根据响应内容生成调试元信息（在写入 debug-log 前调用） */
  logMetaResolver?: (response: string) => Record<string, unknown>
  /** 可选：输出 Zod Schema，用于 AI 响应后的结构化校验。失败时记录警告并尝试重试一次。 */
  outputSchema?: ZodSchema
  /** schema 校验失败时抛错，交给调用方降级链处理；默认保持宽松兼容。 */
  strictSchema?: boolean
}

// ---- 响应类型 ----

/** AI API 响应格式 */
interface AIResponse {
  choices: Array<{
    message: { content: string },
    finish_reason: string,
  }>,
  usage?: {
    prompt_cache_hit_tokens: number,
    prompt_cache_miss_tokens: number,
    completion_tokens: number,
    total_tokens: number,
  },
}

/** 单次 fetch 结果（内容 + usage + finish_reason） */
interface FetchAIResult {
  content: string
  usage?: AICallUsageSnapshot
  finishReason?: string
  requestId?: string
}

function resolveMaxTokens(options: AICallOptions): number {
  return options.overrideMaxTokens ?? options.config.maxTokens
}

function isTruncatedResponse(
  usage: AICallUsageSnapshot | undefined,
  maxTokens: number,
  finishReason?: string,
): boolean {
  if (finishReason === 'length') return true
  if (usage?.completionTokens !== undefined && usage.completionTokens >= maxTokens) return true
  return false
}

function parseUsage(usage?: AIResponse['usage']): AICallUsageSnapshot | undefined {
  if (!usage) return undefined
  return {
    hitTokens: Number(usage.prompt_cache_hit_tokens) || 0,
    missTokens: Number(usage.prompt_cache_miss_tokens) || 0,
    completionTokens: Number(usage.completion_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || 0,
  }
}

/** 记录一次成功 AI 调用（异步，等待发送完成） */
async function logSuccessfulAICall(
  messages: Array<{ role: string; content: string }>,
  response: string,
  options: AICallOptions,
  pool: CachePoolType,
  usage?: AICallUsageSnapshot,
  finishReason?: string,
  requestId?: string,
): Promise<void> {
  if (!isValidAiContent(response)) return

  const maxTokens = resolveMaxTokens(options)
  const truncated = isTruncatedResponse(usage, maxTokens, finishReason)
  const resolvedMeta = options.logMetaResolver?.(response) ?? {}

  await recordAICallLog({
    category: resolveLogCategory(pool, options.logCategory),
    messages,
    response,
    logContext: {
      ...options.logContext,
      pool: options.logContext?.pool ?? pool,
      model: options.logContext?.model ?? options.customModel ?? options.config.model,
      sessionId: options.logContext?.sessionId ?? options.sessionId,
    },
    usage,
    extraMeta: {
      maxTokens,
      truncated,
      ...(finishReason ? { finishReason } : {}),
      ...(requestId ? { requestId } : {}),
      ...resolvedMeta,
      ...options.logMeta,
    },
  })
}

/** 最终失败时记录（异步，等待发送完成） */
async function logFailedAICall(
  messages: Array<{ role: string; content: string }>,
  options: AICallOptions,
  pool: CachePoolType,
  reason: string,
  usage?: AICallUsageSnapshot,
  finishReason?: string,
  lastContent?: string,
  requestId?: string,
): Promise<void> {
  const maxTokens = resolveMaxTokens(options)
  const truncated = isTruncatedResponse(usage, maxTokens, finishReason)
  const resolverMeta = lastContent && options.logMetaResolver
    ? options.logMetaResolver(lastContent)
    : {}

  await recordAICallLog({
    category: resolveLogCategory(pool, options.logCategory),
    messages,
    response: lastContent?.trim()
      ? lastContent
      : `[调用失败] ${reason}`,
    logContext: {
      ...options.logContext,
      pool: options.logContext?.pool ?? pool,
      model: options.logContext?.model ?? options.customModel ?? options.config.model,
      sessionId: options.logContext?.sessionId ?? options.sessionId,
      callKind: options.logContext?.callKind ?? 'api-failed',
    },
    usage,
    extraMeta: {
      failed: true,
      failureReason: reason,
      maxTokens,
      truncated,
      ...(finishReason ? { finishReason } : {}),
      ...(requestId ? { requestId } : {}),
      validationPassed: false,
      validationError: reason,
      validationDetails: typeof resolverMeta.validationDetails === 'string'
        ? resolverMeta.validationDetails
        : `调用失败: ${reason}`,
      ...resolverMeta,
      ...options.logMeta,
    },
  })
}

/** 记录本地兜底（未调用 API，仍一次一条便于分析） */
function logFallbackAICall(
  messages: Array<{ role: string; content: string }>,
  fallbackText: string,
  options: AICallOptions,
  pool: CachePoolType,
  reason: string,
): void {
  recordAICallLog({
    category: resolveLogCategory(pool, options.logCategory),
    messages,
    response: fallbackText,
    logContext: {
      ...options.logContext,
      pool: options.logContext?.pool ?? pool,
      callKind: options.logContext?.callKind ?? 'fallback-local',
    },
    extraMeta: { fallbackReason: reason },
    isFallback: true,
  })
}

/** 由 system + userPrompt / userSegments 构建完整 messages */
function buildMessagesFromPrompt(
  systemPrompt: string,
  userPrompt: string,
  userSegments?: string[],
  extraUserMessages?: string[],
): Array<{ role: string; content: string }> {
  const userMessages = userSegments?.length ? userSegments : [userPrompt]
  const trailing = extraUserMessages?.filter((m) => m.trim().length > 0) ?? []
  return [
    { role: 'system', content: systemPrompt },
    ...userMessages.map((content) => ({ role: 'user', content })),
    ...trailing.map((content) => ({ role: 'user', content })),
  ]
}

/** 缓存命中信息（单次调用快照，由 usage 派生） */
export interface CacheHitInfo {
  hitTokens: number
  missTokens: number
  totalInputTokens: number
}

export type { AICallLogContext, AICallUsageSnapshot }

// ---- 缓存统计 ----

/** 从 usage 字段提取并累加缓存统计 */
function accumulateCacheStats(usage: Record<string, unknown>): void {
  const hit = Number(usage.prompt_cache_hit_tokens) || 0
  const miss = Number(usage.prompt_cache_miss_tokens) || 0
  if (hit === 0 && miss === 0) return
  try {
    const raw = localStorage.getItem(CACHE_STATS_KEY)
    const stats = raw ? JSON.parse(raw) : { hitTokens: 0, missTokens: 0 }
    stats.hitTokens = (stats.hitTokens || 0) + hit
    stats.missTokens = (stats.missTokens || 0) + miss
    localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(stats))
    // 通知所有监听组件：缓存统计已更新
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cache-stats-updated'))
    }
  } catch (_error) {
    // console.warn('ai-client: 缓存统计写入 localStorage 失败', error)
  }
}

/** 获取缓存统计 */
export function getCacheStats(): { hitTokens: number; missTokens: number; hitRate: number } {
  try {
    const raw = localStorage.getItem(CACHE_STATS_KEY)
    const stats = raw ? JSON.parse(raw) : { hitTokens: 0, missTokens: 0 }
    const total = (stats.hitTokens || 0) + (stats.missTokens || 0)
    return {
      hitTokens: stats.hitTokens || 0,
      missTokens: stats.missTokens || 0,
      hitRate: total > 0 ? Math.round(((stats.hitTokens || 0) / total) * 10000) / 100 : 0,
    }
  } catch {
    return { hitTokens: 0, missTokens: 0, hitRate: 0 }
  }
}

/** 重置缓存统计 */
export function resetCacheStats(): void {
  try {
    localStorage.setItem(CACHE_STATS_KEY, JSON.stringify({ hitTokens: 0, missTokens: 0 }))
  } catch (_error) {
    // console.warn('ai-client: 缓存统计重置 localStorage 失败', _error)
  }
}

/** 记录单轮 KV 策略观测（保留最近 10 轮） */
export function recordRoundCacheMetrics(
  metrics: Omit<RoundCacheMetrics, 'timestamp'>,
): void {
  try {
    const raw = localStorage.getItem(ROUND_CACHE_METRICS_KEY)
    const list: RoundCacheMetrics[] = raw ? JSON.parse(raw) : []
    list.push({ ...metrics, timestamp: Date.now() })
    while (list.length > MAX_ROUND_CACHE_METRICS) {
      list.shift()
    }
    localStorage.setItem(ROUND_CACHE_METRICS_KEY, JSON.stringify(list))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('round-cache-metrics-updated'))
    }
  } catch (_error) {
    // localStorage 不可用时静默跳过
  }
}

/** 读取最近轮次 KV 策略观测 */
export function getRoundCacheMetrics(): RoundCacheMetrics[] {
  try {
    const raw = localStorage.getItem(ROUND_CACHE_METRICS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// ---- 核心调用 ----

/**
 * 构建 user_id
 * 格式：{poolPrefix}-{sessionId}
 * 同 sessionId + 同 pool = 共享 KV Cache
 */
function buildUserId(pool: CachePoolType, sessionId?: string): string {
  const prefix = POOL_PREFIX[pool]
  const sid = sessionId ?? 'default'
  return `${prefix}-${sid}`
}

/** 构建请求体公共逻辑 */
function buildRequestBody(
  config: AIModelConfig,
  messages: Array<{ role: string; content: string }>,
  stream: boolean,
  pool: CachePoolType,
  sessionId?: string,
  options?: Pick<AICallOptions, 'overrideMaxTokens' | 'overrideTemperature' | 'overrideTopP' | 'jsonMode' | 'storySeed' | 'reasoningEffort'>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options?.overrideTemperature ?? config.temperature,
    max_tokens: options?.overrideMaxTokens ?? config.maxTokens,
    user_id: buildUserId(pool, sessionId),
    stream,
  }

  if (options?.overrideTopP !== undefined) {
    body.top_p = options.overrideTopP
  }

  if (options?.jsonMode === false) {
    /* 数组输出等场景：显式关闭 JSON Mode */
  } else if (options?.jsonMode) {
    body.response_format = { type: 'json_object' }
  } else if (config.responseFormat) {
    body.response_format = config.responseFormat
  }

  if (options?.storySeed) {
    body.seed = Number(options.storySeed)
  }

  // 推理强度 → thinking 参数
  const effort = options?.reasoningEffort ?? config.reasoningEffort ?? 'disabled'
  if (effort !== 'disabled') {
    const budgetTokens = REASONING_BUDGET_MAP[effort] ?? 0
    if (budgetTokens > 0) {
      body.thinking = { budget_tokens: budgetTokens }
    }
  }

  return body
}

/** 构建代理请求体（含 Provider 路由信息） */
function buildProxyBody(
  config: AIModelConfig,
  messages: Array<{ role: string; content: string }>,
  stream: boolean,
  pool: CachePoolType,
  sessionId?: string,
  options?: Pick<AICallOptions, 'overrideMaxTokens' | 'overrideTemperature' | 'overrideTopP' | 'jsonMode' | 'storySeed' | 'reasoningEffort' | 'providerId' | 'apiKey' | 'customBaseUrl' | 'customModel'>,
): Record<string, unknown> {
  const aiBody = buildRequestBody(config, messages, stream, pool, sessionId, options)

  // 提取 AI 请求的核心字段
  const proxyBody: Record<string, unknown> = {
    model: aiBody.model,
    messages: aiBody.messages,
    temperature: aiBody.temperature,
    max_tokens: aiBody.max_tokens,
    stream: aiBody.stream,
    user_id: aiBody.user_id,
  }

  if (aiBody.top_p !== undefined) proxyBody.top_p = aiBody.top_p
  if (aiBody.response_format !== undefined) proxyBody.response_format = aiBody.response_format
  if (aiBody.seed !== undefined) proxyBody.seed = aiBody.seed
  if (aiBody.thinking !== undefined) proxyBody.thinking = aiBody.thinking

  // Provider 路由信息
  const providerId = options?.providerId ?? DEFAULT_AI_PROVIDER_ID
  proxyBody.providerId = providerId
  if (options?.providerId === undefined) {
    proxyBody.model = DEFAULT_AI_MODEL
  }

  // DeepSeek V4 的 thinking 对象必须显式携带 type；启用时同时保留用户选择的预算。
  const reasoningEffort = options?.reasoningEffort ?? config.reasoningEffort ?? 'disabled'
  if (providerId === 'deepseek') {
    if (reasoningEffort === 'disabled') {
      proxyBody.thinking = { type: 'disabled' }
    } else {
      const budgetTokens = REASONING_BUDGET_MAP[reasoningEffort] ?? 0
      proxyBody.thinking = budgetTokens > 0
        ? { type: 'enabled', budget_tokens: budgetTokens }
        : { type: 'enabled' }
    }
  }

  // 自定义配置
  if (providerId === 'custom') {
    if (options?.apiKey) proxyBody.apiKey = options.apiKey
    if (options?.customBaseUrl) proxyBody.baseUrl = options.customBaseUrl
    if (options?.customModel) proxyBody.model = options.customModel
  } else if (options?.apiKey) {
    // 非自定义 Provider 但覆盖了 API Key
    proxyBody.apiKey = options.apiKey
  }

  return proxyBody
}

/** 合并多个 AbortSignal，任一触发则合并后的 signal 也触发 */
function mergeSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const s of signals) {
    if (s.aborted) {
      controller.abort()
      return controller.signal
    }
    s.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const signal = init.signal
      ? mergeSignals([init.signal, controller.signal])
      : controller.signal
    return await fetch(url, { ...init, signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 计算退避延迟
 */
function getBackoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter) return retryAfter * 1000
  return RETRY_DELAY_MS * (attempt + 1)
}

/**
 * 通用重试执行器 —— 每次 API 返回有效正文即写入 debug-log（业务校验由 logMetaResolver 附加）
 */
async function executeAiFetchWithRetry(
  messages: Array<{ role: string; content: string }>,
  options: AICallOptions,
  pool: CachePoolType,
  fetchFn: () => Promise<FetchAIResult>,
  _signal?: AbortSignal,
): Promise<string> {
  let lastUsage: AICallUsageSnapshot | undefined
  let lastFinishReason: string | undefined
  let lastContent: string | undefined
  let lastRequestId: string | undefined

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const { content, usage, finishReason, requestId } = await fetchFn()
      lastUsage = usage
      lastFinishReason = finishReason
      lastContent = content
      lastRequestId = requestId

      if (!isValidAiContent(content)) {
        if (attempt < MAX_RETRY - 1) {
          // 重试前清空消费端已 append 的部分流式文本，避免拼接重复
          options.onResetStream?.()
          await new Promise((r) => setTimeout(r, getBackoffDelay(attempt)))
          continue
        }
        await logFailedAICall(
          messages, options, pool, 'AI 返回空响应', usage, finishReason, lastContent, requestId,
        )
        throw new Error('AI 返回了空内容')
      }

      await logSuccessfulAICall(messages, content, options, pool, usage, finishReason, requestId)
      return content
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      if (err instanceof AIHttpError) lastRequestId = err.requestId
      if (attempt < MAX_RETRY - 1 && isRetryableAiError(err)) {
        // 重试前清空消费端已 append 的部分流式文本，避免拼接重复
        options.onResetStream?.()
        // 429 限流时取 provider 的 retryAfter 与固定退避中的较大值
        const retryAfter = err instanceof RateLimitError ? err.retryAfter : undefined
        const delay = Math.max(
          getBackoffDelay(attempt),
          retryAfter ? retryAfter * 1000 : 0,
        )
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      if (onAiError && !isRetryError(err)) {
        onAiError(`AI 调用失败：${formatAiError(err)}`)
      }
      if (!(err instanceof Error && err.message === 'AI 返回了空内容')) {
        await logFailedAICall(
          messages,
          options,
          pool,
          err instanceof Error ? err.message : String(err),
          lastUsage,
          lastFinishReason,
          lastContent,
          lastRequestId,
        )
      }
      throw err
    }
  }

  if (onAiError) {
    onAiError('AI 调用失败，已达最大重试次数')
  }
  await logFailedAICall(
    messages, options, pool, '已达最大重试次数', lastUsage, lastFinishReason, lastContent, lastRequestId,
  )
  throw new Error('AI 调用失败，已达最大重试次数')
}

/**
 * 单次非流式请求（fetch → 处理响应 → 提取内容 + 缓存统计）
 */
async function fetchAIResponse(
  proxyBody: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<FetchAIResult> {
  const resp = await fetchWithTimeout('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyBody),
    signal,
  }, TIMEOUT_MS)
  const requestId = resp.headers.get('x-ai-request-id') ?? undefined

  if (resp.status === 429) {
    throw new RateLimitError(await parseRetryAfter(resp))
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => 'Unknown error')
    logger.errorRaw('ai-client', `AI API 返回 ${resp.status}`, errText, undefined, {
      requestId,
      status: resp.status,
    })
    throw new AIHttpError(resp.status, errText, requestId)
  }

  const data = (await resp.json()) as AIResponse
  const usage = parseUsage(data.usage)

  if (data.usage) {
    accumulateCacheStats(data.usage as unknown as Record<string, unknown>)
  }

  return {
    content: data.choices?.[0]?.message?.content ?? '',
    usage,
    finishReason: data.choices?.[0]?.finish_reason,
    requestId,
  }
}

/**
 * Zod 校验 + 失败重试一次
 * @returns 校验通过返回原始 content；strictSchema=true 时失败抛错，否则保留原宽松返回。
 */
async function validateWithRetry(
  content: string,
  schema: ZodSchema,
  callContext: { systemPrompt: string; userPrompt: string; options: AICallOptions },
): Promise<string> {
  // 字符串 schema 走简单校验（不 JSON.parse — 摘要输出就是纯字符串）
  if (schema instanceof z.ZodString) {
    const validation = schema.safeParse(content)
    if (validation.success) return content
    logger.warnRaw('ai-client', 'Zod 字符串校验失败，返回原始内容', '')
    if (callContext.options.strictSchema) {
      throw new Error('AI response failed string schema validation')
    }
    return content
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (jsonError) {
    // JSON.parse 失败 → 先尝试 parseAIJSON 多层容错修复
    const repaired = parseAIJSON(content)
    if (repaired !== null) {
      logger.warnRaw('ai-client', '原始 JSON 解析失败，通过 parseAIJSON 修复成功', '')
      parsed = repaired
    } else if (callContext.options.strictSchema) {
      // 修复失败 → 重试一次再严格抛错
      logger.warnRaw('ai-client', 'JSON 解析失败，重试一次', (jsonError as Error).message)
      const { outputSchema: _, ...restOpts } = callContext.options
      try {
        const retryContent = await callAI(
          callContext.systemPrompt,
          callContext.userPrompt,
          { ...restOpts, extraUserMessages: ['前次输出 JSON 格式无效，请严格按照 JSON Schema 输出合法 JSON，禁止 markdown 包裹。'] },
        )
        const retryRepaired = parseAIJSON(retryContent)
        if (retryRepaired !== null) {
          parsed = retryRepaired
        } else {
          // parseAIJSON 也修不好，尝试原生 JSON.parse
          parsed = JSON.parse(retryContent)
        }
      } catch (retryErr) {
        throw retryErr instanceof Error
          ? new Error(`AI response is not valid JSON after retry: ${retryErr.message}`)
          : new Error('AI response is not valid JSON after retry')
      }
    } else {
      return content
    }
  }

  const validation = schema.safeParse(parsed)
  if (validation.success) return content

  // 校验失败 → 记录警告并重试一次
  logger.warnRaw(
    'ai-client',
    'Zod 校验失败，重试一次',
    JSON.stringify(validation.error.issues.slice(0, 5)),
  )

  // 重试（去掉 outputSchema 避免无限递归）
  const { outputSchema: _, ...restOptions } = callContext.options
  const retryResult = await callAI(
    callContext.systemPrompt,
    callContext.userPrompt,
    { ...restOptions, extraUserMessages: ['前次输出校验失败，请严格按照 JSON Schema 重新输出。'] },
  )

  try {
    const retryParsed = JSON.parse(retryResult)
    const retryValidation = schema.safeParse(retryParsed)
    if (retryValidation.success) return retryResult
  } catch {
    // fallthrough: strict 模式在下方统一抛 schema 失败，宽松模式返回原文。
  }

  logger.warnRaw('ai-client', 'Zod 二次校验仍失败，返回原始内容', '')
  if (callContext.options.strictSchema) {
    throw new Error('AI response failed schema validation after retry')
  }
  return retryResult || content
}

/**
 * 基础 AI 调用（非流式，带重试）
 * @param systemPrompt - 系统提示词
 * @param userPrompt - 用户提示词
 * @param options - AI 调用选项
 * @returns AI 生成的文本内容
 */
export async function callAI(systemPrompt: string, userPrompt: string, options: AICallOptions): Promise<string> {
  const { config, pool = 'narrative', sessionId, signal, overrideMaxTokens, overrideTemperature, overrideTopP, jsonMode, storySeed, providerId, apiKey, customBaseUrl, customModel, reasoningEffort, userSegments, extraUserMessages, outputSchema } = options

  const messages = buildMessagesFromPrompt(systemPrompt, userPrompt, userSegments, extraUserMessages)

  const result = await executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIResponse(
      buildProxyBody(config, messages, false, pool, sessionId, {
        overrideMaxTokens, overrideTemperature, overrideTopP, jsonMode, storySeed,
        providerId, apiKey, customBaseUrl, customModel, reasoningEffort,
      }),
      signal,
    ),
    signal,
  )

  // Zod 校验（如果提供了 outputSchema）
  if (outputSchema && jsonMode) {
    return validateWithRetry(result, outputSchema, { systemPrompt, userPrompt, options })
  }

  return result
}

/**
 * 对话式 AI 调用（多轮消息，带重试）
 */
export async function callAIConversation(
  messages: Array<{ role: string; content: string }>,
  options: AICallOptions,
): Promise<string> {
  const { config, pool = 'narrative', sessionId, signal, overrideMaxTokens, overrideTemperature, overrideTopP, jsonMode, storySeed, providerId, apiKey, customBaseUrl, customModel, reasoningEffort } = options

  return executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIResponse(
      buildProxyBody(config, messages, false, pool, sessionId, {
        overrideMaxTokens, overrideTemperature, overrideTopP, jsonMode, storySeed,
        providerId, apiKey, customBaseUrl, customModel, reasoningEffort,
      }),
      signal,
    ),
    signal,
  )
}

/**
 * 单次流式请求（fetch → SSE 解析）
 */
async function fetchAIStreamResponse(
  proxyBody: Record<string, unknown>,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<FetchAIResult> {
  const resp = await fetchWithTimeout('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyBody),
    signal,
  }, TIMEOUT_MS)
  const requestId = resp.headers.get('x-ai-request-id') ?? undefined

  if (resp.status === 429) {
    throw new RateLimitError(await parseRetryAfter(resp))
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => 'Unknown error')
    logger.errorRaw('ai-client', `AI Stream 返回 ${resp.status}`, errText, undefined, {
      requestId,
      status: resp.status,
    })
    throw new AIHttpError(resp.status, errText, requestId, true)
  }

  const result = await handleStreamResponse(resp, onChunk)
  return { ...result, requestId }
}

/**
 * 流式对话式 AI 调用（多轮 messages，带重试）
 */
export async function callAIStreamConversation(
  messages: Array<{ role: string; content: string }>,
  options: AICallOptions,
): Promise<string> {
  const {
    config,
    pool = 'narrative',
    sessionId,
    onChunk,
    signal,
    overrideMaxTokens,
    overrideTemperature,
    overrideTopP,
    jsonMode,
    storySeed,
    providerId,
    apiKey,
    customBaseUrl,
    customModel,
    reasoningEffort,
  } = options

  return executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIStreamResponse(
      buildProxyBody(config, messages, true, pool, sessionId, {
        overrideMaxTokens,
        overrideTemperature,
        overrideTopP,
        jsonMode,
        storySeed,
        providerId,
        apiKey,
        customBaseUrl,
        customModel,
        reasoningEffort,
      }),
      onChunk,
      signal,
    ),
    signal,
  )
}

/**
 * 流式 AI 调用（带重试）
 * @param systemPrompt - 系统提示词
 * @param userPrompt - 用户提示词
 * @param options - AI 调用选项
 * @returns AI 生成的完整文本内容
 */
export async function callAIStream(
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions,
): Promise<string> {
  const { config, pool = 'narrative', sessionId, onChunk, signal, overrideMaxTokens, overrideTemperature, overrideTopP, jsonMode, storySeed, providerId, apiKey, customBaseUrl, customModel, reasoningEffort, userSegments, extraUserMessages } = options

  const messages = buildMessagesFromPrompt(systemPrompt, userPrompt, userSegments, extraUserMessages)

  return executeAiFetchWithRetry(
    messages,
    options,
    pool,
    () => fetchAIStreamResponse(
      buildProxyBody(config, messages, true, pool, sessionId, {
        overrideMaxTokens, overrideTemperature, overrideTopP, jsonMode, storySeed,
        providerId, apiKey, customBaseUrl, customModel, reasoningEffort,
      }),
      onChunk,
      signal,
    ),
    signal,
  )
}

/**
 * 降级 AI 调用（对话式 → 单轮 → 兜底文本）
 *
 * 降级链：
 *   L0: callAIConversation（多轮对话，保留上下文）
 *   L1: callAI（单轮 system+user，丢失上下文但更稳定）
 *   L2: 返回兜底文本（完全不用 AI，保证叙事不中断）
 */
export async function callAIDegraded(
  messages: Array<{ role: string; content: string }>,
  fallbackText: string,
  options: AICallOptions,
): Promise<string> {
  // L0: 尝试对话式调用
  try {
    const result = await callAIConversation(messages, options)
    if (result && result.trim() !== '' && result.trim() !== '无') {
      return result
    }
    // 空响应也视为失败
    throw new Error('AI returned empty response')
  } catch {
    // 对话式失败，降级到单轮（Toast 已在 executeAiFetchWithRetry 层触发）
  }

  // L1: 降级为单轮调用（保留最近 1 条 assistant 回复作为上下文）
  try {
    const systemMsg = messages.find((m) => m.role === 'system')
    const recentUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const recentAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
    if (recentUserMsg && systemMsg) {
      // 如果有最近的 assistant 回复，将其作为上下文附加到 user prompt
      let userContent = recentUserMsg.content
      if (recentAssistantMsg) {
        // 使用完整上轮回复保持叙事连贯性
        userContent = `【上轮回复】${recentAssistantMsg.content}\n\n【本轮输入】${userContent}`
      }
      const result = await callAI(systemMsg.content, userContent, options)
      if (result && result.trim() !== '' && result.trim() !== '无') {
        return result
      }
      throw new Error('AI returned empty response at L1')
    }
  } catch {
    // 单轮也失败，降级为兜底文本（Toast 已在 executeAiFetchWithRetry 层触发）
  }

  // L2: 兜底文本
  logFallbackAICall(messages, fallbackText, options, options.pool ?? 'narrative', 'degraded-L2')
  return fallbackText
}

/**
 * 降级流式 AI 调用（流式 → 兜底文本）
 *
 * 降级链：
 *   L0: callAIStream（流式输出）
 *   L1: 返回兜底文本（保证叙事不中断）
 */
export async function callAIStreamDegraded(
  systemPrompt: string,
  userPrompt: string,
  fallbackText: string,
  options: Omit<AICallOptions, 'onChunk'> & {
    onChunk?: (text: string) => void
    /** S3 多轮 messages；提供时优先于 systemPrompt + userPrompt */
    messages?: Array<{ role: string; content: string }>
  },
): Promise<string> {
  const pool = options.pool ?? 'narrative'
  const messages = options.messages?.length
    ? options.messages
    : buildMessagesFromPrompt(systemPrompt, userPrompt, options.userSegments, options.extraUserMessages)

  try {
    const result = options.messages?.length
      ? await callAIStreamConversation(options.messages, options as AICallOptions)
      : await callAIStream(systemPrompt, userPrompt, options as AICallOptions)
    if (result && result.trim() !== '' && result.trim() !== '无') {
      // Zod 校验（如果提供了 outputSchema）
      if ((options as AICallOptions).outputSchema && (options as AICallOptions).jsonMode) {
        return validateWithRetry(result, (options as AICallOptions).outputSchema!, {
          systemPrompt, userPrompt, options: options as AICallOptions,
        })
      }
      return result
    }
    throw new Error('Stream returned empty response')
  } catch {
    // 流式失败，降级为兜底文本
  }

  // 降级前清空消费端已 append 的部分流式文本，避免兜底文本拼接到残留内容之后
  options.onResetStream?.()
  if (options.onChunk) {
    options.onChunk(fallbackText)
  }
  logFallbackAICall(messages, fallbackText, options as AICallOptions, pool, 'stream-degraded')
  return fallbackText
}

/**
 * 解析 SSE 流式响应
 * SSE 格式：data: {"choices":[{"delta":{"content":"..."}}]}
 */
async function handleStreamResponse(
  response: Response,
  onChunk?: (text: string) => void,
): Promise<FetchAIResult> {
  const reader = response.body?.getReader()
  if (!reader) return { content: '' }

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''
  let usage: AICallUsageSnapshot | undefined
  let finishReason: string | undefined

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue

        const jsonStr = trimmed.slice(6)
        if (jsonStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(jsonStr)
          const prevLen = fullText.length
          fullText = mergeStreamTextChunk(fullText, parsed)
          const emitted = fullText.slice(prevLen)
          if (emitted) {
            onChunk?.(emitted)
          }
          if (parsed?.usage) {
            usage = parseUsage(parsed.usage)
            accumulateCacheStats(parsed.usage)
          }
          const chunkFinish = parsed?.choices?.[0]?.finish_reason
          if (typeof chunkFinish === 'string' && chunkFinish) {
            finishReason = chunkFinish
          }
        } catch (_error) {
          // 跳过无法解析的行
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { content: fullText, usage, finishReason }
    }
    throw err
  } finally {
    reader.releaseLock()
  }

  return { content: fullText, usage, finishReason }
}
