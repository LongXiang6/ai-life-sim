/**
 * Purpose: Render and select the five AI-generated settlement dimensions.
 * Owner: mod-pages/game-over
 * Responsibility: Radar geometry and interaction only.
 */

'use client'

import type { CSSProperties } from 'react'

import type { RadarDimension } from '@/mods/mod-ui'

import styles from './GameOver.module.css'

interface GameOverRadarProps {
  dimensions: RadarDimension[]
  activeIndex: number
  overallScore: number
  onSelect: (index: number) => void
}

const WIDTH = 252
const HEIGHT = 183
const CENTER_X = 126
const CENTER_Y = 90
const HORIZONTAL_RADIUS = 58
const VERTICAL_RADIUS = 60
const LABEL_HORIZONTAL_RADIUS = 102
const LABEL_VERTICAL_RADIUS = 76
const GRID_LEVELS = [100, 75, 50]

export const GAME_OVER_DIMENSION_ICONS: Record<string, string> = {
  体魄: '💪',
  心智: '🧠',
  魅力: '💫',
  财富: '🏠',
}

function pointAt(axisIndex: number, axisCount: number, value: number) {
  const angle = -Math.PI / 2 + axisIndex * ((2 * Math.PI) / axisCount)
  const ratio = value / 100
  return {
    x: CENTER_X + Math.cos(angle) * HORIZONTAL_RADIUS * ratio,
    y: CENTER_Y + Math.sin(angle) * VERTICAL_RADIUS * ratio,
  }
}

function labelStyle(axisIndex: number, axisCount: number): CSSProperties {
  const angle = -Math.PI / 2 + axisIndex * ((2 * Math.PI) / axisCount)
  const x = CENTER_X + Math.cos(angle) * LABEL_HORIZONTAL_RADIUS
  const y = CENTER_Y + Math.sin(angle) * LABEL_VERTICAL_RADIUS
  return {
    left: `${x / WIDTH * 100}%`,
    top: `${y / HEIGHT * 100}%`,
  }
}

export function GameOverRadar({
  dimensions,
  activeIndex,
  overallScore,
  onSelect,
}: GameOverRadarProps) {
  const axisCount = dimensions.length
  const axisPoints = dimensions.map((_, index) => pointAt(index, axisCount, 100))
  const dataPoints = dimensions.map((dimension, index) => pointAt(index, axisCount, dimension.value))
  const dataPolygon = dataPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const chartLabel = `AI 五维评鉴：${dimensions.map((dimension) => `${dimension.label}${dimension.value}`).join('、')}，人生评分${overallScore}`

  return (
    <div className={styles.radarGraph}>
      <svg
        className={styles.radarChart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={chartLabel}
      >
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            className={styles.radarGrid}
            points={dimensions
              .map((_, index) => pointAt(index, axisCount, level))
              .map((point) => `${point.x},${point.y}`)
              .join(' ')}
          />
        ))}
        {axisPoints.map((point, index) => (
          <line
            key={dimensions[index]?.label ?? index}
            className={styles.radarAxis}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={point.x}
            y2={point.y}
          />
        ))}
        <polygon className={styles.radarArea} points={dataPolygon} />
        {dataPoints.map((point, index) => (
          <circle
            key={dimensions[index]?.label ?? index}
            className={`${styles.radarDot} ${activeIndex === index ? styles.radarDotActive : ''}`}
            cx={point.x}
            cy={point.y}
            r={activeIndex === index ? 4.4 : 3}
          />
        ))}
        <text className={styles.radarScoreText} x={CENTER_X} y={CENTER_Y - 2}>{overallScore}</text>
        <text className={styles.radarScoreLabel} x={CENTER_X} y={CENTER_Y + 9}>人生评分</text>
      </svg>

      {dimensions.map((dimension, index) => (
        <button
          key={dimension.label}
          type="button"
          className={`${styles.metricButton} ${activeIndex === index ? styles.metricButtonActive : ''}`}
          style={labelStyle(index, axisCount)}
          aria-pressed={activeIndex === index}
          aria-label={`${dimension.label} ${dimension.value}，${dimension.comment ?? '查看评语'}`}
          onClick={() => onSelect(index)}
        >
          <span><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{GAME_OVER_DIMENSION_ICONS[dimension.label] ?? '◇'}</span>{dimension.label}</span>
          <strong>{dimension.value}</strong>
        </button>
      ))}
    </div>
  )
}
