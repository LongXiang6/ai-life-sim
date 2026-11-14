/**
 * Purpose: Declare the client contract for the protected destiny-pattern growth Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-talent-growth:5.0.0'

export const narrativeTalentGrowthPrompt: PromptTemplate = {
  name: 'narrative-talent-growth',
  version: '5.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '天赋成长用户消息按顺序提供历史记忆、最近两轮详细记忆和当前回合标准 JSON；当前回合只包含本次机缘对应的一个天赋、机缘类型、证据窗口、天赋成长历史、角色上下文与世界上下文。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; the response-quality normalizer performs item-level recovery.
  outputSchema: z.unknown(),
}
