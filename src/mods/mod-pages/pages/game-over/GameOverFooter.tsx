/**
 * Purpose: Render game-over navigation, data view, and guarded new-life controls.
 * Owner: mod-pages/game-over
 * Responsibility: Footer presentation and command forwarding only.
 */

import styles from './GameOver.module.css'

interface GameOverFooterProps {
  confirmingNewLife: boolean
  preGenerationActive: boolean
  sealedMythicPatternId: string | null
  startingNewLife: boolean
  onBack: () => void
  onStartNewLife: () => void
  onViewSimulationData: () => void
}

export function GameOverFooter(props: GameOverFooterProps) {
  return (
    <footer className={styles.footer} aria-live="polite" data-flow-bottom-bar>
      <div className={styles.footerBar}>
        <button type="button" className={styles.barTool} onClick={props.onBack} aria-label={props.confirmingNewLife ? '取消开启新人生' : '返回首页'} title={props.confirmingNewLife ? '取消开启新人生' : '返回首页'}>
          {props.confirmingNewLife ? <span aria-hidden="true">×</span> : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7" /><path d="M6 10v10h12V10M10 20v-6h4v6" /></svg>
          )}
        </button>
        <button type="button" className={styles.barTool} onClick={props.onViewSimulationData} aria-label="查看模拟数据" title="查看模拟数据">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></svg>
        </button>
        <button type="button" className={`${styles.newLifeButton} ${props.confirmingNewLife ? styles.newLifeButtonConfirm : ''}`} disabled={props.preGenerationActive || props.startingNewLife || !props.sealedMythicPatternId} onClick={props.onStartNewLife} aria-describedby={props.confirmingNewLife ? 'new-life-confirmation-copy' : undefined}>
          <span className={styles.newLifeMark}>{props.confirmingNewLife ? '警' : '新'}</span>
          <span className={styles.newLifeCopy}>
            <strong>{props.confirmingNewLife ? '确认开启新人生' : '开始新人生'}</strong>
            <small id={props.confirmingNewLife ? 'new-life-confirmation-copy' : undefined}>
              {props.preGenerationActive
                ? '正在收束后台故事状态，请稍候'
                : props.startingNewLife
                  ? '正在清理当前人生并返回世界选择'
                  : !props.sealedMythicPatternId
                    ? '先封存一项轮回天赋'
                    : props.confirmingNewLife
                      ? '将清理当前人生状态，此操作不可撤销'
                      : '完成回望 · 重新选择世界'}
            </small>
          </span>
          <span className={styles.newLifeArrow} aria-hidden="true">{props.confirmingNewLife ? '✓' : '→'}</span>
        </button>
      </div>
    </footer>
  )
}
