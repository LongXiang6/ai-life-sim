/** Purpose: Render the finalized preset-world grid. Owner: mod-pages. Responsibility: Preset selection presentation and event forwarding only. */

import type { WorldSelectLogic } from './world-select.types'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectMainGrid({ logic }: { logic: WorldSelectLogic }) {
  return (
    <div className={styles.mainGrid}>
      {logic.presetMain.map((world) => {
        const selected = logic.selectedWorld?.id === world.id

        return (
          <div key={world.id} className={styles.worldCardWrap}>
            <button
              type="button"
              onClick={() => logic.handleSelectPreset(world)}
              className={`${styles.worldCard} ${selected ? styles.worldCardSelected : ''}`}
              aria-pressed={selected}
              data-selected={selected}
              disabled={logic.isConfirming}
            >
              <span className={styles.worldIcon} data-semantic-emoji aria-hidden="true">{world.icon}</span>
              <span className={styles.worldName}>{world.name}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
