import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterBackgroundSection({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  return (
    <section className={`${styles.section} ${styles.backgroundSection}`}>
      <div className={styles.sectionHeading}><h2>人生背景</h2><span>{logic.background.length} / 5000 · 可选</span></div>
      {Object.keys(logic.bgPresets).length > 0 && (
        <div className={styles.backgroundPresets}>
          {Object.entries(logic.bgPresets).map(([name, content]) => (
            <span key={name} className={styles.backgroundPresetWrap}>
              <button type="button" className={logic.background === content ? styles.backgroundPresetActive : ''} onClick={() => logic.selectBgPreset(name)}>{name}</button>
              <button type="button" className={styles.removePreset} aria-label={`删除背景预设 ${name}`} onClick={() => logic.removeBgPreset(name)}>×</button>
            </span>
          ))}
        </div>
      )}
      <textarea className={styles.backgroundTextarea} value={logic.background} maxLength={5000} placeholder={logic.LABELS.bgPlaceholder} onChange={(event) => logic.setBackground(event.target.value)} />
      <div className={styles.backgroundFooter}>
        <span>留空也可以继续</span>
        {logic.showBgPresetInput ? (
          <div className={styles.presetSaveForm}>
            <input value={logic.bgPresetNameInput} placeholder={logic.LABELS.presetNamePlaceholder} onChange={(event) => logic.setBgPresetNameInput(event.target.value)} />
            <button type="button" onClick={logic.handleAddBgPreset}>保存</button>
            <button type="button" onClick={() => { logic.setShowBgPresetInput(false); logic.setBgPresetNameInput('') }}>取消</button>
          </div>
        ) : (
          <button type="button" onClick={() => logic.setShowBgPresetInput(true)}>+ 保存为预设</button>
        )}
      </div>
    </section>
  )
}
