/**
 * Purpose: Assemble the final main-narrative PromptContext from sample-approved projections.
 * Owner: mod-engine
 * Responsibility: Compose only the fields consumed by the approved 01 story-AI messages.
 */

import { getInstrumentHooks, isInstrumentEnabled } from '@/core/instrument/instrument-mode'
import type { CharacterNarrativeStatus, PromptContext, RoundContext, WorldSetting } from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
  type NarrativeAICharacterBaseState,
} from '../../helpers/narrative-ai-input-view'
import { buildHistoricalEventPromptProjection } from '../../helpers/historical-event-prompt-projection'
import { buildWorldEventCandidatePromptProjection } from '../../helpers/world-event-prompt-projection'
import type { NarrativeAIEventLibraryResult } from '../../helpers/narrative-ai-protocol'
import {
  buildWorldEventCandidateBatch,
  useWorldStore,
} from '@/mods/mod-world/world-runtime-api'
import {
  buildNarrativeTimeContext,
  buildWordCountInstruction,
  buildTimeBridgeSummary,
  buildTimeScaleNarrativeHint,
  DEFAULT_WORD_COUNT_TARGET,
  extractBridgeSnapshot,
  resolveCalendarEraYear,
} from '../../orchestrator-shared'
import { buildCalendarNarrativeContext } from '../../helpers/calendar-narrative-context'
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

const REGION_PROMPT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['summary', '概况'],
  ['climate', '气候'],
  ['ecology', '生态'],
  ['resources', '资源'],
  ['pollution', '污染'],
  ['economy', '经济'],
  ['population', '人口'],
  ['settlement', '聚落'],
  ['culture', '文化'],
  ['education', '教育'],
  ['socialStructure', '社会结构'],
  ['factions', '势力'],
  ['law', '法律'],
]

const OPENING_ROUND_DIRECTION = '依据世界名称、世界描述与角色背景，自然确立角色的出生与成长地点、家庭情况、周边环境，并为相关地点拟定符合世界观的具体地域名称。'

function formatCurrentRegionProjection(orchestrator: OrchestratorSystem): string | undefined {
  const state = orchestrator['lastSubsystemStates']?.['spatial-graph']?.data
  if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined
  const record = state as Record<string, unknown>
  const profile = record.currentRegionProfile
  const region = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile as Record<string, unknown>
    : undefined
  const regionName = typeof record.currentRegionName === 'string'
    ? record.currentRegionName.trim()
    : typeof region?.name === 'string'
      ? region.name.trim()
      : ''
  const details = (REGION_PROMPT_FIELDS as ReadonlyArray<readonly [string, string]>)
    .map(([key, label]) => {
      const value = region?.[key]
      if (Array.isArray(value)) {
        const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        return items.length > 0 ? `${label}：${items.join('、')}` : undefined
      }
      return typeof value === 'string' && value.trim().length > 0
        ? `${label}：${value.trim()}`
        : undefined
    })
    .filter((value): value is string => Boolean(value))
  if (!regionName && details.length === 0) return undefined
  return [
    '【当前环境】',
    regionName ? `当前区域：${regionName}` : undefined,
    ...details,
  ].filter((value): value is string => Boolean(value)).join('\n')
}

function buildEventLibraryPromptProjection(
  result: NarrativeAIEventLibraryResult | null,
): string | undefined {
  if (!result || result.候选事件.length === 0) return undefined
  return [
    '【事件库候选】',
    '以下材料由事件库生成，是尚未确认的独立候选事件；故事可根据整体输入自主采用、改写、略过或延后。',
    ...result.候选事件.map((event) => `标题：${event.标题}；描述：${event.描述}`),
    '正文实际写出的内容才交给后续状态提取；未写出的材料不自动成为历史事实。',
  ].join('\n')
}

export interface WorldFactsProjection {
  full: string | undefined
  confirmed: string | undefined
  eventLibraryText: string | undefined
}

