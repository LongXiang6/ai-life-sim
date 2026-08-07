/**
 * Purpose: Define view-only map rendering controls and interaction state.
 * Owner: mod-world-map
 * Responsibility: Canvas presentation only; world and region facts stay in mod-world.
 */

import type { MapProjectionNode } from '@/foundation'

export type RegionColorMap = Record<string, string>

export const DEFAULT_REGION_COLORS: RegionColorMap = {
  temperate: '#5f8f68',
  cold: '#7b9aa4',
  arid: '#b2945d',
  polluted: '#7f6f72',
  unknown: '#666a6d',
}

export interface MapRenderConfig {
  canvasWidth: number
  canvasHeight: number
  zoom: number
  offsetX: number
  offsetY: number
  showClimate: boolean
  showResources: boolean
  showPollution: boolean
}

export interface NodeRenderData {
  node: MapProjectionNode
  renderX: number
  renderY: number
  radius: number
  regionColor: string
}

export interface MapInteraction {
  hoveredNodeId: string | null
  selectedNodeId: string | null
  isDragging: boolean
  dragStartX: number
  dragStartY: number
}
