/**
 * Purpose: Declare the client contract for the protected story-state extraction Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-story-continuity:2.8.0'

export const narrativeStoryContinuityPrompt: PromptTemplate = {
  name: 'narrative-story-continuity',
  version: '2.8.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '故事状态提取用户消息按顺序提供已确认状态、可选的近期正文参考和当前回合标准 JSON；近期正文不是下一轮故事模板。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; continuity quality parsing keeps usable memory items.
  outputSchema: z.unknown(),
}
