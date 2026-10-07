/**
 * Purpose: Map calendar months to the canonical season index and labels.
 * Owner: mod-engine/time-system
 * Responsibility: Keep solar season mapping side-effect free and shared by time projections.
 *
 * @module calendar-season.js
 * @description 阳历季节映射
 * @mod mod-engine
 */

/**
 * 阳历季节映射 —— 时间系统与叙事提示共用的无副作用纯函数。
 * 月份参数使用 0-based 索引：0=1月，11=12月。
 */

export const SEASON_NAMES = ['春', '夏', '秋', '冬']

/** 3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬。 */
export function getSeasonForMonth(monthIndex) {
  const normalizedMonth = ((Math.floor(monthIndex) % 12) + 12) % 12
  return Math.floor(((normalizedMonth + 10) % 12) / 3)
}
