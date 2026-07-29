/**
 * @module narrative-settlement-prompt.ts
 * @description 第二次叙事结算调用的客户端 Prompt 资产契约
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'

export const NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-settlement:1.1.0'

export const narrativeSettlementPrompt: PromptTemplate = {
  name: 'narrative-settlement',
  version: '1.1.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SETTLEMENT_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '结算用户消息由结算上下文组装器装配为系统状态、回合上下文和最终叙事三段。',
  variables: [],
  outputFormat: 'text',
}
