/**
 * @module index.ts
 * @description mod-world Prompt 模板统一导出
 * @mod mod-world
 */

export { worldConfigPrompt } from './world-config-prompt'
export { worldTagsPrompt } from './world-tags-prompt'
export { worldTimelinePrompt } from './world-timeline-prompt'
export { pastHistoryPrompt } from './past-history-prompt'
export { worldEntityPrompt } from './world-entity-prompt'
export { worldCalibrationPrompt, worldCalibrationOutputSchema } from './world-calibration-prompt'
export {
  dimensionInferenceOutputSchema,
  type DimensionInferenceOutput,
} from './dimension-inference-schema'
export {
  worldDimensionCalibrationPrompt,
  worldDimensionCalibrationOutputSchema,
  type WorldDimensionCalibrationOutput,
} from './world-dimension-calibration-prompt'
