/**
 * @module world-init-anchor-year.ts
 * @description 解析世界时间线锚定年份（eraStartYear / 描述中的公元年）
 * @mod mod-world
 */

import type { WorldConfig } from '../types'

import { useWorldStore } from '../store'

/** 从世界描述提取叙事起点年份（如「1991年的英国」→ 1991；「第41个千年」→ 41000） */
export function inferAnchorYearFromDescription(description: string): number | undefined {
  const millennium = description.match(/第\s*(\d{1,3})\s*个?\s*千年/)
  if (millennium) {
    const era = parseInt(millennium[1], 10)
    if (Number.isFinite(era) && era > 0) return era * 1000
  }

  const m = description.match(/(?:公元|公元前)?\s*(-?\d{3,4})\s*年/)
  if (!m) return undefined
  const year = parseInt(m[1], 10)
  if (!Number.isFinite(year)) return undefined
  if (/公元前/.test(description.slice(Math.max(0, m.index! - 4), m.index! + 2))) {
    return -Math.abs(year)
  }
  return year
}

/** Pipeline / 时间线初始化用的锚定年：显式参数 > store > 描述推断 > 0 */
export function resolvePipelineAnchorYear(
  config: WorldConfig,
  explicitStartingYear?: number,
): number {
  if (typeof explicitStartingYear === 'number' && Number.isFinite(explicitStartingYear)) {
    return explicitStartingYear
  }
  const storeYear = useWorldStore.getState().eraStartYear
  if (storeYear !== 0) return storeYear
  const fromDesc = inferAnchorYearFromDescription(config.description)
  if (typeof fromDesc === 'number') return fromDesc
  return 0
}
