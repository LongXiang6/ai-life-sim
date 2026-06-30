'use client'

/**
 * @module BottomActionBar.tsx
 * @description 统一底部操作栏 —— 完全对齐废弃项目 BottomActionBar
 * @mod mod-ui
 *
 * 来源：废弃项目 components/layout/bottom-action-bar/BottomActionBar.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react'

import { useIsMobile } from '@/foundation'
import { MAX_WIDTH } from '../../tokens'

// ============================================================
// 常量（对齐废弃项目 MOBILE 常量）
// ============================================================

const MOBILE = {
  barPaddingV: '12px',
  barPaddingH: '16px',
  barGap: '8px',
  btnHeight: '42px',
  btnPadding: '0 14px',
  btnRadius: '8px',
  btnFontSize: '13px',
  backWidth: '100px',
  confirmWidth: '120px',
  moreMinWidth: '80px',
  borderWidth: '1.5px',
  dropdownRadius: '8px',
  dropdownItemPadding: '9px 12px',
  dropdownFontSize: '13px',
} as const

// ============================================================
// 类型
// ============================================================

export interface MoreMenuItem {
  label: string
  icon?: string
  disabled?: boolean
  title?: string
  onClick: () => void
}

export interface BottomActionBarProps {
  /** 返回按钮回调 */
  onBack?: () => void
  /** 返回按钮 hover 提示 */
  backTitle?: string
  /** 确认按钮回调 */
  onConfirm?: () => void
  /** 确认按钮文本 */
  confirmText?: string
  /** 确认按钮是否禁用 */
  confirmDisabled?: boolean
  /** 确认按钮 hover 提示 */
  confirmTitle?: string
  /** 更多下拉按钮标签 */
  moreLabel?: string
  /** 更多菜单项（1个=独立按钮，2+个=下拉菜单） */
  moreItems?: MoreMenuItem[]
  /** 下拉菜单对齐方式 */
  dropdownAlign?: 'left' | 'center' | 'right'
  /** 自定义类名 */
  className?: string
  /** 内容区最大宽度 */
  maxWidth?: string
}

// ============================================================
// Hook: 点击外部关闭
// ============================================================

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler()
      }
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

// ============================================================
// 组件
// ============================================================

/**
 * 统一底部操作栏组件 —— 返回按钮 + 确认按钮 + 更多操作下拉菜单
 * @param {BottomActionBarProps} props - 组件属性
 */
