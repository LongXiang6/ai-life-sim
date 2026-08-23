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
  buildTimeBridgeSummary,
  collectActiveModWorldRules,
  DEFAULT_WORD_COUNT_TARGET,
  extractBridgeSnapshot,
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
  if (!framework) return undefined
  const ranks = framework.enabled
    ? framework.ranks
    .map((rank) => `${rank.label}：${rank.description}`)
    .join('；')
    : ''
  const boundary = !framework.enabled
    ? '未启用独立超常力量框架；能力、技术与特殊现象只能来自世界描述中已经成立的事实'
    : framework.progression === 'open'
      ? '开放进阶，当前已知阶位之后仍须由世界内事实继续建立'
      : '有限体系，最高已知阶位就是当前世界可达边界'
  return {
    名称: framework.label || '未命名力量体系',
    来源: typeof powerSystemTag === 'string' && powerSystemTag.trim()
      ? `依照当前世界的${powerSystemTag.trim()}规则形成`
      : '依照当前世界已经成立的客观规则形成',
    边界: ranks ? `${boundary}；已知阶位为${ranks}` : boundary,
  }
}

const SPATIAL_FORM_LABELS: Readonly<Record<string, string>> = {
  plane: '单一位面',
  universe: '宇宙',
  crystalSphere: '位面晶壁群系',
  multiverse: '多元宇宙群系',
  omniverse: '诸天万界',
}

const POWER_SYSTEM_LABELS: Readonly<Record<string, string>> = {
  none: '无超自然力量',
  cultivation: '修炼',
  magic: '魔法',
  psi: '灵能或异能',
  technology: '科技',
  martial: '武学',
  faith: '信仰',
  mixed: '混合力量',
}

/** 把已固化的世界维度压成稳定规则文本，和力量框架一起供 01/03 共用。 */
function buildConfiguredWorldRules(config: Record<string, unknown>): string | undefined {
  const lines = [getWorldRules(typeof config.essenceTag === 'string' ? config.essenceTag : undefined)]
  const spatialForm = typeof config.spatialForm === 'string' ? config.spatialForm.trim() : ''
  if (spatialForm) {
    const label = SPATIAL_FORM_LABELS[spatialForm] ?? spatialForm
    lines.push(`空间边界：当前世界以${label}为稳定容器；跨越空间层级或进入新的世界范围，必须由已成立的事实和力量边界支持。`)
  }
  const powerSystemTag = typeof config.powerSystemTag === 'string' ? config.powerSystemTag.trim() : ''
  if (powerSystemTag) {
    const label = POWER_SYSTEM_LABELS[powerSystemTag] ?? powerSystemTag
    lines.push(powerSystemTag === 'none'
      ? '力量来源：当前世界未启用独立超自然力量；角色只能使用世界描述中已成立的知识、技能、工具和社会资源。'
      : `力量来源：当前世界以${label}作为已声明的主要力量来源；具体能力须服从力量框架、条件、代价与边界。`)
  }
  const rules = [...new Set(lines
    .flatMap((value) => value.split(/\r?\n/u))
    .map((value) => value.trim())
    .filter(Boolean))]
  return buildNarrativeWorldRules(rules.join('\n')) || undefined
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
  const timeBridgeSummary = buildTimeBridgeSummary({
    fromYear: orchestrator['prevRoundYear'],
    toYear: orchestrator['state'].round.year,
    tickCount: Math.max(0, orchestrator['state'].round.year - orchestrator['prevRoundYear']),
    prevSnapshot: orchestrator['prevBridgeSnapshot'],
    currentSnapshot: extractBridgeSnapshot(orchestrator['lastSubsystemStates']),
  })
  const assembled: PromptContext = {
    worldNarrativeView: projectWorldSettingForNarrativeAI(lightWorldSetting, narrativeTime),
    characterProfileView: characterNarrativeView.profile,
    characterStatusView: characterNarrativeView.status,
    subsystemSummaries: [],
    currentTime: narrativeTime.timeLabel,
    worldRules: buildConfiguredWorldRules(config),
    modWorldRules: collectActiveModWorldRules(
      orchestrator['modManifests'],
      orchestrator['getSubsystemBindings'](),
    ),
    narrativeStyle: orchestrator['getNarrativeStyle'](),
    narrativeAddressing: useSettingsStore.getState().narrativeAddressing,
    talents,
    timelineMemory: orchestrator['buildPromptTimelineMemory'](),
    recentDetailedStories,
    wordCountInstruction: buildWordCountInstruction(
      useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET,
    ),
    ...(timeBridgeSummary ? { timeGuideText: timeBridgeSummary } : {}),
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
