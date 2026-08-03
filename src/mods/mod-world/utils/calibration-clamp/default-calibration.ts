/**
 * Purpose: Derive the rule-based calibration used when no validated AI calibration is available.
 * Owner: mod-world / world calibration.
 * Responsibility: Default inference only; raw input clamping and summaries stay outside.
 */

import type {
  EventDistributionStrategy,
  MapTemplateId,
  WorldCalibration,
  WorldCalibrationFormulas,
  WorldConfig,
} from '../../types'
import { WORLDVIEW_STYLE_HINTS } from '../../constants'
import { shouldUseGenericSimulationPools } from '../world-pool-selectors'
import { buildDefaultWorldScale } from '../world-scale-calibration'
import { clampModifier } from './modifier-contract'

function inferStrategy(config: WorldConfig): EventDistributionStrategy {
  if (config.civilizationStage === 'primitive' || config.civilizationStage === 'ancient') {
    return 'prehistoric'
  }
  if (config.essenceTag === 'postApocalyptic' || config.essenceTag === 'survivalHorror') {
    return 'apocalyptic'
  }
  if (config.essenceTag === 'cultivation' || config.essenceTag === 'easternFantasy') {
    return 'mystical'
  }
  if (config.essenceTag === 'historical' || config.essenceTag === 'materialist') {
    return 'political'
  }
  if (config.civilizationStage === 'space') return 'cosmic_epic'
  return 'balanced'
}

export function inferMapTemplate(config: WorldConfig): MapTemplateId {
  if (config.civilizationStage === 'space') return 'starSystems'
  if (config.spatialForm === 'plane') return 'plane'
  if (
    config.essenceTag === 'cultivation'
    || config.essenceTag === 'easternFantasy'
    || config.essenceTag === 'wuxia'
  ) {
    return 'flatDiscWorld'
  }
  if (config.essenceTag === 'lovecraftian' || config.essenceTag === 'survivalHorror') return 'void'
  return 'continent'
}

export function buildDefaultCalibration(config: WorldConfig): WorldCalibration {
  const strategy = inferStrategy(config)
  const formulas: WorldCalibrationFormulas = { eventDistributionStrategy: strategy }

  if (config.civilizationStage === 'primitive') {
    formulas.techProgressModifier = 0.3
    formulas.birthRateModifier = 0.75
    formulas.socialMobilityModifier = 1.2
    formulas.migrationRateModifier = 0.6
    formulas.literacyGrowthModifier = 0.5
    formulas.conflictEscalationModifier = 0.5
  } else if (config.civilizationStage === 'space') {
    formulas.techProgressModifier = 2.5
    formulas.industryProductivityModifier = 2
    formulas.migrationRateModifier = 1.4
  } else if (
    config.civilizationStage === 'industrial'
    || config.civilizationStage === 'modern'
    || config.civilizationStage === 'information'
  ) {
    formulas.literacyGrowthModifier = 1.2
    formulas.migrationRateModifier = 1.2
    formulas.incomeModifier = 1.15
  }

  if (config.essenceTag === 'postApocalyptic' || config.essenceTag === 'survivalHorror') {
    formulas.eventDistributionStrategy = 'apocalyptic'
    formulas.birthRateModifier = 0.65
    formulas.deathRateModifier = 1.8
    formulas.monsterThreatModifier = 2.5
    formulas.vitalityRecoveryModifier = 0.5
    formulas.conditionProgressionModifier = 1.5
    formulas.disasterFrequencyModifier = 2
    formulas.resourceConsumptionModifier = 1.5
    formulas.incomeModifier = 0.6
    formulas.populationModifier = 0.01
  }
  if (config.essenceTag === 'postApocalyptic') {
    formulas.fertilityModifier = 0.7
  } else if (config.essenceTag === 'cultivation' || config.essenceTag === 'easternFantasy') {
    formulas.eventDistributionStrategy = 'mystical'
    formulas.cultivationSpeedModifier = 2
    formulas.bottleneckModifier = 1.3
    formulas.lifespanModifier = 1.5
    formulas.socialMobilityModifier = 0.7
  } else if (config.essenceTag === 'scifi') {
    formulas.techProgressModifier = Math.max(formulas.techProgressModifier ?? 1, 2)
    formulas.techBreakthroughModifier = 1.5
  } else if (config.essenceTag === 'historical' || config.essenceTag === 'materialist') {
    if (strategy !== 'prehistoric') {
      formulas.eventDistributionStrategy = 'political'
      formulas.conflictEscalationModifier = 1.25
    }
    formulas.cultivationSpeedModifier = 0.2
  } else if (config.essenceTag === 'wuxia') {
    formulas.conflictEscalationModifier = 1.4
  }

  if (config.powerSystemTag === 'faith') formulas.devotionGainModifier = 1.4
  if (config.essenceTag === 'mythological' || config.essenceTag === 'lovecraftian') {
    formulas.devotionGainModifier = clampModifier((formulas.devotionGainModifier ?? 1) * 1.2)
    formulas.causalCaptureRate = 1.35
  } else if (strategy === 'prehistoric') {
    formulas.causalCaptureRate = 0.6
  } else if (config.essenceTag === 'historical' || config.essenceTag === 'materialist') {
    formulas.causalCaptureRate = 1.2
  }

  if (config.difficulty === 'hard') {
    formulas.disasterFrequencyModifier = clampModifier((formulas.disasterFrequencyModifier ?? 1) * 1.2)
  } else if (config.difficulty === 'nightmare') {
    formulas.vitalityRecoveryModifier = clampModifier((formulas.vitalityRecoveryModifier ?? 1) * 0.7)
    formulas.spiritRecoveryModifier = clampModifier((formulas.spiritRecoveryModifier ?? 1) * 0.8)
    formulas.conditionProgressionModifier = clampModifier((formulas.conditionProgressionModifier ?? 1) * 1.2)
    formulas.monsterThreatModifier = clampModifier((formulas.monsterThreatModifier ?? 1) * 1.4)
  } else if (config.difficulty === 'hell') {
    formulas.vitalityRecoveryModifier = 0.4
    formulas.staminaRecoveryModifier = 0.7
    formulas.spiritRecoveryModifier = 0.6
    formulas.conditionProgressionModifier = 1.5
    formulas.deathRateModifier = clampModifier((formulas.deathRateModifier ?? 1) * 1.5)
    formulas.monsterThreatModifier = 2
  }

  return {
    metadata: {
      essenceTag: config.essenceTag,
      civilizationStage: config.civilizationStage,
      powerSystemTag: config.powerSystemTag,
      spatialForm: config.spatialForm,
      difficulty: config.difficulty,
    },
    styleGuide: {
      worldviewStyleHint: shouldUseGenericSimulationPools()
        ? undefined
        : (WORLDVIEW_STYLE_HINTS[config.essenceTag] ?? undefined),
    },
    world: { mapTemplate: inferMapTemplate(config) },
    scale: buildDefaultWorldScale(config),
    formulas,
  }
}
