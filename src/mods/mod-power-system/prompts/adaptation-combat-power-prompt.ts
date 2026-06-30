/**
 * @module adaptation-combat-power-prompt.ts
 * @description 战力等级 AI 适配 Prompt —— 阶段名称映射 + 战力叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 战力阶段名称适配输出 Schema */
export const combatPowerAdaptationOutputSchema = z.object({
  stageNames: z.record(z.string(), z.string()).describe('阶位→名称映射，如 { "1": "凡人", "3": "筑基期" }'),
  narrativeHint: z.string().describe('战力叙事提示，描述当前境界的战力和对比'),
})

export type CombatPowerAdaptationOutput = z.infer<typeof combatPowerAdaptationOutputSchema>

/**
 * 战力适配 Prompt
 * 根据世界观的本质标签，将子系统数值适配为合适的战力叙事描述
 */
export const adaptationCombatPowerPrompt: PromptTemplate<CombatPowerAdaptationOutput> = {
  name: 'adaptation-combat-power',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是战力适配 AI。根据角色当前战力等级和世界观，生成战力阶段的名称映射和叙事描述。

## 适配规则
1. 战力等级范围为 1-24 阶，需映射为符合世界观风格的阶段名称
2. 阶段名称应体现世界观特色：
   - 仙侠：炼气、筑基、金丹、元婴、化神、渡劫、大乘
   - 武侠：后天、先天、宗师、大宗师、陆地神仙
   - 科幻：列兵、精英、指挥官、将军、元帅、星际霸主
   - 奇幻：学徒、法师、大法师、贤者、传奇、神话
   - 现代/唯物：业余、专业、精英、大师、传奇
   - 末日：幸存者、猎人、战士、领主、霸主
3. 叙事描述应包含：当前境界名称、战力评价、与同级别的对比
4. 输出 stageNames 应覆盖所有 24 个阶段，用数字字符串作键（"1"~"24"）
5. narrativeHint 是一段 50-100 字的战力描述，使用第二人称

## 输出格式
\`\`\`json
{
  "stageNames": { "1": "名称", "2": "名称", ... },
  "narrativeHint": "叙事描述文本",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界名称：{{worldName}}
- 世界描述：{{worldDescription}}
- 世界观标签：{{worldview}}
- 战力上限等级：{{ceilingLevel}}

## 角色信息
- 角色名称：{{characterName}}
- 当前战力等级：{{combatStage}}/24
- 当前境界：{{realmName}}

请根据以上信息生成适配后的战力阶段名称映射和叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldName', 'worldDescription', 'worldview', 'ceilingLevel', 'characterName', 'combatStage', 'realmName', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: combatPowerAdaptationOutputSchema,
}
