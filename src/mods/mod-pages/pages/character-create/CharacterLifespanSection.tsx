/** Purpose: Render the finalized lifespan and starting-age section. Owner: mod-pages. Responsibility: Lifespan inputs and presentation only. */

import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterLifespanSection({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  return (
    <section className={`${styles.section} ${styles.lifespanSection}`}>
      <div className={styles.sectionHeading}><h2><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">⏳</span>寿命与起始</h2></div>
      <div className={styles.lifespanCard}>
        <div className={styles.lifespanFields}>
          <span className={styles.lifeSentence}>
            <input aria-label="起始年龄" value={logic.manualStartingAge} inputMode="numeric" placeholder="0" onChange={(event) => logic.setManualStartingAge(event.target.value)} onBlur={logic.handleDetectLifespan} />
            岁蒙光降世，天命寿数
            <input aria-label="寿命上限" value={logic.manualLifespan} inputMode="numeric" placeholder="78" onChange={(event) => logic.setManualLifespan(event.target.value)} onBlur={logic.handleDetectLifespan} />
            岁
          </span>
        </div>
        <p className={styles.lifespanResult} role="status">
          <strong>{logic.previewStartingAge === 0 ? '初生' : `${logic.previewStartingAge} 岁`}</strong>
          {' '}蒙光降世，天命寿数 <strong>{logic.previewLifespan.toLocaleString()} 岁</strong>
        </p>
        {logic.ageSetupError && <p className={styles.fieldError} role="alert">{logic.ageSetupError}</p>}
      </div>
    </section>
  )
}
