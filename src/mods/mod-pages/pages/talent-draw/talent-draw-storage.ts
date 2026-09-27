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
  hasDestinyPatternPool,
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

function storageKeyForWorld(worldCode: number): string {
  return `talent-draw:${worldCode || 0}`
}

/** Whether this world's persisted draw state exists. */
export function hasTalentDrawState(worldCode: number): boolean {
  if (!worldCode) return false
  const state = configStore.get<unknown>('mod-pages', storageKeyForWorld(worldCode))
  if (state === null) return false
  if (
    typeof state === 'object'
    && !Array.isArray(state)
    && state !== null
    && (state as Record<string, unknown>).aiTalentGeneration === true
    && !hasDestinyPatternPool(worldCode)
  ) {
    clearTalentDrawState(worldCode)
    return false
  }
  return true
}

/** Clear only the persisted draw state for the requested world. */
export function clearTalentDrawState(worldCode: number): void {
  if (!worldCode) return
  configStore.remove('mod-pages', storageKeyForWorld(worldCode))
}

/** Enumerate all worlds with persisted draw-page state. */
export function listTalentDrawStateWorldCodes(): Set<number> {
  const worldCodes = new Set<number>()
  for (const key of configStore.keys('mod-pages')) {
    if (!key.startsWith('talent-draw:')) continue
    const rawWorldCode = key.slice('talent-draw:'.length)
    const worldCode = Number.parseInt(rawWorldCode, 10)
    if (Number.isFinite(worldCode) && worldCode > 0 && String(worldCode) === rawWorldCode) {
      worldCodes.add(worldCode)
    }
  }
  return worldCodes
}

function loadState(): SavedTalentDrawState | null {
  const worldCode = useWorldStore.getState().worldCode
  if (!hasTalentDrawState(worldCode)) return null
  const value = configStore.get<unknown>('mod-pages', storageKeyForWorld(worldCode))
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
  const savedSlotsAreValid = saved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
    && savedPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT
    && (saved?.phase !== 'selecting' || savedPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT)
    && uniquePatternsByIdentity(savedPatterns).length === savedPatterns.length
    && (!aiTalentGeneration || savedPatterns.every(isAIGeneratedPattern))
  const usableSaved = savedSlotsAreValid && saved?.aiTalentGeneration === aiTalentGeneration
    ? saved
    : null

  if (!aiTalentGeneration && usableSaved?.phase === 'selecting') {
    return {
      phase: 'selecting',
      slots: usableSaved.slots,
      loadoutSlots: usableSaved.loadoutSlots,
      localPoolSize: savedPatterns.length,
      pool: savedPatterns,
    }
  }

  if (
    aiTalentGeneration
    && cached.length >= DESTINY_PATTERN_DISPLAY_COUNT
    && hasAllDestinyPatternCategories(cached)
  ) {
    const cachedIds = new Set(cached.map((pattern) => pattern.id))
    const savedFromCurrentPool = usableSaved?.phase === 'selecting'
      && savedPatterns.every((pattern) => cachedIds.has(pattern.id))
      ? usableSaved
      : null
    const slots = savedFromCurrentPool
      ? savedFromCurrentPool.slots
      : drawSlotsFromPool(cached)
    useCharacterStore.getState().setDestinyPatterns({ candidates: cached })
    return {
      phase: 'selecting',
      slots,
      loadoutSlots: savedFromCurrentPool
        ? savedFromCurrentPool.loadoutSlots
        : Array(PATTERN_LOADOUT_SLOT_COUNT).fill(null),
      localPoolSize: cached.length,
      pool: cached,
    }
  }

  return {
    phase: aiTalentGeneration ? 'idle' : normalizeSavedPhase(usableSaved?.phase),
    slots: !aiTalentGeneration && usableSaved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
      ? usableSaved.slots
      : Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null),
    loadoutSlots: !aiTalentGeneration && usableSaved?.loadoutSlots
      ? usableSaved.loadoutSlots
      : Array(PATTERN_LOADOUT_SLOT_COUNT).fill(null),
    localPoolSize: cached.length,
    pool: cached,
  }
}

/** 角色确认进入命格流程前，复用有效缓存并直接准备选择阶段。 */
export function prepareCachedTalentDrawSelection(): void {
  const initial = resolveInitialTalentDrawState()
  if (initial.phase !== 'selecting') return
  persistTalentDrawState('selecting', initial.slots, initial.loadoutSlots)
}
