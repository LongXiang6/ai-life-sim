/**
 * Purpose: Declare the client contract for the protected destiny-pattern growth Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-talent-growth:3.6.0'

export const narrativeTalentGrowthPrompt: PromptTemplate = {
  name: 'narrative-talent-growth',
  version: '3.6.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '天赋成长用户消息按顺序提供历史记忆、最近两轮详细记忆和当前回合标准 JSON；当前回合保留当前轮次、当前基础点、当前派生日历天数、当前年龄、程序筛选后的玩家已选天赋、天赋成长历史、角色上下文与世界上下文等现有字段。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; the response-quality normalizer performs item-level recovery.
  outputSchema: z.unknown(),
}
