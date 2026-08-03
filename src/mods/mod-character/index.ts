/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 角色系统
 * @mod mod-character
 */

export type {
  BaseAttributes,
  AttributeModifiers,
  CharacterBaseState,
  DestinyPattern,
  DestinyPatternRarity,
  DestinyPatternPolarity,
  DestinyPatternState,
  MythicPattern,
  MythicPatternCandidate,
  MythicPatternSource,
  RaceLifespanConfig,
  LifespanDraftState,
  HealthProjection,
  LifespanProjection,
  LifecycleProjection,
  MoralityLevel,
  MoralityState,
  LuckNarrativeDirection,
  LuckNarrativeGuidance,
  LuckState,
  LuckModifiers,
  LuckPersistenceState,
  CharacterSummary,
} from './types'

export {
  ATTRIBUTE_NAMES,
  ATTR_KEYS,
  ATTRIBUTE_ICONS,
  ZERO_BASE_ATTRIBUTES,
  ROUND_DECIMALS,
  RACE_LIFESPAN,
  TRANSMIGRATOR_KEYWORDS,
  MORALITY_GOOD_KEYWORDS_MINOR,
  MORALITY_GOOD_KEYWORDS_MODERATE,
  MORALITY_GOOD_KEYWORDS_MAJOR,
  MORALITY_EVIL_KEYWORDS_MINOR,
  MORALITY_EVIL_KEYWORDS_MODERATE,
  MORALITY_EVIL_KEYWORDS_MAJOR,
  MORALITY_LEVELS,
  MORALITY_EXCLUDE_KEYWORDS,
  PRESET_DESTINY_PATTERNS,
  DESTINY_PATTERN_RARITY_WEIGHTS,
  DESTINY_PATTERN_RARITY_LIMITS,
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_PERSONAL_MODIFIERS,
  DESTINY_PATTERN_PERSONAL_MODIFIER_META,
  DESTINY_PATTERN_PERSONAL_MODIFIER_KEYS,
  DESTINY_PATTERN_WORLD_MODIFIERS,
  DESTINY_PATTERN_WORLD_MODIFIER_META,
  DESTINY_PATTERN_WORLD_MODIFIER_KEYS,
  DESTINY_PATTERN_MODIFIER_BENEFIT_DIRECTION,
  DESTINY_PATTERN_RARITY_RANK,
  DESTINY_PATTERN_POLARITY_CONFIG,
  DESTINY_PATTERN_SELECT_COUNT,
  DESTINY_PATTERN_EARLY_READY_COUNT,
  DESTINY_PATTERN_DISPLAY_COUNT,
  DEFAULT_DESTINY_PATTERN_COUNT,
  MYTHIC_PATTERN_SELECT_COUNT,
  MYTHIC_PATTERN_CANDIDATE_COUNT,
  AI_DESTINY_PATTERN_BATCH_SIZE,
  AI_DESTINY_PATTERN_BATCH_COUNT,
  AI_DESTINY_PATTERN_FIRST_SCREEN_CONCURRENCY,
  DESTINY_PATTERN_BULK_COUNT,
  DESTINY_PATTERN_FULL_POOL_COUNT,
  DESTINY_PATTERN_FAST_DRAW_THRESHOLD,
  CUSTOM_WORLD_CODE_START,
  DESTINY_PATTERN_ID_PREFIX,
  DEFAULT_MAX_VITALITY,
  DEFAULT_VITALITY,
  DEFAULT_STAMINA,
  DEFAULT_SPIRIT,
  LUCK_DISEASE_AVOIDANCE_PER_POINT,
  LUCK_DEATH_AVOID_CHANCE_PER_POINT,
  LUCK_EVENT_WEIGHT_PER_POINT,
  INITIAL_LUCK_MIN,
  INITIAL_LUCK_MAX,
  BASE_BAD_LUCK_DIRECTION_PERCENT,
  BASE_NEUTRAL_LUCK_DIRECTION_PERCENT,
  BASE_GOOD_LUCK_DIRECTION_PERCENT,
  LUCK_DIRECTION_PERCENT_PER_POINT,
  MIN_LUCK,
  MAX_LUCK,
} from './constants'

export {
  round,
  filterDigitsOnly,
} from './utils'

export { useCharacterStore } from './store'
export { useMythicLibraryStore, sealMythicPatternCandidate } from './mythic-library-store'
export { useLifeRecordStore } from './life-record-store'
export { useCharacter, useHealth, useDestinyPatterns } from './hooks'
export { useRaceOrigin } from './prompts/use-race-origin'

export { DESTINY_PATTERN_PRESETS_MATERIALIST } from './destiny-pattern-presets-materialist'
export { DESTINY_PATTERN_PRESETS_IDEALIST } from './destiny-pattern-presets-idealist'

export { raceOriginPrompt } from './prompts/race-origin'
export { destinyPatternPrompt } from './prompts/destiny-pattern-prompt'
export { sanitizeCharacterStateSnapshot } from './utils/character-state-migration'
export { aggregatePatternSystemModifiers } from './utils/destiny-pattern-modifiers'
export {
  formatPatternSystemModifiersForDisplay,
  type PatternModifierDisplayItem,
} from './utils/destiny-pattern-modifiers'
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
