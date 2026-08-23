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
import type { OrchestratorSystem } from '../subsystems/orchestrator-system'

export type MainNarrativeExecutionKind = 'real' | 'preview'

const MAIN_NARRATIVE_REASONING_EFFORT = 'disabled' as const

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
}

const MAIN_STORY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_story_turn',
    description: '提交一次完整故事结果。正文、分支、结局都必须是字符串。分支和结局未使用时填写 null 四个字符；分支使用时填写含 2 到 4 个第二人称可执行行动的 JSON 字符串。只有永久失去意识、感知、决定、行动和任何新经历时才填写结局 JSON 字符串。',
    parameters: {
      type: 'object',
      properties: {
        正文: { type: 'string', description: '完整中文故事正文' },
        分支: {
          type: 'string',
          description: '未使用时填写 null 四个字符；需要选择时填写形如 {"选项":["选项一","选项二"]} 的 JSON 字符串，包含 2 到 4 个第二人称可执行行动',
        },
        结局: {
          type: 'string',
          description: '未使用时填写 null 四个字符；永久失去意识、感知、决定、行动和任何新经历时填写形如 {"四字评语":"四字评语"} 的 JSON 字符串',
        },
      },
      required: ['正文', '分支', '结局'],
      additionalProperties: false,
    },
  },
} as const

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
  const aiConfig = {
    ...input.aiConfig,
    reasoningEffort: MAIN_NARRATIVE_REASONING_EFFORT,
  }
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
      tools: [MAIN_STORY_TOOL],
      toolChoice: { type: 'function', function: { name: 'submit_story_turn' } },
      responseToolName: 'submit_story_turn',
      reasoningEffort: MAIN_NARRATIVE_REASONING_EFFORT,
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
        styleSource: request.activeStyle.source,
        styleText: request.activeStyle.text,
        styleVersion: request.activeStyle.version,
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
  const quality = inspectNarrativeResponseQuality(
    response,
    request.wordCountTarget,
    request.repetitionContext,
    request.segments.userSegments[2],
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

  return {
    response,
    quality: { ...quality, parsed: quality.parsed },
  }
}
