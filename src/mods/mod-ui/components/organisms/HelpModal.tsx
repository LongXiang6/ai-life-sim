'use client'

/**
 * @module HelpModal.tsx
 * @description 帮助弹窗 —— 功能说明 + 更新日志（分片滑动加载）
 * @mod mod-ui
 *
 * 参照废弃项目 HelpModal 重写：
 *   2 选项卡（功能说明 / 更新日志）、/help.md Markdown 渲染、
 *   changelog 分片探测加载 + "加载更多历史版本"、桌面端/移动端双 CSS Module
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '@/foundation/utils/use-is-mobile'

import desktopStyles from './desktop/help-modal.module.css'
import mobileStyles from './mobile/help-modal.module.css'

export interface HelpModalProps {
  visible: boolean
  onClose: () => void
}

type HelpTab = 'docs' | 'changelog'

/* ------------------------------------------------------------------ */
/*  简易 Markdown → HTML 渲染器（内联样式，避免额外依赖）              */
/* ------------------------------------------------------------------ */

function renderMdToHtml(md: string): string {
  const lines = md.split('\n')
  const htmlParts: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (/^### (.+)$/.test(line)) {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      htmlParts.push(`<h3 style="font-size:16px;font-weight:700;margin:14px 0 6px;color:var(--color-text-primary)">${line.replace(/^### /, '')}</h3>`)
    } else if (/^## (.+)$/.test(line)) {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      htmlParts.push(`<h2 style="font-size:18px;font-weight:800;margin:16px 0 10px;color:var(--color-primary);border-bottom:1px solid var(--color-border);padding-bottom:4px">${line.replace(/^## /, '')}</h2>`)
    } else if (/^# (.+)$/.test(line)) {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      htmlParts.push(`<h1 style="font-size:21px;font-weight:800;margin:0 0 12px;color:var(--color-text-primary)">${line.replace(/^# /, '')}</h1>`)
    } else if (/^- \*\*(.+?)\*\*(.*)$/.test(line)) {
      if (!inList) { htmlParts.push('<ul style="paddingLeft:20px;margin:4px 0 8px">'); inList = true }
      htmlParts.push(`<li style="margin-bottom:3px;font-size:13px;line-height:1.6"><strong style="color:var(--color-text-primary)">${line.match(/^- \*\*(.+?)\*\*(.*)$/)![1]}</strong>${line.match(/^- \*\*(.+?)\*\*(.*)$/)![2]}</li>`)
    } else if (/^- (.+)$/.test(line)) {
      if (!inList) { htmlParts.push('<ul style="paddingLeft:20px;margin:4px 0 8px">'); inList = true }
      htmlParts.push(`<li style="margin-bottom:3px;font-size:13px;line-height:1.6">${line.replace(/^- /, '')}</li>`)
    } else if (trimmed === '') {
      if (inList) { htmlParts.push('</ul>'); inList = false }
    } else {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-text-primary)">$1</strong>')
      htmlParts.push(`<p style="margin:4px 0;line-height:1.7;font-size:13px">${bolded}</p>`)
    }
  }
  if (inList) htmlParts.push('</ul>')
  return htmlParts.join('')
}

/* ------------------------------------------------------------------ */
/*  Changelog 文本 → HTML 渲染器                                      */
/* ------------------------------------------------------------------ */

