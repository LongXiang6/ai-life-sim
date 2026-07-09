'use client'

/**
 * @module hooks.ts
 * @description 引擎自定义 Hook
 * @mod mod-engine
 */

import { useCallback, useEffect, useState } from 'react'

import type { AIModelConfig } from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import { narrativePrompt } from './prompts/narrative-prompt'
import { computeNarrativeMaxTokens, DEFAULT_WORD_COUNT_TARGET } from './constants/narrative-config'
import { clearPreGenQueue, fillPreGenQueue, getPreGenQueueStatus, shiftPreGenQueue, subscribePreGenQueue, waitForPreGenQueueItem, checkAndClearPreGenOnTimeStepChange, type PreGenQueueStatus } from './helpers/pre-gen-queue'
import { ensureOrchestratorContextFromStores } from './helpers/save-restore'
import { syncSubsystemStoresFromStates } from './helpers/subsystem-store-sync'
import { useEngineStore } from './store'
import { orchestrator } from './subsystems/orchestrator-system'
import { timeSystem } from './subsystems/time-system'
import { simulationBridge } from './simulation/simulation-bridge'
import type { SimulationSnapshot } from './simulation/simulation-types'

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
    round: { ...o.round },
    totalRounds: o.totalRounds,
    narrativeHistory: mergedHistory,
    currentNarrative: o.currentNarrative,
    compressionStats: { ...o.compressionStats },
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
  const worldCode = useWorldStore((s) => s.worldCode)

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

    setIsAdvancing(true)
    useEngineStore.setState({ streamingNarrative: '', narrativeError: null })

    const {
      customModel,
      temperature,
    } = useSettingsStore.getState()
    // 从单一来源常量取默认字数，与 orchestrator、pre-gen 共享同一常量
    const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET

    const model = customModel || 'deepseek-v4-flash'
    const aiConfig: AIModelConfig = {
      model,
      temperature: temperature ?? 0.8,
      maxTokens: computeNarrativeMaxTokens(wordCountTarget),
      stream: true,
    }

    // orchestrator 是运行时单例，刷新页面后不会随 Zustand 持久化自动恢复上下文；
    // 推进和预生成前统一从 world/character store 补齐，避免页面层绕过引擎职责。
    ensureOrchestratorContextFromStores()
    orchestrator.setTimeStep(useEngineStore.getState().timeStep)

    // 检测时间步长变化，变化时清空旧粒度的预生成队列
    checkAndClearPreGenOnTimeStepChange(useEngineStore.getState().timeStep)

    // 推进前确保 orchestrator 可执行（避免 pause 后 status=paused 导致空回合）
    orchestrator.start()

    const forceBranch = useEngineStore.getState().forceBranchNext
    let cached = !forceBranch ? shiftPreGenQueue() : undefined
    const shouldWaitForActivePreGen = !cached && !forceBranch && getPreGenQueueStatus().isActive
    if (shouldWaitForActivePreGen) {
      cached = await waitForPreGenQueueItem()
      if (!cached) clearPreGenQueue()
    }

    if (cached?.fullContent) {
      orchestrator.setPrefetchedNarrative(cached.fullContent)
      if (cached.isBranchPoint) clearPreGenQueue()
    }

    try {
      await orchestrator.executeRoundV2(
        narrativePrompt,
        aiConfig,
        worldCode ? `sim-${worldCode}` : undefined,
      )

      // 自动保存：叙事完成后立即保存最新状态（废弃项目做法：无条件保存）
      syncOrchestratorToEngineStore()
      orchestrator.triggerAutoSave()
    } catch (err) {
      console.error('[useSimulationAdvance] 回合执行失败:', err)
      useEngineStore.getState().setNarrativeError(
        err instanceof Error ? err.message : '叙事生成失败',
      )
    } finally {
      syncOrchestratorToEngineStore()
      useEngineStore.getState().setStatus('idle')
      setIsAdvancing(false)
      void fillPreGenQueue(narrativePrompt, worldCode ? `sim-pregen-${worldCode}` : undefined)
    }
  }, [isAdvancing, worldCode])

  return { advanceRound, isAdvancing }
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
