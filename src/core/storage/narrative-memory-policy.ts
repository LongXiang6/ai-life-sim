/**
 * @module narrative-memory-policy.ts
 * @description 时间轴记忆权重的确定性取整、衰减与遗忘策略。
 * @mod core
 */

import type { CompressedMemoryEvent } from '@/foundation'

export const MEMORY_WEIGHT_MIN = 1
export const MEMORY_WEIGHT_MAX = 10

/** 权重 2~9 每下降 1 点所需的轮数；10 永久，1 在 L1 后卸载。 */
export const MEMORY_DECAY_INTERVALS: Readonly<Record<number, number>> = {
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 16,
  7: 32,
  8: 64,
  9: 128,
}

export function clampMemoryWeight(value: number): number {
  return Math.max(MEMORY_WEIGHT_MIN, Math.min(MEMORY_WEIGHT_MAX, Math.round(value)))
}

export function mapImportanceToMemoryWeight(value: number): number {
  const normalized = Math.max(0, Math.min(100, Number(value) || 0))
  return clampMemoryWeight(Math.floor(normalized / 10) + 1)
}

export function coarseImportanceWeight(importance: 'HIGH' | 'NORMAL' | 'LOW' | undefined): number {
  if (importance === 'HIGH') return 8
  if (importance === 'LOW') return 2
  return 5
}

/** 达到 0 的当轮仍返回 0，下一轮才进入遗忘状态。 */
export function calculateMemoryWeight(event: CompressedMemoryEvent, currentRound: number): number {
  if (event.permanent || event.initialWeight >= MEMORY_WEIGHT_MAX) return MEMORY_WEIGHT_MAX
  if (event.initialWeight <= MEMORY_WEIGHT_MIN) return MEMORY_WEIGHT_MIN
  const interval = MEMORY_DECAY_INTERVALS[event.initialWeight] ?? 1
  const elapsed = Math.max(0, Math.trunc(currentRound) - event.weightAnchorRound)
  return Math.max(0, event.initialWeight - Math.floor(elapsed / interval))
}

export function isMemoryEventForgotten(event: CompressedMemoryEvent, currentRound: number): boolean {
  if (event.permanent || event.initialWeight >= MEMORY_WEIGHT_MAX) return false
  if (event.initialWeight <= MEMORY_WEIGHT_MIN) return true
  const interval = MEMORY_DECAY_INTERVALS[event.initialWeight] ?? 1
  const zeroRound = event.weightAnchorRound + event.initialWeight * interval
  return currentRound > zeroRound
}

export function isMemoryEventActive(event: CompressedMemoryEvent, currentRound: number): boolean {
  return event.initialWeight > MEMORY_WEIGHT_MIN && !isMemoryEventForgotten(event, currentRound)
}
