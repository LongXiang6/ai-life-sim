import { callAI, parseAIJSON } from '@/core'
import type { AIModelConfig, WorldScoringProfile } from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { buildWorldScoringProfilePrompt } from './prompts/world-scoring-profile-prompt'
import {
  normalizeWorldScoringProfile,
  WorldScoringProfileSuggestionSchema,
} from './scoring-profile'
import type { WorldConfig } from './types'

const SCORING_PROFILE_CONFIG: AIModelConfig = {
  model: 'deepseek-v4-flash',
  temperature: 0.2,
  responseFormat: { type: 'json_object' },
  reasoningEffort: 'disabled',
  stream: false,
}

export async function generateWorldScoringProfile(
  config: WorldConfig,
  worldId: string,
  worldCode: number,
): Promise<WorldScoringProfile> {
  const settings = useSettingsStore.getState()
  const model = settings.customModel || SCORING_PROFILE_CONFIG.model
  const prompt = buildWorldScoringProfilePrompt(config, worldId)
  const raw = await callAI(prompt.systemPrompt, prompt.userPrompt, {
    config: { ...SCORING_PROFILE_CONFIG, model },
    pool: 'worldInit',
    sessionId: `score-${worldCode}`,
    jsonMode: true,
    strictSchema: true,
    outputSchema: WorldScoringProfileSuggestionSchema,
    providerId: settings.provider,
    customBaseUrl: settings.customUrl || undefined,
    customModel: model,
    apiKey: settings.customKey || undefined,
    reasoningEffort: 'disabled',
    logContext: {
      callKind: 'world-scoring-profile',
      trigger: 'world-init/scoring-profile',
      pool: 'worldInit',
      model,
      sessionId: `score-${worldCode}`,
    },
  })
  const parsed = parseAIJSON<unknown>(raw)
  if (!parsed) throw new Error('世界评分维度返回不是有效 JSON')
  return normalizeWorldScoringProfile(WorldScoringProfileSuggestionSchema.parse(parsed), worldId)
}
