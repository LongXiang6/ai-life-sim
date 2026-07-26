/**
 * @file page.tsx
 * @description 明文日志数据库查看页
 * @mod mod-pages
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { RuntimeRegistryPanel } from './runtime-registry-panel'

type DebugView = 'logs' | 'registry'
type LogFilter =
  | 'all'
  | 'narrative-rounds'
  | 'ai-call'
  | 'client-log'
  | 'proxy-trace'
  | 'proxy-access'
  | 'raw-response'
  | 'feedback'

interface PlaintextLogEntry {
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

const FILTER_LABELS: Record<LogFilter, string> = {
  all: '全部',
  'narrative-rounds': '核心叙事',
  'ai-call': 'AI 调用',
  'client-log': '客户端诊断',
  'proxy-trace': '代理明细',
  'proxy-access': '代理访问',
  'raw-response': '上游错误',
  feedback: '反馈',
}

function buildFilterQuery(filter: LogFilter): URLSearchParams {
  const query = new URLSearchParams({ limit: '100' })
  if (filter === 'narrative-rounds') query.set('category', filter)
  else if (filter !== 'all') query.set('entryType', filter)
  return query
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(timestamp)
}

function DetailBlock({ title, value, tone = 'normal' }: {
  title: string
  value: string
  tone?: 'normal' | 'error'
}) {
  if (!value) return null
  return (
    <section className="border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
      <h3 className={`mb-2 text-xs font-semibold ${tone === 'error' ? 'text-red-500' : 'text-[var(--color-text-primary)]'}`}>
        {title}
      </h3>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {value}
      </pre>
    </section>
  )
}

export default function DebugLogPage() {
  const [view, setView] = useState<DebugView>('logs')
  const [filter, setFilter] = useState<LogFilter>('all')
  const [entries, setEntries] = useState<PlaintextLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)

  const activeQuery = useMemo(() => buildFilterQuery(filter), [filter])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/debug-log?${activeQuery.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { entries?: PlaintextLogEntry[]; total?: number }
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setTotal(Number(data.total ?? 0))
    } catch {
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [activeQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchLogs() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchLogs])

  const handleClear = useCallback(async () => {
    if (!confirm(`确定要清除“${FILTER_LABELS[filter]}”日志吗？`)) return
    try {
      const query = buildFilterQuery(filter)
      query.delete('limit')
      const response = await fetch(`/api/debug-log?${query.toString()}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setEntries([])
      setTotal(0)
      setExpandedEntry(null)
    } catch {
      alert('清除失败')
    }
  }, [filter])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">开发调试</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              明文 SQLite 日志 · 当前 {total} 条
            </p>
          </div>
          {view === 'logs' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { void fetchLogs() }}
                className="border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                刷新
              </button>
              <button
                type="button"
                onClick={() => { void handleClear() }}
                className="border border-red-500/40 px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10"
              >
                清除
              </button>
            </div>
          ) : null}
        </div>

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setView('logs')}
            className={`px-4 py-2 text-sm transition-colors ${
              view === 'logs'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
            }`}
          >
            日志数据库
          </button>
          <button
            type="button"
            onClick={() => setView('registry')}
            className={`px-4 py-2 text-sm transition-colors ${
              view === 'registry'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
            }`}
          >
            运行时注册表
          </button>
        </div>

        {view === 'registry' ? (
          <RuntimeRegistryPanel />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="日志类型">
              {(Object.keys(FILTER_LABELS) as LogFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={filter === item}
                  onClick={() => {
                    setFilter(item)
                    setExpandedEntry(null)
                  }}
                  className={`border px-3 py-1.5 text-xs transition-colors ${
                    filter === item
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  {FILTER_LABELS[item]}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-8 text-center text-[var(--color-text-secondary)]">加载中...</div>
            ) : entries.length === 0 ? (
              <div className="border-y border-[var(--color-border)] py-16 text-center text-[var(--color-text-secondary)]">
                暂无日志
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => {
                  const isExpanded = expandedEntry === entry.id
                  const identity = entry.isRegistered
                    ? `${entry.username ?? '未命名账号'} · ${entry.accountId ?? '账号 ID 缺失'}`
                    : `匿名用户${entry.diagnosticCode ? ` · ${entry.diagnosticCode}` : ''}`
                  const hasError = entry.level === 'error' || Boolean(entry.error) || (entry.status ?? 0) >= 400
                  return (
                    <article key={entry.id} className="border border-[var(--color-border)] bg-[var(--color-surface)]">
                      <button
                        type="button"
                        onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg)]/50"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                            <time>{formatTime(entry.createdAt)}</time>
                            <span>{entry.entryType}</span>
                            {entry.category ? <span>{entry.category}</span> : null}
                            {entry.status !== null ? <span>HTTP {entry.status}</span> : null}
                          </span>
                          <strong className={`mt-1 block truncate text-sm ${hasError ? 'text-red-500' : ''}`}>
                            {entry.message || entry.callKind || entry.module || entry.id}
                          </strong>
                          <span className="mt-1 block truncate text-xs text-[var(--color-text-secondary)]">
                            {entry.isRegistered ? '已注册' : '匿名'} · {identity} · IP {entry.sourceIp}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 self-center text-xs text-[var(--color-text-tertiary)]">
                          {entry.prompt ? <span>Prompt</span> : null}
                          {entry.response ? <span>Response</span> : null}
                          <span aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
                        </span>
                      </button>

                      {isExpanded ? (
                        <div className="space-y-4 border-t border-[var(--color-border)] px-4 py-4">
                          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            <div><dt className="text-[var(--color-text-tertiary)]">账号状态</dt><dd>{entry.isRegistered ? '已注册' : '匿名'}</dd></div>
                            <div><dt className="text-[var(--color-text-tertiary)]">用户名</dt><dd>{entry.username ?? '-'}</dd></div>
                            <div><dt className="text-[var(--color-text-tertiary)]">账号 ID</dt><dd className="break-all font-mono">{entry.accountId ?? '-'}</dd></div>
                            <div><dt className="text-[var(--color-text-tertiary)]">诊断编号</dt><dd>{entry.diagnosticCode ?? '-'}</dd></div>
                            <div><dt className="text-[var(--color-text-tertiary)]">设备来源编号</dt><dd className="break-all font-mono">{entry.deviceProvenanceId ?? '-'}</dd></div>
                            <div><dt className="text-[var(--color-text-tertiary)]">请求 ID</dt><dd className="break-all font-mono">{entry.requestId ?? '-'}</dd></div>
                            <div><dt className="text-[var(--color-text-tertiary)]">模型</dt><dd>{entry.model ?? '-'}</dd></div>
                          </dl>
                          <DetailBlock title="错误" value={[entry.error, entry.stack].filter(Boolean).join('\n\n')} tone="error" />
                          <DetailBlock title="Prompt / AI 输入" value={entry.prompt ?? ''} />
                          <DetailBlock title="AI 返回 / 叙事" value={entry.response ?? ''} />
                          <DetailBlock title="Meta" value={formatJson(entry.meta)} />
                          <DetailBlock title="完整记录" value={formatJson(entry.payload)} />
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
