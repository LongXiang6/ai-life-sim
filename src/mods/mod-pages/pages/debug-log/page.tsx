/** Purpose: Compose the focused AI exchange and technical debug views. Owner: mod-pages. Responsibility: Standard page shell, scrolling, navigation, and data loading only. */

'use client'

import { useCallback, useEffect, useState } from 'react'

import { AiExchangeView } from './ai-exchange-view'
import styles from './debug-log.module.css'
import { RuntimeRegistryPanel } from './runtime-registry-panel'
import { TechnicalDiagnosticsView } from './technical-diagnostics-view'
import type { PlaintextLogEntry } from './debug-log-types'

type DebugView = 'ai' | 'technical' | 'registry'

const AI_QUERY = new URLSearchParams({
  entryType: 'proxy-trace',
  category: 'ai-proxy',
  limit: '500',
})

export default function DebugLogPage() {
  const [view, setView] = useState<DebugView>('ai')
  const [aiEntries, setAiEntries] = useState<PlaintextLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [technicalReload, setTechnicalReload] = useState(0)

  const fetchAiLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/debug-log?${AI_QUERY.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { entries?: PlaintextLogEntry[] }
      setAiEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch {
      setAiEntries([])
      setError('AI 收发数据暂时无法读取，请刷新重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { if (view === 'ai') void fetchAiLogs() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchAiLogs, view])

  const refresh = () => {
    if (view === 'ai') void fetchAiLogs()
    else if (view === 'technical') setTechnicalReload((value) => value + 1)
  }

  const selectView = (nextView: DebugView) => {
    setError(null)
    setView(nextView)
  }

  return (
    <div className={styles.consoleRoot} data-debug-console>
      <header className={styles.topBar}>
        <div className={styles.brandLine}>
          <span className={styles.brandMark}>AI LIFE SIM</span>
          <span className={styles.crumb} aria-hidden="true">/</span>
          <h1 className={styles.title}>开发调试</h1>
        </div>
        <div className={styles.topMeta}>
          <span className={styles.scope}>范围：核心叙事 / AI 调用</span>
          {view !== 'registry' ? (
            <button type="button" className={styles.refreshButton} onClick={refresh} aria-label="刷新当前调试视图" title="刷新当前调试视图">
              <span aria-hidden="true">↻</span>
              <span>刷新</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.viewBar}>
        <div className={styles.viewIntro}>
          <div className={styles.viewIntroTitle}>调试工作台</div>
          <p className={styles.viewIntroText}>分层查看 AI 收发与技术运行信息</p>
        </div>
        <nav className={styles.viewTabs} aria-label="调试视图">
          {([['ai', 'AI 收发'], ['technical', '技术诊断'], ['registry', '运行时注册表']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => selectView(key)}
              aria-current={view === key ? 'page' : undefined}
              className={`${styles.viewTab} ${view === key ? styles.viewTabActive : ''}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.viewBarMeta}>{view === 'ai' ? 'AI 收发' : view === 'technical' ? '技术诊断' : '运行时注册表'}</div>
      </div>

      <main className={styles.content}>
        {view === 'ai' ? <AiExchangeView entries={aiEntries} loading={loading} error={error} /> : null}
        {view === 'technical' ? <TechnicalDiagnosticsView key={technicalReload} /> : null}
        {view === 'registry' ? <RuntimeRegistryPanel /> : null}
      </main>
    </div>
  )
}
