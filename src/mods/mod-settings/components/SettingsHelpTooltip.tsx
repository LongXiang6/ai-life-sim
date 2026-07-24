'use client'

/**
 * @module SettingsHelpTooltip
 * @description 设置项帮助提示组件
 * @mod mod-settings
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { getSettingsPortalMetrics, getSettingsPortalRoot } from './settings-portal'
import styles from './SettingsHelpTooltip.module.css'

interface SettingsHelpTooltipProps {
  helpKey: string
  helpOpen: Record<string, boolean>
  helpData: Record<string, string>
  toggleHelp: (id: string) => void
  width?: number
}

/** 设置项帮助提示组件
 * @param helpKey 帮助标识键
 * @param helpOpen 帮助开启状态映射
 * @param helpData 帮助数据映射
 * @param toggleHelp 切换帮助显示回调
 * @param width 提示框宽度（默认 260）
 */
export function SettingsHelpTooltip({
  helpKey,
  helpOpen,
  helpData,
  toggleHelp,
  width = 260,
}: SettingsHelpTooltipProps) {
  const isOpen = Boolean(helpOpen[helpKey])
  const tooltipId = `settings-help-${useId().replace(/:/g, '')}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const viewportPadding = 12
    const gap = 6
    const metrics = getSettingsPortalMetrics()
    const triggerRect = trigger.getBoundingClientRect()
    const tooltipWidth = Math.min(width, Math.max(0, metrics.width - viewportPadding * 2))
    const maxLeft = Math.max(viewportPadding, metrics.width - tooltipWidth - viewportPadding)
    const triggerRight = (triggerRect.right - metrics.left) / metrics.scale
    const triggerTop = (triggerRect.top - metrics.top) / metrics.scale
    const triggerBottom = (triggerRect.bottom - metrics.top) / metrics.scale
    const left = Math.min(Math.max(triggerRight + gap, viewportPadding), maxLeft)
    const tooltipHeight = (tooltipRef.current?.getBoundingClientRect().height ?? 0) / metrics.scale
    const belowTop = triggerBottom + gap
    const top = tooltipHeight > 0 && belowTop + tooltipHeight > metrics.height - viewportPadding
      ? Math.max(viewportPadding, triggerTop - tooltipHeight - gap)
      : Math.max(viewportPadding, belowTop)

    setPosition({ top, left, width: tooltipWidth })
  }, [width])

  useEffect(() => {
    if (!isOpen) return

    const positionFrame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(positionFrame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  return (
    <span className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          if (!isOpen) updatePosition()
          toggleHelp(helpKey)
        }}
        className={styles.trigger}
        title="点击查看说明"
        aria-label="查看说明"
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
      >
        ⓘ
      </button>
      {isOpen && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className={styles.tooltip}
          style={position}
        >
          {helpData[helpKey]}
        </div>,
        getSettingsPortalRoot(),
      )}
    </span>
  )
}
