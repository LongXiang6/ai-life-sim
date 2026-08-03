/**
 * Purpose: Preserve the public preset API through focused catalog, option, and selector modules.
 * Owner: mod-world / preset catalog.
 * Responsibility: Public exports only; no duplicated preset data or query behavior.
 */

export { PRESET_WORLDS } from './presets/catalog'
export type { PresetWorld, WorldCategory } from './presets/catalog'
export {
  ADDITIONAL_GENDERS,
  ADDITIONAL_RACES,
  DEFAULT_GENDERS,
} from './presets/options'
export {
  getIdealistWorlds,
  getMaterialistWorlds,
  getPresetWorld,
  getSurvivalHorrorWorlds,
} from './presets/selectors'
