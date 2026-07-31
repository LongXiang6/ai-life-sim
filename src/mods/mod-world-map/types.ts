/** Read-side map rendering types. Business facts remain with their owning systems. */

import type { MapProjectionNode } from '@/foundation'

export type TerrainColorMap = Record<string, string>

export const DEFAULT_TERRAIN_COLORS: TerrainColorMap = {
  plain: '#70a56f',
  forest: '#3f7651',
  mountain: '#8b8f8d',
  desert: '#c7a85f',
  water: '#4d83a8',
  wetland: '#657a5b',
  ice: '#b7d0d5',
  volcanic: '#935951',
  underground: '#55585a',
  artificial: '#8b7ca0',
  celestial: '#8398bd',
  void: '#34343c',
  abstract: '#81749a',
  unknown: '#666a6d',
}

export interface MapRenderConfig {
  canvasWidth: number
  canvasHeight: number
  zoom: number
  offsetX: number
  offsetY: number
  showTerrain: boolean
  showResources: boolean
  showEntities: boolean
}

export interface NodeRenderData {
  node: MapProjectionNode
  renderX: number
  renderY: number
  radius: number
  terrainColor: string
}

export interface MapInteraction {
  hoveredNodeId: string | null
  selectedNodeId: string | null
  isDragging: boolean
  dragStartX: number
  dragStartY: number
}
