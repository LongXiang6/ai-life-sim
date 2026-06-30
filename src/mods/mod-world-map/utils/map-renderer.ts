/**
 * @module map-renderer.ts
 * @description 地图渲染工具 —— 坐标映射、地形着色、六边形绘制
 * @mod mod-world-map
 *
 * 六边形布局：使用 offset-odd 坐标系（奇数列向下偏移半格）
 *
 * 坐标映射公式（六边形网格）：
 *   screenX = (col * tileWidth) + (row % 2 === 1 ? tileWidth/2 : 0)
 *   screenY = row * tileHeight * 0.75
 *
 * tileWidth  = sqrt(3) * radius
 * tileHeight = 2 * radius
 */

import type { WorldRegion } from '@/mods/mod-base-universe'
import type {
  MapRenderConfig,
  RegionRenderData,
  FactionColorMap,
  MarkerLayer,
} from '../types'
import { DEFAULT_TERRAIN_COLORS, FACTION_COLORS } from '../types'

/** √3 值，用于六边形宽度计算 */
const SQRT3 = Math.sqrt(3)

/**
 * 将区域数据转换为渲染数据
 * @param regions 世界区域数组
 * @param config 地图渲染配置
 * @param factionColors 势力颜色映射
 * @returns 区域渲染数据数组
 */
export function computeRenderData(
  regions: WorldRegion[],
  config: MapRenderConfig,
  factionColors: FactionColorMap,
): RegionRenderData[] {
  const { zoom, offsetX, offsetY } = config
  const tileRadius = 40 * zoom
  const tileWidth = SQRT3 * tileRadius
  const tileHeight = 2 * tileRadius

  // 计算画布中心
  const cx = config.canvasWidth / 2
  const cy = config.canvasHeight / 2

  // 计算坐标范围
  const coords = regions.map((r) => r.coordinates)
  const minX = Math.min(...coords.map((c) => c.x))
  const maxX = Math.max(...coords.map((c) => c.x))
  const minY = Math.min(...coords.map((c) => c.y))
  const maxY = Math.max(...coords.map((c) => c.y))
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  // 计算缩放后的布局密度
  const rawStepX = tileWidth * 0.85
  const rawStepY = tileHeight * 0.75 * 0.85

  return regions.map((region) => {
    const { x, y } = region.coordinates

    // 归一化到 [0, 1]
    const nx = rangeX > 0 ? (x - minX) / rangeX : 0.5
    const ny = rangeY > 0 ? (y - minY) / rangeY : 0.5

    // 转换到六边形网格坐标
    const gridCol = nx * 8  // 最多 8 列
    const gridRow = ny * 8   // 最多 8 行

    // offset-odd: 奇数列偏移
    const isOddCol = Math.round(gridCol) % 2 === 1
    const screenX = cx + (gridCol * rawStepX - 4 * rawStepX) * zoom + offsetX
    const screenY = cy + (gridRow * rawStepY - 4 * rawStepY) * zoom + offsetY + (isOddCol ? rawStepY / 2 * zoom : 0)

    return {
      region,
      renderX: screenX,
      renderY: screenY,
      tileRadius,
      terrainColor: DEFAULT_TERRAIN_COLORS[region.terrain] ?? '#888888',
      factionColor: region.ownerFaction ? (factionColors[region.ownerFaction] ?? null) : null,
    }
  })
}

/**
 * 渲染整个地图到 Canvas
 * @param ctx Canvas 2D 渲染上下文
 * @param renderData 区域渲染数据
 * @param config 地图渲染配置
 * @param markers 标记层数组
 * @param hoveredId 悬停中的区域 ID
 * @param selectedId 选中的区域 ID
 */
export function renderMap(
  ctx: CanvasRenderingContext2D,
  renderData: RegionRenderData[],
  config: MapRenderConfig,
  markers: MarkerLayer[],
  hoveredId: string | null,
  selectedId: string | null,
): void {
  const cw = config.canvasWidth
  const ch = config.canvasHeight

  // 清空画布
  ctx.clearRect(0, 0, cw, ch)

  // 背景
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, cw, ch)

  // 网格线（淡色）
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  for (let x = 0; x < cw; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, ch)
    ctx.stroke()
  }
  for (let y = 0; y < ch; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(cw, y)
    ctx.stroke()
  }

  // 绘制区域连接线
  drawRegionConnections(ctx, renderData)

  // 绘制六边形地块
  for (const rd of renderData) {
    drawHexTile(ctx, rd, config, hoveredId, selectedId)
  }

  // 绘制标记
  for (const rd of renderData) {
    const tileMarkers = markers.filter((m) => m.regionId === rd.region.id)
    for (const marker of tileMarkers) {
      drawMarker(ctx, rd, marker)
    }
  }
}

/**
 * 绘制六边形地块
 */
