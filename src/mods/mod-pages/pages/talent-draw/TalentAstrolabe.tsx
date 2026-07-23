'use client'

import type { CSSProperties } from 'react'

import type { DestinyPattern } from '@/mods/mod-character'

import styles from './TalentDraw.module.css'

type TalentPhase = 'idle' | 'generating' | 'ready' | 'selecting'

interface TalentAstrolabeProps {
  patterns: (DestinyPattern | null)[]
  activeIndex: number
  phase: TalentPhase
  selectedIndices: number[]
  rotationSteps: number
  waveRevision: number
  onFocus: (index: number) => void
  onTurn: () => void
}

const RIPPLE_DELAYS = ['.68s', '1.085s', '2.3s', '2.705s']
const NODE_RADIUS = 112

function nodePosition(index: number, count: number): CSSProperties {
  const angle = (-90 + index * 360 / count) * Math.PI / 180

  return {
    '--spacing-node-x': `${Math.cos(angle) * NODE_RADIUS}px`,
    '--spacing-node-y': `${Math.sin(angle) * NODE_RADIUS}px`,
  } as CSSProperties
}

export function TalentAstrolabe({
  patterns,
  activeIndex,
  phase,
  selectedIndices,
  rotationSteps,
  waveRevision,
  onFocus,
  onTurn,
}: TalentAstrolabeProps) {
  const interactive = phase === 'selecting'
  const canTurn = (phase === 'ready' || interactive) && patterns.filter(Boolean).length > 1
  const turnAngle = rotationSteps * (360 / patterns.length)

  return (
    <div className={styles.astrolabe} aria-label="十二位命格星盘">
      <div className={styles.aura} aria-hidden="true" />
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.orbitInner} aria-hidden="true" />
      <div className={styles.starField} aria-hidden="true" />
      <div className={styles.waterRipples} aria-hidden="true">
        {RIPPLE_DELAYS.map((delay) => (
          <i key={delay} style={{ '--duration-ripple-delay': delay } as CSSProperties} />
        ))}
      </div>
      {waveRevision > 0 ? (
        <div key={`${waveRevision}-${patterns.filter(Boolean).length}`} className={styles.eventRipples} aria-hidden="true">
          <i className={styles.eventRippleMain} />
        </div>
      ) : null}
      <div className={styles.zenith} aria-hidden="true" />
      <div
        className={styles.nodeOrbit}
        style={{ transform: `rotate(${turnAngle}deg)` }}
      >
        {patterns.map((pattern, index) => {
          const revealed = Boolean(pattern)
          const focused = revealed && (phase === 'ready' || interactive) && index === activeIndex
          const selected = selectedIndices.includes(index)

          return (
            <button
              key={pattern?.id ?? `fate-node-${index}`}
              type="button"
              className={[
                styles.fateNode,
                revealed ? styles.fateNodeRevealed : '',
                focused ? styles.fateNodeFocused : '',
                selected ? styles.fateNodeSelected : '',
              ].filter(Boolean).join(' ')}
              style={nodePosition(index, patterns.length)}
              data-rarity={pattern?.rarity}
              aria-label={pattern ? `查看命格：${pattern.name}${selected ? '，已选择' : ''}` : `尚未显现的星位 ${index + 1}`}
              aria-hidden={!revealed}
              disabled={!interactive || !revealed}
              onClick={() => onFocus(index)}
            >
              <span style={{ transform: `rotate(${-turnAngle}deg)` }}>{pattern?.name ?? ''}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className={styles.astrolabeCore}
        onClick={onTurn}
        disabled={!canTurn}
        aria-label="转动命格星盘"
        title="转动命格星盘"
      >
        <span aria-hidden="true">命</span>
      </button>
    </div>
  )
}
