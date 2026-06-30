'use client'

/**
 * @module useWorldMapStore
 * @description mod-world-map Zustand Store —— 地图视图状态
 * @mod mod-world-map
 */

import { create } from 'zustand'

import type { MapRenderConfig, MapInteraction, MarkerLayer } from './types'

interface WorldMapStore {
  /** 渲染配置 */
  config: MapRenderConfig
  /** 交互状态 */
  interaction: MapInteraction
  /** 标记层 */
  markers: MarkerLayer[]

  /** 设置渲染配置 */
  setConfig: (partial: Partial<MapRenderConfig>) => void
  /** 缩放 */
  zoomIn: () => void
  zoomOut: () => void
  /** 平移 */
  panBy: (dx: number, dy: number) => void
  /** 设置悬停区域 */
  setHoveredRegion: (regionId: string | null) => void
  /** 设置选中区域 */
  setSelectedRegion: (regionId: string | null) => void
  /** 设置拖拽状态 */
  setDragging: (isDragging: boolean) => void
  /** 设置拖拽起点 */
  setDragStart: (x: number, y: number) => void
  /** 设置标记层 */
  setMarkers: (markers: MarkerLayer[]) => void
  /** 添加标记 */
  addMarker: (marker: MarkerLayer) => void
  /** 重置视图 */
  resetView: () => void
}

const DEFAULT_CONFIG: MapRenderConfig = {
  canvasWidth: 800,
  canvasHeight: 600,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  showTerrain: true,
  showFactions: true,
  showResources: false,
  showPopulation: false,
}

const DEFAULT_INTERACTION: MapInteraction = {
  hoveredRegionId: null,
  selectedRegionId: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
}

export const useWorldMapStore = create<WorldMapStore>()((set) => ({
  config: { ...DEFAULT_CONFIG },
  interaction: { ...DEFAULT_INTERACTION },
  markers: [],

  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  zoomIn: () => set((s) => ({
    config: { ...s.config, zoom: Math.min(3, s.config.zoom + 0.2) },
  })),

  zoomOut: () => set((s) => ({
    config: { ...s.config, zoom: Math.max(0.5, s.config.zoom - 0.2) },
  })),

  panBy: (dx, dy) => set((s) => ({
    config: {
      ...s.config,
      offsetX: s.config.offsetX + dx,
      offsetY: s.config.offsetY + dy,
    },
  })),

  setHoveredRegion: (regionId) => set((s) => ({
    interaction: { ...s.interaction, hoveredRegionId: regionId },
  })),

  setSelectedRegion: (regionId) => set((s) => ({
    interaction: { ...s.interaction, selectedRegionId: regionId },
  })),

  setDragging: (isDragging) => set((s) => ({
    interaction: { ...s.interaction, isDragging },
  })),

  setDragStart: (x, y) => set((s) => ({
    interaction: { ...s.interaction, dragStartX: x, dragStartY: y },
  })),

  setMarkers: (markers) => set({ markers }),

  addMarker: (marker) => set((s) => ({
    markers: [...s.markers.filter((m) => m.regionId !== marker.regionId || m.type !== marker.type), marker],
  })),

  resetView: () => set({
    config: { ...DEFAULT_CONFIG },
    interaction: { ...DEFAULT_INTERACTION },
  }),
}))
