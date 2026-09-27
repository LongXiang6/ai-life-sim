/**
 * Purpose: Declare the client contract for the protected story-state extraction Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-story-continuity:3.1.0'

export const narrativeStoryContinuityPrompt: PromptTemplate = {
  name: 'narrative-story-continuity',
  version: '3.1.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '故事剧情压缩用户消息按顺序提供历史剧情、待压缩五轮正文、压缩范围及当前调用时间标准 JSON。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; continuity quality parsing keeps usable memory items.
  outputSchema: z.unknown(),
}
