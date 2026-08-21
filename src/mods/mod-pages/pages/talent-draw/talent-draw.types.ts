/**
 * Purpose: Define page-local state contracts for the talent draw flow.
 * Owner: mod-pages/talent-draw
 * Responsibility: Type declarations only; runtime state remains in the page hooks.
 */

import type {
  DestinyPattern,
  DestinyPatternCategory,
  ReincarnationTalent,
} from '@/mods/mod-character'

export type TalentDrawPhase = 'idle' | 'generating' | 'ready' | 'selecting'

export type TalentDrawSlots = Array<DestinyPattern | null>

export type TalentDrawTab = DestinyPatternCategory | 'mythic'

export type TalentLoadoutEntry =
  | { kind: 'destiny'; patternId: string }
  | { kind: 'mythic'; patternId: string }

export type TalentLoadoutSlots = Array<TalentLoadoutEntry | null>

export type ResolvedTalentLoadoutEntry =
  | { kind: 'destiny'; pattern: DestinyPattern }
  | { kind: 'mythic'; pattern: ReincarnationTalent }

export interface InitialTalentDrawState {
  phase: TalentDrawPhase
  slots: TalentDrawSlots
  loadoutSlots: TalentLoadoutSlots
  localPoolSize: number
  pool: DestinyPattern[]
}
