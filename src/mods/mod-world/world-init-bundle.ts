/**
 * @module world-init-bundle.ts
 * @description 世界初始化统一调度 —— 本地快照 + 后台 Pipeline AI（校准/标签/参数/实体）
 * @mod mod-world
 */

import type {
  AIModelConfig,
  ContextCapability,
  LocalCalendarProfile,
  SimulationScope,
  WorldContextKind,
} from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings'
import { generateWorldCode, useWorldStore } from './store'
import {
  formatWorldTagsText,
  buildDefaultCalibration,
  buildWorldCoherenceHint,
  applyCoherenceToWorldConfig,
  shouldSkipEntityAIGeneration,
  WorldInitSystem,
  getWorldEntitySystem,
} from './world-init-bundle-deps'
import type { WorldConfig, WorldInitAIStatus, WorldSnapshot } from './types'
import {
  buildFallbackWorldScoringProfile,
  isCompleteWorldScoringProfile,
} from './scoring-profile'
import { generateWorldScoringProfile } from './world-scoring-profile-generation'
import {
  createWorldInitPipelineContext,
  injectWorldInitOrchestratorContext,
  runWorldInitPipeline,
  syncEntitiesToMapMarkers,
} from './utils/world-init-pipeline'
import { buildWorldInitPipelineBudgets } from './utils/world-init-budgets'
import { isWorldInitAIAvailable } from './utils/world-init-fallback'
import { resolvePipelineAnchorYear } from './utils/world-init-anchor-year'
import {
  buildWorldContextInstance,
  contextKindUsesRegionMap,
  createCrossContextExit,
  createWorldContextId,
  inferContextKind,
  normalizeConfirmedCapabilities,
} from './utils/world-context-runtime'
import { getWorldContextRegistrySystem } from './subsystems/world-context-registry-system'
import { getSpatialGraphSystem } from './subsystems/spatial-graph-system'

const DEFAULT_WORLD_AI_BUDGETS = buildWorldInitPipelineBudgets(0)

const WORLD_AI_CONFIG: AIModelConfig = {
  model: 'deepseek-v4-flash',
  temperature: 0.3,
  maxTokens: DEFAULT_WORLD_AI_BUDGETS.entities,
  responseFormat: { type: 'json_object' },
  reasoningEffort: 'disabled',
  stream: false,
}

export interface WorldCommitResult {
  contextId: string
  config: WorldConfig
  snapshot: WorldSnapshot
  worldCode: number
  formattedTags: string
}

export interface WorldInitBundleResult {
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  entitiesGenerated: boolean
  scoringProfileGenerated: boolean
  errors: string[]
  rawTags?: string[]
}

export interface WorldContextCreationOptions {
  contextId?: string
  parentContextId?: string
  contextKind?: WorldContextKind
  localCalendar?: LocalCalendarProfile
  capabilities?: ContextCapability[]
  makeActive?: boolean
  connectFromCurrent?: boolean
  initialScope?: Exclude<SimulationScope, 'closed'>
  globalTotalDays?: number
}

export interface AdditionalWorldContextOptions extends WorldContextCreationOptions {
  worldCode?: number
  startingYear?: number
}

function resolveCreationGlobalTotalDays(
  requestedGlobalTotalDays: number | undefined,
  contexts: ReturnType<typeof useWorldStore.getState>['contexts'],
): number {
  if (requestedGlobalTotalDays !== undefined) {
    if (!Number.isFinite(requestedGlobalTotalDays) || requestedGlobalTotalDays < 0) {
      throw new Error('创建上下文的 globalTotalDays 必须为非负有限数')
    }
    return requestedGlobalTotalDays
  }

  if (Object.keys(contexts).length === 0) return 0
  throw new Error('已有上下文时必须由唯一 TimeSystem 显式提供 globalTotalDays')
}

/**
 * 同步提交世界初始化（本地数学地图 + 降级实体 + 时间线骨架）
 * 实体 AI 生成由后台 Pipeline 负责，此处仅本地降级集（不调用 API）
 */
