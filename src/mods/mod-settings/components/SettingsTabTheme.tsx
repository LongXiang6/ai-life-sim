'use client'

/**
 * @module SettingsTabTheme.tsx
 * @description "个性化" Tab —— 阅读排版、叙事显示、缓存与数据管理
 * @mod mod-settings
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { clearGameProgressFromLocalStorage, opfsStorage, safeCleanupReload } from '@/core'
import { DEFAULT_AI_MODEL, getCacheStats, getRoundCacheMetrics, resetCacheStats } from '@/core/ai-service'
import { clamp } from '@/core/shared'
import { useFontStore } from '@/core/theme/font-store'

import { DEFAULT_SETTINGS_VALUES, useSettingsStore } from '../store'
import type { NarrativeStyle } from '../store'

import styles from './SettingsTabTheme.module.css'

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

const FONT_OPTIONS = [
  { id: 'default' as const, label: '默认', description: '跟随系统字体' },
  { id: 'pingfang' as const, label: '苹方', description: '现代、清晰' },
  { id: 'yahei' as const, label: '雅黑', description: 'Windows 常用字体' },
  { id: 'source-han-sans' as const, label: '思源黑', description: '均衡的无衬线字体' },
  { id: 'songti' as const, label: '宋体', description: '适合长文阅读' },
  { id: 'heiti' as const, label: '黑体', description: '简洁、醒目' },
  { id: 'kaiti' as const, label: '楷体', description: '偏手写的阅读感' },
]

const NARRATIVE_OPTIONS: Array<{ id: NarrativeStyle; label: string; description: string }> = [
  { id: 'default', label: '默认', description: '平衡清晰与沉浸感' },
  { id: 'epic', label: '史诗', description: '更强调规模与命运感' },
  { id: 'realistic', label: '写实', description: '具体、克制、贴近日常' },
  { id: 'poetic', label: '诗意', description: '更注重节奏与意象' },
]

const STREAMING_OPTIONS = [
  { value: 'off' as const, label: '完整显示', description: '接收完成后一次显示，稳定性优先' },
  { value: 'stream' as const, label: '流式显示', description: '边接收边显示，响应速度优先' },
]

export function SettingsTabTheme() {
  const {
    narrativeStyle,
    streamingMode,
    comfortableParagraphs,
    reduceMotion,
    temperature,
    topP,
    maxTokens,
    wordCountTarget,
    provider,
    customKey,
    customUrl,
    customModel,
    reasoningEffort,
    talentThinkingIntensity,
    aiTalentGeneration,
    preGenerateRounds,
    storySeed,
    setNarrativeStyle,
    setStreamingMode,
    setComfortableParagraphs,
    setReduceMotion,
    setTemperature,
    setTopP,
    setMaxTokens,
    setWordCountTarget,
    setProvider,
    setCustomKey,
    setCustomUrl,
    setCustomModel,
    setReasoningEffort,
    setTalentThinkingIntensity,
    setAiTalentGeneration,
    setPreGenerateRounds,
    setStorySeed,
  } = useSettingsStore()
  const fontFamily = useFontStore((state) => state.fontFamily)
  const setFontFamily = useFontStore((state) => state.setFontFamily)

  const [cacheStatsRevision, setCacheStatsRevision] = useState(0)
  const [roundMetrics, setRoundMetrics] = useState(() => getRoundCacheMetrics())
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const resetTriggerRef = useRef<HTMLButtonElement>(null)
  const resetDialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleCacheStatsUpdated = () => setCacheStatsRevision((revision) => revision + 1)
    window.addEventListener('cache-stats-updated', handleCacheStatsUpdated)
    return () => window.removeEventListener('cache-stats-updated', handleCacheStatsUpdated)
  }, [])

  useEffect(() => {
    const handleRoundMetricsUpdated = () => setRoundMetrics(getRoundCacheMetrics())
    window.addEventListener('round-cache-metrics-updated', handleRoundMetricsUpdated)
    return () => window.removeEventListener('round-cache-metrics-updated', handleRoundMetricsUpdated)
  }, [])

  const cacheStats = useMemo(() => {
    void cacheStatsRevision
    return getCacheStats({
      providerId: provider,
      model: customModel || DEFAULT_AI_MODEL,
      pool: 'narrative',
      callKind: 'narrative-main',
    })
  }, [cacheStatsRevision, customModel, provider])
  const handleRefreshCache = useCallback(() => {
    setCacheStatsRevision((revision) => revision + 1)
  }, [])
  const handleResetCache = useCallback(() => {
    resetCacheStats({
      providerId: provider,
      model: customModel || DEFAULT_AI_MODEL,
      pool: 'narrative',
      callKind: 'narrative-main',
    })
  }, [customModel, provider])

  const handleExport = useCallback(() => {
    const data = {
      version: '1.0',
      exportedAt: Date.now(),
      settings: {
        provider,
        customKey,
        customUrl,
        customModel,
        temperature,
        topP,
        maxTokens,
        reasoningEffort,
        talentThinkingIntensity,
        aiTalentGeneration,
        preGenerateRounds,
        storySeed,
        narrativeStyle,
        wordCountTarget,
        streamingMode,
        comfortableParagraphs,
        reduceMotion,
        fontFamily,
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-life-sim-preset-${new Date().toISOString().slice(0, 10)}.ailf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [
    aiTalentGeneration,
    customKey,
    customModel,
    customUrl,
    comfortableParagraphs,
    fontFamily,
    maxTokens,
    narrativeStyle,
    preGenerateRounds,
    provider,
    reasoningEffort,
    reduceMotion,
    storySeed,
    streamingMode,
    talentThinkingIntensity,
    temperature,
    topP,
    wordCountTarget,
  ])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ailf,application/json'
    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (readerEvent) => {
        try {
          const data = JSON.parse(readerEvent.target?.result as string)
          if (!data.settings || typeof data.settings !== 'object') {
            alert('无效的数据文件格式')
            return
          }
          const settings = data.settings

          if (importMode === 'overwrite') {
            setProvider(DEFAULT_SETTINGS_VALUES.provider)
            setCustomKey(DEFAULT_SETTINGS_VALUES.customKey)
            setCustomUrl(DEFAULT_SETTINGS_VALUES.customUrl)
            setCustomModel(DEFAULT_SETTINGS_VALUES.customModel)
            setTemperature(DEFAULT_SETTINGS_VALUES.temperature)
            setTopP(DEFAULT_SETTINGS_VALUES.topP)
            setMaxTokens(DEFAULT_SETTINGS_VALUES.maxTokens)
            setReasoningEffort(DEFAULT_SETTINGS_VALUES.reasoningEffort)
            setTalentThinkingIntensity(DEFAULT_SETTINGS_VALUES.talentThinkingIntensity)
            setAiTalentGeneration(DEFAULT_SETTINGS_VALUES.aiTalentGeneration)
            setPreGenerateRounds(DEFAULT_SETTINGS_VALUES.preGenerateRounds)
            setStorySeed(DEFAULT_SETTINGS_VALUES.storySeed)
            setNarrativeStyle(DEFAULT_SETTINGS_VALUES.narrativeStyle)
            setWordCountTarget(DEFAULT_SETTINGS_VALUES.wordCountTarget)
            setStreamingMode(DEFAULT_SETTINGS_VALUES.streamingMode)
            setComfortableParagraphs(DEFAULT_SETTINGS_VALUES.comfortableParagraphs)
            setReduceMotion(DEFAULT_SETTINGS_VALUES.reduceMotion)
            setFontFamily('default')
          }

          if (typeof settings.provider === 'string') setProvider(settings.provider)
          if (typeof settings.customKey === 'string') setCustomKey(settings.customKey)
          if (typeof settings.customUrl === 'string') setCustomUrl(settings.customUrl)
          if (typeof settings.customModel === 'string') setCustomModel(settings.customModel)
          if (typeof settings.temperature === 'number') setTemperature(clamp(settings.temperature, 0, 2))
          if (typeof settings.topP === 'number') setTopP(clamp(settings.topP, 0, 1))
          if (typeof settings.maxTokens === 'number') setMaxTokens(Math.max(256, settings.maxTokens))
          if (typeof settings.reasoningEffort === 'string') setReasoningEffort(settings.reasoningEffort)
          if (typeof settings.talentThinkingIntensity === 'string') setTalentThinkingIntensity(settings.talentThinkingIntensity)
          if (typeof settings.aiTalentGeneration === 'boolean') setAiTalentGeneration(settings.aiTalentGeneration)
          if (typeof settings.preGenerateRounds === 'number') setPreGenerateRounds(clamp(settings.preGenerateRounds, 0, 3))
          if (typeof settings.storySeed === 'string') setStorySeed(settings.storySeed)
          if (typeof settings.narrativeStyle === 'string') setNarrativeStyle(settings.narrativeStyle as NarrativeStyle)
          if (typeof settings.wordCountTarget === 'number') setWordCountTarget(Math.max(50, settings.wordCountTarget))
          if (typeof settings.streamingMode === 'string') setStreamingMode(settings.streamingMode)
          if (typeof settings.comfortableParagraphs === 'boolean') setComfortableParagraphs(settings.comfortableParagraphs)
          if (typeof settings.reduceMotion === 'boolean') setReduceMotion(settings.reduceMotion)
          if (typeof settings.fontFamily === 'string') setFontFamily(settings.fontFamily)
          alert('数据导入成功')
        } catch {
          alert('数据文件解析失败，请检查文件格式')
        }
      }
      reader.readAsText(file)
      ;(event.target as HTMLInputElement).value = ''
    }
    input.click()
  }, [
    importMode,
    setAiTalentGeneration,
    setCustomKey,
    setCustomModel,
    setCustomUrl,
    setFontFamily,
    setMaxTokens,
    setNarrativeStyle,
    setPreGenerateRounds,
    setProvider,
    setReasoningEffort,
    setStorySeed,
    setStreamingMode,
    setComfortableParagraphs,
    setReduceMotion,
    setTalentThinkingIntensity,
    setTemperature,
    setTopP,
    setWordCountTarget,
  ])

  const handleOpenResetConfirm = useCallback(() => setShowResetConfirm(true), [])
  const handleCancelReset = useCallback(() => setShowResetConfirm(false), [])
  const handleConfirmReset = useCallback(async () => {
    setShowResetConfirm(false)
    const removed = clearGameProgressFromLocalStorage()
    console.info(`[settings] 已清除 ${removed} 条游戏进度 localStorage`)
    await opfsStorage.deleteDirectory('save')
    await safeCleanupReload()
  }, [])

  useEffect(() => {
    if (!showResetConfirm) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : resetTriggerRef.current
    const focusFrame = window.requestAnimationFrame(() => resetDialogRef.current?.focus())
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      handleCancelReset()
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleEscape)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [handleCancelReset, showResetConfirm])

  const currentFontLabel = FONT_OPTIONS.find((font) => font.id === fontFamily)?.label ?? '默认'
  const currentNarrativeLabel = NARRATIVE_OPTIONS.find((option) => option.id === narrativeStyle)?.label ?? '默认'
  const cacheHitRate = clamp(cacheStats.hitRate, 0, 100)

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
          <h3 id="settings-narrative-heading">叙事呈现</h3>
          <span>当前：{currentNarrativeLabel}</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.optionGroup}>
            <div className={styles.groupHeading}>
              <span>基础文风</span>
              <span>影响叙事表达</span>
            </div>
            <div className={styles.narrativeGrid} role="group" aria-label="叙事风格">
              {NARRATIVE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.choiceButton}
                  aria-pressed={narrativeStyle === option.id}
                  onClick={() => setNarrativeStyle(option.id)}
                >
                  <span className={styles.choiceTitle}>{option.label}</span>
                  <span className={styles.choiceDescription}>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

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

      <section className={styles.section} aria-labelledby="settings-cache-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-cache-heading">AI 缓存</h3>
          <span>主叙事命中率 {cacheStats.hitRate}%</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.cacheBody}>
            <div className={styles.cacheSummary}>
              <div>
                <span className={styles.metricLabel}>命中 Token</span>
                <strong>{formatTokenCount(cacheStats.hitTokens)}</strong>
              </div>
              <div>
                <span className={styles.metricLabel}>未命中 Token</span>
                <strong>{formatTokenCount(cacheStats.missTokens)}</strong>
              </div>
              <div className={styles.cacheActions}>
                <button type="button" className={styles.textButton} onClick={handleRefreshCache}>刷新</button>
                <button type="button" className={styles.textButton} onClick={handleResetCache}>重置统计</button>
              </div>
            </div>
            <progress className={styles.progressBar} max={100} value={cacheHitRate} aria-label={`缓存命中率 ${cacheStats.hitRate}%`} />
            <p className={styles.supportingText}>这里只统计当前 Provider 与模型的主叙事生成，不混入格式修复、命格或摘要；上游未返回缓存 Token 时显示 0，不沿用其他模型的旧数据。</p>

            {roundMetrics.length > 0 && (
              <div className={styles.roundMetrics}>
                <div className={styles.groupHeading}>
                  <span>最近 {Math.min(5, roundMetrics.length)} 轮策略</span>
                  <span>开发诊断</span>
                </div>
                <ul>
                  {[...roundMetrics].reverse().slice(0, 5).map((metric, index) => (
                    <li key={`${metric.timestamp}-${index}`}>
                      <span>{metric.strategy}</span>
                      <span>{metric.stablePrefixChars} 字符 · {metric.userMessageCount} 条用户消息</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settings-data-heading">
        <div className={styles.sectionLabel}>
          <h3 id="settings-data-heading">数据管理</h3>
          <span>配置与进度</span>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.dataBody}>
            <p className={styles.supportingText}>导出文件包含当前设置；导入时可选择合并现有设置或先恢复默认后覆盖。</p>
            <div className={styles.importModeRow}>
              <span>导入方式</span>
              <div className={styles.segmentedControl} role="group" aria-label="导入方式">
                <button
                  type="button"
                  aria-pressed={importMode === 'merge'}
                  onClick={() => setImportMode('merge')}
                >
                  合并
                </button>
                <button
                  type="button"
                  aria-pressed={importMode === 'overwrite'}
                  onClick={() => setImportMode('overwrite')}
                >
                  覆盖
                </button>
              </div>
            </div>
            <div className={styles.dataActions}>
              <button type="button" className={styles.secondaryButton} onClick={handleExport}>导出数据</button>
              <button type="button" className={styles.secondaryButton} onClick={handleImport}>导入数据</button>
              <button
                ref={resetTriggerRef}
                type="button"
                className={styles.dangerButton}
                title="清除世界、角色、NPC 等所有游戏进度数据，保留 AI 配置和外观设置"
                onClick={handleOpenResetConfirm}
              >
                重置游戏数据
              </button>
            </div>
          </div>
        </div>
      </section>

      {showResetConfirm && (
        <div className={styles.resetOverlay} onClick={handleCancelReset}>
          <div
            ref={resetDialogRef}
            className={styles.resetDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="settings-reset-title"
            aria-describedby="settings-reset-description settings-reset-warning"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="settings-reset-title">重置所有游戏数据</h3>
            <p id="settings-reset-description">
              世界、角色、NPC、经济、文化与政治等游戏进度将被清除，AI 配置和外观设置会保留。
            </p>
            <p id="settings-reset-warning" className={styles.resetWarning}>此操作不可撤销。</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondaryButton} onClick={handleCancelReset}>取消</button>
              <button type="button" className={styles.confirmDangerButton} onClick={handleConfirmReset}>确认重置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
