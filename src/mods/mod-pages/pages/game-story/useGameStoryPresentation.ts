/**
 * Purpose: Build the character, world, timeline, and information-panel projection for the story page.
 * Owner: mod-pages/game-story
 * Responsibility: Read-only Store selection and presentation derivation only.
 */

import { useMemo } from 'react'

import {
  ATTR_KEYS,
  DEFAULT_MAX_VITALITY,
  DEFAULT_SPIRIT,
  DEFAULT_STAMINA,
  DEFAULT_VITALITY,
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  DESTINY_PATTERN_RARITY_CONFIG,
  RACE_LIFESPAN,
  type CharacterHealthState,
  useCharacterStore,
} from '@/mods/mod-character'
import {
  useEngineStore,
  useNarrative,
} from '@/mods/mod-engine'
import { formatCurrentNarrativeTimeLabel } from '@/mods/mod-engine/engine-api'
import { PRESET_WORLDS, resolvePresetWorldCode, useWorldStore } from '@/mods/mod-world'
import type { NarrativeEntry } from '@/mods/mod-ui'

import { projectWorldTagsToSections } from './game-story-world-tags'

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }
const INITIAL_HEALTH: CharacterHealthState = {
  vitality: DEFAULT_VITALITY,
  maxVitality: DEFAULT_MAX_VITALITY,
  stamina: DEFAULT_STAMINA,
  spirit: DEFAULT_SPIRIT,
  alive: true,
  conditions: [],
  updatedAtTotalDays: 0,
}

function resolveWorldIcon(
  worldConfig: ReturnType<typeof useWorldStore.getState>['worldConfig'],
  worldCode: number,
): string {
  const worldName = worldConfig?.name?.trim() ?? ''
  const preset = PRESET_WORLDS.find((candidate) => (
    (worldCode > 0 && resolvePresetWorldCode(candidate) === worldCode)
      || (worldName && candidate.name === worldName)
  ))
  if (preset?.icon) return preset.icon
  const semanticText = [
    worldName,
    worldConfig?.worldType,
    worldConfig?.essenceTag,
    worldConfig?.powerSystemTag,
  ].filter(Boolean).join(' ')
  if (/赛博|科幻|星际|机械|科技|未来/u.test(semanticText)) return '🌌'
  if (/武|战争|军|骑士|战斗|刀|剑/u.test(semanticText)) return '⚔️'
  if (/魔法|巫|神|灵|修炼|仙|幻想/u.test(semanticText)) return '✨'
  if (/废土|末日|灾变|生存|荒野/u.test(semanticText)) return '🏜️'
  if (/恐怖|异常|诡|惊悚/u.test(semanticText)) return '🕯️'
  return '🌍'
}

type EngineRound = ReturnType<typeof useEngineStore.getState>['round']
type PendingNarrative = ReturnType<typeof useEngineStore.getState>['pendingNarrative']

interface UseGameStoryPresentationOptions {
  hasVisiblePendingNarrative: boolean
  pendingNarrative: PendingNarrative
  round: EngineRound
  seasonName: string
  totalRounds: number
}

