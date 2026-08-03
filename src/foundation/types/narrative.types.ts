/**
 * Purpose: Preserve the public narrative type API and the code-generated PromptContext source contract.
 * Owner: foundation:types
 * Responsibility: Prompt-facing types and explicit exports only; narrative subdomains live below narrative/.
 */

import type { ZodSchema } from 'zod'
import type { ContextCapabilityProfile, SimulationScope, WorldContextKind } from '../subsystem-contracts'

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
  rarity?: string
  polarity?: string
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

/** Prompt 构建上下文；代码生成器从本入口读取字段，不能移动到下级文件。 */
export interface PromptContext {
  worldNarrativeView: Record<string, unknown>
  characterProfileView: Record<string, unknown>
  characterStatusView: Record<string, unknown>
  subsystemSummaries: string[]
  roundSystemGuidanceText?: string
  playerBranchIntent?: Record<string, unknown>
  eventInjectionText?: string
  timeBridgeSummary?: string
  systemChangeSummary?: string
  narrativeGuidanceText?: string
  worldTagsText?: string
  worldRules?: string
  timelineMemory?: string
  narrativeStyle?: string
  narrativeToneHint?: string
  modWorldRules?: string
  plotStructureText?: string
  foreshadowingText?: string
  wordCountInstruction?: string
  calibrationSummary?: string
  causalChainHint?: string
  currentTime?: string
  talents?: string
  timeGuideText?: string
  powerFramework?: string
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
  DIFFICULTY_MULTIPLIERS_FORTUNE,
  DIFFICULTY_MULTIPLIERS_HEALTH,
} from './narrative/difficulty'
export type {
  CompressedMemoryEvent,
  CompressedSummaries,
  CompressedSummaryItem,
  DeathCause,
  LongTermMemory,
  NarrativeDirection,
  SummaryLevel,
  WorldDirectionRecord,
  YearEvent,
  YearEventKeyEvent,
} from './narrative/memory'
export type { ForbiddenActionPattern } from './narrative/content-policy'
export { FORBIDDEN_ACTION_PATTERNS, SAFETY_GUIDE } from './narrative/content-policy'
export type { NarrativeStage, NarrativeStageMachine } from './narrative/stage'
