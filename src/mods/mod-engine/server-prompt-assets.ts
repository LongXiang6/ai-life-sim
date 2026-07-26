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
import { NARRATIVE_BRANCH_REPAIR_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-branch-repair-prompt'
import { NARRATIVE_DATA_REPAIR_SERVER_PROMPT_ASSET_ID } from './prompts/narrative-data-repair-prompt'
import {
  NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID,
  NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID,
} from './prompts/narrative-repetition-repair-prompt'
import { COMPILED_NARRATIVE_BRANCH_REPAIR_SYSTEM_PROMPT } from './server/narrative-branch-repair-system-prompt'
import { COMPILED_NARRATIVE_DATA_REPAIR_SYSTEM_PROMPT } from './server/narrative-data-repair-system-prompt'
import { COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT } from './server/narrative-repair-system-prompt'
import { COMPILED_NARRATIVE_REPETITION_AUDIT_SYSTEM_PROMPT } from './server/narrative-repetition-audit-system-prompt'
import { COMPILED_NARRATIVE_REPETITION_REPAIR_SYSTEM_PROMPT } from './server/narrative-repetition-repair-system-prompt'
import { COMPILED_NARRATIVE_SYSTEM_PROMPT } from './server/narrative-system-prompt'

export interface ServerPromptAsset {
  id: string
  systemPrompt: string
}

const SERVER_PROMPT_ASSETS: Readonly<Record<string, ServerPromptAsset>> = {
  [NARRATIVE_DATA_REPAIR_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_DATA_REPAIR_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_DATA_REPAIR_SYSTEM_PROMPT,
  },
  [NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_REPETITION_AUDIT_SYSTEM_PROMPT,
  },
  [NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_REPETITION_REPAIR_SYSTEM_PROMPT,
  },
  [NARRATIVE_BRANCH_REPAIR_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_BRANCH_REPAIR_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_BRANCH_REPAIR_SYSTEM_PROMPT,
  },
  [NARRATIVE_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_SYSTEM_PROMPT,
  },
  [NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID]: {
    id: NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID,
    systemPrompt: COMPILED_NARRATIVE_REPAIR_SYSTEM_PROMPT,
  },
}

/**
 * 发布切换期间，已打开页面仍可能发送上一版公开 ID。这里只迁移已知、
 * 相邻且协议兼容的 ID；任意其他未知值仍须拒绝，不能按前缀宽松匹配。
 */
const LEGACY_SERVER_PROMPT_ASSET_ALIASES: Readonly<Record<string, string>> = {
  'mod-engine:narrative:4.5.2': NARRATIVE_SERVER_PROMPT_ASSET_ID,
  'mod-engine:narrative:4.6.0': NARRATIVE_SERVER_PROMPT_ASSET_ID,
}

/** 只按公开白名单 ID 或精确迁移表返回服务端固定资产。 */
export function resolveModEngineServerPromptAsset(assetId: string): ServerPromptAsset | undefined {
  const canonicalAssetId = LEGACY_SERVER_PROMPT_ASSET_ALIASES[assetId] ?? assetId
  return SERVER_PROMPT_ASSETS[canonicalAssetId]
}
