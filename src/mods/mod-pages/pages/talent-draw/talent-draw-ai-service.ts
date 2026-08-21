/**
 * Purpose: Assemble the talent-draw AI context and bridge the destiny system to the shared AI client.
 * Owner: mod-pages/talent-draw
 * Responsibility: Page-specific AI service configuration only; generation lifecycle remains in its hook.
 */

import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import { useCharacterStore } from '@/mods/mod-character'
import { getDestinyPatternSystem } from '@/mods/mod-character/destiny-pattern-access'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { AIModelConfig } from '@/foundation'
import type { AICallLogContext } from '@/core/logger/ai-call-log'

export function buildDestinyPatternContext() {
  return {
    worldConfig: useWorldStore.getState().worldConfig,
    character: {
      race: useCharacterStore.getState().race,
      background: useCharacterStore.getState().background,
    },
    existingNames: [],
  }
}

export function configureDestinyPatternAIService(): void {
  getDestinyPatternSystem().setAIService(async (systemPrompt: string, userPrompt: string, options?: unknown) => {
    const { callAI, callAIStream } = await import('@/core')
    const opts = options as {
      pool?: string
      sessionId?: string
      userSegments?: string[]
      stablePrefixChars?: number
      jsonMode?: boolean
      stream?: boolean
      onChunk?: (text: string) => void
      signal?: AbortSignal
      storySeed?: number
      outputSchema?: Parameters<typeof callAI>[2]['outputSchema']
      logContext?: AICallLogContext
    }
    const useStream = opts?.stream === true
    const {
      provider,
      customKey,
      customUrl,
      customModel,
      talentThinkingIntensity,
    } = useSettingsStore.getState()
    const model = customModel || DEFAULT_AI_MODEL
    const config: AIModelConfig = {
      model,
      temperature: 0.8,
      stream: useStream,
      reasoningEffort: talentThinkingIntensity,
    }
    const callOptions = {
      config,
      pool: (opts?.pool ?? 'fate') as 'narrative' | 'worldInit' | 'fate' | 'lowFrequency',
      sessionId: opts?.sessionId,
      userSegments: opts?.userSegments,
      jsonMode: opts?.jsonMode,
      onChunk: opts?.onChunk,
      signal: opts?.signal,
      providerId: provider,
      apiKey: customKey || undefined,
      customBaseUrl: customUrl || undefined,
      customModel: model,
      reasoningEffort: talentThinkingIntensity,
      storySeed: opts?.storySeed,
      outputSchema: opts?.outputSchema,
      logCategory: 'talent-generate' as const,
      logContext: {
        ...opts?.logContext,
        callKind: opts?.logContext?.callKind
          ?? (useStream ? 'talent-generate-stream' : 'talent-generate-batch'),
        pool: 'fate',
        model,
        sessionId: opts?.sessionId,
      },
      logMeta: {
        userId: opts?.sessionId ? `fate-${opts.sessionId}` : undefined,
        stablePrefixChars: opts?.stablePrefixChars,
      },
    }

    if (useStream) return await callAIStream(systemPrompt, userPrompt, callOptions)
    return await callAI(systemPrompt, userPrompt, callOptions)
  })
}
