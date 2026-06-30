/**
 * @module adaptation-supreme-item-prompt.ts
 * @description 超凡物品 AI 适配 Prompt —— 神器叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 超凡物品适配输出 Schema */
export const supremeItemOutputSchema = z.object({
  narrativeHint: z.string().describe('超凡物品相关的叙事提示'),
})

/**
 * 超凡物品适配 Prompt
 * 根据超凡物品状态和世界观，生成符合世界观的神器叙事描述
 */
export const adaptationSupremeItemPrompt: PromptTemplate = {
  name: 'adaptation-supreme-item',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是超凡物品适配 AI。根据超凡物品状态和世界观，生成符合世界观的神器叙事描述。

## 适配规则
1. 物品描述必须符合世界观风格：
   - 仙侠：法器、灵器、仙器、神器、先天灵宝、丹药
   - 武侠：神兵利器、暗器、护甲、灵药、武林秘籍
   - 科幻：能量武器、纳米装备、星舰组件、AI核心、基因药剂
   - 奇幻：魔法物品、神器、诅咒之物、附魔装备、卷轴
   - 现代：精密武器、高科技装备、稀有材料
   - 末日：废土改造武器、前文明遗物、变异晶核
   - 神话：神器、创世之物、命运之器、神格结晶
2. 物品强度应与世界观战力上限匹配
3. 叙事应体现物品的独特性和传奇色彩
4. 可包含物品的来历、特殊能力、使用代价等信息
5. narrativeHint 是一段 50-100 字的物品描述，使用第二人称，营造珍贵感

## 输出格式
\`\`\`json
{
  "narrativeHint": "神器叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界观标签：{{worldview}}
- 物品等级上限：{{itemLevelCap}}

## 物品状态
- 物品名称：{{itemName}}
- 物品等级：{{itemGrade}}
- 物品类型：{{itemType}}
- 物品特殊能力：{{itemAbility}}
- 物品来历：{{itemOrigin}}

请根据以上信息生成适配后的超凡物品叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldview', 'itemLevelCap', 'itemName', 'itemGrade', 'itemType', 'itemAbility', 'itemOrigin', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: supremeItemOutputSchema,
}
