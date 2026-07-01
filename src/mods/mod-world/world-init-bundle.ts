/**
 * @module world-init-bundle.ts
 * @description 世界初始化统一调度 —— 本地快照 + 后台 Pipeline AI（校准/标签/参数/时间线/实体）
 * @mod mod-world
 */

import type { AIModelConfig } from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from './store'
import {
  formatWorldTagsText,
  worldTimelinePrompt,
  buildDefaultCalibration,
  buildWorldCoherenceHint,
  applyCoherenceToWorldConfig,
  shouldSkipEntityAIGeneration,
  WorldInitSystem,
  WorldEntitySystem,
  WorldTimelineSystem,
} from './world-init-bundle-deps'
import type { WorldConfig, WorldSnapshot } from './types'
import {
  createWorldInitAIService,
  createWorldInitPipelineContext,
  injectWorldInitOrchestratorContext,
  runWorldInitPipeline,
  syncEntitiesToMapMarkers,
} from './utils/world-init-pipeline'
import { buildWorldInitPipelineBudgets } from './utils/world-init-budgets'
import { buildWorldInitContentLogMetaResolver } from './utils/world-init-ai-validation'
import { isWorldInitAIAvailable } from './utils/world-init-fallback'
import { resolvePipelineAnchorYear } from './utils/world-init-anchor-year'

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
  config: WorldConfig
  snapshot: WorldSnapshot
  worldCode: number
  formattedTags: string
}

export interface WorldInitBundleResult {
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  timelineGenerated: boolean
  entitiesGenerated: boolean
  errors: string[]
  rawTags?: string[]
}

/**
 * 同步提交世界初始化（本地数学地图 + 降级实体 + 时间线骨架）
 * 实体 AI 生成由后台 Pipeline 负责，此处仅本地降级集（不调用 API）
 */
