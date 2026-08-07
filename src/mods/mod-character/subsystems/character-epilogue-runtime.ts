/**
 * Purpose: Generate a post-death epilogue from the character-base status and accepted life history.
 * Owner: mod-character / character-base
 * Responsibility: Preserve the existing conditional epilogue AI call without owning death detection.
 */

import { callAI } from '@/core'
import {
  CHARACTER_DAYS_PER_YEAR,
  stringifyPrompt,
  type AIModelConfig,
  type CharacterNarrativeStatus,
  type RoundContext,
} from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'

import { findCurrentLifeStage } from './character-status-runtime'

const EPILOGUE_SYSTEM_PROMPT = stringifyPrompt({
  role: '身后叙事编纂者。人物已经走完一生，请依据已确认事实写成庄重、克制的一生回顾。',
  requirements: [
    '使用第二人称叙事',
    '依次写出生平概述、关键转折、留下的影响与尾声寄语',
    '只使用输入中的既有事实，不虚构新的重大事件',
    '保持完整连贯，不输出 JSON 或系统说明',
  ],
  outputFormat: '纯文本，使用【生平概述】【关键转折】【留下的影响】【尾声寄语】作为段落标题。',
})

export async function generateCharacterEpilogueText(input: {
  status: CharacterNarrativeStatus
  context: RoundContext
  aiConfig: AIModelConfig
  narrativeHistory: string[]
  sessionId?: string
}): Promise<string> {
  const death = input.status.health.death
  if (input.status.health.alive || !death) throw new Error('角色状态没有可生成尾声的已确认死亡结果')
  if (death.epilogueStatus === 'ready' && death.epilogueText) return death.epilogueText
  const stage = findCurrentLifeStage(input.status)
  const userPrompt = stringifyPrompt({
    characterId: input.status.entityId,
    contextId: input.context.contextId,
    finalAgeYears: Math.floor(death.finalAgeDays / CHARACTER_DAYS_PER_YEAR),
    death: {
      cause: death.causeLabel,
      historicalEventId: death.historicalEventId,
      occurredAtTotalDays: death.occurredAtTotalDays,
    },
    lifecycleStage: stage ? { name: stage.displayName, description: stage.description } : undefined,
    lifespan: {
      race: input.status.raceName,
      clockMode: input.status.clockMode,
      maximumLifespanDays: input.status.maximumLifespanDays,
    },
    conditions: input.status.health.conditions.map((condition) => ({
      name: condition.name,
      severity: condition.severity,
      status: condition.status,
      summary: condition.summary,
    })),
    lifeEvents: input.narrativeHistory,
  })
  const settings = useSettingsStore.getState()
  const model = settings.customModel || input.aiConfig.model
  const epilogueText = (await callAI(EPILOGUE_SYSTEM_PROMPT, userPrompt, {
    config: { ...input.aiConfig, model },
    pool: 'lowFrequency',
    logCategory: 'epilogue',
    sessionId: input.sessionId,
    providerId: settings.provider,
    customBaseUrl: settings.customUrl || undefined,
    customModel: model,
    apiKey: settings.customKey || undefined,
    overrideTemperature: 0.8,
    logContext: {
      round: input.context.round.year,
      age: Math.floor(death.finalAgeDays / CHARACTER_DAYS_PER_YEAR),
      callKind: 'epilogue',
      pool: 'lowFrequency',
      model,
      sessionId: input.sessionId,
    },
  })).trim()
  if (!epilogueText) throw new Error('尾声生成返回空文本')
  return epilogueText
}