function renderChangelogToHtml(text: string): string {
  const htmlParts: string[] = []
  const lines = text.split('\n')
  let version = ''
  let date = ''
  let currentCategory = ''
  let inSection = false
  let inList = false

  function flushSection() {
    if (inSection) { htmlParts.push('</div>'); inSection = false }
    inList = false
  }

  function showVersionHeader() {
    if (version && !htmlParts.some(p => p.includes(`>${version}<`))) {
      htmlParts.push(`<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px;border-bottom:1px solid var(--color-border);padding-bottom:6px"><span style="font-size:16px;font-weight:800;color:var(--color-primary)">${version}</span>${date ? `<span style="font-size:12px;color:var(--color-text-tertiary)">${date}</span>` : ''}</div>`)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length

    if (/^-{3,}$/.test(trimmed)) {
      flushSection()
      htmlParts.push('<div style="margin-bottom:28px">')
      inSection = true
      version = ''; date = ''; currentCategory = ''
      continue
    }

    if (!inSection) continue

    const versionMatch = trimmed.match(/^Version:\s*(.+)$/i)
    if (versionMatch) { version = versionMatch[1].trim(); continue }
    const dateMatch = trimmed.match(/^Date:\s*(.+)$/i)
    if (dateMatch) { date = dateMatch[1].trim(); continue }
    if (/^Version:\s*/.test(trimmed) || /^Date:\s*/.test(trimmed)) continue

    if (indent < 4 && (trimmed.endsWith(':') || trimmed.endsWith('：')) && !trimmed.startsWith('-')) {
      if (inList) { htmlParts.push('</ul>'); inList = false }
      currentCategory = trimmed.slice(0, -1)
      continue
    }

    if (trimmed.startsWith('-')) {
      showVersionHeader()
      if (!inList) {
        if (currentCategory) {
          htmlParts.push(`<div style="margin:6px 0 4px"><span style="font-size:14px;font-weight:700;color:var(--color-text-primary)">${currentCategory}</span></div>`)
          currentCategory = ''
        }
        htmlParts.push('<ul style="margin:0 0 12px;paddingLeft:20px">')
        inList = true
      }
      htmlParts.push(`<li style="margin-bottom:3px;font-size:13px;line-height:1.6">${trimmed.replace(/^- /, '')}</li>`)
      continue
    }

    if (inList) { htmlParts.push('</ul>'); inList = false }
    if (trimmed && !trimmed.startsWith('Version:') && !trimmed.startsWith('Date:')) {
      currentCategory = ''
      showVersionHeader()
      htmlParts.push(`<p style="margin:4px 0;line-height:1.6;font-size:13px;color:var(--color-text-secondary)">${trimmed}</p>`)
    }
  }

  flushSection()
  return htmlParts.join('')
}

/* ------------------------------------------------------------------ */
/*  常量                                                               */
/* ------------------------------------------------------------------ */

/** 探测分片号的安全上限 */
const MAX_CHANGELOG_CHUNKS = 100

/** 二分探测最大分片号（log2(100) ≈ 7 次请求即定位） */
async function probeMaxChunk(
  loadChunk: (idx: number) => Promise<string | null>,
): Promise<{ maxFound: number; newestHtml: string | null }> {
  let lo = 1
  let hi = MAX_CHANGELOG_CHUNKS
  let lastSuccess: number | null = null
  let lastHtml: string | null = null

  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2)
    try {
      const html = await loadChunk(mid)
      if (html !== null) {
        lastSuccess = mid
        lastHtml = html
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    } catch {
      hi = mid - 1
    }
  }

  return { maxFound: lastSuccess ?? 0, newestHtml: lastHtml }
}

/* ------------------------------------------------------------------ */
/*  组件                                                               */
/* ------------------------------------------------------------------ */

/**
 * 帮助弹窗组件 —— 功能说明 + 更新日志
 * @param {HelpModalProps} props - 组件属性
 */
