/**
 * Purpose: Project orchestrator state into compact prompt-facing summaries and local hint inputs.
 * Owner: mod-engine
 * Responsibility: Pure/local prompt projections only; final prompt assembly and AI calls stay elsewhere.
 */

import type { NarrativeHintInput } from '../../orchestrator-shared'
import {
  digestLedger,
  extractBridgeSnapshot,
  memoryLifecycle,
  subsystemRelevance,
  useEngineStore,
} from '../../orchestrator-shared'
import type { OrchestratorSystem } from '../orchestrator-system'

export function buildTimeBridgeInputRuntime(orchestrator: OrchestratorSystem) {
  const fromYear = orchestrator['prevRoundYear']
  const toYear = orchestrator['state'].round.year
  return {
    fromYear,
    toYear,
    tickCount: Math.max(0, toYear - fromYear),
    prevSnapshot: orchestrator['prevBridgeSnapshot'],
    currentSnapshot: extractBridgeSnapshot(orchestrator['lastSubsystemStates']),
    memoryL0Titles: getMemoryL0TitlesRuntime(orchestrator, fromYear, toYear),
  }
}

export function getMemoryL0TitlesRuntime(
  _orchestrator: OrchestratorSystem,
  fromYear: number,
  toYear: number,
): string[] {
  const factsByRound = new Map(
    digestLedger.getEntries().map((entry) => [
      entry.round,
      entry.events.length > 0
        ? entry.events.map((event) => event.text).join('；')
        : entry.digest.trim(),
    ]),
  )
  return memoryLifecycle.getTaggedEvents()
    .filter((event) => {
      const calendarYear = event.calendarYear ?? event.round
      return calendarYear > fromYear && calendarYear <= toYear
    })
    .map((event) => factsByRound.get(event.round) || '')
    .filter(Boolean)
}

export function buildAbbreviationSnapshotRuntime(
  orchestrator: OrchestratorSystem,
): Record<string, string> {
  const snapshot: Record<string, string> = {}
  for (const [id, subsystemState] of Object.entries(orchestrator['lastSubsystemStates'])) {
    if (id === orchestrator.id) continue
    const summary = subsystemState.summary ?? ''
    if (summary) snapshot[id] = summary
  }
  return snapshot
}

export function buildSystemChangeSummaryRuntime(
  orchestrator: OrchestratorSystem,
  current: Record<string, string>,
): string {
  const previous = orchestrator['prevAbbreviationSnapshot']
  if (Object.keys(previous).length === 0) return ''

  const changes: string[] = []
  for (const [id, currentText] of Object.entries(current)) {
    const previousText = previous[id]
    const systemLabel = orchestrator['subsystems'].find((subsystem) => subsystem.id === id)?.label ?? id
    if (previousText && previousText !== currentText) {
      changes.push(`${systemLabel}：${previousText} → ${currentText}`)
      if (!orchestrator['isPreviewExecution']()) {
        subsystemRelevance.recordChange(
          id,
          orchestrator['state'].totalRounds,
          `${previousText} → ${currentText}`,
        )
      }
    } else if (!previousText && currentText) {
      changes.push(`${systemLabel}：新增 — ${currentText}`)
      if (!orchestrator['isPreviewExecution']()) {
        subsystemRelevance.recordChange(
          id,
          orchestrator['state'].totalRounds,
          `新增: ${currentText}`,
        )
      }
    }
  }
  return changes.length > 0 ? `【系统变化摘要】\n${changes.join('\n')}` : ''
}

export function buildInfluenceTextRuntime(
  orchestrator: OrchestratorSystem,
): string | undefined {
  const influenceScore = subsystemRelevance.calculateInfluenceScore(orchestrator['lastSubsystemStates'])
  const scope = subsystemRelevance.getInfluenceScope(influenceScore)
  return subsystemRelevance.buildInfluenceText(scope)
}

export function getSystemContextRuntime(orchestrator: OrchestratorSystem): string {
  const states = orchestrator['collectSubsystemStates']()
  return Object.values(states)
    .map((state) => state.summary)
    .filter(Boolean)
    .join('\n')
}

export function buildLightWorldSettingRuntime(
  orchestrator: OrchestratorSystem,
  eraLabel: string,
): import('@/foundation').WorldSetting {
  if (!orchestrator['worldSetting']) {
    return { name: '', description: '', era: eraLabel, config: {} } as import('@/foundation').WorldSetting
  }

  const worldSetting = orchestrator['worldSetting'] as unknown as Record<string, unknown>
  const { config, ...rest } = worldSetting
  const lightConfig = config && typeof config === 'object'
    ? { ...config as Record<string, unknown> }
    : {}

  delete lightConfig.aiDetailedParameters
  delete lightConfig.description
  for (const key of Object.keys(lightConfig)) {
    if (key.startsWith('_') || lightConfig[key] === undefined) delete lightConfig[key]
  }

  return {
    ...rest,
    era: eraLabel,
    config: lightConfig,
  } as unknown as import('@/foundation').WorldSetting
}

export function buildHintInputRuntime(orchestrator: OrchestratorSystem): NarrativeHintInput {
  const baseData = orchestrator['lastSubsystemStates']?.['character-base']?.data as {
    startingAge?: number
  } | undefined
  const startingAge = baseData?.startingAge ?? 0
  const currentAge = orchestrator['computeNarrativeAge'](orchestrator['buildRoundContext']())

  return {
    currentAge,
    startingAge,
    recentEvents: orchestrator['buildYearEvents']().map((event) => ({
      narrative: event.narrative,
      age: event.age,
    })),
    forceBranch: useEngineStore.getState().forceBranchNext ?? false,
  }
}
