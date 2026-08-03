/**
 * @module narrative-basic-attribute-prompt.ts
 * @description 基础属性分析 AI 的客户端 Prompt 资产契约
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'
import { NarrativeAIBasicAttributeAnalysisDataSchema } from '../helpers/narrative-ai-protocol'

export const NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-basic-attribute-analysis:2.1.0'

export const narrativeBasicAttributePrompt: PromptTemplate = {
  name: 'narrative-basic-attribute-analysis',
  version: '2.1.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_BASIC_ATTRIBUTE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '基础属性用户消息由组装器提供完整角色画像、属性状态、回合上下文和最近故事。',
  variables: [],
  outputFormat: 'json',
  outputSchema: NarrativeAIBasicAttributeAnalysisDataSchema,
}
