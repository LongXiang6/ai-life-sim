/**
 * Purpose: Render reading, motion, font, and narrative-display preferences.
 * Owner: mod-settings/settings-ui
 * Responsibility: Presentation preferences only; data import, export, and reset live in SettingsDataManagement.
 */

'use client'

import { useFontStore } from '@/core/theme/font-store'

import { useSettingsStore } from '../store'

import { SettingsDataManagement } from './SettingsDataManagement'
import styles from './SettingsTabTheme.module.css'

const FONT_OPTIONS = [
  { id: 'default' as const, label: '默认', description: '跟随系统字体' },
  { id: 'pingfang' as const, label: '苹方', description: '现代、清晰' },
  { id: 'yahei' as const, label: '雅黑', description: 'Windows 常用字体' },
  { id: 'source-han-sans' as const, label: '思源黑', description: '均衡的无衬线字体' },
  { id: 'songti' as const, label: '宋体', description: '适合长文阅读' },
  { id: 'heiti' as const, label: '黑体', description: '简洁、醒目' },
  { id: 'kaiti' as const, label: '楷体', description: '偏手写的阅读感' },
]

const STREAMING_OPTIONS = [
  { value: 'off' as const, label: '完整显示', description: '接收完成后一次显示，稳定性优先' },
  { value: 'stream' as const, label: '流式显示', description: '边接收边显示，响应速度优先' },
]

export function SettingsTabTheme() {
  const {
    streamingMode,
    comfortableParagraphs,
    reduceMotion,
    setStreamingMode,
    setComfortableParagraphs,
    setReduceMotion,
  } = useSettingsStore()
  const fontFamily = useFontStore((state) => state.fontFamily)
  const setFontFamily = useFontStore((state) => state.setFontFamily)
  const currentFontLabel = FONT_OPTIONS.find((font) => font.id === fontFamily)?.label ?? '默认'

  return (
    <div className={styles.tabRoot}>
      <p className={styles.preferenceIntro}>阅读与动效偏好只调整呈现方式。</p>

      <section className={styles.section} aria-labelledby="settings-reading-comfort-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-reading-comfort-heading">阅读排版</h3>
          <span>阅读体验</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingCopy}>
              <strong>段落舒展</strong>
              <small>为长叙事增加少量行间距</small>
            </div>
            <button
              type="button"
              className={styles.toggle}
              role="switch"
              aria-label="段落舒展"
              aria-checked={comfortableParagraphs}
              onClick={() => setComfortableParagraphs(!comfortableParagraphs)}
            />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-motion-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-motion-heading">动态表现</h3>
          <span>即时生效</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.settingRow}>
            <div className={styles.settingCopy}>
              <strong>减少动态效果</strong>
              <small>保留必要变化，降低装饰动画</small>
            </div>
            <button
              type="button"
              className={styles.toggle}
              role="switch"
              aria-label="减少动态效果"
              aria-checked={reduceMotion}
              onClick={() => setReduceMotion(!reduceMotion)}
            />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-appearance-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-appearance-heading">阅读排版</h3>
          <span>当前字体：{currentFontLabel}</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.optionGroup}>
            <div className={styles.groupHeading}>
              <span>字体选择</span>
              <span>当前：{currentFontLabel}</span>
            </div>
            <div className={styles.fontGrid} role="group" aria-label="字体选择">
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className={styles.fontButton}
                  data-font={font.id}
                  aria-pressed={fontFamily === font.id}
                  title={font.description}
                  onClick={() => setFontFamily(font.id)}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-narrative-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-narrative-heading">叙事显示</h3>
          <span>{streamingMode === 'off' ? '完整显示' : '流式显示'}</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.optionGroup}>
            <div className={styles.groupHeading}>
              <span>显示方式</span>
              <span>{streamingMode === 'off' ? '稳定性优先' : '响应速度优先'}</span>
            </div>
            <div className={styles.streamGrid} role="group" aria-label="叙事显示方式">
              {STREAMING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.choiceButton}
                  aria-pressed={streamingMode === option.value}
                  onClick={() => setStreamingMode(option.value)}
                >
                  <span className={styles.choiceTitle}>{option.label}</span>
                  <span className={styles.choiceDescription}>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SettingsDataManagement />
    </div>
  )
}
