/**
 * @module entity-generation-gate.ts
 * @description 实体 AI 生成门控 —— 校准判定全层禁用则跳过 API
 * @mod mod-world
 */

import type { EntityCountRange, WorldCalibration } from '../types'

const ENTITY_RANGE_KEYS = [
  'nationCount',
  'factionCount',
  'nobleHouseCount',
  'settlementCount',
  'tradeRouteCount',
] as const

function isRangeDisabled(range: EntityCountRange | undefined): boolean {
  return range != null && range.min === 0 && range.max === 0
}

/**
 * 校准将所有实体层设为 { min:0, max:0 } 时，无需调用实体 AI
 */
export function shouldSkipEntityAIGeneration(calibration: WorldCalibration | null | undefined): boolean {
  if (!calibration?.entities) return false
  const entities = calibration.entities
  return ENTITY_RANGE_KEYS.every((key) => isRangeDisabled(entities[key]))
}
