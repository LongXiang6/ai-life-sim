import { resolvePresetWorldCode } from '@/mods/mod-world'

import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectMainGrid({ logic }: { logic: WorldSelectLogic }) {
  return (
    <div className={styles.mainGrid}>
      {logic.presetMain.map((world) => {
        const selected = logic.selectedWorld?.id === world.id
        const worldCode = resolvePresetWorldCode(world)
        const hasCache = logic.worldCodesWithCache.has(worldCode)

        return (
          <div key={world.id} className={styles.worldCardWrap}>
            <button
              type="button"
              onClick={() => logic.handleSelectPreset(world)}
              className={`${styles.worldCard} ${hasCache ? styles.worldCardWithCache : ''} ${selected ? styles.worldCardSelected : ''}`}
              aria-pressed={selected}
              disabled={logic.isConfirming}
            >
              <span className={styles.worldIcon} data-semantic-emoji aria-hidden="true">{world.icon}</span>
              <span className={styles.worldName}>{world.name}</span>
              {selected && <span className={styles.selectedMark} aria-hidden="true">✓</span>}
            </button>
            {hasCache && (
              <button
                type="button"
                aria-label={`${logic.LABELS.clearCacheTitle}：${world.name}`}
                title={`${logic.LABELS.clearCacheTitle}：${world.name}`}
                className={`${styles.cacheButton} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
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
  )
}
