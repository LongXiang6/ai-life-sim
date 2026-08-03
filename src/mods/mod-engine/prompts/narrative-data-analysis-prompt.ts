/**
 * @module narrative-data-analysis-prompt.ts
 * @description 非基础属性系统数据分析 AI 的客户端 Prompt 资产契约
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'
import { NarrativeAIDataAnalysisDataSchema } from '../helpers/narrative-ai-protocol'

export const NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-data-analysis:2.0.0'

export const narrativeDataAnalysisPrompt: PromptTemplate = {
  name: 'narrative-data-analysis',
  version: '2.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_DATA_ANALYSIS_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '数据分析用户消息由组装器提供非基础属性系统完整状态、回合上下文和最近故事。',
  variables: [],
  outputFormat: 'json',
  outputSchema: NarrativeAIDataAnalysisDataSchema,
}
