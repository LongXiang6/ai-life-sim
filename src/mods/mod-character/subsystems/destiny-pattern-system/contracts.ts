/**
 * Purpose: Define the public AI pool generation contracts for the destiny-pattern subsystem.
 * Owner: mod-character
 * Responsibility: Keep callback and status shapes stable without owning generation or character state.
 */

import type { DestinyPattern } from '../../types'

export type DestinyPatternAIItem = {
  name: string
  description: string
  rarity: string
  polarity: string
  effect: string
  attrBonus: Record<string, number>
  systemModifiers?: Record<string, number>
}

export type DestinyPatternPoolFillStatus = {
  inProgress: boolean
  count: number
  target: number
  completedBatches: number
  totalBatches: number
}

export interface DestinyPatternAIGenerateOptions {
  /** 已有本地缓存池。AI 续填时以它为起点，避免每次重新从 0 生成。 */
  initialPatterns?: DestinyPattern[]
  /** 目标池大小，默认 10 批 × 10 条。 */
  targetCount?: number
}

export type DestinyPatternAiCaller = (
  systemPrompt: string,
  userPrompt: string,
  options?: unknown,
) => Promise<string>

