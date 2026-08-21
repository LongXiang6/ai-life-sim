/**
 * Purpose: Render the game-over share-card preview and share/save commands.
 * Owner: mod-pages/game-over
 * Responsibility: Share presentation only; image generation and command state remain outside.
 */

import type { GameOverShareFact } from './game-over-share-card'
import styles from './GameOver.module.css'

interface ReincarnationView { name: string; description: string; effect: string }

interface GameOverShareSectionProps {
  activeReincarnation?: ReincarnationView
  ageLabel: string
  busy: 'share' | 'save' | null
  characterName: string
  facts: GameOverShareFact[]
  overallScore: number
  rounds: number
  roundLabel: string
  status: string
  worldName: string
  onSave: () => void
  onShare: () => void
  onViewSimulationData: () => void
}

export function GameOverShareSection(props: GameOverShareSectionProps) {
  return (
    <section className={styles.shareSection} aria-labelledby="share-title">
      <p className={styles.ritualDivider} aria-hidden="true">✦</p>
      <h2 id="share-title" className={styles.blockTitle}>留下此生</h2>
      <p className={styles.shareIntro}>把这一生的年岁、轮数、大事、五维与轮回天赋生成分享卡。图片只在当前设备绘制，不上传故事正文或模型配置。</p>
      <div className={styles.sharePreview} aria-label="人生分享卡预览">
        <div className={styles.sharePreviewMeta}><span>AI LIFE SIM · 人生档案</span><span>终章 · {props.roundLabel}</span></div>
        <div className={styles.sharePreviewHero}>
          <div><small>{props.worldName}</small><h3>{props.characterName || '无名之辈'}</h3><p>{props.ageLabel} · {props.rounds} 轮世事</p></div>
          <div className={styles.sharePreviewScore}><strong>{props.overallScore}</strong><span>人生评分</span></div>
        </div>
        <div className={styles.shareFactGrid}>
          {props.facts.map((fact) => <div key={fact.label} className={styles.shareFact}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}
        </div>
        <div className={styles.sharePreviewMythic}>
          <span>{props.activeReincarnation ? `${props.activeReincarnation.description} · 轮回天赋` : '人生回声'}</span>
          <strong>{props.activeReincarnation?.name ?? '此生已经留下回声'}</strong>
          <p>{props.activeReincarnation?.effect ?? '轮回天赋尚未凝结时，分享卡仍会忠实记录当前结算事实。'}</p>
        </div>
      </div>
      <div className={styles.shareActions}>
        <button type="button" className={styles.sharePrimary} onClick={props.onShare} disabled={props.busy !== null} aria-busy={props.busy === 'share'}>
          <span>{props.busy === 'share' ? '正在生成分享卡' : '一键分享人生卡'}</span><small>支持时唤起系统分享，否则自动保存 PNG</small>
        </button>
        <button type="button" className={styles.shareSecondary} onClick={props.onSave} disabled={props.busy !== null} aria-busy={props.busy === 'save'}>{props.busy === 'save' ? '生成中…' : '保存 PNG'}</button>
        <button type="button" className={styles.shareSecondary} onClick={props.onViewSimulationData}>查看模拟数据</button>
      </div>
      <p className={styles.shareStatus} role="status" aria-live="polite">{props.status || '分享卡内容会随当前轮回天赋选择即时更新。'}</p>
    </section>
  )
}
