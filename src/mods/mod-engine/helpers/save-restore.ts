/**
 * @module save-restore.ts
 * @description 存档加载 —— 将 OPFS 快照写回各 Store 并同步 Orchestrator
 * @mod mod-engine
 */

import { useGlobalStore } from '@/core/global-store'
import { useCharacterStore } from '@/mods/mod-character'
import { useHistoryDynamicsStore } from '@/mods/mod-history-dynamics'
import { useWorldStore } from '@/mods/mod-world'
import { buildOrchestratorWorldSetting } from '@/mods/mod-engine/helpers/orchestrator-world-setting'

import { orchestrator } from '../engine-api'
import { clearPreGenQueue } from './pre-gen-queue'
import { useEngineStore } from '../store'

function serializeStoreSnapshot<T extends object>(state: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>
}

/** 从存档数据恢复游戏状态（engine / character / world / historyDynamics） */
export function applyGameSave(data: Record<string, unknown>): void {
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

  if (data.historyDynamics && typeof data.historyDynamics === 'object') {
    useHistoryDynamicsStore.setState(data.historyDynamics as ReturnType<typeof useHistoryDynamicsStore.getState>)
  }

  restoreOrchestratorContext()
  clearPreGenQueue()
  useGlobalStore.getState().setGamePhase('simulation')
}

/** 收集当前可持久化快照（供手动/自动存档） */
export function collectGameSavePayload(): Record<string, unknown> {
  return {
    engine: serializeStoreSnapshot(useEngineStore.getState()),
    character: serializeStoreSnapshot(useCharacterStore.getState()),
    world: serializeStoreSnapshot(useWorldStore.getState()),
    historyDynamics: serializeStoreSnapshot(useHistoryDynamicsStore.getState()),
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
