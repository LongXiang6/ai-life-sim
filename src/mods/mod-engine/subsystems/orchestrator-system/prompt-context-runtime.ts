/**
 * Purpose: Assemble the final main-narrative PromptContext from stable subsystem projections.
 * Owner: mod-engine
 * Responsibility: Final prompt field composition only; state mutation and AI transport remain with their owners.
 */

import { getInstrumentHooks, isInstrumentEnabled } from '@/core/instrument/instrument-mode'
import type { PowerFrameworkDefinition, PromptContext } from '@/foundation'
import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import {
  formatCalibrationSummary,
  formatPowerFrameworkForPrompt,
  type WorldCalibration,
} from '@/mods/mod-world/world-runtime-api'
import { buildCalendarNarrativeContext } from '../../helpers/calendar-narrative-context'
import {
  projectCharacterForNarrativeAI,
  projectWorldSettingForNarrativeAI,
  type NarrativeAICharacterBaseState,
} from '../../helpers/narrative-ai-input-view'
import {
  buildHistoricalEventPromptProjection,
  HISTORICAL_EVENT_LEDGER_ID,
} from '../../helpers/historical-event-prompt-projection'
import { buildNarrativeRoundOutputContract } from '../../helpers/narrative-response-quality'
import { compileNarrativeDynamicComponents } from '../../prompts/narrative-prompt-components'
import {
  buildNarrativeCoherenceHeader,
  buildNarrativeTimeContext,
  buildNarrativeWorldRules,
  buildTimeBridgeSummary,
  buildTimeScaleNarrativeHint,
  buildWordCountInstruction,
  causalDelay,
  collectActiveModWorldRules,
  coreMemory,
  DEFAULT_WORD_COUNT_TARGET,
  foreshadowing,
  getWorldRules,
  isSubsystemOpenForPrompt,
  plotStructure,
  readBirthEraYearFromConfig,
  readEraStartYearFromConfig,
  resolveCalendarEraYear,
  resolveNarrativeCalendarNode,
  resolveNarrativeToneHint,
  subsystemRelevance,
  timeSystem,
  type NarrativePromptComponent,
  useEngineStore,
} from '../../orchestrator-shared'
import type { OrchestratorSystem } from '../orchestrator-system'
import {
  formatDestinyPatternsForPrompt,
  formatEquippedMythicPatternForPrompt,
} from './prompt-talent-projection'

