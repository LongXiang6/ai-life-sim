/**
 * @module adaptation-divine-intervention-prompt.ts
 * @description 神明干预 AI 适配 Prompt —— 神迹叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 神明干预适配输出 Schema */
export const divineInterventionOutputSchema = z.object({
  narrativeHint: z.string().describe('神明干预相关的叙事提示'),
})

/**
 * 神明干预适配 Prompt
 * 根据神明干预事件和世界观，生成符合世界观的神迹叙事描述
 */
export const adaptationDivineInterventionPrompt: PromptTemplate = {
  name: 'adaptation-divine-intervention',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是神明干预适配 AI。根据神明干预事件和世界观，生成符合世界观的神迹叙事描述。

## 适配规则
1. 神明干预描述必须符合世界观风格：
   - 仙侠：天道感应、天劫降临、仙人指路、气运加身
   - 武侠：武林秘籍自现、隐世高人出手、天命所归
   - 科幻：高级文明干预、时空异常、概率操控、未知信号
   - 奇幻：神灵降世、神迹显现、祝福/诅咒、神谕传达
   - 现代/唯物：巧合事件、自然现象、心理学解释
   - 末日：希望之光、幸存者的奇迹、废墟中的神迹
   - 神话：神灵真身降世、神战余波、信仰之力爆发
2. 干预强度应与世界观的神格等级匹配
3. 叙事应体现超越凡人理解的宏大感
4. narrativeHint 是一段 50-100 字的神迹描述，使用第二人称，营造敬畏感

## 输出格式
\`\`\`json
{
  "narrativeHint": "神迹叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界观标签：{{worldview}}
- 神明体系：{{divineSystem}}
- 神力等级上限：{{divineLevel}}

## 干预状态
- 干预类型：{{interventionType}}
- 干预来源神明：{{deityName}}
- 干预原因：{{interventionReason}}
- 干预程度：{{interventionMagnitude}}

请根据以上信息生成适配后的神明干预叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldview', 'divineSystem', 'divineLevel', 'interventionType', 'deityName', 'interventionReason', 'interventionMagnitude', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: divineInterventionOutputSchema,
}