export async function commitWorldInitialization(
  config: WorldConfig,
  existingWorldCode?: number,
  startingYear?: number,
): Promise<WorldCommitResult> {
  const store = useWorldStore.getState()
  const worldCode = existingWorldCode ?? store.generateAndSetWorldCode()
  if (existingWorldCode) {
    store.setWorldCode(existingWorldCode)
  }

  const resolvedConfig = applyCoherenceToWorldConfig(config)
  store.setCalibration(buildDefaultCalibration(resolvedConfig))
  store.setWorldTags([])

  const worldInit = new WorldInitSystem()
  const snapshot = worldInit.initialize(resolvedConfig)

  store.setWorldConfig(resolvedConfig)
  store.setInitialized(true)

  const anchorYear = resolvePipelineAnchorYear(resolvedConfig, startingYear)
  store.setEraStartYear(anchorYear)
  // 纪元名称同步到 world store
  if (resolvedConfig.eraName) store.setEraName(resolvedConfig.eraName)

  const entitySystem = new WorldEntitySystem()
  entitySystem.setRegions(snapshot.regions)
  const syncCoherence = buildWorldCoherenceHint(resolvedConfig.civilizationStage, resolvedConfig.description)
  entitySystem.setWorldContext(
    resolvedConfig.name,
    resolvedConfig.description,
    resolvedConfig.civilizationStage,
    syncCoherence,
    '',
    resolvedConfig.worldType ?? 'idealist',
  )
  const defaultCal = buildDefaultCalibration(resolvedConfig)
  const entities = shouldSkipEntityAIGeneration(defaultCal) || isWorldInitAIAvailable()
    ? []
    : await entitySystem.generateEntities(resolvedConfig)
  store.setEntities(entities)
  // 同步定居点为地图标记
  syncEntitiesToMapMarkers(entities)

  const timelineSystem = new WorldTimelineSystem()
  timelineSystem.init(
    worldCode,
    worldCode,
    resolvedConfig.essenceTag,
    resolvedConfig.name,
    resolvedConfig.description,
    anchorYear,
    resolvedConfig.civilizationStage,
    syncCoherence,
  )

  const formattedTags = formatWorldTagsText(snapshot.tags)

  console.info(
    `[mod-world] 世界 "${config.name}" 本地初始化完成（编码 ${worldCode}，区域 ${snapshot.regions.length}，实体 ${entities.length}）`,
  )

  return { config: resolvedConfig, snapshot, worldCode, formattedTags }
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
      timelineGenerated: false,
      entitiesGenerated: false,
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

  // 缓存已初始化的 timelineSystem 实例，供后续 startTimelineStageBackground 复用
  if (ctx.timelineSystem) {
    cacheTimelineSystem(worldCode, ctx.timelineSystem)
  }

  await injectWorldInitOrchestratorContext(config, result.rawTags)

  const successCount = [
    result.calibrationGenerated, result.tagsGenerated, result.configGenerated,
    result.timelineGenerated, result.entitiesGenerated,
  ].filter(Boolean).length
  console.info(
    `[mod-world] 世界 "${config.name}" AI 初始化完成: ${successCount}/5 成功` +
    (result.errors.length > 0 ? `，${result.errors.length} 项失败` : ''),
  )
  if (result.errors.length > 0) {
    console.warn('[mod-world] 世界 AI 初始化部分失败', result.errors)
  }

  return result
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

// ========== WorldTimelineSystem 实例缓存（避免重复 init） ==========

const _TIMELINE_SYSTEM_CACHE = new Map<number, WorldTimelineSystem>()
const _TIMELINE_SYSTEM_MAX_CACHE = 3

/** pipeline 完成时将已初始化的 timelineSystem 实例缓存 */
function cacheTimelineSystem(worldCode: number, system: WorldTimelineSystem): void {
  if (_TIMELINE_SYSTEM_CACHE.has(worldCode)) return
  // LRU：超出上限时删除最早条目
  if (_TIMELINE_SYSTEM_CACHE.size >= _TIMELINE_SYSTEM_MAX_CACHE) {
    const oldestKey = _TIMELINE_SYSTEM_CACHE.keys().next().value
    if (oldestKey !== undefined) _TIMELINE_SYSTEM_CACHE.delete(oldestKey)
  }
  _TIMELINE_SYSTEM_CACHE.set(worldCode, system)
}

/** 获取或创建 WorldTimelineSystem 实例。优先取缓存，缓存未命中时调用 factory */
function getOrCreateTimelineSystem(
  worldCode: number,
  factory: () => WorldTimelineSystem,
): WorldTimelineSystem {
  const cached = _TIMELINE_SYSTEM_CACHE.get(worldCode)
  if (cached) return cached
  const system = factory()
  _TIMELINE_SYSTEM_CACHE.set(worldCode, system)
  return system
}

/** 后台静默 AI 初始化（不阻塞 UI） */
export function startBackgroundWorldInit(
  config: WorldConfig,
  worldCode: number,
  startingYear?: number,
): void {
  const lockKey = `init:${worldCode}`
  if (!tryAcquireFillLock(lockKey)) return

  void generateWorldInitBundle(config, worldCode, startingYear).catch((err) => {
    console.warn('[mod-world] 后台世界 AI 初始化失败', err)
  }).finally(() => {
    releaseFillLock(lockKey)
  })
}

/** 后台填充指定时间线阶段（游戏内滑动窗口扩展） */
export function startTimelineStageBackground(
  config: WorldConfig,
  worldCode: number,
  stageIndex: number,
): void {
  const lockKey = `tl:${worldCode}:stage${stageIndex}`
  if (!tryAcquireFillLock(lockKey)) return

  const { customKey } = useSettingsStore.getState()
  const { eraStartYear } = useWorldStore.getState()
  if (!customKey) { releaseFillLock(lockKey); return }

  // 复用缓存实例（pipeline 已完成 init + setAIService），新实例才走 factory
  const timelineSystem = getOrCreateTimelineSystem(worldCode, () => {
    const ts = new WorldTimelineSystem()
    ts.init(
      worldCode,
      worldCode,
      config.essenceTag,
      config.name,
      config.description,
      eraStartYear || undefined,
    )
    ts.setAIService(
      createWorldInitAIService(
        WORLD_AI_CONFIG,
        worldTimelinePrompt.systemPrompt,
        buildWorldInitPipelineBudgets(config.description.length).timeline,
        'world-init/pipeline:timeline-fill',
        buildWorldInitContentLogMetaResolver('timeline', {
          worldDescription: config.description,
          worldType: config.worldType,
        }),
        { subPool: 'tl', worldCode },
        worldTimelinePrompt.outputSchema,
      ),
    )
    return ts
  })

  void timelineSystem.fillStageWithAI(stageIndex).catch((err) => {
    console.warn(`[mod-world] 时间线阶段 ${stageIndex} 后台填充失败`, err)
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
