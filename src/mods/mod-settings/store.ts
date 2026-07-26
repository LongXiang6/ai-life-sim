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
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
} from '@/core/ai-service'
import { DEFAULT_WORD_COUNT_TARGET } from '@/mods/mod-engine'
import type { ReasoningEffort } from '@/foundation'

/** 叙事风格 */
export type NarrativeStyle = 'default' | 'epic' | 'realistic' | 'poetic'

/** 叙事显示模式 */
export type StreamingMode = 'off' | 'stream'

export type { ReasoningEffort } from '@/foundation'

const LEGACY_REASONING_EFFORT_MAP: Record<string, ReasoningEffort> = {
  disabled: 'disabled',
  'level-1': 'auto',
  'level-2': 'auto',
  'level-3': 'high',
  'level-4': 'high',
  'level-5': 'high',
  'level-6': 'max',
  auto: 'auto',
  high: 'high',
  max: 'max',
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return typeof value === 'string'
    ? LEGACY_REASONING_EFFORT_MAP[value] ?? 'disabled'
    : 'disabled'
}

/** 新用户、恢复默认与覆盖导入共享的唯一默认值。 */
export const DEFAULT_SETTINGS_VALUES = {
  provider: DEFAULT_AI_PROVIDER_ID,
  customKey: '',
  customUrl: '',
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
  narrativeStyleText: '',
  narrativeStyleVersion: 0,
  wordCountTarget: DEFAULT_WORD_COUNT_TARGET,
  streamingMode: 'off' as StreamingMode,
  comfortableParagraphs: true,
  reduceMotion: false,
  theme: 'minimal-white' as ThemeType,
} as const

export interface ImportedModelSettings {
  provider: string
  customKey: string
  customUrl: string
  customModel: string
}

