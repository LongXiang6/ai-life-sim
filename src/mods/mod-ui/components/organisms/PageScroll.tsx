'use client'

/**
 * @module PageScroll.tsx
 * @description 页面滚动容器有机体组件 —— 统一游戏中所有页面的滚动区域样式
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：固定 maxWidth 居中，内容清晰聚焦
 *   - Depth：滚动区域独立层级，z-index 控制
 */

import React from 'react'
import { useIsMobile } from '@/foundation'
import { MAX_WIDTH } from '../../tokens'

export interface PageScrollProps {
  children: React.ReactNode
  maxWidth?: string | number
  className?: string
}

/**
 * 页面滚动容器组件 —— 统一游戏中所有页面的滚动区域样式
 * @param {PageScrollProps} props - 组件属性
 */
export function PageScroll({ children, maxWidth = MAX_WIDTH, className = '' }: PageScrollProps) {
  const isMobile = useIsMobile()

  return (
    <div className={className} style={{
      position: 'relative',
      zIndex: 1,
      height: '100vh',
      padding: isMobile ? '16px 16px 100px' : '24px 24px 120px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',
      scrollbarWidth: 'none',
    }}>
      <div style={{ maxWidth, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