function drawHexTile(
  ctx: CanvasRenderingContext2D,
  rd: RegionRenderData,
  config: MapRenderConfig,
  hoveredId: string | null,
  selectedId: string | null,
): void {
  const { renderX: cx, renderY: cy, tileRadius: r, terrainColor, factionColor } = rd
  const isHovered = hoveredId === rd.region.id
  const isSelected = selectedId === rd.region.id

  // 计算六边形顶点
  const points = hexagonPoints(cx, cy, r)

  // 填充地形颜色
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y)
  }
  ctx.closePath()

  if (config.showTerrain) {
    ctx.fillStyle = terrainColor
  } else {
    ctx.fillStyle = '#3a3a5a'
  }
  ctx.fill()

  // 势力边框
  if (config.showFactions && factionColor) {
    ctx.strokeStyle = factionColor
    ctx.lineWidth = isSelected ? 3 : 2
    ctx.stroke()
  } else {
    ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.2)'
    ctx.lineWidth = isHovered || isSelected ? 2 : 1
    ctx.stroke()
  }

  // 选中高亮
  if (isSelected) {
    ctx.beginPath()
    ctx.moveTo(points[0]!.x, points[0]!.y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y)
    }
    ctx.closePath()
    ctx.strokeStyle = '#f1c40f'
    ctx.lineWidth = 2.5
    ctx.setLineDash([4, 2])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 区域名称
  ctx.fillStyle = '#ffffff'
  ctx.font = `${Math.max(9, r * 0.35)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 截断长名称
  const name = rd.region.name.length > 4
    ? rd.region.name.slice(0, 4) + '..'
    : rd.region.name

  ctx.fillText(name, cx, cy)

  // 人口密度指示（底部小点）
  if (config.showPopulation && rd.region.population > 0) {
    const populationSize = clamp(Math.log10(rd.region.population + 1) * 2, 2, 8)
    ctx.beginPath()
    ctx.arc(cx, cy + r * 0.55, populationSize, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fill()
  }
}

/**
 * 绘制区域之间的连接线
 */
function drawRegionConnections(
  ctx: CanvasRenderingContext2D,
  renderData: RegionRenderData[],
): void {
  const drawn = new Set<string>()

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1

  for (const rd of renderData) {
    for (const neighborId of rd.region.neighbors) {
      const key = [rd.region.id, neighborId].sort().join('-')
      if (drawn.has(key)) continue
      drawn.add(key)

      const neighbor = renderData.find((n) => n.region.id === neighborId)
      if (!neighbor) continue

      ctx.beginPath()
      ctx.moveTo(rd.renderX, rd.renderY)
      ctx.lineTo(neighbor.renderX, neighbor.renderY)
      ctx.stroke()
    }
  }
}

/**
 * 绘制标记图标
 */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  rd: RegionRenderData,
  marker: MarkerLayer,
): void {
  const { renderX: cx, renderY: cy, tileRadius: r } = rd
  const offsetY = -r * 0.3  // 标记放在地块上方

  // 图标背景
  const markerSize = r * 0.4
  ctx.beginPath()
  ctx.arc(cx, cy + offsetY - markerSize * 0.3, markerSize * 0.9, 0, Math.PI * 2)

  switch (marker.type) {
    case 'player':
      ctx.fillStyle = '#f1c40f'
      break
    case 'capital':
      ctx.fillStyle = '#e74c3c'
      break
    case 'city':
      ctx.fillStyle = '#3498db'
      break
    case 'event':
      ctx.fillStyle = '#e67e22'
      break
    case 'resource':
      ctx.fillStyle = '#2ecc71'
      break
  }
  ctx.fill()

  // 图标文字
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${markerSize * 0.9}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(marker.icon, cx, cy + offsetY - markerSize * 0.3)
}

/**
 * 计算六边形顶点坐标
 */
function hexagonPoints(cx: number, cy: number, r: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)  // 尖顶朝上
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    })
  }
  return points
}

/**
 * 检测鼠标点击是否在六边形内
 * @param mx 鼠标 X 坐标
 * @param my 鼠标 Y 坐标
 * @param rd 区域渲染数据
 * @returns 是否命中六边形
 */
export function hitTestHex(
  mx: number,
  my: number,
  rd: RegionRenderData,
): boolean {
  const { renderX: cx, renderY: cy, tileRadius: r } = rd
  const points = hexagonPoints(cx, cy, r)
  return pointInPolygon(mx, my, points)
}

/**
 * 点是否在多边形内（射线法）
 */
function pointInPolygon(
  px: number,
  py: number,
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y

    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * 构建势力颜色映射
 * @param factions 势力名称数组
 * @returns 势力 → 颜色映射
 */
export function buildFactionColors(factions: string[]): FactionColorMap {
  const map: FactionColorMap = {}
  factions.forEach((f, i) => {
    map[f] = FACTION_COLORS[i % FACTION_COLORS.length]!
  })
  return map
}

/** 钳制数值 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
