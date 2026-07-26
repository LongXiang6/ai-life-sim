'use client'

/**
 * @module FinalFlowScaleRuntime
 * @description 为 final-flow 设计画布提供兼容旧手机浏览器的数值缩放。
 */

import { useLayoutEffect } from 'react'

const DESIGN_SIZES: Record<string, { width: number; height: number }> = {
  'final-flow-design-fit--430': { width: 430, height: 932 },
  'final-flow-design-fit--390': { width: 390, height: 844 },
  'final-flow-design-fit--330': { width: 330, height: 715 },
}

function getDesignSize(fit: HTMLElement) {
  const variant = Object.keys(DESIGN_SIZES).find((className) => fit.classList.contains(className))
  return variant ? DESIGN_SIZES[variant] : { width: 320, height: 694 }
}

function syncFit(fit: HTMLElement) {
  const canvas = Array.from(fit.children).find((child) => (
    child instanceof HTMLElement && child.classList.contains('final-flow-design-canvas')
  ))
  if (!(canvas instanceof HTMLElement)) return

  const host = fit.closest<HTMLElement>('.final-flow-frame') ?? fit.parentElement
  if (!host) return
  const hostRect = host.getBoundingClientRect()
  const width = hostRect.width
  const height = hostRect.height
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return

  const design = getDesignSize(fit)
  const isMobile = width < 768
  const scale = isMobile
    ? width / design.width
    : Math.min(width / design.width, height / design.height)
  if (!Number.isFinite(scale) || scale <= 0) return

  // CSS typed division is unavailable in older mobile browsers; keep the
  // canvas dimensions fixed and provide a plain numeric transform instead.
  fit.style.width = `${design.width * scale}px`
  fit.style.height = `${design.height * scale}px`
  fit.style.maxWidth = 'none'
  fit.style.maxHeight = 'none'
  canvas.style.width = `${design.width}px`
  canvas.style.height = `${design.height}px`
  canvas.style.transformOrigin = 'top left'
  canvas.style.transform = `scale(${scale})`
}

function syncAllFits() {
  document.querySelectorAll<HTMLElement>('.final-flow-design-fit').forEach(syncFit)
}

export function FinalFlowScaleRuntime() {
  useLayoutEffect(() => {
    syncAllFits()

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => syncAllFits())
    document.querySelectorAll<HTMLElement>('.final-flow-design-fit').forEach((fit) => {
      resizeObserver?.observe(fit)
      if (fit.parentElement) resizeObserver?.observe(fit.parentElement)
    })

    const mutationObserver = new MutationObserver(() => syncAllFits())
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', syncAllFits)
    window.visualViewport?.addEventListener('resize', syncAllFits)

    return () => {
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', syncAllFits)
      window.visualViewport?.removeEventListener('resize', syncAllFits)
    }
  }, [])

  return null
}
