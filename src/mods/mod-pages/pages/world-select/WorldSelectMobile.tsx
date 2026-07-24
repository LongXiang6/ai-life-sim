/**
 * @file WorldSelectMobile.tsx
 * @description 世界选择响应式白纸创建流视图。
 * @mod mod-pages
 */

'use client'

import { useState } from 'react'

import { WorldSelectBottomBar } from './WorldSelectBottomBar'
import { WorldSelectDirectory } from './WorldSelectDirectory'
import { WorldSelectMainGrid } from './WorldSelectMainGrid'
import { WorldSelectStage } from './WorldSelectStage'
import { useWorldSelectLogic } from './useWorldSelectLogic'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectMobile() {
  const logic = useWorldSelectLogic()
  const [activeSource, setActiveSource] = useState<'saved' | 'preset' | 'custom'>(() =>
    logic.savedWorlds.length > 0 ? 'saved' : 'preset',
  )

  return (
    <div className="final-flow-frame">
      <div className="final-flow-design-fit">
        <div className="final-flow-design-canvas">
          {logic.conflictModal}
          <main className={styles.page} aria-busy={logic.isConfirming}>
            <div className={styles.container}>
              <div className={styles.paper}>
            <header className={styles.header}>
              <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>01 / 08</span></div>
              <div className={styles.titleRow}>
                <h1 className={styles.headerTitle}>选择世界</h1>
              </div>
            </header>

            <WorldSelectStage logic={logic} />

            <div className={styles.sourceTabs} role="tablist" aria-label="世界来源">
              {([
                ['saved', '已保存'],
                ['custom', '自定义'],
                ['preset', '预设世界'],
              ] as const).map(([source, label]) => (
                <button
                  key={source}
                  type="button"
                  id={`world-source-tab-${source}`}
                  role="tab"
                  aria-selected={activeSource === source}
                  aria-controls={`world-source-panel-${source}`}
                  className={activeSource === source ? styles.sourceTabActive : ''}
                  onClick={() => setActiveSource(source)}
                  disabled={logic.isConfirming}
                >
                  {label}
                </button>
              ))}
            </div>

            <section
              id="world-source-panel"
              className={styles.sourcePanel}
              role="tabpanel"
              aria-labelledby={`world-source-tab-${activeSource}`}
              aria-live="polite"
            >
              {activeSource === 'preset' && (
                <div className={styles.directoryPanel} data-active="true">
                  <WorldSelectMainGrid logic={logic} />
                </div>
              )}
              <WorldSelectDirectory
                logic={logic}
                source={activeSource}
                onRequestCustom={() => setActiveSource('custom')}
              />
            </section>

            {logic.customFeedback && (
              <p className={`${styles.feedback} ${logic.customFeedback.type === 'warning' ? styles.feedbackWarning : styles.feedbackSuccess}`} role="status">
                {logic.customFeedback.text}
              </p>
            )}
            {logic.confirmError && <p className={styles.errorMessage} role="alert">{logic.confirmError}</p>}
              </div>
            </div>
          </main>
          <WorldSelectBottomBar logic={logic} />
        </div>
      </div>
    </div>
  )
}

export default WorldSelectMobile
