/**
 * @module save-restore.ts
 * @description 存档加载 —— 将 OPFS 快照写回各 Store 并同步 Orchestrator
 * @mod mod-engine
 */

import { useGlobalStore } from '@/core/global-store'
import { useCharacterStore } from '@/mods/mod-character'
import { useEconomyStore } from '@/mods/mod-economy'
import { useHistoryDynamicsStore } from '@/mods/mod-history-dynamics'
import { usePoliticsStore } from '@/mods/mod-politics'
import { usePowerSystemStore } from '@/mods/mod-power-system'
import { useWorldStore } from '@/mods/mod-world'
import { buildOrchestratorWorldSetting } from '@/mods/mod-engine/helpers/orchestrator-world-setting'

import { orchestrator } from '../engine-api'
import { clearPreGenQueue } from './pre-gen-queue'
import { syncSubsystemStoresFromStates } from './subsystem-store-sync'
import { useEngineStore } from '../store'

function serializeStoreSnapshot<T extends object>(state: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>
}

/**
 * 从存档数据恢复游戏状态（engine / character / world / core MOD stores / orchestrator）。
 *
 * 原子性保证：
 *   - 核心 store（engine / character / world）任一恢复失败即抛出，且**不切换 gamePhase**，
 *     避免进入「半恢复 + 停留在错误界面」的损坏态；调用方应 catch 并提示用户、留在安全页。
 *   - 可选 store（historyDynamics / economy / politics / powerSystem / orchestrator）单个坏数据
 *     仅记录告警并跳过，不阻断整体加载。
 */
export function applyGameSave(data: Record<string, unknown>): void {
  // —— 核心 store：失败即抛，gamePhase 保持不变 ——
  if (data.engine && typeof data.engine === 'object') {
    const engine = data.engine as Partial<ReturnType<typeof useEngineStore.getState>>
    useEngineStore.setState((prev) => ({
      ...prev,
      ...engine,
      streamingNarrative: '',
      narrativeError: null,
      pendingChoices: engine.pendingChoices ?? [],
      selectedChoiceId: engine.selectedChoiceId ?? null,
      resolvedBranches: engine.resolvedBranches ?? prev.resolvedBranches ?? {},
      forceBranchNext: engine.forceBranchNext ?? false,
      status: engine.status === 'complete' ? 'complete' : 'idle',
    }))
    orchestrator.hydrateFromEngineStore()
  }

  if (data.character && typeof data.character === 'object') {
    useCharacterStore.setState(data.character as ReturnType<typeof useCharacterStore.getState>)
  }

  if (data.world && typeof data.world === 'object') {
    useWorldStore.setState(data.world as ReturnType<typeof useWorldStore.getState>)
  }

  // —— 可选 store：单个失败隔离，不阻断加载 ——
  const restoreOptional = (label: string, fn: () => void): void => {
    try {
      fn()
    } catch (err) {
      console.error(`[applyGameSave] 可选状态「${label}」恢复失败，已跳过:`, err)
    }
  }

  if (data.historyDynamics && typeof data.historyDynamics === 'object') {
    restoreOptional('historyDynamics', () =>
      useHistoryDynamicsStore.setState(data.historyDynamics as ReturnType<typeof useHistoryDynamicsStore.getState>))
  }

  if (data.economy && typeof data.economy === 'object') {
    restoreOptional('economy', () =>
      useEconomyStore.setState(data.economy as ReturnType<typeof useEconomyStore.getState>))
  }

  if (data.politics && typeof data.politics === 'object') {
    restoreOptional('politics', () =>
      usePoliticsStore.setState(data.politics as ReturnType<typeof usePoliticsStore.getState>))
  }

  if (data.powerSystem && typeof data.powerSystem === 'object') {
    restoreOptional('powerSystem', () =>
      usePowerSystemStore.setState(data.powerSystem as ReturnType<typeof usePowerSystemStore.getState>))
  }

  if (data.orchestrator && typeof data.orchestrator === 'object') {
    restoreOptional('orchestrator', () => {
      orchestrator.restoreSnapshot(data.orchestrator as Parameters<typeof orchestrator.restoreSnapshot>[0])
      syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())
    })
  }

  restoreOptional('orchestratorContext', restoreOrchestratorContext)
  clearPreGenQueue()
  // 只有核心恢复成功（未抛出）才进入模拟态
  useGlobalStore.getState().setGamePhase('simulation')
}

/** 收集当前可持久化快照（供手动/自动存档） */
export function collectGameSavePayload(): Record<string, unknown> {
  syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())

  return {
    engine: serializeStoreSnapshot(useEngineStore.getState()),
    character: serializeStoreSnapshot(useCharacterStore.getState()),
    world: serializeStoreSnapshot(useWorldStore.getState()),
    historyDynamics: serializeStoreSnapshot(useHistoryDynamicsStore.getState()),
    economy: serializeStoreSnapshot(useEconomyStore.getState()),
    politics: serializeStoreSnapshot(usePoliticsStore.getState()),
    powerSystem: serializeStoreSnapshot(usePowerSystemStore.getState()),
    orchestrator: serializeStoreSnapshot(orchestrator.captureSnapshot()),
  }
}

function restoreOrchestratorContext(): void {
  const worldConfig = useWorldStore.getState().worldConfig
  const character = useCharacterStore.getState()
  const eraStartYear = useWorldStore.getState().eraStartYear

  if (!worldConfig) return

  const worldSetting = buildOrchestratorWorldSetting(worldConfig, {
    eraStartYear: eraStartYear || undefined,
  })

  const patterns = character.destinyPatterns.patterns ?? []

  orchestrator.setContext(worldSetting, {
    name: character.name || '未命名',
    age: character.age,
    gender: character.gender,
    background: character.background,
    attributes: character.characterBase.current as unknown as Record<string, unknown>,
    destinyPatterns: patterns.map((p) => ({
      name: p.name,
      description: p.description,
      effect: p.effect,
      rarity: p.rarity,
      polarity: p.polarity,
    })),
  })
}
