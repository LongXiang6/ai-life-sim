/**
 * Purpose: Render the finalized game-over navigation and guarded new-life controls.
 * Owner: mod-pages/game-over
 * Responsibility: Footer presentation and command forwarding only.
 */

import styles from './GameOver.module.css'

interface GameOverFooterProps {
  confirmingNewLife: boolean
  settlementReady: boolean
  startingNewLife: boolean
  onBack: () => void
  onStartNewLife: () => void
}

export function GameOverFooter(props: GameOverFooterProps) {
  const disabled = props.startingNewLife
    || !props.settlementReady
  const description = props.startingNewLife
      ? '正在清理当前人生并返回世界选择'
      : !props.settlementReady
        ? '正在完成人生结算'
        : props.confirmingNewLife
          ? '将清理当前人生状态，此操作不可撤销'
          : '完成回望 · 重新选择世界'

  return (
    <footer className={styles.bottomBar} aria-live="polite" data-flow-bottom-bar>
      <button type="button" className={styles.backButton} onClick={props.onBack} title={props.confirmingNewLife ? '取消开启新人生' : '返回首页'}>
        <strong>{props.confirmingNewLife ? '取消' : '返回首页'}</strong>
        <small>{props.confirmingNewLife ? '继续保留这一生' : '退出人生结算'}</small>
      </button>
      <button type="button" className={styles.confirmButton} disabled={disabled} onClick={props.onStartNewLife} title="开始新人生">
        <strong>{props.confirmingNewLife ? '确认开启新人生' : '开始新人生'}</strong>
        <small>{description}</small>
      </button>
    </footer>
  )
}
