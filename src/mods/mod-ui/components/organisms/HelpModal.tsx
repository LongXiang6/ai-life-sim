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

function getFlowPortalRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('.final-flow-frame') ?? document.body
}

type HelpTab = 'docs' | 'changelog'

function ApprovedHelpGuide() {
  return (
    <>
      <p className="approved-help-intro">从选择世界到走完一生，每个页面只承担当前阶段最重要的决定。</p>
      <section id="help-start-settings" className="approved-help-chapter">
        <span className="approved-help-index">01 / 开始</span>
        <h3>开始与设置</h3>
        <p>欢迎页提供开始新人生、读取存档、设置和说明入口。</p>
        <ul>
          <li>开始新人生会从世界选择进入一次全新人生。</li>
          <li>读取存档会展示已有记录，再回到对应故事进度。</li>
          <li>设置中的叙事字数是生成目标，完整句优先。</li>
        </ul>
      </section>
      <section id="help-world-select" className="approved-help-chapter">
        <span className="approved-help-index">02 / 世界</span>
        <h3>世界选择</h3>
        <p>选择一个预设世界，或进入世界配置创建自己的舞台。</p>
        <ul>
          <li>世界决定时代、社会结构、自然规律和可用题材。</li>
          <li>难度会影响风险与资源，不直接替角色做选择。</li>
        </ul>
      </section>
      <section id="help-world-customize" className="approved-help-chapter">
        <span className="approved-help-index">03 / 配置</span>
        <h3>世界配置</h3>
        <p>调整世界描述、空间形态、世界本质、力量体系与力量上限，再继续角色创建。</p>
        <div className="approved-help-tip">生成期间可以取消；离开页面前会明确提示尚未完成的内容。</div>
      </section>
      <section id="help-character-create" className="approved-help-chapter">
        <span className="approved-help-index">04 / 角色</span>
        <h3>角色创建</h3>
        <p>决定姓名、性别、种族、寿命、起始年龄与背景。随机姓名不会覆盖其他已经完成的选择。</p>
      </section>
      <section id="help-talent-select" className="approved-help-chapter">
        <span className="approved-help-index">05 / 命格</span>
        <h3>命格与属性</h3>
        <p>等待命盘解析完成，从候选中选择普通命格，再按世界规则分配初始属性。神话传承独立于普通命槽。</p>
        <ul>
          <li>点击星位查看说明，再加入普通命槽。</li>
          <li>已加入的命格可以再次点击移除。</li>
          <li>剩余属性点未用完时，确认会再次提示。</li>
        </ul>
      </section>
      <section id="help-story" className="approved-help-chapter">
        <span className="approved-help-index">06 / 故事</span>
        <h3>故事与选择</h3>
        <p>每一轮故事会给出可选行动，也允许写下自己的做法。确认后，AI 会沿选择继续叙事。</p>
        <ul>
          <li>时间步长只影响下一轮，不会立即改变当前时间。</li>
          <li>世界面板保存角色词条与当前世界状态。</li>
          <li>人生结束后可回望三幕，并封存一项神话概念。</li>
        </ul>
      </section>
    </>
  )
}

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
      <div className="final-flow-design-fit final-flow-design-fit--330">
        <div className="final-flow-design-canvas">
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
            <div className={styles.docsContent}>
              <ApprovedHelpGuide />
              {content ? (
                <details className={styles.fullDocs}>
                  <summary>完整说明</summary>
                  <div dangerouslySetInnerHTML={{ __html: content }} />
                </details>
              ) : null}
            </div>
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
        </div>
      </div>
    </div>,
    getFlowPortalRoot(),
  )
}
