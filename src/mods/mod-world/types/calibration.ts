/**
 * Purpose: Define world initialization status, calibration, scale modifiers, and map template identifiers.
 * Owner: mod-world / world calibration.
 * Responsibility: Calibration contracts only; configuration ownership and runtime application stay outside.
 */

import type { WorldScaleCalibration } from '@/foundation'
import type { WorldConfig } from './world-config'

export interface WorldInitAIStatus {
  status: 'idle' | 'running' | 'complete' | 'failed'
  currentStep?: string
  stepTimers?: Record<string, { start: number; end?: number }>
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  regionProfilesGenerated: boolean
  errors: string[]
}

export type EventDistributionStrategy =
  | 'balanced'
  | 'prehistoric'
  | 'political'
  | 'cosmic_epic'
  | 'apocalyptic'
  | 'mystical'

export type MapTemplateId =
  | 'continent'
  | 'archipelago'
  | 'pangaea'
  | 'multiContinent'
  | 'oceanWorld'
  | 'plane'
  | 'starSystems'
  | 'flatDiscWorld'
  | 'void'

export interface EntityCountRange {
  min: number
  max: number
}

export interface WorldCalibration {
  metadata: {
    essenceTag: string
    civilizationStage: string
    powerSystemTag: string
    spatialForm: string
    difficulty?: WorldConfig['difficulty']
  }
  styleGuide?: {
    worldviewStyleHint?: string
    narrativeTone?: string
    eventTypeWeights?: Record<string, number>
  }
  timeline?: {
    eraStartYear?: number
    stageSpan?: number
  }
  entities?: {
    nationCount?: EntityCountRange
    factionCount?: EntityCountRange
    nobleHouseCount?: EntityCountRange
    settlementCount?: EntityCountRange
    tradeRouteCount?: EntityCountRange
  }
  world?: {
    developmentRange?: { min: number; max: number }
    mapTemplate?: MapTemplateId
    regionCount?: number
  }
  scale: WorldScaleCalibration
  formulas?: WorldCalibrationFormulas
}

export interface WorldCalibrationFormulas {
  populationModifier?: number
  developmentModifier?: number
  impactRangeModifier?: number
  birthRateModifier?: number
  fertilityModifier?: number
  deathRateModifier?: number
  inflationModifier?: number
  tradeMultiplierModifier?: number
  vitalityRecoveryModifier?: number
  staminaRecoveryModifier?: number
  spiritRecoveryModifier?: number
  conditionProgressionModifier?: number
  lifespanModifier?: number
  cultivationSpeedModifier?: number
  bottleneckModifier?: number
  monsterThreatModifier?: number
  monsterSpawnModifier?: number
  luckPointModifier?: number
  socialMobilityModifier?: number
  factionEmergenceModifier?: number
  warFrequencyModifier?: number
  warDamageModifier?: number
  legalEnforcementModifier?: number
  ecologyRecoveryModifier?: number
  pollutionDecayModifier?: number
  resourceConsumptionModifier?: number
  disasterFrequencyModifier?: number
  techProgressModifier?: number
  techBreakthroughModifier?: number
  industryProductivityModifier?: number
  economyModifier?: number
  eventDistributionStrategy?: EventDistributionStrategy
  migrationRateModifier?: number
  literacyGrowthModifier?: number
  incomeModifier?: number
  conflictEscalationModifier?: number
  devotionGainModifier?: number
  causalCaptureRate?: number
}

export type FormulaModifierKey = Exclude<keyof WorldCalibrationFormulas, 'eventDistributionStrategy'>
