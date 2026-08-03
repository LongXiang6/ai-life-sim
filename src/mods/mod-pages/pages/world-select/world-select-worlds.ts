/**
 * Purpose: Convert and restore saved or preset worlds for the selection page.
 * Owner: mod-pages/world-select
 * Responsibility: World-selection projections only; persistence and UI state remain in hooks.
 */

import { saveStore } from '@/core'
import { allocateWorldCode, PRESET_WORLDS } from '@/mods/mod-world'
import type { PresetWorld, WorldConfig } from '@/mods/mod-world'
import { resolvePresetWorldCode } from '@/mods/mod-world/world-init-api'

import type { SavedCustomWorld } from './useWorldSelectForm'

export function loadSavedWorlds(): SavedCustomWorld[] {
  try {
    const parsed = saveStore.get<SavedCustomWorld[]>('mod-pages', 0, 'custom-worlds') ?? []
    return parsed.map((world) => ({
      ...world,
      worldCode: world.worldCode ?? allocateWorldCode(),
    }))
  } catch {
    return []
  }
}

export function savedCustomWorldToPreset(world: SavedCustomWorld): PresetWorld {
  return {
    id: world.id,
    name: world.name,
    description: world.description,
    worldviewId: (world.worldview === 'auto' ? 'idealist' : world.worldview) as PresetWorld['worldviewId'],
    category: 'modern',
    summary: world.description.slice(0, 50),
    era: `${world.eraName}${Math.abs(world.eraStartYear)}年`,
    config: { eraStartYear: world.eraStartYear, worldCode: world.worldCode, worldview: world.worldview },
    races: ['人类'],
    genders: ['男', '女'],
    icon: '🌍',
  }
}

export function resolveRestoredWorld(
  config: WorldConfig | null,
  worldCode: number,
  savedWorlds: SavedCustomWorld[],
): PresetWorld | null {
  if (!config) return null
  const savedMatch = savedWorlds.find((world) => (
    (world.worldCode === worldCode && world.name === config.name)
      || (world.name === config.name && world.description === config.description)
  ))
  if (savedMatch) return savedCustomWorldToPreset(savedMatch)
  return PRESET_WORLDS.find((world) => (
    (resolvePresetWorldCode(world) === worldCode && world.name === config.name)
      || (world.name === config.name && world.description === config.description)
  )) ?? null
}
