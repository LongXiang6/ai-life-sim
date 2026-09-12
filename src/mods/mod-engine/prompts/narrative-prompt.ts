/**
 * Purpose: Declare the client contract for the protected main narrative Prompt asset.
 * Owner: mod-engine
 * Responsibility: Bind the asset ID, version, and current data-layer input contract only.
 *
 * @module narrative-prompt.ts
 * @description 主叙事 Prompt 客户端契约 —— 服务端固定资产 + 浏览器单条数据层消息
 * @mod mod-engine
 *
 * 固定提示词由服务端资产注册表编译和注入；浏览器按数据层示例装配单条 JSON 数组消息。
 */

import type { PromptTemplate } from '@/foundation'

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:7.23.0'

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '7.23.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '主叙事用户消息按数据层示例装配为四元素 JSON 数组，依次承载世界、玩家信息、剧情，以及同项中的玩家属性与当前信息。',
  variables: [],
  outputFormat: 'text',
}
