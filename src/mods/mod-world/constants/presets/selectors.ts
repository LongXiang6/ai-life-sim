/**
 * Purpose: Query the immutable preset-world catalog by ID or worldview family.
 * Owner: mod-world / preset catalog.
 * Responsibility: Read-only selectors only; catalog data and display options stay outside.
 */

import { PRESET_WORLDS, type PresetWorld } from './catalog'

export function getPresetWorld(id: string): PresetWorld | undefined {
  return PRESET_WORLDS.find((world) => world.id === id)
}

export function getMaterialistWorlds(): PresetWorld[] {
  return PRESET_WORLDS.filter((world) => world.worldviewId === 'materialist')
}

export function getIdealistWorlds(): PresetWorld[] {
  return PRESET_WORLDS.filter((world) => world.worldviewId === 'idealist')
}

export function getSurvivalHorrorWorlds(): PresetWorld[] {
  return PRESET_WORLDS.filter((world) => world.worldviewId === 'survival_horror')
}
