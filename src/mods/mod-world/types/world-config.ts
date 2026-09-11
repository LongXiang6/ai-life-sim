/**
 * Purpose: Define the player-authored and AI-enriched world configuration contract.
 * Owner: mod-world / world configuration.
 * Responsibility: World configuration fields only; calibration, entities, and context state stay separate.
 */

import type {
  CharacterLifeStageDefinition,
  PowerFrameworkDefinition,
} from '@/foundation'

export interface WorldConfig {
  name: string
  eraName?: string
  eraStartYear?: number
  essenceTag: string
  powerSystemTag: string
  powerFramework: PowerFrameworkDefinition
  spatialForm: string
  civilizationStage: string
  difficulty: 'normal' | 'hard' | 'nightmare' | 'hell'
  description: string
  lifeStageTemplate?: CharacterLifeStageDefinition[]
  worldType?: string
  _aiFlags?: Record<string, boolean>
  _coherenceLocks?: Partial<Record<'essenceTag' | 'civilizationStage' | 'powerSystemTag' | 'spatialForm', boolean>>
  _dimensionModes?: Record<string, 'ai' | 'adaptive' | 'custom'>
  _dimensionValues?: Record<string, string>
}
