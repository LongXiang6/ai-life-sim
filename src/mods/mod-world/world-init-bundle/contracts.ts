/**
 * Purpose: Define world-init bundle results, creation options, and the internal AI configuration.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Stable data contracts only; no initialization or Store writes.
 */

import type {
  AIModelConfig,
  ContextCapability,
  LocalCalendarProfile,
  SimulationScope,
  WorldContextKind,
} from '@/foundation'
import type { WorldConfig, WorldSnapshot } from '../types'
export const WORLD_AI_CONFIG: AIModelConfig = {
  model: 'deepseek-v4-flash',
  temperature: 0.3,
  responseFormat: { type: 'json_object' },
  reasoningEffort: 'disabled',
  stream: false,
}

export interface WorldCommitResult {
  contextId: string
  config: WorldConfig
  snapshot: WorldSnapshot
  worldCode: number
  formattedTags: string
}

export interface WorldInitBundleResult {
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  entitiesGenerated: boolean
  scoringProfileGenerated: boolean
  errors: string[]
  rawTags?: string[]
}

export interface WorldContextCreationOptions {
  contextId?: string
  parentContextId?: string
  contextKind?: WorldContextKind
  localCalendar?: LocalCalendarProfile
  capabilities?: ContextCapability[]
  makeActive?: boolean
  connectFromCurrent?: boolean
  initialScope?: Exclude<SimulationScope, 'closed'>
  globalTotalDays?: number
}

export interface AdditionalWorldContextOptions extends WorldContextCreationOptions {
  worldCode?: number
  startingYear?: number
}
