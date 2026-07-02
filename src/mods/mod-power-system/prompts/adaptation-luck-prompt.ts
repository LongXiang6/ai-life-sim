/**
 * @module adaptation-luck-prompt.ts
 * @description 气运值 AI 适配 Prompt —— 气运初始值 + 运气叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 气运初始值适配输出 Schema */
export const luckAdaptationOutputSchema = z.object({
  luck: z.coerce.number().int().min(0).max(10).describe('气运值，整数 0-10'),
  narrativeHint: z.string().describe('气运叙事提示，描述角色的运气状态'),
})

export type LuckAdaptationOutput = z.infer<typeof luckAdaptationOutputSchema>

/**
 * 气运适配 Prompt
 * 根据角色背景和世界观，生成合适的初始气运值和叙事描述
 */
export const adaptationLuckPrompt: PromptTemplate<LuckAdaptationOutput> = {
  name: 'adaptation-luck',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是气运适配 AI。根据角色背景和世界观，生成合适的初始气运值和叙事描述。

## 适配规则
1. 气运值范围为 0-10，0 为霉运连连，10 为天命之子
2. 气运值应根据角色背景合理分配：
   - 出身富贵/天选之人：7-10
   - 普通出身：4-6
   - 出身卑微/命运多舛：1-3
   - 被诅咒/特殊厄运：0-1
3. 世界观影响气运分布：
   - 仙侠/奇幻/神话：气运上限较高，天命更明显
   - 科幻/现代/唯物：气运分布更平均，更依赖个人努力
   - 末日：整体气运偏低，生存优先
4. narrativeHint 是一段 50-100 字的气运描述，使用第二人称，描述角色的运气倾向

## 输出格式
\`\`\`json
{
  "luck": 7,
  "narrativeHint": "气运叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界名称：{{worldName}}
- 世界描述：{{worldDescription}}
- 世界观标签：{{worldview}}

## 角色信息
- 角色名称：{{characterName}}
- 角色背景：{{characterBackground}}
- 角色出身：{{characterOrigin}}
- 特殊命运标记：{{destinyTag}}

请根据以上信息生成适配后的气运值和叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldName', 'worldDescription', 'worldview', 'characterName', 'characterBackground', 'characterOrigin', 'destinyTag', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: luckAdaptationOutputSchema,
}
