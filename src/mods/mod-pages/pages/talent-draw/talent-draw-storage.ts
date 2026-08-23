/**
 * Purpose: Persist and restore talent-draw pools and stable selection state per world.
 * Owner: mod-pages/talent-draw
 * Responsibility: Page-local storage projection only; pattern transforms and AI calls live elsewhere.
 */

import { configStore } from '@/core'
import {
  DESTINY_PATTERN_CATEGORY_INITIAL_COUNT,
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_DISPLAY_COUNT,
  PATTERN_LOADOUT_SLOT_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import {
  loadDestinyPatternPool,
  saveDestinyPatternPool,
} from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { DestinyPattern } from '@/mods/mod-character'
import type {
  InitialTalentDrawState,
  TalentDrawPhase,
  TalentDrawSlots,
  TalentLoadoutEntry,
  TalentLoadoutSlots,
} from './talent-draw.types'
import {
  createLoadoutSlots,
  drawSlotsFromPool,
  isAIGeneratedPattern,
  uniquePatternsByIdentity,
} from './talent-draw-patterns'

interface SavedTalentDrawState {
  phase: 'idle' | 'generating' | 'selecting'
  slots: TalentDrawSlots
  loadoutSlots: TalentLoadoutSlots
  aiTalentGeneration: boolean
}

function storageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `talent-draw:${worldCode || 0}`
}

function loadState(): SavedTalentDrawState | null {
  const value = configStore.get<unknown>('mod-pages', storageKey())
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.slots) || !Array.isArray(record.loadoutSlots)) return null
  const loadoutEntries = record.loadoutSlots.flatMap((entry): TalentLoadoutEntry[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const item = entry as Record<string, unknown>
    if ((item.kind !== 'destiny' && item.kind !== 'mythic') || typeof item.patternId !== 'string') return []
    return [{ kind: item.kind, patternId: item.patternId }]
  })
  return {
    phase: record.phase === 'selecting' ? 'selecting' : record.phase === 'generating' ? 'generating' : 'idle',
    slots: record.slots as TalentDrawSlots,
    loadoutSlots: createLoadoutSlots(loadoutEntries),
    aiTalentGeneration: record.aiTalentGeneration === true,
  }
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

function hasAllDestinyPatternCategories(patterns: DestinyPattern[]): boolean {
  return DESTINY_PATTERN_CATEGORY_ORDER.every((category) => (
    patterns.filter((pattern) => pattern.category === category).length
      >= DESTINY_PATTERN_CATEGORY_INITIAL_COUNT
  ))
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
  loadoutSlots: TalentLoadoutSlots,
): void {
  configStore.set('mod-pages', storageKey(), {
    phase,
    slots,
    loadoutSlots,
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
        loadoutSlots: Array(PATTERN_LOADOUT_SLOT_COUNT).fill(null),
        localPoolSize: cached.length,
        pool: cached,
      }
    }
    return {
      phase: 'selecting',
      slots: usableSaved.slots,
      loadoutSlots: usableSaved.loadoutSlots,
      localPoolSize: aiTalentGeneration
        ? Math.max(cached.length, savedPatterns.length)
        : savedPatterns.length,
      pool: aiTalentGeneration && cached.length > 0
        ? cached
        : savedPatterns,
    }
  }

  if (
    aiTalentGeneration
    && cached.length >= DESTINY_PATTERN_DISPLAY_COUNT
    && hasAllDestinyPatternCategories(cached)
  ) {
    const slots = drawSlotsFromPool(cached)
    useCharacterStore.getState().setDestinyPatterns({ candidates: cached })
    return {
      phase: 'ready',
      slots,
      loadoutSlots: Array(PATTERN_LOADOUT_SLOT_COUNT).fill(null),
      localPoolSize: cached.length,
      pool: cached,
    }
  }

  return {
    phase: normalizeSavedPhase(usableSaved?.phase),
    slots: usableSaved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
      ? usableSaved.slots
      : Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null),
    loadoutSlots: usableSaved?.loadoutSlots ?? Array(PATTERN_LOADOUT_SLOT_COUNT).fill(null),
    localPoolSize: cached.length,
    pool: cached,
  }
}
