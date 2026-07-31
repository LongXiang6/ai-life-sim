import { SUB_STAGE_LABELS, SUB_STAGE_THRESHOLDS } from './constants'

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'
export { computeAverage } from '@/core/shared'

export const getSubStageLabel = (subStage: number): string => SUB_STAGE_LABELS[Math.trunc(subStage)] ?? '未知'
export const getSubStageThreshold = (subStage: number): number => SUB_STAGE_THRESHOLDS[Math.trunc(subStage)] ?? 10000
export function formatCombatPower(rankLabel: string, subStage: number, powerValue: number): string {
  return `${rankLabel} ${getSubStageLabel(subStage)} · ${Math.round(powerValue)}`
}
