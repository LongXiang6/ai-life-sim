/**
 * @module lifespan-adaptation.ts
 * @description LifespanSystem AI 适配 Prompt — 种族寿命配置适配（预留）
 * @mod mod-character
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 种族寿命配置适配输出 Schema */
export const lifespanAdaptationOutputSchema = z.object({
  races: z.record(z.string(), z.object({
    baseAge: z.coerce.number().int().positive(),
    label: z.string(),
  })).describe('种族ID→{baseAge, label} 映射'),
})

export type LifespanAdaptationOutput = z.infer<typeof lifespanAdaptationOutputSchema>

/** 预留：待 B1 Orchestrator 完成后创建实际 Prompt 内容 */
export const lifespanAdaptationPrompt: PromptTemplate<LifespanAdaptationOutput> = {
  name: 'lifespan-adaptation',
  version: '1.0.0',
  mod: 'mod-character',
  /** @status: UNWIRED — 子系统纯规则不调 AI，且未被 adaptation 蓝图激活 */
  systemPrompt: '',
  userPromptTemplate: '{{worldCalibrationSummary}}',
  variables: ['worldName', 'worldDescription', 'defaultRaces', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: lifespanAdaptationOutputSchema,
}
