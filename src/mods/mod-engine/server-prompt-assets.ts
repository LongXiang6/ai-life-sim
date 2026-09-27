/**
 * Purpose: Resolve protected mod-engine Prompt assets at the server boundary.
 * Owner: mod-engine
 * Responsibility: Server-only asset registration and lookup only.
 */

import 'server-only'

import { NARRATIVE_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-prompt'
import { NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-story-continuity-prompt'
import { NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-talent-growth-prompt'
import { composeNarrativeUserMessage } from './server/narrative-system-prompt'
import { COMPILED_NARRATIVE_STORY_CONTINUITY_SYSTEM_PROMPT } from './server/narrative-story-continuity-system-prompt'
import { COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT } from './server/narrative-talent-growth-system-prompt'

interface SystemServerPromptAsset {
  id: string
  delivery: 'system'
  systemPrompt: string
}

interface ComposedUserServerPromptAsset {
  id: string
  delivery: 'composed-user'
  composeUserMessage: (dynamicSource: string) => string
}

export type ServerPromptAsset = SystemServerPromptAsset | ComposedUserServerPromptAsset

const SERVER_PROMPT_ASSETS: Readonly<Record<string, ServerPromptAsset>> = {
  [NARRATIVE_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_SERVER_PROMPT_ASSET_ID,
    delivery: 'composed-user',
    composeUserMessage: composeNarrativeUserMessage,
  },
  [NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_STORY_CONTINUITY_SERVER_PROMPT_ASSET_ID,
    delivery: 'system',
    systemPrompt: COMPILED_NARRATIVE_STORY_CONTINUITY_SYSTEM_PROMPT,
  },
  [NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_TALENT_GROWTH_SERVER_PROMPT_ASSET_ID,
    delivery: 'system',
    systemPrompt: COMPILED_NARRATIVE_TALENT_GROWTH_SYSTEM_PROMPT,
  },
}

/** 只按当前公开白名单 ID 返回服务端固定资产。 */
export function resolveModEngineServerPromptAsset(assetId: string): ServerPromptAsset | undefined {
  return SERVER_PROMPT_ASSETS[assetId]
}
