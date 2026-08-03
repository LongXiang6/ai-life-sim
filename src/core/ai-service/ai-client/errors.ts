/**
 * Purpose: Classify AI client failures and publish the UI error notification contract.
 * Owner: core:ai-service
 * Responsibility: Error representation and user-facing formatting; it does not perform retries or network calls.
 */

import type { AICallUsageSnapshot } from '../../logger/ai-call-log'
import { formatApiErrorForUser } from '../api-error'

let onAiError: ((message: string) => void) | null = null

export function setOnAiError(callback: (message: string) => void): void {
  onAiError = callback
}

export function notifyAiError(message: string): void {
  onAiError?.(message)
}

export class AIHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseText: string,
    public readonly requestId?: string,
    stream = false,
    public readonly retryAfter?: number,
  ) {
    super(formatApiErrorForUser(status, responseText, requestId))
    this.name = stream ? 'AIStreamHttpError' : 'AIHttpError'
  }
}

export function isAiCredentialError(error: unknown): boolean {
  if (error instanceof AIHttpError) return error.status === 401 || error.status === 403
  if (!error || typeof error !== 'object' || !('status' in error)) return false
  const status = (error as { status?: unknown }).status
  return status === 401 || status === 403
}

export async function parseRetryAfter(response: Response): Promise<number | undefined> {
  try {
    const errorData = (await response.clone().json()) as { retryAfter?: number }
    if (typeof errorData.retryAfter === 'number') return errorData.retryAfter
  } catch {
    // Invalid provider error bodies use the fixed retry delay.
  }
  return undefined
}

export class AIResponseTruncatedError extends Error {
  public readonly responseLength: number

  constructor(
    public readonly content: string,
    public readonly finishReason: string | undefined,
    public readonly requestId: string | undefined,
    public readonly maxTokens: number | undefined,
    public readonly usage: AICallUsageSnapshot | undefined,
  ) {
    const requestSuffix = requestId ? `（请求编号 ${requestId}）` : ''
    super(`AI 输出达到 max_tokens 长度上限，结果不完整${requestSuffix}`)
    this.name = 'AIResponseTruncatedError'
    this.responseLength = content.length
  }
}

export function isAiResponseTruncatedError(error: unknown): error is AIResponseTruncatedError {
  return error instanceof AIResponseTruncatedError
}

export function isRetryableAiError(error: unknown): boolean {
  if (isAiResponseTruncatedError(error)) return false
  if (error instanceof AIHttpError) return error.status === 408 || error.status === 429 || error.status >= 500
  if (error instanceof Error && error.name === 'AbortError') return false
  return true
}

export function formatAiError(error: unknown, status?: number, errorText?: string): string {
  if (status !== undefined && errorText !== undefined) return formatApiErrorForUser(status, errorText)
  if (error instanceof AIHttpError) return error.message
  if (isAiResponseTruncatedError(error)) return `${error.message}。请重试本轮。`
  if (!(error instanceof Error)) return '未知错误'

  const message = error.message
  const statusMatch = message.match(/AI API (stream )?error (\d+)/)
  if (statusMatch) {
    const extractedStatus = Number.parseInt(statusMatch[2])
    const remainder = message.slice(statusMatch[0].length).trim()
    const normalized = remainder.startsWith(': ') ? remainder.slice(2).trim() : remainder
    return formatApiErrorForUser(extractedStatus, normalized || message)
  }
  if (message.startsWith('AI API error')) return message
  if (message.includes('timeout') || message.includes('Timeout')) return '请求超时。解决办法：检查网络后重试。'
  if (message.includes('fetch')) return '网络连接失败。解决办法：检查网络和接口网址后重试。'
  if (message.includes('empty')) return 'AI 返回空响应。解决办法：重新请求或更换模型。'
  return message.split('\n')[0].slice(0, 100)
}
