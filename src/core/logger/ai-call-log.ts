/**
 * @module ai-call-log.ts
 * @description AI 调用调试日志 —— 一次 API 调用一条记录，完整 messages + response
 * @mod core
 */

import type { DebugLogCategory } from './debug-logger'
import { logAICallFireAndForget } from './debug-logger'
import { isValidAiContent } from '../ai-service/stream-text-extractor'

/** 单条 AI 调用日志上下文（轮次 / 策略 / 调用类型） */
export interface AICallLogContext {
  round?: number
  age?: number
  era?: string
  /** S1 | S2 | S3 | warmup | compress 等 */
  strategy?: string
  /** narrative-main | immersion-warmup | summary-compress | fallback-local 等 */
  callKind?: string
  /** 代码触发位置，如 world-init/pipeline:calibration-tags */
  trigger?: string
  pool?: string
  model?: string
  sessionId?: string
}

/** API usage 字段（写入 meta） */
export interface AICallUsageSnapshot {
  hitTokens?: number
  missTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface RecordAICallLogParams {
  category: DebugLogCategory
  messages: Array<{ role: string; content: string }>
  response: string
  logContext?: AICallLogContext
  usage?: AICallUsageSnapshot
  extraMeta?: Record<string, unknown>
  /** true = 未调用 API，本地兜底文本 */
  isFallback?: boolean
}

/** 将 messages 序列化为可读 prompt（保留全部 role，含多 user/assistant） */
export function formatMessagesForLog(messages: Array<{ role: string; content: string }>): string {
  const roleIndex: Record<string, number> = {}
  return messages
    .map((m) => {
      const n = (roleIndex[m.role] = (roleIndex[m.role] ?? 0) + 1)
      const label = `${m.role}${n > 1 ? `[${n}]` : ''}`
      return `[${label}]\n${m.content}`
    })
    .join('\n\n')
}

/**
 * 记录一次 AI 调用（异步，等待发送完成）
 * @returns 发送成功返回 true，失败返回 false
 */
export async function recordAICallLog(params: RecordAICallLogParams): Promise<boolean> {
  const { category, messages, response, logContext, usage, extraMeta, isFallback } = params

  const isFailed = extraMeta?.failed === true
  if (!isFallback && !isFailed && !isValidAiContent(response)) {
    return false
  }

  const meta: Record<string, unknown> = {
    ...extraMeta,
    messageCount: messages.length,
    promptChars: formatMessagesForLog(messages).length,
    responseChars: response.length,
  }

  if (logContext) {
    if (logContext.strategy) meta.strategy = logContext.strategy
    if (logContext.callKind) meta.callKind = logContext.callKind
    if (logContext.trigger) meta.trigger = logContext.trigger
    if (logContext.pool) meta.pool = logContext.pool
    if (logContext.model) meta.model = logContext.model
    if (logContext.sessionId) meta.sessionId = logContext.sessionId
  }

  if (usage) {
    if (usage.hitTokens !== undefined) meta.cacheHitTokens = usage.hitTokens
    if (usage.missTokens !== undefined) meta.cacheMissTokens = usage.missTokens
    if (usage.completionTokens !== undefined) meta.completionTokens = usage.completionTokens
    if (usage.totalTokens !== undefined) meta.totalTokens = usage.totalTokens
    const inputTotal = (usage.hitTokens ?? 0) + (usage.missTokens ?? 0)
    if (inputTotal > 0) {
      meta.cacheHitRate = Math.round(((usage.hitTokens ?? 0) / inputTotal) * 10000) / 100
    }
  }

  if (isFallback) {
    meta.fallback = true
    meta.apiCalled = false
  } else {
    meta.apiCalled = true
  }

  return await logAICallFireAndForget({
    category,
    timestamp: Date.now(),
    round: logContext?.round,
    age: logContext?.age,
    era: logContext?.era,
    prompt: formatMessagesForLog(messages),
    response,
    meta,
  })
}
