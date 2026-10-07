/**
 * Purpose: Render the seal ritual while destiny patterns are idle, generating, or ready.
 * Owner: mod-pages/talent-draw
 * Responsibility: Draw-stage presentation only.
 */

import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_RARITY_CONFIG,
} from '@/mods/mod-character'
import { cn } from '@/foundation/utils'

import type { TalentDrawPhase, TalentDrawSlots } from './talent-draw.types'
import styles from './TalentDraw.module.css'

interface TalentDrawStageProps {
  busyDrawing: boolean
  completionReplay: boolean
  errorMsg: string
  generationMessage: string
  phase: TalentDrawPhase
  slots: TalentDrawSlots
  visibleRevealCount: number
}

export function TalentDrawStage({
  busyDrawing,
  completionReplay,
  errorMsg,
  generationMessage,
  phase,
  slots,
  visibleRevealCount,
}: TalentDrawStageProps) {
  return (
    <section
      className={cn(
        styles.drawStage,
        busyDrawing && styles.drawStageDrawing,
        phase === 'ready' && !completionReplay && styles.drawStageComplete,
      )}
      aria-busy={busyDrawing}
    >
      <div className={styles.aura} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <i
            key={index}
            className={styles.wave}
            style={{ animationDelay: `${index * (phase === 'ready' && !completionReplay ? 1.4 : 0.8)}s` }}
          />
        ))}
        <div className={styles.sun}>
          <i className={styles.layerFive} />
          <i className={styles.layerFour} />
          <i className={styles.layerThree} />
          <i className={styles.layerTwo} />
          <i className={styles.layerOne} />
          <b>命</b>
        </div>
      </div>
      <div className={styles.ritualCopy}>
        <strong>{phase === 'idle' ? '让命运揭示你的命格' : busyDrawing ? '五类命格正在归位' : '五类首批命印已归位'}</strong>
        <p>{phase === 'idle'
          ? '准备就绪后开始抽取，根基、专精、特质、规则、机缘五类命格会依次归位。'
          : busyDrawing ? generationMessage : '五类首批命印已全部归位。'}</p>
      </div>
      <div className={styles.sealWrap}>
        <div className={styles.sealHead}>
          <span>五类首批命印</span>
          <span>{visibleRevealCount} / {DESTINY_PATTERN_DISPLAY_COUNT}</span>
        </div>
        <div className={styles.seals} aria-label="五类首批命印">
          {slots.map((pattern, index) => (
            <span
              key={pattern?.id ?? `seal-${index}`}
              className={cn(styles.seal, pattern && visibleRevealCount > index && styles.sealLit)}
              data-rarity={pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : undefined}
            >
              <i>{String(index + 1).padStart(2, '0')}</i>
              <b>{pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : '待定'}</b>
            </span>
          ))}
        </div>
      </div>
      {errorMsg ? <p className={styles.validationMsg} role="alert">{errorMsg}</p> : null}
    </section>
  )
}
