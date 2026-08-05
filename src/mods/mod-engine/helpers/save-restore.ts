/**
 * Purpose: Collect and atomically import persistent game state for save slots.
 * Owner: mod-engine
 * Responsibility: Persistence validation and store synchronization only; runtime round rollback is out of scope.
 *
 * @module save-restore.ts
 * @description 存档加载 —— 将 OPFS 持久化状态写回各 Store 并同步 Orchestrator
 * @mod mod-engine
 */

import { useGlobalStore } from '@/core/global-store'
import { runtimeRegistry } from '@/core/mod-loader/runtime-registry'
import { saveManager } from '@/core/storage/save-manager'
import { sanitizeCharacterStateSnapshot, useCharacterStore } from '@/mods/mod-character'
import {
  buildDefaultCalibration,
  formatCalibrationSummary,
  registerWorldEntityReference,
  repairWorldEntityReferenceDirectory,
  sanitizeWorldStateSnapshot,
  useWorldStore,
} from '@/mods/mod-world/world-runtime-api'
import { buildOrchestratorWorldSetting } from '@/mods/mod-engine/helpers/orchestrator-world-setting'

import { orchestrator } from '../subsystems/orchestrator-system'
import { resolveMvpRuntimeReadiness } from './mvp-runtime-policy'
import {
  cancelPreGenQueue,
  clearPreGenQueue,
  isPreGenQueueRunning,
} from './pre-gen-queue'
import { syncSubsystemStoresFromStates } from './subsystem-store-sync'
import { useEngineStore } from '../store'
import {
  createNarrativeLifeRunId,
  summarizeNarrativeHistoryRepetition,
} from './narrative-repetition-metrics'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPreGenIdle(action: string): void {
  if (isPreGenQueueRunning()) {
    throw new Error(`下一段故事的后台清理尚未完成，暂时不能${action}。`)
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

function serializeStoreState<T extends object>(state: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>
}

function buildWorldSavePayload(): Record<string, unknown> {
  const {
    entityReferences: _ownedByWorldEntitySystem,
    ...world
  } = serializeStoreState(useWorldStore.getState())
  return world
}

function buildCharacterSavePayload(): Record<string, unknown> {
  const character = serializeStoreState(useCharacterStore.getState())
  delete character.lifespanDraft
  delete character.health
  delete character.lifespan
  delete character.lifecycle
  return character
}

function buildEngineSavePayload(): Record<string, unknown> {
  const store = useEngineStore.getState()
  const o = orchestrator.getState()

  const resolvedChoiceMap = new Map<string, { choice: string; round?: number }>()
  for (const entry of store.narrativeHistory) {
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

  return serializeStoreState({
    ...store,
    ...o,
    narrativeHistory: mergedHistory,
    narrativeError: null,
    resolvedBranches: store.resolvedBranches,
    forceBranchNext: store.forceBranchNext,
  })
}

/**
 * 从存档数据恢复游戏状态（engine / character / world / core MOD stores / orchestrator）。
 *
 * 存档加载直接写入各自状态所有者；失败时只恢复进入加载函数前的持久化状态，
 * 不调用任何运行时预览或回合回退入口。
 */
export async function applyGameSave(data: Record<string, unknown>): Promise<void> {
  assertRuntimeReady('加载存档')
  const core = assertCoreSavePayload(data)
  const migratedCharacter = sanitizeCharacterStateSnapshot(core.character)
  const migratedWorld = sanitizeWorldStateSnapshot(core.world)
  await cancelPreGenQueue()
  await orchestrator.waitForBackgroundCompression()
  assertPreGenIdle('加载存档')
  assertCompressionIdle('加载存档')
  const savedTerminal = core.engine.status === 'complete'
  const previous = {
    engine: useEngineStore.getState(),
    character: useCharacterStore.getState(),
    world: useWorldStore.getState(),
    orchestrator: orchestrator.exportPersistenceState(),
    gamePhase: useGlobalStore.getState().gamePhase,
  }
  orchestrator.invalidatePendingLifeOperations()
  try {
  const engine = core.engine as Partial<ReturnType<typeof useEngineStore.getState>>
  const restoredLifeRunId = typeof engine.lifeRunId === 'string' && engine.lifeRunId.trim()
    ? engine.lifeRunId
    : createNarrativeLifeRunId()
  const restoredRepetitionStats = summarizeNarrativeHistoryRepetition(
    Array.isArray(engine.narrativeHistory) ? engine.narrativeHistory : [],
  )
  useEngineStore.setState((prev) => ({
      ...prev,
      ...engine,
      lifeRunId: restoredLifeRunId,
      storyRepetitionStats: restoredRepetitionStats,
      narrativeError: null,
      resolvedBranches: engine.resolvedBranches ?? {},
      forceBranchNext: engine.forceBranchNext ?? false,
      status: savedTerminal ? 'complete' : 'idle',
  }))
  useCharacterStore.setState(migratedCharacter as unknown as ReturnType<typeof useCharacterStore.getState>)
  useWorldStore.setState(migratedWorld as unknown as ReturnType<typeof useWorldStore.getState>)
  const restoredWorld = useWorldStore.getState()
  if (!restoredWorld.currentContextId || !restoredWorld.contexts[restoredWorld.currentContextId]) {
    throw new Error('存档中的世界上下文注册表无效，已中止恢复。')
  }
  orchestrator.hydrateFromEngineStore()

  if (data.orchestrator && typeof data.orchestrator === 'object') {
    const savedContextId = (data.orchestrator as { worldContextId?: unknown }).worldContextId
    if (
      typeof savedContextId === 'string'
      && savedContextId !== restoredWorld.currentContextId
    ) {
      throw new Error('存档中的世界上下文与编排器持久化状态不一致，已中止恢复。')
    }
    orchestrator.importPersistenceState(
      data.orchestrator as Parameters<typeof orchestrator.importPersistenceState>[0],
    )
    syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())
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
      useEngineStore.setState(previous.engine, true)
      useCharacterStore.setState(previous.character, true)
      useWorldStore.setState(previous.world, true)
      orchestrator.importPersistenceState(previous.orchestrator)
      syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())
      ensureOrchestratorContextFromStores()
      useGlobalStore.getState().setGamePhase(previous.gamePhase)
    } catch (restoreError) {
      console.error('[applyGameSave] 持久化状态恢复失败:', restoreError)
    }
    throw error
  }
}

/** 收集当前可持久化状态（供手动/自动存档）。
 * 自动保存调用点位于 hooks.ts advanceRound 中 executeRoundV2 之后、
 * fillPreGenQueue 之前，因此载荷中不包含未消费的预生成缓存。 */
export function collectGameSavePayload(): Record<string, unknown> {
  ensureOrchestratorContextFromStores()
  syncSubsystemStoresFromStates(orchestrator.getSubsystemStateSnapshot())

  return {
    engine: buildEngineSavePayload(),
    character: buildCharacterSavePayload(),
    world: buildWorldSavePayload(),
    orchestrator: serializeStoreState(orchestrator.exportPersistenceState()),
  }
}

/** 手动存档先取消派生预生成并等待后台提交，再从唯一引擎边界收集载荷。 */
export async function collectManualGameSavePayload(): Promise<Record<string, unknown>> {
  assertRuntimeReady('手动存档')
  await cancelPreGenQueue()
  await orchestrator.waitForBackgroundCompression()
  assertPreGenIdle('手动存档')
  assertCompressionIdle('手动存档')
  return collectGameSavePayload()
}

/** 手动存档公开入口；调用方只传 UI 输入，存档载荷由引擎统一收集。 */
export async function saveCurrentGameToSlot(
  slot: number,
  name: string,
  worldName: string,
  characterName: string,
): Promise<void> {
  const payload = await collectManualGameSavePayload()
  await saveManager.saveToSlot(slot, name, worldName, characterName, payload)
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

  if (!worldConfig || !worldState.currentContextId || !worldState.contexts[worldState.currentContextId]) return false
  if (character.worldCode !== worldState.worldCode) {
    character.setWorldCode(worldState.worldCode)
  }

  const calibration = worldState.calibration ?? buildDefaultCalibration(worldConfig)
  const characterId = character.characterId || character.ensureCharacterId()
  const currentInstance = worldState.contexts[worldState.currentContextId]
  // 刷新后仅剩空间端点时先恢复实体目录；尤其要在玩家登记前修复旧版
  // 把 character_* 误标为 NPC 的条目，否则严格种类契约会阻断当前角色注入。
  const directoryRepair = repairWorldEntityReferenceDirectory()
  registerWorldEntityReference({
    entityId: characterId,
    kind: 'player',
    displayName: character.name || '未命名',
    contextIds: [currentInstance.record.id],
    registeredAtTotalDays: useEngineStore.getState().round.totalDays,
  })
  if (!currentInstance.spatialGraph.entityLocations[characterId]) {
    worldState.replaceContext({
      ...currentInstance,
      spatialGraph: {
        ...currentInstance.spatialGraph,
        entityLocations: {
          ...currentInstance.spatialGraph.entityLocations,
          [characterId]: {
            entityId: characterId,
            contextId: currentInstance.record.id,
            nodeId: currentInstance.record.rootSpatialNodeId,
            updatedAtGlobalDay: useEngineStore.getState().round.totalDays,
          },
        },
      },
    })
  }
  if (directoryRepair.fallbackEntityIds.length > 0) {
    console.warn('[save-restore] 从空间图恢复了缺失的实体引用目录项:', directoryRepair.fallbackEntityIds)
  }
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
    characterId,
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
