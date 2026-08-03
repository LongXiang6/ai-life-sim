'use client'

/**
 * Purpose: Connect the game-story UI to one real simulation round and its public projections.
 * Owner: mod-engine
 * Responsibility: UI command gating, round invocation, and outcome projection only; no runtime snapshot restore.
 *
 * @module hooks.ts
 * @description 引擎自定义 Hook
 * @mod mod-engine
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AIModelConfig } from '@/foundation'

import { eventBus, CoreEvents } from '@/core/event-bus'
import { postNarrativeRoundOutcome } from '@/core/logger/narrative-round-diagnostic'
import { useGlobalStore } from '@/core/global-store'
import { runtimeRegistry } from '@/core/mod-loader/runtime-registry'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import { logger, reportUsageMetric } from '@/core/logger/client-logger'
import {
  storyRepetitionUsageMetricKey,
  storyRepetitionUsageMetricRevision,
  type StoryRepetitionUsageMetric,
} from '@/core/logger/usage-metrics'
import { useWorldStore } from '@/mods/mod-world/world-runtime-api'

import { narrativePrompt } from './prompts/narrative-prompt'
import { DEFAULT_WORD_COUNT_TARGET } from './constants/narrative-config'
import { clearPreGenQueue, fillPreGenQueue, getPreGenQueueStatus, shiftPreGenQueue, subscribePreGenQueue, waitForPreGenQueueItem, checkAndClearPreGenOnTimeStepChange, type PreGenQueueStatus } from './helpers/pre-gen-queue'
import { resolveMvpRuntimeReadiness } from './helpers/mvp-runtime-policy'
import { ensureOrchestratorContextFromStores } from './helpers/save-restore'
import { syncSubsystemStoresFromStates } from './helpers/subsystem-store-sync'
import { useEngineStore } from './store'
import { orchestrator } from './subsystems/orchestrator-system'
import { timeSystem } from './subsystems/time-system'
import { simulationBridge } from './simulation/simulation-bridge'
import type { SimulationSnapshot } from './simulation/simulation-types'
import type { NarrativeRepetitionMetric } from './helpers/narrative-repetition-metrics'

const REPORTED_REPETITION_REVISION_LIMIT = 64
const reportedRepetitionRevisions = new Map<string, string>()
let repetitionMetricSubscriptionInstalled = false
let pendingRoundFinalization: Promise<void> | null = null

async function waitForRoundFinalization(): Promise<void> {
  const pending = pendingRoundFinalization
  if (pending) await pending
}

function queueRoundFinalization(task: () => Promise<void>): void {
  const pending = task().catch((error) => {
    logger.warn('simulation', '回合诊断最终化失败', error)
  })
  const finalized = pending.finally(() => {
    if (pendingRoundFinalization === finalized) pendingRoundFinalization = null
  })
  pendingRoundFinalization = finalized
}

function ensureRepetitionMetricSubscription(): void {
  if (repetitionMetricSubscriptionInstalled) return
  repetitionMetricSubscriptionInstalled = true
  useEngineStore.subscribe((state, previousState) => {
    if (state.narrativeHistory === previousState.narrativeHistory) return
    const repetition = state.narrativeHistory.at(-1)?.repetitionMetric
    if (!repetition) return
    const key = `${state.lifeRunId}:${repetition.round}`
    // Only rounds completed in this browser session are armed here. Hydrating
    // an old save must not move historical metrics into the current log window.
    if (!reportedRepetitionRevisions.has(key)) return
    reportStoryRepetitionMetric(state.lifeRunId, repetition)
  })
}

function reportStoryRepetitionMetric(
  lifeRunId: string,
  repetition: NarrativeRepetitionMetric,
): void {
  const metric: StoryRepetitionUsageMetric = {
    schemaVersion: 2,
    kind: 'story_repetition',
    lifeRunId,
    round: repetition.round,
    windowSize: repetition.comparedRounds.length,
    wordRepeatRate: repetition.wordRepeatRate,
    maxRecentWordOverlap: repetition.maxRecentWordOverlap,
    maxRecentNgramSimilarity: repetition.maxRecentNgramSimilarity,
    qualityLevel: repetition.qualityLevel,
  }
  const key = storyRepetitionUsageMetricKey(metric)
  const revision = storyRepetitionUsageMetricRevision(metric)
  if (reportedRepetitionRevisions.get(key) === revision) return

  reportedRepetitionRevisions.delete(key)
  reportedRepetitionRevisions.set(key, revision)
  while (reportedRepetitionRevisions.size > REPORTED_REPETITION_REVISION_LIMIT) {
    const oldestKey = reportedRepetitionRevisions.keys().next().value
    if (oldestKey === undefined) break
    reportedRepetitionRevisions.delete(oldestKey)
  }
  ensureRepetitionMetricSubscription()
  reportUsageMetric(metric)
}

function getSimulationRuntimeReadiness(): {
  ready: boolean
  loaderReady: boolean
  missingSubsystems: string[]
} {
  return resolveMvpRuntimeReadiness({
    allModsLoaded: useGlobalStore.getState().allModsLoaded,
    runtimeRegistryFrozen: runtimeRegistry.isFrozen(),
    registeredIds: orchestrator.getSubsystemBindings().map(({ id }) => id),
  })
}

/** 将 orchestrator 内部状态同步到 Zustand（UI 读取 store） */
export function syncOrchestratorToEngineStore(): void {
  const o = orchestrator.getState()
  const focusedBranchIntent = orchestrator.getFocusedBranchIntent()
  syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())

  // 合并 resolvedChoice：orchestrator 内部的 narrativeHistory 不携带 resolvedChoice，
  // 需要从当前 store 的 narrativeHistory 中保留已解析的分支选择，避免 sync 覆盖丢失
  const prevNarrative = useEngineStore.getState().narrativeHistory
  const resolvedChoiceMap = new Map<string, { choice: string; round?: number }>()
  for (const entry of prevNarrative) {
    if (entry.id && entry.resolvedChoice) {
      resolvedChoiceMap.set(entry.id, {
        choice: entry.resolvedChoice,
        round: entry.resolvedChoiceRound,
      })
    }
  }

  const mergedHistory = o.narrativeHistory.map((entry) => {
    const resolved = entry.id ? resolvedChoiceMap.get(entry.id) : undefined
    if (resolved) {
      return {
        ...entry,
        resolvedChoice: resolved.choice,
        resolvedChoiceRound: resolved.round,
      }
    }
    return entry
  })

  useEngineStore.setState((s) => ({
    ...s,
    lifeRunId: o.lifeRunId,
    status: o.status,
    round: { ...o.round },
    totalRounds: o.totalRounds,
    narrativeHistory: mergedHistory,
    currentNarrative: o.currentNarrative,
    compressionStats: { ...o.compressionStats },
    compressedSummaries: structuredClone(o.compressedSummaries),
    lastAutoSaveRound: o.lastAutoSaveRound,
    characterCreations: [...(o.characterCreations ?? [])],
    storyRepetitionStats: structuredClone(o.storyRepetitionStats),
  }))
  useEngineStore.getState().setBranchIntentProjection({
    branchIntents: orchestrator.getActiveBranchIntents(),
    archivedBranchIntents: orchestrator.getArchivedBranchIntents(),
    ...(focusedBranchIntent
      ? { focusedBranchIntentId: focusedBranchIntent.intentId }
      : {}),
  })
}