export function useGameStoryPresentation({
  hasVisiblePendingNarrative: _hasVisiblePendingNarrative,
  pendingNarrative: _pendingNarrative,
  round,
  seasonName,
  totalRounds,
}: UseGameStoryPresentationOptions) {
  const { narrativeHistory } = useNarrative()
  const timeStep = useEngineStore((state) => state.timeStep)
  const health = useCharacterStore((state) => state.characterBase.status?.health) ?? INITIAL_HEALTH
  const characterName = useCharacterStore((state) => state.name)
  const characterAge = useCharacterStore((state) => state.age)
  const gender = useCharacterStore((state) => state.gender)
  const race = useCharacterStore((state) => state.race)
  const characterBase = useCharacterStore((state) => state.characterBase)
  const destinyPatterns = useCharacterStore((state) => state.destinyPatterns.patterns)
  const pendingDestinyPatternGrowth = useCharacterStore((state) => state.destinyPatterns.pendingGrowth)
  const equippedReincarnationTalents = useCharacterStore((state) => state.equippedReincarnationTalents)
  const talents = useCharacterStore((state) => state.talents)
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldTags = useWorldStore((state) => state.worldTags)
  const eraStartYear = useWorldStore((state) => state.eraStartYear)
  const worldEraName = useWorldStore((state) => state.eraName)
  const worldIcon = useMemo(
    () => resolveWorldIcon(worldConfig, worldCode),
    [worldCode, worldConfig],
  )

  const patternBonus = useMemo(() => {
    const bonus: Record<string, number> = {}
    for (const key of ATTR_KEYS) bonus[key] = 0
    for (const pattern of destinyPatterns ?? []) {
      if (!pattern.attrBonus) continue
      for (const [key, value] of Object.entries(pattern.attrBonus)) {
        if (typeof value === 'number' && key in bonus) bonus[key] += value
      }
    }
    for (const talent of talents) {
      for (const [key, value] of Object.entries(talent.attrBonus)) {
        if (typeof value === 'number' && key in bonus) bonus[key] += value
      }
    }
    return bonus
  }, [destinyPatterns, talents])

  const displayBaseAttrs = useMemo(() => {
    const base = characterBase?.current ?? characterBase?.base
    const includeCreationPatternBonus = totalRounds === 0
    const result: Record<string, number> = {}
    for (const key of ATTR_KEYS) {
      const value = (base as unknown as Record<string, number> | undefined)?.[key] ?? 0
      result[key] = value + (includeCreationPatternBonus ? (patternBonus[key] ?? 0) : 0)
    }
    return result
  }, [characterBase, patternBonus, totalRounds])

  const calculatedNarrativeTimeLabel = useMemo(
    () => formatCurrentNarrativeTimeLabel({ timeStep, round, eraStartYear, worldEraName }),
    [eraStartYear, round, timeStep, worldEraName],
  )
  const latestNarrativeTimeLabel = narrativeHistory.at(-1)?.displayTimeLabel?.trim()
  const narrativeTimeLabel = latestNarrativeTimeLabel || calculatedNarrativeTimeLabel
  const worldTagSections = useMemo(
    () => projectWorldTagsToSections(worldTags),
    [worldTags],
  )

  const narrativeEntries = useMemo<NarrativeEntry[]>(() => {
    const projectGrowthPattern = (pattern: {
      name: string
      rarity: keyof typeof DESTINY_PATTERN_RARITY_CONFIG
      description: string
      effect: string
      attrBonus?: Partial<Record<'mind' | 'physique' | 'charisma' | 'familyBackground' | 'luck', number>>
    }) => ({
      name: pattern.name,
      rarity: pattern.rarity,
      rarityLabel: DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label,
      description: pattern.description,
      effect: pattern.effect,
      attrBonus: { ...pattern.attrBonus },
    })
    const entries: NarrativeEntry[] = narrativeHistory.map((chunk) => {
      const entryAge = chunk.displayAge ?? characterAge
      return {
        text: chunk.text,
        timestamp: chunk.timestamp,
        eraLabel: chunk.displayTimeLabel ?? narrativeTimeLabel,
        ageLabel: `${entryAge} 岁`,
        isBranchPoint: chunk.isBranchPoint,
        branchTitle: chunk.branchTitle,
        resolvedChoice: chunk.resolvedChoice,
        destinyPatternGrowth: chunk.destinyPatternGrowth && entryAge >= DESTINY_PATTERN_GROWTH_MINIMUM_AGE
          ? {
            choiceId: chunk.destinyPatternGrowth.choiceId,
            source: projectGrowthPattern(chunk.destinyPatternGrowth.source),
            options: chunk.destinyPatternGrowth.options.map((option) => ({
              optionId: option.optionId,
              route: option.route,
              ...projectGrowthPattern(option),
            })),
            selectedOptionId: chunk.destinyPatternGrowth.selectedOptionId,
            result: chunk.destinyPatternGrowth.result
              ? projectGrowthPattern(chunk.destinyPatternGrowth.result)
              : undefined,
            }
          : undefined,
      }
    })
    return entries
  }, [characterAge, narrativeHistory, narrativeTimeLabel])

  const worldSurrounding = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    if (!worldConfig) return items
    if (worldConfig.name) items.push({ icon: '🌍', label: '世界', value: worldConfig.name })
    return items
  }, [worldConfig])
  const worldBasicStatus = useMemo(() => [
    { icon: '📅', label: '纪元', value: narrativeTimeLabel },
    { icon: '🌤', label: '季节', value: seasonName || '?' },
  ], [narrativeTimeLabel, seasonName])
  const worldCharStatus = useMemo(() => {
    const items = [
      { icon: '❤️', label: '生命', value: `${health.vitality}/${health.maxVitality}` },
      { icon: '💪', label: '体力', value: String(health.stamina) },
      { icon: '🧠', label: '精神', value: String(health.spirit) },
    ]
    const activeConditionCount = health.conditions.filter((condition) => condition.status !== 'resolved').length
    if (activeConditionCount > 0) items.push({ icon: '🩹', label: '状况', value: String(activeConditionCount) })
    return items
  }, [health])

  return {
    characterAge,
    characterName,
    destinyPatterns,
    displayBaseAttrs,
    equippedReincarnationTalents,
    genderLabel: GENDER_LABELS[gender] ?? gender,
    health,
    narrativeEntries,
    narrativeHistory,
    narrativeTimeLabel,
    pendingDestinyPatternGrowth,
    raceName: (RACE_LIFESPAN[race] ?? { name: race }).name,
    recentRepetitionMetrics: narrativeHistory
      .flatMap((entry) => entry.repetitionMetric ? [entry.repetitionMetric] : [])
      .slice(-5),
    talents,
    timeStep,
    worldBasicStatus,
    worldCharStatus,
    worldCode,
    worldConfig,
    worldIcon,
    worldSurrounding,
    worldTagSections,
  }
}
