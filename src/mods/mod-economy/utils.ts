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

export interface EconomicTierInfo {
  label: string
  priceMultiplier: number
  rarity: string
  availability: string
}

export const ECONOMIC_TIER_CONFIG: Record<number, EconomicTierInfo> = {
  1: { label: '日常', priceMultiplier: 1, rarity: '常见', availability: '普通市场' },
  2: { label: '专业', priceMultiplier: 5, rarity: '较少见', availability: '专业渠道' },
  3: { label: '稀缺', priceMultiplier: 20, rarity: '稀缺', availability: '区域中心' },
  4: { label: '珍贵', priceMultiplier: 100, rarity: '极少见', availability: '特殊渠道' },
  5: { label: '契约级', priceMultiplier: -1, rarity: '独一无二', availability: '事件或物品契约' },
}

/**
 * 计算物品在当前世界观中的经济层级
 * @param economicTierHint 物品的当地经济稀缺层级（1-5，undefined = 日常）
 * @returns 经济层级 1-5
 */
export function calculateItemTier(economicTierHint: number | undefined): number {
  if (economicTierHint == null || economicTierHint < 1) return 1
  return Math.max(1, Math.min(5, Math.round(economicTierHint)))
}

/**
 * 计算物品在当前世界观中的实际价格
 * @param basePrice    物品基础价值
 * @param economicTierHint 物品的当地经济稀缺层级
 * @returns 实际价格（至尊级返回 -1 表示有价无市）
 */
export function calculateItemPrice(
  basePrice: number,
  economicTierHint: number | undefined,
): number {
  const tier = calculateItemTier(economicTierHint)
  const tierInfo = ECONOMIC_TIER_CONFIG[tier]
  if (!tierInfo || tierInfo.priceMultiplier < 0) return -1
  return Math.round(basePrice * tierInfo.priceMultiplier)
}

/**
 * 获取物品的经济层级信息
 * @param economicTierHint 物品的当地经济稀缺层级
 * @returns 经济层级信息，未找到返回 undefined
 */
export function getItemEconomicTier(economicTierHint: number | undefined): EconomicTierInfo | undefined {
  const tier = calculateItemTier(economicTierHint)
  return ECONOMIC_TIER_CONFIG[tier]
}
