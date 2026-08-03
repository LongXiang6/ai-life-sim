/**
 * Purpose: Render mythic candidates, selection, sealing state, and generation feedback.
 * Owner: mod-pages/game-over
 * Responsibility: Mythic-result presentation only; generation and persistence remain in the page.
 */

import styles from './GameOver.module.css'

interface MythicView { name: string; concept: string; effect: string }

interface GameOverMythicSectionProps {
  activeCandidate?: MythicView
  candidates: MythicView[]
  effectiveIndex: number
  error: string
  generating: boolean
  overallScore: number
  sealedOutsideCandidates: boolean
  sealedPattern?: MythicView | null
  sealedPatternId: string | null
  strengthLabel: string
  onGenerate: () => void
  onSeal: () => void
  onSelect: (index: number) => void
}

export function GameOverMythicSection(props: GameOverMythicSectionProps) {
  const { activeCandidate, candidates, sealedPattern } = props
  return (
    <section className={`${styles.section} ${styles.mythicSection}`} aria-labelledby="mythic-title">
      <div className={styles.sectionHeading}>
        <div><span className={styles.sectionIndex}>04</span><h2 id="mythic-title">轮回天赋</h2></div>
        <span className={styles.mythicBadge}>{props.overallScore} 分 · {props.strengthLabel}</span>
      </div>
      <p className={styles.mythicIntro}>系统先按完整人生评分，再由 AI 凝结三项匹配强度的跨世界概念规则。选择一项封存，供后来的人生携带。</p>
      {candidates.length === 3 ? (
        <>
          <div className={styles.mythicSelectors} role="list" aria-label="轮回天赋候选">
            {candidates.map((candidate, index) => (
              <button
                type="button"
                key={`${candidate.name}-${candidate.concept}`}
                className={`${styles.mythicSelector} ${!props.sealedOutsideCandidates && props.effectiveIndex === index ? styles.mythicSelectorActive : ''}`}
                aria-pressed={!props.sealedOutsideCandidates && props.effectiveIndex === index}
                onClick={() => { if (!props.sealedPatternId) props.onSelect(index) }}
                disabled={Boolean(props.sealedOutsideCandidates || (props.sealedPatternId && props.effectiveIndex !== index))}
              >
                <span aria-hidden="true">{candidate.concept.slice(0, 1)}</span><strong>{candidate.name}</strong>
              </button>
            ))}
          </div>
          {activeCandidate ? (
            <div className={styles.mythicFocus} aria-live="polite">
              <span className={styles.mythicGlyph} aria-hidden="true">{activeCandidate.concept.slice(0, 1)}</span>
              <div><small>{activeCandidate.concept} · 纯概念</small><h3>{activeCandidate.name}</h3><p>{activeCandidate.effect}</p></div>
            </div>
          ) : null}
          <div className={styles.mythicCurrent}><span>{sealedPattern ? '已封存' : '当前选择'}</span><strong>{sealedPattern?.name ?? activeCandidate?.name ?? '尚未选择'}</strong></div>
          <button type="button" className={styles.mythicStore} onClick={props.onSeal} disabled={!activeCandidate || Boolean(props.sealedPatternId)}>
            <span>{sealedPattern ? '已封存至轮回天赋库' : '封存至轮回天赋库'}</span>
            <small>{sealedPattern ? '下一局可在独立轮回槽携带' : '封存后不可在本局改选'}</small>
          </button>
        </>
      ) : (
        <div className={styles.mythicLoadingCard} aria-live="polite">
          <span className={styles.mythicLoadingGlyph} aria-hidden="true">转</span>
          <div><h3>{props.generating ? '正在凝结轮回天赋' : '尚未生成轮回天赋'}</h3><p>{props.generating ? '正在读取整局摘要与关键人生记录，请稍候。' : '生成失败时不会使用本地词条冒充 AI 结果。'}</p></div>
        </div>
      )}
      {props.error ? <p className={styles.mythicError} role="alert">{props.error}</p> : null}
      {candidates.length !== 3 && !props.generating ? <button type="button" className={styles.mythicRetry} onClick={props.onGenerate}>重新生成三项轮回天赋</button> : null}
    </section>
  )
}
