'use client'

/**
 * @module Dropdown.tsx
 * @description 自定义下拉组件 —— 替代原生 select，智能感应屏幕底部向上弹出
 * @mod mod-ui
 *
 * 来源：废弃项目 components/ui/dropdown/Dropdown.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './Dropdown.module.css'

interface DropdownProps {
  /** 当前选中的值 */
  value: string
  /** 选项列表 */
  options: string[]
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 额外的 CSS 类名 */
  className?: string
  /** 占位文本 */
  placeholder?: string
}

/**
 * 自定义下拉选择组件 —— 面板高度限制，超出可滚动，接近屏幕底部时自动向上弹出
 * @param {DropdownProps} props - 组件属性
 */
export function Dropdown({ value, options, onChange, className, placeholder }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [upward, setUpward] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  /** 面板渲染后检测是否超出屏幕底部 */
  useEffect(() => {
    if (!open || !panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const viewH = window.innerHeight
    setUpward(rect.bottom > viewH - 8)
  }, [open, options])

  const handleSelect = (opt: string) => {
    onChange(opt)
    setOpen(false)
  }

  const displayText = value || placeholder || '请选择'

  return (
    <div className={`${styles.dropdown} ${className || ''}`} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.triggerText}>{displayText}</span>
        <span className={`${styles.arrow} ${open ? styles.arrowUp : ''}`}>▼</span>
      </button>
      {open && (
        <div className={`${styles.panel} ${upward ? styles.panelUp : ''}`} ref={panelRef}>
          {options.map(opt => (
            <div
              key={opt}
              className={`${styles.option} ${opt === value ? styles.optionSelected : ''}`}
              onClick={() => handleSelect(opt)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
