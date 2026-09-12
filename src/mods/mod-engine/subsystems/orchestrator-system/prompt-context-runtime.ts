/**
 * Purpose: Assemble the final main-narrative PromptContext from sample-approved projections.
 * Owner: mod-engine
 * Responsibility: Compose only the fields consumed by the approved 01 story-AI messages.
 */

import { getInstrumentHooks, isInstrumentEnabled } from '@/core/instrument/instrument-mode'
import type { CharacterNarrativeStatus, PromptContext } from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
  type NarrativeAICharacterBaseState,
} from '../../helpers/narrative-ai-input-view'
import {
  buildNarrativeTimeContext,
  buildWordCountInstruction,
  DEFAULT_WORD_COUNT_TARGET,
} from '../../orchestrator-shared'
import type { OrchestratorSystem } from '../orchestrator-system'
import {
  formatDestinyPatternsForPrompt,
  formatEquippedReincarnationTalentsForPrompt,
} from './prompt-talent-projection'

const MAIN_NARRATIVE_RECENT_STORY_WINDOW = 5

/** 主叙事可见的最近完整正文窗口；只保留最近 N 轮正文，不含尚未生成的当前轮。 */
function buildRecentStoriesProjection(orchestrator: OrchestratorSystem): string[] | undefined {
  const history = orchestrator['state'].narrativeHistory
  if (history.length === 0) return undefined
  const firstCommittedRound = Math.max(1, orchestrator['state'].totalRounds - history.length)
  const recent = history.slice(-MAIN_NARRATIVE_RECENT_STORY_WINDOW)
  const baseIndex = history.length - recent.length
  const stories = recent.map((entry, index) => {
    const round = entry.transitionAudit?.round ?? firstCommittedRound + baseIndex + index
    const timeLabel = entry.displayTimeLabel?.trim() || `第${round}轮`
    const ageLabel = entry.displayAge === undefined ? '年龄未知' : `${entry.displayAge}岁`
    const text = entry.text.replace(/^⟦正文⟧(?:\r?\n)*/u, '').trim()
    return `${ageLabel}·${timeLabel}·第${round}轮：${text}`
  })
  return stories.length > 0 ? stories : undefined
}

export function assemblePromptContextRuntime(
  orchestrator: OrchestratorSystem,
): PromptContext {
  const worldSetting = orchestrator['worldSetting']
  if (!worldSetting || !orchestrator['characterState']) {
    throw new Error('[Orchestrator] 请先调用 setContext() 设置世界和角色信息')
  }

  const context = orchestrator['buildRoundContext']()
  const syncedCharacter = orchestrator['syncCharacterStateForPrompt'](context)
  const narrativeTime = buildNarrativeTimeContext(context, worldSetting)
  const baseData = orchestrator['lastSubsystemStates']?.['character-base']?.data as (
    NarrativeAICharacterBaseState & { startingAge?: number; status?: CharacterNarrativeStatus }
  ) | undefined
  if (!baseData) throw new Error('主叙事缺少完整的基础属性状态')

  const isOpeningRound = orchestrator['state'].narrativeHistory.length === 0
  const destinyPatterns = (syncedCharacter.destinyPatterns ?? []).map((pattern) => ({
    name: pattern.name,
    description: pattern.description,
    effect: pattern.effect ?? '',
  }))
  const characterStore = useCharacterStore.getState()
  const talents = [
    ...formatEquippedReincarnationTalentsForPrompt(characterStore.equippedReincarnationTalents),
    ...formatDestinyPatternsForPrompt(destinyPatterns, isOpeningRound),
  ]
  const fortuneBonus = [
    ...characterStore.destinyPatterns.patterns,
    ...characterStore.equippedReincarnationTalents,
  ].reduce((sum, talent) => sum + (talent.attrBonus.luck ?? 0), 0)
  const growthHistory = characterStore.destinyPatterns.growthHistory
  const openingPatternModifiers: Record<string, number> = {}
  const currentPatternModifiers: Record<string, number> = {}
  for (const pattern of characterStore.destinyPatterns.patterns) {
    const lineageHistory = growthHistory
      .filter((entry) => entry.lineageId === pattern.lineageId)
      .sort((left, right) => left.source.version - right.source.version)
    const openingPattern = lineageHistory[0]?.source ?? pattern
    for (const key of ['mind', 'physique', 'charisma', 'familyBackground'] as const) {
      openingPatternModifiers[key] = (openingPatternModifiers[key] ?? 0) + (openingPattern.attrBonus[key] ?? 0)
      currentPatternModifiers[key] = (currentPatternModifiers[key] ?? 0) + (pattern.attrBonus[key] ?? 0)
    }
  }
  const characterNarrativeView = projectCharacterForNarrativeAI(
    syncedCharacter,
    baseData,
    {
      openingModifiers: {
        physique: baseData.modifiers.physique - (currentPatternModifiers.physique ?? 0) + (openingPatternModifiers.physique ?? 0),
        mind: baseData.modifiers.mind - (currentPatternModifiers.mind ?? 0) + (openingPatternModifiers.mind ?? 0),
        familyBackground: baseData.modifiers.familyBackground - (currentPatternModifiers.familyBackground ?? 0) + (openingPatternModifiers.familyBackground ?? 0),
        charisma: baseData.modifiers.charisma - (currentPatternModifiers.charisma ?? 0) + (openingPatternModifiers.charisma ?? 0),
      },
      openingLuckBonus: characterStore.destinyPatterns.patterns
        .reduce((sum, pattern) => {
          const lineageHistory = growthHistory
            .filter((entry) => entry.lineageId === pattern.lineageId)
            .sort((left, right) => left.source.version - right.source.version)
          return sum + (lineageHistory[0]?.source.attrBonus.luck ?? pattern.attrBonus.luck ?? 0)
        }, characterStore.equippedReincarnationTalents.reduce(
          (sum, talent) => sum + (talent.attrBonus.luck ?? 0),
          0,
        )),
      currentLuckBonus: fortuneBonus,
      hasInLifeTalentGrowth: growthHistory.length > 0,
    },
    characterStore.lifespanDraft.race.name,
  )
  const lightWorldSetting = orchestrator['buildLightWorldSetting'](narrativeTime.eraLabel)
  const roundGuidance = orchestrator['buildRoundGuidanceInput']()
  const assembled: PromptContext = {
    worldNarrativeView: projectWorldSettingForNarrativeAI(lightWorldSetting),
    characterProfileView: characterNarrativeView.profile,
    characterStatusView: characterNarrativeView.status,
    subsystemSummaries: [],
    currentTime: narrativeTime.timeLabel,
    narrativeStyle: orchestrator['getNarrativeStyle'](),
    narrativeAddressing: useSettingsStore.getState().narrativeAddressing,
    talents,
    timelineMemory: orchestrator['buildPromptTimelineMemory'](),
    recentStories: buildRecentStoriesProjection(orchestrator),
    wordCountInstruction: buildWordCountInstruction(
      useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET,
    ),
    playerBranchIntent: roundGuidance.playerBranchIntent,
  }

  if (isInstrumentEnabled()) {
    const memoryChars = (assembled.timelineMemory ?? []).join('').length
    getInstrumentHooks().onPromptAssembled?.({
      round: orchestrator['state'].totalRounds,
      memorySummaryChars: memoryChars,
      foreshadowingChars: 0,
      directionChars: 0,
      plotStructureChars: 0,
      estimatedTokens: Math.ceil(memoryChars / 2.5),
    })
  }
  return assembled
}
