/** Purpose: Compose the finalized world customization page. Owner: mod-pages. Responsibility: Page layout and public world-configuration wiring only. */

'use client'

/**
 * @file WorldCustomizeMobile.tsx
 * @description 世界配置响应式白纸创建流视图。
 * @mod mod-pages
 */

import { useWorldStore } from '@/mods/mod-world'
import { FlowRunningHead } from '@/mods/mod-ui'

import { WorldCustomizeBottomBar } from './WorldCustomizeBottomBar'
import { WorldCustomizeDimensionCard } from './WorldCustomizeDimensionCard'
import { useWorldCustomize } from './useWorldCustomize'
import type { EditableField } from './world-customize.types'

import styles from './WorldCustomizeMobile.module.css'

function getEffectiveFieldValue(field: EditableField | undefined): string {
  if (!field) return '待确定'
  if (field.mode === 'custom') return field.customValue.trim() || '待补充'
  if (field.mode === 'adaptive') return field.playerValue.trim() || '待选择'
  return '由 AI 生成'
}

export function WorldCustomizeMobile() {
  const logic = useWorldCustomize()
  const macroFields = logic.groupedFields.macro ?? []
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const rulePreview = logic.fields.map((field) => ({
    key: field.key,
    icon: field.icon,
    label: field.label,
    value: getEffectiveFieldValue(field),
  }))

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          {logic.conflictModal}
          <main className={styles.page} aria-busy={logic.isSaving}>
            <div className={styles.container}>
              <div className={`${styles.paper} final-flow-page-surface`}>
            <span className={styles.spine} aria-hidden="true" />
            <header className={styles.header}>
              <FlowRunningHead stepLabel="02 / 08" />
              <h1>世界创作工坊</h1>
            </header>

            <section className={`${styles.paperSection} ${styles.previewSection}`} aria-labelledby="world-rule-preview-title">
              <div className={styles.sectionHeading}>
                <strong id="world-rule-preview-title">世界规则预览</strong>
              </div>
              <div className={styles.rulePreviewGrid}>
                {rulePreview.map((item) => (
                  <div key={item.key} className={styles.rulePreviewItem}>
                    <span className={styles.rulePreviewIcon} aria-hidden="true">{item.icon}</span>
                    <span className={styles.rulePreviewCopy}>
                      <strong>{item.label}</strong>
                      <small>{item.value}</small>
                    </span>
                  </div>
                ))}
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

            <section className={styles.paperSection} aria-labelledby="festival-scope-title">
              <div className={styles.sectionHeading}>
                <strong id="festival-scope-title">节日范围</strong>
              </div>
              <div className={styles.festivalControl} role="group" aria-label="节日范围">
                <button
                  type="button"
                  className={logic.festivalScope === 'china' ? styles.festivalActive : undefined}
                  aria-pressed={logic.festivalScope === 'china'}
                  disabled={logic.isSaving}
                  onClick={() => logic.setFestivalScope('china')}
                >
                  仅中国节日
                </button>
                <button
                  type="button"
                  className={logic.festivalScope === 'china-and-international' ? styles.festivalActive : undefined}
                  aria-pressed={logic.festivalScope === 'china-and-international'}
                  disabled={logic.isSaving}
                  onClick={() => logic.setFestivalScope('china-and-international')}
                >
                  中国及国际节日
                </button>
              </div>
            </section>

            <section className={`${styles.paperSection} ${styles.rulesSection}`}>
              <div className={styles.sectionHeading}>
                <strong>世界规则</strong>
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
        </div>
      </div>
    </div>
  )
}

export default WorldCustomizeMobile
