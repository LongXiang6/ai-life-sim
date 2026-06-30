/**
 * @module adaptationGoldenFingerPrompt
 * @description AI Prompt 模板 —— 金手指系统适配
 * @mod mod-golden-finger
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

export const goldenFingerOutputSchema = z.object({
  narrativeHint: z.string().describe('金手指对当前叙事的影响描述'),
  unlockedNarrativeEvents: z.array(z.string()).describe('金手指触发的额外叙事事件'),
})

export const adaptationGoldenFingerPrompt: PromptTemplate = {
  name: 'adaptation-golden-finger',
  version: '1.0.0',
  mod: 'mod-golden-finger',
  systemPrompt: `你是一个金手指系统的叙事适配器。根据角色当前金手指的状态，生成符合该金手指特征的叙事提示。

## 叙事规则
1. 系统面板型金手指使用冰冷机械/话痨逗比的语气
2. 功法传承/血脉觉醒型金手指使用传统修仙叙事风格
3. 命运契约型金手指体现代价与回报的张力
4. 金手指叙事不应过于喧宾夺主，角色本身的努力仍然重要`,
  userPromptTemplate: `## 金手指状态
{{goldenFingerState}}

## 角色状态
{{characterState}}

请根据金手指状态生成叙事提示和触发事件描述。
{{worldCalibrationSummary}}`,
  variables: ['goldenFingerState', 'characterState', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: goldenFingerOutputSchema,
}
