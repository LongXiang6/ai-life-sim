/**
 * @module adaptation-antagonist-prompt.ts
 * @description 反派原型适配 Prompt —— 开局时根据世界观适配反派原型
 * @mod mod-npc
 *
 * 仅在世界创建时调用一次（约 200 output tokens）。
 * 根据世界观本质标签，将通用的 8 种反派原型适配为符合世界观的具象化反派。
 */

import { z } from 'zod'
import type { PromptTemplate } from '@/foundation'

/** AI 适配输出 Schema */
export const AntagonistAdaptationSchema = z.object({
  archetypes: z.array(z.object({
    tag: z.enum([
      'arrogant_young_master',
      'scheming_elder',
      'corrupt_official',
      'rival_genius',
      'foreign_invader',
      'ancient_monster',
      'corporate_tycoon',
      'political_opponent',
      'custom',
    ]),
    label: z.string().describe('适配后的中文标签，如"魔道少主"'),
    motivationTemplate: z.string().describe('该类型反派的典型动机描述'),
    powerOrigin: z.string().describe('力量来源描述'),
    behaviorStyle: z.string().describe('行为风格描述，用于 AI 叙事引导'),
  })),
  recommendedCount: z.number().min(1).max(5).describe('推荐的反派数量'),
})

export type AntagonistAdaptationOutput = z.infer<typeof AntagonistAdaptationSchema>

export const adaptationAntagonistPrompt: PromptTemplate<AntagonistAdaptationOutput> = {
  name: 'adaptation-antagonist',
  version: '1.0.0',
  mod: 'mod-npc',
  systemPrompt: `你是一个世界观适配器。根据用户提供的世界观类型，将通用的反派原型适配为符合该世界观的具象化反派。

通用原型体系：
- arrogant_young_master: 纨绔子弟 — 家世显赫的年轻二代，嚣张跋扈
- scheming_elder: 老谋深算 — 地位高的长辈/前辈，暗中操纵
- corrupt_official: 贪官污吏 — 手握权力的腐败者
- rival_genius: 天才对手 — 与主角旗鼓相当的天才
- foreign_invader: 外族入侵者 — 外部势力威胁
- ancient_monster: 上古妖魔 — 远古的超自然威胁
- corporate_tycoon: 商业巨鳄 — 经济/商业领域的强者
- political_opponent: 政敌 — 政治/权力斗争中的对手

要求：
1. 适配每个原型到具体世界观（修仙→魔道/散修，科幻→AI叛乱体/基因改造者，武侠→邪派掌门/魔教，奇幻→黑暗法师/龙族）
2. label 是中文标签，3-6字
3. motivationTemplate 描述该反派的典型动机（20-40字）
4. powerOrigin 描述力量来源（10-20字）
5. behaviorStyle 描述行为风格，配合 AI 叙事使用（10-20字）
6. recommendedCount 根据世界观复杂度推荐反派数量（1-5）`,

  userPromptTemplate: `世界观类型：{{essenceTag}}
世界观描述：{{worldDescription}}

请适配反派原型。
{{worldCalibrationSummary}}`,

  variables: ['essenceTag', 'worldDescription', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: AntagonistAdaptationSchema,
}
