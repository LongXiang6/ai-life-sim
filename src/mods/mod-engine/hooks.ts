'use client'

/**
 * @module hooks.ts
 * @description 引擎自定义 Hook
 * @mod mod-engine
 */

import { useCallback, useEffect, useState } from 'react'

import type { AIModelConfig } from '@/foundation'

import { eventBus, CoreEvents } from '@/core/event-bus'
import { useGlobalStore } from '@/core/global-store'
import { runtimeRegistry } from '@/core/mod-loader/runtime-registry'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import { narrativePrompt } from './prompts/narrative-prompt'
import { computeNarrativeMaxTokens, DEFAULT_WORD_COUNT_TARGET } from './constants/narrative-config'
import { clearPreGenQueue, fillPreGenQueue, getPreGenQueueStatus, shiftPreGenQueue, subscribePreGenQueue, waitForPreGenQueueItem, checkAndClearPreGenOnTimeStepChange, type PreGenQueueStatus } from './helpers/pre-gen-queue'
import { resolveMvpRuntimeReadiness } from './helpers/mvp-runtime-policy'
import { ensureOrchestratorContextFromStores } from './helpers/save-restore'
import { syncSubsystemStoresFromStates } from './helpers/subsystem-store-sync'
import { useEngineStore } from './store'
import { orchestrator } from './subsystems/orchestrator-system'
import { timeSystem } from './subsystems/time-system'
import { simulationBridge } from './simulation/simulation-bridge'
import type { SimulationSnapshot } from './simulation/simulation-types'

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
  syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())

  // 合并 resolvedChoice：orchestrator 内部的 narrativeHistory 不携带 resolvedChoice，
  // 需要从当前 store 的 narrativeHistory 中保留已解析的分支选择，避免 sync 覆盖丢失
  const prevNarrative = useEngineStore.getState().narrativeHistory
  const resolvedChoiceMap = new Map<string, string>()
  for (const entry of prevNarrative) {
    if (entry.id && entry.resolvedChoice) {
      resolvedChoiceMap.set(entry.id, entry.resolvedChoice)
    }
  }

  const mergedHistory = o.narrativeHistory.map((entry) => {
    if (entry.id && resolvedChoiceMap.has(entry.id)) {
      return { ...entry, resolvedChoice: resolvedChoiceMap.get(entry.id) }
    }
    return entry
  })

  useEngineStore.setState((s) => ({
    ...s,
    status: o.status,
    round: { ...o.round },
    totalRounds: o.totalRounds,
    narrativeHistory: mergedHistory,
    currentNarrative: o.currentNarrative,
    compressionStats: { ...o.compressionStats },
    compressedSummaries: structuredClone(o.compressedSummaries),
    lastAutoSaveRound: o.lastAutoSaveRound,
    characterCreations: [...(o.characterCreations ?? [])],
    streamingNarrative: '',
  }))
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
    orchestrator.onStream((chunk) => {
      if (chunk.isReset) {
        // AI 重试/降级：丢弃上一次尝试的残留流式文本
        useEngineStore.setState({ streamingNarrative: '' })
        return
      }
      useEngineStore.getState().appendStreamingChunk(chunk.text)
    })

    const persistApi = useEngineStore.persist
    if (!persistApi.hasHydrated()) {
      return persistApi.onFinishHydration(restoreRuntimeOrSyncStore)
    }

    restoreRuntimeOrSyncStore()
  }, [])

  const advanceRound = useCallback(async () => {
    if (isAdvancing) return
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

    setIsAdvancing(true)
    useEngineStore.setState({ streamingNarrative: '', narrativeError: null })

    // 预生成关闭时也要等待上一轮摘要压缩提交，避免两个真实回合并发改写同一压缩器。
    await orchestrator.waitForBackgroundCompression()

    const {
      customModel,
      temperature,
      reasoningEffort,
    } = useSettingsStore.getState()
    // 从单一来源常量取默认字数，与 orchestrator、pre-gen 共享同一常量
    const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET

    const model = customModel || 'deepseek-v4-flash'
    const aiConfig: AIModelConfig = {
      model,
      temperature: temperature ?? 0.8,
      maxTokens: computeNarrativeMaxTokens(wordCountTarget),
      stream: true,
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

    // orchestrator 是运行时单例。必须等在途预览结束后再同步上下文和步长，
    // 否则步长切换会在预览 AI 等待期间改写同一份运行态。
    ensureOrchestratorContextFromStores()
    orchestrator.setTimeStep(useEngineStore.getState().timeStep)
    const roundSnapshot = orchestrator.capturePreviewSnapshot()

    // 推进前确保 orchestrator 可执行（避免 pause 后 status=paused 导致空回合）
    orchestrator.start()

    if (cached?.fullContent) {
      orchestrator.setPrefetchedNarrative(cached.fullContent)
      if (cached.isBranchPoint) clearPreGenQueue()
    }

    let roundSucceeded = false
    try {
      await orchestrator.executeRoundV2(
        narrativePrompt,
        aiConfig,
        worldCode ? `sim-${worldCode}` : undefined,
      )
      roundSucceeded = true

      // 自动保存：先让后台摘要提交，再取最终快照；不阻塞玩家看到本轮结果。
      syncOrchestratorToEngineStore()
      void orchestrator.waitForBackgroundCompression().then(() => {
        syncOrchestratorToEngineStore()
        orchestrator.triggerAutoSave()
      })
    } catch (err) {
      const expectedQualityRejection = err instanceof Error
        && err.name === 'NarrativeGenerationRejectedError'
      const logRoundFailure = expectedQualityRejection ? console.warn : console.error
      logRoundFailure('[useSimulationAdvance] 回合执行失败:', err)
      try {
        orchestrator.restorePreviewSnapshot(roundSnapshot)
      } catch (rollbackError) {
        console.error('[useSimulationAdvance] 回合回滚失败:', rollbackError)
      }
      useEngineStore.getState().setNarrativeError(
        err instanceof Error ? err.message : '叙事生成失败',
      )
    } finally {
      syncOrchestratorToEngineStore()
      const runtimeStatus = orchestrator.getState().status
      useEngineStore.getState().setStatus(runtimeStatus === 'complete' ? 'complete' : 'idle')
      setIsAdvancing(false)
      if (roundSucceeded) {
        void fillPreGenQueue(narrativePrompt, worldCode ? `sim-pregen-${worldCode}` : undefined)
      }
    }
  }, [isAdvancing, worldCode])

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
