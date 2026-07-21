/**
 * @module server-prompt-assets.ts
 * @description mod-engine 服务端 Prompt 资产公开入口；不得从客户端模块导入。
 * @mod mod-engine
 */

import 'server-only'

import {
  NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID,
  NARRATIVE_SERVER_PROMPT_ASSET_ID,
} from './prompts/narrative-prompt'
import { COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT } from './server/narrative-repair-system-prompt'
import { COMPILED_NARRATIVE_SYSTEM_PROMPT } from './server/narrative-system-prompt'

export interface ServerPromptAsset {
  id: string
  systemPrompt: string
}

const SERVER_PROMPT_ASSETS: Readonly<Record<string, ServerPromptAsset>> = {
  [NARRATIVE_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_SYSTEM_PROMPT,
  },
  [NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT,
  },
}

/** 只按公开白名单 ID 返回服务端固定资产；未知 ID 不降级到其他 Prompt。 */
export function resolveModEngineServerPromptAsset(assetId: string): ServerPromptAsset | undefined {
  return SERVER_PROMPT_ASSETS[assetId]
}
