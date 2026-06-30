/**
 * @module life-stage-adaptation.ts
 * @description LifeStageSystem AI 适配 Prompt — 生命阶段名称适配（预留）
 * @mod mod-character
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 生命阶段名称适配输出 Schema */
export const lifeStageAdaptationOutputSchema = z.object({
  stageNames: z.record(z.string(), z.string()).describe('阶段ID→适配名称映射'),
})

export type LifeStageAdaptationOutput = z.infer<typeof lifeStageAdaptationOutputSchema>

/** 预留：待 B1 Orchestrator 完成后创建实际 Prompt 内容 */
export const lifeStageAdaptationPrompt: PromptTemplate<LifeStageAdaptationOutput> = {
  name: 'life-stage-adaptation',
  version: '1.0.0',
  mod: 'mod-character',
  /** @status: UNWIRED — 子系统纯规则不调 AI，且未被 adaptation 蓝图激活 */
  systemPrompt: '',
  userPromptTemplate: '{{worldCalibrationSummary}}',
  variables: ['worldName', 'worldDescription', 'defaultStageNames', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: lifeStageAdaptationOutputSchema,
}
