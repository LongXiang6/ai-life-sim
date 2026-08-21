/** Purpose: Render the finalized character identity section. Owner: mod-pages. Responsibility: Identity inputs and presentation only. */

import type { UseCharacterCreateLogicReturn } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterIdentitySection({ logic }: { logic: UseCharacterCreateLogicReturn }) {
  return (
    <section className={`${styles.section} ${styles.identitySection}`}>
      <div className={styles.sectionHeading}><h2><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">👤</span>核心身份</h2></div>
      <div className={styles.identityCard}>
        <div className={styles.softGroup}>
          <div className={styles.groupHeading}><label htmlFor="character-name">角色姓名</label><span>必填 · 可随机</span></div>
          <div className={styles.nameRow}>
            <input id="character-name" value={logic.name} placeholder={logic.LABELS.namePlaceholder} onChange={(event) => { logic.setFormName(event.target.value); logic.setNameError('') }} />
            <button type="button" onClick={logic.handleDice}>随机</button>
          </div>
          {logic.nameError && <p className={styles.fieldError}>{logic.nameError}</p>}
        </div>

        <div className={styles.softGroup}>
          <div className={styles.groupHeading}><span>性别</span><button type="button" className={styles.moreLink} onClick={() => logic.setShowCustomGender(!logic.showCustomGender)} aria-expanded={logic.showCustomGender}>更多选择⌄</button></div>
          <div className={styles.chipRow}>
            {logic.allGenders.map((gender) => (
              <span key={gender} className={styles.removableChip}>
                <button type="button" className={logic.isGenderOptionActive(gender, logic.gender) ? styles.chipActive : ''} onClick={() => logic.setFormGender(logic.genderOptionToValue(gender))} aria-pressed={logic.isGenderOptionActive(gender, logic.gender)}>
                  {gender}
                </button>
                {logic.customGenders.includes(gender) && <button type="button" className={styles.removeChip} aria-label={`删除自定义性别 ${gender}`} onClick={() => logic.removeCustomGender(gender)}>×</button>}
              </span>
            ))}
          </div>
          {logic.showCustomGender && (
            <div className={styles.inlinePanel}>
              <div className={styles.inlineInputRow}><input value={logic.customGenderInput} placeholder={logic.LABELS.customGenderPlaceholder} onChange={(event) => logic.setCustomGenderInput(event.target.value)} /><button type="button" onClick={logic.handleAddCustomGender}>添加</button></div>
              <div className={styles.catalogGrid}>
                {Object.keys(logic.ADDITIONAL_GENDERS).map((name) => {
                  const active = logic.isGenderOptionActive(name, logic.gender)
                  return (
                    <button
                      type="button"
                      key={name}
                      className={active ? styles.catalogOptionActive : ''}
                      onClick={() => logic.setFormGender(logic.genderOptionToValue(name))}
                      aria-pressed={active}
                    >{name}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className={styles.softGroup}>
          <div className={styles.groupHeading}><span>种族</span><button type="button" className={styles.moreLink} onClick={() => logic.setShowRaceCatalog(!logic.showRaceCatalog)} aria-expanded={logic.showRaceCatalog}>种族目录⌄</button></div>
          <div className={styles.chipRow}>
            <button type="button" className={logic.race === 'human' ? styles.chipActive : ''} onClick={() => logic.setRace('human')} aria-pressed={logic.race === 'human'}>人类</button>
            <button
              type="button"
              className={logic.customRaces.includes(logic.race) ? styles.chipActive : ''}
              onClick={() => logic.setShowCustomRace(!logic.showCustomRace)}
              aria-expanded={logic.showCustomRace}
              aria-pressed={logic.customRaces.includes(logic.race)}
            >自定义种族</button>
          </div>
          {logic.showCustomRace && <div className={styles.inlinePanel}><div className={styles.inlineInputRow}><input value={logic.customRaceInput} placeholder={logic.LABELS.customRacePlaceholder} onChange={(event) => logic.setCustomRaceInput(event.target.value)} /><button type="button" onClick={logic.handleAddCustomRace}>添加</button></div></div>}
          {logic.showRaceCatalog && <div className={styles.inlinePanel}><input className={styles.searchInput} value={logic.raceSearch} placeholder={logic.LABELS.raceSearchPlaceholder} onChange={(event) => logic.setRaceSearch(event.target.value)} /><div className={styles.catalogGrid}>{logic.raceCatalogOptions.map((race) => <button type="button" key={race.id} className={logic.race === race.id ? styles.catalogOptionActive : ''} aria-pressed={logic.race === race.id} onClick={() => { logic.setRace(race.id); logic.setShowRaceCatalog(false) }}>{race.name}</button>)}</div></div>}
        </div>
      </div>
    </section>
  )
}