function restoreRuntimeOrSyncStore(): void {
  const store = useEngineStore.getState()
  const runtime = orchestrator.getState()
  const storeHasProgress = store.totalRounds > 0 || store.narrativeHistory.length > 0
  const runtimeIsEmpty = runtime.totalRounds === 0 && runtime.narrativeHistory.length === 0

  if (storeHasProgress && runtimeIsEmpty) {
    orchestrator.hydrateFromEngineStore()
    return
  }

  if (!storeHasProgress && !runtimeIsEmpty) {
    orchestrator.reset()
  }

  syncOrchestratorToEngineStore()
}

/**
 * 使用引擎控制
 * 暴露 start / pause / resume / stop 控制方法
 */
export function useEngine() {
  const status = useEngineStore((s) => s.status)
  const round = useEngineStore((s) => s.round)
  const totalRounds = useEngineStore((s) => s.totalRounds)
  const lastAutoSaveRound = useEngineStore((s) => s.lastAutoSaveRound)
  const setStatus = useEngineStore((s) => s.setStatus)

  const start = useCallback(() => {
    orchestrator.start()
    setStatus('running')
  }, [setStatus])

  const pause = useCallback(() => {
    orchestrator.pause()
    setStatus('paused')
  }, [setStatus])

  const resume = useCallback(() => {
    orchestrator.resume()
    setStatus('running')
  }, [setStatus])

  const stop = useCallback(() => {
    orchestrator.stop()
    setStatus('complete')
  }, [setStatus])

  return {
    status,
    round,
    totalRounds,
    lastAutoSaveRound,
    seasonName: timeSystem.getSeasonName(),
    start,
    pause,
    resume,
    stop,
  }
}

