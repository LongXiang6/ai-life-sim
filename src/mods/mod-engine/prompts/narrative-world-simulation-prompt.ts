/**
 * Purpose: Declare the client contract for the protected world-evolution simulation Prompt.
 * Owner: mod-engine
 * Responsibility: Bind asset identity, version, output mode, and Schema only.
 */

import type { PromptTemplate } from '@/foundation'
import { z } from 'zod'

export const NARRATIVE_WORLD_SIMULATION_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-world-simulation:1.2.0'

export const narrativeWorldSimulationPrompt: PromptTemplate = {
  name: 'narrative-world-simulation',
  version: '1.2.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_WORLD_SIMULATION_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '世界演变用户消息按顺序提供当前世界状态、历史剧情和本轮故事与时间；输出仅作为下一轮故事的世界变化候选。',
  variables: [],
  outputFormat: 'json',
  // Transport stays loose; world-simulation quality parsing keeps usable candidates.
  outputSchema: z.unknown(),
}
