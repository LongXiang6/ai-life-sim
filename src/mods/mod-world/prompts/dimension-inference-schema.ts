/**
 * @module dimension-inference-schema.ts
 * @description 维度推断 Zod schema（合并调用 world-dimension-calibration 的 dimensions 字段）
 *
 * 勿恢复独立 dimension-inference AI 步；Pipeline 主路径见 world-dimension-calibration-prompt.ts
 * @mod mod-world
 */

import { z } from 'zod'

export const dimensionInferenceOutputSchema = z.object({
  powerSystem: z.string(),
  worldviewEssence: z.string(),
  civilizationStage: z.string(),
  spatialForm: z.string(),
  powerCeiling: z.coerce.number().int().min(1).max(24),
  worldType: z.enum(['materialist', 'idealist', 'mixed']),
})

export type DimensionInferenceOutput = z.infer<typeof dimensionInferenceOutputSchema>
