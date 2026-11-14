/**
 * Purpose: Own the shared main-story request, exact fingerprint, transport, and recoverable parsing contract.
 * Owner: mod-engine
 * Responsibility: One main-story AI attempt only; round state stays with the campaign and orchestrator.
 */

import type { AIModelConfig, PromptContext, PromptTemplate } from '@/foundation'
import {
  buildSegmentedPrompt,
  callAIWithPromptTemplate,
  isAiResponseTruncatedError,
  recordRoundCacheMetrics,
} from '@/core'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { DEFAULT_WORD_COUNT_TARGET } from '../constants/narrative-config'
import {
  inspectNarrativeResponseQuality,
  type NarrativeResponseQuality,
} from './narrative-response-quality'
import { parseAIJSON } from '@/core/ai-service/parse-ai-json'
import type { OrchestratorSystem } from '../subsystems/orchestrator-system'

export type MainNarrativeExecutionKind = 'real' | 'preview'

export interface MainNarrativeRequest {
  fingerprint: string
  owner: OrchestratorSystem
  promptTemplate: PromptTemplate
  promptContext: PromptContext
  aiConfig: AIModelConfig
  sessionId?: string
  model: string
  segments: ReturnType<typeof buildSegmentedPrompt>
  wordCountTarget: ReturnType<typeof useSettingsStore.getState>['wordCountTarget']
  activeStyle: ReturnType<OrchestratorSystem['getNarrativeStyleSnapshot']>
  repetitionContext: {
    round: number
    recentHistory: Array<{ round: number; text: string }>
  }
}

export interface MainNarrativeResult {
  response: string
  quality: NarrativeResponseQuality & { parsed: NonNullable<NarrativeResponseQuality['parsed']> }
  queuedResponses: string[]
}

/** 主故事一次调用最多回收的连续回合数。 */
const MAX_NARRATIVE_BATCH_ROUNDS = 10

/**
 * 从「故事批次」数组开头逐个回收完整对象：花括号配对 + 字符串与转义感知。
 * 响应被截断或整体 JSON 不可解析时，保住已经完整写出的前几轮，而不是整段丢弃。
 */
function recoverCompleteBatchItems(response: string): unknown[] {
  const anchor = response.indexOf('故事批次')
  const from = anchor >= 0 ? response.indexOf('[', anchor) : response.indexOf('[')
  if (from < 0) return []
  const items: unknown[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let itemStart = -1
  for (let index = from + 1; index < response.length; index += 1) {
    const char = response[index]!
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) itemStart = index
      depth += 1
      continue
    }
    if (char === '}') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && itemStart >= 0) {
        const parsed = parseAIJSON<unknown>(response.slice(itemStart, index + 1))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) items.push(parsed)
        itemStart = -1
      }
      continue
    }
    if (char === ']' && depth === 0) break
  }
  return items
}

/** 批次项必须是故事对象；散文里偶然出现的 JSON 数组（如 [1,2]）不能当成故事项。 */
function isStoryLikeItem(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return '正文' in record
}

/** 拆出主故事批量响应：正常路径读「故事批次」，截断时回收已完整写出的前几轮。 */
export function splitNarrativeBatchResponse(
  response: string,
  batchRounds: number,
): { primary: string; queuedResponses: string[] } {
  const limit = Math.max(1, Math.min(MAX_NARRATIVE_BATCH_ROUNDS, Math.floor(batchRounds) || 1))
  const parsed = parseAIJSON<unknown>(response)
  const declaredItems = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>).故事批次
      : undefined
  // 只有「故事批次」这一锚点存在时才进入回收：单轮故事对象里也有分支选项数组，
  // 无条件从第一个 [ 回收会把单轮故事撕成碎片，导致正常回合反而硬失败。
  const batchAnchor = response.includes('故事批次')
  const declaredStories = Array.isArray(declaredItems)
    ? declaredItems.filter(isStoryLikeItem)
    : []
  const items = declaredStories.length > 0
    ? declaredStories
    : batchAnchor
      ? recoverCompleteBatchItems(response)
      : []
  if (items.length < 1) {
    if (batchAnchor) {
      // 声明了批量输出却一个完整故事项都回收不到：明确失败，绝不把截断原文当单轮故事。
      throw new Error('批量故事包被截断且无法回收任何完整故事项，需要重试本轮')
    }
    return { primary: response, queuedResponses: [] }
  }
  const selected = items.slice(0, limit)
  return {
    primary: JSON.stringify(selected[0]) ?? '',
    queuedResponses: selected.slice(1).map((item) => JSON.stringify(item) ?? ''),
  }
}

function buildMainNarrativeFingerprint(input: {
  promptTemplate: PromptTemplate
  segments: ReturnType<typeof buildSegmentedPrompt>
  aiConfig: AIModelConfig
  model: string
  provider: string
  customUrl: string
  storySeed: string
}): string {
  return JSON.stringify({
    prompt: {
      name: input.promptTemplate.name,
      version: input.promptTemplate.version,
      serverPromptAssetId: input.promptTemplate.serverPromptAssetId ?? '',
      systemPrompt: input.promptTemplate.systemPrompt,
      userPromptTemplate: input.promptTemplate.userPromptTemplate,
      outputFormat: input.promptTemplate.outputFormat,
    },
    messages: input.segments.userSegments,
    request: {
      provider: input.provider,
      customUrl: input.customUrl,
      model: input.model,
      temperature: input.aiConfig.temperature,
      reasoningEffort: input.aiConfig.reasoningEffort,
      storySeed: input.storySeed,
    },
  })
}

