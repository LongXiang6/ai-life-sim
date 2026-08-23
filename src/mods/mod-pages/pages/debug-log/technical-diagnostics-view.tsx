/** Purpose: Render technical debug-log records outside the AI exchange view. Owner: mod-pages. Responsibility: Diagnostic filtering and metadata inspection only. */

'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  buildFilterQuery,
  FILTER_LABELS,
  formatCount,
  formatDiagnosticJson,
  formatProxyPrompt,
  formatTime,
  type LogFilter,
  type PlaintextLogEntry,
} from './debug-log-types'
import styles from './debug-log.module.css'

function DetailBlock({ title, value, tone = 'normal' }: { title: string; value: string; tone?: 'normal' | 'error' }) {
  if (!value) return null

  return (
    <section className="border-t border-[var(--color-border)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'error' ? 'bg-[var(--color-error)]' : 'bg-[var(--color-border-focus)]'}`} aria-hidden="true" />
        <h3 className={`text-[11px] font-semibold ${tone === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-text-secondary)]'}`}>{title}</h3>
      </div>
      <pre tabIndex={0} className={`${styles.scrollRegion} max-h-[24rem] overflow-auto border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--color-text-primary)]`}>{value}</pre>
    </section>
  )
}

function TechnicalLogEntry({ entry, expanded, onToggle }: { entry: PlaintextLogEntry; expanded: boolean; onToggle: () => void }) {
  const hasError = entry.level === 'error' || Boolean(entry.error) || (entry.status ?? 0) >= 400
  const identity = entry.isRegistered
    ? `${entry.username ?? '未命名账号'} · ${entry.accountId ?? '账号 ID 缺失'}`
    : `匿名用户${entry.diagnosticCode ? ` · ${entry.diagnosticCode}` : ''}`
  const headline = entry.message || entry.callKind || entry.module || entry.id

  return (
    <article className={`border-b border-[var(--color-border)] ${expanded ? 'bg-[var(--color-bg-secondary)]' : 'bg-[var(--color-bg)]'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[9.5rem_7.5rem_8rem_minmax(18rem,1fr)_15rem_3.5rem] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
        aria-expanded={expanded}
      >
        <time className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]" dateTime={new Date(entry.createdAt).toISOString()}>{formatTime(entry.createdAt)}</time>
        <span className="truncate text-[11px] text-[var(--color-text-secondary)]">{entry.entryType}</span>
        <span className={`truncate text-[11px] ${hasError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-secondary)]'}`}>{entry.status !== null ? `HTTP ${entry.status}` : (entry.level ?? '记录')}</span>
        <span className={`min-w-0 truncate text-xs font-medium ${hasError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]'}`} title={headline}>{headline}</span>
        <span className="truncate text-[11px] text-[var(--color-text-tertiary)]" title={`${entry.isRegistered ? '已注册' : '匿名'} · ${identity} · IP ${entry.sourceIp}`}>{entry.isRegistered ? '已注册' : '匿名'} · {identity} · IP {entry.sourceIp || '-'}</span>
        <span className="text-right text-[10px] font-medium text-[var(--color-text-tertiary)]" aria-hidden="true">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded ? (
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <dl className="grid grid-cols-4 gap-x-6 gap-y-3 border-b border-[var(--color-border)] pb-4 text-xs">
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">账号状态</dt><dd className="mt-1 text-[var(--color-text-primary)]">{entry.isRegistered ? '已注册' : '匿名'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">用户名</dt><dd className="mt-1 truncate text-[var(--color-text-primary)]" title={entry.username ?? undefined}>{entry.username ?? '-'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">账号 ID</dt><dd className="mt-1 break-all font-mono text-[var(--color-text-primary)]">{entry.accountId ?? '-'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">来源 IP</dt><dd className="mt-1 break-all font-mono text-[var(--color-text-primary)]">{entry.sourceIp || '-'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">诊断编号</dt><dd className="mt-1 break-all font-mono text-[var(--color-text-primary)]">{entry.diagnosticCode ?? '-'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">设备来源编号</dt><dd className="mt-1 break-all font-mono text-[var(--color-text-primary)]">{entry.deviceProvenanceId ?? '-'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">请求 ID</dt><dd className="mt-1 break-all font-mono text-[var(--color-text-primary)]">{entry.requestId ?? '-'}</dd></div>
            <div className="min-w-0"><dt className="text-[var(--color-text-tertiary)]">模型</dt><dd className="mt-1 truncate text-[var(--color-text-primary)]" title={entry.model ?? undefined}>{entry.model ?? '-'}</dd></div>
          </dl>
          <div className="divide-y divide-[var(--color-border)]">
            <DetailBlock title="错误" value={[entry.error, entry.stack].filter(Boolean).join('\n\n')} tone="error" />
            <DetailBlock title="Prompt / AI 输入" value={formatProxyPrompt(entry.prompt, entry.entryType) ?? ''} />
            <DetailBlock title="AI 返回 / 叙事" value={entry.response ?? ''} />
            <DetailBlock title="Meta" value={formatDiagnosticJson(entry.meta)} />
            <DetailBlock title="完整记录（认证字段隐藏）" value={formatDiagnosticJson(entry.payload)} />
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function TechnicalDiagnosticsView() {
  const [filter, setFilter] = useState<LogFilter>('all')
  const [entries, setEntries] = useState<PlaintextLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/debug-log?${buildFilterQuery(filter).toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { entries?: PlaintextLogEntry[]; total?: number }
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setTotal(Number(data.total ?? 0))
    } catch {
      setEntries([])
      setTotal(0)
      setError('技术日志暂时无法读取，请刷新重试。')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchLogs() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchLogs])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--color-bg)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--color-info)]" aria-hidden="true" /><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">技术诊断</h2></div>
            <p className="mt-1 truncate text-[11px] text-[var(--color-text-tertiary)]">身份、网络来源、请求状态、错误堆栈与原始记录</p>
          </div>
          <div className="shrink-0 text-right"><span className="block font-mono text-sm font-semibold text-[var(--color-text-primary)]">{formatCount(total)}</span><span className="text-[10px] text-[var(--color-text-tertiary)]">条记录</span></div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--color-border)] px-4 py-2" role="tablist" aria-label="技术日志类型">
          <span className="mr-1 shrink-0 text-[10px] font-semibold text-[var(--color-text-tertiary)]">筛选</span>
          {(Object.keys(FILTER_LABELS) as LogFilter[]).map((item) => {
            const selected = filter === item
            return <button key={item} type="button" role="tab" aria-selected={selected} onClick={() => { setFilter(item); setExpandedEntry(null) }} className={`shrink-0 rounded-sm border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] ${selected ? 'border-[var(--color-border-focus)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]' : 'border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'}`}>{FILTER_LABELS[item]}</button>
          })}
        </div>
      </header>

      {error ? <div className="shrink-0 border-b border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-2.5 text-xs text-[var(--color-error)]" role="alert">{error}</div> : null}

      <div className={`${styles.scrollRegion} min-h-0 flex-1 overflow-auto`}>
        {loading ? <div className="flex min-h-[18rem] items-center justify-center text-sm text-[var(--color-text-secondary)]">正在读取技术日志...</div> : entries.length === 0 ? <div className="flex min-h-[18rem] items-center justify-center border-b border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-secondary)]">暂无技术日志</div> : (
          <div className="min-w-[1040px]">
            <div className="sticky top-0 z-[1] grid grid-cols-[9.5rem_7.5rem_8rem_minmax(18rem,1fr)_15rem_3.5rem] gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-[10px] font-semibold text-[var(--color-text-tertiary)]">
              <span>时间</span><span>来源</span><span>状态</span><span>消息</span><span>身份</span><span className="text-right">详情</span>
            </div>
            {entries.map((entry) => <TechnicalLogEntry key={entry.id} entry={entry} expanded={expandedEntry === entry.id} onToggle={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
