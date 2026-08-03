/**
 * Purpose: Define the canonical calibration modifier range and formula-key registry.
 * Owner: mod-world / world calibration.
 * Responsibility: Shared modifier contract only; defaults, clamping, and formatting stay separate.
 */

import type { WorldCalibrationFormulas } from '../../types'

export const MODIFIER_MIN = 0.01
export const MODIFIER_MAX = 100

export const FORMULA_KEYS: (keyof WorldCalibrationFormulas)[] = [
  'populationModifier', 'developmentModifier', 'impactRangeModifier',
  'birthRateModifier', 'fertilityModifier', 'deathRateModifier', 'inflationModifier', 'tradeMultiplierModifier',
  'vitalityRecoveryModifier', 'staminaRecoveryModifier', 'spiritRecoveryModifier',
  'conditionProgressionModifier', 'lifespanModifier',
  'cultivationSpeedModifier', 'bottleneckModifier',
  'monsterThreatModifier', 'monsterSpawnModifier', 'luckPointModifier',
  'socialMobilityModifier', 'factionEmergenceModifier', 'warFrequencyModifier',
  'warDamageModifier', 'legalEnforcementModifier', 'ecologyRecoveryModifier',
  'pollutionDecayModifier', 'resourceConsumptionModifier', 'disasterFrequencyModifier',
  'techProgressModifier', 'techBreakthroughModifier', 'industryProductivityModifier',
  'economyModifier', 'eventDistributionStrategy',
  'migrationRateModifier', 'literacyGrowthModifier', 'incomeModifier',
  'conflictEscalationModifier', 'devotionGainModifier', 'causalCaptureRate',
]

export function clampModifier(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MODIFIER_MAX, Math.max(MODIFIER_MIN, value))
}
