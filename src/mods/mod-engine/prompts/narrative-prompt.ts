/**
 * Purpose: Declare the client contract for the protected main narrative Prompt asset.
 * Owner: mod-engine
 * Responsibility: Bind the asset ID, version, and three-message dynamic input contract only.
 *
 * @module narrative-prompt.ts
 * @description 主叙事 Prompt 客户端契约 —— 服务端固定资产 + 浏览器三段动态上下文
 * @mod mod-engine
 *
 * 固定提示词由服务端资产注册表编译和注入；浏览器只按“世界、历史与角色、
 * 本轮事实与方向”计算动态消息。第一次调用不接收系统写入契约。
 */

import type { PromptTemplate } from '@/foundation'

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:7.8.0'

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '7.8.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '主叙事用户消息由统一编译器装配为世界、连续性事实与角色、本轮事实与方向三条标准 JSON。',
  variables: [],
  outputFormat: 'text',
}
