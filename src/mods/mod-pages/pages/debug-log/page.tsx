/**
 * @file page.tsx
 * @description 调试日志查看页面 —— 开发模式可见，按分类查看 AI 调试日志
 * @mod mod-pages
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

import { RuntimeRegistryPanel } from './runtime-registry-panel'

type DebugView = 'logs' | 'registry'

type DebugLogCategory =
  | 'narrative-rounds'
  | 'world-init'
  | 'talent-generate'
  | 'epilogue'
  | 'background-events'

const CATEGORY_LABELS: Record<DebugLogCategory, string> = {
  'narrative-rounds': '叙事轮次',
  'world-init': '世界初始化',
  'talent-generate': '天赋生成',
  'epilogue': '结语/来世',
  'background-events': '背景事件',
}

export default function DebugLogPage() {
  const [view, setView] = useState<DebugView>('logs')
  const [category, setCategory] = useState<DebugLogCategory>('narrative-rounds')
  const [entries, setEntries] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/debug-log?category=${category}&limit=50`)
      if (resp.ok) {
        const data = await resp.json()
        setEntries(data.entries ?? [])
      } else {
        setEntries([])
      }
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs()
  }, [fetchLogs])

  const handleClear = useCallback(async () => {
    if (!confirm('确定要清除当前分类的日志吗？')) return
    try {
      await fetch(`/api/debug-log?category=${category}`, { method: 'DELETE' })
      setEntries([])
    } catch {
      alert('清除失败')
    }
  }, [category])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">开发调试</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              AI 日志与 RuntimeRegistry（data.raw 等价快照）
            </p>
          </div>
          {view === 'logs' && (
            <div className="flex gap-2">
              <button
                onClick={fetchLogs}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                刷新
              </button>
              <button
                onClick={handleClear}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
              >
                清除
              </button>
            </div>
          )}
        </div>

        {/* 主视图切换 */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setView('logs')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              view === 'logs'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            AI 日志
          </button>
          <button
            type="button"
            onClick={() => setView('registry')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              view === 'registry'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)]'
            }`}
          >
            运行时注册表
          </button>
        </div>

        {view === 'registry' ? (
          <RuntimeRegistryPanel />
        ) : (
          <>
        {/* 分类选择 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(Object.keys(CATEGORY_LABELS) as DebugLogCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                category === cat
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* 日志列表 */}
        {loading ? (
          <div className="text-center py-8 text-[var(--color-text-secondary)]">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-[var(--color-text-secondary)]">暂无日志</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => {
              const isExpanded = expandedEntry === idx
              // 提取第一行作为摘要
              const firstLine = entry.split('\n').find(Boolean) ?? ''
              const hasPrompt = entry.includes('发送给 AI')
              const hasResponse = entry.includes('AI 返回')

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedEntry(isExpanded ? null : idx)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-bg)]/50 transition-colors"
                  >
                    <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
                      #{entries.length - idx}
                    </span>
                    <span className="text-sm truncate flex-1">{firstLine}</span>
                    <div className="flex gap-1">
                      {hasPrompt && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">Prompt</span>
                      )}
                      {hasResponse && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">Response</span>
                      )}
                    </div>
                    <span className="text-[var(--color-text-tertiary)]">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[var(--color-border)]">
                      <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-words mt-3 font-mono leading-relaxed max-h-96 overflow-y-auto">
                        {entry}
                      </pre>
                    </div>
                  )}
                </div>
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
