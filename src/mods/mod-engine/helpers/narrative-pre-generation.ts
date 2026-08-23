/**
 * Purpose: Pre-generate one next-round main story after the current round settles.
 * Owner: mod-engine
 * Responsibility: Isolated projection, one-slot transient result, exact-fingerprint consumption, and invalidation only.
 */

import type { AIModelConfig, PromptTemplate } from '@/foundation'
import { logger } from '@/core/logger/client-logger'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { useEngineStore } from '../store'
import type { OrchestratorSystem } from '../subsystems/orchestrator-system'
import { buildEventInjectionText } from './event-lifecycle-tracker'
import {
  executeMainNarrativeRequest,
  prepareMainNarrativeRequest,
  type MainNarrativeRequest,
  type MainNarrativeResult,
} from './main-narrative-call'
import { prepareNarrativeRoundPromptContext } from './narrative-round-prompt-preparation'

interface NarrativePreGenerationRecord {
  fingerprint: string
  lifeRunId: string
  lifeGeneration: number
  roundSequence: number
  result: MainNarrativeResult
}

interface NarrativePreGenerationRun {
  id: number
  controller: AbortController
  fingerprint?: string
  lifeRunId: string
  lifeGeneration: number
  roundSequence: number
  promise: Promise<NarrativePreGenerationRecord | undefined>
}

let generation = 0
let running: NarrativePreGenerationRun | undefined
let ready: NarrativePreGenerationRecord | undefined
let settingsSubscriptionInstalled = false

function relevantSettingsChanged(
  current: ReturnType<typeof useSettingsStore.getState>,
  previous: ReturnType<typeof useSettingsStore.getState>,
): boolean {
  return current.preGenerateRounds !== previous.preGenerateRounds
    || current.provider !== previous.provider
    || current.customKey !== previous.customKey
    || current.customUrl !== previous.customUrl
    || current.customModel !== previous.customModel
    || current.temperature !== previous.temperature
    || current.reasoningEffort !== previous.reasoningEffort
    || current.storySeed !== previous.storySeed
    || current.narrativeStyleText !== previous.narrativeStyleText
    || current.narrativeStyleVersion !== previous.narrativeStyleVersion
    || current.narrativeAddressing !== previous.narrativeAddressing
    || current.wordCountTarget !== previous.wordCountTarget
}

function ensureSettingsSubscription(): void {
  if (settingsSubscriptionInstalled) return
  settingsSubscriptionInstalled = true
  useSettingsStore.subscribe((current, previous) => {
    if (relevantSettingsChanged(current, previous)) invalidateNarrativePreGeneration()
  })
}

function hasUnresolvedBranch(owner: OrchestratorSystem): boolean {
  return owner.getState().narrativeHistory.some((entry) => (
    entry.isBranchPoint === true && entry.resolvedChoice === undefined
  ))
}

function canStartNarrativePreGeneration(owner: OrchestratorSystem): boolean {
  const settings = useSettingsStore.getState()
  const state = owner.getState()
  return settings.preGenerateRounds === 1
    && state.status !== 'complete'
    && !hasUnresolvedBranch(owner)
    && !owner.hasPendingDestinyPatternGrowth()
    && useEngineStore.getState().forceBranchNext !== true
}

function recordStillMatchesOwner(
  record: NarrativePreGenerationRecord,
  owner: OrchestratorSystem,
): boolean {
  const state = owner.getState()
  return record.lifeRunId === state.lifeRunId
    && record.lifeGeneration === owner.getLifeGeneration()
    && record.roundSequence === state.totalRounds
}

function recordStillBelongsToLife(
  record: NarrativePreGenerationRecord,
  owner: OrchestratorSystem,
): boolean {
  const state = owner.getState()
  return record.lifeRunId === state.lifeRunId
    && record.lifeGeneration === owner.getLifeGeneration()
    && state.totalRounds >= record.roundSequence - 1
    && state.totalRounds <= record.roundSequence
}

