/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 可视化世界地图
 * @mod mod-world-map
 */

// 类型
export type {
  MapRenderConfig,
  RegionRenderData,
  MarkerLayer,
  FactionColorMap,
  MapInteraction,
  TerrainColorMap,
} from './types'

// 常量
export {
  DEFAULT_TERRAIN_COLORS,
  FACTION_COLORS,
} from './types'

// 组件
export { WorldMapCanvas } from './components/WorldMapCanvas'
export type { WorldMapCanvasProps } from './components/WorldMapCanvas'

// Store
export { useWorldMapStore } from './store'

// 工具
export {
  computeRenderData,
  renderMap,
  hitTestHex,
  buildFactionColors,
} from './utils/map-renderer'
