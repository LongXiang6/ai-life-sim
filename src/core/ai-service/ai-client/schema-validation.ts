/**
 * Purpose: Validate structured AI responses and perform one explicit format-repair call when required.
 * Owner: core:ai-service
 * Responsibility: Zod validation and repair instruction only; the caller supplies the retry transport.
 */

import { z } from 'zod'
import type { ZodSchema } from 'zod'
import { logger } from '../../logger/client-logger'
import {
  buildJsonValidationRetryInstruction,
  buildJsonValidationRetryOptions,
} from './request-body'
import type { AICallOptions } from './types'

interface ValidationCallContext {
  systemPrompt: string
  userPrompt: string
  options: AICallOptions
}

export async function validateWithRetry(
  content: string,
  schema: ZodSchema,
  callContext: ValidationCallContext,
  retryCall: (options: Omit<AICallOptions, 'outputSchema'>) => Promise<string>,
): Promise<string> {
  if (schema instanceof z.ZodString) {
    const validation = schema.safeParse(content)
    if (validation.success) return content
    logger.warnRaw('ai-client', 'Zod 字符串校验失败，返回原始内容', '')
    if (callContext.options.strictSchema) {
      throw new Error('AI response failed string schema validation')
    }
    return content
  }

  const validateJsonContent = (candidate: string): { valid: true } | { valid: false; reason: string } => {
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'JSON 解析失败' }
    }
    const validation = schema.safeParse(parsed)
    return validation.success
      ? { valid: true }
      : { valid: false, reason: JSON.stringify(validation.error.issues.slice(0, 5)) }
  }

  const firstValidation = validateJsonContent(content)
  if (firstValidation.valid) return content
  logger.warnRaw('ai-client', 'JSON Schema 校验失败，修复一次', firstValidation.reason)
  const { outputSchema: _, ...restOptions } = callContext.options
  const retryResult = await retryCall(buildJsonValidationRetryOptions(
    restOptions,
    buildJsonValidationRetryInstruction(content, firstValidation.reason),
  ))
  const retryValidation = validateJsonContent(retryResult)
  if (retryValidation.valid) return retryResult

  logger.warnRaw('ai-client', 'JSON Schema 修复仍失败', retryValidation.reason)
  if (callContext.options.strictSchema) {
    throw new Error(`AI response failed JSON schema validation after retry: ${retryValidation.reason}`)
  }
  return retryResult || content
}
