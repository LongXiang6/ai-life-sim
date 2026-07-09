/**
 * @module store.ts
 * @description 设置面板 Zustand Store —— 持久化所有设置到 localStorage
 * @mod mod-settings
 *
 * 规范来源：code-architecture-skill §10 存储方案
 */

import { create, } from 'zustand'
import { devtools, persist, } from 'zustand/middleware'

import type { ThemeType, } from '@/core/theme/theme-store'
import { DEFAULT_WORD_COUNT_TARGET } from '@/mods/mod-engine'

/** 叙事风格 */
export type NarrativeStyle = 'default' | 'epic' | 'realistic' | 'poetic'

/** 叙事显示模式 */
export type StreamingMode = 'off' | 'stream'

/** 推理强度 */
export type ReasoningEffort = 'disabled' | 'level-1' | 'level-2' | 'level-3' | 'level-4' | 'level-5' | 'level-6'

interface SettingsState {
  // ---- AI 模型配置 ----
  /** 当前 Provider ID */
  provider: string
  /** 自定义 API Key */
  customKey: string
  /** 自定义 API URL */
  customUrl: string
  /** 自定义模型名 */
  customModel: string
  /** 温度 0-2 */
  temperature: number
  /** Top P 0-1 */
  topP: number
  /** 最大 token */
  maxTokens: number
  /** 推理强度 */
  reasoningEffort: ReasoningEffort
  /** 命格生成推理强度 */
  talentThinkingIntensity: ReasoningEffort
  /** AI 命格生成开关 */
  aiTalentGeneration: boolean
  /** 预生成轮数 0-3 */
  preGenerateRounds: number
  /** 剧情一致性种子（空=自动生成） */
  storySeed: string

  // ---- 叙事偏好 ----
  /** 叙事风格 */
  narrativeStyle: NarrativeStyle
  /** 大致字数目标 */
  wordCountTarget: number
  /** 叙事显示模式 */
  streamingMode: StreamingMode

  // ---- 外观 ----
  /** 主题 */
  theme: ThemeType

  // ---- 操作 ----
  setProvider: (provider: string) => void
  setCustomKey: (key: string) => void
  setCustomUrl: (url: string) => void
  setCustomModel: (model: string) => void
  setTemperature: (temp: number) => void
  setTopP: (topP: number) => void
  setMaxTokens: (tokens: number) => void
  setReasoningEffort: (effort: ReasoningEffort) => void
  setTalentThinkingIntensity: (effort: ReasoningEffort) => void
  setAiTalentGeneration: (enabled: boolean) => void
  setPreGenerateRounds: (rounds: number) => void
  setStorySeed: (seed: string) => void
  setNarrativeStyle: (style: NarrativeStyle) => void
  setWordCountTarget: (target: number) => void
  setStreamingMode: (mode: StreamingMode) => void
  setTheme: (theme: ThemeType) => void,
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set,) => ({
        // AI 模型配置
        provider: 'deepseek',
        customKey: '',
        customUrl: '',
        customModel: '',
        temperature: 0.8,
        topP: 0.8,
        maxTokens: 4096,
        reasoningEffort: 'disabled',
        talentThinkingIntensity: 'disabled',
        aiTalentGeneration: true,
        preGenerateRounds: 1,
        storySeed: '',

        // 叙事偏好 —— wordCountTarget 初始值来自单一来源常量，与所有消费者共享
        narrativeStyle: 'default',
        wordCountTarget: DEFAULT_WORD_COUNT_TARGET,
        streamingMode: 'off',

        // 外观
        theme: 'minimal-white',

        // 操作
        setProvider: (provider,) => set({ provider, },),
        setCustomKey: (customKey,) => set({ customKey, },),
        setCustomUrl: (customUrl,) => set({ customUrl, },),
        setCustomModel: (customModel,) => set({ customModel, },),
        setTemperature: (temperature,) => set({ temperature, },),
        setTopP: (topP,) => set({ topP, },),
        setMaxTokens: (maxTokens,) => set({ maxTokens, },),
        setReasoningEffort: (reasoningEffort,) => set({ reasoningEffort, },),
        setTalentThinkingIntensity: (talentThinkingIntensity,) => set({ talentThinkingIntensity, },),
        setAiTalentGeneration: (aiTalentGeneration,) => set({ aiTalentGeneration, },),
        setPreGenerateRounds: (preGenerateRounds,) => set({ preGenerateRounds, },),
        setStorySeed: (storySeed,) => set({ storySeed, },),
        setNarrativeStyle: (narrativeStyle,) => set({ narrativeStyle, },),
        setWordCountTarget: (wordCountTarget,) => set({ wordCountTarget, },),
        setStreamingMode: (streamingMode,) => set({ streamingMode, },),
        setTheme: (theme,) => set({ theme, },),
      }),
      {
        name: 'mod-settings:store',
        version: 2,
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as Partial<SettingsState>
          if (version < 2 && state?.wordCountTarget === 500) {
            return { ...state, wordCountTarget: DEFAULT_WORD_COUNT_TARGET } as SettingsState
          }
          return persistedState as SettingsState
        },
        // 不持久化 set 函数
        partialize: (state,) => {
          const { setProvider: _sp, setCustomKey: _sck, setCustomUrl: _scu, setCustomModel: _scm, setTemperature: _st, setTopP: _stp, setMaxTokens: _smt, setReasoningEffort: _sre, setTalentThinkingIntensity: _stti, setAiTalentGeneration: _satg, setPreGenerateRounds: _spgr, setStorySeed: _sss, setNarrativeStyle: _sns, setWordCountTarget: _swct, setStreamingMode: _ssm, setTheme: _sth, ...rest } = state
          return rest
        },
      },
    ),
    { name: 'mod-settings', },
  ),
)

/** 是否已配置可用的 API Key（欢迎页 / 世界选择等轻量校验） */
export function isApiConfigured(): boolean {
  const { provider, customKey, customUrl, customModel } = useSettingsStore.getState()
  if (!customKey) return false
  if (provider === 'custom') return Boolean(customUrl && customModel)
  return true
}
