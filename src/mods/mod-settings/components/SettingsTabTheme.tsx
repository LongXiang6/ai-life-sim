'use client'

/**
 * @module SettingsTabTheme.tsx
 * @description 废案同款 "个性化" Tab —— 主题/字体/叙事风格/显示模式/缓存/数据管理
 * @mod mod-settings
 */

import { useState, useCallback, useEffect } from 'react'
import { clamp } from '@/core/shared'

import { useSettingsStore } from '../store'
import type { NarrativeStyle } from '../store'
import { DEFAULT_WORD_COUNT_TARGET } from '@/mods/mod-engine/constants/narrative-config'

import { useThemeStore, type ThemeType } from '@/core/theme/theme-store'
import { useFontStore } from '@/core/theme/font-store'
import { getCacheStats, resetCacheStats, getRoundCacheMetrics } from '@/core/ai-service'
import { clearGameProgressFromLocalStorage, opfsStorage } from '@/core'

import styles from './SettingsTabTheme.module.css'

/** 格式化 token 数量 */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const THEME_OPTIONS: { id: ThemeType; label: string; title: string }[] = [
  { id: 'minimal-white', label: '⚪ 极简白', title: '极简纯白风格' },
  { id: 'light-aurora', label: '🌅 极光', title: '明亮极光风格' },
  { id: 'reading-yellow', label: '📖 书籍阅读', title: '起点小说阅读风格' },
  { id: 'minimal-black', label: '⚫ 极简黑', title: '极简纯黑风格' },
  { id: 'dark-cosmos', label: '🌌 暗色宇宙', title: '深邃宇宙风格' },
  { id: 'cyber-neon', label: '💜 赛博霓虹', title: '霓虹赛博风格' },
]

const FONT_OPTIONS = [
  { id: 'default' as const, label: '📱 默认', title: '系统默认字体' },
  { id: 'pingfang' as const, label: '🍎 苹方', title: '苹方 - Apple 系统字体，现代简洁' },
  { id: 'yahei' as const, label: '🪟 雅黑', title: '微软雅黑 - Windows 经典字体' },
  { id: 'source-han-sans' as const, label: '📐 思源黑', title: '思源黑体 - 开源无衬线字体' },
  { id: 'songti' as const, label: '📖 宋体', title: '宋体 - 经典阅读体验' },
  { id: 'heiti' as const, label: '⬛ 黑体', title: '黑体 - 现代简洁风格' },
  { id: 'kaiti' as const, label: '✍️ 楷体', title: '楷体 - 手写书法风格' },
]

const NARRATIVE_KEYS = [
  { id: 'default' as const, label: '默认' },
  { id: 'epic' as const, label: '史诗' },
  { id: 'realistic' as const, label: '写实' },
  { id: 'poetic' as const, label: '诗意' },
]

const FONT_FAMILY_MAP: Record<string, string> = {
  pingfang: 'PingFang SC, sans-serif',
  yahei: 'Microsoft YaHei, YaHei SC, sans-serif',
  'source-han-sans': 'Source Han Sans SC, Noto Sans SC, sans-serif',
  songti: 'SimSun, Songti SC, serif',
  heiti: 'SimHei, Heiti SC, sans-serif',
  kaiti: 'KaiTi, STKaiti, serif',
}

