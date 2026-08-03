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
  WorldInitAIStatus,
} from './types/calibration'
export type {
  AnyWorldEntity,
  Faction,
  GenerationStrategy,
  MapTemplateConfig,
  Nation,
  NobleHouse,
  RegionData,
  Settlement,
  TradeRoute,
  WorldEntity,
} from './types/entities'
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
