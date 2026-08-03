/**
 * Purpose: Define page-local state contracts for the talent draw flow.
 * Owner: mod-pages/talent-draw
 * Responsibility: Type declarations only; runtime state remains in the page hooks.
 */

import type { DestinyPattern } from '@/mods/mod-character'

export type TalentDrawPhase = 'idle' | 'generating' | 'ready' | 'selecting'

export type TalentDrawSlots = Array<DestinyPattern | null>

export interface InitialTalentDrawState {
  phase: TalentDrawPhase
  slots: TalentDrawSlots
  selectedSlotIndices: number[]
  localPoolSize: number
  pool: DestinyPattern[]
}