function buildWorldFactsProjection(
  orchestrator: OrchestratorSystem,
  context: RoundContext,
  eventInjectionText: string | undefined,
  isOpeningRound: boolean,
): WorldFactsProjection {
  const ledgerText = buildHistoricalEventPromptProjection(
    orchestrator['lastSubsystemStates']?.['historical-event-ledger'],
    context.contextId,
    orchestrator['pendingNarrativeEventCandidateIds'] ?? [],
  )
  const currentRegionText = isOpeningRound ? undefined : formatCurrentRegionProjection(orchestrator)
  const confirmed = [currentRegionText, ledgerText]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n') || undefined
  const worldEventBatch = isOpeningRound ? undefined : (() => {
    const worldState = useWorldStore.getState()
    const contextId = context.contextId || worldState.currentContextId || ''
    const instance = contextId ? worldState.contexts[contextId] : undefined
    if (!instance) return undefined
    return buildWorldEventCandidateBatch(
      {
        contextId: instance.record.id,
        regionId: instance.spatialGraph.currentRegionId,
        worldConfig: structuredClone(instance.worldConfig),
        worldTags: structuredClone(instance.tags),
        legacyWorldTags: [...instance.worldTags],
        calibration: structuredClone(instance.calibration),
        regionProfile: instance.spatialGraph.regionProfiles[instance.spatialGraph.currentRegionId]
          ? structuredClone(instance.spatialGraph.regionProfiles[instance.spatialGraph.currentRegionId])
          : null,
        roundSequence: context.roundSequence ?? orchestrator['state'].totalRounds,
        storySeed: useSettingsStore.getState().storySeed.trim() || orchestrator['state'].lifeRunId,
      },
    )
  })()
  const worldCandidateText = buildWorldEventCandidatePromptProjection(worldEventBatch)
  const eventLibraryText = buildEventLibraryPromptProjection(
    orchestrator.takeEventLibraryResult(),
  )
  const parts = [
    currentRegionText,
    worldCandidateText,
    eventInjectionText?.trim(),
    ledgerText,
  ].filter((value): value is string => Boolean(value?.trim()))
  return {
    full: parts.length > 0 ? parts.join('\n') : undefined,
    confirmed,
    eventLibraryText,
  }
}

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

function resolveFestivalScope(value: unknown): 'china' | 'china-and-international' {
  return value === 'china-and-international' ? 'china-and-international' : 'china'
}

function buildNarrativeTimeGuide(
  orchestrator: OrchestratorSystem,
  context: RoundContext,
  worldSetting: WorldSetting,
  narrativeTime: ReturnType<typeof buildNarrativeTimeContext>,
  timeBridgeSummary?: string,
): string {
  const previousRound = orchestrator['previousNarrativeRound']
  const hasPreviousNarrative = orchestrator['state'].narrativeHistory.length > 0
  const previousNode = hasPreviousNarrative
    ? {
        calendarYear: resolveCalendarEraYear(
          previousRound.year,
          context.eraStartYear ?? 0,
          context.birthEraYear,
        ),
        month: previousRound.month + 1,
        day: (previousRound.day ?? 0) + 1,
      }
    : undefined
  const timeStepAlignment = orchestrator['lastTimeStepAlignment']
  const eventNodeIndex = typeof context.round.eventNodeIndex === 'number'
    ? context.round.eventNodeIndex
    : undefined
  const eventNodeCount = typeof context.round.eventNodeCount === 'number'
    ? context.round.eventNodeCount
    : context.timeStep.unit === 'event'
      ? context.timeStep.value
      : undefined
  const calendarContext = buildCalendarNarrativeContext({
    timeStep: context.timeStep,
    calendarYear: narrativeTime.calendarYear,
    seasonName: narrativeTime.seasonName,
    month: narrativeTime.month,
    day: narrativeTime.day,
    festivalScope: resolveFestivalScope(worldSetting.config.festivalScope),
    characterBackground: typeof orchestrator['characterState']?.background === 'string'
      ? orchestrator['characterState'].background
      : undefined,
    previousNode,
    basePointsPassed: context.basePointsPassed,
    eventNodeIndex,
    eventNodeCount,
    timeStepAlignment,
  })

  return [
    buildTimeScaleNarrativeHint(
      context.timeStep,
      context.timeStep.unit === 'event'
        ? `本自然年已消费${eventNodeIndex ?? 0}/${eventNodeCount ?? context.timeStep.value}个故事节点，距年界还剩${Math.max(0, (eventNodeCount ?? context.timeStep.value) - (eventNodeIndex ?? 0))}个节点`
        : undefined,
    ),
    calendarContext,
    timeBridgeSummary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
}

export function assemblePromptContextRuntime(
  orchestrator: OrchestratorSystem,
  eventInjectionText?: string,
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
  const timeGuideText = buildNarrativeTimeGuide(
    orchestrator,
    context,
    worldSetting,
    narrativeTime,
    timeBridgeSummary,
  )
  const worldFacts = buildWorldFactsProjection(orchestrator, context, eventInjectionText, isOpeningRound)
  orchestrator['setConfirmedWorldFacts'](worldFacts.confirmed)
  const roundSystemGuidanceText = [
    roundGuidance.roundSystemGuidanceText,
    isOpeningRound ? OPENING_ROUND_DIRECTION : undefined,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n') || undefined
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
    ...(timeGuideText ? { timeGuideText } : {}),
    ...(roundSystemGuidanceText
      ? { roundSystemGuidanceText }
      : {}),
    playerBranchIntent: roundGuidance.playerBranchIntent,
    ...(worldFacts.full ? { eventInjectionText: worldFacts.full } : {}),
    ...(worldFacts.eventLibraryText
      ? { eventLibraryText: worldFacts.eventLibraryText }
      : {}),
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
