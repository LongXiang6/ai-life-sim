/**
 * Purpose: Expose lightweight world runtime projections to other MODs.
 * Owner: mod-world
 * Responsibility: Runtime Store, calibration, region graph, and prompt-format helpers only; world UI and initialization pages stay outside.
 */

export type { WorldCalibration, WorldConfig } from './types'
export { useWorldStore } from './store'
export { sanitizeWorldStateSnapshot } from './utils/world-state-migration'
export { buildDefaultCalibration } from './utils/calibration-clamp/default-calibration'
export { formatCalibrationSummary } from './utils/calibration-clamp/calibration-summary'
export { formatPowerFrameworkForPrompt } from './utils/power-framework'
export { inferAnchorYearFromDescription } from './utils/world-init-anchor-year'
export { getCurrentRegion, setCurrentRegion } from './world-context-api'
