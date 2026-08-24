/** Purpose: Compose the finalized character creation page. Owner: mod-pages. Responsibility: Page layout and public logic projection only. */

'use client'

/**
 * @file CharacterCreateMobile.tsx
 * @description 角色创建响应式白纸创建流视图。
 * @mod mod-pages
 */

import { useWorldStore } from '@/mods/mod-world'
import { FlowRunningHead } from '@/mods/mod-ui'

import { CharacterBackgroundSection } from './CharacterBackgroundSection'
import { CharacterCustomOptionsSection } from './CharacterCustomOptionsSection'
import { CharacterCreateBottomBar } from './CharacterCreateBottomBar'
import { CharacterIdentitySection } from './CharacterIdentitySection'
import { CharacterLifespanSection } from './CharacterLifespanSection'
import { useCharacterCreateLogic } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

export function CharacterCreateMobile() {
  const logic = useCharacterCreateLogic()
  const worldName = useWorldStore((state) => state.worldConfig?.name ?? '当前世界')
  const lifespanDisplay = logic.computedLifespan
    ?? (logic.manualLifespan ? Number.parseInt(logic.manualLifespan, 10) : logic.raceInfo?.baseLifespanYears)
    ?? '自动'
  const startingAgeDisplay = logic.computedStartingAge
    ?? (logic.manualStartingAge ? Number.parseInt(logic.manualStartingAge, 10) : 0)

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={styles.page}>
            <div className={styles.container}>
              <div className={`${styles.paper} final-flow-page-surface`}>
            <FlowRunningHead stepLabel="02 / 07" />

            <section className={styles.profileSummary} aria-live="polite">
              <span className={styles.profileAvatar} aria-hidden="true">📜</span>
              <div className={styles.profileCopy}>
                <strong>{logic.name.trim() || '未命名角色'}</strong>
                <span>
                  {logic.gender === 'male' ? '男性' : logic.gender === 'female' ? '女性' : logic.gender}
                  {' · '}{logic.getRaceDisplayName(logic.race)}
                </span>
              </div>
              <div className={styles.profileFacts}>
                <div><span>⏳ 寿命</span><strong>{typeof lifespanDisplay === 'number' ? `${lifespanDisplay} 年` : lifespanDisplay}</strong></div>
                <div><span>🌅 起始</span><strong>{startingAgeDisplay > 0 ? `${startingAgeDisplay} 岁` : '出生'}</strong></div>
                <div><span>🌌 世界</span><strong>{worldName}</strong></div>
              </div>
            </section>

            <div className={styles.flowSections}>
              <CharacterIdentitySection logic={logic} />
              <CharacterLifespanSection logic={logic} />
              <CharacterCustomOptionsSection logic={logic} />
              <CharacterBackgroundSection logic={logic} />
            </div>
              </div>
            </div>
          </main>
          <CharacterCreateBottomBar logic={logic} />
        </div>
      </div>
    </div>
  )
}

export default CharacterCreateMobile
