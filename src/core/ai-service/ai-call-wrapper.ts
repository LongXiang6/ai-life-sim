/**
 * @module ai-call-wrapper.ts
 * @description 统一 AI 调用入口 — 薄包装，自动从 PromptTemplate 提取 systemPrompt / jsonMode / outputSchema
 * @mod core
 */

import { callAI } from './ai-client'
import type { AICallOptions } from './ai-client'
import type { ZodSchema } from 'zod'

// PromptTemplate 在 foundation 中定义，wrapper 仅需这三个字段以保持低耦合
export interface PromptTemplateLike {
  systemPrompt: string
  serverPromptAssetId?: string
  outputFormat?: 'json' | 'text' | 'markdown'
  outputSchema?: ZodSchema
}

/**
 * 薄包装选项：当前 PromptTemplate 调用统一走完整响应。
 */
export type UnifiedCallOptions = AICallOptions

/**
 * 统一 AI 调用入口 —— 自动从 PromptTemplate 提取 systemPrompt / jsonMode / outputSchema。
 *
 * 职责边界：仅做 PromptTemplate → 调用参数的薄翻译，不填充 userPromptTemplate。
 * userPrompt 由调用方自行组装后传入。
 */
export async function callAIWithPromptTemplate(
  promptTemplate: PromptTemplateLike,
  userPrompt: string,
  options: UnifiedCallOptions,
): Promise<string> {
  const commonOpts = {
    ...options,
    apiKey: options.apiKey,
    serverPromptAssetId: promptTemplate.serverPromptAssetId,
    jsonMode: promptTemplate.outputFormat === 'json' ? true : undefined,
    outputSchema: promptTemplate.outputSchema,
  }

  return callAI(promptTemplate.systemPrompt, userPrompt, commonOpts)
}
