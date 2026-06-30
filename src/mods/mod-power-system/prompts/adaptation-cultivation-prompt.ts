/**
 * @module adaptationCultivationPrompt
 * @description AI Prompt 模板 —— 修炼体系适配
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

export const cultivationOutputSchema = z.object({
  realmName: z.string().describe('适配后的境界名称'),
  narrativeHints: z.array(z.string()).describe('修炼相关叙事提示'),
})

export const adaptationCultivationPrompt: PromptTemplate = {
  name: 'adaptation-cultivation',
  version: '1.0.0',
  mod: 'mod-power-system',
  systemPrompt: `你是一个修炼体系的叙事适配器。根据角色当前的修炼状态，生成符合世界观的叙事描述。

## 叙事规则
1. 瓶颈状态应体现挣扎感——突破失败时描述沮丧和压抑
2. 突破预兆应体现期待感——天地异象、灵气翻涌等
3. 非修仙世界观使用该世界观的对应术语`,
  userPromptTemplate: `## 修炼状态
{{cultivationState}}

## 当前世界观
{{worldview}}

请根据以上状态生成适配后的修炼境界名称和叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['cultivationState', 'worldview', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: cultivationOutputSchema,
}
