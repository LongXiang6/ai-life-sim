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

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

import styles from './DisclaimerModal.module.css'

const DISCLAIMER_KEY = 'ai-life-sim:disclaimer-accepted'

/**
 * 检查是否已接受免责声明
 * @returns 是否已接受
 */
export function isDisclaimerAccepted(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_KEY) === 'true'
  } catch {
    return false
  }
}

export function acceptDisclaimer(): void {
  try {
    localStorage.setItem(DISCLAIMER_KEY, 'true')
  } catch {
    // localStorage 不可用时静默忽略
  }
}

export interface DisclaimerModalProps {
  visible: boolean
  onAccept: () => void
  onClose: () => void
}

/**
 * 免责声明弹窗组件 —— 首次使用时展示，从 /disclaimer.txt 加载内容
 * @param {DisclaimerModalProps} props - 组件属性
 */
export function DisclaimerModal({ visible, onAccept, onClose }: DisclaimerModalProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

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

  if (!visible) return null

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.frame} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>📜 免责声明</div>
        </div>
        <div className={styles.body}>
          <div className={styles.content}>
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '20px 0', fontSize: 13 }}>📄 加载中...</p>
            ) : (
              <pre className={styles.contentPre}>{content}</pre>
            )}
          </div>
        </div>
        <div className={styles.footer}>
          <button
            onClick={onAccept}
            disabled={loading}
            className={`${styles.acceptBtn} ${loading ? styles.acceptBtnDisabled : styles.acceptBtnEnabled}`}
          >我已知晓</button>
          <button onClick={onClose} className={styles.cancelBtn}>退出</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
