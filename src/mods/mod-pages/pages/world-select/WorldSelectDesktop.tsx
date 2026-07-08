/**
 * @file WorldSelectDesktop.tsx
 * @description 世界选择桌面端 —— 预设世界 + 更多世界 + 自定义世界（完整版）
 * @mod mod-pages
 *
 * 布局标准源：所有元素的对齐方向、排列顺序以此文件为准。
 * 业务逻辑抽取至 useWorldSelectLogic.ts，桌面端/移动端共用同一个 hook。
 *
 * 参照废弃项目 WorldSelectDesktop 完整移植：
 *   - 6 个主预设世界网格 + 18 个扩展世界折叠面板
 *   - 自定义世界完整表单（自动年号系统 + 年号时间线 + 世界观类型）
 *   - 已保存世界面板（编辑/删除，localStorage 持久化）
 *   - 金手指模式选择
 *   - 难度下拉底部操作栏
 *   - 已选世界信息 + 动态属性标签
 */

'use client'

import { resolvePresetWorldCode } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'

import { useWorldSelectLogic } from './useWorldSelectLogic'

import styles from './WorldSelectDesktop.module.css'

/* 布局标准源：所有元素的对齐方向、排列顺序以此文件为准 */

export function WorldSelectDesktop() {
  const logic = useWorldSelectLogic()
  const L = logic.LABELS

  return (
    <>
      {logic.conflictModal}
      <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', padding: '24px 32px 140px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>🌍</div>
            <h2 className={styles.headerTitle}>{L.headerTitle}</h2>
            <p className={styles.headerSubtitle}>{L.headerSubtitle}</p>
          </div>

          {/* Preset Worlds Grid (6 个主世界) */}
          <div className={styles.grid}>
            {logic.presetMain.map((w) => {
              const isSel = logic.selectedWorld?.id === w.id
              const worldCode = resolvePresetWorldCode(w)
              return (
                <div
                  key={w.id}
                  onClick={() => logic.handleSelectPreset(w)}
                  className={`${styles.card} ${isSel ? styles.cardSelected : ''}`}
                >
                  <span className={styles.cardIcon}>{w.icon}</span>
                  <h3 className={styles.cardTitle}>{w.name}</h3>
                  <p className={styles.cardSubtitle}>{w.era}</p>
                  {logic.worldCodesWithCache.has(worldCode) && (
                    <div className={styles.cardBadge}>
                      <span className={styles.cardBadgeBtn}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); logic.handleClearWorldCache(worldCode) }}
                          className={`${styles.btnRefresh} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                          title={L.clearCacheTitle}
                        >🔄</button>
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Toggle Tab Bar */}
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
            <div className={styles.gridMore}>
              {logic.presetMore.map((w) => {
                const isSel = logic.selectedWorld?.id === w.id
                const worldCode = resolvePresetWorldCode(w)
                return (
                  <div
                    key={w.id}
                    onClick={() => logic.handleSelectPreset(w)}
                    className={`${styles.card} ${styles.cardSmall} ${isSel ? styles.cardSelected : ''}`}
                  >
                    <span className={styles.cardSmallTitle}>{w.icon} {w.name}</span>
                    {logic.worldCodesWithCache.has(worldCode) && (
                      <div className={styles.cardBadge}>
                        <span className={styles.cardBadgeBtn}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); logic.handleClearWorldCache(worldCode) }}
                            className={`${styles.btnRefresh} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                            title={L.clearCacheTitle}
                          >🔄</button>
                        </span>
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
              <div className={styles.grid}>
                {logic.savedWorlds.map((cw) => {
                  const isSel = logic.selectedWorld?.id === cw.id
                  const isPendingDelete = logic.pendingDeleteWorldId === cw.id
                  return (
                    <div key={cw.id} className={`${styles.card} ${isSel ? styles.cardSelected : ''}`}>
                      <div className={styles.savedCardContent} onClick={() => logic.handleSelectCustomWorld(cw)}>
                        <div className={styles.savedCardHeader}>
                          <h3 className={styles.savedCardTitle}>{cw.name}</h3>
                        </div>
                        <p className={styles.savedCardDesc}>
                          {cw.eraName}{Math.abs(cw.eraStartYear)}年 · {cw.description.slice(0, 30)}...
                        </p>
                      </div>
                      <div className={styles.cardBadge}>
                        {logic.worldCodesWithCache.has(cw.worldCode) && (
                          <span className={styles.cardBadgeBtn}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); logic.handleClearWorldCache(cw.worldCode) }}
                              className={`${styles.btnRefresh} ${logic.rotatingWorldCode === cw.worldCode ? styles.spinning : ''}`}
                              title={L.clearCacheTitle}
                            >🔄</button>
                          </span>
                        )}
                        <span className={styles.cardBadgeBtn}>
                          <button
                            onClick={(e) => { e.stopPropagation(); logic.handleStartEdit(cw) }}
                            className={styles.btnEdit}
                            title={L.editTitle}
                          >✏️</button>
                        </span>
                        <span className={styles.cardBadgeBtn}>
                          {isPendingDelete ? (
                            <span className={styles.deleteConfirmGroup}>
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
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); logic.handleDeleteCustom(cw) }}
                              className={styles.btnDelete}
                              title={L.deleteTitle}
                            >🗑️</button>
                          )}
                        </span>
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

          {/* Custom World Form */}
          {logic.showCustomForm && (
            <div className={styles.formContainer}>
              <h3 className={styles.formTitle}>
                {logic.editingWorldId ? L.formEditTitle : L.formCreateTitle}
              </h3>

              {/* World Name */}
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

              {/* World Description */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{L.formLabelDesc}</label>
                <textarea
                  placeholder={L.formPlaceholderDesc}
                  value={logic.customDesc}
                  onChange={(e) => logic.setCustomDesc(e.target.value.slice(0, 5000))}
                  maxLength={5000}
                  className={`${styles.formInput} ${styles.formTextarea}`}
                />
                <div className={`${styles.formCharCount} ${logic.customDesc.length > 4500 ? styles.formCharCountWarn : ''}`}>
                  {logic.customDesc.length}/5000
                </div>
              </div>

              {/* Era Name + Year */}
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
                    style={{ width: 130 }}
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder={L.formPlaceholderYear}
                    value={logic.customEraYear}
                    onChange={(e) => logic.setCustomEraYear(e.target.value)}
                    className={styles.formInput}
                    style={{ width: 100 }}
                  />
                  <span className={styles.eraInlineLabel}>{L.eraYearUnit}</span>
                  <div className={styles.eraSwitchRow} style={{ marginLeft: 'auto' }}>
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
              <div className={styles.actions}>
                {logic.editingWorldId ? (
                  <>
                    <button
                      onClick={logic.handleSaveEdit}
                      disabled={!logic.customName.trim() || !logic.customDesc.trim()}
                      title={L.saveEditTitle}
                      className={styles.btnPrimary}
                    >{L.btnSaveEdit}</button>
                    <button
                      onClick={logic.handleCancelEdit}
                      title={L.cancelEditTitle}
                      className={styles.btnSecondary}
                    >{L.btnCancel}</button>
                  </>
                ) : (
                  <button
                    onClick={logic.handleAddCustom}
                    disabled={!logic.customName.trim() || !logic.customDesc.trim()}
                    title={L.addCustomTitle}
                    className={styles.btnSecondary}
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

export default WorldSelectDesktop
