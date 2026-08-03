/**
 * Purpose: Define the stable data contract for world initialization pipeline collaborators.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Types and shared identifiers only; no execution or state mutation.
 */

import type {
  AIModelConfig,
  ExecutionNodeSignal,
  ExecutionPhase,
} from '@/foundation'
import type { WorldEntitySystem } from '../../world-init-bundle-deps'
import type { WorldConfig } from '../../types'

export const MAX_AI_RETRIES = 3
export const RETRY_DELAY_MS = 2000
export const WORLD_INIT_OWNER = 'mod-world'
export const WORLD_INIT_FAILURE_TARGET = 'mod-world'

export interface WorldInitPipelineResult {
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  entitiesGenerated: boolean
  errors: string[]
  rawTags?: string[]
}

export interface WorldInitPipelineContext {
  config: WorldConfig
  configBeforeCoherence: WorldConfig
  worldCode: number
  startingYear?: number
  model: string
  provider: string
  customUrl: string
  customKey: string
  aiConfig: AIModelConfig
  initFingerprint: string
  promptVars: Record<string, string>
  errors: string[]
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  entitiesGenerated: boolean
  rawTags?: string[]
  currentStep: string
  entitySystem: WorldEntitySystem
}

export interface WorldInitStep {
  id: string
  label: string
  phase: ExecutionPhase
  dependsOn: readonly string[]
  order: number
  owner: string
  failureTarget: string
  optional?: boolean
  timeoutMs?: number
  shouldSkip?: (context: WorldInitPipelineContext) => boolean | Promise<boolean>
  run: (context: WorldInitPipelineContext) => Promise<ExecutionNodeSignal | undefined>
}
