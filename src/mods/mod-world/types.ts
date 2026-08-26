/**
 * Purpose: Preserve the public mod-world type API through focused domain contracts.
 * Owner: mod-world.
 * Responsibility: Type exports only; no runtime behavior or duplicate declarations.
 */

export type {
  EntityCountRange,
  EventDistributionStrategy,
  FormulaModifierKey,
  MapTemplateId,
  WorldCalibration,
  WorldCalibrationFormulas,
} from './types/calibration'
export type { GenerationStrategy, MapTemplateConfig, RegionData } from './types/regions'
export type { WorldConfig } from './types/world-config'
export type {
  WorldContextCollection,
  WorldContextInstance,
  WorldSnapshot,
} from './types/world-context'
export type {
  CulturalFabricTags,
  DemographicsTags,
  EconomyTags,
  EnvironmentTags,
  SocietyTags,
  SupernaturalTags,
  WorldTagConstraints,
  WorldTagsV2,
} from './types/world-tags'
export type {
  WorldEventCandidate,
  WorldEventCandidateBatch,
  WorldEventCandidateInput,
  WorldEventCategory,
  WorldEventCooldownState,
  WorldEventIntensity,
  WorldEventTrigger,
  WorldEventTriggerKind,
} from './types/world-event-candidates'
