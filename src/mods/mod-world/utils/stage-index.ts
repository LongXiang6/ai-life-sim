/**
 * @module stage-index.ts
 * @description 世界时间线阶段索引纯函数（轻量，可经 index.ts 导出）
 * @mod mod-world
 */

import { STAGE_SPAN } from '../constants'

/** 根据年份计算阶段索引 */
export function getStageIndex(year: number, startingYear: number = 0): number {
  return Math.floor((year - startingYear) / STAGE_SPAN)
}
