/** Purpose: Render player-owned character custom options. Owner: mod-pages. Responsibility: Custom option presentation and event forwarding only. */

import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterCustomOptionsSection({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  return (
    <section className={styles.section} aria-labelledby="character-custom-options-title">
      <div className={styles.sectionHeading}>
        <h2 id="character-custom-options-title">自定义选项</h2>
      </div>
      <div className={styles.softGroup}>
        <div className={styles.groupHeading}>
          <span>节日范围</span>
          <span>影响角色经历中的节日事件</span>
        </div>
        <div className={styles.chipRow} role="group" aria-label="节日范围">
          <button
            type="button"
            className={logic.festivalScope === 'china' ? styles.chipActive : undefined}
            aria-pressed={logic.festivalScope === 'china'}
            onClick={() => logic.setFestivalScope('china')}
          >
            仅中国节日
          </button>
          <button
            type="button"
            className={logic.festivalScope === 'china-and-international' ? styles.chipActive : undefined}
            aria-pressed={logic.festivalScope === 'china-and-international'}
            onClick={() => logic.setFestivalScope('china-and-international')}
          >
            中国及国际节日
          </button>
        </div>
      </div>
    </section>
  )
}
