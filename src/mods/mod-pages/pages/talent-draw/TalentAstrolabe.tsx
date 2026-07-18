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
  waveRevision: number
  onFocus: (index: number) => void
}

const RIPPLE_DELAYS = ['.68s', '1.085s', '2.3s', '2.705s']
const NODE_RADIUS = 112

function nodePosition(index: number, activeIndex: number, count: number): CSSProperties {
  const position = (index - activeIndex + count) % count
  const angle = (-90 + position * 360 / count) * Math.PI / 180

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
  waveRevision,
  onFocus,
}: TalentAstrolabeProps) {
  const interactive = phase === 'selecting'

  return (
    <div className={styles.astrolabe} aria-label="五星位命格星盘">
      <div className={styles.aura} aria-hidden="true" />
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.orbitInner} aria-hidden="true" />
      <div className={styles.starField} aria-hidden="true" />
      <div className={styles.waterRipples} aria-hidden="true">
        {RIPPLE_DELAYS.map((delay) => (
          <i key={delay} style={{ '--duration-ripple-delay': delay } as CSSProperties} />
        ))}
      </div>
      <div key={`${waveRevision}-${patterns.filter(Boolean).length}`} className={styles.eventRipples} aria-hidden="true">
        <i className={styles.eventRippleMain} />
        <i className={styles.eventRippleTail} />
      </div>
      <div className={styles.zenith} aria-hidden="true" />
      <div className={styles.nodeOrbit}>
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
              style={nodePosition(index, activeIndex, patterns.length)}
              data-rarity={pattern?.rarity}
              aria-label={pattern ? `查看命格：${pattern.name}${selected ? '，已选择' : ''}` : `尚未显现的星位 ${index + 1}`}
              aria-hidden={!revealed}
              disabled={!interactive || !revealed}
              onClick={() => onFocus(index)}
            >
              <span>{pattern?.name ?? ''}</span>
            </button>
          )
        })}
      </div>
      <div className={styles.astrolabeCore} aria-hidden="true"><span>命</span></div>
    </div>
  )
}
