'use client'

/**
 * @file WorldCustomizeMobile.tsx
 * @description 世界配置响应式白纸创建流视图。
 * @mod mod-pages
 */

import { useWorldStore } from '@/mods/mod-world'

import { WorldCustomizeBottomBar } from './WorldCustomizeBottomBar'
import { WorldCustomizeDimensionCard } from './WorldCustomizeDimensionCard'
import { useWorldCustomize } from './useWorldCustomize'

import styles from './WorldCustomizeMobile.module.css'

export function WorldCustomizeMobile() {
  const logic = useWorldCustomize()
  const macroFields = logic.groupedFields.macro ?? []
  const worldConfig = useWorldStore((state) => state.worldConfig)

  return (
    <>
      {logic.conflictModal}
      <main className={styles.page} aria-busy={logic.isSaving}>
        <div className={styles.container}>
          <div className={styles.paper}>
            <span className={styles.spine} aria-hidden="true" />
            <header className={styles.header}>
              <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>02 / 08</span></div>
              <div className={styles.titleRow}>
                <div>
                  <h1>配置世界</h1>
                  <p>确认这段人生的底层规则。</p>
                </div>
                <span className={styles.titleMark} aria-hidden="true"><span>02</span></span>
              </div>
            </header>

            <section className={styles.worldSummary} aria-live="polite" aria-label="当前世界规则摘要">
              <div>
                <span>{worldConfig ? '保存世界' : '自定义世界'}</span>
                <span>当前选择</span>
              </div>
              <div className={styles.summaryCopy} aria-label="人生难度">
                <span>难度</span>
                <strong>普通</strong>
              </div>
              <h3>{worldConfig?.name ?? '潮汐城邦'}</h3>
              <div>群岛历 218 年</div>
              <div>
                <span>规则摘要</span>
                <p>潮汐决定城市的贸易节律、迁徙方向与每个人回家的时间。</p>
              </div>
              <div className={styles.summaryFacts} aria-label="世界概览">
                <div><span>来源</span><strong>{worldConfig ? '已保存' : '自定义'}</strong></div>
                <div><span>年代</span><strong>群岛历</strong></div>
                <div><span>难度</span><strong>普通</strong></div>
              </div>
            </section>

            <section className={`${styles.paperSection} ${styles.descriptionSection}`}>
              <div className={styles.sectionHeading}>
                <label htmlFor="world-description">世界描述</label>
                <span>{logic.worldDescription.length} 字</span>
              </div>
              <textarea
                id="world-description"
                className={styles.descriptionInput}
                value={logic.worldDescription}
                rows={3}
                disabled={logic.isSaving}
                placeholder="补充世界背景、氛围、禁忌或核心规则…"
                onChange={(event) => logic.setWorldDescription(event.target.value)}
              />
            </section>

            <section className={`${styles.paperSection} ${styles.rulesSection}`}>
              <div className={styles.sectionHeading}>
                <strong>世界规则</strong><span>从基础形态到力量边界</span>
              </div>
              <ol
                className={`${styles.dimensionList} ${logic.isSaving ? styles.controlsDisabled : ''}`}
                aria-busy={logic.isSaving}
                inert={logic.isSaving ? true : undefined}
              >
                {macroFields.map((field) => (
                  <WorldCustomizeDimensionCard
                    key={field.key}
                    field={field}
                    onModeChange={(mode) => logic.setFieldMode(field.key, mode)}
                    onValueChange={(value) => logic.setFieldValue(field.key, value)}
                    onCustomChange={(value) => logic.setCustomValue(field.key, value)}
                  />
                ))}
              </ol>
            </section>

            {logic.saveError && <p className={styles.errorMessage} role="alert">{logic.saveError}</p>}
          </div>
        </div>
      </main>
      <WorldCustomizeBottomBar
        onBack={logic.skip}
        onConfirm={logic.save}
        isSaving={logic.isSaving}
        canConfirm={logic.canSave}
        blockedReason={logic.saveBlockReason}
        worldName={worldConfig?.name ?? '当前世界'}
      />
    </>
  )
}

export default WorldCustomizeMobile
