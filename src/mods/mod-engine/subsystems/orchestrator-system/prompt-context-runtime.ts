/**
 * Purpose: Assemble the final main-narrative PromptContext from sample-approved projections.
 * Owner: mod-engine
 * Responsibility: Compose only the fields consumed by the approved 01 story-AI messages.
 */

import { getInstrumentHooks, isInstrumentEnabled } from '@/core/instrument/instrument-mode'
import type { CharacterNarrativeStatus, PowerFrameworkDefinition, PromptContext } from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import { isNarrativeRecordVisible } from '../../helpers/narrative-context-scope'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
  type NarrativeAICharacterBaseState,
} from '../../helpers/narrative-ai-input-view'
import {
  buildNarrativeTimeContext,
  buildNarrativeWorldRules,
  buildWordCountInstruction,
  collectActiveModWorldRules,
  DEFAULT_WORD_COUNT_TARGET,
  getWorldRules,
} from '../../orchestrator-shared'
import type { OrchestratorSystem } from '../orchestrator-system'
import {
  formatDestinyPatternsForPrompt,
  formatEquippedReincarnationTalentsForPrompt,
} from './prompt-talent-projection'

function projectPowerFramework(
  framework: PowerFrameworkDefinition | undefined,
  powerSystemTag: unknown,
): Record<string, string> | undefined {
  if (!framework?.enabled) return undefined
  const ranks = framework.ranks
    .map((rank) => `${rank.label}：${rank.description}`)
    .join('；')
  const boundary = framework.progression === 'open'
    ? '开放进阶，当前已知阶位之后仍须由世界内事实继续建立'
    : '有限体系，最高已知阶位就是当前世界可达边界'
  return {
    名称: framework.label,
    来源: typeof powerSystemTag === 'string' && powerSystemTag.trim()
      ? `依照当前世界的${powerSystemTag.trim()}规则形成`
      : '依照当前世界已经成立的客观规则形成',
    边界: ranks ? `${boundary}；已知阶位为${ranks}` : boundary,
  }
}

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
  const config = worldSetting.config ?? {}
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
  const narrativeScopeView = orchestrator['getNarrativeScopeView']()
  const recentDetailedStories = orchestrator['state'].narrativeHistory
    .filter((entry) => isNarrativeRecordVisible(entry, narrativeScopeView))
    .slice(-2)
    .map((entry) => ({
      时间: entry.displayTimeLabel?.trim() || '时间未标注',
      正文: entry.text.replace(/^⟦正文⟧(?:\r?\n)*/u, '').trim(),
    }))
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
  const assembled: PromptContext = {
    worldNarrativeView: projectWorldSettingForNarrativeAI(lightWorldSetting, narrativeTime),
    characterProfileView: characterNarrativeView.profile,
    characterStatusView: characterNarrativeView.status,
    subsystemSummaries: [],
    currentTime: narrativeTime.timeLabel,
    worldRules: buildNarrativeWorldRules(getWorldRules(config.essenceTag as string | undefined)) || undefined,
    modWorldRules: collectActiveModWorldRules(
      orchestrator['modManifests'],
      orchestrator['getSubsystemBindings'](),
    ),
    narrativeStyle: orchestrator['getNarrativeStyle'](),
    talents,
    timelineMemory: orchestrator['buildPromptTimelineMemory'](),
    recentDetailedStories,
    wordCountInstruction: buildWordCountInstruction(
      useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET,
    ),
    playerBranchIntent: roundGuidance.playerBranchIntent,
    ...(currentDueEvents.length > 0 ? { currentDueEvents } : {}),
    powerFramework: projectPowerFramework(
      config.powerFramework as PowerFrameworkDefinition | undefined,
      config.powerSystemTag,
    ),
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