export function prepareMainNarrativeRequest(input: {
  owner: OrchestratorSystem
  promptTemplate: PromptTemplate
  promptContext: PromptContext
  aiConfig: AIModelConfig
  sessionId?: string
}): MainNarrativeRequest {
  const settings = useSettingsStore.getState()
  const state = input.owner.getState()
  const model = settings.customModel || input.aiConfig.model
  const aiConfig = input.aiConfig
  const segments = buildSegmentedPrompt(input.promptTemplate, input.promptContext)
  const wordCountTarget = settings.wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
  const activeStyle = input.owner.getNarrativeStyleSnapshot()
  const repetitionContext = {
    round: state.totalRounds,
    recentHistory: state.narrativeHistory.map((entry, index) => ({
      round: Math.max(1, state.totalRounds - state.narrativeHistory.length + index),
      text: entry.text,
    })),
  }

  return {
    fingerprint: buildMainNarrativeFingerprint({
      promptTemplate: input.promptTemplate,
      segments,
      aiConfig,
      model,
      provider: settings.provider,
      customUrl: settings.customUrl,
      storySeed: settings.storySeed.trim(),
    }),
    owner: input.owner,
    promptTemplate: input.promptTemplate,
    promptContext: input.promptContext,
    aiConfig,
    sessionId: input.sessionId,
    model,
    segments,
    wordCountTarget,
    activeStyle,
    repetitionContext,
  }
}

export async function executeMainNarrativeRequest(
  request: MainNarrativeRequest,
  executionKind: MainNarrativeExecutionKind,
  signal?: AbortSignal,
): Promise<MainNarrativeResult> {
  const settings = useSettingsStore.getState()
  const state = request.owner.getState()
  const batchRounds = Math.max(1, Math.floor(request.promptContext.narrativeBatchSize ?? 1) || 1)
  let response: string
  try {
    response = await callAIWithPromptTemplate(request.promptTemplate, request.segments.full, {
      config: { ...request.aiConfig, model: request.model },
      pool: 'narrative',
      reasoningEffort: request.aiConfig.reasoningEffort,
      sessionId: request.sessionId,
      signal,
      userSegments: request.segments.userSegments,
      logContext: {
        lifeRunId: state.lifeRunId,
        round: state.totalRounds,
        age: Number(request.promptContext.characterStatusView.年龄) || undefined,
        strategy: request.segments.strategy,
        callKind: 'narrative-main',
        pool: 'narrative-main',
        model: request.model,
        sessionId: request.sessionId,
        executionKind,
        promptVersion: request.promptTemplate.version,
        targetWordCount: request.wordCountTarget,
        batchRounds,
        ...(request.activeStyle.source === 'custom' && request.activeStyle.text.trim()
          ? {
              styleSource: request.activeStyle.source,
              styleText: request.activeStyle.text,
              styleVersion: request.activeStyle.version,
            }
          : {}),
      },
      providerId: settings.provider,
      customBaseUrl: settings.customUrl || undefined,
      customModel: request.model,
      apiKey: settings.customKey || undefined,
      ...(settings.storySeed.trim() ? { storySeed: settings.storySeed.trim() } : {}),
    })
  } catch (error) {
    if (!isAiResponseTruncatedError(error) || !error.content?.trim()) throw error
    response = error.content
  }
  const batch = splitNarrativeBatchResponse(response, batchRounds)
  const terminalGuidance = request.segments.userSegments.at(-1) ?? ''
  const quality = inspectNarrativeResponseQuality(
    batch.primary,
    request.wordCountTarget,
    request.repetitionContext,
    terminalGuidance,
  )

  recordRoundCacheMetrics({
    strategy: 'S4',
    stablePrefixChars: request.segments.stablePrefixChars,
    userMessageCount: request.segments.userMessageCount,
  })
  if (!quality.valid || !quality.parsed) {
    const error = new Error(`主故事响应未通过本地协议校验：${quality.reason}`)
    error.name = 'NarrativeGenerationRejectedError'
    throw error
  }

  const queuedResponses: string[] = []
  if (!quality.parsed.branch && !quality.parsed.endingTitle) {
    for (const queuedResponse of batch.queuedResponses) {
      const queuedQuality = inspectNarrativeResponseQuality(
        queuedResponse,
        request.wordCountTarget,
        undefined,
        terminalGuidance,
      )
      if (!queuedQuality.valid || !queuedQuality.parsed) break
      queuedResponses.push(queuedResponse)
      if (queuedQuality.parsed.branch || queuedQuality.parsed.endingTitle) break
    }
  }

  return {
    response: batch.primary,
    quality: { ...quality, parsed: quality.parsed },
    queuedResponses,
  }
}
