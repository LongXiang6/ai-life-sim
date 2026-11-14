/**
 * Purpose: Preserve the public narrative type API and the code-generated PromptContext source contract.
 * Owner: foundation:types
 * Responsibility: Prompt-facing types and explicit exports only; narrative subdomains live below narrative/.
 */

import type { ZodSchema } from 'zod'
import type { ContextCapabilityProfile, SimulationScope, WorldContextKind } from '../subsystem-contracts'
import type { NarrativeControlPlaneView } from './narrative/control-plane'

export type {
  NarrativeBirthProfile,
  NarrativeLifePlan,
  NarrativeEventCard,
  NarrativeWorldTimelineCommitment,
  NarrativeControlPlaneView,
  FateDramaticBias,
} from './narrative/control-plane'
export {
  FATE_DRAMATIC_BIAS_LABELS,
  FATE_DRAMATIC_BIASES,
} from './narrative/control-plane'

export interface WorldSetting {
  contextId: string
  contextKind: WorldContextKind
  simulationScope: SimulationScope
  capabilityProfile: ContextCapabilityProfile
  name: string
  description: string
  era: string
  config: Record<string, unknown>
}

export interface CharacterDestinyPatternSummary {
  name: string
  description: string
  effect?: string
  aptitudeTier: number
  developmentStage: 'awakening' | 'mastery' | 'complete'
  apexStrengthenLevel?: number
}

export interface CharacterState {
  characterId: string
  name: string
  age: number
  gender: string
  background: string
  attributes: Record<string, unknown>
  destinyPatterns?: CharacterDestinyPatternSummary[]
}

export interface NarrativeTalentPromptView {
  /** 本轮请求内的不透明引用；不暴露持久化 lineageId。 */
  引用?: string
  名称: string
  资质阶位: string
  开发阶段: string
  至高强化阶数?: number
  效果: string
}

/** Prompt 构建上下文；代码生成器从本入口读取字段，不能移动到下级文件。 */
export interface PromptContext {
  worldNarrativeView: Record<string, unknown>
  characterProfileView: Record<string, unknown>
  characterStatusView: Record<string, unknown>
  subsystemSummaries: string[]
  playerBranchIntent?: Record<string, unknown>
  systemChangeSummary?: string
  worldTagsText?: string
  timelineMemory?: string[]
  /** 主叙事可见的最近完整正文窗口；区别于压缩后的历史连续性事实。 */
  recentStories?: string[]
  currentRegion?: string
  narrativeStyle?: string
  /** 主叙事动态称呼方式；由设置 Store 提供，缺失时按第二人称处理。 */
  narrativeAddressing?: 'first-person' | 'second-person' | 'character-name'
  narrativeToneHint?: string
  plotStructureText?: string
  foreshadowingText?: string
  wordCountInstruction?: string
  calibrationSummary?: string
  causalChainHint?: string
  currentTime?: string
  /** 主叙事本轮实际覆盖的时间窗口；由统一时间真源派生，不是独立状态。 */
  narrativeTimeWindow?: string
  /** 开启批量自动推进时，一次主故事调用应返回的有序故事包数量。 */
  narrativeBatchSize?: number
  talents?: NarrativeTalentPromptView[]
  /** 条件触发式叙事控制平面的只读投影。 */
  controlPlane?: NarrativeControlPlaneView
}

export interface PromptTemplate<TOutput = unknown> {
  name: string
  version: string
  mod: string
  systemPrompt: string
  serverPromptAssetId?: string
  userPromptTemplate: string
  variables: string[]
  outputFormat: 'json' | 'text' | 'markdown'
  outputSchema?: ZodSchema<TOutput>
}

export type { DifficultyLevel } from './narrative/difficulty'
export {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  DIFFICULTY_NARRATIVE_GUIDANCE,
  DIFFICULTY_ORDER,
} from './narrative/difficulty'
export type {
  CompressedMemoryEvent,
  CompressedSummaries,
  CompressedSummaryItem,
  DeathCause,
  LongTermMemory,
  NarrativeDirection,
  WorldDirectionRecord,
  YearEvent,
  YearEventKeyEvent,
} from './narrative/memory'
export type { ForbiddenActionPattern } from './narrative/content-policy'
export { FORBIDDEN_ACTION_PATTERNS, SAFETY_GUIDE } from './narrative/content-policy'
export type { NarrativeStage, NarrativeStageMachine } from './narrative/stage'