/**
 * 推进模拟回合：调用 orchestrator.executeRoundV2 并同步 UI store
 */
export function useSimulationAdvance() {
  const [isAdvancing, setIsAdvancing] = useState(false)
  // Claim the mutex before any asynchronous wait. Branch confirmation and
  // automatic retries can otherwise queue behind finalization and start a
  // second real round after the first request releases the lock.
  const isAdvancingRef = useRef(false)
  const allModsLoaded = useGlobalStore((s) => s.allModsLoaded)
  const [runtimeReadiness, setRuntimeReadiness] = useState(getSimulationRuntimeReadiness)
  const worldCode = useWorldStore((s) => s.worldCode)

  useEffect(() => {
    const refreshRuntimeReadiness = () => {
      setRuntimeReadiness(getSimulationRuntimeReadiness())
    }
    refreshRuntimeReadiness()
    return eventBus.on(CoreEvents.ALL_MODS_LOADED, refreshRuntimeReadiness)
  }, [allModsLoaded])

  useEffect(() => {
    const persistApi = useEngineStore.persist
    if (!persistApi.hasHydrated()) {
      return persistApi.onFinishHydration(restoreRuntimeOrSyncStore)
    }

    restoreRuntimeOrSyncStore()
  }, [])

  const advanceRound = useCallback(async () => {
    if (isAdvancingRef.current) {
      return
    }
    isAdvancingRef.current = true
    setIsAdvancing(true)
    try {
      await waitForRoundFinalization()
      const runtimeReadiness = getSimulationRuntimeReadiness()
      if (!runtimeReadiness.loaderReady) {
        useEngineStore.getState().setNarrativeError('核心模拟系统仍在初始化，请稍候重试。')
        return
      }
      if (runtimeReadiness.missingSubsystems.length > 0) {
        console.error(
          '[useSimulationAdvance] 核心运行时子系统未完整注册:',
          runtimeReadiness.missingSubsystems,
        )
        useEngineStore.getState().setNarrativeError('核心模拟系统未完整加载，请刷新页面后重试。')
        return
      }

      useEngineStore.getState().clearPendingNarrative()
      useEngineStore.setState({ narrativeError: null })

      if (orchestrator.isCompressionGateBlocked()) {
        await orchestrator.ensureCompressionGate()
        syncOrchestratorToEngineStore()
        await orchestrator.triggerAutoSave()
      }
      // 预生成关闭时也要等待上一轮摘要压缩提交，避免两个真实回合并发改写同一压缩器。
      await orchestrator.waitForBackgroundCompression()

      const {
        customModel,
        temperature,
        reasoningEffort,
        provider,
      } = useSettingsStore.getState()
      // 从单一来源常量取默认字数，与 orchestrator、pre-gen 共享同一常量
      const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET

      const model = customModel || DEFAULT_AI_MODEL
      const aiConfig: AIModelConfig = {
        model,
        temperature: temperature ?? 0.8,
        stream: false,
        reasoningEffort,
      }

      // 检测时间步长变化，变化时清空旧粒度的预生成队列
      checkAndClearPreGenOnTimeStepChange(useEngineStore.getState().timeStep)

      const forceBranch = useEngineStore.getState().forceBranchNext
      let cached = !forceBranch ? shiftPreGenQueue(narrativePrompt) : undefined
      const shouldWaitForActivePreGen = !cached && !forceBranch && getPreGenQueueStatus().isActive
      if (shouldWaitForActivePreGen) {
        cached = await waitForPreGenQueueItem(narrativePrompt)
        if (!cached) clearPreGenQueue()
      }

      // orchestrator 是运行时单例；同步上下文和步长后直接执行当前真实回合。
      ensureOrchestratorContextFromStores()
      orchestrator.setTimeStep(useEngineStore.getState().timeStep)
      try {
        // 推进前确保 orchestrator 可执行（避免 pause 后 status=paused 导致空回合）
        orchestrator.start()

        if (cached?.fullContent) {
          orchestrator.setPrefetchedNarrative(cached.fullContent, cached.luckGuidance)
          if (cached.isBranchPoint) clearPreGenQueue()
        }

        await orchestrator.executeRoundV2(
          narrativePrompt,
          aiConfig,
          worldCode ? `sim-${worldCode}` : undefined,
        )
        // 自动保存与回合 outcome 只在同一轮最终状态稳定后各执行一次；不记录点击、导航或输入过程。
        const completedExecutionId = useEngineStore.getState().pendingNarrative?.executionId
        syncOrchestratorToEngineStore()
        useEngineStore.getState().clearPendingNarrative(completedExecutionId)
        const completedState = useEngineStore.getState()
        const repetition = completedState.narrativeHistory[completedState.narrativeHistory.length - 1]?.repetitionMetric
        if (repetition) {
          reportStoryRepetitionMetric(completedState.lifeRunId, repetition)
        }
        queueRoundFinalization(async () => {
          await orchestrator.waitForBackgroundCompression()
          syncOrchestratorToEngineStore()
          await orchestrator.triggerAutoSave()
          const report = orchestrator.getLastRoundDiagnostic()
          if (report) await postNarrativeRoundOutcome(report)
          void fillPreGenQueue(narrativePrompt, worldCode ? `sim-pregen-${worldCode}` : undefined)
        })
      } catch (err) {
        const compressionGateFailure = err instanceof Error && err.name === 'CompressionGateError'
        const expectedQualityRejection = err instanceof Error
          && (
            err.name === 'NarrativeGenerationRejectedError'
            || err.name === 'NarrativeBackgroundAnalysisRejectedError'
            || err.name === 'NarrativeBasicAttributeAnalysisRejectedError'
            || err.name === 'NarrativeDataAnalysisRejectedError'
            || err.name === 'NarrativeEventRecognitionRejectedError'
            || err.name === 'NarrativeMacroImpactRejectedError'
          )
        const logRoundFailure = expectedQualityRejection ? logger.warn : logger.error
        logRoundFailure('simulation', '回合执行失败', err)
        const failedReport = orchestrator.getLastRoundDiagnostic()
        if (failedReport) {
          queueRoundFinalization(async () => {
            await postNarrativeRoundOutcome(failedReport)
          })
        }
        const errorMessage = compressionGateFailure
          ? `故事已保留，但压缩首次调用及两路并发重试均失败，下一轮已阻塞：${err.message}`
          : err instanceof Error ? err.message : '叙事生成失败'
        const executionError = err as Error & {
          executionCode?: string
          executionId?: string
        }
        const pendingNarrative = useEngineStore.getState().pendingNarrative
        if (pendingNarrative) {
          useEngineStore.getState().updatePendingNarrative(
            pendingNarrative.executionId,
            'failed',
            executionError.executionCode ?? 'narrative-round:failed',
            errorMessage,
          )
        }
        useEngineStore.getState().setNarrativeError(errorMessage)
      } finally {
        syncOrchestratorToEngineStore()
        const runtimeStatus = orchestrator.getState().status
        useEngineStore.getState().setStatus(runtimeStatus === 'complete' ? 'complete' : 'idle')
      }
    } catch (err) {
      logger.error('simulation', '回合准备失败', err)
      const errorMessage = err instanceof Error ? err.message : '回合准备失败'
      useEngineStore.getState().setNarrativeError(errorMessage)
    } finally {
      isAdvancingRef.current = false
      setIsAdvancing(false)
    }
  }, [worldCode])

  return {
    advanceRound,
    isAdvancing,
    isRuntimeReady: runtimeReadiness.ready,
    runtimeReadiness,
  }
}

/** 订阅预生成队列状态（UI 指示器） */
export function usePreGenQueueStatus(): PreGenQueueStatus {
  const [status, setStatus] = useState(getPreGenQueueStatus)

  useEffect(() => {
    return subscribePreGenQueue(() => {
      setStatus(getPreGenQueueStatus())
    })
  }, [])

  return status
}

/**
 * 使用叙事流
 * 订阅当前流式输出和历史记录
 */
export function useNarrative() {
  const currentNarrative = useEngineStore((s) => s.currentNarrative)
  const narrativeHistory = useEngineStore((s) => s.narrativeHistory)

  return {
    currentNarrative,
    narrativeHistory,
  }
}

/**
 * 订阅 Simulation Worker 发布的快照（UI 与模拟核心解耦）
 */
export function useSimulationSnapshot(): SimulationSnapshot | null {
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(
    () => simulationBridge.getSnapshot(),
  )

  useEffect(() => {
    return simulationBridge.subscribe(setSnapshot)
  }, [])

  return snapshot
}
