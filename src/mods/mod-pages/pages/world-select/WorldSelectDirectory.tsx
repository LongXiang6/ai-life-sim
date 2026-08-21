/** Purpose: Render finalized world-source tabs and directories. Owner: mod-pages. Responsibility: World option presentation and event forwarding only. */

import { resolvePresetWorldCode } from '@/mods/mod-world'

import { WorldSelectCustomForm } from './WorldSelectCustomForm'
import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectDirectory({
  logic,
  source,
  onRequestCustom,
}: {
  logic: WorldSelectLogic
  source: 'saved' | 'preset' | 'custom'
  onRequestCustom: () => void
}) {
  const L = logic.LABELS
  const selectedSavedWorld = logic.filteredSavedWorlds.find((world) => logic.selectedWorld?.id === world.id)

  if (source === 'preset') {
    return (
      <div className={styles.directoryPanel} data-active="false">
        <button
          type="button"
          className={styles.moreTrigger}
          aria-expanded={logic.showMore}
          onClick={() => logic.setShowMore(!logic.showMore)}
          disabled={logic.isConfirming}
        >
          <span><strong>更多世界</strong></span>
        </button>
        {logic.showMore && (
          <div className={styles.moreGrid}>
            {logic.presetMore.map((world) => {
              const selected = logic.selectedWorld?.id === world.id
              const worldCode = resolvePresetWorldCode(world)
              const hasCache = logic.worldCodesWithCache.has(worldCode)
              return (
                <div key={world.id} className={styles.moreWorldCardWrap}>
                  <button
                    type="button"
                    className={`${styles.moreWorldCard} ${hasCache ? styles.moreWorldCardWithCache : ''} ${selected ? styles.moreWorldCardSelected : ''}`}
                    onClick={() => logic.handleSelectPreset(world)}
                    aria-pressed={selected}
                    data-selected={selected}
                    disabled={logic.isConfirming}
                  >
                    <span className={styles.worldIcon} data-semantic-emoji aria-hidden="true">{world.icon}</span>
                    <span>{world.name}</span>
                  </button>
                  {hasCache && (
                    <button
                      type="button"
                      aria-label={`${L.clearCacheTitle}：${world.name}`}
                      title={`${L.clearCacheTitle}：${world.name}`}
                      className={`${styles.inlineCacheButton} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        logic.handleRequestClearWorldCache(worldCode, world.name)
                      }}
                      disabled={logic.isConfirming}
                    >↻</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (source === 'custom') {
    return (
      <div className={styles.directoryPanel} data-active="true">
        <WorldSelectCustomForm logic={logic} />
      </div>
    )
  }

  return (
    <div className={styles.directoryPanel} data-active="true">
      {logic.savedWorlds.length === 0 ? (
        <div className={styles.emptyHint}>
          <p>{L.emptySavedHint}</p>
          <button type="button" onClick={onRequestCustom}>创建第一个世界</button>
        </div>
      ) : (
        <>
          <div className={styles.savedToolbar}>
            <label className={styles.savedSearchField}>
              <input
                type="search"
                value={logic.savedSearch}
                placeholder="搜索已保存世界"
                aria-label="搜索已保存世界"
                onChange={(event) => logic.setSavedSearch(event.target.value)}
                disabled={logic.isConfirming}
              />
            </label>
            <button
              type="button"
              className={styles.newWorldButton}
              onClick={onRequestCustom}
              disabled={logic.isConfirming}
            >
              新建世界
            </button>
          </div>
          <p className={styles.savedCount} aria-live="polite">
            已保存 {logic.filteredSavedWorlds.length} 个世界
            {logic.filteredSavedWorlds.length !== logic.savedWorlds.length ? `（匹配 ${logic.savedSearch.trim()}）` : ''}
          </p>
          <div className={styles.savedWorldList}>
            {logic.filteredSavedWorlds.map((world) => {
              const selected = logic.selectedWorld?.id === world.id
              return (
                <button
                  key={world.id}
                  type="button"
                  className={`${styles.savedWorldCard} ${selected ? styles.savedWorldSelected : ''}`}
                  onClick={() => logic.handleSelectCustomWorld(world)}
                  aria-pressed={selected}
                  data-selected={selected}
                  disabled={logic.isConfirming}
                >
                  <span className={styles.worldIcon} data-semantic-emoji aria-hidden="true">🌍</span>
                  <span className={styles.savedWorldMain}>
                    <strong>{world.name}</strong>
                    <small>{world.description || `${world.eraName}${Math.abs(world.eraStartYear)}年`}</small>
                  </span>
                  <span className={styles.savedWorldStatus} aria-hidden="true">已选</span>
                </button>
              )
            })}
          </div>
          {logic.filteredSavedWorlds.length === 0 && (
            <div className={styles.emptyHint}>
              <p>没有找到与「{logic.savedSearch.trim()}」匹配的已保存世界</p>
            </div>
          )}
          {selectedSavedWorld ? (
            <div className={styles.savedActions}>
              <button
                type="button"
                onClick={() => { logic.handleStartEdit(selectedSavedWorld); onRequestCustom() }}
                disabled={logic.isConfirming}
              >修改</button>
              {logic.worldCodesWithCache.has(selectedSavedWorld.worldCode) && (
                <button
                  type="button"
                  onClick={() => logic.handleRequestClearWorldCache(selectedSavedWorld.worldCode, selectedSavedWorld.name)}
                  disabled={logic.isConfirming || logic.rotatingWorldCode === selectedSavedWorld.worldCode}
                  title={`${L.clearCacheTitle}：${selectedSavedWorld.name}`}
                >重置</button>
              )}
              {logic.pendingDeleteWorldId === selectedSavedWorld.id ? (
                <>
                  <button
                    type="button"
                    className={styles.dangerAction}
                    onClick={() => logic.handleConfirmDeleteCustom(selectedSavedWorld)}
                    disabled={logic.isConfirming}
                  >确认删除</button>
                  <button type="button" onClick={logic.handleCancelDeleteCustom} disabled={logic.isConfirming}>取消</button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.dangerAction}
                  onClick={() => logic.handleDeleteCustom(selectedSavedWorld)}
                  disabled={logic.isConfirming}
                >删除</button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
