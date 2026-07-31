/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 全项目事件常量（由 manifest.events 自动生成，勿手动编辑） */
export const EVENTS = {
  // mod-base-universe
  MOD_BASE_UNIVERSE_CELESTIAL_PHASE_CHANGED: 'mod-base-universe:celestial-phase-changed',
  MOD_BASE_UNIVERSE_ERA_CHANGED: 'mod-base-universe:era-changed',
  MOD_BASE_UNIVERSE_PROPHECY_FULFILLED: 'mod-base-universe:prophecy-fulfilled',
  MOD_BASE_UNIVERSE_PROPHECY_BROKEN: 'mod-base-universe:prophecy-broken',
  MOD_BASE_UNIVERSE_DEITY_EMERGED: 'mod-base-universe:deity-emerged',
  MOD_BASE_UNIVERSE_DEITY_DEPARTED: 'mod-base-universe:deity-departed',
  MOD_ENGINE_ROUND_COMPLETE: 'mod-engine:round-complete',
  // mod-character
  MOD_CHARACTER_CREATED: 'mod-character:created',
  MOD_CHARACTER_DIED: 'mod-character:died',
  // mod-culture
  MOD_CULTURE_FESTIVAL_TRIGGERED: 'mod-culture:festival-triggered',
  MOD_CULTURE_MASTERPIECE_CREATED: 'mod-culture:masterpiece-created',
  MOD_CULTURE_TECH_ADVANCE: 'mod-culture:tech-advance',
  // mod-difficulty
  MOD_DIFFICULTY_CHANGED: 'mod-difficulty:changed',
  // mod-economy
  MOD_ECONOMY_MARKET_PHASE_CHANGE: 'mod-economy:market-phase-change',
  MOD_ECONOMY_SETTLEMENT_UPGRADE: 'mod-economy:settlement-upgrade',
  MOD_ECONOMY_ITEM_ACQUIRED: 'mod-economy:item-acquired',
  MOD_ECONOMY_CAREER_PROMOTION: 'mod-economy:career-promotion',
  MOD_ECONOMY_POPULATION_MILESTONE: 'mod-economy:population-milestone',
  // mod-engine
  MOD_ENGINE_ROUND_START: 'mod-engine:round-start',
  MOD_ENGINE_POST_NARRATIVE_NOTIFICATION: 'mod-engine:post-narrative-notification',
  MOD_ENGINE_NARRATIVE_COMPRESSED: 'mod-engine:narrative-compressed',
  CORE_ALL_MODS_LOADED: 'core:all-mods-loaded',
  // mod-environment-ecology
  MOD_ENVIRONMENT_ECOLOGY_DISASTER_OCCURRED: 'mod-environment-ecology:disaster-occurred',
  MOD_ENVIRONMENT_ECOLOGY_RESOURCE_DEPLETED: 'mod-environment-ecology:resource-depleted',
  MOD_ENVIRONMENT_ECOLOGY_SPECIES_EXTINCT: 'mod-environment-ecology:species-extinct',
  MOD_ENVIRONMENT_ECOLOGY_POLLUTION_CRITICAL: 'mod-environment-ecology:pollution-critical',
  // mod-politics
  MOD_POLITICS_STRATUM_CHANGE: 'mod-politics:stratum-change',
  MOD_POLITICS_FACTION_EMERGED: 'mod-politics:faction-emerged',
  MOD_POLITICS_CONFLICT_TRANSITIONED: 'mod-politics:conflict-transitioned',
  MOD_POLITICS_LAW_ENACTED: 'mod-politics:law-enacted',
  MOD_POLITICS_CONFLICT_ESCALATED: 'mod-politics:conflict-escalated',
  // mod-power-system
  MOD_POWER_SYSTEM_STAGE_BREAKTHROUGH: 'mod-power-system:stage-breakthrough',
  MOD_POWER_SYSTEM_CULTIVATION_BOTTLENECK: 'mod-power-system:cultivation-bottleneck',
  MOD_POWER_SYSTEM_CULTIVATION_BREAKTHROUGH: 'mod-power-system:cultivation-breakthrough',
  MOD_POWER_SYSTEM_MONSTER_EVOLUTION: 'mod-power-system:monster-evolution',
  MOD_POWER_SYSTEM_LUCK_CHANGED: 'mod-power-system:luck-changed',
  MOD_POWER_SYSTEM_FORTUNE_ENCOUNTER_TRIGGERED: 'mod-power-system:fortune-encounter-triggered',
  MOD_POWER_SYSTEM_FAITH_CHANGED: 'mod-power-system:faith-changed',
  MOD_POWER_SYSTEM_DIVINE_INTERVENTION_TRIGGERED: 'mod-power-system:divine-intervention-triggered',
  MOD_POWER_SYSTEM_ANOMALY_ZONE_APPEARED: 'mod-power-system:anomaly-zone-appeared',
  // mod-tech-level
  MOD_TECH_LEVEL_INDUSTRY_SHIFT: 'mod-tech-level:industry-shift',
  MOD_TECH_LEVEL_TECH_BREAKTHROUGH: 'mod-tech-level:tech-breakthrough',
  MOD_TECH_LEVEL_TREND_EMERGED: 'mod-tech-level:trend-emerged',
  MOD_TECH_LEVEL_TREND_FADED: 'mod-tech-level:trend-faded',
  // mod-world
  MOD_WORLD_INITIALIZED: 'mod-world:initialized',
  MOD_WORLD_ENTITIES_GENERATED: 'mod-world:entities-generated',
  MOD_WORLD_CONTEXT_LEFT: 'mod-world:context-left',
  MOD_WORLD_CONTEXT_ARRIVED: 'mod-world:context-arrived',
  MOD_WORLD_CONTEXT_TRANSITION_ROLLED_BACK: 'mod-world:context-transition-rolled-back',
  // mod-world-map
  MOD_WORLD_MAP_NODE_SELECTED: 'mod-world-map:node-selected',
  MOD_WORLD_MAP_VIEW_CHANGED: 'mod-world-map:view-changed',
} as const
