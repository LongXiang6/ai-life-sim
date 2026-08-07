'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapProjection, MapProjectionNode } from '@/foundation'
import { useWorldMapStore } from '../store'
import { computeRenderData, hitTestNode, renderMap } from '../utils/map-renderer'
import styles from './WorldMapCanvas.module.css'

export interface WorldMapCanvasProps {
  projection: MapProjection | null
  onNodeSelect?: (node: MapProjectionNode | null) => void
  className?: string
}

export function WorldMapCanvas({ projection, onNodeSelect, className }: WorldMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const [panelInfo, setPanelInfo] = useState<MapProjectionNode | null>(null)
  const config = useWorldMapStore((state) => state.config)
  const interaction = useWorldMapStore((state) => state.interaction)
  const setConfig = useWorldMapStore((state) => state.setConfig)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.max(1, Math.round(entry.contentRect.width))
      const height = Math.max(1, Math.round(entry.contentRect.height))
      useWorldMapStore.getState().setConfig({ canvasWidth: width, canvasHeight: height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const renderData = useMemo(() => (
    projection ? computeRenderData(projection, config) : []
  ), [projection, config])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !projection) return
    const context = canvas.getContext('2d')
    if (!context) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(config.canvasWidth * ratio))
    canvas.height = Math.max(1, Math.round(config.canvasHeight * ratio))
    canvas.style.width = `${config.canvasWidth}px`
    canvas.style.height = `${config.canvasHeight}px`
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    renderMap(
      context,
      projection,
      renderData,
      config,
      interaction.hoveredNodeId,
      interaction.selectedNodeId,
    )
  }, [projection, renderData, config, interaction.hoveredNodeId, interaction.selectedNodeId])

  const pointFor = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }, [])

  const hitAt = useCallback((x: number, y: number) => (
    renderData.find((item) => hitTestNode(x, y, item))
  ), [renderData])

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pointFor(event)
    pointerRef.current = { ...point, moved: false }
    const store = useWorldMapStore.getState()
    store.setDragStart(point.x, point.y)
    store.setDragging(true)
  }, [pointFor])

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pointFor(event)
    const pointer = pointerRef.current
    if (pointer) {
      const dx = point.x - pointer.x
      const dy = point.y - pointer.y
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        pointer.moved = true
        useWorldMapStore.getState().panBy(dx, dy)
        pointer.x = point.x
        pointer.y = point.y
      }
      return
    }
    useWorldMapStore.getState().setHoveredNode(hitAt(point.x, point.y)?.node.nodeId ?? null)
  }, [hitAt, pointFor])

  const finishPointer = useCallback((event?: React.MouseEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current
    pointerRef.current = null
    const store = useWorldMapStore.getState()
    store.setDragging(false)
    if (!event || !pointer || pointer.moved) return
    const point = pointFor(event)
    const hit = hitAt(point.x, point.y)?.node ?? null
    const selected = hit && store.interaction.selectedNodeId !== hit.nodeId ? hit : null
    store.setSelectedNode(selected?.nodeId ?? null)
    setPanelInfo(selected)
    onNodeSelect?.(selected)
  }, [hitAt, onNodeSelect, pointFor])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const store = useWorldMapStore.getState()
    if (event.deltaY < 0) store.zoomIn()
    else store.zoomOut()
  }, [])

  return (
    <div ref={containerRef} className={`${styles.container} ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishPointer}
        onMouseLeave={() => {
          finishPointer()
          useWorldMapStore.getState().setHoveredNode(null)
        }}
      />

      <div className={styles.controls}>
        <button className={styles.controlBtn} onClick={() => useWorldMapStore.getState().zoomIn()} title="放大" aria-label="放大">+</button>
        <button className={styles.controlBtn} onClick={() => useWorldMapStore.getState().zoomOut()} title="缩小" aria-label="缩小">-</button>
        <button className={styles.controlBtn} onClick={() => useWorldMapStore.getState().resetView()} title="重置视图" aria-label="重置视图">↺</button>
        <span className={styles.zoomLabel}>{Math.round(config.zoom * 100)}%</span>
      </div>

      <div className={styles.legend}>
        <label className={styles.legendItem}>
          <input type="checkbox" checked={config.showClimate} onChange={(event) => setConfig({ showClimate: event.target.checked })} />
          <span className={styles.legendLabel}>气候</span>
        </label>
        <label className={styles.legendItem}>
          <input type="checkbox" checked={config.showResources} onChange={(event) => setConfig({ showResources: event.target.checked })} />
          <span className={styles.legendLabel}>资源</span>
        </label>
        <label className={styles.legendItem}>
          <input type="checkbox" checked={config.showPollution} onChange={(event) => setConfig({ showPollution: event.target.checked })} />
          <span className={styles.legendLabel}>污染</span>
        </label>
      </div>

      {panelInfo && (
        <div className={styles.infoPanel}>
          <h3 className={styles.infoTitle}>{panelInfo.name}</h3>
          <div className={styles.infoRow}><span className={styles.infoLabel}>气候</span><span>{panelInfo.profile?.climate ?? '未知'}</span></div>
          <div className={styles.infoRow}><span className={styles.infoLabel}>生态</span><span>{panelInfo.profile?.ecology ?? '未知'}</span></div>
          <div className={styles.infoRow}><span className={styles.infoLabel}>资源</span><span>{panelInfo.profile?.resources.join('、') || '无明显资源'}</span></div>
          <div className={styles.infoRow}><span className={styles.infoLabel}>污染</span><span>{panelInfo.profile?.pollution ?? '未知'}</span></div>
          {panelInfo.isCurrentRegion && <div className={styles.currentLocation}>当前区域</div>}
        </div>
      )}

      {!projection || projection.nodes.length === 0 ? (
        <div className={styles.empty}>暂无空间数据</div>
      ) : null}
    </div>
  )
}
