'use client'

/**
 * @file CharacterCreateDesktop.tsx
 * @description 角色创建桌面端 —— 纯视图层，业务逻辑见 useCharacterCreateLogic
 * @mod mod-pages
 * @layout 布局标准源
 */

/* 布局标准源 */

import { BottomActionBar } from '@/mods/mod-ui'
import { useCharacterCreateLogic } from './useCharacterCreateLogic'

import styles from './CharacterCreateDesktop.module.css'

export function CharacterCreateDesktop() {
  const logic = useCharacterCreateLogic()
  const L = logic.LABELS

  return (
    <>
      <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', padding: '24px 32px 120px' }}>
        <div className={styles.inner}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>{L.headerIcon}</div>
            <h2 className={styles.headerTitle}>{L.headerTitle}</h2>
            <p className={styles.headerSubtitle}>{L.headerSubtitle}</p>
          </div>

          {/* ======== 姓名 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              {L.nameLabel} <span className={styles.sectionLabelHint}>{L.nameHint}</span>
            </label>
            <div className={styles.nameRow}>
              <input
                className={styles.nameInput}
                placeholder={L.namePlaceholder}
                value={logic.name}
                onChange={(e) => { logic.setFormName(e.target.value); logic.setNameError('') }}
              />
              <button className={styles.diceBtn} title={L.diceBtnTitle} type="button" onClick={logic.handleDice}>🎲</button>
            </div>
            {logic.nameError && <p className={styles.nameError}>{logic.nameError}</p>}
          </div>

          {/* ======== 性别 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              {L.genderLabel} <span className={styles.sectionLabelHint}>{L.genderHint}</span>
            </label>
            <div className={styles.optionGrid}>
              {logic.allGenders.map((g) => {
                const icon = logic.getGenderIcon(g)
                const isCustom = logic.customGenders.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => logic.setFormGender(logic.genderOptionToValue(g))}
                    className={`${styles.optionBtn} ${logic.isGenderOptionActive(g, logic.gender) ? styles.optionBtnActive : ''}`}
                    style={{ position: 'relative' }}
                  >
                    <span className={styles.optionIcon}>{icon}</span>
                    <span className={styles.optionText}>{g}</span>
                    {isCustom && (
                      <span
                        className={styles.itemDeleteBtn}
                        onClick={(e) => { e.stopPropagation(); logic.removeCustomGender(g) }}
                      >×</span>
                    )}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => logic.setShowCustomGender(!logic.showCustomGender)}
                className={styles.optionBtn}
                title={L.moreGenderBtnTitle}
              >
                <span className={styles.optionIcon}>✨</span>
                <span className={styles.optionText}>{L.moreBtnText}</span>
              </button>
            </div>

            {/* 自定义性别面板 */}
            {logic.showCustomGender && (
              <div className={styles.customPanel}>
                <div className={styles.customInputRow}>
                  <input
                    className={styles.customInput}
                    placeholder={L.customGenderPlaceholder}
                    value={logic.customGenderInput}
                    onChange={(e) => logic.setCustomGenderInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') logic.handleAddCustomGender() }}
                  />
                  <button className={styles.customAddBtn} onClick={logic.handleAddCustomGender}>{L.customAddBtn}</button>
                </div>
                <div className={styles.moreGrid}>
                  {Object.entries(logic.ADDITIONAL_GENDERS).map(([nm, icon]) => (
                    <button
                      key={nm}
                      type="button"
                      onClick={() => logic.setFormGender(logic.genderOptionToValue(nm))}
                      className={`${styles.optionBtn} ${logic.isGenderOptionActive(nm, logic.gender) ? styles.optionBtnActive : ''}`}
                    >
                      <span className={styles.optionIcon}>{icon}</span>
                      <span className={styles.optionText}>{nm}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======== 种族 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{L.raceLabel}</label>
            <div className={styles.optionGrid}>
              <button
                type="button"
                onClick={() => logic.setRace('human')}
                className={`${styles.optionBtn} ${logic.race === 'human' ? styles.optionBtnActive : ''}`}
              >
                <span className={styles.optionIcon}>{logic.getRaceIcon('human')}</span>
                <span className={styles.optionText}>{L.humanRaceText}</span>
              </button>
              <button
                type="button"
                onClick={() => logic.setShowCustomRace(!logic.showCustomRace)}
                className={`${styles.optionBtn} ${logic.customRaces.includes(logic.race) ? styles.optionBtnActive : ''}`}
              >
                <span className={styles.optionIcon}>✦</span>
                <span className={styles.optionText}>{L.customRaceText}</span>
              </button>
              <button
                type="button"
                onClick={() => logic.setShowRaceCatalog(!logic.showRaceCatalog)}
                className={`${styles.optionBtn} ${logic.race !== 'human' && !logic.customRaces.includes(logic.race) ? styles.optionBtnActive : ''}`}
                title={L.moreRaceBtnTitle}
              >
                <span className={styles.optionIcon}>✨</span>
                <span className={styles.optionText}>{L.moreBtnText}</span>
              </button>
            </div>
            {logic.race !== 'human' && (
              <div className={styles.raceInfo}>
                {logic.raceInfo
                  ? `${logic.raceInfo.name}${L.raceDisplaySeparator}${L.raceInfoPrefix} ${logic.raceInfo.baseMaxAge} ${L.raceInfoYearUnit}${L.raceDisplaySeparator}${L.raceInfoDecay} ${logic.raceInfo.decayMultiplier}x`
                  : logic.getRaceDisplayName(logic.race)}
              </div>
            )}

            {/* 自定义种族面板 */}
            {logic.showCustomRace && (
              <div className={styles.customPanel}>
                <div className={styles.customInputRow}>
                  <input
                    className={styles.customInput}
                    placeholder={L.customRacePlaceholder}
                    value={logic.customRaceInput}
                    onChange={(e) => logic.setCustomRaceInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') logic.handleAddCustomRace() }}
                  />
                  <button className={styles.customAddBtn} onClick={logic.handleAddCustomRace}>{L.customAddBtn}</button>
                </div>
              </div>
            )}

            {logic.showRaceCatalog && (
              <div className={styles.customPanel}>
                <input
                  className={styles.customInput}
                  placeholder={L.raceSearchPlaceholder}
                  value={logic.raceSearch}
                  onChange={(e) => logic.setRaceSearch(e.target.value)}
                />
                <div className={styles.moreGrid}>
                  {logic.raceCatalogOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { logic.setRace(item.id); logic.setShowRaceCatalog(false) }}
                      className={`${styles.optionBtn} ${logic.race === item.id ? styles.optionBtnActive : ''}`}
                    >
                      <span className={styles.optionIcon}>{logic.getRaceIcon(item.id)}</span>
                      <span className={styles.optionText}>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======== 寿命检测 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{L.lifespanLabel}</label>
            <div className={styles.presetSaveRow}>
              <button
                onClick={logic.handleDetectLifespan}
                className={styles.outlineBtn}
                title={L.detectBtnTitle}
              >
                {L.detectBtnText}
              </button>
              {logic.computedLifespan !== null && (
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {L.lifespanPrefix}
                  <b style={{ color: logic.computedLifespan > 200 ? 'var(--color-primary)' : 'var(--color-success)' }}>
                    {logic.computedLifespan.toLocaleString()}{L.lifespanUnit}
                  </b>
                  {logic.computedStartingAge !== null && logic.computedStartingAge > 0 && (
                    <span>
                      {L.startingAgePrefix} <b style={{ color: 'var(--color-warning)' }}>{logic.computedStartingAge}{L.startingAgeUnit}</b>
                    </span>
                  )}
                  {logic.computedStartingAge === 0 && <span>{L.birthText}</span>}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input
                className={styles.presetNameInput}
                placeholder={L.lifespanPlaceholder}
                value={logic.manualLifespan}
                inputMode="numeric"
                onChange={(e) => logic.setManualLifespan(e.target.value)}
                onBlur={logic.handleDetectLifespan}
              />
              <input
                className={styles.presetNameInput}
                placeholder={L.startingAgePlaceholder}
                value={logic.manualStartingAge}
                inputMode="numeric"
                onChange={(e) => logic.setManualStartingAge(e.target.value)}
                onBlur={logic.handleDetectLifespan}
              />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{L.autoHint}</span>
            </div>
          </div>

          {/* ======== 背景信息 ======== */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>
              {L.bgLabel} <span className={styles.sectionLabelHint}>{L.bgHint}</span>
            </label>

            {/* 背景预设卡片网格 */}
            {Object.keys(logic.bgPresets).length > 0 && (
              <div className={styles.optionGrid}>
                {Object.entries(logic.bgPresets).map(([nm, content]) => {
                  const isActive = logic.background === content
                  return (
                    <button
                      key={nm}
                      type="button"
                      onClick={() => logic.selectBgPreset(nm)}
                      className={`${styles.optionBtn} ${styles.optionBtnWide} ${isActive ? styles.optionBtnActive : ''}`}
                      style={{ position: 'relative', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{logic.getBgPresetIcon(nm)}</span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{nm}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                        {content.slice(0, 40)}{content.length > 40 ? '...' : ''}
                      </span>
                      <span
                        className={styles.itemDeleteBtn}
                        onClick={(e) => { e.stopPropagation(); logic.removeBgPreset(nm) }}
                      >×</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* 背景文本 textarea */}
            <textarea
              className={styles.textarea}
              placeholder={L.bgPlaceholder}
              value={logic.background}
              onChange={(e) => logic.setBackground(e.target.value)}
              maxLength={5000}
            />
            <div className={styles.charCount}>
              {logic.background.length}{L.charCountSeparator}5000
            </div>

            {/* 背景预设保存行 */}
            <div className={styles.presetSaveRow}>
              {logic.showBgPresetInput ? (
                <>
                  <input
                    className={styles.presetNameInput}
                    placeholder={L.presetNamePlaceholder}
                    value={logic.bgPresetNameInput}
                    onChange={(e) => logic.setBgPresetNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') logic.handleAddBgPreset() }}
                  />
                  <button className={styles.customAddBtn} onClick={logic.handleAddBgPreset}>{L.saveBtn}</button>
                  <button
                    className={styles.outlineBtn}
                    onClick={() => { logic.setShowBgPresetInput(false); logic.setBgPresetNameInput('') }}
                  >{L.cancelBtn}</button>
                </>
              ) : (
                <button className={styles.outlineBtn} onClick={() => logic.setShowBgPresetInput(true)}>
                  {L.savePresetBtn}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <BottomActionBar
        onBack={logic.handleBack}
        backTitle={L.backTitle}
        onConfirm={logic.handleNext}
        confirmText={L.confirmText}
      />
    </>
  )
}

export default CharacterCreateDesktop
