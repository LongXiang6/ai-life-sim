/**
 * Purpose: Persist application settings and expose their validated update commands.
 * Owner: mod-settings
 * Responsibility: Settings state, migration, and local persistence only.
 */

import { create, } from 'zustand'
import { devtools, persist, } from 'zustand/middleware'

import type { ThemeType, } from '@/core/theme/theme-store'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER_ID,
} from '@/core/ai-service'
import {
  DEFAULT_WORD_COUNT_TARGET,
  resolveNarrativeWordCountTarget,
  type NarrativeWordCountTarget,
  type ReasoningEffort,
} from '@/foundation'

import {
  createCustomModelProfileId,
  normalizeCustomModelProfiles,
  type CustomModelProfile,
} from './custom-model-profiles'

export type { CustomModelProfile } from './custom-model-profiles'

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

/** 玩家可配置的 AI 温度上限。 */
export const MAX_TEMPERATURE = 1.2

/** 新用户、恢复默认与覆盖导入共享的唯一默认值。 */
export const DEFAULT_SETTINGS_VALUES = {
  provider: DEFAULT_AI_PROVIDER_ID,
  customKey: '',
  customUrl: DEFAULT_AI_BASE_URL,
  customModel: DEFAULT_AI_MODEL,
  customModelProfiles: [] as CustomModelProfile[],
  temperature: 0.8,
  topP: 0.8,
  reasoningEffort: 'disabled' as ReasoningEffort,
  talentThinkingIntensity: 'disabled' as ReasoningEffort,
  aiTalentGeneration: true,
  preGenerateRounds: 1 as 0 | 1,
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

/** 导入与迁移只保留玩家自有 API；旧预设统一转成 DeepSeek 填充状态。 */
export function normalizeImportedModelSettings(value: Record<string, unknown>): ImportedModelSettings {
  const provider = typeof value.provider === 'string' ? value.provider : DEFAULT_AI_PROVIDER_ID
  const customKey = typeof value.customKey === 'string' ? value.customKey.trim() : ''
  const customUrl = typeof value.customUrl === 'string' ? value.customUrl.trim() : ''
  const customModel = typeof value.customModel === 'string' ? value.customModel.trim() : ''

  const hasPlayerOwnedTarget = provider === 'custom' || Boolean(customKey || customUrl)
  return {
    provider: DEFAULT_AI_PROVIDER_ID,
    customKey: hasPlayerOwnedTarget ? customKey : '',
    customUrl: hasPlayerOwnedTarget && customUrl ? customUrl : DEFAULT_AI_BASE_URL,
    customModel: hasPlayerOwnedTarget && customModel ? customModel : DEFAULT_AI_MODEL,
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
  /** 仅保存在当前浏览器的自定义模型配置档案 */
  customModelProfiles: CustomModelProfile[]
  /** 温度 0-1.2 */
  temperature: number
  /** Top P 0-1 */
  topP: number
  /** 推理强度 */
  reasoningEffort: ReasoningEffort
  /** 命格生成推理强度 */
  talentThinkingIntensity: ReasoningEffort
  /** AI 命格生成开关 */
  aiTalentGeneration: boolean
  /** 下一轮主故事预生成开关；只允许关闭或预生成一轮。 */
  preGenerateRounds: 0 | 1
  /** 剧情一致性种子（空=自动生成） */
  storySeed: string

  // ---- 叙事偏好 ----
  /** 叙事风格 */
  narrativeStyle: NarrativeStyle
  /** 已显式保存并用于后续主叙事的完整自定义文风；空值表示项目默认。 */
  narrativeStyleText: string
  /** 每次保存不同的生效文风时递增。 */
  narrativeStyleVersion: number
  /** 固定档位的正文目标字数。 */
  wordCountTarget: NarrativeWordCountTarget
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
  saveCustomModelProfile: (name: string) => void
  activateCustomModelProfile: (id: string) => void
  setTemperature: (temp: number) => void
  setTopP: (topP: number) => void
  setReasoningEffort: (effort: ReasoningEffort) => void
  setTalentThinkingIntensity: (effort: ReasoningEffort) => void
  setAiTalentGeneration: (enabled: boolean) => void
  setPreGenerateRounds: (rounds: 0 | 1) => void
  setStorySeed: (seed: string) => void
  setNarrativeStyle: (style: NarrativeStyle) => void
  saveNarrativeStyleText: (styleText: string) => void
  restoreDefaultNarrativeStyle: () => void
  setWordCountTarget: (target: NarrativeWordCountTarget) => void
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
        setProvider: () => set({ provider: DEFAULT_AI_PROVIDER_ID, },),
        setCustomKey: (customKey,) => set({ customKey, },),
        setCustomUrl: (customUrl,) => set({ customUrl, },),
        setCustomModel: (customModel,) => set({ customModel, },),
        saveCustomModelProfile: (name) => set((state) => {
          const normalizedName = name.trim()
          if (!normalizedName) throw new Error('请先填写配置名称')
          if ([...normalizedName].length > 32) throw new Error('配置名称最多 32 个字符')
          const customKey = state.customKey.trim()
          const customUrl = state.customUrl.trim()
          const customModel = state.customModel.trim()
          if (!customKey || !customUrl || !customModel) {
            throw new Error('请完整填写 API Key、网址和模型后再保存')
          }
          const existing = state.customModelProfiles.find((profile) => profile.name === normalizedName)
          const profile: CustomModelProfile = {
            id: existing?.id ?? createCustomModelProfileId(),
            name: normalizedName,
            customKey,
            customUrl,
            customModel,
            updatedAt: Date.now(),
          }
          return {
            provider: DEFAULT_AI_PROVIDER_ID,
            customKey,
            customUrl,
            customModel,
            customModelProfiles: existing
              ? state.customModelProfiles.map((item) => item.id === existing.id ? profile : item)
              : [profile, ...state.customModelProfiles],
          }
        }),
        activateCustomModelProfile: (id) => set((state) => {
          const profile = state.customModelProfiles.find((item) => item.id === id)
          if (!profile) return state
          return {
            provider: DEFAULT_AI_PROVIDER_ID,
            customKey: profile.customKey,
            customUrl: profile.customUrl,
            customModel: profile.customModel,
          }
        }),
        setTemperature: (temperature,) => set({
          temperature: Math.min(MAX_TEMPERATURE, Math.max(0, temperature)),
        },),
        setTopP: (topP,) => set({ topP, },),
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
        version: 14,
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as Partial<SettingsState>
          const migrated = { ...state }
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
          const modelSettings = normalizeImportedModelSettings(migrated as Record<string, unknown>)
          migrated.provider = modelSettings.provider
          migrated.customKey = modelSettings.customKey
          migrated.customUrl = modelSettings.customUrl
          migrated.customModel = modelSettings.customModel
          migrated.customModelProfiles = normalizeCustomModelProfiles(state.customModelProfiles)
          migrated.theme = 'minimal-white'
          migrated.preGenerateRounds = state.preGenerateRounds === 0 ? 0 : 1
          migrated.storySeed = ''
          return migrated as SettingsState
        },
        // 不持久化 set 函数
        partialize: (state,) => {
          const { setProvider: _sp, setCustomKey: _sck, setCustomUrl: _scu, setCustomModel: _scm, saveCustomModelProfile: _scmp, activateCustomModelProfile: _acmp, setTemperature: _st, setTopP: _stp, setReasoningEffort: _sre, setTalentThinkingIntensity: _stti, setAiTalentGeneration: _satg, setPreGenerateRounds: _spgr, storySeed: _seed, setStorySeed: _sss, setNarrativeStyle: _sns, saveNarrativeStyleText: _snst, restoreDefaultNarrativeStyle: _rdns, setWordCountTarget: _swct, setStreamingMode: _ssm, setComfortableParagraphs: _scp, setReduceMotion: _srm, setTheme: _sth, ...rest } = state
          return rest
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SettingsState>
          const modelSettings = normalizeImportedModelSettings(persisted as Record<string, unknown>)
          return {
            ...currentState,
            ...persisted,
            ...modelSettings,
            customModelProfiles: normalizeCustomModelProfiles(persisted.customModelProfiles),
            storySeed: '',
            preGenerateRounds: persisted.preGenerateRounds === 0 ? 0 : 1,
            temperature: typeof persisted.temperature === 'number'
              ? Math.min(MAX_TEMPERATURE, Math.max(0, persisted.temperature))
              : currentState.temperature,
            wordCountTarget: resolveNarrativeWordCountTarget(persisted.wordCountTarget),
          }
        },
      },
    ),
    { name: 'mod-settings', },
  ),
)

/** 是否已配置可用的 API Key（欢迎页 / 世界选择等轻量校验） */
export function isApiConfigured(): boolean {
  const { provider, customKey, customUrl, customModel } = useSettingsStore.getState()
  return provider === DEFAULT_AI_PROVIDER_ID
    && Boolean(customKey.trim() && customUrl.trim() && customModel.trim())
}

/** 只有玩家自有 API 配置完整时才允许开始游戏。 */
export async function hasAvailableApiConfiguration(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  return isApiConfigured()
}
