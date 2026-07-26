import type { PromptTemplate } from '@/foundation'

import type { WorldConfig } from '../types'
import {
  SCORING_CURVE_IDS,
  SCORING_EVIDENCE_KINDS,
  WorldScoringProfileSuggestionSchema,
} from '../scoring-profile'

export const worldScoringProfilePrompt: PromptTemplate = {
  name: 'world-scoring-profile',
  version: '1.0.0',
  mod: 'mod-world',
  systemPrompt: [
    '你只负责为人生模拟世界提出结算维度定义，不计算玩家分数。',
    '返回单个 JSON 对象，不输出 Markdown、解释或公式。',
    `curveId 只能取：${SCORING_CURVE_IDS.join(', ')}。`,
    `evidenceKinds 只能取：${SCORING_EVIDENCE_KINDS.join(', ')}。`,
    '提供 3 到 6 个互不重复的维度，weight 为正数；本地会将权重取整并归一到 100。',
    '维度名称和说明必须适合该世界观；不得新增可执行代码、任意公式或最终分数。',
  ].join('\n'),
  userPromptTemplate: '{{payload}}',
  variables: ['payload'],
  outputFormat: 'json',
  outputSchema: WorldScoringProfileSuggestionSchema,
}

export function buildWorldScoringProfilePrompt(config: WorldConfig, worldId: string): {
  systemPrompt: string
  userPrompt: string
} {
  return {
    systemPrompt: worldScoringProfilePrompt.systemPrompt,
    userPrompt: JSON.stringify({
      profileVersion: 1,
      worldId,
      world: {
        name: config.name,
        description: config.description,
        essenceTag: config.essenceTag,
        powerSystemTag: config.powerSystemTag,
        civilizationStage: config.civilizationStage,
        difficulty: config.difficulty,
      },
      requiredShape: {
        profileVersion: 1,
        worldId,
        dimensions: [{ id: 'stable-id', label: '维度名', description: '衡量内容', weight: 25, evidenceKinds: ['journey'], curveId: 'journey' }],
      },
    }),
  }
}
