/** Purpose: Share debug-log data contracts and display helpers. Owner: mod-pages. Responsibility: Read-only view contracts and formatting helpers only. */

import {
  projectDebugLogValue,
  projectProxyPromptText,
  projectProxyTraceEntry,
} from '@/core/logger/debug-log-projection'

export { projectDebugLogValue, projectProxyPromptText, projectProxyTraceEntry }

export type LogFilter =
  | 'all'
  | 'narrative-rounds'
  | 'ai-call'
  | 'client-log'
  | 'proxy-trace'
  | 'proxy-access'
  | 'raw-response'
  | 'feedback'

export interface PlaintextLogEntry {
  id: string
  createdAt: number
  clientTimestamp: number | null
  entryType: string
  category: string | null
  level: string | null
  module: string | null
  message: string | null
  event: string | null
  requestId: string | null
  sourceIp: string
  sourceId: string
  diagnosticCode: string | null
  deviceProvenanceId: string | null
  isRegistered: boolean
  accountId: string | null
  username: string | null
  feedbackId: string | null
  round: number | null
  age: number | null
  era: string | null
  provider: string | null
  model: string | null
  callKind: string | null
  strategy: string | null
  status: number | null
  prompt: string | null
  response: string | null
  error: string | null
  stack: string | null
  meta: unknown
  payload: unknown
}

/** Combines the proxy's request-only and response-only trace rows into one display exchange. */
export function pairProxyTraceEntries(entries: readonly PlaintextLogEntry[]): PlaintextLogEntry[] {
  const exchanges = new Map<string, PlaintextLogEntry>()
  for (const entry of entries) {
    const projectedEntry = projectProxyTraceEntry(entry)
    const key = projectedEntry.requestId ?? projectedEntry.id
    const existing = exchanges.get(key)
    if (!existing) {
      exchanges.set(key, { ...projectedEntry, id: key, requestId: projectedEntry.requestId ?? key })
      continue
    }

    const earliest = projectedEntry.createdAt < existing.createdAt ? projectedEntry : existing
    const withLifeRun = getLifeRunId(existing) !== 'unassigned' ? existing : projectedEntry
    exchanges.set(key, {
      ...earliest,
      id: key,
      requestId: existing.requestId ?? projectedEntry.requestId ?? key,
      prompt: existing.prompt ?? projectedEntry.prompt,
      response: existing.response ?? projectedEntry.response,
      callKind: existing.callKind ?? projectedEntry.callKind,
      round: existing.round ?? projectedEntry.round,
      age: existing.age ?? projectedEntry.age,
      era: existing.era ?? projectedEntry.era,
      provider: existing.provider ?? projectedEntry.provider,
      model: existing.model ?? projectedEntry.model,
      strategy: existing.strategy ?? projectedEntry.strategy,
      status: existing.status ?? projectedEntry.status,
      meta: withLifeRun.meta,
      payload: withLifeRun.payload,
    })
  }
  return [...exchanges.values()].sort((left, right) => right.createdAt - left.createdAt)
}

export const FILTER_LABELS: Record<LogFilter, string> = {
  all: '全部技术日志',
  'narrative-rounds': '核心叙事',
  'ai-call': 'AI 调用',
  'client-log': '客户端诊断',
  'proxy-trace': '代理明细',
  'proxy-access': '代理访问',
  'raw-response': '上游错误',
  feedback: '反馈',
}

const CALL_KIND_LABELS: Record<string, string> = {
  'narrative-main': '主叙事',
  'narrative-event-recognition': '事件识别',
  'narrative-event-recognition-format-repair': '事件识别格式修复',
  'narrative-settlement': '结算分析',
}

export function buildFilterQuery(filter: LogFilter): URLSearchParams {
  const query = new URLSearchParams({ limit: '200' })
  if (filter === 'narrative-rounds') query.set('category', filter)
  else if (filter !== 'all') query.set('entryType', filter)
  return query
}

export function formatJson(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function formatDiagnosticJson(value: unknown): string {
  return formatJson(projectDebugLogValue(value))
}

export function formatProxyPrompt(value: string | null, entryType: string): string | null {
  return entryType === 'proxy-trace' ? projectProxyPromptText(value) : value
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function formatCallKind(value: string | null): string {
  if (!value) return 'AI 调用'
  return CALL_KIND_LABELS[value] ?? value.replace(/^narrative-/u, '').replace(/-/gu, ' ')
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(timestamp)
}

export function formatShortTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

export function getLifeRunId(entry: PlaintextLogEntry): string {
  if (entry.meta && typeof entry.meta === 'object' && 'lifeRunId' in entry.meta) {
    const value = (entry.meta as { lifeRunId?: unknown }).lifeRunId
    if (typeof value === 'string' && value.trim()) return value
  }
  if (entry.payload && typeof entry.payload === 'object' && 'meta' in entry.payload) {
    const payloadMeta = (entry.payload as { meta?: unknown }).meta
    if (payloadMeta && typeof payloadMeta === 'object' && 'lifeRunId' in payloadMeta) {
      const value = (payloadMeta as { lifeRunId?: unknown }).lifeRunId
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return 'unassigned'
}
