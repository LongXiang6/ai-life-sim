/**
 * Purpose: Validate one structured AI response locally.
 * Owner: core:ai-service
 * Responsibility: JSON parsing and Zod validation only; it never starts another AI request.
 */

import { z } from 'zod'
import type { ZodSchema } from 'zod'
import { logger } from '../../logger/client-logger'
import type { AICallOptions } from './types'

export function validateResponse(
  content: string,
  schema: ZodSchema,
  options: AICallOptions,
): string {
  if (schema instanceof z.ZodString) {
    const validation = schema.safeParse(content)
    if (validation.success) return content
    logger.warnRaw('ai-client', 'Zod 字符串校验失败', '')
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

  const validation = validateJsonContent(content)
  if (validation.valid) return content
  logger.warnRaw('ai-client', 'JSON Schema 校验失败', validation.reason)
  return content
}
