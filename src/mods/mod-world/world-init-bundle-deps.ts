/**
 * @module world-init-bundle-deps.ts
 * @description world-init-bundle 调度依赖聚合
 * @mod mod-world
 */

export {
  worldTagsPrompt,
  worldConfigPrompt,
  worldEntityPrompt,
  worldCalibrationPrompt,
  worldCalibrationOutputSchema,
  worldDimensionCalibrationPrompt,
  worldDimensionCalibrationOutputSchema,
  dimensionInferenceOutputSchema,
} from './prompts'
export { parseAIJSON } from './utils/parse-ai-json'
export { parseWorldConfigAIResponse } from './utils/world-config-ai'
export {
  buildDefaultCalibration,
  clampCalibration,
  formatCalibrationSummary,
  getWorldviewStyleHint,
} from './utils/calibration-clamp'
export {
  buildWorldCoherenceHint,
  resolveWorldviewStyleHint,
} from './utils/world-coherence-hints'
export {
  buildWorldInitFingerprint,
  loadCachedWorldCalibration,
  loadCachedWorldInitBundle,
  saveCachedWorldCalibration,
} from './utils/world-init-calibration-cache'
export { shouldSkipEntityAIGeneration } from './utils/entity-generation-gate'
export {
  inferWorldCoherenceFromDescription,
  applyCoherenceToWorldConfig,
} from './utils/world-coherence-inference'
export { formatWorldTagsText } from './constants/world-tag-defaults'
export { WorldInitSystem } from './subsystems/world-init-system'
export { WorldEntitySystem, getWorldEntitySystem } from './subsystems/world-entity-system'
