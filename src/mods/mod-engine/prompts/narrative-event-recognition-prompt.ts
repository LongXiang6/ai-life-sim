/**
 * Purpose: Declare the client contract for the protected event-recognition Prompt asset.
 * Owner: mod-engine
 * Responsibility: Bind the asset ID, version, output mode, and Schema only.
 *
 * @module narrative-event-recognition-prompt.ts
 * @description 故事后事件识别调用的客户端 Prompt 资产契约
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'
import { NarrativeAIEventRecognitionDataSchema } from '../helpers/narrative-ai-protocol'

export const NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-event-recognition:3.2.0'

export const narrativeEventRecognitionPrompt: PromptTemplate = {
  name: 'narrative-event-recognition',
  version: '3.2.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_EVENT_RECOGNITION_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '事件识别用户消息由组装器提供回合上下文、事件状态、已投递因果、已有候选和最近故事。',
  variables: [],
  outputFormat: 'json',
  outputSchema: NarrativeAIEventRecognitionDataSchema,
}
