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
  buildTimeBridgeSummary,
  DEFAULT_WORD_COUNT_TARGET,
  extractBridgeSnapshot,
} from '../../orchestrator-shared'
import type { OrchestratorSystem } from '../orchestrator-system'
import {
  formatDestinyPatternsForPrompt,
  formatEquippedReincarnationTalentsForPrompt,
} from './prompt-talent-projection'

function normalizeCurrentDueEventKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s，。！？、；：:,.!?]/gu, '')
    .replace(/[的地得]/gu, '')
}

export function assemblePromptContextRuntime(
  orchestrator: OrchestratorSystem,
  _eventInjectionText?: string,
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

  orchestrator['pendingNarrativeEventCandidateIds'] = []
  orchestrator['pendingNarrativeCausalEventIds'] = []

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
    for (const key of ['physique', 'mind', 'talentAptitude', 'charisma'] as const) {
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
        talentAptitude: baseData.modifiers.talentAptitude - (currentPatternModifiers.talentAptitude ?? 0) + (openingPatternModifiers.talentAptitude ?? 0),
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
  const dueCandidates = (() => {
    try {
      return orchestrator.getDueHistoricalEventCandidates()
    } catch {
      return []
    }
  })()
  const injectedCandidateIds: string[] = []
  const currentDueEvents: string[] = []
  const seenDueEventKeys = new Set<string>()
  for (const audit of dueCandidates) {
    const candidate = audit.candidate
    const schedule = candidate.schedule
    const dueLabel = schedule?.dueTotalDays !== undefined
      ? `全局第${schedule.dueTotalDays}天`
      : schedule?.dueRoundSequence !== undefined
        ? `第${schedule.dueRoundSequence}轮`
        : schedule?.legacyYear !== undefined
        ? `${schedule.legacyYear}年`
          : narrativeTime.timeLabel
    const title = candidate.title?.trim() || candidate.eventType?.trim() || '到期事项'
    const description = candidate.description?.trim()
    const readable = `${dueLabel}：${title}${description && description !== title ? `：${description}` : ''}`
    const dedupeKey = normalizeCurrentDueEventKey(readable)
    if (seenDueEventKeys.has(dedupeKey)) {
      injectedCandidateIds.push(audit.candidateId)
      continue
    }
    seenDueEventKeys.add(dedupeKey)
    injectedCandidateIds.push(audit.candidateId)
    currentDueEvents.push(readable)
  }
  // 记录本轮实际投影的候选；正文接纳阶段会把这些编号转入既有 in-flight 生命周期。
  orchestrator['pendingNarrativeEventCandidateIds'] = [...new Set(injectedCandidateIds)]
  const timeBridgeSummary = buildTimeBridgeSummary({
    fromYear: orchestrator['prevRoundYear'],
    toYear: orchestrator['state'].round.year,
    tickCount: Math.max(0, orchestrator['state'].round.year - orchestrator['prevRoundYear']),
    prevSnapshot: orchestrator['prevBridgeSnapshot'],
    currentSnapshot: extractBridgeSnapshot(orchestrator['lastSubsystemStates']),
  })
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
    wordCountInstruction: buildWordCountInstruction(
      useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET,
    ),
    ...(timeBridgeSummary ? { timeGuideText: timeBridgeSummary } : {}),
    playerBranchIntent: roundGuidance.playerBranchIntent,
    ...(currentDueEvents.length > 0 ? { currentDueEvents } : {}),
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
