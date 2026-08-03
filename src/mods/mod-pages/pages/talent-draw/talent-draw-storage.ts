/**
 * Purpose: Persist and restore talent-draw pools and stable selection state per world.
 * Owner: mod-pages/talent-draw
 * Responsibility: Page-local storage projection only; pattern transforms and AI calls live elsewhere.
 */

import { configStore } from '@/core'
import {
  DESTINY_PATTERN_DISPLAY_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import {
  loadDestinyPatternPool,
  saveDestinyPatternPool,
} from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { DestinyPattern } from '@/mods/mod-character'
import type { InitialTalentDrawState, TalentDrawPhase, TalentDrawSlots } from './talent-draw.types'
import {
  drawSlotsFromPool,
  isAIGeneratedPattern,
  uniquePatternsByIdentity,
} from './talent-draw-patterns'

interface SavedTalentDrawState {
  phase: 'idle' | 'generating' | 'selecting'
  slots: TalentDrawSlots
  selectedSlotIndices: number[]
  aiTalentGeneration: boolean
}

function storageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `talent-draw:${worldCode || 0}`
}

function loadState(): SavedTalentDrawState | null {
  return configStore.get<SavedTalentDrawState>('mod-pages', storageKey())
}

function normalizeSavedPhase(phase?: SavedTalentDrawState['phase']): TalentDrawPhase {
  if (phase === 'selecting') return 'selecting'
  return 'idle'
}

export function loadCachedPool(): DestinyPattern[] {
  return uniquePatternsByIdentity(
    loadDestinyPatternPool(useWorldStore.getState().worldCode).filter(isAIGeneratedPattern),
  )
}

export function saveCachedPool(patterns: DestinyPattern[]): void {
  const aiPatterns = uniquePatternsByIdentity(patterns.filter(isAIGeneratedPattern))
  if (aiPatterns.length > 0) {
    saveDestinyPatternPool(useWorldStore.getState().worldCode, aiPatterns)
  }
}

export function persistTalentDrawState(
  phase: 'idle' | 'selecting',
  slots: TalentDrawSlots,
  selectedSlotIndices: number[],
): void {
  configStore.set('mod-pages', storageKey(), {
    phase,
    slots,
    selectedSlotIndices,
    aiTalentGeneration: useSettingsStore.getState().aiTalentGeneration,
  } satisfies SavedTalentDrawState)
}

export function resolveInitialTalentDrawState(): InitialTalentDrawState {
  const saved = loadState()
  const cached = loadCachedPool()
  const { aiTalentGeneration } = useSettingsStore.getState()
  const savedPatterns = saved?.slots?.filter((pattern): pattern is DestinyPattern => pattern !== null) ?? []
  const savedSlotsMatchMode = saved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
    && savedPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT
    && (saved?.phase !== 'selecting' || savedPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT)
    && uniquePatternsByIdentity(savedPatterns).length === savedPatterns.length
    && (!aiTalentGeneration || savedPatterns.every(isAIGeneratedPattern))
  const usableSaved = savedSlotsMatchMode ? saved : null

  if (usableSaved?.phase === 'selecting') {
    if (usableSaved.aiTalentGeneration !== aiTalentGeneration) {
      return {
        phase: 'idle',
        slots: Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null),
        selectedSlotIndices: [],
        localPoolSize: cached.length,
        pool: cached,
      }
    }
    return {
      phase: 'selecting',
      slots: usableSaved.slots,
      selectedSlotIndices: usableSaved.selectedSlotIndices ?? [],
      localPoolSize: Math.max(cached.length, usableSaved.slots.filter(Boolean).length),
      pool: cached.length > 0
        ? cached
        : usableSaved.slots.filter((pattern): pattern is DestinyPattern => pattern !== null),
    }
  }

  if (aiTalentGeneration && cached.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
    const slots = drawSlotsFromPool(cached)
    useCharacterStore.getState().setDestinyPatterns({ candidates: cached })
    return {
      phase: 'ready',
      slots,
      selectedSlotIndices: [],
      localPoolSize: cached.length,
      pool: cached,
    }
  }

  return {
    phase: normalizeSavedPhase(usableSaved?.phase),
    slots: usableSaved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
      ? usableSaved.slots
      : Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null),
    selectedSlotIndices: usableSaved?.selectedSlotIndices ?? [],
    localPoolSize: cached.length,
    pool: cached,
  }
}
