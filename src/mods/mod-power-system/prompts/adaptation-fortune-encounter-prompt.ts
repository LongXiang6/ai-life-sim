/**
 * @module adaptation-fortune-encounter-prompt.ts
 * @description 奇遇事件 AI 适配 Prompt —— 奇遇叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 奇遇适配输出 Schema */
export const fortuneEncounterOutputSchema = z.object({
  narrativeHint: z.string().describe('奇遇事件相关的叙事提示'),
})

/**
 * 奇遇适配 Prompt
 * 根据奇遇事件和世界观，生成符合世界观的奇遇叙事描述
 */
export const adaptationFortuneEncounterPrompt: PromptTemplate = {
  name: 'adaptation-fortune-encounter',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是奇遇适配 AI。根据奇遇事件和世界观，生成符合世界观的奇遇叙事描述。

## 适配规则
1. 奇遇描述必须符合世界观风格：
   - 仙侠：秘境探索、灵药发现、古传承、飞升机缘
   - 武侠：悬崖奇遇、武林秘籍、隐世高人、灵丹妙药
   - 科幻：外星遗迹、科技突破、时空裂隙、远古信号
   - 奇幻：魔法圣物、龙巢宝藏、精灵祝福、预言实现
   - 现代：意外发现、贵人相助、投资机遇、偶然事件
   - 末日：废弃避难所、前文明物资、安全区线索、净水源
   - 神话：神谕降世、神器觉醒、命运转折点、神力传承
2. 奇遇应体现意外性和转机感
3. 叙事应暗示奇遇对角色未来的潜在影响
4. narrativeHint 是一段 50-100 字的奇遇描述，使用第二人称，营造惊喜感

## 输出格式
\`\`\`json
{
  "narrativeHint": "奇遇叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界观标签：{{worldview}}
- 世界探索度：{{explorationLevel}}

## 奇遇状态
- 奇遇类型：{{fortuneType}}
- 奇遇触发原因：{{fortuneTrigger}}
- 奇遇发生地点：{{fortuneLocation}}
- 奇遇关联物品/人物：{{fortuneTarget}}

请根据以上信息生成适配后的奇遇叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldview', 'explorationLevel', 'fortuneType', 'fortuneTrigger', 'fortuneLocation', 'fortuneTarget', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: fortuneEncounterOutputSchema,
}
