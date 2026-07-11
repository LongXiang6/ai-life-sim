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
  Disease,
  Injury,
  HealthState,
  RaceLifespanConfig,
  BreakthroughPathway,
  BreakthroughRecord,
  LifespanState,
  LifeStageId,
  LifeStageConfig,
  LifeStageState,
  AttributeDecayState,
  MoralityLevel,
  MoralityState,
  DeathCause,
  CharacterSummary,
  PostDeathEpilogueState,
} from './types'

export type {
  StagePoolEntry,
  LifeStagePools,
} from './life-stage-pools'

export {
  ATTRIBUTE_NAMES,
  ATTR_KEYS,
  ATTRIBUTE_ICONS,
  TOTAL_ATTRIBUTE_POINTS,
  ROUND_DECIMALS,
  RACE_LIFESPAN,
  LIFESPAN_WORLD_MAP,
  LIFESPAN_BG_BONUS_KEYWORDS,
  BASE_HUMAN_LIFESPAN,
  MAX_LIFESPAN_CAP,
  TRANSMIGRATOR_KEYWORDS,
  DEFAULT_STAGE_DISPLAY_NAMES,
  BREAKTHROUGH_PATHWAYS,
  LIFESPAN_REDUCTION_KEYWORDS,
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
  DEFAULT_DESTINY_PATTERN_COUNT,
  AI_DESTINY_PATTERN_BATCH_SIZE,
  AI_DESTINY_PATTERN_BATCH_COUNT,
  DESTINY_PATTERN_BULK_COUNT,
  DESTINY_PATTERN_FULL_POOL_COUNT,
  DESTINY_PATTERN_FAST_DRAW_THRESHOLD,
  DESTINY_PATTERN_MAX_WORLD_SIZE_MB,
  DESTINY_PATTERN_TOTAL_MAX_MB,
  CUSTOM_WORLD_CODE_START,
  DESTINY_PATTERN_ID_PREFIX,
  AGE_DECAY_RATES,
  AGE_GROWTH_RATES,
  MIND_EXPERIENCE_BONUS,
  DEFAULT_MAX_HP,
  DEFAULT_STAMINA,
  DEFAULT_SPIRIT,
  INJURY_SEVERITY_LABELS,
  ILLNESS_SEVERITY_LABELS,
  RECOVERY_BASE_RATES,
  LUCK_DISEASE_AVOIDANCE_PER_POINT,
  LUCK_DEATH_AVOID_CHANCE_PER_POINT,
  LUCK_EVENT_WEIGHT_PER_POINT,
  LUCK_AGE_DECAY_MODIFIER_PER_POINT,
  MIN_LUCK,
  MAX_LUCK,
  DEATH_CAUSE_LABELS,
} from './constants'

export {
  round,
  getRecoveryRounds,
  getHealthStatusLabel,
  getMentalStateLabel,
  inferDeathCause,
  filterDigitsOnly,
  hasImmortalLifespanHint,
  shouldSkipOldAgeDeath,
} from './utils'

export {
  LIFE_STAGE_POOLS_BY_WORLDVIEW,
  FALLBACK_POOLS,
  getLifeStagePoolForWorldview,
  formatStageEventsForPrompt,
} from './life-stage-pools'

export { useCharacterStore } from './store'
export { useCharacter, useHealth, useDestinyPatterns } from './hooks'
export { useRaceOrigin } from './prompts/use-race-origin'

export { DESTINY_PATTERN_PRESETS_MATERIALIST } from './destiny-pattern-presets-materialist'
export { DESTINY_PATTERN_PRESETS_IDEALIST } from './destiny-pattern-presets-idealist'

export { raceOriginPrompt } from './prompts/race-origin'
export { destinyPatternPrompt } from './prompts/destiny-pattern-prompt'
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
