/**
 * Purpose: Provide settings export, import, and game-progress reset controls.
 * Owner: mod-settings/settings-ui
 * Responsibility: Data-management interaction only; reading preferences remain in SettingsTabTheme.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { clearGameProgressFromLocalStorage, opfsStorage, safeCleanupReload } from '@/core'
import { clamp } from '@/core/shared'
import { useFontStore } from '@/core/theme/font-store'
import { DEFAULT_THEME, normalizeTheme, useThemeStore } from '@/core/theme/theme-store'
import { isNarrativeWordCountTarget } from '@/foundation'

import {
  DEFAULT_SETTINGS_VALUES,
  MAX_TEMPERATURE,
  normalizeImportedModelSettings,
  useSettingsStore,
} from '../store'
import type { NarrativeStyle } from '../store'

import styles from './SettingsTabTheme.module.css'

export function SettingsDataManagement() {
  const settingsState = useSettingsStore()
  const fontFamily = useFontStore((state) => state.fontFamily)
  const setFontFamily = useFontStore((state) => state.setFontFamily)
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const resetTriggerRef = useRef<HTMLButtonElement>(null)
  const resetDialogRef = useRef<HTMLDivElement>(null)

  const handleExport = useCallback(() => {
    const {
      provider, customKey, customUrl, customModel, temperature, topP,
      reasoningEffort, talentThinkingIntensity, aiTalentGeneration,
      preGenerateRounds,
      narrativeStyle, narrativeStyleText, narrativeStyleVersion, wordCountTarget,
      streamingMode, comfortableParagraphs, reduceMotion,
    } = settingsState
    const data = {
      version: '1.0',
      exportedAt: Date.now(),
      settings: {
        provider, customKey, customUrl, customModel, temperature, topP,
        reasoningEffort, talentThinkingIntensity, aiTalentGeneration,
        preGenerateRounds,
        narrativeStyle, narrativeStyleText, narrativeStyleVersion, wordCountTarget,
        streamingMode, comfortableParagraphs, reduceMotion, theme, fontFamily,
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
  }, [fontFamily, settingsState, theme])

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
          const imported = data.settings
          const store = useSettingsStore.getState()
          if (importMode === 'overwrite') {
            store.setProvider(DEFAULT_SETTINGS_VALUES.provider)
            store.setCustomKey(DEFAULT_SETTINGS_VALUES.customKey)
            store.setCustomUrl(DEFAULT_SETTINGS_VALUES.customUrl)
            store.setCustomModel(DEFAULT_SETTINGS_VALUES.customModel)
            useSettingsStore.setState({ customModelProfiles: [] })
            store.setTemperature(DEFAULT_SETTINGS_VALUES.temperature)
            store.setTopP(DEFAULT_SETTINGS_VALUES.topP)
            store.setReasoningEffort(DEFAULT_SETTINGS_VALUES.reasoningEffort)
            store.setTalentThinkingIntensity(DEFAULT_SETTINGS_VALUES.talentThinkingIntensity)
            store.setAiTalentGeneration(DEFAULT_SETTINGS_VALUES.aiTalentGeneration)
            store.setPreGenerateRounds(DEFAULT_SETTINGS_VALUES.preGenerateRounds)
            store.setStorySeed(DEFAULT_SETTINGS_VALUES.storySeed)
            store.setNarrativeStyle(DEFAULT_SETTINGS_VALUES.narrativeStyle)
            useSettingsStore.setState({
              narrativeStyleText: DEFAULT_SETTINGS_VALUES.narrativeStyleText,
              narrativeStyleVersion: DEFAULT_SETTINGS_VALUES.narrativeStyleVersion,
            })
            store.setWordCountTarget(DEFAULT_SETTINGS_VALUES.wordCountTarget)
            store.setStreamingMode(DEFAULT_SETTINGS_VALUES.streamingMode)
            store.setComfortableParagraphs(DEFAULT_SETTINGS_VALUES.comfortableParagraphs)
            store.setReduceMotion(DEFAULT_SETTINGS_VALUES.reduceMotion)
            setTheme(DEFAULT_THEME)
            setFontFamily('default')
          }

          const importedModel = normalizeImportedModelSettings(imported)
          store.setProvider(importedModel.provider)
          store.setCustomKey(importedModel.customKey)
          store.setCustomUrl(importedModel.customUrl)
          store.setCustomModel(importedModel.customModel)
          if (typeof imported.temperature === 'number') store.setTemperature(clamp(imported.temperature, 0, MAX_TEMPERATURE))
          if (typeof imported.topP === 'number') store.setTopP(clamp(imported.topP, 0, 1))
          if (typeof imported.reasoningEffort === 'string') store.setReasoningEffort(imported.reasoningEffort)
          if (typeof imported.talentThinkingIntensity === 'string') store.setTalentThinkingIntensity(imported.talentThinkingIntensity)
          if (typeof imported.aiTalentGeneration === 'boolean') store.setAiTalentGeneration(imported.aiTalentGeneration)
          if (imported.preGenerateRounds === 0 || imported.preGenerateRounds === 1) {
            store.setPreGenerateRounds(imported.preGenerateRounds)
          }
            if (typeof imported.narrativeStyle === 'string') store.setNarrativeStyle(imported.narrativeStyle as NarrativeStyle)
          if (typeof imported.narrativeStyleText === 'string') {
            useSettingsStore.setState({
              narrativeStyleText: imported.narrativeStyleText,
              narrativeStyleVersion: Number.isInteger(imported.narrativeStyleVersion)
                ? Math.max(0, imported.narrativeStyleVersion)
                : imported.narrativeStyleText ? 1 : 0,
            })
          }
          if ('wordCountTarget' in imported) {
            if (!isNarrativeWordCountTarget(imported.wordCountTarget)) {
              throw new Error('叙事目标字数不是当前固定档位')
            }
            store.setWordCountTarget(imported.wordCountTarget)
          }
          if (typeof imported.streamingMode === 'string') store.setStreamingMode(imported.streamingMode)
          if (typeof imported.comfortableParagraphs === 'boolean') store.setComfortableParagraphs(imported.comfortableParagraphs)
          if (typeof imported.reduceMotion === 'boolean') store.setReduceMotion(imported.reduceMotion)
          if (typeof imported.theme === 'string') setTheme(normalizeTheme(imported.theme))
          if (typeof imported.fontFamily === 'string') setFontFamily(imported.fontFamily)
          alert('数据导入成功')
        } catch {
          alert('数据文件解析失败，请检查文件格式')
        }
      }
      reader.readAsText(file)
      ;(event.target as HTMLInputElement).value = ''
    }
    input.click()
  }, [importMode, setFontFamily, setTheme])

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

  return (
    <>
      <section className={styles.section} aria-labelledby="settings-data-heading">
        <div className={styles.sectionLabel}><h3 id="settings-data-heading">数据管理</h3><span>配置与进度</span></div>
        <div className={styles.sectionCard}>
          <div className={styles.dataBody}>
            <p className={styles.supportingText}>导出文件包含当前设置；导入时可选择合并现有设置或先恢复默认后覆盖。</p>
            <div className={styles.importModeRow}>
              <span>导入方式</span>
              <div className={styles.segmentedControl} role="group" aria-label="导入方式">
                <button type="button" aria-pressed={importMode === 'merge'} onClick={() => setImportMode('merge')}>合并</button>
                <button type="button" aria-pressed={importMode === 'overwrite'} onClick={() => setImportMode('overwrite')}>覆盖</button>
              </div>
            </div>
            <div className={styles.dataActions}>
              <button type="button" className={styles.secondaryButton} onClick={handleExport}>导出数据</button>
              <button type="button" className={styles.secondaryButton} onClick={handleImport}>导入数据</button>
              <button ref={resetTriggerRef} type="button" className={styles.dangerButton} title="清除世界、角色、NPC 等所有游戏进度数据，保留 AI 配置和外观设置" onClick={() => setShowResetConfirm(true)}>重置游戏数据</button>
            </div>
          </div>
        </div>
      </section>

      {showResetConfirm ? (
        <div className={styles.resetOverlay} onClick={handleCancelReset}>
          <div ref={resetDialogRef} className={styles.resetDialog} role="alertdialog" aria-modal="true" aria-labelledby="settings-reset-title" aria-describedby="settings-reset-description settings-reset-warning" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <h3 id="settings-reset-title">重置所有游戏数据</h3>
            <p id="settings-reset-description">世界、角色、NPC、经济、文化与政治等游戏进度将被清除，AI 配置和外观设置会保留。</p>
            <p id="settings-reset-warning" className={styles.resetWarning}>此操作不可撤销。</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondaryButton} onClick={handleCancelReset}>取消</button>
              <button type="button" className={styles.confirmDangerButton} onClick={() => void handleConfirmReset()}>确认重置</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
