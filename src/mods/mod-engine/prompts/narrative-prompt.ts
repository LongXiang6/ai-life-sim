/**
 * Purpose: Declare the client contract for the protected main narrative Prompt asset.
 * Owner: mod-engine
 * Responsibility: Bind the asset ID, version, and current data-layer input contract only.
 *
 * @module narrative-prompt.ts
 * @description 主叙事 Prompt 客户端契约 —— 服务端按 prompt.txt 合成单条 user 消息
 * @mod mod-engine
 *
 * 浏览器只装配数据层五元素数组；服务端受保护资产按 prompt.txt 顺序生成模型消息。
 */

import type { PromptTemplate } from '@/foundation'

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:9.15.0'

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '9.15.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '浏览器发送世界、玩家信息、历史输出、玩家本次点属性和本次信息；服务端按 prompt.txt 合成为唯一 user 消息。',
  variables: [],
  outputFormat: 'text',
}

