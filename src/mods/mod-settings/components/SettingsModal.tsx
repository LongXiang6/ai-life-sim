/** Purpose: Render the finalized settings workspace. Owner: mod-settings. Responsibility: Settings navigation and public store wiring only. */

'use client'

/**
 * @module SettingsModal.tsx
 * @description 设置弹窗容器 —— 横向紧凑标签 + 单一响应式 Sheet
 * @mod mod-settings
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { useFontStore } from '@/core/theme/font-store'

import { DEFAULT_SETTINGS_VALUES, useSettingsStore } from '../store'

import { SettingsTabTheme } from './SettingsTabTheme'
import { SettingsTabModel } from './SettingsTabModel'
import { SettingsTabNarrative } from './SettingsTabNarrative'
import { SettingsTabPresets } from './SettingsTabPresets'
import { SettingsTabStats } from './SettingsTabStats'

import styles from './SettingsModal.module.css'

type TabId = 'appearance' | 'narrative' | 'model-call' | 'statistics'

const TABS: { id: TabId; label: string; index: string }[] = [
  { id: 'appearance', label: '📖 阅读与界面', index: '01' },
  { id: 'narrative', label: '📝 叙事偏好', index: '02' },
  { id: 'model-call', label: '🔌 模型与调用', index: '03' },
  { id: 'statistics', label: '📊 数据统计', index: '04' },
]

function areSettingsDefault(state: ReturnType<typeof useSettingsStore.getState>): boolean {
  return (Object.keys(DEFAULT_SETTINGS_VALUES) as Array<keyof typeof DEFAULT_SETTINGS_VALUES>)
    .every((key) => state[key] === DEFAULT_SETTINGS_VALUES[key])
}

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  /** 初始激活的标签页，默认 'appearance'（个性化） */
  initialTab?: TabId
  /** 是否作为独立页面渲染（非弹窗模式） */
  isPage?: boolean
}

/** 设置弹窗容器 —— 横向紧凑标签 + 单一响应式 Sheet
 * @param open 是否打开弹窗
 * @param onClose 关闭回调
 * @param initialTab 初始激活的标签页（默认 'appearance'）
 */
export function SettingsModal({ open, onClose, initialTab, isPage }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'appearance')
  const [settingsRevision, setSettingsRevision] = useState(0)
  const modalRef = useRef<HTMLDivElement>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const settingsAreDefault = useSettingsStore(areSettingsDefault)
  const fontFamily = useFontStore((state) => state.fontFamily)
  const setFontFamily = useFontStore((state) => state.setFontFamily)
  const allSettingsAreDefault = settingsAreDefault && fontFamily === 'default'

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const activeButton = tabBarRef.current?.querySelector<HTMLElement>(
        `#settings-tab-${activeTab}`,
      )
      activeButton?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, open])

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => modalRef.current?.focus())

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const modal = modalRef.current
      if (!modal) return

      const nestedDialog = modal.querySelector<HTMLElement>('[role="alertdialog"][aria-modal="true"]')
      if (event.key === 'Escape') {
        if (nestedDialog) return
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusScope = nestedDialog ?? modal
      const portalRoots = nestedDialog
        ? []
        : Array.from(document.querySelectorAll<HTMLElement>('[data-settings-modal-portal]'))
      const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      const focusableElements = [focusScope, ...portalRoots]
        .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)))
        .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')

      if (focusableElements.length === 0) {
        event.preventDefault()
        focusScope.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement
      const activeElementIsInScope = focusScope.contains(activeElement)
        || portalRoots.some((root) => root.contains(activeElement))
      const activeElementIsFocusable = focusableElements.includes(activeElement as HTMLElement)

      if (event.shiftKey) {
        if (activeElement === firstElement || !activeElementIsInScope || !activeElementIsFocusable) {
          event.preventDefault()
          lastElement.focus()
        }
      } else if (activeElement === lastElement || !activeElementIsInScope || !activeElementIsFocusable) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open])

  if (!open) return null

  const activeTabIndex = TABS.find((tab) => tab.id === activeTab)?.index ?? '01'
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = TABS[nextIndex]
    setActiveTab(nextTab.id)
    window.requestAnimationFrame(() => document.getElementById(`settings-tab-${nextTab.id}`)?.focus())
  }
  const handleRestoreDefaults = () => {
    useSettingsStore.setState({ ...DEFAULT_SETTINGS_VALUES })
    setFontFamily('default')
    setSettingsRevision((current) => current + 1)
  }

  const content = (
    <div
      ref={modalRef}
      className={styles.modalFrame}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      data-settings-modal-root
      tabIndex={-1}
    >
      <span className={styles.spine} aria-hidden="true" />

      <div className={styles.screen}>
        <div className={styles.metaRow} aria-hidden="true">
          <span>AI LIFE SIM · 命书</span>
          <span>附 · {activeTabIndex}</span>
        </div>

        <header className={styles.header}>
          <div>
            <h2 id="settings-dialog-title" className={styles.title}>⚙️ 设置</h2>
            <p>偏好即时生效，不改变已经发生的模拟事实。</p>
          </div>
        </header>

        <div ref={tabBarRef} className={styles.tabBar} role="tablist" aria-label="设置分类">
          {TABS.map((tab, index) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={activeTab === tab.id ? `settings-panel-${tab.id}` : undefined}
              tabIndex={activeTab === tab.id ? 0 : -1}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.settingsTools}>
          <small>{allSettingsAreDefault ? '当前为默认设置' : '已有调整 · 即时生效'}</small>
          <button
            type="button"
            className={styles.restoreAction}
            disabled={allSettingsAreDefault}
            onClick={handleRestoreDefaults}
          >
            恢复默认
          </button>
        </div>

        <div
          id={`settings-panel-${activeTab}`}
          className={styles.tabContent}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {activeTab === 'appearance' && <SettingsTabTheme />}
          {activeTab === 'narrative' && <SettingsTabNarrative />}
          {activeTab === 'model-call' && (
            <>
              <SettingsTabPresets key={settingsRevision} />
              <SettingsTabModel />
            </>
          )}
          {activeTab === 'statistics' && <SettingsTabStats />}
        </div>
      </div>

      {!isPage && (
        <footer className={styles.footer}>
          <button type="button" onClick={onClose} className={styles.footerButton}>
            <strong>返回上一页</strong>
            <small>退出设置</small>
          </button>
          <button type="button" onClick={onClose} className={styles.footerButton}>
            <strong>完成</strong>
            <small>返回欢迎界面</small>
          </button>
        </footer>
      )}
    </div>
  )

  if (isPage) {
    return content
  }

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
    >
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          {content}
        </div>
      </div>
    </div>
  )
}

export { useSettingsStore } from '../store'
