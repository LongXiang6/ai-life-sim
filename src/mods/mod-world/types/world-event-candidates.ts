/**
 * Purpose: Define read-only local world-event candidate contracts.
 * Owner: mod-world / world-event catalog.
 * Responsibility: Candidate shape only; selection and Prompt projection stay outside.
 */

import type { RegionNarrativeProfile } from '@/foundation'
import type { WorldCalibration } from './calibration'
import type { WorldConfig } from './world-config'
import type { WorldTagsV2 } from './world-tags'

export type WorldEventCategory =
  | 'environment'
  | 'social'
  | 'economic'
  | 'political'
  | 'ecological'
  | 'technology'
  | 'migration'
  | 'discovery'
  | 'hazard'
  | 'opportunity'

export type WorldEventIntensity = 'minor' | 'moderate' | 'major'

export type WorldEventTriggerKind = 'always' | 'tag' | 'threshold' | 'cooldown'

export interface WorldEventTrigger {
  kind: WorldEventTriggerKind
  label: string
}

/**
 * A candidate is a possible fact for the current story round, not a committed
 * historical event or a world-state mutation.
 */
export interface WorldEventCandidate {
  candidateKey: string
  category: WorldEventCategory
  title: string
  fact: string
  trigger: WorldEventTrigger
  intensity: WorldEventIntensity
  cooldownRounds: number
  seedSelector: string
  contextId: string
  regionId?: string
  generatedAtRound: number
  adoptionInstruction: string
}

export interface WorldEventCooldownState {
  readonly [candidateKey: string]: number
}

export interface WorldEventCandidateInput {
  contextId: string
  regionId?: string
  worldConfig?: WorldConfig | null
  worldTags?: WorldTagsV2 | null
  legacyWorldTags?: readonly string[]
  calibration?: WorldCalibration | null
  regionProfile?: RegionNarrativeProfile | null
  roundSequence: number
  storySeed?: string
  maxCandidates?: number
  /** Optional caller-owned reservation state; the generator never persists it. */
  cooldownState?: WorldEventCooldownState
}

export interface WorldEventCandidateBatch {
  seedSelector: string
  candidates: WorldEventCandidate[]
  /** A copy containing reservations for the selected candidates only. */
  nextCooldownState: WorldEventCooldownState
}
