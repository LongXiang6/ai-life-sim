'use client'

/**
 * @module WorldMapCanvas
 * @description 世界地图 Canvas 渲染组件 —— 六边形地块 + 标记层 + 缩放/平移
 * @mod mod-world-map
 */

import { useRef, useEffect, useCallback, useState } from 'react'

import type { WorldRegion } from '@/mods/mod-base-universe'
import { useWorldMapStore } from '../store'
import { computeRenderData, renderMap, hitTestHex, buildFactionColors } from '../utils/map-renderer'
import type { RegionRenderData, MarkerLayer, FactionColorMap } from '../types'
import styles from './WorldMapCanvas.module.css'

export interface WorldMapCanvasProps {
  /** 区域数据 */
  regions: WorldRegion[]
  /** 标记层 */
  markers?: MarkerLayer[]
  /** 选中区域回调 */
  onRegionSelect?: (region: WorldRegion | null) => void
  /** 自定义类名 */
  className?: string
}

/** 世界地图 Canvas 渲染组件 —— 六边形地块 + 标记层 + 缩放/平移
 * @param regions 区域数据
 * @param markers 标记层数组
 * @param onRegionSelect 选中区域回调
 * @param className 自定义类名
 */
export function WorldMapCanvas({ regions, markers: externalMarkers, onRegionSelect, className }: WorldMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renderDataRef = useRef<RegionRenderData[]>([])
  const factionColorsRef = useRef<FactionColorMap>({})
  const rafRef = useRef<number>(0)

  const [panelInfo, setPanelInfo] = useState<WorldRegion | null>(null)

  const config = useWorldMapStore((s) => s.config)
  const interaction = useWorldMapStore((s) => s.interaction)
  const internalMarkers = useWorldMapStore((s) => s.markers)
  const setConfig = useWorldMapStore((s) => s.setConfig)
  const panBy = useWorldMapStore((s) => s.panBy)
  const setHoveredRegion = useWorldMapStore((s) => s.setHoveredRegion)
  const setSelectedRegion = useWorldMapStore((s) => s.setSelectedRegion)
  const setDragging = useWorldMapStore((s) => s.setDragging)
  const setDragStart = useWorldMapStore((s) => s.setDragStart)

  const allMarkers = [...internalMarkers, ...(externalMarkers ?? [])]

  // 更新画布尺寸
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width !== config.canvasWidth || rect.height !== config.canvasHeight) {
      setConfig({ canvasWidth: rect.width, canvasHeight: rect.height })
    }
  }, [setConfig, config.canvasWidth, config.canvasHeight])

  // 构建势力颜色
  useEffect(() => {
    if (regions.length === 0) return
    const factions = [...new Set(regions.map((r) => r.ownerFaction).filter(Boolean))] as string[]
    factionColorsRef.current = buildFactionColors(factions)
  }, [regions])

  // 渲染循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = config.canvasWidth * window.devicePixelRatio
    canvas.height = config.canvasHeight * window.devicePixelRatio
    canvas.style.width = `${config.canvasWidth}px`
    canvas.style.height = `${config.canvasHeight}px`
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    renderDataRef.current = computeRenderData(regions, config, factionColorsRef.current)

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!ctx) return
      renderMap(
        ctx,
        renderDataRef.current,
        config,
        allMarkers,
        interaction.hoveredRegionId,
        interaction.selectedRegionId,
      )
    })

    return () => cancelAnimationFrame(rafRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, config, interaction.hoveredRegionId, interaction.selectedRegionId, allMarkers.length])

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      useWorldMapStore.getState().zoomIn()
    } else {
      useWorldMapStore.getState().zoomOut()
    }
  }, [])

  // 鼠标按下（开始拖拽 / 选择）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    // 命中检测
    const hit = renderDataRef.current.find((rd) => hitTestHex(mx, my, rd))

    if (hit) {
      // 延迟设置拖拽（如果短按就是选择）
      setDragStart(mx, my)
      setTimeout(() => {
        const state = useWorldMapStore.getState()
        if (!state.interaction.isDragging) {
          const regionId = hit.region.id
          const newSelected = state.interaction.selectedRegionId === regionId ? null : regionId
          setSelectedRegion(newSelected)
          if (newSelected) {
            setPanelInfo(hit.region)
            onRegionSelect?.(hit.region)
          } else {
            setPanelInfo(null)
            onRegionSelect?.(null)
          }
        }
      }, 150)
    } else {
      setDragStart(mx, my)
      setDragging(true)
    }
  }, [setDragStart, setDragging, setSelectedRegion, onRegionSelect])

  // 鼠标移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const state = useWorldMapStore.getState()

    if (state.interaction.isDragging) {
      const dx = mx - state.interaction.dragStartX
      const dy = my - state.interaction.dragStartY
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        panBy(dx, dy)
        setDragStart(mx, my)
      }
    } else {
      // 悬停检测
      const hit = renderDataRef.current.find((rd) => hitTestHex(mx, my, rd))
      setHoveredRegion(hit?.region.id ?? null)
    }
  }, [panBy, setDragStart, setHoveredRegion])

  // 鼠标松开
  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [setDragging])

  // 鼠标离开
  const handleMouseLeave = useCallback(() => {
    setDragging(false)
    setHoveredRegion(null)
  }, [setDragging, setHoveredRegion])

  const handleResetView = useCallback(() => {
    useWorldMapStore.getState().resetView()
  }, [])

  return (
    <div ref={containerRef} className={`${styles.container} ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* 控制栏 */}
      <div className={styles.controls}>
        <button className={styles.controlBtn} onClick={() => useWorldMapStore.getState().zoomIn()} title="放大">
          +
        </button>
        <button className={styles.controlBtn} onClick={() => useWorldMapStore.getState().zoomOut()} title="缩小">
          −
        </button>
        <button className={styles.controlBtn} onClick={handleResetView} title="重置视图">
          ⟳
        </button>
        <span className={styles.zoomLabel}>{Math.round(config.zoom * 100)}%</span>
      </div>

      {/* 图例 */}
      <div className={styles.legend}>
        <span className={styles.legendTitle}>地形</span>
        {[['plain', '平原'], ['forest', '森林'], ['mountain', '山脉'], ['desert', '沙漠'], ['ocean', '海洋']].map(([key, label]) => (
          <div key={key} className={styles.legendItem}>
            <span
              className={styles.legendColor}
              style={{ background: key === 'plain' ? '#7ec87e' : key === 'forest' ? '#2d7d2d' : key === 'mountain' ? '#8b8b83' : key === 'desert' ? '#e8d5a3' : '#4a90d9' }}
            />
            <span className={styles.legendLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* 区域信息面板 */}
      {panelInfo && (
        <div className={styles.infoPanel}>
          <h3 className={styles.infoTitle}>{panelInfo.name}</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>地形</span>
            <span>{panelInfo.terrain}</span>
          </div>
          {panelInfo.directionLabel && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>方位</span>
              <span>{panelInfo.directionLabel}</span>
            </div>
          )}
          {panelInfo.ownerFaction && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>势力</span>
              <span>{panelInfo.ownerFaction}</span>
            </div>
          )}
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>人口</span>
            <span>{panelInfo.population.toLocaleString()}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>开发度</span>
            <span>{panelInfo.development}%</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>气温</span>
            <span>{panelInfo.temperature}°C</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>湿度</span>
            <span>{panelInfo.humidity}%</span>
          </div>
        </div>
      )}

      {/* 无数据提示 */}
      {regions.length === 0 && (
        <div className={styles.empty}>
          <p>暂无世界数据</p>
          <p className={styles.emptyHint}>请先在创建世界中生成区域数据</p>
        </div>
      )}
    </div>
  )
}
