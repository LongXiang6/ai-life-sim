/**
 * @module ai-call-wrapper.ts
 * @description 统一 AI 调用入口 — 薄包装，自动从 PromptTemplate 提取 systemPrompt / jsonMode / outputSchema
 * @mod core
 */

import { callAI, callAIStreamDegraded } from './ai-client'
import type { AICallOptions } from './ai-client'
import type { ZodSchema } from 'zod'

// PromptTemplate 在 foundation 中定义，wrapper 仅需这三个字段以保持低耦合
export interface PromptTemplateLike {
  systemPrompt: string
  outputFormat?: 'json' | 'text' | 'markdown'
  outputSchema?: ZodSchema
}

/**
 * 薄包装选项：AICallOptions 超集，增加 streaming 标记和 fallbackText
 * 其余字段透传给 callAI / callAIStreamDegraded
 */
export interface UnifiedCallOptions extends AICallOptions {
  /** 是否走流式 + 降级链路（callAIStreamDegraded） */
  streaming?: boolean
  /** 仅 streaming 模式：降级兜底文本（callAIStreamDegraded 的第三个参数） */
  fallbackText?: string
  /** S3 对话模式：预构建的消息数组（透传给 callAIStreamDegraded） */
  messages?: Array<{ role: string; content: string }>
}

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
  const { streaming, fallbackText, ...restOptions } = options

  const commonOpts = {
    ...restOptions,
    jsonMode: promptTemplate.outputFormat === 'json' ? true : undefined,
    outputSchema: promptTemplate.outputSchema,
  }

  if (streaming) {
    return callAIStreamDegraded(
      promptTemplate.systemPrompt,
      userPrompt,
      fallbackText ?? '',
      commonOpts,
    )
  }
  return callAI(promptTemplate.systemPrompt, userPrompt, commonOpts)
}
