/**
 * @module utils.ts
 * @description mod-economy 工具函数 —— 从 foundation 提升 + 本地补充 + 经济价值计算
 * @mod mod-economy
 */

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'
// randomInt 已统一到 shared/common-utils.ts，避免各 MOD 重复定义（B-45 要求）
export { randomInt } from '@/core/shared'

// ============================================================
// 战力→经济价值映射
// ============================================================

import {
  STAGE_ECONOMIC_TIER,
  ECONOMIC_TIER_CONFIG,
} from '@/mods/mod-power-system'
import type { EconomicTierInfo } from '@/mods/mod-power-system'

/**
 * 计算物品在当前世界观中的经济层级
 * @param itemStageHint 物品对应的战力阶位（undefined = 始终凡品）
 * @param worldCeiling  世界天花板
 * @returns 经济层级 1-5
 */
export function calculateItemTier(itemStageHint: number | undefined, worldCeiling: number): number {
  if (itemStageHint == null || itemStageHint < 1) return 1
  return STAGE_ECONOMIC_TIER.calculateTier(itemStageHint, worldCeiling)
}

/**
 * 计算物品在当前世界观中的实际价格
 * @param basePrice    物品基础价值
 * @param itemStageHint 物品对应的战力阶位
 * @param worldCeiling  世界天花板
 * @returns 实际价格（至尊级返回 -1 表示有价无市）
 */
export function calculateItemPrice(
  basePrice: number,
  itemStageHint: number | undefined,
  worldCeiling: number,
): number {
  const tier = calculateItemTier(itemStageHint, worldCeiling)
  const tierInfo = (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[tier]
  if (!tierInfo || tierInfo.priceMultiplier < 0) return -1
  return Math.round(basePrice * tierInfo.priceMultiplier)
}

/**
 * 获取物品的经济层级信息
 * @param itemStageHint 物品对应的战力阶位（undefined = 始终凡品）
 * @param worldCeiling  世界天花板
 * @returns 经济层级信息，未找到返回 undefined
 */
export function getItemEconomicTier(itemStageHint: number | undefined, worldCeiling: number): EconomicTierInfo | undefined {
  const tier = calculateItemTier(itemStageHint, worldCeiling)
  return (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[tier]
}
