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
  RACE_LIFESPAN,
  type CharacterHealthState,
  useCharacterStore,
} from '@/mods/mod-character'
import { resolveDestinyPatternWorldTags } from '@/mods/mod-character/destiny-pattern-access'
import {
  useEngineStore,
  useNarrative,
} from '@/mods/mod-engine'
import { formatCurrentNarrativeTimeLabel } from '@/mods/mod-engine/engine-api'
import { useWorldStore } from '@/mods/mod-world'
import type { NarrativeEntry } from '@/mods/mod-ui'

import { resolveWorldDimensionLabels } from '../../helpers/world-dimension-labels'
import { parseWorldTagsToSections } from './game-story-world-tags'

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
  hasVisiblePendingNarrative,
  pendingNarrative,
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
  const equippedMythicPatterns = useCharacterStore((state) => state.equippedMythicPatterns)
  const talents = useCharacterStore((state) => state.talents)
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldTags = useWorldStore((state) => state.worldTags)
  const eraStartYear = useWorldStore((state) => state.eraStartYear)
  const worldEraName = useWorldStore((state) => state.eraName)

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
  const worldTagsText = useMemo(
    () => resolveDestinyPatternWorldTags(worldConfig, worldTags),
    [worldConfig, worldTags],
  )
  const worldTagSections = useMemo(
    () => parseWorldTagsToSections(worldTagsText),
    [worldTagsText],
  )

  const narrativeEntries = useMemo<NarrativeEntry[]>(() => {
    const entries: NarrativeEntry[] = narrativeHistory.map((chunk) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
      eraLabel: chunk.displayTimeLabel ?? narrativeTimeLabel,
      ageLabel: chunk.displayAge !== undefined ? `${chunk.displayAge} 岁` : `${characterAge} 岁`,
      isBranchPoint: chunk.isBranchPoint,
      branchTitle: chunk.branchTitle,
      resolvedChoice: chunk.resolvedChoice,
      attrChanges: chunk.attrChanges,
    }))
    if (hasVisiblePendingNarrative && pendingNarrative) {
      entries.push({ text: pendingNarrative.text, timestamp: pendingNarrative.timestamp })
    }
    return entries
  }, [characterAge, hasVisiblePendingNarrative, narrativeHistory, narrativeTimeLabel, pendingNarrative])

  const worldSurrounding = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    if (!worldConfig) return items
    const labels = resolveWorldDimensionLabels(worldConfig)
    if (worldConfig.name) items.push({ icon: '🌍', label: '世界', value: worldConfig.name })
    if (worldConfig.essenceTag) items.push({ icon: '🏷', label: '本质', value: labels.essence })
    if (worldConfig.powerSystemTag) items.push({ icon: '⚡', label: '体系', value: labels.powerSystem })
    if (worldConfig.spatialForm) items.push({ icon: '🌌', label: '空间', value: labels.spatialForm })
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
    equippedMythicPatterns,
    genderLabel: GENDER_LABELS[gender] ?? gender,
    health,
    narrativeEntries,
    narrativeHistory,
    narrativeTimeLabel,
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
    worldSurrounding,
    worldTagSections,
  }
}
