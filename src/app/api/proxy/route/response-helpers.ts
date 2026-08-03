/**
 * Purpose: Parse upstream error payloads and construct proxy responses with diagnostic headers.
 * Owner: app:api
 * Responsibility: HTTP response projection only; upstream execution remains in the route lifecycle.
 */

export interface UpstreamErrorDiagnostic {
  message?: string
  type?: string
  param?: unknown
  code?: string
}

export function parseUpstreamErrorDiagnostic(
  errorText: string,
): UpstreamErrorDiagnostic | undefined {
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

export function jsonWithRequestId(
  requestId: string,
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(
    { ...body, requestId },
    { status, headers: { 'x-ai-request-id': requestId } },
  )
}

export function getUpstreamHeaderSnapshot(headers: Headers): Record<string, string> {
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
