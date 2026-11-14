/**
 * Purpose: Export the public character MOD contracts and runtime capabilities.
 * Owner: mod-character
 * Responsibility: Public exports only; implementation and state remain in their owning modules.
 */

export type {
  BaseAttributes,
  AttributeModifiers,
  CharacterBaseState,
  DestinyPattern,
  DestinyPatternCategory,
  DestinyPatternGrowthDirection,
  DestinyPatternGrowthAssessment,
  DestinyPatternGrowthEvidence,
  DestinyPatternGrowthHistoryEntry,
  DestinyPatternGrowthOption,
  DestinyPatternAptitudeTier,
  DestinyPatternDevelopmentStage,
  DestinyPatternState,
  PendingDestinyPatternGrowth,
  ReincarnationTalent,
  ReincarnationTalentSource,
  RaceLifespanConfig,
  LifespanDraftState,
  CharacterBiologicalClockMode,
  CharacterConditionState,
  CharacterDeathCauseKind,
  CharacterDeathOutcome,
  CharacterFortuneLevel,
  CharacterFortuneState,
  CharacterHealthState,
  CharacterLifeStageDefinition,
  CharacterNarrativeStatus,
  PendingCharacterDeath,
  CharacterSummary,
} from './types'

export {
  ATTRIBUTE_NAMES,
  ATTR_KEYS,
  ATTRIBUTE_ICONS,
  ZERO_BASE_ATTRIBUTES,
  ROUND_DECIMALS,
  RACE_LIFESPAN,
  PRESET_DESTINY_PATTERNS,
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_APTITUDE_ORDER,
  DESTINY_PATTERN_APTITUDE_CONFIG,
  DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG,
  DESTINY_PATTERN_DISPLAY_COUNT,
  DEFAULT_DESTINY_PATTERN_COUNT,
  PATTERN_LOADOUT_SLOT_COUNT,
  AI_DESTINY_PATTERN_BATCH_SIZE,
  DESTINY_PATTERN_CATEGORY_INITIAL_COUNT,
  AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS,
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
  DESTINY_PATTERN_ATTRIBUTE_CAP_MULTIPLIER,
  CUSTOM_WORLD_CODE_START,
  DESTINY_PATTERN_ID_PREFIX,
  DEFAULT_MAX_VITALITY,
  DEFAULT_VITALITY,
  DEFAULT_STAMINA,
  DEFAULT_SPIRIT,
} from './constants'

export {
  round,
  filterDigitsOnly,
} from './utils'

export { useCharacterStore } from './store'
export {
  assertPatternLoadout,
  getPatternLoadoutCount,
  isPatternLoadoutValid,
} from './pattern-loadout'
export {
  createDestinyPatternLineageId,
  createPendingDestinyPatternGrowth,
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  getNextDestinyPatternAptitudeTier,
  getNextDestinyPatternDevelopmentStage,
  registerPendingDestinyPatternGrowthInState,
  resolvePendingDestinyPatternGrowth,
  resolvePendingDestinyPatternGrowthInState,
  withInitialDestinyPatternGrowthIdentity,
} from './destiny-pattern-growth'
export { useReincarnationLibraryStore } from './reincarnation-library-store'
export { getReincarnationPromotionTargetAptitudeTier } from './reincarnation-talent-access'
export { useLifeRecordStore } from './life-record-store'
export { useCharacter, useCharacterStatus, useDestinyPatterns } from './hooks'
export { useRaceOrigin } from './prompts/use-race-origin'

export { raceOriginPrompt } from './prompts/race-origin'
export { sanitizeCharacterStateSnapshot } from './utils/character-state-migration'
export type { PromptTemplate } from '@/foundation'

export { randomName } from './utils/name'
export {
  getAttrTierIndex,
  getAttrSemantic,
  getAllAttrSemantics,
  ATTR_TIER_DESCRIPTIONS,
  VISIBLE_ATTR_VALUE_DESCRIPTIONS,
  HIDDEN_ATTRS,
  VISIBLE_ATTR_KEYS,
} from './utils/attr-tiers'