/** 导入文件不能把旧托管目标重新写回浏览器；玩家自有的完整配置转为 custom 保留。 */
export function normalizeImportedModelSettings(value: Record<string, unknown>): ImportedModelSettings {
  const provider = typeof value.provider === 'string' ? value.provider : DEFAULT_AI_PROVIDER_ID
  const customKey = typeof value.customKey === 'string' ? value.customKey.trim() : ''
  const customUrl = typeof value.customUrl === 'string' ? value.customUrl.trim() : ''
  const customModel = typeof value.customModel === 'string' ? value.customModel.trim() : ''

  if (provider === 'custom' || (!AI_PROVIDERS[provider] && customKey && customUrl && customModel)) {
    return { provider: 'custom', customKey, customUrl, customModel }
  }

  if (provider !== 'custom' && customKey && customUrl && customModel) {
    return { provider: 'custom', customKey, customUrl, customModel }
  }

  const preset = AI_PROVIDERS[provider] ?? AI_PROVIDERS[DEFAULT_AI_PROVIDER_ID]
  const allowedModel = preset.models.some((model) => model.name === customModel)
    ? customModel
    : preset.models[0]?.name ?? DEFAULT_AI_MODEL
  return {
    provider: preset.id,
    customKey: '',
    customUrl: '',
    customModel: allowedModel,
  }
}

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
  /** 已显式保存并用于后续主叙事的完整自定义文风；空值表示项目默认。 */
  narrativeStyleText: string
  /** 每次保存不同的生效文风时递增。 */
  narrativeStyleVersion: number
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
  saveNarrativeStyleText: (styleText: string) => void
  restoreDefaultNarrativeStyle: () => void
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
        saveNarrativeStyleText: (styleText,) => set((state) => {
          const narrativeStyleText = styleText.trim().length > 0 ? styleText : ''
          if (narrativeStyleText === state.narrativeStyleText) return state
          return {
            narrativeStyle: 'default',
            narrativeStyleText,
            narrativeStyleVersion: state.narrativeStyleVersion + 1,
          }
        }),
        restoreDefaultNarrativeStyle: () => set((state) => {
          if (!state.narrativeStyleText) return state
          return {
            narrativeStyle: 'default',
            narrativeStyleText: '',
            narrativeStyleVersion: state.narrativeStyleVersion + 1,
          }
        }),
        setWordCountTarget: (wordCountTarget,) => set({ wordCountTarget, },),
        setStreamingMode: (streamingMode,) => set({ streamingMode, },),
        setComfortableParagraphs: (comfortableParagraphs,) => set({ comfortableParagraphs, },),
        setReduceMotion: (reduceMotion,) => set({ reduceMotion, },),
        setTheme: (theme,) => set({ theme, },),
      }),
      {
        name: 'mod-settings:store',
        version: 11,
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
              migrated.customUrl = ''
              migrated.customModel = DEFAULT_AI_MODEL
            }
          }
          if (version < 8) {
            const selectedProvider = migrated.provider ?? DEFAULT_AI_PROVIDER_ID
            const playerKey = migrated.customKey?.trim() ?? ''
            if (selectedProvider !== 'custom' && playerKey) {
              // 旧版允许在预设通道填写玩家 Key；升级后统一转为自定义配置并保留玩家数据。
              migrated.provider = 'custom'
              migrated.customKey = playerKey
              migrated.customUrl = migrated.customUrl?.trim() ?? ''
              migrated.customModel = migrated.customModel?.trim() ?? ''
            } else if (selectedProvider !== 'custom') {
              const providerConfig = AI_PROVIDERS[selectedProvider]
              const existingModel = migrated.customModel?.trim() ?? ''
              migrated.provider = providerConfig ? selectedProvider : DEFAULT_AI_PROVIDER_ID
              migrated.customKey = ''
              migrated.customUrl = ''
              migrated.customModel = providerConfig?.models.some((model) => model.name === existingModel)
                ? existingModel
                : providerConfig?.models[0]?.name ?? DEFAULT_AI_MODEL
            }
          }
          if (version < 10) {
            migrated.reasoningEffort = normalizeReasoningEffort(state.reasoningEffort)
            migrated.talentThinkingIntensity = normalizeReasoningEffort(state.talentThinkingIntensity)
          }
          if (version < 11) {
            const legacyStyleText: Partial<Record<NarrativeStyle, string>> = {
              epic: '采用有历史感和命运感的叙事，但始终以具体事件、行动、代价与后果推进。',
              realistic: '采用具体、克制的写实叙事，多写行动、对话、现实约束与人物反应。',
              poetic: '采用凝练、有画面感的表达，让意象服务剧情、人物选择与实际后果。',
            }
            const existingText = typeof state.narrativeStyleText === 'string'
              ? state.narrativeStyleText
              : ''
            migrated.narrativeStyleText = existingText
              || legacyStyleText[state.narrativeStyle ?? 'default']
              || ''
            migrated.narrativeStyleVersion = Number.isInteger(state.narrativeStyleVersion)
              ? Math.max(0, Number(state.narrativeStyleVersion))
              : migrated.narrativeStyleText ? 1 : 0
            migrated.narrativeStyle = 'default'
          }
          migrated.theme = 'minimal-white'
          return migrated as SettingsState
        },
        // 不持久化 set 函数
        partialize: (state,) => {
          const { setProvider: _sp, setCustomKey: _sck, setCustomUrl: _scu, setCustomModel: _scm, setTemperature: _st, setTopP: _stp, setMaxTokens: _smt, setReasoningEffort: _sre, setTalentThinkingIntensity: _stti, setAiTalentGeneration: _satg, setPreGenerateRounds: _spgr, setStorySeed: _sss, setNarrativeStyle: _sns, saveNarrativeStyleText: _snst, restoreDefaultNarrativeStyle: _rdns, setWordCountTarget: _swct, setStreamingMode: _ssm, setComfortableParagraphs: _scp, setReduceMotion: _srm, setTheme: _sth, ...rest } = state
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
  return provider === 'custom' && Boolean(customKey && customUrl && customModel)
}

/** 客户端设置或本地服务端环境任一可用即可开始游戏；不会把服务端密钥暴露到浏览器。 */
export async function hasAvailableApiConfiguration(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const { provider, customUrl } = useSettingsStore.getState()
  if (provider === 'custom' && !isApiConfigured()) return false
  try {
    const params = new URLSearchParams({ providerId: provider })
    if (provider === 'custom') params.set('baseUrl', customUrl)
    const response = await fetch(`/api/proxy?${params.toString()}`, {
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
