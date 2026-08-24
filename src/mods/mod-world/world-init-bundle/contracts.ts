/**
 * Purpose: Define local world-creation results and context options.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Stable local-creation contracts only; no initialization or Store writes.
 */

import type {
  ContextCapability,
  LocalCalendarProfile,
  SimulationScope,
  WorldContextKind,
} from '@/foundation'
import type { WorldConfig, WorldSnapshot } from '../types'

export interface WorldCommitResult {
  contextId: string
  config: WorldConfig
  snapshot: WorldSnapshot
  worldCode: number
  formattedTags: string
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