export async function commitWorldInitialization(
  config: WorldConfig,
  existingWorldCode?: number,
  startingYear?: number,
  options?: WorldContextCreationOptions,
): Promise<WorldCommitResult> {
  const store = useWorldStore.getState()
  const worldCode = existingWorldCode ?? generateWorldCode()
  const makeActive = options?.makeActive ?? true
  const reusableCurrentContextId = makeActive
    && store.currentContextId
    && store.contexts[store.currentContextId]?.worldCode === worldCode
    ? store.currentContextId
    : undefined
  const contextId = createWorldContextId({
    contextId: options?.contextId ?? reusableCurrentContextId ?? undefined,
  })
  const previousContextId = store.currentContextId
  const previousInstance = store.contexts[contextId]
  const coherentConfig = applyCoherenceToWorldConfig(config)
  const resolvedConfig = isCompleteWorldScoringProfile(coherentConfig.scoringProfile)
    && coherentConfig.scoringProfile.worldId === contextId
    ? coherentConfig
    : {
        ...coherentConfig,
        scoringProfile: buildFallbackWorldScoringProfile(coherentConfig, contextId),
        _scoringProfileSource: 'fallback' as const,
      }
  const parentContextId = options?.parentContextId ?? previousInstance?.record.parentContextId
  const contextKind = options?.contextKind ?? previousInstance?.record.kind ?? inferContextKind(resolvedConfig)
  const localCalendar = options?.localCalendar ?? previousInstance?.record.localCalendar
  let capabilities: ContextCapability[] | undefined
  if (options?.capabilities !== undefined) {
    capabilities = normalizeConfirmedCapabilities(options.capabilities)
  } else if (previousInstance?.capabilityProfile.derivedFrom === 'confirmed-facts') {
    capabilities = normalizeConfirmedCapabilities(previousInstance.capabilityProfile.capabilities)
  }

  const registry = getWorldContextRegistrySystem()
  registry.validateContextParent(contextId, parentContextId)
  const globalTotalDays = resolveCreationGlobalTotalDays(options?.globalTotalDays, store.contexts)

  const defaultCalibration = buildDefaultCalibration(resolvedConfig)

  const worldInit = new WorldInitSystem()
  const snapshot = worldInit.initialize(resolvedConfig, {
    contextId,
    contextKind,
    worldCode,
    calibration: defaultCalibration,
  })
  const anchorYear = resolvePipelineAnchorYear(resolvedConfig, startingYear)
  const initStatus: WorldInitAIStatus = {
    status: 'complete',
    currentStep: '本地初始化完成',
    calibrationGenerated: true,
    tagsGenerated: true,
    configGenerated: true,
    entitiesGenerated: true,
    retryCount: 0,
    maxRetries: 0,
    errors: [],
  }
  const instance = buildWorldContextInstance({
    contextId,
    config: resolvedConfig,
    snapshot,
    worldCode,
    calibration: defaultCalibration,
    eraStartYear: anchorYear,
    eraName: resolvedConfig.eraName,
    worldInitAIStatus: initStatus,
    parentContextId,
    contextKind,
    localCalendar,
    capabilities,
    scope: makeActive ? 'active' : (options?.initialScope ?? 'dormant'),
    globalTotalDays,
  })
  registry.registerContext(instance, makeActive)

  if (options?.connectFromCurrent && previousContextId && previousContextId !== contextId) {
    const state = useWorldStore.getState()
    const source = state.contexts[previousContextId]
    const target = state.contexts[contextId]
    if (source && target) {
      getSpatialGraphSystem().addCrossContextExit(createCrossContextExit(source, target))
    }
  }

  const entitySystem = getWorldEntitySystem()
  let entities = instance.entities
  if (makeActive) {
    entitySystem.reset()
    entitySystem.setRegions(instance.regions)
    const syncCoherence = buildWorldCoherenceHint(resolvedConfig.civilizationStage, resolvedConfig.description)
    entitySystem.setWorldContext(
      resolvedConfig.name,
      resolvedConfig.description,
      resolvedConfig.civilizationStage,
      syncCoherence,
      '',
      resolvedConfig.worldType ?? 'idealist',
    )
    entities = !contextKindUsesRegionMap(contextKind)
      || shouldSkipEntityAIGeneration(defaultCalibration)
      || isWorldInitAIAvailable()
      ? []
      : await entitySystem.generateEntities(resolvedConfig)
    store.setEntities(entities)
    entities = useWorldStore.getState().entities
    syncEntitiesToMapMarkers(entities)
  }

  const formattedTags = formatWorldTagsText(snapshot.tags)

  console.info(
    `[mod-world] 世界 "${config.name}" 本地初始化完成（编码 ${worldCode}，区域 ${snapshot.regions.length}，实体 ${entities.length}）`,
  )

  const stored = useWorldStore.getState().contexts[contextId]
  const storedSnapshot: WorldSnapshot = stored
    ? {
        contextId,
        rootSpatialNodeId: stored.record.rootSpatialNodeId,
        worldConfig: structuredClone(stored.worldConfig),
        entities: structuredClone(stored.entities),
        regions: structuredClone(stored.regions),
        tags: structuredClone(stored.tags),
      }
    : { ...snapshot, entities }
  return { contextId, config: resolvedConfig, snapshot: storedSnapshot, worldCode, formattedTags }
}

