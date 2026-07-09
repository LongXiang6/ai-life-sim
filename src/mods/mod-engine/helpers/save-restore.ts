/**
 * @module save-restore.ts
 * @description 存档加载 —— 将 OPFS 快照写回各 Store 并同步 Orchestrator
 * @mod mod-engine
 */

import { useGlobalStore } from '@/core/global-store'
import { saveManager } from '@/core/storage/save-manager'
import { useCharacterStore } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { buildDefaultCalibration, formatCalibrationSummary } from '@/mods/mod-world'
import { buildOrchestratorWorldSetting } from '@/mods/mod-engine/helpers/orchestrator-world-setting'

import { orchestrator } from '../subsystems/orchestrator-system'
import { clearPreGenQueue } from './pre-gen-queue'
import { syncSubsystemStoresFromStates } from './subsystem-store-sync'
import { useEngineStore } from '../store'

function serializeStoreSnapshot<T extends object>(state: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>
}

function buildEngineSaveSnapshot(): Record<string, unknown> {
  const store = useEngineStore.getState()
  const o = orchestrator.getState()

  const resolvedChoiceMap = new Map<string, string>()
  for (const entry of store.narrativeHistory) {
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

  return serializeStoreSnapshot({
    ...store,
    ...o,
    narrativeHistory: mergedHistory,
    streamingNarrative: '',
    narrativeError: null,
    resolvedBranches: store.resolvedBranches,
    forceBranchNext: store.forceBranchNext,
  })
}

/**
 * 从存档数据恢复游戏状态（engine / character / world / core MOD stores / orchestrator）。
 *
 * 原子性保证：
 *   - 核心 store（engine / character / world）任一恢复失败即抛出，且**不切换 gamePhase**，
 *     避免进入「半恢复 + 停留在错误界面」的损坏态；调用方应 catch 并提示用户、留在安全页。
 *   - 可选 store（orchestrator）坏数据仅记录告警并跳过，不阻断整体加载。
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

  if (data.orchestrator && typeof data.orchestrator === 'object') {
    restoreOptional('orchestrator', () => {
      orchestrator.restoreSnapshot(data.orchestrator as Parameters<typeof orchestrator.restoreSnapshot>[0])
      syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())
    })
  }

  restoreOptional('orchestratorContext', ensureOrchestratorContextFromStores)
  clearPreGenQueue()
  // 只有核心恢复成功（未抛出）才进入模拟态
  useGlobalStore.getState().setGamePhase('simulation')
}

/** 收集当前可持久化快照（供手动/自动存档）。
 * 自动保存调用点位于 hooks.ts advanceRound 中 executeRoundV2 之后、
 * fillPreGenQueue 之前，因此快照中不包含未消费的预生成缓存。 */
export function collectGameSavePayload(): Record<string, unknown> {
  syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())

  return {
    engine: buildEngineSaveSnapshot(),
    character: serializeStoreSnapshot(useCharacterStore.getState()),
    world: serializeStoreSnapshot(useWorldStore.getState()),
    orchestrator: serializeStoreSnapshot(orchestrator.captureSnapshot()),
  }
}

/** 手动存档公开入口；调用方只传 UI 输入，存档载荷由引擎统一收集。 */
export async function saveCurrentGameToSlot(
  slot: number,
  name: string,
  worldName: string,
  characterName: string,
): Promise<void> {
  await saveManager.saveToSlot(slot, name, worldName, characterName, collectGameSavePayload())
}

/**
 * 从已持久化的 world / character store 重新注入 orchestrator 上下文。
 *
 * 用途：
 * - applyGameSave() 恢复存档后同步上下文；
 * - 刷新或直达 game-story 后，推进前补齐 orchestrator 单例中不会随 Zustand 自动恢复的运行态。
 *
 * 返回 false 表示世界配置尚未就绪，调用方可继续走页面守卫或错误提示。
 */
export function ensureOrchestratorContextFromStores(): boolean {
  const worldState = useWorldStore.getState()
  const worldConfig = worldState.worldConfig
  const character = useCharacterStore.getState()

  if (!worldConfig) return false

  const calibration = worldState.calibration ?? buildDefaultCalibration(worldConfig)
  const worldTagsText = worldState.worldTags.length > 0
    ? worldState.worldTags.join('、')
    : undefined

  const worldSetting = buildOrchestratorWorldSetting(worldConfig, {
    eraStartYear: worldState.eraStartYear || undefined,
    eraName: worldState.eraName || undefined,
    extraConfig: {
      ...(worldTagsText ? { _worldTagsText: worldTagsText } : {}),
      _calibration: calibration,
      _calibrationSummary: formatCalibrationSummary(calibration),
      _economyModifier: calibration.formulas?.economyModifier ?? 1.0,
      ...(worldConfig.aiDetailedParameters
        ? { _aiDetailedParameters: worldConfig.aiDetailedParameters }
        : {}),
    },
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
  return true
}
