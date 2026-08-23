/**
 * Purpose: Declare the client contract for the protected story-continuity Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-story-continuity:2.7.0'

export const narrativeStoryContinuityPrompt: PromptTemplate = {
  name: 'narrative-story-continuity',
  version: '2.7.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '故事连续性用户消息按顺序提供历史记忆、最近两轮正文和当前回合标准 JSON。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; continuity quality parsing keeps usable memory items.
  outputSchema: z.unknown(),
}
