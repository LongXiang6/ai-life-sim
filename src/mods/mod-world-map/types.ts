/**
 * @module types.ts
 * @description MOD 类型定义 —— 可视化世界地图
 * @mod mod-world-map
 *
 * 创意 #11：可视化世界地图
 * 基于 Canvas 渲染区域地图：地形着色、势力标识、城市标记、资源分布覆盖层
 */

import type { WorldRegion } from '@/mods/mod-base-universe'

// ============================================================
// 地图渲染配置
// ============================================================

/** 地形类型 → 显示颜色 */
export type TerrainColorMap = Record<string, string>

/** 地形 → 颜色默认映射 */
export const DEFAULT_TERRAIN_COLORS: TerrainColorMap = {
  plain: '#7ec87e',
  forest: '#2d7d2d',
  mountain: '#8b8b83',
  desert: '#e8d5a3',
  ocean: '#4a90d9',
  lake: '#5ba3d9',
  river: '#6bb3e0',
  swamp: '#5a7247',
  tundra: '#c8d8c8',
  volcanic: '#8b3a3a',
  ice: '#d8e8f0',
  plateau: '#a89868',
  valley: '#7ec87e',
  coast: '#8fc8d8',
  island: '#6da86d',
  underground: '#4a4a4a',
  celestial: '#d4c8e8',
  void: '#1a1a2e',
}

/** 地图渲染配置 */
export interface MapRenderConfig {
  /** 画布宽度 */
  canvasWidth: number
  /** 画布高度 */
  canvasHeight: number
  /** 缩放级别 (0.5 ~ 3.0) */
  zoom: number
  /** 平移偏移 X */
  offsetX: number
  /** 平移偏移 Y */
  offsetY: number
  /** 是否显示地形着色 */
  showTerrain: boolean
  /** 是否显示势力标识 */
  showFactions: boolean
  /** 是否显示资源覆盖 */
  showResources: boolean
  /** 是否显示人口密度 */
  showPopulation: boolean
}

/** 地图渲染用的区域数据 */
export interface RegionRenderData {
  region: WorldRegion
  /** 渲染中心 X（经过坐标变换） */
  renderX: number
  /** 渲染中心 Y（经过坐标变换） */
  renderY: number
  /** 六边形半径（像素） */
  tileRadius: number
  /** 地形颜色 */
  terrainColor: string
  /** 势力颜色 */
  factionColor: string | null
}

/** 标记层数据 */
export interface MarkerLayer {
  /** 标记类型 */
  type: 'city' | 'capital' | 'event' | 'resource' | 'player'
  /** 关联区域 ID */
  regionId: string
  /** 标记文本 */
  label: string
  /** 图标字符 */
  icon: string
  /** 自定义颜色 */
  color?: string
}

/** 势力颜色映射 */
export type FactionColorMap = Record<string, string>

/** 默认势力颜色池 */
export const FACTION_COLORS: string[] = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#2980b9', '#c0392b', '#27ae60',
  '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#2c3e50',
]

// ============================================================
// 地图 Store 状态
// ============================================================

/** 地图交互状态 */
export interface MapInteraction {
  /** 悬停区域 ID */
  hoveredRegionId: string | null
  /** 选中区域 ID */
  selectedRegionId: string | null
  /** 是否正在拖拽 */
  isDragging: boolean
  /** 拖拽起始 X */
  dragStartX: number
  /** 拖拽起始 Y */
  dragStartY: number
}
