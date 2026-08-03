/**
 * @module narrative-basic-attribute-context.ts
 * @description 基础属性 AI 的完整状态与最近故事组装器
 * @mod mod-engine
 */

import type { CharacterState, RoundContext, SubSystemState } from '@/foundation'
import { getAttrSemantic } from '@/mods/mod-character'

import {
  assertRecentStoriesAvailable,
  buildNarrativeAnalysisRoundContext,
  readNarrativeAnalysisEvidenceEventIds,
} from './narrative-background-analysis-context'
import type { RecentStoryProjection } from './recent-story-context'
import { getNarrativeAISubsystemContract } from './subsystem-field-registry'
import { isSubsystemOpenForPrompt } from './subsystem-prompt-gate'

export interface NarrativeBasicAttributePromptInput {
  userSegments: [string, string, string, string]
  activeSubsystemIds: ['character-base']
  allowedEvidenceEventIds: string[]
}

export function buildNarrativeBasicAttributePromptInput(input: {
  subsystemStates: Record<string, SubSystemState>
  character: CharacterState
  roundContext: RoundContext
  recentStories: readonly RecentStoryProjection[]
}): NarrativeBasicAttributePromptInput {
  assertRecentStoriesAvailable(input.recentStories)
  const state = input.subsystemStates['character-base']
  if (state?.data === undefined || !isSubsystemOpenForPrompt(state, 'character-base')) {
    throw new Error('本轮缺少可供基础属性 AI 读取的完整状态')
  }
  const contract = getNarrativeAISubsystemContract('character-base')
  const baseState = state.data as {
    base?: Record<string, number>
    current?: Record<string, number>
    modifiers?: Record<string, number>
    contextModifiers?: Record<string, Record<string, Record<string, number>>>
    startingAge?: number
  }
  const attributeKeys = ['physique', 'mind', 'talentAptitude', 'charisma'] as const
  const attributeLabels = {
    physique: '体魄',
    mind: '心智',
    talentAptitude: '悟性',
    charisma: '魅力',
  } as const
  const currentSemantics = Object.fromEntries(attributeKeys.map((key) => {
    const value = baseState.current?.[key]
    if (!Number.isFinite(value)) throw new Error(`角色画像缺少${attributeLabels[key]}当前值`)
    return [attributeLabels[key], {
      数值: value,
      说明: getAttrSemantic(key, value!),
    }]
  }))
  const destinyState = input.subsystemStates['destiny-pattern']?.data as {
    patterns?: Array<{
      name?: string
      description?: string
      effect?: string
      rarity?: string
      polarity?: string
      attrBonus?: Record<string, number>
    }>
  } | undefined
  const lifespanState = input.subsystemStates.lifespan?.data as {
    profile?: {
      raceId?: string
      displayName?: string
      clockMode?: string
      attrBaselines?: Record<string, number>
    }
  } | undefined
  const lifecycleState = input.subsystemStates['lifecycle-system']?.data as {
    entity?: {
      stageId?: string
      stageLabel?: string
      stageDescription?: string
      attributeModifiers?: Record<string, number>
    }
  } | undefined
  const allowedEvidenceEventIds = readNarrativeAnalysisEvidenceEventIds(
    input.subsystemStates,
    input.roundContext.contextId,
  )

  return {
    userSegments: [
      `⟦角色画像⟧${JSON.stringify({
        身份: {
          姓名: input.character.name,
          性别: input.character.gender,
          背景: input.character.background,
        },
        稳定特征: {
          命格: destinyState?.patterns ?? input.character.destinyPatterns ?? [],
          物种与生命形态: lifespanState?.profile ?? null,
          生命周期阶段: lifecycleState?.entity ?? null,
        },
        属性构成: {
          基础值: baseState.base,
          当前值: baseState.current,
          聚合修正: baseState.modifiers,
          当前上下文修正: baseState.contextModifiers?.[input.roundContext.contextId] ?? {},
          起始年龄: baseState.startingAge,
          当前语义: currentSemantics,
        },
      })}`,
      `⟦基础属性状态⟧${JSON.stringify({
        系统: contract.aiName,
        目标上下文: input.roundContext.contextId,
        当前完整状态: state.data,
      })}`,
      `⟦回合上下文⟧${JSON.stringify(buildNarrativeAnalysisRoundContext({
        roundContext: input.roundContext,
        allowedEvidenceEventIds,
      }))}`,
      `⟦最近故事⟧${JSON.stringify(input.recentStories)}`,
    ],
    activeSubsystemIds: ['character-base'],
    allowedEvidenceEventIds,
  }
}
