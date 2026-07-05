'use client'

/**
 * @file CharacterCreateMobile.tsx
 * @description 角色创建移动端 —— 纯视图层，业务逻辑见 useCharacterCreateLogic
 * @mod mod-pages
 */

import { BottomActionBar } from '@/mods/mod-ui'
import { useCharacterCreateLogic } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterCreateMobile() {
  const logic = useCharacterCreateLogic()
  const L = logic.LABELS

  return (
    <>
      <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
        <div className={styles.container}>
          <div className={styles.inner}>
            {/* 布局：移动端居中标题 */}
            <div className={styles.header}>
              <div className={styles.headerIcon}>{L.headerIcon}</div>
              <h2 className={styles.headerTitle}>{L.headerTitle}</h2>
              <p className={styles.headerSubtitle}>{L.headerSubtitle}</p>
            </div>

            {/* ======== 姓名 — 框架：随机名称 + 空名AI生成，与桌面端一致 ======== */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                {L.nameLabel} <span className={styles.sectionLabelHint}>{L.nameHint}</span>
              </label>
              {/* 布局：全宽 flex row */}
              <div className={styles.nameRow}>
                <input
                  className={styles.nameInput}
                  placeholder={L.namePlaceholder}
                  value={logic.name}
                  onChange={(e) => { logic.setFormName(e.target.value); logic.setNameError('') }}
                />
                <button className={styles.diceBtn} title={L.diceBtnTitle} type="button" onClick={logic.handleDice}>🎲</button>
              </div>
              {logic.nameError && <p style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 4 }}>{logic.nameError}</p>}
            </div>

            {/* ======== 性别 — 框架：核心+更多面板，与桌面端一致 ======== */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                {L.genderLabel} <span className={styles.sectionLabelHint}>{L.genderHint}</span>
              </label>
              {/* 布局：2列网格 + 更多按钮，触控优化 */}
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
                      <span>{icon} {g}</span>
                      {isCustom && (
                        <button
                          className={styles.itemDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); logic.removeCustomGender(g) }}
                        >×</button>
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
                  ✨ {L.moreBtnText}
                </button>
              </div>

              {/* 布局：折叠面板 */}
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
                    <button
                      className={styles.customAddBtn}
                      onClick={logic.handleAddCustomGender}
                    >{L.customAddBtn}</button>
                  </div>
                  <div className={styles.moreGrid}>
                    {Object.entries(logic.ADDITIONAL_GENDERS).map(([nm, icon]) => (
                      <button
                        key={nm}
                        type="button"
                        onClick={() => logic.setFormGender(logic.genderOptionToValue(nm))}
                        className={`${styles.optionBtn} ${logic.isGenderOptionActive(nm, logic.gender) ? styles.optionBtnActive : ''}`}
                      >
                        {icon} {nm}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ======== 种族 — 框架：核心+更多+种族信息，与桌面端一致 ======== */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>{L.raceLabel}</label>
              {/* 布局：2列网格 */}
              <div className={styles.optionGrid}>
                {logic.allRaces.map((r) => {
                  const displayName = logic.RACE_LIFESPAN[r]?.name || r
                  const isCustom = logic.customRaces.includes(r)
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => logic.setRace(r)}
                      className={`${styles.optionBtn} ${logic.race === r ? styles.optionBtnActive : ''}`}
                      style={{ position: 'relative' }}
                    >
                      <span>{logic.getRaceIcon(displayName)}</span>
                      <span>{displayName}</span>
                      {isCustom && (
                        <button
                          className={styles.itemDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); logic.removeCustomRace(r) }}
                        >×</button>
                      )}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => logic.setShowCustomRace(!logic.showCustomRace)}
                  className={styles.optionBtn}
                  title={L.moreRaceBtnTitle}
                >
                  ✨ {L.moreBtnText}
                </button>
              </div>
              {/* 框架：种族信息展示，与桌面端一致 */}
              {logic.raceInfo && logic.race !== 'human' && (
                <div className={styles.raceInfo}>
                  {logic.raceInfo.name}{L.raceDisplaySeparator}{L.raceInfoPrefix} {logic.raceInfo.baseMaxAge} {L.raceInfoYearUnit}{L.raceDisplaySeparator}{L.raceInfoDecay} {logic.raceInfo.decayMultiplier}x
                </div>
              )}

              {/* 布局：折叠面板 */}
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
                    <button
                      className={styles.customAddBtn}
                      onClick={logic.handleAddCustomRace}
                    >{L.customAddBtn}</button>
                  </div>
                  <div className={styles.moreGrid}>
                    {Object.entries(logic.ADDITIONAL_RACES).map(([nm, icon]) => (
                      <button
                        key={nm}
                        type="button"
                        onClick={() => logic.setRace(nm)}
                        className={`${styles.optionBtn} ${logic.race === nm ? styles.optionBtnActive : ''}`}
                      >
                        {icon} {nm}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ======== 寿命检测 — 框架：手动输入+计算，与桌面端一致 ======== */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>{L.lifespanLabel}</label>
              {/* 布局：检测按钮+结果显示 */}
              <div className={styles.lifespanRow}>
                <button
                  className={styles.lifespanBtn}
                  onClick={logic.handleDetectLifespan}
                  title={L.detectBtnTitle}
                >
                  {L.detectBtnText}
                </button>
                {logic.computedLifespan !== null && (
                  <span className={styles.lifespanText}>
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
              {/* 布局：年龄输入行 */}
              <div className={styles.lifespanRow}>
                <input
                  className={styles.lifespanInput}
                  placeholder={L.lifespanPlaceholder}
                  value={logic.manualLifespan}
                  inputMode="numeric"
                  onChange={(e) => logic.setManualLifespan(e.target.value)}
                  onBlur={logic.handleDetectLifespan}
                />
                <input
                  className={styles.lifespanInput}
                  placeholder={L.startingAgePlaceholder}
                  value={logic.manualStartingAge}
                  inputMode="numeric"
                  onChange={(e) => logic.setManualStartingAge(e.target.value)}
                  onBlur={logic.handleDetectLifespan}
                />
                <span className={styles.lifespanText}>{L.autoHint}</span>
              </div>
            </div>

            {/* ======== 背景信息 — 框架：与桌面端一致 ======== */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                {L.bgLabel} <span className={styles.sectionLabelHint}>{L.bgHint}</span>
              </label>

              {/* 布局：预设卡片横向滚动 */}
              {Object.keys(logic.bgPresets).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {Object.entries(logic.bgPresets).map(([nm, content]) => {
                    const isActive = logic.background === content
                    return (
                      <button
                        key={nm}
                        type="button"
                        onClick={() => logic.selectBgPreset(nm)}
                        className={`${styles.bgPresetCard} ${isActive ? styles.bgPresetCardActive : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>{logic.getBgPresetIcon(nm)}</span>
                          <span style={{ fontWeight: 600 }}>{nm}</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                          {content.slice(0, 30)}{content.length > 30 ? '...' : ''}
                        </span>
                        <button
                          className={styles.itemDeleteBtn}
                          onClick={(e) => { e.stopPropagation(); logic.removeBgPreset(nm) }}
                        >×</button>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 框架：5000字上限，与桌面端一致 */}
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

              {/* 布局：预设保存行 */}
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
                    <button
                      className={styles.outlineBtn}
                      onClick={logic.handleAddBgPreset}
                    >{L.saveBtn}</button>
                    <button
                      className={styles.outlineBtn}
                      onClick={() => { logic.setShowBgPresetInput(false); logic.setBgPresetNameInput('') }}
                    >{L.cancelBtn}</button>
                  </>
                ) : (
                  <button
                    className={styles.outlineBtn}
                    onClick={() => logic.setShowBgPresetInput(true)}
                  >{L.savePresetBtn}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <BottomActionBar
        onBack={logic.handleBack}
        backTitle={L.backTitleMobile}
        onConfirm={logic.handleNext}
        confirmText={L.confirmText}
      />
    </>
  )
}

export default CharacterCreateMobile
