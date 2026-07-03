/**
 * @module adaptation-prompt-factory.ts
 * @description 通用 Adaptation Prompt —— 统一替代 13 个独立子系统 adaptation prompt
 * @mod core
 *
 * 所有子系统的 adaptation 共用此 prompt。
 * 子系统状态（rawSummary）已包含完整上下文，AI 从中提取并改写。
 * 世界观信息由 fillAdaptationUserPrompt 注入。
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 通用适配输出 Schema */
export const universalAdaptationSchema = z.object({
  narrativeHint: z.string().describe('适配后的叙事描述'),
})

export type UniversalAdaptationOutput = z.infer<typeof universalAdaptationSchema>

export const universalAdaptationPrompt: PromptTemplate = {
  name: 'adaptation-universal',
  version: '1.0.0',
  mod: 'core',
  systemPrompt: `你是世界观叙事适配器。将子系统状态描述翻译为符合世界观风格的叙事文本（50-100字）。

根据世界观类型（在用户 prompt 中提供），将状态数据改写为叙事友好的第二人称描述：
- 仙侠/修真 → 道韵、机缘、功法、灵气、天材地宝
- 武侠 → 江湖、师承、内力、武林
- 科幻 → 科技、数据、物理、基因、程序
- 奇幻 → 魔法、种族、神灵、元素
- 现代/唯物 → 科学解释、社会现象、心理学术语
- 末日 → 废土、生存、变异、毒素
- 神话 → 神格、祭祀、传说、命运

不评价、不解释、不编造状态之外的信息。`,

  userPromptTemplate: `世界观：{{worldCalibrationSummary}}
子系统状态：{{subsystemSummary}}`,

  variables: ['worldCalibrationSummary', 'subsystemSummary'],
  outputFormat: 'json',
  outputSchema: universalAdaptationSchema,
}
