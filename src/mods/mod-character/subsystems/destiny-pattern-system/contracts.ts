/**
 * Purpose: Define the public AI pool generation and per-category fill contracts.
 * Owner: mod-character
 * Responsibility: Keep callback and status shapes stable without owning generation or character state.
 */

export type DestinyPatternAIItem = {
  category: string
  name: string
  description: string
  effect: string
  attrBonus: Record<string, number>
}

import type { DestinyPatternCategory } from '../../types'

export type DestinyPatternFillPhase = 'idle' | 'initial' | 'background'

export type DestinyPatternCategoryFillStatus = {
  category: DestinyPatternCategory
  count: number
  initialReady: boolean
  inProgress: boolean
  status: 'idle' | 'running' | 'complete' | 'failed' | 'cancelled'
  error?: string
}

export type DestinyPatternPoolFillStatus = {
  phase: DestinyPatternFillPhase
  inProgress: boolean
  count: number
  target: number
  initialReady: boolean
  categories: Record<DestinyPatternCategory, DestinyPatternCategoryFillStatus>
}

export type DestinyPatternAiCaller = (
  systemPrompt: string,
  userPrompt: string,
  options?: unknown,
) => Promise<string>

export type DestinyPatternPoolListener = (
  patterns: import('../../types').DestinyPattern[],
  status: DestinyPatternPoolFillStatus,
) => void
