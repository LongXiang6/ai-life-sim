/**
 * @module world-init-bundle.ts
 * @description 世界初始化统一调度 —— 本地快照 + 后台 Pipeline AI（校准/标签/参数/实体）
 * @mod mod-world
 */

import type { AIModelConfig } from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from './store'
import {
  formatWorldTagsText,
  buildDefaultCalibration,
  buildWorldCoherenceHint,
  applyCoherenceToWorldConfig,
  shouldSkipEntityAIGeneration,
  WorldInitSystem,
  WorldEntitySystem,
} from './world-init-bundle-deps'
import type { WorldConfig, WorldSnapshot } from './types'
import {
  createWorldInitPipelineContext,
  injectWorldInitOrchestratorContext,
  runWorldInitPipeline,
  syncEntitiesToMapMarkers,
} from './utils/world-init-pipeline'
import { buildWorldInitPipelineBudgets } from './utils/world-init-budgets'
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
    result.entitiesGenerated,
  ].filter(Boolean).length
  console.info(
    `[mod-world] 世界 "${config.name}" AI 初始化完成: ${successCount}/4 成功` +
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
