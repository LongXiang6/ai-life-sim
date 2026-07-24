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
    <>
      {logic.conflictModal}
      <main className={styles.page} aria-busy={logic.isConfirming}>
        <div className={styles.container}>
          <div className={styles.paper}>
            <span className={styles.spine} aria-hidden="true" />
            <header className={styles.header}>
              <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>01 / 08</span></div>
              <div className={styles.titleRow}>
                <div>
                  <h1 className={styles.headerTitle}>选择世界</h1>
                  <p className={styles.headerSubtitle}>决定这段人生从哪一方天地开始。</p>
                </div>
                <span className={styles.titleMark} aria-hidden="true"><span>01</span></span>
              </div>
            </header>

            <WorldSelectStage logic={logic} />

            <div className={styles.sourceTabs} role="tablist" aria-label="世界来源">
              {([
                ['saved', '01 · 已保存'],
                ['preset', '02 · 预设'],
                ['custom', '03 · 自定义'],
              ] as const).map(([source, label]) => (
                <button
                  key={source}
                  type="button"
                  id={`world-source-tab-${source}`}
                  role="tab"
                  aria-selected={activeSource === source}
                  aria-controls="world-source-panel"
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
                <>
                  <div className={styles.sectionHeading}>
                    <strong>预设世界</strong>
                    <span>{logic.presetMain.length} 个常用 · {logic.presetMore.length} 个扩展</span>
                  </div>
                  <WorldSelectMainGrid logic={logic} />
                </>
              )}
              <WorldSelectDirectory
                logic={logic}
                source={activeSource}
                onRequestCustom={() => setActiveSource('custom')}
              />
            </section>

            <section className={styles.difficultySection} aria-labelledby="difficulty-title">
              <div className={styles.sectionHeading}>
                <strong id="difficulty-title">人生难度</strong>
                <span>影响资源与事件压力</span>
              </div>
              <div className={styles.difficultyOptions}>
                {logic.difficultyItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={Boolean(item.icon)}
                    className={item.icon ? styles.difficultyActive : ''}
                    onClick={item.onClick}
                    disabled={logic.isConfirming}
                    title={item.title}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
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
    </>
  )
}

export default WorldSelectMobile
