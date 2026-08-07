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
  const difficultyLabels: Record<string, string> = {
    normal: '普通',
    hard: '困难',
    nightmare: '噩梦',
    hell: '地狱',
  }
  const difficultyLabel = difficultyLabels[worldConfig?.difficulty ?? 'normal'] ?? '普通'
  const eraName = worldConfig?.eraName?.trim() || '待确定'
  const eraStartYear = worldConfig?.eraStartYear
  const eraLabel = typeof eraStartYear === 'number' && Number.isFinite(eraStartYear) && eraStartYear !== 0
    ? `${eraName} ${eraStartYear} 年`
    : eraName
  const ruleSummary = (logic.worldDescription || worldConfig?.description || '').trim()
    || '确认这段人生的底层规则与世界描述。'
  const sourceLabel = worldConfig ? '已保存' : '自定义'
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
              <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>02 / 08</span></div>
              <div className={styles.titleRow}>
                <div>
                  <h1>世界创作工坊</h1>
                  <p>确认这段人生的底层规则。</p>
                </div>
              </div>
            </header>

            <section className={styles.worldSummary} aria-live="polite" aria-label="当前世界规则摘要">
              <div className={styles.summaryTop}>
                <span>{worldConfig ? '保存世界' : '自定义世界'}</span>
                <span>当前选择</span>
              </div>
              <div className={styles.summaryDifficulty} aria-label={`人生难度：${difficultyLabel}`}>
                <span>难度</span>
                <strong>{difficultyLabel}</strong>
                <span className={styles.summaryDifficultyIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                </span>
              </div>
              <h3>{worldConfig?.name ?? '尚未命名世界'}</h3>
              <div className={styles.summaryEra}>{eraLabel}</div>
              <div className={styles.summaryRule}>
                <span>规则摘要</span>
                <p>{ruleSummary}</p>
              </div>
              <div className={styles.summaryFacts} aria-label="世界概览">
                <div><span>来源</span><strong>{sourceLabel}</strong></div>
                <div><span>年代</span><strong>{eraName}</strong></div>
                <div><span>难度</span><strong>{difficultyLabel}</strong></div>
              </div>
            </section>

            <section className={`${styles.paperSection} ${styles.previewSection}`} aria-labelledby="world-rule-preview-title">
              <div className={styles.sectionHeading}>
                <strong id="world-rule-preview-title">世界规则预览</strong>
                <span>四项规则实时预览</span>
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
                <span>统一游戏历法</span>
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
        </div>
      </div>
    </div>
  )
}

export default WorldCustomizeMobile
