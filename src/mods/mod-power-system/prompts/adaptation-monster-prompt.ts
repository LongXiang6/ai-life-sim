/**
 * @module adaptation-monster-prompt.ts
 * @description 怪物种类 AI 适配 Prompt —— 怪物池适配 + 生态叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 怪物种类池适配输出 Schema */
export const monsterAdaptationOutputSchema = z.object({
  monsterTypes: z.array(z.string()).describe('适配后的怪物种类名称列表'),
  narrativeHint: z.string().describe('怪物生态叙事提示'),
})

export type MonsterAdaptationOutput = z.infer<typeof monsterAdaptationOutputSchema>

/**
 * 怪物适配 Prompt
 * 根据世界观的本质标签，生成符合世界观的怪物种类池和生态描述
 */
export const adaptationMonsterPrompt: PromptTemplate<MonsterAdaptationOutput> = {
  name: 'adaptation-monster',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是怪物适配 AI。根据世界观生成符合其风格的怪物种类池和生态描述。

## 适配规则
1. 怪物种类必须符合世界观风格：
   - 仙侠：妖兽、魔兽、邪灵、鬼物、妖修
   - 武侠：猛兽、毒虫、机关兽、邪派高手、异域生物
   - 科幻：变异体、机械兽、外星生物、基因改造体、失控AI
   - 奇幻：巨龙、恶魔、亡灵、元素精灵、魔兽
   - 现代：野生动物、变异生物、危险罪犯、恐怖组织
   - 末日：辐射变异体、废土巨兽、感染者、堕落者
   - 神话：魔兽、神孽、邪魔、远古巨兽、冥界生物
   - 蒸汽朋克：机械造物、蒸汽兽、齿轮蜘蛛、发条巨人
2. 怪物强度应与世界观战力上限匹配
3. 生成 8-15 种怪物类型，覆盖不同强度等级
4. narrativeHint 是一段 50-100 字的世界生态描述，概述怪物与世界的关系

## 输出格式
\`\`\`json
{
  "monsterTypes": ["怪物1", "怪物2", ...],
  "narrativeHint": "生态叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界名称：{{worldName}}
- 世界描述：{{worldDescription}}
- 世界观标签：{{worldview}}
- 战力上限等级：{{ceilingLevel}}

## 生态偏好
- 危险等级：{{dangerLevel}}
- 怪物密度：{{monsterDensity}}
- 特殊生态标记：{{ecologyTag}}

请根据以上信息生成适配后的怪物种类池和生态叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldName', 'worldDescription', 'worldview', 'ceilingLevel', 'dangerLevel', 'monsterDensity', 'ecologyTag', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: monsterAdaptationOutputSchema,
}
