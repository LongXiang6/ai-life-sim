/**
 * Purpose: Execute world-init AI calls with stable cache pools, logging, retries, and validation.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: AI transport and retry policy only; step ordering and Store adoption stay outside.
 */

import { callAI } from '@/core'
import type { AIModelConfig } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'
import type { ZodSchema } from 'zod'

import type { WorldConfig } from '../../types'
import { bumpTokenBudgetForRetry } from '../world-init-budgets'
import {
  isLikelyTruncatedJSON,
  type CoherenceGuardContext,
} from '../world-coherence-output-guard'
import {
  resolveWorldInitFailureLogMeta,
  type WorldInitValidationDiagnostics,
} from '../world-init-ai-validation'
import {
  buildWorldInitKvSessionId,
  configForWorldInitSubPool,
  prepareWorldInitUserPrompt,
  resolveWorldInitJsonMode,
  type WorldInitKVSubPool,
} from '../world-init-kv'
import {
  MAX_AI_RETRIES,
  RETRY_DELAY_MS,
  type WorldInitPipelineContext,
} from './contracts'

const RESILIENT_AI_MAX_ATTEMPTS = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function fillPromptTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result.replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, '')
}

export function createWorldInitAIService(
  aiConfig: AIModelConfig,
  systemPrompt: string,
  overrideMaxTokens?: number,
  trigger?: string,
  logMetaResolver?: (response: string) => Record<string, unknown>,
  kvOpts?: { subPool: WorldInitKVSubPool; worldCode: number },
  outputSchema?: ZodSchema,
) {
  return async (userPrompt: string, extraUserMessages?: string[]): Promise<string> => {
    const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
    const model = customModel || aiConfig.model
    const subPool = kvOpts?.subPool ?? 'cal'
    const sessionId = buildWorldInitKvSessionId(kvOpts?.worldCode ?? 0, subPool)
    const prepared = prepareWorldInitUserPrompt(userPrompt, subPool)
    const jsonMode = resolveWorldInitJsonMode(subPool)
    const config = configForWorldInitSubPool(aiConfig, subPool)
    return callAI(systemPrompt, prepared.userPrompt, {
      config: { ...config, model },
      pool: 'worldInit',
      sessionId,
      userSegments: prepared.userSegments,
      extraUserMessages,
      jsonMode,
      providerId: provider,
      customBaseUrl: customUrl || undefined,
      customModel: model,
      apiKey: customKey || undefined,
      ...(overrideMaxTokens ? { overrideMaxTokens } : {}),
      logContext: { trigger, pool: 'worldInit', model, sessionId },
      logMeta: {
        kvSubPool: subPool,
        stablePrefixChars: prepared.stablePrefixChars,
        userId: `winit-${sessionId}`,
        jsonMode,
      },
      logMetaResolver,
      outputSchema,
    })
  }
}

export function coherenceGuardFromConfig(config: WorldConfig): CoherenceGuardContext {
  return { worldDescription: config.description, worldType: config.worldType }
}

export async function withRetry<T>(
  name: string,
  task: () => Promise<T>,
  errors: string[],
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      return await task()
    } catch (error) {
      const message = `${name} 第 ${attempt}/${MAX_AI_RETRIES} 次失败: ${String(error)}`
      console.warn(`[mod-world] ${message}`)
      if (attempt < MAX_AI_RETRIES) {
        await sleep(RETRY_DELAY_MS)
      } else {
        errors.push(message)
        return undefined
      }
    }
  }
  return undefined
}

interface WorldInitAICallOptions {
  subPool: WorldInitKVSubPool
  extraUserMessages?: string[]
  logMeta?: Record<string, unknown>
  logMetaResolver?: (response: string) => Record<string, unknown>
  outputSchema?: ZodSchema
}

