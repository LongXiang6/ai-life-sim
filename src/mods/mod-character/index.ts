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
  DestinyPatternGrowthHistoryEntry,
  DestinyPatternGrowthOption,
  DestinyPatternRarity,
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
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_RARITY_RANK,
  DESTINY_PATTERN_DISPLAY_COUNT,
  DEFAULT_DESTINY_PATTERN_COUNT,
  PATTERN_LOADOUT_SLOT_COUNT,
  AI_DESTINY_PATTERN_BATCH_SIZE,
  AI_DESTINY_PATTERN_THREAD_ASSIGNMENTS,
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
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
  isPatternLoadoutComplete,
} from './pattern-loadout'
export {
  createDestinyPatternLineageId,
  createPendingDestinyPatternGrowth,
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  getNextDestinyPatternRarity,
  registerPendingDestinyPatternGrowthInState,
  resolvePendingDestinyPatternGrowth,
  resolvePendingDestinyPatternGrowthInState,
  withInitialDestinyPatternGrowthIdentity,
} from './destiny-pattern-growth'
export { useReincarnationLibraryStore } from './reincarnation-library-store'
export { getReincarnationPromotionTargetRarity } from './reincarnation-talent-access'
export { useLifeRecordStore } from './life-record-store'
export { useCharacter, useCharacterStatus, useDestinyPatterns } from './hooks'
export { useRaceOrigin } from './prompts/use-race-origin'

export { DESTINY_PATTERN_PRESETS_MATERIALIST } from './destiny-pattern-presets-materialist'
export { DESTINY_PATTERN_PRESETS_IDEALIST } from './destiny-pattern-presets-idealist'

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

// 天赋预设库
export {
  ALL_SHARED_TALENTS,
  TALENTS_BY_POLARITY,
  TALENTS_BY_RARITY,
  IDEALIST_TALENT_SET,
  MATERIALIST_TALENT_SET,
  ADVENTURE_TALENT_SET,
  LIFE_TALENT_SET,
  findTalentById,
  drawTalents,
  sumAttrBonus,
} from './prompts/talent-presets'
export type {
  TalentPreset,
  TalentRarity,
  TalentPolarity,
  AttrBonusKey,
} from './prompts/talent-presets'

// 天赋子系统 UI 配置
export {
  TALENT_RARITY_CONFIG,
  TALENT_POLARITY_CONFIG,
  TALENT_SELECT_COUNT,
} from './config/talent-ui-config'
