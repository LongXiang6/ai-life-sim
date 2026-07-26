'use client'

/**
 * @module DisclaimerModal.tsx
 * @description 免责声明弹窗 —— 首次使用时展示，从 /disclaimer.txt 加载内容
 * @mod mod-ui
 *
 * 参照废弃项目 DisclaimerModal 重写：
 *   从 /disclaimer.txt 动态加载、CSS Module、
 *   "我已知晓" + "退出" 双按钮
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import styles from './DisclaimerModal.module.css'

const DISCLAIMER_ACCEPTED_KEY = 'ai-life-sim:disclaimer-accepted'
const DISCLAIMER_VERSION = '2.3.0'

/**
 * 检查是否已接受免责声明
 * @returns 是否已接受
 */
export function isDisclaimerAccepted(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_ACCEPTED_KEY) === DISCLAIMER_VERSION
  } catch {
    return false
  }
}

export function acceptDisclaimer(): void {
  try {
    localStorage.setItem(DISCLAIMER_ACCEPTED_KEY, DISCLAIMER_VERSION)
  } catch {
    // localStorage 不可用时静默忽略
  }
}

export interface DisclaimerModalProps {
  visible: boolean
  onAccept: () => void
  onClose: () => void
}

function getFlowPortalRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('.final-flow-frame') ?? document.body
}

/**
 * 免责声明弹窗组件 —— 首次使用时展示，从 /disclaimer.txt 加载内容
 * @param {DisclaimerModalProps} props - 组件属性
 */
export function DisclaimerModal({ visible, onAccept, onClose }: DisclaimerModalProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const frameRef = useRef<HTMLDivElement>(null)
  const acceptRef = useRef<HTMLButtonElement>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!visible) return
    setLoading(true)
    fetch('/disclaimer.txt')
      .then(res => res.text())
      .then(text => { setContent(text); setLoading(false) })
      .catch(() => { setContent('免责声明加载失败，请检查网络连接后重试。'); setLoading(false) })
  }, [visible])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!visible) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => {
      if (loading) frameRef.current?.focus()
      else acceptRef.current?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        frameRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      )
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        frameRef.current?.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [loading, onClose, visible])

  if (!visible) return null

  return createPortal(
    <div className={styles.overlay}>
      <div className="final-flow-design-fit final-flow-design-fit--330">
        <div className="final-flow-design-canvas">
          <div
            ref={frameRef}
            className={styles.frame}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disclaimer-title"
            tabIndex={-1}
          >
        <span className={styles.spine} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.metaRow} aria-hidden="true"><span>AI LIFE SIM · 命书</span><span>附 · 须知</span></div>
          <h2 id="disclaimer-title" className={styles.title}>开始之前</h2>
          <p>请阅读并确认以下使用说明。</p>
        </header>
        <div className={styles.body}>
          <div className={styles.content}>
            {loading ? (
              <p className={styles.loading}>加载中…</p>
            ) : (
              <pre className={styles.contentPre}>{content}</pre>
            )}
          </div>
        </div>
        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelBtn} aria-label="退出">×</button>
          <button
            ref={acceptRef}
            onClick={onAccept}
            disabled={loading}
            className={`${styles.acceptBtn} ${loading ? styles.acceptBtnDisabled : styles.acceptBtnEnabled}`}
          ><span><strong>我已知晓</strong><small>接受说明并进入人生序章</small></span><i aria-hidden="true">→</i></button>
        </div>
          </div>
        </div>
      </div>
    </div>,
    getFlowPortalRoot(),
  )
}
