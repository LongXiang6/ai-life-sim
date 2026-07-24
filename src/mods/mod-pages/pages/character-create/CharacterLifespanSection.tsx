import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterLifespanSection({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  return (
    <section className={`${styles.section} ${styles.lifespanSection}`}>
      <div className={styles.sectionHeading}><h2>寿命与起始</h2><span>02 / 03 · 人生跨度与开篇时点</span></div>
      <div className={styles.lifespanCard}>
        <div className={styles.lifespanFields}>
          <label><span>寿命上限</span><input value={logic.manualLifespan} inputMode="numeric" placeholder="自动" onChange={(event) => logic.setManualLifespan(event.target.value)} onBlur={logic.handleDetectLifespan} /></label>
          <label><span>起始年龄</span><input value={logic.manualStartingAge} inputMode="numeric" placeholder="出生" onChange={(event) => logic.setManualStartingAge(event.target.value)} onBlur={logic.handleDetectLifespan} /></label>
          <button type="button" onClick={logic.handleDetectLifespan}>重新检测</button>
        </div>
        <p className={styles.lifespanResult} role="status">
          预计寿命 <strong>{logic.previewLifespan.toLocaleString()} 岁</strong>
          <span> · 从 {logic.previewStartingAge === 0 ? '出生' : `${logic.previewStartingAge} 岁`} 开始</span>
        </p>
        {logic.ageSetupError && <p className={styles.fieldError} role="alert">{logic.ageSetupError}</p>}
      </div>
    </section>
  )
}
