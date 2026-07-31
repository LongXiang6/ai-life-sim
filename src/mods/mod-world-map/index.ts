/** Public map projection and rendering API. */

export type { MapProjection, MapProjectionNode, MapProjectionRequest } from '@/foundation'
export type { MapRenderConfig, NodeRenderData, MapInteraction, TerrainColorMap } from './types'
export { DEFAULT_TERRAIN_COLORS } from './types'
export { projectWorldMap } from './map-projection'
export { WorldMapCanvas } from './components/WorldMapCanvas'
export type { WorldMapCanvasProps } from './components/WorldMapCanvas'
export { useWorldMapStore } from './store'
export { computeRenderData, renderMap, hitTestNode } from './utils/map-renderer'
