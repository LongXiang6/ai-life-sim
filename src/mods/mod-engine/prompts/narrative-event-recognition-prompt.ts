/**
 * @module narrative-event-recognition-prompt.ts
 * @description 故事后事件识别调用的客户端 Prompt 资产契约
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'

export const NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-event-recognition:1.0.0'

export const narrativeEventRecognitionPrompt: PromptTemplate = {
  name: 'narrative-event-recognition',
  version: '1.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '事件识别用户消息由组装器装配为回合上下文、已有待触发事件和最终叙事三段。',
  variables: [],
  outputFormat: 'text',
}
