import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterCreateBottomBar({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  const hint = logic.nextBlockReason ?? `${logic.name.trim()} · 进入命格抽取`

  return (
    <nav className={styles.bottomBar} aria-label="角色创建操作">
      <div className={styles.bottomBarInner}>
        <button type="button" className={styles.backButton} onClick={logic.handleBack} title={logic.LABELS.backTitleMobile} aria-label="返回世界配置">
          <span aria-hidden="true">←</span>
        </button>
        <button type="button" className={styles.confirmButton} onClick={logic.handleNext} disabled={!logic.canProceed} title={logic.nextBlockReason ?? undefined}>
          <span className={styles.nextNumber}>05</span>
          <span className={styles.nextCopy}><strong>确认角色</strong><small>{hint}</small></span>
          <span className={styles.nextArrow} aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  )
}