/** 在当前存档中创建一个不覆盖现有世界的额外上下文。 */
export async function createAdditionalWorldContext(
  config: WorldConfig,
  options?: AdditionalWorldContextOptions,
): Promise<WorldCommitResult> {
  return commitWorldInitialization(
    config,
    options?.worldCode,
    options?.startingYear,
    {
      contextId: options?.contextId,
      parentContextId: options?.parentContextId,
      contextKind: options?.contextKind,
      localCalendar: options?.localCalendar,
      capabilities: options?.capabilities,
      connectFromCurrent: options?.connectFromCurrent ?? true,
      makeActive: options?.makeActive ?? false,
      initialScope: options?.initialScope ?? 'dormant',
      globalTotalDays: options?.globalTotalDays,
    },
  )
}

/**
 * 并行 AI 初始化（WorldInitPipeline 步骤注册表 + 重试 + 状态追踪）
 */
export async function generateWorldInitBundle(
  configInput: WorldConfig,
  worldCode: number,
  startingYear?: number,
): Promise<WorldInitBundleResult> {
  const configBeforeCoherence = configInput
  const config = applyCoherenceToWorldConfig(configInput)
  if (config !== configInput) {
    useWorldStore.getState().setWorldConfig(config)
  }

  const { customKey } = useSettingsStore.getState()
  if (!customKey) {
    console.info(`[mod-world] 跳过后台 AI 初始化（API Key 未配置）`)
    return {
      calibrationGenerated: false,
      tagsGenerated: false,
      configGenerated: false,
      entitiesGenerated: false,
      scoringProfileGenerated: false,
      errors: [],
    }
  }

  const pipelineBudgets = buildWorldInitPipelineBudgets(config.description.length)
  const anchorYear = resolvePipelineAnchorYear(config, startingYear)

  const ctx = createWorldInitPipelineContext(
    config,
    configBeforeCoherence,
    worldCode,
    WORLD_AI_CONFIG,
    pipelineBudgets,
    anchorYear,
  )

  const result = await runWorldInitPipeline(ctx)

  let scoringProfileGenerated = config._scoringProfileSource === 'ai'
  const current = useWorldStore.getState()
  const activeWorldId = current.currentContextId
    ?? current.worldConfig?.scoringProfile?.worldId
    ?? `world-${worldCode}`
  if (!scoringProfileGenerated) {
    try {
      const profile = await generateWorldScoringProfile(config, activeWorldId, worldCode)
      const latest = useWorldStore.getState()
      if (latest.worldCode === worldCode && latest.worldConfig) {
        latest.setWorldConfig({
          ...latest.worldConfig,
          scoringProfile: profile,
          _scoringProfileSource: 'ai',
        })
        scoringProfileGenerated = true
      }
    } catch (error) {
      result.errors.push(`结算维度生成失败，继续使用本地维度：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  await injectWorldInitOrchestratorContext(config, result.rawTags)

  const successCount = [
    result.calibrationGenerated, result.tagsGenerated, result.configGenerated,
    result.entitiesGenerated, scoringProfileGenerated,
  ].filter(Boolean).length
  console.info(
    `[mod-world] 世界 "${config.name}" AI 初始化完成: ${successCount}/5 成功` +
    (result.errors.length > 0 ? `，${result.errors.length} 项失败` : ''),
  )
  if (result.errors.length > 0) {
    console.warn('[mod-world] 世界 AI 初始化部分失败', result.errors)
  }

  return { ...result, scoringProfileGenerated }
}

/** 全局去重守卫：防止并发调用同一世界/阶段的 AI 填充 */
const _IN_PROGRESS_FILLS = new Set<string>()

function tryAcquireFillLock(key: string): boolean {
  if (_IN_PROGRESS_FILLS.has(key)) {
    console.info(`[mod-world] 跳过重复调用: ${key} 已在填充中`)
    return false
  }
  _IN_PROGRESS_FILLS.add(key)
  return true
}

function releaseFillLock(key: string): void {
  _IN_PROGRESS_FILLS.delete(key)
}

/** 后台静默 AI 初始化（不阻塞 UI）
 *
 * 双通道策略：
 *   1. 服务端管道 /api/world-init —— 校准+标签（2 次 AI）
 *      直连 DeepSeek，不受客户端切页面 abort 影响
 *   2. 客户端管道 generateWorldInitBundle —— 校准+标签+实体（3 步）
 *      检测到 store 已存校准缓存 → 自动跳过 step 1-2 → 实际调用 1 次
 *
 *   总计：服务端 2 + 客户端 1 = 3 次。
 *   fate-preview 页的 useWorldInitPoller 轮询服务端结果写入 store，
 *   客户端管道检测到 store 命中后跳过，避免双倍调用。
 */
export function startBackgroundWorldInit(
  config: WorldConfig,
  worldCode: number,
  startingYear?: number,
): void {
  const lockKey = `init:${worldCode}`
  if (!tryAcquireFillLock(lockKey)) return

  // ── 通道 1：服务端管道（不可被客户端切页面中断） ──
  // 仅在校准/标签未缓存时启动。若 store 已有（localStorage 命中或之前已完成），
  // 跳过服务端管道，避免重复 AI 调用、延长耗时。客户端管道会检测缓存自动跳过步1-2。
  const worldState = useWorldStore.getState()
  const needServerCalibration = !worldState.calibration || !worldState.worldTags?.length

  if (needServerCalibration) {
    const settings = useSettingsStore.getState()
    const clientApiKey = settings.customKey || undefined
    const clientBaseUrl = settings.customUrl || undefined
    const clientModel = settings.customModel || undefined

    void fetch('/api/world-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldCode,
        config,
        providerId: settings.provider,
        ...(clientApiKey ? { apiKey: clientApiKey } : {}),
        ...(clientBaseUrl ? { baseUrl: clientBaseUrl } : {}),
        ...(clientModel ? { model: clientModel } : {}),
      }),
    }).catch((err) => {
      console.warn('[mod-world] 服务端初始化请求失败（不影响客户端管道）', err)
    })
  }

  // ── 通道 2：客户端管道（实体） ──
  void generateWorldInitBundle(config, worldCode, startingYear).catch((err) => {
    console.warn('[mod-world] 后台世界 AI 初始化失败', err)
  }).finally(() => {
    releaseFillLock(lockKey)
  })
}

/** 自定义世界保存时触发（仅 AI，不切换当前游玩世界） */
export function startBackgroundWorldInitForCustom(
  config: WorldConfig,
  worldCode: number,
): void {
  const anchorYear = resolvePipelineAnchorYear(config)
  startBackgroundWorldInit(config, worldCode, anchorYear)
}
