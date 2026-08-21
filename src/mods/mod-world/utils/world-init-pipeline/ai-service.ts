/**
 * Purpose: Execute one world-init AI request with stable cache pools, logging, and validation.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: AI transport and response validation only; step ordering and Store adoption stay outside.
 */

import { callAI } from '@/core'
import type { AIModelConfig } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import type { ZodSchema } from 'zod'

import type { WorldConfig } from '../../types'
import { isLikelyTruncatedJSON, type CoherenceGuardContext } from '../world-coherence-output-guard'
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
import type { WorldInitPipelineContext } from './contracts'

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

interface WorldInitAICallOptions {
  subPool: WorldInitKVSubPool
  logMeta?: Record<string, unknown>
  logMetaResolver?: (response: string) => Record<string, unknown>
  outputSchema?: ZodSchema
}

function callWorldInitAI(
  context: WorldInitPipelineContext,
  systemPrompt: string,
  userTemplate: string,
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
    jsonMode,
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

export async function callWorldInitAIOnce(
  context: WorldInitPipelineContext,
  systemPrompt: string,
  userTemplate: string,
  trigger: string,
  subPool: WorldInitKVSubPool,
  validate?: (raw: string) => void,
  getDiagnostics?: (raw: string) => WorldInitValidationDiagnostics,
  outputSchema?: ZodSchema,
): Promise<string> {
  const logMetaResolver = (response: string): Record<string, unknown> => {
    const base = { attempt: 1 }
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
  const raw = await callWorldInitAI(context, systemPrompt, userTemplate, trigger, {
    subPool,
    logMeta: { attempt: 1 },
    logMetaResolver,
    outputSchema,
  })
  if (isLikelyTruncatedJSON(raw)) throw new Error('世界初始化 AI 响应不完整')
  validate?.(raw)
  return raw
}