export function BottomActionBar({
  onBack,
  backTitle,
  onConfirm,
  confirmText = '确认',
  confirmDisabled = false,
  confirmTitle,
  moreLabel = '更多',
  moreItems,
  dropdownAlign = 'center',
  className = '',
  maxWidth = MAX_WIDTH,
}: BottomActionBarProps) {
  const isMobile = useIsMobile()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useClickOutside(moreRef, useCallback(() => setMoreOpen(false), []))

  const handleBack = useCallback(() => {
    onBack?.()
  }, [onBack])

  const handleConfirm = useCallback(() => {
    if (!confirmDisabled) onConfirm?.()
  }, [onConfirm, confirmDisabled])

  const hasMore = moreItems && moreItems.length > 0
  const singleExtra = hasMore && moreItems!.length === 1
  const hasDropdown = hasMore && moreItems!.length >= 2

  // ---- 内联样式（对齐废弃项目） ----

  const barStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: isMobile ? `${MOBILE.barPaddingV} ${MOBILE.barPaddingH}` : '16px 32px',
    background: 'var(--color-bg-primary)',
    zIndex: 100,
  }

  const innerStyle: React.CSSProperties = {
    maxWidth,
    width: '100%',
    margin: '0 auto',
    display: 'flex',
    gap: isMobile ? MOBILE.barGap : '12px',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid var(--color-border)',
    paddingTop: isMobile ? MOBILE.barPaddingV : '16px',
  }

  const backBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: isMobile ? MOBILE.btnHeight : '38px',
    width: isMobile ? MOBILE.backWidth : '90px',
    padding: MOBILE.btnPadding,
    fontSize: MOBILE.btnFontSize,
    fontWeight: 500,
    borderRadius: MOBILE.btnRadius,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: `${MOBILE.borderWidth} solid var(--color-bg-tertiary)`,
    background: 'transparent',
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  const confirmBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: isMobile ? MOBILE.btnHeight : '38px',
    width: isMobile ? MOBILE.confirmWidth : '110px',
    padding: MOBILE.btnPadding,
    fontSize: MOBILE.btnFontSize,
    fontWeight: 500,
    borderRadius: MOBILE.btnRadius,
    cursor: confirmDisabled ? 'not-allowed' : 'pointer',
    opacity: confirmDisabled ? 0.5 : 1,
    transition: 'all 0.2s ease',
    border: `${MOBILE.borderWidth} solid var(--color-bg-tertiary)`,
    background: 'transparent',
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  const extraBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: isMobile ? MOBILE.btnHeight : '38px',
    minWidth: isMobile ? MOBILE.moreMinWidth : '80px',
    padding: MOBILE.btnPadding,
    fontSize: MOBILE.btnFontSize,
    fontWeight: 500,
    borderRadius: MOBILE.btnRadius,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: `${MOBILE.borderWidth} solid var(--color-bg-tertiary)`,
    background: 'transparent',
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  const moreBtnStyle: React.CSSProperties = {
    ...extraBtnStyle,
  }

  const dropdownPosStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    marginBottom: '6px',
    minWidth: '150px',
    width: 'max-content',
    maxWidth: isMobile ? '80vw' : '320px',
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: isMobile ? MOBILE.dropdownRadius : '10px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    overflow: 'hidden',
    zIndex: 101,
  }

  if (dropdownAlign === 'left') {
    dropdownPosStyle.left = 0
  } else if (dropdownAlign === 'right') {
    dropdownPosStyle.right = 0
  } else {
    dropdownPosStyle.left = '50%'
    dropdownPosStyle.transform = 'translateX(-50%)'
  }

  const dropdownItemStyle = (disabled = false): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: isMobile ? MOBILE.dropdownItemPadding : '9px 12px',
    fontSize: isMobile ? MOBILE.dropdownFontSize : '13px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
    fontWeight: 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  })

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className={className} style={barStyle}>
      <div style={innerStyle}>
        {/* 左侧：返回按钮 */}
        {onBack && (
          <button style={backBtnStyle} onClick={handleBack} title={backTitle}>
            ← 返回
          </button>
        )}

        {/* 中间：单个额外操作（1个 moreItem = 独立按钮） */}
        {singleExtra && moreItems && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <button
              style={extraBtnStyle}
              onClick={() => { moreItems[0].onClick() }}
              disabled={moreItems[0].disabled}
              title={moreItems[0].title}
            >
              {moreItems[0].icon && <span>{moreItems[0].icon}</span>}
              {moreItems[0].label}
            </button>
          </div>
        )}

        {/* 中间：下拉菜单（2+个 moreItems） */}
        {hasDropdown && (
          <div ref={moreRef} style={{ position: 'relative', display: 'flex', justifyContent: 'center', flex: 1 }}>
            <button style={moreBtnStyle} onClick={() => setMoreOpen(prev => !prev)} title={moreLabel}>
              {moreLabel}
              <span style={{ fontSize: '10px', marginLeft: '2px', opacity: 0.6 }}>▼</span>
            </button>
            {moreOpen && (
              <div style={dropdownPosStyle}>
                {moreItems!.map((item, idx) => (
                  <button
                    key={idx}
                    style={dropdownItemStyle(item.disabled)}
                    onClick={() => {
                      if (!item.disabled) {
                        item.onClick()
                        setMoreOpen(false)
                      }
                    }}
                    title={item.title}
                  >
                    {item.icon && <span style={{ marginRight: 6 }}>{item.icon}</span>}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 无额外操作时占位 */}
        {!hasMore && <div style={{ flex: 1 }} />}

        {/* 右侧：确认按钮 */}
        {onConfirm && (
          <button style={confirmBtnStyle} onClick={handleConfirm} disabled={confirmDisabled} title={confirmTitle}>
            {confirmText}
          </button>
        )}
      </div>
    </div>
  )
}
