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

/** 后台静默 AI 初始化（不阻塞 UI） */
export function startBackgroundWorldInit(
  config: WorldConfig,
  worldCode: number,
  startingYear?: number,
): void {
  void generateWorldInitBundle(config, worldCode, startingYear).catch((err) => {
    console.warn('[mod-world] 后台世界 AI 初始化失败', err)
  })
}

/** 后台填充指定时间线阶段（游戏内滑动窗口扩展） */
export function startTimelineStageBackground(
  config: WorldConfig,
  worldCode: number,
  stageIndex: number,
): void {
  const { customKey } = useSettingsStore.getState()
  const { eraStartYear } = useWorldStore.getState()
  if (!customKey) return

  const timelineSystem = new WorldTimelineSystem()
  timelineSystem.init(
    worldCode,
    worldCode,
    config.essenceTag,
    config.name,
    config.description,
    eraStartYear || undefined,
  )
  const timelineSystemPrompt = worldTimelinePrompt.systemPrompt
  const stageBudgets = buildWorldInitPipelineBudgets(config.description.length)
  timelineSystem.setAIService(
    createWorldInitAIService(
      WORLD_AI_CONFIG,
      timelineSystemPrompt,
      stageBudgets.timeline,
      'world-init/pipeline:timeline-fill',
      buildWorldInitContentLogMetaResolver('timeline', {
        worldDescription: config.description,
        worldType: config.worldType,
      }),
      { subPool: 'tl', worldCode },
      worldTimelinePrompt.outputSchema,
    ),
  )
  void timelineSystem.fillStageWithAI(stageIndex).catch((err) => {
    console.warn(`[mod-world] 时间线阶段 ${stageIndex} 后台填充失败`, err)
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
