import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectBottomBar({ logic }: { logic: WorldSelectLogic }) {
  const hint = logic.isConfirming
    ? '正在生成世界数据，请稍候'
    : logic.selectedWorld
      ? `${logic.selectedWorld.name} · 下一步配置世界`
      : '请先选择或创建一个世界'

  return (
    <nav className={styles.bottomBar} aria-label="世界选择操作">
      <div className={styles.bottomBarInner}>
        <button
          type="button"
          className={styles.backButton}
          onClick={logic.handleBack}
          title={logic.LABELS.backTitle}
          aria-label="返回欢迎页"
          disabled={logic.isConfirming}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className={styles.confirmButton}
          onClick={logic.handleConfirm}
          disabled={!logic.selectedWorld || logic.isConfirming}
          title={logic.confirmTitle}
        >
          <span className={styles.nextNumber}>02</span>
          <span className={styles.nextCopy}>
            <strong>{logic.isConfirming ? '正在确认世界' : '确认世界'}</strong>
            <small>{hint}</small>
          </span>
          <span className={styles.nextArrow} aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  )
}
