'use client'

/**
 * @module RadarChart.tsx
 * @description 多维评分雷达图分子组件 —— 根据输入维度绘制等边雷达图
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：维度标签清晰可读，数值标注准确
 *   - Depth：多层同心多边形营造空间感
 *
 * 来源：废弃项目 pages/game-over/game-over-radar.tsx
 */

export interface RadarDimension {
  /** 维度标签 */
  label: string
  /** 维度值 0-100 */
  value: number
  /** 维度评语（可选） */
  comment?: string
}

export interface RadarChartProps {
  /** 多维数据 */
  dimensions: RadarDimension[]
  /** 图表尺寸（默认 280） */
  size?: number
  /** 中心点文字（可选） */
  centerLabel?: string
  /** 自定义类名 */
  className?: string
}

/** 默认四维（心智/体魄/魅力/财富） */
export const DEFAULT_DIMENSIONS: RadarDimension[] = [
  { label: '心智', value: 50 },
  { label: '体魄', value: 50 },
  { label: '魅力', value: 50 },
  { label: '财富', value: 50 },
]

export function RadarChart({
  dimensions,
  size = 280,
  centerLabel,
  className = '',
}: RadarChartProps) {
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.35
  const labelRadius = size * 0.44
  const numAxes = dimensions.length
  const angleStep = (2 * Math.PI) / numAxes

  // 从顶部开始（-90度）
  const startAngle = -Math.PI / 2

  /** 计算某维度在某个值（0-100）处的坐标 */
  const pointAt = (axisIndex: number, value: number): { x: number; y: number } => {
    const angle = startAngle + axisIndex * angleStep
    const r = (value / 100) * radius
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    }
  }

  /** 计算标签坐标 */
  const labelAt = (axisIndex: number): { x: number; y: number } => {
    const angle = startAngle + axisIndex * angleStep
    return {
      x: cx + labelRadius * Math.cos(angle),
      y: cy + labelRadius * Math.sin(angle),
    }
  }

  // 5 层同心多边形（20/40/60/80/100%）
  const gridLevels = [20, 40, 60, 80, 100]

  // 数据多边形顶点
  const dataPoints = dimensions.map((d, i) => pointAt(i, d.value))
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* 网格层（同心多边形） */}
        {gridLevels.map((level) => {
          const points = Array.from({ length: numAxes }, (_, i) => {
            const p = pointAt(i, level)
            return `${p.x},${p.y}`
          }).join(' ')
          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={level === 100 ? 1.5 : 0.5}
              opacity={0.6}
            />
          )
        })}

        {/* 轴线 */}
        {dimensions.map((_, i) => {
          const p = pointAt(i, 100)
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-border)"
              strokeWidth={0.5}
              opacity={0.4}
            />
          )
        })}

        {/* 数据多边形 */}
        <polygon
          points={dataPolygon}
          fill="var(--color-primary)"
          fillOpacity={0.15}
          stroke="var(--color-primary)"
          strokeWidth={2}
        />

        {/* 数据点 */}
        {dataPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="var(--color-primary)"
            stroke="var(--color-bg-primary)"
            strokeWidth={2}
          />
        ))}

        {/* 维度标签 */}
        {dimensions.map((d, i) => {
          const pos = labelAt(i)
          return (
            <text
              key={i}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-xs font-medium"
              fill="var(--color-text-primary)"
              fontSize={12}
            >
              {d.label}
            </text>
          )
        })}

        {/* 数值标注 */}
        {dimensions.map((d, i) => {
          const p = pointAt(i, d.value)
          const labelPos = labelAt(i)
          // 数值放在标签外侧
          const offsetX = (labelPos.x - cx) * 0.15
          const offsetY = (labelPos.y - cy) * 0.15
          return (
            <text
              key={`val-${i}`}
              x={p.x + offsetX}
              y={p.y + offsetY - 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-text-tertiary)"
              fontSize={10}
            >
              {d.value}
            </text>
          )
        })}

        {/* 中心文字 */}
        {centerLabel && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-text-tertiary)"
            fontSize={11}
          >
            {centerLabel}
          </text>
        )}
      </svg>

      {/* 维度评语列表 */}
      {dimensions.some((d) => d.comment) && (
        <div className="mt-4 w-full max-w-xs space-y-1">
          {dimensions.map((d, i) => (
            d.comment && (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-secondary)]">{d.label}</span>
                <span className="text-[var(--color-text-tertiary)]">{d.comment}</span>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
