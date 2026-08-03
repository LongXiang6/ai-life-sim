/**
 * @module narrative-macro-impact-prompt.ts
 * @description 宏观影响后台调用的客户端 Prompt 资产契约
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'
import { NarrativeAIMacroImpactDataSchema } from '../helpers/narrative-macro-impact-context'

export const NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-macro-impact:1.0.0'

export const narrativeMacroImpactPrompt: PromptTemplate = {
  name: 'narrative-macro-impact',
  version: '1.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_MACRO_IMPACT_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '宏观影响用户消息由组装器提供完整系统状态与契约、玩家影响力证据、回合上下文和最近故事。',
  variables: [],
  outputFormat: 'json',
  outputSchema: NarrativeAIMacroImpactDataSchema,
}
