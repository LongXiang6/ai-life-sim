/**
 * @file WorldSelectMobile.tsx
 * @description 世界选择移动端 —— 预设世界 + 更多世界 + 自定义世界（完整版）
 * @mod mod-pages
 *
 * 功能和文案严格对齐 WorldSelectDesktop，仅 UI 布局适配移动端。
 * 业务逻辑抽取至 useWorldSelectLogic.ts，桌面端/移动端共用同一个 hook。
 */

'use client'

import { resolvePresetWorldCode } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'

import { useWorldSelectLogic } from './useWorldSelectLogic'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectMobile() {
  const logic = useWorldSelectLogic()
  const L = logic.LABELS

  return (
    <>
      {logic.conflictModal}
      <div style={{ minHeight: '100vh', paddingBottom: 80, background: 'var(--color-bg)' }}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>🌍</div>
            <h2 className={styles.headerTitle}>{L.headerTitle}</h2>
            <p className={styles.headerSubtitle}>{L.headerSubtitle}</p>
          </div>

          {/* 框架：6个主世界 + 18个扩展世界，与桌面端一致 */}
          {/* 布局：移动端2列网格以适配窄屏 */}
          <div className={styles.presetGrid}>
            {logic.presetMain.map((w) => {
              const isSel = logic.selectedWorld?.id === w.id
              const worldCode = resolvePresetWorldCode(w)
              return (
                <div
                  key={w.id}
                  onClick={() => logic.handleSelectPreset(w)}
                  className={`${styles.presetCard} ${isSel ? styles.presetCardSelected : ''}`}
                >
                  <div className={styles.presetCardIcon}>{w.icon}</div>
                  <div className={`${styles.presetCardName} ${isSel ? styles.presetCardNameSel : ''}`}>{w.name}</div>
                  <div className={styles.presetCardSubtitle}>{w.era}</div>
                  {logic.worldCodesWithCache.has(worldCode) && (
                    <div className={styles.cardBadge}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); logic.handleClearWorldCache(worldCode) }}
                        className={`${styles.btnRefresh} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                        title={L.clearCacheTitle}
                      >🔄</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 框架：更多世界/已保存世界/自定义世界三个tab，与桌面端一致 */}
          <div className={styles.tabBar}>
            <button
              onClick={() => { logic.setShowMore(!logic.showMore); logic.setShowCustom(false); logic.setShowCustomForm(false) }}
              className={`${styles.tab} ${logic.showMore ? styles.tabActive : ''}`}
              title={logic.showMore ? L.tabMoreHideTitle : L.tabMoreShowTitle}
            >
              <span>{L.tabMore}</span>
              <span className={styles.tabArrow}>{logic.showMore ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => { logic.setShowCustom(!logic.showCustom); logic.setShowMore(false); logic.setShowCustomForm(false) }}
              className={`${styles.tab} ${logic.showCustom ? styles.tabActive : ''}`}
              title={logic.showCustom ? L.tabSavedHideTitle : L.tabSavedShowTitle}
            >
              <span>{L.tabSaved}</span>
              <span className={styles.tabArrow}>{logic.showCustom ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => { logic.setShowCustomForm(!logic.showCustomForm); logic.setShowMore(false); logic.setShowCustom(false) }}
              className={`${styles.tab} ${logic.showCustomForm ? styles.tabActive : ''}`}
              title={logic.showCustomForm ? L.tabCustomHideTitle : L.tabCustomShowTitle}
            >
              <span>{L.tabCustom}</span>
              <span className={styles.tabArrow}>{logic.showCustomForm ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* More Worlds Panel (18 个扩展世界) */}
          {logic.showMore && (
            <div className={styles.moreGrid}>
              {logic.presetMore.map((w) => {
                const isSel = logic.selectedWorld?.id === w.id
                const worldCode = resolvePresetWorldCode(w)
                return (
                  <div
                    key={w.id}
                    onClick={() => logic.handleSelectPreset(w)}
                    className={`${styles.moreCard} ${isSel ? styles.moreCardSelected : ''}`}
                  >
                    <div className={styles.moreCardIcon}>{w.icon}</div>
                    <div className={`${styles.moreCardName} ${isSel ? styles.moreCardNameSel : ''}`}>{w.name}</div>
                    {logic.worldCodesWithCache.has(worldCode) && (
                      <div className={styles.cardBadge}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); logic.handleClearWorldCache(worldCode) }}
                          className={`${styles.btnRefresh} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                          title={L.clearCacheTitle}
                        >🔄</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Saved Custom Worlds */}
          {logic.showCustom && (
            logic.savedWorlds.length > 0 ? (
              <div className={styles.presetGrid}>
                {logic.savedWorlds.map((cw) => {
                  const isSel = logic.selectedWorld?.id === cw.id
                  const isPendingDelete = logic.pendingDeleteWorldId === cw.id
                  return (
                    <div key={cw.id} className={`${styles.presetCard} ${isSel ? styles.presetCardSelected : ''}`}>
                      <div onClick={() => logic.handleSelectCustomWorld(cw)}>
                        <div className={styles.presetCardName}>{cw.name}</div>
                        <div className={styles.presetCardSubtitle}>
                          {cw.eraName}{Math.abs(cw.eraStartYear)}年 · {cw.description.slice(0, 30)}...
                        </div>
                      </div>
                      <div className={styles.savedCardActions}>
                        {logic.worldCodesWithCache.has(cw.worldCode) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); logic.handleClearWorldCache(cw.worldCode) }}
                            className={`${styles.btnRefresh} ${logic.rotatingWorldCode === cw.worldCode ? styles.spinning : ''}`}
                            title={L.clearCacheTitle}
                          >🔄</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); logic.handleStartEdit(cw) }}
                          className={styles.btnEdit} title={L.editTitle}>✏️</button>
                        {isPendingDelete ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); logic.handleConfirmDeleteCustom(cw) }}
                              className={styles.btnDeleteConfirm}
                              title={L.confirmDeleteTitle}
                            >确认</button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); logic.handleCancelDeleteCustom() }}
                              className={styles.btnDeleteCancel}
                              title={L.cancelDeleteTitle}
                            >取消</button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); logic.handleDeleteCustom(cw) }}
                            className={styles.btnDelete}
                            title={L.deleteTitle}
                          >🗑️</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', fontSize: 13, margin: '20px 0' }}>
                {L.emptySavedHint}
              </p>
            )
          )}

          {logic.customFeedback && (
            <div className={`${styles.feedback} ${logic.customFeedback.type === 'warning' ? styles.feedbackWarning : styles.feedbackSuccess}`}>
              {logic.customFeedback.text}
            </div>
          )}

          {/* 框架：世界名称/详细介绍/年代纪元/自动年号系统等全部字段，与桌面端一致 */}
          {logic.showCustomForm && (
            <div className={styles.formSection}>
              <h3 className={styles.formTitle}>
                {logic.editingWorldId ? L.formEditTitle : L.formCreateTitle}
              </h3>

              {/* 框架：表单字段顺序：名称→描述→纪元→年号，与桌面端一致 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{L.formLabelName}</label>
                <input
                  placeholder={L.formPlaceholderName}
                  value={logic.customName}
                  onChange={(e) => logic.setCustomName(e.target.value)}
                  maxLength={80}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{L.formLabelDesc}</label>
                <textarea
                  placeholder={L.formPlaceholderDesc}
                  value={logic.customDesc}
                  onChange={(e) => logic.setCustomDesc(e.target.value.slice(0, 5000))}
                  maxLength={5000}
                  className={styles.formTextarea}
                />
                <div className={`${styles.charCount} ${logic.customDesc.length > 4500 ? styles.charCountWarn : ''}`}>
                  {logic.customDesc.length}/5000
                </div>
              </div>

              {/* 框架：BC切换开关靠右侧对齐，与桌面端一致 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{L.formLabelEra}</label>
                <div className={styles.eraInlineGroup}>
                  <input
                    placeholder={L.formPlaceholderEraName}
                    value={logic.customEraName}
                    onChange={(e) => {
                      const v = e.target.value
                      logic.setCustomEraName(v)
                      if (/前/.test(v) && !logic.isBC) logic.setIsBC(true)
                    }}
                    className={styles.formInput}
                    style={{ width: 110, minWidth: 0 }}
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder={L.formPlaceholderYear}
                    value={logic.customEraYear}
                    onChange={(e) => logic.setCustomEraYear(e.target.value)}
                    className={styles.formInput}
                    style={{ width: 70, minWidth: 0 }}
                  />
                  <span className={styles.eraInlineLabel}>{L.eraYearUnit}</span>
                  <div className={styles.eraSwitchRow}>
                    <span className={styles.eraSwitchLabel}>{logic.isBC ? L.bcLabel : L.adLabel}</span>
                    <label className={styles.toggleSwitch} title={logic.isBC ? L.bcModeTitle : L.adModeTitle}>
                      <input
                        type="checkbox"
                        checked={logic.isBC}
                        onChange={() => logic.setIsBC(!logic.isBC)}
                      />
                      <span className={styles.toggleSlider} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Auto Era System */}
              <div className={styles.formGroup}>
                <div className={styles.eraToggleLabel}>
                  <label className={styles.formLabel}>{L.formLabelAutoEra}</label>
                  <button
                    onClick={() => logic.setAutoEraEnabled(!logic.autoEraEnabled)}
                    title={logic.autoEraEnabled ? L.autoEraEnabledTitle : L.autoEraDisabledTitle}
                    className={`${styles.eraToggleBtn} ${logic.autoEraEnabled ? styles.eraToggleBtnActive : ''}`}
                  >
                    {logic.autoEraEnabled ? L.autoEraEnabledText : L.autoEraDisabledText}
                  </button>
                </div>
                {logic.autoEraEnabled && (
                  <>
                    {logic.eraTimelineEntries.length > 0 && (
                      <div className={styles.eraTimeline}>
                        {[...logic.eraTimelineEntries].sort((a, b) => a.startAnchorYear - b.startAnchorYear).map((entry, i) => (
                          <div key={i} className={styles.eraRow}>
                            <span className={styles.eraName}>{entry.name}</span>
                            <span className={styles.eraYear}>{L.eraTimelineYearPrefix}{entry.startAnchorYear}{L.eraTimelineYearSuffix}</span>
                            <button
                              onClick={() => logic.setEraTimelineEntries((p) => p.filter((e) => e !== entry))}
                              className={styles.eraDeleteBtn}
                            >🗑️</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.eraAddRow}>
                      <input
                        placeholder={L.formPlaceholderEraEntryName}
                        value={logic.newEraEntryName}
                        onChange={(e) => logic.setNewEraEntryName(e.target.value)}
                        className={`${styles.formInput} ${styles.eraInput}`}
                      />
                      <input
                        type="number"
                        placeholder={L.formPlaceholderEraEntryYear}
                        value={logic.newEraEntryYear}
                        onChange={(e) => logic.setNewEraEntryYear(e.target.value)}
                        className={`${styles.formInput} ${styles.eraYearInput}`}
                      />
                      <button
                        onClick={() => {
                          if (!logic.newEraEntryName.trim() || !logic.newEraEntryYear.trim()) return
                          logic.setEraTimelineEntries((p) => [
                            ...p,
                            { name: logic.newEraEntryName.trim(), startAnchorYear: parseInt(logic.newEraEntryYear) || 1 },
                          ])
                          logic.setNewEraEntryName('')
                          logic.setNewEraEntryYear('')
                        }}
                        className={styles.eraAddBtn}
                      >{L.btnAddEraEntry}</button>
                    </div>
                    <p className={styles.eraHint}>
                      {L.eraHint}
                    </p>
                  </>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className={styles.actionRow}>
                {logic.editingWorldId ? (
                  <>
                    <button
                      onClick={logic.handleSaveEdit}
                      disabled={!logic.customName.trim() || !logic.customDesc.trim()}
                      title={L.saveEditTitle}
                      className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    >{L.btnSaveEdit}</button>
                    <button
                      onClick={logic.handleCancelEdit}
                      title={L.cancelEditTitle}
                      className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                    >{L.btnCancel}</button>
                  </>
                ) : (
                  <button
                    onClick={logic.handleAddCustom}
                    disabled={!logic.customName.trim() || !logic.customDesc.trim()}
                    title={L.addCustomTitle}
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  >{L.btnAddCustom}</button>
                )}
              </div>
            </div>
          )}

          {/* Selected World Info */}
          {logic.selectedWorld && !logic.showCustomForm && (
            <div className={styles.selectedSection}>
              <div className={styles.selectedDesc}>
                {L.selectedLabel}<strong>{logic.selectedWorld.name}</strong>{' '}
                <span className={styles.selectedMeta}>{logic.selectedWorld.era}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomActionBar
        onBack={logic.handleBack}
        backTitle={L.backTitle}
        onConfirm={logic.handleConfirm}
        confirmText={L.confirmText}
        confirmDisabled={!logic.selectedWorld}
        confirmTitle={logic.confirmTitle}
        moreLabel={L.difficultyItems[logic.difficulty].label}
        moreItems={logic.difficultyItems}
      />
    </>
  )
}

export default WorldSelectMobile
