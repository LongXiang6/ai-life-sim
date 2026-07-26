'use client'

import { useState } from 'react'

import { useSettingsStore } from '../store'

import styles from './SettingsTabNarrative.module.css'

const STYLE_PLACEHOLDER = '例如：采用克制、具体的第二人称叙事；多写行动和对话，少用总结性评价；保持人物反应与既有事实连续。'

function normalizeWordCount(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.min(5000, Math.max(50, Math.round(parsed)))
    : fallback
}

export function SettingsTabNarrative() {
  const {
    narrativeStyleText,
    narrativeStyleVersion,
    wordCountTarget,
    saveNarrativeStyleText,
    restoreDefaultNarrativeStyle,
    setWordCountTarget,
  } = useSettingsStore()
  const [styleDraft, setStyleDraft] = useState<string | null>(null)
  const [wordCountDraft, setWordCountDraft] = useState<string | null>(null)

  const currentStyleDraft = styleDraft ?? narrativeStyleText
  const currentWordCountDraft = wordCountDraft ?? String(wordCountTarget)
  const styleDirty = styleDraft !== null && styleDraft !== narrativeStyleText
  const commitWordCount = () => {
    const next = normalizeWordCount(currentWordCountDraft, wordCountTarget)
    setWordCountTarget(next)
    setWordCountDraft(null)
  }

  return (
    <div className={styles.tabRoot}>
      <section className={styles.section} aria-labelledby="settings-style-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-style-heading">基础文风</h3>
          <span>{narrativeStyleText ? `自定义 · 第 ${narrativeStyleVersion} 版` : '项目默认'}</span>
        </div>
        <div className={styles.sectionBody}>
          <textarea
            className={styles.styleInput}
            value={currentStyleDraft}
            rows={7}
            placeholder={STYLE_PLACEHOLDER}
            aria-label="自定义基础文风"
            onChange={(event) => setStyleDraft(event.target.value)}
          />
          <div className={styles.styleMeta}>
            <span>{currentStyleDraft.length.toLocaleString('zh-CN')} 字符</span>
            <span>{styleDirty ? '尚未保存' : '当前已生效'}</span>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!narrativeStyleText && !currentStyleDraft}
              onClick={() => {
                restoreDefaultNarrativeStyle()
                setStyleDraft(null)
              }}
            >
              恢复默认
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!styleDirty}
              onClick={() => {
                saveNarrativeStyleText(currentStyleDraft)
                setStyleDraft(null)
              }}
            >
              保存当前风格
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-word-count-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-word-count-heading">每轮叙事目标字数</h3>
          <span>{wordCountTarget.toLocaleString('zh-CN')} 字</span>
        </div>
        <div className={styles.wordCountBody}>
          <label className={styles.wordCountControl}>
            <span>目标字数</span>
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              value={currentWordCountDraft}
              onChange={(event) => setWordCountDraft(event.target.value)}
              onBlur={commitWordCount}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitWordCount()
                  event.currentTarget.blur()
                }
              }}
            />
            <b>字</b>
          </label>
        </div>
      </section>
    </div>
  )
}
