/**
 * Purpose: Expose lightweight world runtime projections to other MODs.
 * Owner: mod-world
 * Responsibility: Runtime Store, calibration, entity-directory, and prompt-format helpers only; world UI and initialization pages stay outside.
 */

export type { WorldCalibration, WorldConfig } from './types'
export { useWorldStore } from './store'
export { sanitizeWorldStateSnapshot } from './utils/world-state-migration'
export { buildDefaultCalibration } from './utils/calibration-clamp/default-calibration'
export { formatCalibrationSummary } from './utils/calibration-clamp/calibration-summary'
export { formatPowerFrameworkForPrompt } from './utils/power-framework'
export { inferAnchorYearFromDescription } from './utils/world-init-anchor-year'
export {
  registerEntityReference as registerWorldEntityReference,
  repairEntityReferenceDirectory as repairWorldEntityReferenceDirectory,
} from './subsystems/world-entity-system/entity-reference-directory'
