/**
 * @module save-restore.ts
 * @description 存档加载 —— 将 OPFS 快照写回各 Store 并同步 Orchestrator
 * @mod mod-engine
 */

import { useGlobalStore } from '@/core/global-store'
import { runtimeRegistry } from '@/core/mod-loader/runtime-registry'
import { saveManager } from '@/core/storage/save-manager'
import { sanitizeCharacterStateSnapshot, useCharacterStore } from '@/mods/mod-character'
import { sanitizeWorldStateSnapshot, useWorldStore } from '@/mods/mod-world'
import { buildDefaultCalibration, formatCalibrationSummary } from '@/mods/mod-world'
import { buildOrchestratorWorldSetting } from '@/mods/mod-engine/helpers/orchestrator-world-setting'

import { orchestrator } from '../subsystems/orchestrator-system'
import { resolveMvpRuntimeReadiness } from './mvp-runtime-policy'
import { clearPreGenQueue, getPreGenQueueStatus } from './pre-gen-queue'
import { syncSubsystemStoresFromStates } from './subsystem-store-sync'
import { useEngineStore } from '../store'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPreGenIdle(action: string): void {
  if (getPreGenQueueStatus().isActive) {
    throw new Error(`下一段故事仍在后台准备，暂时不能${action}。请等待准备完成后重试。`)
  }
}

function assertCompressionIdle(action: string): void {
  if (orchestrator.isBackgroundCompressionActive()) {
    throw new Error(`上一轮记忆仍在整理，暂时不能${action}。请等待整理完成后重试。`)
  }
}

function assertRuntimeReady(action: string): void {
  const readiness = resolveMvpRuntimeReadiness({
    allModsLoaded: useGlobalStore.getState().allModsLoaded,
    runtimeRegistryFrozen: runtimeRegistry.isFrozen(),
    registeredIds: orchestrator.getSubsystemBindings().map(({ id }) => id),
  })
  if (!readiness.loaderReady) {
    throw new Error(`核心模拟系统仍在初始化，暂时不能${action}。请稍候重试。`)
  }

  if (readiness.missingSubsystems.length > 0) {
    console.error(`[save-restore] ${action}前发现核心子系统未注册:`, readiness.missingSubsystems)
    throw new Error(`核心模拟系统未完整加载，暂时不能${action}。请刷新页面后重试。`)
  }
}

function assertCoreSavePayload(data: Record<string, unknown>): {
  engine: Record<string, unknown>
  character: Record<string, unknown>
  world: Record<string, unknown>
} {
  const invalid = ['engine', 'character', 'world'].filter((key) => !isPlainRecord(data[key]))
  if (invalid.length > 0) {
    throw new Error(`存档缺少有效核心状态：${invalid.join('、')}，已中止恢复。`)
  }

  const engine = data.engine as Record<string, unknown>
  const character = data.character as Record<string, unknown>
  const world = data.world as Record<string, unknown>
  if (!isPlainRecord(world.worldConfig)) {
    throw new Error('存档中的世界配置无效，已中止恢复。')
  }

  return { engine, character, world }
}

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
  assertRuntimeReady('加载存档')
  assertPreGenIdle('加载存档')
  assertCompressionIdle('加载存档')
  const core = assertCoreSavePayload(data)
  const migratedCharacter = sanitizeCharacterStateSnapshot(core.character)
  const migratedWorld = sanitizeWorldStateSnapshot(core.world)
  const savedTerminal = core.engine.status === 'complete'
  const previous = {
    engine: useEngineStore.getState(),
    character: useCharacterStore.getState(),
    world: useWorldStore.getState(),
    orchestrator: orchestrator.captureSnapshot(),
  }
  let restoredOrchestratorSnapshot = false
  try {
    // —— 核心 store：失败即回滚，gamePhase 保持不变 ——
    const engine = core.engine as Partial<ReturnType<typeof useEngineStore.getState>>
    useEngineStore.setState((prev) => ({
      ...prev,
      ...engine,
      streamingNarrative: '',
      narrativeError: null,
      resolvedBranches: engine.resolvedBranches ?? prev.resolvedBranches ?? {},
      forceBranchNext: engine.forceBranchNext ?? false,
      status: savedTerminal ? 'complete' : 'idle',
    }))
    useCharacterStore.setState(migratedCharacter as unknown as ReturnType<typeof useCharacterStore.getState>)
    useWorldStore.setState(migratedWorld as unknown as ReturnType<typeof useWorldStore.getState>)
    orchestrator.hydrateFromEngineStore()

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
        restoredOrchestratorSnapshot = true
        syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())
      })
    }

    if (!restoredOrchestratorSnapshot) {
      // restoreSnapshot() 在发现坏快照前可能已部分改写单例内部字段；
      // 必须从刚恢复的 EngineStore 完整重建，而不只是重灌子系统私有状态。
      orchestrator.hydrateFromEngineStore()
    }

    if (savedTerminal) {
      orchestrator.stop()
      useEngineStore.setState({ status: 'complete' })
    }

    if (!ensureOrchestratorContextFromStores()) {
      throw new Error('存档中的世界上下文无法恢复，已中止进入模拟。')
    }
    clearPreGenQueue()
    // 只有核心恢复成功（未抛出）才进入模拟态
    useGlobalStore.getState().setGamePhase('simulation')
  } catch (error) {
    try {
      useCharacterStore.setState(previous.character, true)
      useWorldStore.setState(previous.world, true)
      orchestrator.restoreSnapshot(previous.orchestrator)
      useEngineStore.setState(previous.engine, true)
      ensureOrchestratorContextFromStores()
    } catch (rollbackError) {
      console.error('[applyGameSave] 核心状态回滚失败:', rollbackError)
    }
    throw error
  }
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
  assertRuntimeReady('手动存档')
  assertPreGenIdle('手动存档')
  assertCompressionIdle('手动存档')
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
