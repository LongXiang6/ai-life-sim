/**
 * Purpose: Render reading, motion, font, and narrative-display preferences.
 * Owner: mod-settings/settings-ui
 * Responsibility: Presentation preferences only; data import, export, and reset live in SettingsDataManagement.
 */

'use client'

import { useFontStore } from '@/core/theme/font-store'
import { THEME_LABELS, THEME_TYPES, useThemeStore, type ThemeType } from '@/core/theme/theme-store'

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

const THEME_OPTIONS: Array<{ id: ThemeType; label: string; description: string }> = [
  { id: 'reading', label: '阅读主题', description: '淡黄色纸面，适合长文阅读' },
  { id: 'night', label: '暗夜主题', description: '低亮度深色，夜间更舒适' },
  { id: 'white', label: '白色主题', description: '中性白色，清爽明亮' },
  { id: 'colorful', label: '多彩主题', description: '阅读纸面，彩色辅助更丰富' },
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
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const fontFamily = useFontStore((state) => state.fontFamily)
  const setFontFamily = useFontStore((state) => state.setFontFamily)
  const currentFontLabel = FONT_OPTIONS.find((font) => font.id === fontFamily)?.label ?? '默认'

  return (
    <div className={styles.tabRoot}>
      <section className={styles.section} aria-labelledby="settings-theme-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-theme-heading">主题</h3>
          <span>当前：{THEME_LABELS[theme]}</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.themeGrid} role="group" aria-label="主题选择">
            {THEME_TYPES.map((themeId) => {
              const option = THEME_OPTIONS.find((item) => item.id === themeId)
              if (!option) return null
              return (
                <button
                  key={themeId}
                  type="button"
                  className={styles.themeButton}
                  data-theme-option={themeId}
                  aria-pressed={theme === themeId}
                  onClick={() => setTheme(themeId)}
                >
                  <span className={styles.themeSwatch} data-theme-preview={themeId} aria-hidden="true">
                    <span />
                    <i />
                    <b />
                  </span>
                  <span className={styles.themeCopy}>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              )
            })}
          </div>
          <p className={styles.supportingText}>阅读主题中的彩色标记只用于状态、分类和提示等辅助信息，不会铺满正文背景。</p>
        </div>
      </section>

      <section className={styles.section} aria-label="段落排版">
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

      <section className={styles.section} aria-label="动态表现">
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

      <section className={styles.section} aria-label="字体选择">
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

      <section className={styles.section} aria-label="叙事显示方式">
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
