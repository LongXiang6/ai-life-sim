import { resolvePresetWorldCode } from '@/mods/mod-world'

import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

function getWorldMark(name: string) {
  return Array.from(name.trim()).find((character) => /[\p{L}\p{N}]/u.test(character)) ?? '界'
}

export function WorldSelectMainGrid({ logic }: { logic: WorldSelectLogic }) {
  return (
    <div className={styles.mainGrid}>
      {logic.presetMain.map((world) => {
        const selected = logic.selectedWorld?.id === world.id
        const worldCode = resolvePresetWorldCode(world)

        return (
          <div key={world.id} className={styles.worldCardWrap}>
            <button
              type="button"
              onClick={() => logic.handleSelectPreset(world)}
              className={`${styles.worldCard} ${selected ? styles.worldCardSelected : ''}`}
              aria-pressed={selected}
              disabled={logic.isConfirming}
            >
              <span className={styles.worldIcon} aria-hidden="true">{getWorldMark(world.name)}</span>
              <span className={styles.worldName}>{world.name}</span>
              {selected && <span className={styles.selectedMark} aria-hidden="true">✓</span>}
            </button>
            {logic.worldCodesWithCache.has(worldCode) && (
              <button
                type="button"
                aria-label={`${logic.LABELS.clearCacheTitle}：${world.name}`}
                title={`${logic.LABELS.clearCacheTitle}：${world.name}`}
                className={`${styles.cacheButton} ${logic.rotatingWorldCode === worldCode ? styles.spinning : ''}`}
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
  )
}
