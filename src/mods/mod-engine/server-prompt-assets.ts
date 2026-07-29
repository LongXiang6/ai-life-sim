/**
 * @module server-prompt-assets.ts
 * @description mod-engine 服务端 Prompt 资产公开入口；不得从客户端模块导入。
 * @mod mod-engine
 */

import 'server-only'

import { NARRATIVE_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-prompt'
import { NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-settlement-prompt'
import { COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT } from './server/narrative-settlement-system-prompt'
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
  [NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT,
  },
}

/** 只按当前公开白名单 ID 返回服务端固定资产。 */
export function resolveModEngineServerPromptAsset(assetId: string): ServerPromptAsset | undefined {
  return SERVER_PROMPT_ASSETS[assetId]
}
