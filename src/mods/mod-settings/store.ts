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
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
  LEGACY_MANAGED_AI_BASE_URL,
  LEGACY_MANAGED_AI_MODEL,
  LEGACY_MANAGED_AI_PROVIDER_ID,
  isRegisteredProviderBaseUrl,
} from '@/core/ai-service'
import { DEFAULT_WORD_COUNT_TARGET } from '@/mods/mod-engine'

/** 叙事风格 */
export type NarrativeStyle = 'default' | 'epic' | 'realistic' | 'poetic'

/** 叙事显示模式 */
export type StreamingMode = 'off' | 'stream'

/** 推理强度 */
export type ReasoningEffort = 'disabled' | 'level-1' | 'level-2' | 'level-3' | 'level-4' | 'level-5' | 'level-6'

/** 新用户、恢复默认与覆盖导入共享的唯一默认值。 */
export const DEFAULT_SETTINGS_VALUES = {
  provider: DEFAULT_AI_PROVIDER_ID,
  customKey: '',
  customUrl: DEFAULT_AI_BASE_URL,
  customModel: DEFAULT_AI_MODEL,
  temperature: 0.8,
  topP: 0.8,
  maxTokens: 4096,
  reasoningEffort: 'disabled' as ReasoningEffort,
  talentThinkingIntensity: 'disabled' as ReasoningEffort,
  aiTalentGeneration: true,
  preGenerateRounds: 1,
  storySeed: '',
  narrativeStyle: 'default' as NarrativeStyle,
  wordCountTarget: DEFAULT_WORD_COUNT_TARGET,
  streamingMode: 'off' as StreamingMode,
  comfortableParagraphs: true,
  reduceMotion: false,
  theme: 'minimal-white' as ThemeType,
} as const

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
  /** 长叙事使用更舒展的段落行距 */
  comfortableParagraphs: boolean
  /** 降低装饰动画与过渡 */
  reduceMotion: boolean

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
  setComfortableParagraphs: (enabled: boolean) => void
  setReduceMotion: (enabled: boolean) => void
  setTheme: (theme: ThemeType) => void,
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set,) => ({
        ...DEFAULT_SETTINGS_VALUES,

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
        setComfortableParagraphs: (comfortableParagraphs,) => set({ comfortableParagraphs, },),
        setReduceMotion: (reduceMotion,) => set({ reduceMotion, },),
        setTheme: (theme,) => set({ theme, },),
      }),
      {
        name: 'mod-settings:store',
        version: 7,
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as Partial<SettingsState>
          const migrated = { ...state }
          if (version < 2 && state?.wordCountTarget === 500) {
            migrated.wordCountTarget = DEFAULT_WORD_COUNT_TARGET
          }
          if (version < 3 && state?.wordCountTarget === 400) {
            migrated.wordCountTarget = DEFAULT_WORD_COUNT_TARGET
          }
          if (version < 5) {
            const hasExplicitModelConfig = Boolean(
              state.customKey?.trim()
              || state.customUrl?.trim()
              || state.customModel?.trim()
              || state.provider === 'custom',
            )
            if (!hasExplicitModelConfig) {
              migrated.provider = DEFAULT_AI_PROVIDER_ID
              migrated.customKey = ''
              migrated.customUrl = DEFAULT_AI_BASE_URL
              migrated.customModel = DEFAULT_AI_MODEL
            }
          }
          if (version < 6 && state.provider === DEFAULT_AI_PROVIDER_ID) {
            migrated.customUrl = DEFAULT_AI_BASE_URL
            migrated.customModel = DEFAULT_AI_MODEL
          }
          if (version < 7 && state.provider === DEFAULT_AI_PROVIDER_ID) {
            if (state.customKey?.trim()) {
              if (version < 6 && state.customUrl?.trim() && state.customModel?.trim()) {
                // 更早版本的托管目标不同；玩家 Key 与当时的明确接口、模型一起转为自定义配置。
                migrated.provider = 'custom'
                migrated.customUrl = state.customUrl
                migrated.customModel = state.customModel
              } else {
                // v6 玩家曾用自己的 Key 覆盖 a6api：保留该通道及其接口语义。
                migrated.provider = LEGACY_MANAGED_AI_PROVIDER_ID
                migrated.customUrl = LEGACY_MANAGED_AI_BASE_URL
                migrated.customModel = LEGACY_MANAGED_AI_MODEL
              }
            } else {
              // 服务器托管的旧默认统一迁移到新的 LongCat 默认通道。
              migrated.provider = DEFAULT_AI_PROVIDER_ID
              migrated.customUrl = DEFAULT_AI_BASE_URL
              migrated.customModel = DEFAULT_AI_MODEL
            }
          }
          return migrated as SettingsState
        },
        // 不持久化 set 函数
        partialize: (state,) => {
          const { setProvider: _sp, setCustomKey: _sck, setCustomUrl: _scu, setCustomModel: _scm, setTemperature: _st, setTopP: _stp, setMaxTokens: _smt, setReasoningEffort: _sre, setTalentThinkingIntensity: _stti, setAiTalentGeneration: _satg, setPreGenerateRounds: _spgr, setStorySeed: _sss, setNarrativeStyle: _sns, setWordCountTarget: _swct, setStreamingMode: _ssm, setComfortableParagraphs: _scp, setReduceMotion: _srm, setTheme: _sth, ...rest } = state
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
  if (provider === 'custom') {
    return Boolean(customUrl && customModel && isRegisteredProviderBaseUrl(customUrl))
  }
  return true
}

/** 客户端设置或本地服务端环境任一可用即可开始游戏；不会把服务端密钥暴露到浏览器。 */
export async function hasAvailableApiConfiguration(): Promise<boolean> {
  if (isApiConfigured()) return true
  if (typeof window === 'undefined') return false
  const { provider } = useSettingsStore.getState()
  if (provider === 'custom') return false
  try {
    const response = await fetch(`/api/proxy?providerId=${encodeURIComponent(provider)}`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!response.ok) return false
    const result = await response.json() as { configured?: unknown }
    return result.configured === true
  } catch {
    return false
  }
}
