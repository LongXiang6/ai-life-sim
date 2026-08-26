/** Purpose: Compose the finalized world selection page. Owner: mod-pages. Responsibility: Page layout and public selection wiring only. */

/**
 * @file WorldSelectMobile.tsx
 * @description 世界选择响应式白纸创建流视图。
 * @mod mod-pages
 */

'use client'

import { useState } from 'react'

import { FlowRunningHead } from '@/mods/mod-ui'

import { WorldSelectBottomBar } from './WorldSelectBottomBar'
import { WorldSelectCacheResetDialog } from './WorldSelectCacheResetDialog'
import { WorldSelectDirectory } from './WorldSelectDirectory'
import { WorldSelectMainGrid } from './WorldSelectMainGrid'
import { WorldSelectStage } from './WorldSelectStage'
import { useWorldSelectLogic } from './useWorldSelectLogic'

import styles from './WorldSelectMobile.module.css'

export function WorldSelectMobile() {
  const logic = useWorldSelectLogic()
  const [activeSource, setActiveSource] = useState<'saved' | 'preset' | 'custom'>('preset')

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <main className={styles.page} aria-busy={logic.isConfirming}>
            <div className={`${styles.screen} final-flow-page-surface`}>
              <FlowRunningHead stepLabel="01 / 07" />
              <header className={styles.header}>
                <h1>选择世界</h1>
              </header>

              <WorldSelectStage logic={logic} />

              <nav className={styles.sourceTabs} role="tablist" aria-label="世界来源">
                {([
                  ['preset', '预设世界'],
                  ['saved', '已保存'],
                  ['custom', '自定义'],
                ] as const).map(([source, label]) => (
                  <button
                    key={source}
                    type="button"
                    id={`world-source-tab-${source}`}
                    role="tab"
                    aria-selected={activeSource === source}
                    aria-controls="world-source-panel"
                    data-active={activeSource === source}
                    onClick={() => setActiveSource(source)}
                    disabled={logic.isConfirming}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <section
                id="world-source-panel"
                className={styles.content}
                role="tabpanel"
                aria-labelledby={`world-source-tab-${activeSource}`}
                aria-live="polite"
              >
                {activeSource === 'preset' ? (
                  <div className={styles.panel} data-active="true">
                    <WorldSelectMainGrid logic={logic} />
                    <WorldSelectDirectory
                      logic={logic}
                      source="preset"
                      onRequestCustom={() => setActiveSource('custom')}
                    />
                  </div>
                ) : (
                  <WorldSelectDirectory
                    logic={logic}
                    source={activeSource}
                    onRequestCustom={() => setActiveSource('custom')}
                  />
                )}
              </section>

              {logic.customFeedback && (
                <p className={`${styles.feedback} ${logic.customFeedback.type === 'warning' ? styles.feedbackWarning : styles.feedbackSuccess}`} role="status">
                  {logic.customFeedback.text}
                </p>
              )}
              {logic.confirmError && <p className={styles.errorMessage} role="alert">{logic.confirmError}</p>}
            </div>
          </main>
          <WorldSelectCacheResetDialog logic={logic} />
          <WorldSelectBottomBar logic={logic} />
        </div>
      </div>
    </div>
  )
}

export default WorldSelectMobile
