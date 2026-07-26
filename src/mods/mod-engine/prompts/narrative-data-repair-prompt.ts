/**
 * @module narrative-data-repair-prompt.ts
 * @description 正文有效、结构化数据失败时的独立 JSON 修复契约。
 * @mod mod-engine
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

export const NARRATIVE_DATA_REPAIR_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-data-repair:1.0.0'

// 此处只阻止非对象响应；精确字段、路径和本轮业务条件仍由调用方在与原正文
// 重新组合后校验，避免通用 Schema 重试丢失动态失败上下文。
export const NarrativeDataRepairObjectSchema = z.record(z.string(), z.unknown())

export const narrativeDataRepairPrompt: PromptTemplate<z.infer<typeof NarrativeDataRepairObjectSchema>> = {
  name: 'narrative-data-repair',
  version: '1.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_DATA_REPAIR_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '仅修复完整数据区 JSON；正文和摘要只作为已成立事实输入。',
  variables: [],
  outputFormat: 'json',
  outputSchema: NarrativeDataRepairObjectSchema,
}
