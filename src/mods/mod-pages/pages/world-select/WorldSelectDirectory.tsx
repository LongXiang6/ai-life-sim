import { resolvePresetWorldCode } from '@/mods/mod-world'

import { WorldSelectCustomForm } from './WorldSelectCustomForm'
import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

function getWorldMark(name: string) {
  return Array.from(name.trim()).find((character) => /[\p{L}\p{N}]/u.test(character)) ?? '界'
}

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
      <div className={styles.directoryPanel}>
        <button
          type="button"
          className={styles.moreTrigger}
          aria-expanded={logic.showMore}
          onClick={() => logic.setShowMore(!logic.showMore)}
          disabled={logic.isConfirming}
        >
          <span><strong>更多世界</strong><small>{logic.presetMore.length} 个扩展预设</small></span>
          <span aria-hidden="true">{logic.showMore ? '收起' : '展开'}</span>
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
                    <span className={styles.worldIcon} aria-hidden="true">{getWorldMark(world.name)}</span>
                    <span>{world.name}</span>
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
      <div className={styles.directoryPanel}>
        <div className={styles.panelIntro}>
          <strong>{logic.editingWorldId ? '编辑保存世界' : '创建自定义世界'}</strong>
          <span>名称与详细介绍必填；纪元和年号可继续细化。</span>
        </div>
        <WorldSelectCustomForm logic={logic} />
      </div>
    )
  }

  return (
    <div className={styles.directoryPanel}>
      <div className={styles.panelIntro}>
        <strong>已保存世界</strong>
        <span>{logic.savedWorlds.length > 0 ? `${logic.savedWorlds.length} 个可用记录` : '尚无保存记录'}</span>
      </div>
      {logic.savedWorlds.length === 0 ? (
        <div className={styles.emptyHint}>
          <p>{L.emptySavedHint}</p>
          <button type="button" onClick={onRequestCustom}>创建第一个世界</button>
        </div>
      ) : logic.savedWorlds.map((world) => {
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
              <span>{world.eraName}{Math.abs(world.eraStartYear)}年 · {world.description.slice(0, 72)}</span>
            </button>
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
          </article>
        )
      })}
    </div>
  )
}
