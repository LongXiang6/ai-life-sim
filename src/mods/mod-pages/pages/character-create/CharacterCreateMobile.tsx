'use client'

/**
 * @file CharacterCreateMobile.tsx
 * @description 角色创建响应式白纸创建流视图。
 * @mod mod-pages
 */

import { useState } from 'react'

import { useWorldStore } from '@/mods/mod-world'

import { CharacterBackgroundSection } from './CharacterBackgroundSection'
import { CharacterCreateBottomBar } from './CharacterCreateBottomBar'
import { CharacterIdentitySection } from './CharacterIdentitySection'
import { CharacterLifespanSection } from './CharacterLifespanSection'
import { useCharacterCreateLogic } from './useCharacterCreateLogic'

import styles from './CharacterCreateMobile.module.css'

type CharacterPanel = 'identity' | 'lifespan' | 'background'

const CHARACTER_PANELS: ReadonlyArray<{ id: CharacterPanel; label: string }> = [
  { id: 'identity', label: '01 · 身份' },
  { id: 'lifespan', label: '02 · 寿命' },
  { id: 'background', label: '03 · 背景' },
]

export function CharacterCreateMobile() {
  const logic = useCharacterCreateLogic()
  const [activePanel, setActivePanel] = useState<CharacterPanel>('identity')
  const worldName = useWorldStore((state) => state.worldConfig?.name ?? '当前世界')
  const lifespanDisplay = logic.computedLifespan
    ?? (logic.manualLifespan ? Number.parseInt(logic.manualLifespan, 10) : logic.raceInfo?.baseMaxAge)
    ?? '自动'
  const startingAgeDisplay = logic.computedStartingAge
    ?? (logic.manualStartingAge ? Number.parseInt(logic.manualStartingAge, 10) : 0)

  return (
    <>
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.paper}>
            <span className={styles.spine} aria-hidden="true" />
            <header className={styles.header}>
              <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>04 / 08</span></div>
              <div className={styles.titleRow}>
                <div>
                  <h1>塑造角色</h1>
                  <p>写下这段人生的起点。</p>
                </div>
                <span className={styles.titleMark} aria-hidden="true"><span>04</span></span>
              </div>
            </header>

            <section className={styles.profileSummary} aria-live="polite">
              <span className={styles.profileAvatar} aria-hidden="true">人</span>
              <div className={styles.profileCopy}>
                <strong>{logic.name.trim() || '未命名角色'}</strong>
                <span>
                  {logic.gender === 'male' ? '男性' : logic.gender === 'female' ? '女性' : logic.gender}
                  {' · '}{logic.getRaceDisplayName(logic.race)}
                  {' · '}{logic.background.trim() ? '已填写背景' : '尚未填写背景'}
                </span>
              </div>
              <div className={styles.profileFacts}>
                <div><span>寿命</span><strong>{typeof lifespanDisplay === 'number' ? `${lifespanDisplay} 年` : lifespanDisplay}</strong></div>
                <div><span>起始</span><strong>{startingAgeDisplay > 0 ? `${startingAgeDisplay} 岁` : '出生'}</strong></div>
                <div><span>世界</span><strong>{worldName}</strong></div>
              </div>
            </section>

            <nav className={styles.panelTabs} role="tablist" aria-label="角色创建步骤">
              {CHARACTER_PANELS.map((panel) => (
                <button
                  key={panel.id}
                  id={`character-tab-${panel.id}`}
                  type="button"
                  role="tab"
                  aria-controls={`character-panel-${panel.id}`}
                  aria-selected={activePanel === panel.id}
                  className={activePanel === panel.id ? styles.panelTabActive : ''}
                  onClick={() => setActivePanel(panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </nav>

            <div className={styles.panelArea}>
              <div
                id="character-panel-identity"
                role="tabpanel"
                aria-labelledby="character-tab-identity"
                hidden={activePanel !== 'identity'}
              >
                <CharacterIdentitySection logic={logic} />
              </div>
              <div
                id="character-panel-lifespan"
                role="tabpanel"
                aria-labelledby="character-tab-lifespan"
                hidden={activePanel !== 'lifespan'}
              >
                <CharacterLifespanSection logic={logic} />
              </div>
              <div
                id="character-panel-background"
                role="tabpanel"
                aria-labelledby="character-tab-background"
                hidden={activePanel !== 'background'}
              >
                <CharacterBackgroundSection logic={logic} />
              </div>
            </div>
          </div>
        </div>
      </main>
      <CharacterCreateBottomBar logic={logic} />
    </>
  )
}

export default CharacterCreateMobile
