/**
 * @module adaptationDivineCreationPrompt
 * @description AI Prompt 模板 —— 神明系统适配
 * @mod mod-base-universe
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 神明适配输出 Schema */
export const divineCreationOutputSchema = z.object({
  narrativeHints: z.array(z.string()).describe('神明对世界产生的叙事描述'),
  divineMood: z.string().describe('当前神明的整体情绪状态'),
})

/** 预留：待 B1 Orchestrator 完成后创建实际 Prompt 内容 */
export const adaptationDivineCreationPrompt: PromptTemplate = {
  name: 'adaptation-divine-creation',
  version: '1.0.0',
  mod: 'mod-base-universe',
  systemPrompt: `你是一个神明系统的设定适配器。根据世界的神祇配置和当前信仰状态，生成符合世界观的叙事描述。

## 叙事规则
1. 神祇行为必须符合其神职领域
2. 神明干预不应过于频繁（每轮最多1-2次干预）
3. 神明交互应影响世界的氛围和叙事方向
4. 没有神明的世界（materialist世界观）不应出现超自然干预`,
  userPromptTemplate: `## 神明状态
{{divineCreationSummary}}

## 时间信息
{{eraInfo}}

## 叙事要求
请根据以上神明状态，生成1-3句神明对世界产生影响的叙事描述。如果没有神明或神恩低迷则返回空。
{{worldCalibrationSummary}}`,
  variables: ['divineCreationSummary', 'eraInfo', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: divineCreationOutputSchema,
}
