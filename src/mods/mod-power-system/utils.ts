/**
 * @module utils.ts
 * @description mod-power-system 工具函数（统一提升自 foundation）
 * @mod mod-power-system
 */

import {
  UNIT_NAMES,
  SUB_STAGE_LABELS,
  SUB_STAGE_THRESHOLDS,
  MAX_POWER_CEILING,
  MAX_REACHABLE_STAGE,
  WORLD_CAPACITY_MAP,
  UNIFIED_RATING_LABELS,
  STAGE_ECONOMIC_TIER,
  ECONOMIC_TIER_CONFIG,
  generateNextStage,
  getDynamicStageDecay,
} from './constants'
import type { DynamicStage, EconomicTierInfo } from './constants'

export { ROUND_DECIMALS, round, clampNumber, pickRandom } from '@/foundation'

/**
 * 计算数值数组平均值
 * @param values - 数值数组
 * @returns 平均值，空数组返回 0
 */
export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * 获取主阶段单位名（23+ 动态阶动态生成名称）
 * @param stage - 阶位编号
 * @returns 单位名称
 */
export function getUnitName(stage: number): string {
  if (stage <= 23) return (UNIT_NAMES as Record<number, string>)[stage] || '未知'
  // 动态阶：使用 generateNextStage 获取名称
  return generateNextStage(stage - 1).name
}

/**
 * 获取子阶段标签
 * @param subStage - 子阶段编号
 * @returns 子阶段标签（初入/小成/大成/巅峰/登峰造极）
 */
export function getSubStageLabel(subStage: number): string {
  return (SUB_STAGE_LABELS as Record<number, string>)[subStage] || '未知'
}

/**
 * 获取主阶段衰减系数（23 阶以下固定表，23 阶以上动态计算）
 * @param mainStage - 主阶段编号
 * @returns 衰减系数
 */
export function getStageDecay(mainStage: number): number {
  return getDynamicStageDecay(mainStage)
}

/**
 * 获取子阶段跨越阈值
 * @param subStage - 子阶段编号
 * @returns 跨越所需战力值
 */
export function getSubStageThreshold(subStage: number): number {
  return (SUB_STAGE_THRESHOLDS as Record<number, number>)[subStage] ?? 10000
}

/**
 * 判断是否为终极阶段（22-23 阶）— 修炼已趋近失效
 * @param mainStage - 主阶段编号
 * @returns 是否为终极阶段
 */
export function isUltimateStage(mainStage: number): boolean {
  return mainStage >= 22 && mainStage <= MAX_REACHABLE_STAGE
}

/**
 * 判断是否已超越可达阶位（23 阶以上，进入动态无限）
 * @param mainStage - 主阶段编号
 * @returns 是否已超越可达阶位
 */
export function isBeyondReachable(mainStage: number): boolean {
  return mainStage > MAX_REACHABLE_STAGE
}

/**
 * @deprecated 请使用 isBeyondReachable()
 * @param mainStage - 主阶段编号
 * @returns 是否已超越可达阶位
 */
export function isTrueInfinite(mainStage: number): boolean {
  return isBeyondReachable(mainStage)
}

/**
 * 获取世界容器容量等级
 * @param universeScale - 宇宙规模标识
 * @returns 对应阶位上限
 */
export function getWorldCapacity(universeScale: string): number {
  return (WORLD_CAPACITY_MAP as Record<string, number>)[universeScale] ?? MAX_POWER_CEILING
}

/**
 * 从 saved 值中提取力量上限等级
 * @param value - 已保存的阶位字符串（如 "23阶"）
 * @returns 力量上限等级（1-23）
 */
export function parsePowerCeilingLevel(value: string): number {
  const match = value.match(/^(\d+)阶/)
  if (match) {
    const level = parseInt(match[1], 10)
    if (level >= 1 && level <= MAX_POWER_CEILING) return level
  }
  return MAX_POWER_CEILING
}

/**
 * 获取指定等级的评级标签（23 阶以上动态生成）
 * @param level - 等级编号
 * @returns 评级标签
 */
export function getRatingLabel(level: number): string {
  if (level <= 23) return (UNIFIED_RATING_LABELS as Record<number, string>)[level] || `${level}阶`
  const stage = generateNextStage(level - 1)
  return `${level}阶（${stage.name}）`
}

/**
 * 战力格式化（23+ 阶显示动态阶名）
 * @param mainStage - 主阶段编号
 * @param subStage - 子阶段编号
 * @param powerValue - 战力数值
 * @returns 格式化后的战力字符串
 */
export function formatCombatPower(mainStage: number, subStage: number, powerValue: number): string {
  if (mainStage > MAX_REACHABLE_STAGE) {
    const stage = generateNextStage(mainStage - 1)
    return `${stage.name}·${Math.round(powerValue)}`
  }
  const unit = getUnitName(mainStage)
  const sub = getSubStageLabel(subStage)
  if (mainStage === 1 && subStage === 1) {
    return `${Math.round(powerValue)} ${unit}`
  }
  return `${unit}${sub} · ${Math.round(powerValue)}`
}

// ============================================================
// 经济价值映射工具
// ============================================================

/**
 * 计算物品在当前世界观中的经济层级
 * @param itemStage - 物品对应的战力阶位
 * @param worldCeiling - 世界天花板（1-23）
 * @returns 经济层级 1-5（凡品→至尊）
 */
export function calculateEconomicTier(itemStage: number, worldCeiling: number): number {
  return STAGE_ECONOMIC_TIER.calculateTier(itemStage, worldCeiling)
}

/**
 * 获取经济层级信息
 * @param tier - 经济层级编号（1-5）
 * @returns 层级信息，未找到返回 undefined
 */
export function getEconomicTierInfo(tier: number): EconomicTierInfo | undefined {
  return (ECONOMIC_TIER_CONFIG as Record<number, EconomicTierInfo>)[tier]
}

/**
 * 获取动态阶位信息
 * @param stage - 阶位编号
 * @returns 动态阶位信息，23 阶以下返回 null
 */
export function getDynamicStage(stage: number): DynamicStage | null {
  if (stage <= MAX_REACHABLE_STAGE) return null
  return generateNextStage(stage - 1)
}
