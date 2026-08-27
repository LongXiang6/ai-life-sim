/**
 * Purpose: Declare the client contract for the protected main narrative Prompt asset.
 * Owner: mod-engine
 * Responsibility: Bind the asset ID, version, and six-message dynamic input contract only.
 *
 * @module narrative-prompt.ts
 * @description 主叙事 Prompt 客户端契约 —— 服务端固定资产 + 浏览器六段动态上下文
 * @mod mod-engine
 *
 * 固定提示词由服务端资产注册表编译和注入；浏览器按“世界、历史连续性事实、
 * 最近五轮正文、角色、世界模拟内容、本轮事实与方向”计算动态消息。第一次调用不接收系统写入契约。
 */

import type { PromptTemplate } from '@/foundation'

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:7.12.0'

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '7.12.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '主叙事用户消息由统一编译器装配为世界、历史记忆、最近五轮、角色、世界模拟、本轮事实与方向六条标准 JSON。',
  variables: [],
  outputFormat: 'text',
}
