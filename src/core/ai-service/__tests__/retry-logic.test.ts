/**
 * 重试逻辑单元测试
 * 验证 400 系列错误不再无效重试
 */

import { describe, it, expect } from '@jest/globals'

// 模拟 AIHttpError
class AIHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseText: string,
    public readonly requestId?: string,
    stream = false,
    public readonly retryAfter?: number,
  ) {
    super(`HTTP ${status}`)
    this.name = stream ? 'AIStreamHttpError' : 'AIHttpError'
  }
}

// 从 ai-client.ts 提取的核心逻辑
function isRetryableAiError(error: unknown): boolean {
  if (error instanceof AIHttpError) {
    // 400系列客户端错误（参数错误、内容审核、凭据问题等）不应重试
    if (error.status >= 400 && error.status < 500) {
      // 例外：408超时、429限流可以重试
      return error.status === 408 || error.status === 429
    }
    // 500系列服务端错误可以重试
    return error.status >= 500
  }
  if (error instanceof Error && error.name === 'AbortError') return false
  return true
}

describe('AI 调用重试逻辑', () => {
  describe('400 系列错误（客户端错误）', () => {
    it('400 Bad Request 不应重试', () => {
      const error = new AIHttpError(400, '抱歉，您所输入的内容含有违规信息')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('401 Unauthorized 不应重试', () => {
      const error = new AIHttpError(401, 'API Key 无效')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('403 Forbidden 不应重试', () => {
      const error = new AIHttpError(403, '权限不足')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('404 Not Found 不应重试', () => {
      const error = new AIHttpError(404, 'Model not found')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('408 Timeout 应该重试', () => {
      const error = new AIHttpError(408, 'Request timeout')
      expect(isRetryableAiError(error)).toBe(true)
    })

    it('413 Payload Too Large 不应重试', () => {
      const error = new AIHttpError(413, 'Request body too large')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('422 Unprocessable Entity 不应重试', () => {
      const error = new AIHttpError(422, 'Invalid parameters')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('429 Rate Limited 应该重试', () => {
      const error = new AIHttpError(429, 'Rate limit exceeded')
      expect(isRetryableAiError(error)).toBe(true)
    })
  })

  describe('500 系列错误（服务端错误）', () => {
    it('500 Internal Server Error 应该重试', () => {
      const error = new AIHttpError(500, 'Internal server error')
      expect(isRetryableAiError(error)).toBe(true)
    })

    it('502 Bad Gateway 应该重试', () => {
      const error = new AIHttpError(502, 'Bad gateway')
      expect(isRetryableAiError(error)).toBe(true)
    })

    it('503 Service Unavailable 应该重试', () => {
      const error = new AIHttpError(503, 'Service unavailable')
      expect(isRetryableAiError(error)).toBe(true)
    })

    it('504 Gateway Timeout 应该重试', () => {
      const error = new AIHttpError(504, 'Gateway timeout')
      expect(isRetryableAiError(error)).toBe(true)
    })
  })

  describe('特殊错误类型', () => {
    it('AbortError 不应重试', () => {
      const error = new Error('Aborted')
      error.name = 'AbortError'
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('普通 Error 应该重试', () => {
      const error = new Error('Network error')
      expect(isRetryableAiError(error)).toBe(true)
    })

    it('网络连接失败应该重试', () => {
      const error = new Error('fetch failed')
      expect(isRetryableAiError(error)).toBe(true)
    })
  })

  describe('真实场景模拟', () => {
    it('内容审核拒绝（400）不应重试', () => {
      // 模拟日志中的真实错误
      const error = new AIHttpError(
        400,
        '抱歉，您所输入的内容含有违规信息，请重新编辑后再发送',
        'cebc24ad-c4e9-4eb5-a872-e2836de9664e',
      )
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('API Key 失效（401）不应重试', () => {
      // 模拟日志中的真实错误
      const error = new AIHttpError(
        401,
        'API Key 无效，请检查后重试。原因：当前请求使用的 API Key 无效、已删除、已禁用或格式不正确。',
        '24132162-4d75-407f-98db-c92e534b3a69',
      )
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('客户端中断（499）不应重试', () => {
      const error = new AIHttpError(499, 'Client aborted mid-stream')
      expect(isRetryableAiError(error)).toBe(false)
    })

    it('上游超时（502）应该重试', () => {
      const error = new AIHttpError(502, 'Connection failed or timeout')
      expect(isRetryableAiError(error)).toBe(true)
    })
  })
})
