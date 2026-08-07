/** Canvas renderer for the owner-produced map projection. */

import type { MapProjection } from '@/foundation'
import type { MapRenderConfig, NodeRenderData } from '../types'
import { DEFAULT_REGION_COLORS } from '../types'

const SQRT3 = Math.sqrt(3)

function resolveRegionColor(node: MapProjection['nodes'][number]): string {
  const profile = node.profile
  if (!profile) return DEFAULT_REGION_COLORS.unknown!
  const pollution = profile.pollution.toLowerCase()
  const climate = profile.climate.toLowerCase()
  if (!/(?:无|低|轻微|none|clean)/i.test(pollution)) return DEFAULT_REGION_COLORS.polluted!
  if (/(?:寒|冰|雪|cold|polar|tundra)/i.test(climate)) return DEFAULT_REGION_COLORS.cold!
  if (/(?:旱|沙|荒漠|arid|desert)/i.test(climate)) return DEFAULT_REGION_COLORS.arid!
  return DEFAULT_REGION_COLORS.temperate!
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function computeRenderData(
  projection: MapProjection,
  config: MapRenderConfig,
): NodeRenderData[] {
  if (projection.nodes.length === 0) return []
  const xs = projection.nodes.map((node) => node.x)
  const ys = projection.nodes.map((node) => node.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeX = Math.max(1, maxX - minX)
  const rangeY = Math.max(1, maxY - minY)
  const usableWidth = Math.max(120, config.canvasWidth - 160)
  const usableHeight = Math.max(120, config.canvasHeight - 140)
  const scale = Math.min(usableWidth / rangeX, usableHeight / rangeY) * 0.72 * config.zoom
  const radius = clamp(Math.min(42, scale * 0.26), 18, 42) * config.zoom
  const centerX = config.canvasWidth / 2 + config.offsetX
  const centerY = config.canvasHeight / 2 + config.offsetY
  const projectionCenterX = (minX + maxX) / 2
  const projectionCenterY = (minY + maxY) / 2

  return projection.nodes.map((node) => ({
    node,
    renderX: centerX + (node.x - projectionCenterX) * scale,
    renderY: centerY + (node.y - projectionCenterY) * scale,
    radius,
    regionColor: resolveRegionColor(node),
  }))
}

export function renderMap(
  ctx: CanvasRenderingContext2D,
  projection: MapProjection,
  renderData: NodeRenderData[],
  config: MapRenderConfig,
  hoveredId: string | null,
  selectedId: string | null,
): void {
  ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight)
  ctx.fillStyle = '#171918'
  ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight)
  drawGrid(ctx, config)
  drawEdges(ctx, projection, renderData)
  for (const data of renderData) drawNode(ctx, data, config, hoveredId, selectedId)
}

function drawGrid(ctx: CanvasRenderingContext2D, config: MapRenderConfig): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  const step = 40
  for (let x = ((config.offsetX % step) + step) % step; x < config.canvasWidth; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, config.canvasHeight)
    ctx.stroke()
  }
  for (let y = ((config.offsetY % step) + step) % step; y < config.canvasHeight; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(config.canvasWidth, y)
    ctx.stroke()
  }
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  projection: MapProjection,
  renderData: NodeRenderData[],
): void {
  const byId = new Map(renderData.map((item) => [item.node.nodeId, item]))
  for (const edge of projection.edges) {
    const from = byId.get(edge.fromNodeId)
    const to = byId.get(edge.toNodeId)
    if (!from || !to) continue
    ctx.beginPath()
    ctx.moveTo(from.renderX, from.renderY)
    ctx.lineTo(to.renderX, to.renderY)
    ctx.strokeStyle = edge.enabled
      ? (edge.crossContext ? 'rgba(219,170,78,0.65)' : 'rgba(220,225,221,0.22)')
      : 'rgba(220,225,221,0.08)'
    ctx.lineWidth = edge.crossContext ? 2 : 1
    ctx.setLineDash(edge.crossContext ? [6, 4] : [])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  data: NodeRenderData,
  config: MapRenderConfig,
  hoveredId: string | null,
  selectedId: string | null,
): void {
  const { node, renderX: x, renderY: y, radius } = data
  const points = hexagonPoints(x, y, radius)
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index]!.x, points[index]!.y)
  ctx.closePath()
  ctx.fillStyle = node.visibility === 'unknown'
    ? '#303331'
    : (config.showClimate ? data.regionColor : '#444946')
  ctx.globalAlpha = node.visibility === 'unknown' ? 0.55 : 0.92
  ctx.fill()
  ctx.globalAlpha = 1

  const selected = selectedId === node.nodeId
  const hovered = hoveredId === node.nodeId
  ctx.strokeStyle = node.isCurrentRegion
    ? '#f2bd55'
    : selected
      ? '#f0e5ca'
      : hovered
        ? '#ffffff'
        : 'rgba(255,255,255,0.28)'
  ctx.lineWidth = node.isCurrentRegion || selected ? 3 : hovered ? 2 : 1
  ctx.stroke()

  drawLabel(ctx, node.name, x, y, radius)
  if (config.showResources && (node.profile?.resources.length ?? 0) > 0) drawResourceIndicator(ctx, data)
  if (config.showPollution && node.profile?.pollution) drawPollutionIndicator(ctx, data)
}

function drawLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, radius: number): void {
  let fontSize = Math.min(13, radius * 0.34)
  const maxWidth = radius * 1.55
  do {
    ctx.font = `600 ${fontSize}px sans-serif`
    if (ctx.measureText(label).width <= maxWidth) break
    fontSize -= 0.5
  } while (fontSize > 6)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y, maxWidth)
}

function drawResourceIndicator(ctx: CanvasRenderingContext2D, data: NodeRenderData): void {
  ctx.beginPath()
  ctx.arc(data.renderX - data.radius * 0.48, data.renderY + data.radius * 0.48, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#61a878'
  ctx.fill()
}

function drawPollutionIndicator(ctx: CanvasRenderingContext2D, data: NodeRenderData): void {
  ctx.beginPath()
  ctx.arc(data.renderX + data.radius * 0.48, data.renderY - data.radius * 0.48, 4, 0, Math.PI * 2)
  ctx.fillStyle = DEFAULT_REGION_COLORS.polluted!
  ctx.fill()
}

function hexagonPoints(cx: number, cy: number, radius: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30)
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
}

export function hitTestNode(mx: number, my: number, data: NodeRenderData): boolean {
  const dx = Math.abs(mx - data.renderX)
  const dy = Math.abs(my - data.renderY)
  return dx <= SQRT3 * data.radius / 2
    && dy <= data.radius
    && SQRT3 * dx + dy <= SQRT3 * data.radius
}
