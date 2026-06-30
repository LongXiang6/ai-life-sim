/**
 * 角色相关跨 MOD 公共函数
 *
 * 使用场景：mod-character、mod-npc、mod-culture 等需要计算角色属性的 MOD
 *
 * 规则：
 * - 所有函数必须是纯函数，通过参数接收数据，不访问任何 store
 * - 被 2 个以上 MOD 调用的函数放这里
 * - **每个导出函数必须有详细中文注释（@param/@returns/@example）** — B-46 要求
 *
 * @mod core/shared
 */

import { clamp } from './common-utils'

/**
 * 计算年龄衰减系数
 * 
 * 随年龄增长，各属性逐步衰减。
 * 衰减起点 = lifespan × decayStartRatio，从 1.0 线性衰减至剩余寿命用完时为 0.1。
 * 用于角色属性随年龄自然下降的模拟。
 * 
 * @param age              - 当前年龄
 * @param lifespan         - 种族/角色寿命上限
 * @param decayStartRatio  - 开始衰减的年龄比例，默认 0.5（即寿命一半时开始衰减）
 * @returns 衰减系数，范围 [0.1, 1]。1 表示无衰减，0.1 表示最大衰减
 *
 * @example
 * ```ts
 * // 寿命 100 岁，60 岁 → 衰减至 0.8
 * calcAgeDecay(60, 100)        // 0.8
 * 
 * // 寿命 100 岁，40 岁（未到 50 的一半线）→ 无衰减
 * calcAgeDecay(40, 100)        // 1
 * 
 * // 自定义从 70% 寿命开始衰减
 * calcAgeDecay(80, 100, 0.7)   // 约 0.67
 * ```
 */
export function calcAgeDecay(
  age: number,
  lifespan: number,
  decayStartRatio = 0.5,
): number {
  const decayStart = lifespan * decayStartRatio
  if (age <= decayStart) return 1
  const remaining = lifespan - decayStart
  if (remaining <= 0) return 0.1
  const decay = (age - decayStart) / remaining
  return clamp(1 - decay, 0.1, 1)
}

/**
 * 计算属性加成后的实际值
 * 
 * 基础值 + 所有加成总和 × 全局倍率 → 四舍五入取整。
 * 用于属性面板显示、战斗计算、天赋效果叠加等场景。
 * 
 * @param baseValue  - 基础属性值
 * @param bonuses    - 加成列表（正数为增益，负数为减益）
 * @param multiplier - 全局倍率，默认 1
 * @returns 加成后的实际属性值（四舍五入取整）
 *
 * @example
 * ```ts
 * // 基础 100，+10 +20 加成，1.5 倍率
 * calcAttributeValue(100, [10, 20], 1.5)   // 195
 * 
 * // 基础 50，-10 减益，无倍率
 * calcAttributeValue(50, [-10])             // 40
 * ```
 */
export function calcAttributeValue(
  baseValue: number,
  bonuses: number[],
  multiplier = 1,
): number {
  const bonusSum = bonuses.reduce((sum, b) => sum + b, 0)
  return Math.round((baseValue + bonusSum) * multiplier)
}

/**
 * 判定寿命是否到期
 * 
 * 当前年龄 >= 有效寿命（寿命上限 + 气运修正）时判定到期。
 * 气运为正时可延寿，为负时折寿。
 * 
 * @param age            - 当前年龄
 * @param lifespan       - 寿命上限
 * @param luckModifier   - 气运修正系数（正数延寿，负数折寿），默认 0
 * @returns true 表示寿命已到期
 *
 * @example
 * ```ts
 * isLifespanExpired(80, 80)        // true（正好到达上限）
 * isLifespanExpired(80, 100)       // false（未到上限）
 * isLifespanExpired(95, 100, -10)  // true（气运折寿 10 年，有效寿命 90）
 * ```
 */
export function isLifespanExpired(
  age: number,
  lifespan: number,
  luckModifier = 0,
): boolean {
  const effectiveLifespan = lifespan + luckModifier
  return age >= effectiveLifespan
}

/**
 * 健康状态映射（通用版）
 * 
 * 将健康数值（0-100）映射为中文文字标签。
 * 用于 UI 显示和叙事 Prompt 注入。
 * 
 * @param health - 健康数值（0-100）
 * @returns 中文健康状态标签
 *
 * @example
 * ```ts
 * getHealthStatus(95)   // "极佳"
 * getHealthStatus(45)   // "一般"
 * getHealthStatus(5)    // "濒死"
 * ```
 */
export function getHealthStatus(health: number): string {
  if (health >= 90) return '极佳'
  if (health >= 70) return '良好'
  if (health >= 50) return '一般'
  if (health >= 30) return '欠佳'
  if (health >= 10) return '危急'
  return '濒死'
}
