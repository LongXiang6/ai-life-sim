import {
  getProviderModelCandidates,
  shouldTryManagedFallback,
} from './provider-config'
import { aggregateSseCompletion } from './managed-sse-aggregation'

export interface ManagedUpstreamAttempt {
  model: string
  status?: number
  durationMs: number
  error?: string
}

export type ManagedAggregatedResult =
  | {
      kind: 'success'
      model: string
      responseBody: string
      contentChars: number
      headers: Headers
      attempts: ManagedUpstreamAttempt[]
    }
  | {
      kind: 'upstream-error'
      model: string
      status: number
      errorText: string
      headers: Headers
      attempts: ManagedUpstreamAttempt[]
    }
  | {
      kind: 'client-abort' | 'failure'
      model: string
      error: string
      attempts: ManagedUpstreamAttempt[]
    }

interface ManagedAggregatedRequest {
  providerId: string
  requestedModel: string
  apiUrl: string
  apiKey: string
  forwardBody: Record<string, unknown>
  clientSignal: AbortSignal
  timeoutMs: number
  fetchImpl?: typeof fetch
}

/**
 * 托管非流式调用在服务端完整聚合后才返回浏览器，因此主模型失败时可安全切换备用模型，
 * 不会把两次尝试的部分正文拼接到同一轮叙事中。
 */
export async function requestManagedAggregatedCompletion({
  providerId,
  requestedModel,
  apiUrl,
  apiKey,
  forwardBody,
  clientSignal,
  timeoutMs,
  fetchImpl = fetch,
}: ManagedAggregatedRequest): Promise<ManagedAggregatedResult> {
  const candidates = getProviderModelCandidates(providerId, requestedModel)
  const attempts: ManagedUpstreamAttempt[] = []

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    const attemptStartedAt = Date.now()
    const controller = new AbortController()
    const onClientAbort = () => controller.abort()
    clientSignal.addEventListener('abort', onClientAbort, { once: true })
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const cleanup = () => {
      clearTimeout(timeoutId)
      clientSignal.removeEventListener('abort', onClientAbort)
    }

    try {
      const response = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...forwardBody, model: candidate, stream: true }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '未知错误')
        attempts.push({
          model: candidate,
          status: response.status,
          durationMs: Date.now() - attemptStartedAt,
          error: errorText,
        })
        cleanup()
        if (index < candidates.length - 1 && shouldTryManagedFallback(response.status)) continue
        return {
          kind: 'upstream-error',
          model: candidate,
          status: response.status,
          errorText,
          headers: response.headers,
          attempts,
        }
      }

      if (!response.body) {
        const error = '托管通道未返回响应流'
        attempts.push({ model: candidate, durationMs: Date.now() - attemptStartedAt, error })
        cleanup()
        if (index < candidates.length - 1) continue
        return { kind: 'failure', model: candidate, error, attempts }
      }

      try {
        const aggregated = await aggregateSseCompletion(response.body)
        attempts.push({ model: candidate, status: 200, durationMs: Date.now() - attemptStartedAt })
        cleanup()
        return {
          kind: 'success',
          model: candidate,
          responseBody: aggregated.responseBody,
          contentChars: aggregated.contentChars,
          headers: response.headers,
          attempts,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        controller.abort()
        attempts.push({ model: candidate, status: 200, durationMs: Date.now() - attemptStartedAt, error: message })
        cleanup()
        if (clientSignal.aborted) {
          return { kind: 'client-abort', model: candidate, error: 'Client aborted', attempts }
        }
        if (index < candidates.length - 1) continue
        return { kind: 'failure', model: candidate, error: message, attempts }
      }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      attempts.push({ model: candidate, durationMs: Date.now() - attemptStartedAt, error: message })
      cleanup()
      if (clientSignal.aborted) {
        return { kind: 'client-abort', model: candidate, error: message, attempts }
      }
      if (index < candidates.length - 1) continue
      return { kind: 'failure', model: candidate, error: message, attempts }
    }
  }

  return {
    kind: 'failure',
    model: attempts.at(-1)?.model ?? requestedModel,
    error: '托管通道没有可用模型',
    attempts,
  }
}
