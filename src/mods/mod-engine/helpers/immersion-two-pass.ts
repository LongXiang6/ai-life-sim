/**
 * @module immersion-two-pass.ts
 * @description 沉浸模式 Two-pass API —— 先记忆预热再叙事生成（蓝图 F5）
 * @mod mod-engine
 *
 * Pass 1：注入核心记忆、分层记忆与伏笔，让模型先理解当前连续性
 * Pass 2：正常流式叙事（campaign ai-narration 阶段）
 *
 * 默认关闭（IMMERSION_TWO_PASS_ENABLED = false），开启后 API 成本约 2×。
 */

import type { AIModelConfig, PromptContext } from '@/foundation'
import { callAI, type AICallLogContext } from '@/core'
import { IMMERSION_TWO_PASS_ENABLED } from '../constants'

export interface ImmersionWarmupOptions {
  config: AIModelConfig
  sessionId?: string
  apiKey?: string
  providerId?: string
  customBaseUrl?: string
  customModel?: string
  /** Phase 7D-1：与 Pass2 共享的稳定 user JSON 前缀（KV 对齐） */
  stableUserPrefix?: string
  /** 调试日志上下文 */
  logContext?: AICallLogContext
}

/**
 * 运行记忆预热 pass（仅当 IMMERSION_TWO_PASS_ENABLED 时生效）
 *
 * @returns 预热响应文本；未启用或无记忆内容时返回 undefined
 */
export async function runImmersionWarmupPass(
  promptContext: PromptContext,
  systemPrompt: string,
  options: ImmersionWarmupOptions,
): Promise<string | undefined> {
  if (!IMMERSION_TWO_PASS_ENABLED) return undefined

  const memoryParts = [
    promptContext.longTermMemory && `【长期记忆】\n${promptContext.longTermMemory}`,
    promptContext.coreMemory && `【核心记忆】\n${promptContext.coreMemory}`,
    promptContext.relevantMemory && `【相关往事】\n${promptContext.relevantMemory}`,
    promptContext.recentNarrativeMemory && `【近期完整经历】\n${promptContext.recentNarrativeMemory}`,
    promptContext.foreshadowingText && `【活跃伏笔】\n${promptContext.foreshadowingText}`,
  ].filter(Boolean)

  if (memoryParts.length === 0) return undefined

  const warmupUser = [
    options.stableUserPrefix?.trim(),
    '【记忆预热】请快速理解以下世界记忆与伏笔上下文。',
    '不要生成叙事，仅回复一句「已理解当前记忆框架」。',
    ...memoryParts,
  ].filter(Boolean).join('\n\n')

  try {
    return await callAI(systemPrompt, warmupUser, {
      config: options.config,
      pool: 'narrative',
      sessionId: options.sessionId,
      providerId: options.providerId,
      customBaseUrl: options.customBaseUrl,
      customModel: options.customModel,
      apiKey: options.apiKey,
      overrideMaxTokens: 64,
      overrideTemperature: 0.2,
      logContext: options.logContext ?? { callKind: 'immersion-warmup', pool: 'narrative' },
    })
  } catch (err) {
    console.warn('[ImmersionTwoPass] 记忆预热失败，跳过 pass 1:', err)
    return undefined
  }
}

/** 是否应启用 Two-pass（供 campaign 阶段判断） */
export function isImmersionTwoPassEnabled(): boolean {
  return IMMERSION_TWO_PASS_ENABLED
}
