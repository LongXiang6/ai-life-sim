/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 全项目事件常量（由 manifest.events 自动生成，勿手动编辑） */
export const EVENTS = {
  // mod-character
  MOD_CHARACTER_CREATED: 'mod-character:created',
  MOD_CHARACTER_DIED: 'mod-character:died',
  MOD_ENGINE_ROUND_COMPLETE: 'mod-engine:round-complete',
  // mod-difficulty
  MOD_DIFFICULTY_CHANGED: 'mod-difficulty:changed',
  // mod-engine
  MOD_ENGINE_ROUND_START: 'mod-engine:round-start',
  MOD_ENGINE_NARRATIVE_COMPRESSED: 'mod-engine:narrative-compressed',
  CORE_ALL_MODS_LOADED: 'core:all-mods-loaded',
  // mod-power-system
  MOD_POWER_SYSTEM_STAGE_BREAKTHROUGH: 'mod-power-system:stage-breakthrough',
  MOD_POWER_SYSTEM_CULTIVATION_BOTTLENECK: 'mod-power-system:cultivation-bottleneck',
  MOD_POWER_SYSTEM_CULTIVATION_BREAKTHROUGH: 'mod-power-system:cultivation-breakthrough',
  // mod-tech-level
  MOD_TECH_LEVEL_INDUSTRY_SHIFT: 'mod-tech-level:industry-shift',
  MOD_TECH_LEVEL_TECH_BREAKTHROUGH: 'mod-tech-level:tech-breakthrough',
  MOD_TECH_LEVEL_TREND_EMERGED: 'mod-tech-level:trend-emerged',
  MOD_TECH_LEVEL_TREND_FADED: 'mod-tech-level:trend-faded',
  // mod-world
  MOD_WORLD_INITIALIZED: 'mod-world:initialized',
  MOD_WORLD_CONTEXT_LEFT: 'mod-world:context-left',
  MOD_WORLD_CONTEXT_ARRIVED: 'mod-world:context-arrived',
  // mod-world-map
  MOD_WORLD_MAP_NODE_SELECTED: 'mod-world-map:node-selected',
  MOD_WORLD_MAP_VIEW_CHANGED: 'mod-world-map:view-changed',
} as const
