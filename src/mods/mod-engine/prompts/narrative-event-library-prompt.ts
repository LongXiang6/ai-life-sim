/**
 * Purpose: Declare the client contract for the protected 04 event-library Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_EVENT_LIBRARY_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-event-library:1.0.0'

export const narrativeEventLibraryPrompt: PromptTemplate = {
  name: 'narrative-event-library',
  version: '1.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_EVENT_LIBRARY_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '事件库用户消息按顺序提供当前世界状态、历史剧情和本轮故事与时间；输出仅作为下一轮故事的候选事件素材。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; the event-library quality parser owns the response contract.
  outputSchema: z.unknown(),
}