function callWorldInitAI(
  context: WorldInitPipelineContext,
  systemPrompt: string,
  userTemplate: string,
  maxTokens: number,
  trigger: string,
  options: WorldInitAICallOptions,
): Promise<string> {
  const filled = fillPromptTemplate(userTemplate, context.promptVars)
  const prepared = prepareWorldInitUserPrompt(filled, options.subPool)
  const sessionId = buildWorldInitKvSessionId(context.worldCode, options.subPool)
  const jsonMode = resolveWorldInitJsonMode(options.subPool)
  const config = configForWorldInitSubPool(context.aiConfig, options.subPool)
  return callAI(systemPrompt, prepared.userPrompt, {
    config: { ...config, model: context.model },
    pool: 'worldInit',
    sessionId,
    userSegments: prepared.userSegments,
    extraUserMessages: options.extraUserMessages,
    jsonMode,
    overrideMaxTokens: maxTokens,
    providerId: context.provider,
    customBaseUrl: context.customUrl || undefined,
    customModel: context.model,
    apiKey: context.customKey,
    logContext: { trigger, pool: 'worldInit', model: context.model, sessionId },
    logMeta: {
      kvSubPool: options.subPool,
      stablePrefixChars: prepared.stablePrefixChars,
      userId: `winit-${sessionId}`,
      jsonMode,
      ...options.logMeta,
    },
    logMetaResolver: options.logMetaResolver,
    outputSchema: options.outputSchema,
  })
}

export async function callWorldInitAIResilient(
  context: WorldInitPipelineContext,
  systemPrompt: string,
  userTemplate: string,
  initialBudget: number,
  trigger: string,
  subPool: WorldInitKVSubPool,
  validate?: (raw: string) => void,
  getDiagnostics?: (raw: string) => WorldInitValidationDiagnostics,
  outputSchema?: ZodSchema,
): Promise<string> {
  let budget = initialBudget
  let lastRaw = ''
  let retrySuffix = ''

  const buildLogMetaResolver = (attemptIndex: number) => (response: string): Record<string, unknown> => {
    const base = {
      resilientAttempt: attemptIndex,
      resilientMaxAttempts: RESILIENT_AI_MAX_ATTEMPTS,
      tokenBudget: budget,
    }
    const truncated = isLikelyTruncatedJSON(response)
    const diagnostics = getDiagnostics?.(response)
    let businessError: string | null = null
    if (validate) {
      try {
        validate(response)
      } catch (error) {
        businessError = String(error)
      }
    }
    return resolveWorldInitFailureLogMeta(base, response, truncated, diagnostics, businessError)
  }

  for (let attempt = 0; attempt < RESILIENT_AI_MAX_ATTEMPTS; attempt++) {
    lastRaw = await callWorldInitAI(
      context,
      systemPrompt,
      userTemplate,
      budget,
      trigger,
      {
        subPool,
        extraUserMessages: retrySuffix ? [retrySuffix] : undefined,
        logMeta: {
          resilientAttempt: attempt + 1,
          resilientMaxAttempts: RESILIENT_AI_MAX_ATTEMPTS,
          tokenBudget: budget,
        },
        logMetaResolver: buildLogMetaResolver(attempt + 1),
        outputSchema,
      },
    )

    if (isLikelyTruncatedJSON(lastRaw)) {
      console.warn(`[mod-world] AI 响应可能被截断（budget=${budget}），尝试提高预算重试`)
      retrySuffix = '【修正】上次 JSON 不完整或被截断，请输出完整闭合 JSON，勿省略 aiDetailedParameters 字段。'
      budget = bumpTokenBudgetForRetry(budget)
      continue
    }

    if (validate) {
      try {
        validate(lastRaw)
      } catch (error) {
        if (attempt < RESILIENT_AI_MAX_ATTEMPTS - 1) {
          console.warn(`[mod-world] AI 响应校验失败，重试: ${String(error)}`)
          retrySuffix = [
            '【修正】上次输出未通过校验，请严格按 outputExample 重写：',
            String(error),
            'dimensions.powerFramework 必须是当前世界的具名阶位提议；metadata 用 camelCase 英文 tag；',
            'aiDetailedParameters 为扁平 43 字段，禁止嵌套 worldview/sociology。',
          ].join('\n')
          budget = bumpTokenBudgetForRetry(budget)
          continue
        }
        throw error
      }
    }
    return lastRaw
  }

  throw new Error(`AI 响应不完整或校验失败（最终 budget=${budget}，${lastRaw.length} 字符）`)
}
