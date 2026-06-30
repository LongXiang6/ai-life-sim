'use client'

/**
 * @module use-is-mobile.ts
 * @description 设备检测共享 hook，统一移动端/桌面端判断逻辑
 *
 * 需求来源：消除分散的设备检测逻辑
 * 功能说明：
 *   - 通过 window.innerWidth 检测是否移动端
 *   - 监听窗口 resize 事件自动更新
 *
 * 依赖：react
 */

import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

/** 检测当前视口是否为移动端
 * @returns 是否为移动端
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isMobile
}
