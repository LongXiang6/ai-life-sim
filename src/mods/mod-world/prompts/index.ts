/**
 * @module index.ts
 * @description mod-world Prompt 模板统一导出
 * @mod mod-world
 */

export { worldConfigPrompt } from './world-config-prompt'
export { worldTagsPrompt } from './world-tags-prompt'
export {
  worldRegionProfilePrompt,
  worldRegionProfileOutputSchema,
  type WorldRegionProfileOutput,
} from './world-region-profile-prompt'
export { worldCalibrationOutputSchema } from './world-calibration-prompt'
export {
  dimensionInferenceOutputSchema,
  type DimensionInferenceOutput,
} from './dimension-inference-schema'
export {
  worldDimensionCalibrationPrompt,
  worldDimensionCalibrationOutputSchema,
  type WorldDimensionCalibrationOutput,
} from './world-dimension-calibration-prompt'
