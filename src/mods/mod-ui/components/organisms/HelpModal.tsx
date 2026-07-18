'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HELP_CHAPTERS, renderChangelogToHtml } from './help-content'
import { HelpChangelogContent } from './HelpChangelogContent'
import { fetchHelpHtml, fetchLatestChangelogChunk } from './help-resource-loader'
import { useHelpModalFocusTrap } from './HelpModalFocusTrap'
import { HelpModalNavigation } from './HelpModalNavigation'
import { useHelpModalScrollSpy } from './HelpModalScrollSpy'
import styles from './HelpModal.module.css'
export interface HelpModalProps { visible: boolean; onClose: () => void }

type HelpTab = 'docs' | 'changelog'

export function HelpModal({ visible, onClose }: HelpModalProps) {
  const [tab, setTab] = useState<HelpTab>('docs')
  const [activeChapter, setActiveChapter] = useState(HELP_CHAPTERS[0].id)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [changelogHtmls, setChangelogHtmls] = useState<string[]>([])
  const [currentChunk, setCurrentChunk] = useState(0)
  const [maxChunk, setMaxChunk] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadError, setLoadError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const contentViewportRef = useRef<HTMLDivElement>(null)
  const modalRef = useHelpModalFocusTrap(visible, onClose)

  const loadChangelogChunk = useCallback(async (chunkIndex: number): Promise<string | null> => {
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch(`/changelog-${chunkIndex}.txt`, { signal: controller.signal })
      if (!response.ok) return null
      const text = await response.text()
      return text.trimStart().startsWith('---') ? renderChangelogToHtml(text) : null
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      throw error
    }
  }, [])

  const loadDocs = useCallback(async () => {
    abortRef.current?.abort()
    try {
      setContent(await fetchHelpHtml())
    } catch {
      setContent('<p class="help-load-error">加载文档失败，请检查网络连接。</p>')
    }
    setLoading(false)
  }, [])

  const loadNewestChangelog = useCallback(async () => {
    abortRef.current?.abort()
    const latestChunk = await fetchLatestChangelogChunk()
    const newestHtml = await loadChangelogChunk(latestChunk)
    if (newestHtml !== null) {
      setMaxChunk(latestChunk)
      setCurrentChunk(latestChunk)
      setChangelogHtmls([newestHtml])
      setHasMore(latestChunk > 1)
    } else {
      setHasMore(false)
      setLoadError('暂无更新日志')
    }
    setLoading(false)
  }, [loadChangelogChunk])

  useEffect(() => {
    if (!visible || content) return
    const controller = new AbortController()
    abortRef.current = controller
    void fetchHelpHtml(controller.signal)
      .then((html) => {
        setContent(html)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setContent('<p class="help-load-error">加载文档失败，请检查网络连接。</p>')
        setLoading(false)
      })
    return () => controller.abort()
  }, [visible, content])

  const handleTabChange = useCallback((nextTab: HelpTab) => {
    if (nextTab === tab) return
    setTab(nextTab)
    setLoading(true)
    setLoadError('')
    if (nextTab === 'docs') {
      setActiveChapter(HELP_CHAPTERS[0].id)
      void loadDocs()
      return
    }
    setChangelogHtmls([])
    setCurrentChunk(0)
    setMaxChunk(0)
    setHasMore(true)
    void loadNewestChangelog().catch((error: unknown) => {
      setHasMore(false)
      setLoadError(error instanceof Error ? error.message : '更新日志加载失败')
      setLoading(false)
    })
  }, [tab, loadDocs, loadNewestChangelog])

  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [visible])

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const previousChunk = currentChunk - 1
    if (previousChunk < 1) {
      setHasMore(false)
      return
    }
    setLoadingMore(true)
    setLoadError('')
    try {
      const html = await loadChangelogChunk(previousChunk)
      if (html !== null) {
        setChangelogHtmls((previous) => [...previous, html])
        setCurrentChunk(previousChunk)
        setHasMore(previousChunk > 1)
      } else {
        setHasMore(false)
      }
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : '加载失败')
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, currentChunk, loadChangelogChunk])

  const handleChapterClick = useHelpModalScrollSpy({
    visible,
    enabled: tab === 'docs',
    loading,
    content,
    viewportRef: contentViewportRef,
    setActiveChapter,
  })

  if (!visible) return null

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="说明"
    >
      <div ref={modalRef} className={styles.modalFrame} onClick={(event) => event.stopPropagation()} tabIndex={-1}>
        <span className={styles.spine} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.metaRow} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 说明</span></div>
          <div className={styles.titleRow}>
            <div>
              <h2 className={styles.headerTitle}>说明</h2>
              <p>沿章节阅读，也可快速定位当前需要的功能。</p>
            </div>
            <span className={styles.titleMark} aria-hidden="true"><span>阅</span></span>
          </div>
          <div className={styles.divider} aria-hidden="true"><span /></div>
        </header>

        <HelpModalNavigation tab={tab} activeChapter={activeChapter} onTabChange={handleTabChange} onChapterClick={handleChapterClick} />

        <div ref={contentViewportRef} className={styles.contentViewport} role="tabpanel" aria-live="polite">
          {loading ? (
            <p className={styles.loading}>加载中…</p>
          ) : tab === 'docs' ? (
            <div className={styles.docsContent} dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            <HelpChangelogContent htmls={changelogHtmls} loadError={loadError} hasMore={hasMore} currentChunk={currentChunk} maxChunk={maxChunk} loadingMore={loadingMore} onLoadMore={handleLoadMore} />
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭说明">×</button>
          <button type="button" className={styles.doneBtn} onClick={onClose}>
            <span className={styles.doneIndex}>返</span>
            <span className={styles.doneCopy}><strong>读完说明</strong><small>返回进入说明前的界面</small></span>
            <span className={styles.doneArrow} aria-hidden="true">→</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
