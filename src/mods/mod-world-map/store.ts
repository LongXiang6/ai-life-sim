'use client'

/** View-only map state. No geography, resource, entity, or exploration facts are stored here. */

import { create } from 'zustand'
import type { MapInteraction, MapRenderConfig } from './types'

interface WorldMapStore {
  config: MapRenderConfig
  interaction: MapInteraction
  setConfig: (partial: Partial<MapRenderConfig>) => void
  zoomIn: () => void
  zoomOut: () => void
  panBy: (dx: number, dy: number) => void
  setHoveredNode: (nodeId: string | null) => void
  setSelectedNode: (nodeId: string | null) => void
  setDragging: (isDragging: boolean) => void
  setDragStart: (x: number, y: number) => void
  resetView: () => void
}

const DEFAULT_CONFIG: MapRenderConfig = {
  canvasWidth: 800,
  canvasHeight: 600,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  showTerrain: true,
  showResources: true,
  showEntities: true,
}

const DEFAULT_INTERACTION: MapInteraction = {
  hoveredNodeId: null,
  selectedNodeId: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
}

export const useWorldMapStore = create<WorldMapStore>()((set) => ({
  config: { ...DEFAULT_CONFIG },
  interaction: { ...DEFAULT_INTERACTION },
  setConfig: (partial) => set((state) => ({ config: { ...state.config, ...partial } })),
  zoomIn: () => set((state) => ({
    config: { ...state.config, zoom: Math.min(3, state.config.zoom + 0.2) },
  })),
  zoomOut: () => set((state) => ({
    config: { ...state.config, zoom: Math.max(0.5, state.config.zoom - 0.2) },
  })),
  panBy: (dx, dy) => set((state) => ({
    config: {
      ...state.config,
      offsetX: state.config.offsetX + dx,
      offsetY: state.config.offsetY + dy,
    },
  })),
  setHoveredNode: (hoveredNodeId) => set((state) => ({
    interaction: { ...state.interaction, hoveredNodeId },
  })),
  setSelectedNode: (selectedNodeId) => set((state) => ({
    interaction: { ...state.interaction, selectedNodeId },
  })),
  setDragging: (isDragging) => set((state) => ({
    interaction: { ...state.interaction, isDragging },
  })),
  setDragStart: (dragStartX, dragStartY) => set((state) => ({
    interaction: { ...state.interaction, dragStartX, dragStartY },
  })),
  resetView: () => set({
    config: { ...DEFAULT_CONFIG },
    interaction: { ...DEFAULT_INTERACTION },
  }),
}))
