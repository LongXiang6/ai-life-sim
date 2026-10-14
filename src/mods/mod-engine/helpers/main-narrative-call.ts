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

function splitNarrativeBatchResponse(response: string): { primary: string; queuedResponses: string[] } {
  const parsed = parseAIJSON<unknown>(response)
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).故事批次
      : undefined
  if (!Array.isArray(items) || items.length < 1) {
    return { primary: response, queuedResponses: [] }
  }
  return {
    primary: JSON.stringify(items[0]) ?? '',
    queuedResponses: items.slice(1).map((item) => JSON.stringify(item) ?? ''),
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
  const batch = splitNarrativeBatchResponse(response)
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