export function assemblePromptContextRuntime(
  orchestrator: OrchestratorSystem,
  eventInjectionText?: string,
): PromptContext {
  const worldSetting = orchestrator['worldSetting']
  if (!worldSetting || !orchestrator['characterState']) {
    throw new Error('[Orchestrator] 请先调用 setContext() 设置世界和角色信息')
  }

  const context = orchestrator['buildRoundContext']()
  const luckNarrativeGuidance = orchestrator['prepareLuckNarrativeGuidance'](context)
  const syncedCharacter = orchestrator['syncCharacterStateForPrompt'](context)
  const narrativeTime = buildNarrativeTimeContext(context, worldSetting)
  const promptScopeView = orchestrator['getNarrativeScopeView']()
  const relevantStates = subsystemRelevance.getRelevantStates(
    orchestrator['lastSubsystemStates'],
    context,
  )
  const summaries = Object.values(relevantStates)
    .filter((state) => (
      state.id !== orchestrator.id
      && state.id !== 'population'
      && state.id !== 'culture-tech'
      && isSubsystemOpenForPrompt(state, state.id)
    ))
    .map((state) => ({
      id: state.id,
      summary: state.id === HISTORICAL_EVENT_LEDGER_ID
        ? buildHistoricalEventPromptProjection(state, context.contextId) ?? ''
        : state.summary,
    }))
    .filter((state) => state.summary)
    .map((state) => state.summary)
  const influenceSummary = orchestrator['buildInfluenceText']()
  const npcNetworkSummary = coreMemory.buildNPCNetworkText(promptScopeView)
  if (influenceSummary) summaries.push(influenceSummary)
  if (npcNetworkSummary) summaries.push(npcNetworkSummary)

  const currentAbbreviation = orchestrator['buildAbbreviationSnapshot']()
  const systemChangeSummary = orchestrator['buildSystemChangeSummary'](currentAbbreviation)
  orchestrator['prevAbbreviationSnapshot'] = currentAbbreviation

  const config = worldSetting.config ?? {}
  const baseData = orchestrator['lastSubsystemStates']?.['character-base']?.data as (
    NarrativeAICharacterBaseState & { startingAge?: number }
  ) | undefined
  if (!baseData) throw new Error('主叙事缺少完整的基础属性状态')
  const startingAge = baseData.startingAge ?? 0
  const isOpeningRound = orchestrator['state'].narrativeHistory.length === 0
  const isBirthOpeningRound = isOpeningRound && startingAge === 0 && syncedCharacter.age === 0
  const dynamicGuidanceSources: Array<{
    id: string
    content: string | undefined
    order: number
    kind: NarrativePromptComponent['kind']
    authority: NarrativePromptComponent['authority']
  }> = [
    {
      id: 'round-coherence',
      content: buildNarrativeCoherenceHeader(config),
      order: 10,
      kind: '硬限制',
      authority: '世界与协议',
    },
    {
      id: 'round-output-contract',
      content: buildNarrativeRoundOutputContract(
        useEngineStore.getState().forceBranchNext,
        isOpeningRound,
      ),
      order: 10_000,
      kind: '硬限制',
      authority: '世界与协议',
    },
  ]
  const narrativeGuidanceText = compileNarrativeDynamicComponents(
    dynamicGuidanceSources
      .filter((source) => Boolean(source.content?.trim()))
      .map((source) => ({
        id: source.id,
        title: source.id,
        kind: source.kind,
        lifecycle: '每轮更新',
        authority: source.authority,
        order: source.order,
        dependsOn: [],
        assemblyPosition: '本轮引导',
        loadWhen: '对应动态来源在本轮返回非空内容',
        exitWhen: '触发条件不再成立',
        acceptanceEvidence: 'npm run test:narrative-protocol',
        content: source.content!,
      })),
  )
  const calibration = config._calibration as WorldCalibration | undefined
  const narrativeToneHint = resolveNarrativeToneHint(calibration?.styleGuide?.narrativeTone)
  const calibrationSummary = calibration
    ? formatCalibrationSummary({
        ...calibration,
        ...(calibration.world ? {
          world: Object.fromEntries(
            Object.entries(calibration.world).filter(([key]) => key !== 'populationBase'),
          ) as WorldCalibration['world'],
        } : {}),
        ...(calibration.formulas ? {
          formulas: Object.fromEntries(
            Object.entries(calibration.formulas).filter(([key]) => key !== 'techProgressModifier'),
          ) as WorldCalibration['formulas'],
        } : {}),
      })
    : undefined

  const roundGuidance = orchestrator['buildRoundGuidanceInput'](luckNarrativeGuidance)
  const destinyPatterns = (syncedCharacter.destinyPatterns ?? []).map((pattern) => ({
    name: pattern.name,
    description: pattern.description,
    effect: pattern.effect ?? '',
  }))
  const talents = [
    formatEquippedMythicPatternForPrompt(useCharacterStore.getState().equippedMythicPatterns),
    formatDestinyPatternsForPrompt(destinyPatterns, isOpeningRound),
  ].filter(Boolean).join('\n') || undefined
  const lightWorldSetting = orchestrator['buildLightWorldSetting'](narrativeTime.eraLabel)
  const characterNarrativeView = projectCharacterForNarrativeAI(syncedCharacter, baseData)
  const previousLocalCalendar = resolveNarrativeCalendarNode(
    orchestrator['previousNarrativeRound'].totalDays,
    worldSetting,
  )
  const previousCalendarYear = previousLocalCalendar?.calendarYear ?? resolveCalendarEraYear(
    orchestrator['previousNarrativeRound'].year,
    readEraStartYearFromConfig(config),
    readBirthEraYearFromConfig(config),
  )
  const calendarNarrativeContext = buildCalendarNarrativeContext({
    timeStep: orchestrator['state'].timeStep,
    calendarYear: narrativeTime.calendarYear,
    calendarName: narrativeTime.calendarName,
    daysPerYear: narrativeTime.daysPerYear,
    monthsPerYear: narrativeTime.monthsPerYear,
    seasonName: narrativeTime.seasonName,
    usesCanonicalSolarSeasons: narrativeTime.usesCanonicalSolarSeasons,
    month: narrativeTime.month,
    day: narrativeTime.day,
    previousNode: {
      calendarYear: previousCalendarYear,
      month: previousLocalCalendar?.month ?? orchestrator['previousNarrativeRound'].month + 1,
      day: previousLocalCalendar?.day ?? orchestrator['previousNarrativeRound'].day + 1,
    },
    daysPassed: previousLocalCalendar
      ? Math.max(0, narrativeTime.localTotalDays - previousLocalCalendar.localTotalDays)
      : timeSystem.getDaysPassed(),
    timeStepAlignment: orchestrator['lastTimeStepAlignment'],
  })
  const triggeredCausality = causalDelay.checkCausalTrigger(orchestrator['state'].totalRounds, {
    currentTotalDays: orchestrator['state'].round.totalDays,
    scope: worldSetting.contextId ? 'context' : 'global',
    contextId: worldSetting.contextId,
  })
  orchestrator['pendingNarrativeCausalEventIds'] = triggeredCausality.triggeredEvents.map(
    (event) => event.id,
  )

  const assembled: PromptContext = {
    worldNarrativeView: projectWorldSettingForNarrativeAI(lightWorldSetting, narrativeTime),
    characterProfileView: characterNarrativeView.profile,
    characterStatusView: characterNarrativeView.status,
    currentTime: narrativeTime.timeLabel,
    subsystemSummaries: summaries,
    eventInjectionText: eventInjectionText || undefined,
    causalChainHint: triggeredCausality.narrativeText || undefined,
    timeBridgeSummary: buildTimeBridgeSummary(orchestrator['buildTimeBridgeInput']()) || undefined,
    systemChangeSummary: systemChangeSummary || undefined,
    narrativeGuidanceText: narrativeGuidanceText || undefined,
    plotStructureText: plotStructure.buildPhaseGuidance() || undefined,
    foreshadowingText: foreshadowing.buildForeshadowingText(worldSetting.contextId) || undefined,
    worldTagsText: config._worldTagsText as string | undefined,
    worldRules: buildNarrativeWorldRules(getWorldRules(config.essenceTag as string | undefined)) || undefined,
    modWorldRules: collectActiveModWorldRules(
      orchestrator['modManifests'],
      orchestrator['getSubsystemBindings'](),
    ),
    narrativeStyle: orchestrator['getNarrativeStyle'](),
    narrativeToneHint,
    talents,
    timelineMemory: orchestrator['buildPromptTimelineMemory'](),
    wordCountInstruction: buildWordCountInstruction(
      useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET,
    ),
    calibrationSummary,
    roundSystemGuidanceText: roundGuidance.roundSystemGuidanceText,
    playerBranchIntent: roundGuidance.playerBranchIntent,
    powerFramework: formatPowerFrameworkForPrompt(
      config.powerFramework as PowerFrameworkDefinition | undefined,
    ),
  }

  if (isOpeningRound) {
    const instruction = isBirthOpeningRound
      ? '【出生开场】只写出生当日或前后短时段：用婴儿可感知的细节建立家庭处境与时代环境；禁止跨到后续成长阶段。'
      : '人生记录开场：从当前年龄附近的具体场景建立身份、家世、环境与社会位置，不概述此前整段人生。'
    assembled.roundSystemGuidanceText = assembled.roundSystemGuidanceText
      ? `${assembled.roundSystemGuidanceText}\n\n${instruction}`
      : instruction
  }
  assembled.timeGuideText = [
    buildTimeScaleNarrativeHint(orchestrator['state'].timeStep, {
      usesCanonicalSolarSeasons: narrativeTime.usesCanonicalSolarSeasons,
      calendarName: narrativeTime.calendarName,
    }),
    calendarNarrativeContext,
  ].filter(Boolean).join('\n')

  if (isInstrumentEnabled()) {
    const memory = assembled.timelineMemory ?? ''
    const foreshadowingText = assembled.foreshadowingText ?? ''
    const plotStructureText = assembled.plotStructureText ?? ''
    const totalChars = memory.length + foreshadowingText.length + plotStructureText.length
    getInstrumentHooks().onPromptAssembled?.({
      round: orchestrator['state'].totalRounds,
      memorySummaryChars: memory.length,
      coreMemoryChars: 0,
      foreshadowingChars: foreshadowingText.length,
      directionChars: 0,
      plotStructureChars: plotStructureText.length,
      estimatedTokens: Math.ceil(totalChars / 2.5),
    })
  }
  return assembled
}
