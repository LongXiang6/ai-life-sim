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
              return (
                <div key={world.id} className={styles.moreWorldCardWrap}>
                  <button
                    type="button"
                    className={`${styles.moreWorldCard} ${selected ? styles.moreWorldCardSelected : ''}`}
                    onClick={() => logic.handleSelectPreset(world)}
                    aria-pressed={selected}
                    disabled={logic.isConfirming}
                  >
                    <span className={styles.worldIcon} data-semantic-emoji aria-hidden="true">{world.icon}</span>
                    <span>{world.name}</span>
                    <small>{world.description.slice(0, 20)}</small>
                  </button>
                  {logic.worldCodesWithCache.has(worldCode) && (
                    <button
                      type="button"
                      aria-label={`${L.clearCacheTitle}：${world.name}`}
                      title={`${L.clearCacheTitle}：${world.name}`}
                      className={`${styles.inlineCacheButton} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        logic.handleClearWorldCache(worldCode)
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '5px' }}>
          {logic.savedWorlds.map((world) => {
            const selected = logic.selectedWorld?.id === world.id
            return (
              <article key={world.id} className={`${styles.savedWorldCard} ${selected ? styles.savedWorldSelected : ''}`}>
                <button
                  type="button"
                  className={styles.savedWorldMain}
                  onClick={() => logic.handleSelectCustomWorld(world)}
                  aria-pressed={selected}
                  disabled={logic.isConfirming}
                >
                  <strong>{world.name}</strong>
                  <span>{world.eraName}{Math.abs(world.eraStartYear)}年 · 最近修改</span>
                </button>
                <span aria-hidden="true">已选</span>
                {selected && (
                  <div className={styles.savedActions}>
                    {logic.worldCodesWithCache.has(world.worldCode) && (
                      <button
                        type="button"
                        onClick={() => logic.handleClearWorldCache(world.worldCode)}
                        disabled={logic.isConfirming || logic.rotatingWorldCode === world.worldCode}
                        title={`${L.clearCacheTitle}：${world.name}`}
                      >{logic.rotatingWorldCode === world.worldCode ? '清理中…' : '↻ 清缓存'}</button>
                    )}
                    <button type="button" onClick={() => { logic.handleStartEdit(world); onRequestCustom() }} disabled={logic.isConfirming}>{L.editTitle}</button>
                    {logic.pendingDeleteWorldId === world.id ? (
                      <>
                        <button type="button" className={styles.dangerAction} onClick={() => logic.handleConfirmDeleteCustom(world)} disabled={logic.isConfirming}>确认删除</button>
                        <button type="button" onClick={logic.handleCancelDeleteCustom} disabled={logic.isConfirming}>取消</button>
                      </>
                    ) : (
                      <button type="button" className={styles.dangerAction} onClick={() => logic.handleDeleteCustom(world)} disabled={logic.isConfirming}>{L.deleteTitle}</button>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
