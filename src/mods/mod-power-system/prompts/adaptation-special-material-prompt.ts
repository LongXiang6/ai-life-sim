/**
 * @module adaptation-special-material-prompt.ts
 * @description 特殊材料 AI 适配 Prompt —— 材料叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 特殊材料适配输出 Schema */
export const specialMaterialOutputSchema = z.object({
  narrativeHint: z.string().describe('特殊材料相关的叙事提示'),
})

/**
 * 特殊材料适配 Prompt
 * 根据特殊材料状态和世界观，生成符合世界观的材料叙事描述
 */
export const adaptationSpecialMaterialPrompt: PromptTemplate = {
  name: 'adaptation-special-material',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是特殊材料适配 AI。根据特殊材料状态和世界观，生成符合世界观的材料叙事描述。

## 适配规则
1. 材料描述必须符合世界观风格：
   - 仙侠：灵矿、仙草、妖丹、龙鳞、凤血、天材地宝
   - 武侠：玄铁、寒玉、千年灵芝、毒蛇胆、陨铁
   - 科幻：反物质矿石、超导材料、纳米纤维、外星合金
   - 奇幻：秘银、精金、龙晶、凤凰羽、魔法水晶
   - 现代：稀有金属、高纯度化学材料、特殊合金
   - 末日：变异晶核、前文明材料、废土金属、净化材料
   - 神话：神铁、世界树之枝、冥河之沙、星尘
2. 材料稀有度应与世界观资源分布匹配
3. 叙事应体现材料的独特属性和用途
4. 可包含材料的产出地点、获取难度、加工工艺
5. narrativeHint 是一段 50-100 字的材料描述，使用第二人称，突出其价值

## 输出格式
\`\`\`json
{
  "narrativeHint": "材料叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界观标签：{{worldview}}
- 世界资源等级：{{resourceLevel}}

## 材料状态
- 材料名称：{{materialName}}
- 材料稀有度：{{materialRarity}}
- 材料类型：{{materialType}}
- 特殊属性：{{materialProperty}}
- 产出地点：{{materialSource}}
- 用途：{{materialUsage}}

请根据以上信息生成适配后的特殊材料叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldview', 'resourceLevel', 'materialName', 'materialRarity', 'materialType', 'materialProperty', 'materialSource', 'materialUsage', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: specialMaterialOutputSchema,
}
