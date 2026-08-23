/**
 * Purpose: Persist AI proxy access rows, raw upstream failures, and round-linked trace records.
 * Owner: app:api
 * Responsibility: Proxy observability writes and trace payload projection only.
 */

import {
  appendNarrativeRoundExchange,
  type NarrativeRoundTraceContext,
} from '@/core/logger/narrative-round-archive'
import {
  appendServerLogEntry,
  type ServerRequestSource,
} from '@/core/logger/server-log-store'

import type { ProxyRequest } from './contracts'

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

export async function writeAccessLogAsync(
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
    meta: trace ? {
      lifeRunId: trace.lifeRunId,
      round: trace.round,
      callKind: trace.callKind,
      executionKind: trace.executionKind,
    } : {},
    payload: entry,
  })
}

export async function saveRawResponse(
  source: ServerRequestSource,
  requestId: string,
  providerId: string,
  model: string,
  status: number,
  body: string,
): Promise<void> {
  const now = new Date()
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
    payload: {
      timestamp: now.toISOString(),
      requestId,
      sourceIp: source.ip,
      sourceId: source.sourceId,
      diagnosticCode: source.diagnosticCode,
      deviceProvenanceId: source.deviceProvenanceId,
      provider: providerId,
      model,
      status,
      responseChars: body.length,
    },
  })
}

export function buildTraceRequest(
  body: ProxyRequest,
  upstreamMessages: Array<{ role: string; content: string }>,
): Record<string, unknown> {
  return {
    providerId: body.providerId,
    cache_pool: body.cache_pool,
    model: body.model,
    promptAssetId: body.prompt_asset,
    messages: upstreamMessages,
    temperature: body.temperature,
    stream: body.stream,
    response_format: body.response_format,
    top_p: body.top_p,
    seed: body.seed,
    thinking: body.thinking,
    baseUrl: body.baseUrl,
  }
}

export async function writeProxyTrace(
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
    : JSON.stringify(requestMessages)
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

export { appendNarrativeRoundExchange }