export function HelpModal({ visible, onClose }: HelpModalProps) {
  const isMobile = useIsMobile()
  const styles = isMobile ? mobileStyles : desktopStyles

  const [tab, setTab] = useState<HelpTab>('docs')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  // changelog 分片加载状态
  const [changelogHtmls, setChangelogHtmls] = useState<string[]>([])
  const [currentChunk, setCurrentChunk] = useState(0)
  const [maxChunk, setMaxChunk] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadError, setLoadError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  /** 加载单个 changelog 分片 */
  const loadChangelogChunk = useCallback(async (chunkIndex: number): Promise<string | null> => {
    const url = `/changelog-${chunkIndex}.txt`
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      const text = await res.text()
      return renderChangelogToHtml(text)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      throw err
    }
  }, [])

  /** 初始加载 */
  const loadContent = useCallback(async (currentTab: HelpTab) => {
    if (!visible) return

    if (abortRef.current) { abortRef.current.abort() }

    if (currentTab === 'changelog') {
      setLoading(true)
      setChangelogHtmls([])
      setCurrentChunk(0)
      setMaxChunk(0)
      setHasMore(true)
      setLoadError('')

      const { maxFound, newestHtml } = await probeMaxChunk(loadChangelogChunk)

      if (maxFound > 0 && newestHtml !== null) {
        setMaxChunk(maxFound)
        setCurrentChunk(maxFound)
        setChangelogHtmls([newestHtml])
        setHasMore(maxFound > 1)
      } else {
        setHasMore(false)
        setLoadError('暂无更新日志')
      }
      setLoading(false)
    } else {
      setLoading(true)
      try {
        const res = await fetch('/help.md')
        const text = await res.text()
        setContent(renderMdToHtml(text))
      } catch {
        setContent('<p style="color:var(--color-error)">加载文档失败，请检查网络连接。</p>')
      }
      setLoading(false)
    }
  }, [visible, loadChangelogChunk])

  /** 加载更旧的分片 */
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const prevChunk = currentChunk - 1
    if (prevChunk < 1) {
      setHasMore(false)
      return
    }
    setLoadingMore(true)
    setLoadError('')
    try {
      const html = await loadChangelogChunk(prevChunk)
      if (html !== null) {
        setChangelogHtmls(prev => [...prev, html])
        setCurrentChunk(prevChunk)
        setHasMore(prevChunk > 1)
      } else {
        setHasMore(false)
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : '加载失败')
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, currentChunk, loadChangelogChunk])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { loadContent(tab) }, [tab, loadContent])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!visible && abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [visible])

  if (!visible) return null

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalFrame} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>📖 帮助</span>
          <button className={styles.closeBtn} onClick={onClose}>关闭</button>
        </div>

        <div className={styles.tabBar}>
          <button onClick={() => setTab('docs')} className={`${styles.tab} ${tab === 'docs' ? styles.tabActive : ''}`}>
            功能说明
          </button>
          <button onClick={() => setTab('changelog')} className={`${styles.tab} ${tab === 'changelog' ? styles.tabActive : ''}`}>
            更新日志
          </button>
        </div>

        {tab === 'docs' ? (
          loading ? (
            <p className={styles.loading}>📄 加载中...</p>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: content }} />
          )
        ) : (
          loading ? (
            <p className={styles.loading}>📄 加载中...</p>
          ) : (
            <div>
              {changelogHtmls.map((html, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
              ))}

              {loadError && (
                <p style={{ color: 'var(--color-error)', fontSize: 13, margin: '12px 0' }}>{loadError}</p>
              )}

              {hasMore && currentChunk > 1 && (
                <div style={{ textAlign: 'center', margin: '20px 0 8px' }}>
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{
                      padding: '8px 32px',
                      fontSize: 13,
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-card)',
                      color: 'var(--color-text-primary)',
                      cursor: loadingMore ? 'not-allowed' : 'pointer',
                      opacity: loadingMore ? 0.6 : 1,
                    }}
                  >
                    {loadingMore ? '⏳ 加载中...' : '📜 加载更多历史版本'}
                  </button>
                </div>
              )}

              {!hasMore && changelogHtmls.length > 0 && maxChunk > 1 && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12, margin: '16px 0 8px' }}>
                  — 已加载全部 {maxChunk} 个分片 —
                </p>
              )}
            </div>
          )
        )}
      </div>
    </div>,
    document.body,
  )
}