async function generateNextMainNarrative(input: {
  owner: OrchestratorSystem
  promptTemplate: PromptTemplate
  aiConfig: AIModelConfig
  sessionId?: string
  run: NarrativePreGenerationRun
}): Promise<NarrativePreGenerationRecord | undefined> {
  const projection = input.owner.createNarrativeProjection()
  projection.advanceTime()
  await projection.advanceAllSubsystems()
  await projection.collectAllSubsystemStates()

  const lifecycle = buildEventInjectionText(
    projection.getDetectionStates(),
    projection.getEventLifecycle(),
    projection.getState().totalRounds,
  )
  projection.setEventLifecycle(lifecycle.newLifecycle)
  const prepared = prepareNarrativeRoundPromptContext(projection, lifecycle.eventInjectionText || undefined)
  const request = prepareMainNarrativeRequest({
    owner: projection,
    promptTemplate: input.promptTemplate,
    promptContext: prepared.promptContext,
    aiConfig: input.aiConfig,
    sessionId: input.sessionId,
  })
  input.run.fingerprint = request.fingerprint
  const result = await executeMainNarrativeRequest(request, 'preview', input.run.controller.signal)
  return {
    fingerprint: request.fingerprint,
    lifeRunId: input.run.lifeRunId,
    lifeGeneration: input.run.lifeGeneration,
    roundSequence: projection.getState().totalRounds,
    result,
  }
}

/** Cancel any in-flight request and discard the one transient ready result. */
export function invalidateNarrativePreGeneration(): void {
  generation += 1
  ready = undefined
  running?.controller.abort()
  running = undefined
}

/** Start one background main-story request after the current round fully settles. */
export function startNarrativePreGeneration(input: {
  owner: OrchestratorSystem
  promptTemplate: PromptTemplate
  aiConfig: AIModelConfig
  sessionId?: string
}): void {
  ensureSettingsSubscription()
  if (!canStartNarrativePreGeneration(input.owner)) {
    // Any failed start condition means the current projected result no longer
    // represents the next runnable round, regardless of which condition changed.
    invalidateNarrativePreGeneration()
    return
  }
  if (running || ready) return

  const state = input.owner.getState()
  const run: NarrativePreGenerationRun = {
    id: ++generation,
    controller: new AbortController(),
    lifeRunId: state.lifeRunId,
    lifeGeneration: input.owner.getLifeGeneration(),
    roundSequence: state.totalRounds + 1,
    promise: Promise.resolve(undefined),
  }
  running = run
  run.promise = generateNextMainNarrative({ ...input, run })
    .then((record) => {
      if (
        !record
        || running?.id !== run.id
        || generation !== run.id
        || !recordStillBelongsToLife(record, input.owner)
      ) return undefined
      ready = record
      return record
    })
    .catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return undefined
      logger.warn('narrative-pre-generation', '下一轮正文预生成失败', error)
      return undefined
    })
    .finally(() => {
      if (running?.id === run.id) running = undefined
    })
}

function takeReadyNarrative(
  request: MainNarrativeRequest,
): MainNarrativeResult | undefined {
  const candidate = ready
  ready = undefined
  if (!candidate) return undefined
  if (
    candidate.fingerprint !== request.fingerprint
    || !recordStillMatchesOwner(candidate, request.owner)
  ) {
    logger.info('narrative-pre-generation', '下一轮正文预生成指纹已失效', {
      round: request.owner.getState().totalRounds,
    })
    return undefined
  }
  return structuredClone(candidate.result)
}

/** Consume a matching result once; a mismatched or unfinished request falls back to the real call. */
export async function takeNarrativePreGeneration(
  request: MainNarrativeRequest,
): Promise<MainNarrativeResult | undefined> {
  ensureSettingsSubscription()
  if (useSettingsStore.getState().preGenerateRounds === 0) {
    invalidateNarrativePreGeneration()
    return undefined
  }

  const immediate = takeReadyNarrative(request)
  if (immediate) return immediate

  const active = running
  if (!active) return undefined
  if (
    active.lifeRunId !== request.owner.getState().lifeRunId
    || active.lifeGeneration !== request.owner.getLifeGeneration()
    || active.roundSequence !== request.owner.getState().totalRounds
    || (active.fingerprint !== undefined && active.fingerprint !== request.fingerprint)
  ) {
    invalidateNarrativePreGeneration()
    return undefined
  }
  if (active.fingerprint === undefined) {
    invalidateNarrativePreGeneration()
    return undefined
  }

  await active.promise
  return takeReadyNarrative(request)
}

export function getNarrativePreGenerationStatus(): {
  state: 'idle' | 'running' | 'ready'
  fingerprint?: string
  roundSequence?: number
} {
  if (ready) return { state: 'ready', fingerprint: ready.fingerprint, roundSequence: ready.roundSequence }
  if (running) return { state: 'running', fingerprint: running.fingerprint, roundSequence: running.roundSequence }
  return { state: 'idle' }
}