export function SettingsTabTheme() {
  const {
    narrativeStyle, streamingMode,
    temperature, topP, maxTokens, wordCountTarget,
    provider, customKey, customUrl, customModel,
    reasoningEffort, talentThinkingIntensity,
    aiTalentGeneration, preGenerateRounds, storySeed,
    setNarrativeStyle, setStreamingMode,
    setTemperature, setTopP, setMaxTokens, setWordCountTarget,
    setProvider, setCustomKey, setCustomUrl, setCustomModel,
    setReasoningEffort, setTalentThinkingIntensity,
    setAiTalentGeneration, setPreGenerateRounds, setStorySeed,
  } = useSettingsStore()
  const currentTheme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const fontFamily = useFontStore((s) => s.fontFamily)
  const setFontFamily = useFontStore((s) => s.setFontFamily)

  const [cacheStats, setCacheStats] = useState(() => getCacheStats())
  const [roundMetrics, setRoundMetrics] = useState(() => getRoundCacheMetrics())
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge')
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // 监听缓存写入事件（事件驱动，零轮询开销）
  useEffect(() => {
    const handler = () => { setCacheStats(getCacheStats()) }
    window.addEventListener('cache-stats-updated', handler)
    return () => window.removeEventListener('cache-stats-updated', handler)
  }, [])

  useEffect(() => {
    const handler = () => { setRoundMetrics(getRoundCacheMetrics()) }
    window.addEventListener('round-cache-metrics-updated', handler)
    return () => window.removeEventListener('round-cache-metrics-updated', handler)
  }, [])

  const handleRefreshCache = useCallback(() => { setCacheStats(getCacheStats()) }, [])
  const handleResetCache = useCallback(() => { resetCacheStats(); setCacheStats({ hitTokens: 0, missTokens: 0, hitRate: 0 }) }, [])

  /** 导出全部数据 */
  const handleExport = useCallback(() => {
    const data = {
      version: '1.0', exportedAt: Date.now(),
      settings: { provider, customKey, customUrl, customModel, temperature, topP, maxTokens, reasoningEffort, talentThinkingIntensity, aiTalentGeneration, preGenerateRounds, storySeed, narrativeStyle, wordCountTarget, streamingMode, fontFamily, theme: currentTheme },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url
    link.download = `ai-life-sim-preset-${new Date().toISOString().slice(0, 10)}.ailf`
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
  }, [provider, customKey, customUrl, customModel, temperature, topP, maxTokens, reasoningEffort, talentThinkingIntensity, aiTalentGeneration, preGenerateRounds, storySeed, narrativeStyle, wordCountTarget, streamingMode, fontFamily, currentTheme])

  /** 导入全部数据 */
  const handleImport = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.ailf,application/json'
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          if (!data.settings || typeof data.settings !== 'object') { alert('无效的数据文件格式'); return }
          const s = data.settings

          // 覆盖模式：先重置所有字段为默认值
          if (importMode === 'overwrite') {
            setProvider('deepseek')
            setCustomKey('')
            setCustomUrl('')
            setCustomModel('')
            setTemperature(0.8)
            setTopP(0.8)
            setMaxTokens(1024)
            setReasoningEffort('disabled')
            setTalentThinkingIntensity('disabled')
            setAiTalentGeneration(false)
            setPreGenerateRounds(0)
            setStorySeed('')
            setNarrativeStyle('default')
            setWordCountTarget(DEFAULT_WORD_COUNT_TARGET)
            setStreamingMode('off')
            setFontFamily('default')
            setTheme('minimal-white')
          }

          if (typeof s.provider === 'string') setProvider(s.provider)
          if (typeof s.customKey === 'string') setCustomKey(s.customKey)
          if (typeof s.customUrl === 'string') setCustomUrl(s.customUrl)
          if (typeof s.customModel === 'string') setCustomModel(s.customModel)
          if (typeof s.temperature === 'number') setTemperature(clamp(s.temperature, 0, 2))
          if (typeof s.topP === 'number') setTopP(clamp(s.topP, 0, 1))
          if (typeof s.maxTokens === 'number') setMaxTokens(Math.max(256, s.maxTokens))
          if (typeof s.reasoningEffort === 'string') setReasoningEffort(s.reasoningEffort)
          if (typeof s.talentThinkingIntensity === 'string') setTalentThinkingIntensity(s.talentThinkingIntensity)
          if (typeof s.aiTalentGeneration === 'boolean') setAiTalentGeneration(s.aiTalentGeneration)
          if (typeof s.preGenerateRounds === 'number') setPreGenerateRounds(clamp(s.preGenerateRounds, 0, 3))
          if (typeof s.storySeed === 'string') setStorySeed(s.storySeed)
          if (typeof s.narrativeStyle === 'string') setNarrativeStyle(s.narrativeStyle as NarrativeStyle)
          if (typeof s.wordCountTarget === 'number') setWordCountTarget(Math.max(50, s.wordCountTarget))
          if (typeof s.streamingMode === 'string') setStreamingMode(s.streamingMode)
          if (typeof s.fontFamily === 'string') setFontFamily(s.fontFamily)
          if (typeof s.theme === 'string') setTheme(s.theme)
          alert('数据导入成功！')
        } catch { alert('数据文件解析失败，请检查文件格式') }
      }
      reader.readAsText(file); (e.target as HTMLInputElement).value = ''
    }
    input.click()
  }, [importMode, setProvider, setCustomKey, setCustomUrl, setCustomModel, setTemperature, setTopP, setMaxTokens, setReasoningEffort, setTalentThinkingIntensity, setAiTalentGeneration, setPreGenerateRounds, setStorySeed, setNarrativeStyle, setWordCountTarget, setStreamingMode, setFontFamily, setTheme])

  /** 重置所有游戏数据（保留设置） */
  const handleOpenResetConfirm = useCallback(() => { setShowResetConfirm(true) }, [])
  const handleConfirmReset = useCallback(async () => {
    setShowResetConfirm(false)

    const removed = clearGameProgressFromLocalStorage()
    console.info(`[settings] 已清除 ${removed} 条游戏进度 localStorage`)

    await opfsStorage.deleteDirectory('save')

    window.location.reload()
  }, [])
  const handleCancelReset = useCallback(() => { setShowResetConfirm(false) }, [])

  const fontLabel = FONT_OPTIONS.find(f => f.id === fontFamily)?.label?.replace(/^.{2} /, '')

  return (
    <div>
      {/* ====== 主题风格 ====== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>主题风格</div>
        <div className={styles.sectionBodyFlex}>
          {THEME_OPTIONS.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)} title={t.title}
              className={styles.chipBtn}
              style={{
                border: currentTheme === t.id ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: currentTheme === t.id ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                fontWeight: currentTheme === t.id ? 600 : 400,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ====== 字体选择 ====== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          字体选择
          <span className={styles.subLabel}>{fontLabel || '默认'}</span>
        </div>
        <div className={styles.sectionBodyFlex}>
          {FONT_OPTIONS.map(f => (
            <button key={f.id} onClick={() => setFontFamily(f.id)} title={f.title}
              className={styles.chipBtn}
              style={{
                border: fontFamily === f.id ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: fontFamily === f.id ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                fontWeight: fontFamily === f.id ? 600 : 400,
                fontFamily: FONT_FAMILY_MAP[f.id],
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ====== 叙事风格 ====== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          叙事风格
          <span className={styles.subLabel}>{NARRATIVE_KEYS.find(k => k.id === narrativeStyle)?.label || '默认'}</span>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.flexRowSm}>
            {NARRATIVE_KEYS.map(k => (
              <button key={k.id} onClick={() => setNarrativeStyle(k.id)}
                className={styles.styleBtn}
                style={{
                  border: narrativeStyle === k.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: narrativeStyle === k.id ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                  color: narrativeStyle === k.id ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  fontWeight: narrativeStyle === k.id ? 600 : 400,
                }}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ====== 叙事显示模式 ====== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          叙事显示模式
          <span className={styles.subLabel}>{streamingMode === 'off' ? '关闭' : '流式传输'}</span>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.flexRowSm} style={{ marginBottom: 8 }}>
            {([
              { value: 'off' as const, label: '关闭', desc: '接收完成后一次性显示，最稳定' },
              { value: 'stream' as const, label: '流式传输', desc: '边接收边显示，响应最快但可能有不完整JSON问题' },
            ]).map(opt => (
              <button key={opt.value} onClick={() => setStreamingMode(opt.value)} title={opt.desc}
                className={styles.styleBtn}
                style={{
                  border: streamingMode === opt.value ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: streamingMode === opt.value ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                  color: streamingMode === opt.value ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  fontWeight: streamingMode === opt.value ? 600 : 400,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className={styles.hint}>
            {streamingMode === 'off' && '叙事内容完全接收后一次性显示，最稳定但等待时间最长。'}
            {streamingMode === 'stream' && '实时接收并显示叙事内容，响应最快，但偶尔可能出现 JSON 解析问题。'}
          </div>
        </div>
      </div>

      {/* ====== AI 缓存统计 ====== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          AI 缓存命中率
          <span className={styles.subLabel}>{cacheStats.hitRate}%</span>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.statsRow}>
            <div className={`${styles.cacheInfo} ${styles.cacheInfoFlex}`}>
              命中 <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{formatTokenCount(cacheStats.hitTokens)}</span> tokens
              <span style={{ color: 'var(--color-text-tertiary)', margin: '0 6px' }}>/</span>
              未命中 <span style={{ fontWeight: 600 }}>{formatTokenCount(cacheStats.missTokens)}</span> tokens
            </div>
            <button onClick={handleRefreshCache} title="刷新数据" className={styles.smallBtn} style={{ color: 'var(--color-text-primary)' }}>刷新</button>
            <button onClick={handleResetCache} title="清空记录并重新累计" className={styles.smallBtn} style={{ color: 'var(--color-text-tertiary)' }}>重置</button>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${clamp(cacheStats.hitRate, -Infinity, 100)}%`, background: 'var(--color-primary)' }} />
          </div>
          <div className={styles.cacheHint}>缓存命中越高，AI 响应越快、消耗越低。数据从 API 响应中自动采集，不增加额外开销。</div>
          {roundMetrics.length > 0 && (
            <div className={styles.hint} style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>最近 {Math.min(5, roundMetrics.length)} 轮策略</div>
              {[...roundMetrics].reverse().slice(0, 5).map((m, i) => (
                <div key={`${m.timestamp}-${i}`} style={{ fontSize: 11, opacity: 0.85 }}>
                  {m.strategy} · stable {m.stablePrefixChars} chars · {m.userMessageCount} user msg(s)
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ====== 数据管理 ====== */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>数据管理</div>
        <div className={styles.sectionBody}>
          <div className={styles.presetRow}>
            <button onClick={handleExport} title="将当前数据导出为 .ailf 文件" className={styles.actionBtn}>📤 导出数据</button>
            <button onClick={handleImport} title="从 .ailf 或 .json 文件导入数据" className={styles.actionBtn}>📥 导入数据</button>
            <div className={styles.modeGroup}>
              <span className={styles.modeGroupLabel}>导入:</span>
              <button onClick={() => setImportMode('merge')} title="合并导入" className={styles.modeBtn}
                style={{
                  background: importMode === 'merge' ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                  borderColor: importMode === 'merge' ? 'var(--color-primary)' : 'var(--color-border)',
                }}>合并</button>
              <button onClick={() => setImportMode('overwrite')} title="覆盖导入" className={styles.modeBtn}
                style={{
                  background: importMode === 'overwrite' ? 'var(--color-primary)' + '/10' : 'var(--color-bg)',
                  borderColor: importMode === 'overwrite' ? 'var(--color-primary)' : 'var(--color-border)',
                }}>覆盖</button>
            </div>
            <button onClick={handleOpenResetConfirm} title="清除世界、角色、NPC 等所有游戏进度数据（保留 AI 配置和外观设置）" className={styles.actionBtn}
              style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)', marginLeft: 'auto' }}>🗑️ 重置数据</button>
          </div>
        </div>
      </div>

      {/* ====== 重置确认弹窗 ====== */}
      {showResetConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }} onClick={handleCancelReset}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 16, border: '1px solid var(--color-border)',
            padding: 24, maxWidth: 400, width: 'calc(100% - 32px)',
            boxShadow: 'var(--shadow-xl)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              重置所有数据
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
              此操作将清除世界、角色、NPC、经济、文化、政治等所有游戏进度数据，但保留 AI 配置和外观设置。
            </div>
            <div style={{
              fontSize: 12, color: 'var(--color-error)', lineHeight: 1.6,
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--color-error-bg)', border: '1px solid var(--color-error)',
              marginBottom: 20,
            }}>
              此操作不可撤销！
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleCancelReset} style={{
                padding: '8px 20px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                color: 'var(--color-text-primary)',
              }}>取消</button>
              <button onClick={handleConfirmReset} style={{
                padding: '8px 20px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--color-error)', background: 'var(--color-error)',
                color: '#fff', fontWeight: 600,
              }}>确认重置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
