/**
 * @module adaptation-faith-prompt.ts
 * @description 信仰 AI 适配 Prompt —— 信仰状态叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 信仰适配输出 Schema */
export const faithOutputSchema = z.object({
  narrativeHint: z.string().describe('信仰相关的叙事提示'),
})

/**
 * 信仰适配 Prompt
 * 根据角色信仰状态和世界观，生成符合世界观的信仰叙事描述
 */
export const adaptationFaithPrompt: PromptTemplate = {
  name: 'adaptation-faith',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是信仰适配 AI。根据角色信仰状态和世界观，生成符合世界观的信仰叙事描述。

## 适配规则
1. 信仰描述必须符合世界观风格：
   - 仙侠：天道、大道、宗门信仰、先祖崇拜
   - 武侠：武林道义、江湖规矩、师门传承
   - 科幻：科学理性、AI崇拜、星际联邦信条
   - 奇幻：神灵信仰、教会、自然崇拜、元素之誓
   - 现代：哲学理念、政治信仰、科学信仰
   - 末日：生存信念、希望之光、废墟信仰
   - 神话：神格崇拜、信仰之力、神谕指引
2. 叙事应体现信仰对角色行为和命运的影响
3. 无信仰角色应体现世俗化或实用主义倾向
4. narrativeHint 是一段 50-100 字的信仰描述，使用第二人称

## 输出格式
\`\`\`json
{
  "narrativeHint": "信仰叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界观标签：{{worldview}}
- 世界宗教格局：{{religiousLandscape}}

## 角色信仰状态
- 当前信仰：{{faithState}}
- 信仰虔诚度：{{faithLevel}}
- 信仰背景故事：{{faithBackground}}

请根据以上信息生成适配后的信仰叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldview', 'religiousLandscape', 'faithState', 'faithLevel', 'faithBackground', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: faithOutputSchema,
}
