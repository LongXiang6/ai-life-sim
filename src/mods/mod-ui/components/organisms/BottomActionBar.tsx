/** Purpose: Render the finalized shared flow action bar. Owner: mod-ui. Responsibility: Action presentation and event forwarding only. */

'use client'

/**
 * @module BottomActionBar.tsx
 * @description 创建流程统一底栏：圆形返回、弹性辅助操作与流式主操作
 * @mod mod-ui
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { MAX_WIDTH } from '../../tokens'
import styles from './BottomActionBar.module.css'

export interface MoreMenuItem {
  label: string
  icon?: string
  disabled?: boolean
  title?: string
  onClick: () => void
}

export interface BottomActionBarProps {
  onBack?: () => void
  backTitle?: string
  backText?: string
  backDescription?: string
  backDisabled?: boolean
  onConfirm?: () => void
  confirmText?: string
  confirmNumber?: string
  confirmDescription?: string
  confirmDisabled?: boolean
  confirmTitle?: string
  moreLabel?: string
  moreItems?: MoreMenuItem[]
  dropdownAlign?: 'left' | 'center' | 'right'
  className?: string
  maxWidth?: string
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [handler, ref])
}

export function BottomActionBar({
  onBack,
  backTitle = '返回上一步',
  backText,
  backDescription,
  backDisabled = false,
  onConfirm,
  confirmText = '确认',
  confirmNumber,
  confirmDescription,
  confirmDisabled = false,
  confirmTitle,
  moreLabel = '更多',
  moreItems,
  dropdownAlign = 'center',
  className = '',
  maxWidth = MAX_WIDTH,
}: BottomActionBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useClickOutside(moreRef, useCallback(() => setMoreOpen(false), []))

  const hasMore = (moreItems?.length ?? 0) > 0
  const singleExtra = moreItems?.length === 1
  const hasDropdown = (moreItems?.length ?? 0) >= 2
  const dropdownClass = dropdownAlign === 'left'
    ? styles.dropdownLeft
    : dropdownAlign === 'right'
      ? styles.dropdownRight
      : styles.dropdownCenter

  return (
    <div className={`${styles.bar} ${className}`.trim()} data-flow-bottom-bar>
      <div className={`${styles.inner} ${hasMore ? '' : styles.innerNoMore}`.trim()} style={{ maxWidth }}>
        <div className={styles.left}>
          {onBack ? (
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
              disabled={backDisabled}
              title={backTitle}
              aria-label={backTitle}
            >
              <span className={styles.actionIcon} aria-hidden="true">←</span>
              <span className={styles.actionCopy}>
                <strong>{backText ?? backTitle}</strong>
                {backDescription ? <small>{backDescription}</small> : null}
              </span>
            </button>
          ) : <span className={styles.backPlaceholder} aria-hidden="true" />}
        </div>

        {hasMore ? <div className={styles.middle}>
          {singleExtra && moreItems ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={moreItems[0].onClick}
              disabled={moreItems[0].disabled}
              title={moreItems[0].title}
            >
              {moreItems[0].icon ? <span aria-hidden="true">{moreItems[0].icon}</span> : null}
              <span>{moreItems[0].label}</span>
            </button>
          ) : null}

          {hasDropdown ? (
            <div ref={moreRef} className={styles.moreWrapper}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setMoreOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                title={moreLabel}
              >
                <span>{moreLabel}</span><span className={styles.chevron} aria-hidden="true">⌃</span>
              </button>
              {moreOpen ? (
                <div className={`${styles.dropdown} ${dropdownClass}`} role="menu">
                  {moreItems!.map((item) => (
                    <button
                      type="button"
                      key={`${item.label}-${item.title ?? ''}`}
                      className={styles.dropdownItem}
                      onClick={() => {
                        if (item.disabled) return
                        item.onClick()
                        setMoreOpen(false)
                      }}
                      disabled={item.disabled}
                      title={item.title}
                      role="menuitem"
                    >
                      {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

        </div> : null}

        <div className={styles.right}>
          {onConfirm ? (
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => { if (!confirmDisabled) onConfirm?.() }}
              disabled={confirmDisabled}
              title={confirmTitle}
              data-step={confirmNumber}
            >
              <span className={styles.actionIcon} aria-hidden="true">→</span>
              <span className={styles.actionCopy}>
                <strong>{confirmText}</strong>
                {confirmDescription ? <small>{confirmDescription}</small> : null}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
