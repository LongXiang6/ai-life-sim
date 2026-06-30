/**
 * @module world-init-pipeline.ts
 * @description 世界初始化 AI Pipeline —— 可扩展步骤注册表
 *
 * ## 默认步骤（createDefaultWorldInitSteps）— 勿拆回多步维度/校准/标签
 * 1. dimension-calibration — 单次 AI：dimensions + calibration + W02 + worldTags
 *    （world-dimension-calibration-prompt；trigger: pipeline:dimension-calibration）
 * 2. tags-fallback — 仅当合并步未返回 worldTags
 * 3. timeline — 未来时间线填充
 * 4. past-history — 上古史
 * 5. entities — 具名实体（含 mapRegions）
 *
 * Fallback：缓存命中但缺 W02 → world-calibration-prompt（pipeline:calibration-fallback）
 * @mod mod-world
 */

import { callAI } from '@/core'

import type { AIModelConfig } from '@/foundation'
import type { ZodSchema } from 'zod'

import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore, type WorldInitAIStatus } from '../store'
import type { WorldConfig, AnyWorldEntity, Settlement } from '../types'
import { useWorldMapStore, type MarkerLayer } from '@/mods/mod-world-map'
import {
  worldTagsPrompt,
  worldTimelinePrompt,
  pastHistoryPrompt,
  worldEntityPrompt,
  worldCalibrationPrompt,
  worldDimensionCalibrationPrompt,
  buildDefaultCalibration,
  clampCalibration,
  formatCalibrationSummary,
  buildTimelineStyleHint,
  resolveWorldviewStyleHint,
  buildWorldInitFingerprint,
  loadCachedWorldInitBundle,
  saveCachedWorldCalibration,
  isInitFingerprintChanged,
  invalidatePastHistoryCache,
  shouldSkipEntityAIGeneration,
  WorldInitSystem,
  WorldEntitySystem,
  WorldTimelineSystem,
} from '../world-init-bundle-deps'
import type { DimensionInferenceOutput } from '../prompts/dimension-inference-schema'
import { buildWorldInitPromptVars, formatWorldTagsForPrompt, formatEntityRangesForPrompt, formatRegionsForPrompt } from './world-init-prompt-vars'
import { resolvePipelineAnchorYear } from './world-init-anchor-year'
import {
  mapPowerSystemZhToTag,
  mapWorldviewEssenceZhToTag,
  CIVILIZATION_ZH_MAP,
  SPATIAL_FORM_ZH_MAP,
} from './world-config-mapping'
import type { WorldInitPipelineBudgets } from './world-init-budgets'
import { bumpTokenBudgetForRetry } from './world-init-budgets'
import {
  parseWorldCalibrationBundleResponse,
  validateWorldCalibrationBundleResponse,
  getCalibrationBundleDiagnostics,
  type ParsedWorldCalibrationBundle,
} from './world-calibration-parse'
import {
  parseWorldDimensionCalibrationResponse,
  getDimensionCalibrationValidationError,
  getDimensionCalibrationDiagnostics,
  type ParsedWorldDimensionCalibrationBundle,
} from './world-dimension-calibration-parse'
import {
  calibrationEchoesDescription,
  filterCoherentWorldTags,
  isLikelyTruncatedJSON,
  type CoherenceGuardContext,
} from './world-coherence-output-guard'
import {
  buildWorldInitContentLogMetaResolver,
  fromCalibrationBundleDiagnostics,
  fromDimensionCalibrationDiagnostics,
  getWorldTagsValidationDiagnostics,
  resolveWorldInitFailureLogMeta,
  type WorldInitValidationDiagnostics,
} from './world-init-ai-validation'
import {
  buildWorldInitKvSessionId,
  configForWorldInitSubPool,
  parseWorldTagsResponse,
  prepareWorldInitUserPrompt,
  resolveWorldInitJsonMode,
  type WorldInitKVSubPool,
} from './world-init-kv'

function commitWorldTags(config: WorldConfig, tags: string[]): string[] {
  const filtered = filterCoherentWorldTags(tags, {
    worldDescription: config.description,
    worldType: config.worldType,
  })
  useWorldStore.getState().setWorldTags(filtered)
  return filtered
}

/** 将实体（settlements/nations/capitals）同步为地图标记层 */
export function syncEntitiesToMapMarkers(entities: AnyWorldEntity[]): void {
  try {
    const settlements = entities.filter(
      (e) => e.type === 'settlement',
    ) as Settlement[]

    const markers: MarkerLayer[] = settlements.map((s) => ({
      type: s.tier === 'metropolis' ? 'capital' : 'city',
      regionId: s.regionId ?? '',
      label: s.name,
      icon: s.tier === 'metropolis' ? '🏙️' : s.tier === 'city' ? '🏰' : '🏘️',
      color: undefined,
    }))

    if (markers.length > 0) {
      useWorldMapStore.getState().setMarkers(markers)
      console.info(`[mod-world] 已将 ${markers.length} 个定居点同步为地图标记`)
    }
  } catch (err) {
    console.warn('[mod-world] 同步地图标记失败:', err)
  }
}

export type { WorldInitPipelineBudgets } from './world-init-budgets'

export const MAX_AI_RETRIES = 3
export const RETRY_DELAY_MS = 2000

export interface WorldInitPipelineResult {
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  timelineGenerated: boolean
  entitiesGenerated: boolean
  errors: string[]
  rawTags?: string[]
}

export interface WorldInitPipelineContext {
  config: WorldConfig
  configBeforeCoherence: WorldConfig
  worldCode: number
  startingYear?: number
  model: string
  provider: string
  customUrl: string
  customKey: string
  aiConfig: AIModelConfig
  budgets: WorldInitPipelineBudgets
  initFingerprint: string
  promptVars: Record<string, string>
  errors: string[]
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  timelineGenerated: boolean
  entitiesGenerated: boolean
  rawTags?: string[]
  currentStep: string
  entitySystem: WorldEntitySystem
  timelineSystem: WorldTimelineSystem
  timelineSystemPrompt: string
}

export interface WorldInitStep {
  id: string
  label: string
  shouldSkip?: (ctx: WorldInitPipelineContext) => boolean
  run: (ctx: WorldInitPipelineContext) => Promise<void>
  /** 失败是否阻塞最终 status=complete（默认 true） */
  critical?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function fillPromptTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result.replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, '')
}

export function createWorldInitAIService(
  aiConfig: AIModelConfig,
  systemPrompt: string,
  overrideMaxTokens?: number,
  trigger?: string,
  logMetaResolver?: (response: string) => Record<string, unknown>,
  kvOpts?: { subPool: WorldInitKVSubPool; worldCode: number },
  outputSchema?: ZodSchema,
) {
  return async (userPrompt: string, extraUserMessages?: string[]): Promise<string> => {
    const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
    const model = customModel || aiConfig.model
    const subPool = kvOpts?.subPool ?? 'cal'
    const sessionId = buildWorldInitKvSessionId(kvOpts?.worldCode ?? 0, subPool)
    const prepared = prepareWorldInitUserPrompt(userPrompt, subPool)
    const jsonMode = resolveWorldInitJsonMode(subPool)
    const config = configForWorldInitSubPool(aiConfig, subPool)
    return callAI(systemPrompt, prepared.userPrompt, {
      config: { ...config, model },
      pool: 'worldInit',
      sessionId,
      userSegments: prepared.userSegments,
      extraUserMessages,
      jsonMode,
      providerId: provider,
      customBaseUrl: customUrl || undefined,
      customModel: model,
      apiKey: customKey || undefined,
      ...(overrideMaxTokens ? { overrideMaxTokens } : {}),
      logContext: {
        trigger,
        pool: 'worldInit',
        model,
        sessionId,
      },
      logMeta: {
        kvSubPool: subPool,
        stablePrefixChars: prepared.stablePrefixChars,
        userId: `winit-${sessionId}`,
        jsonMode,
      },
      logMetaResolver,
      outputSchema,
    })
  }
}

function coherenceGuardFromConfig(config: WorldConfig): CoherenceGuardContext {
  return { worldDescription: config.description, worldType: config.worldType }
}

async function withRetry(
  name: string,
  fn: () => Promise<unknown>,
  errors: string[],
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      await fn()
      return true
    } catch (err) {
      const msg = `${name} 第 ${attempt}/${MAX_AI_RETRIES} 次失败: ${String(err)}`
      console.warn(`[mod-world] ${msg}`)
      if (attempt < MAX_AI_RETRIES) {
        await sleep(RETRY_DELAY_MS)
      } else {
        errors.push(msg)
        return false
      }
    }
  }
  return false
}

interface WorldInitAICallOpts {
  subPool: WorldInitKVSubPool
  extraUserMessages?: string[]
  logMeta?: Record<string, unknown>
  logMetaResolver?: (response: string) => Record<string, unknown>
  outputSchema?: ZodSchema
}

function callWorldInitAI(
  ctx: WorldInitPipelineContext,
  systemPrompt: string,
  userTemplate: string,
  maxTokens: number,
  trigger: string,
  callOpts: WorldInitAICallOpts,
): Promise<string> {
  const filled = fillPromptTemplate(userTemplate, ctx.promptVars)
  const prepared = prepareWorldInitUserPrompt(filled, callOpts.subPool)
  const sessionId = buildWorldInitKvSessionId(ctx.worldCode, callOpts.subPool)
  const jsonMode = resolveWorldInitJsonMode(callOpts.subPool)
  const config = configForWorldInitSubPool(ctx.aiConfig, callOpts.subPool)

  return callAI(
    systemPrompt,
    prepared.userPrompt,
    {
      config: { ...config, model: ctx.model },
      pool: 'worldInit',
      sessionId,
      userSegments: prepared.userSegments,
      extraUserMessages: callOpts.extraUserMessages,
      jsonMode,
      overrideMaxTokens: maxTokens,
      providerId: ctx.provider,
      customBaseUrl: ctx.customUrl || undefined,
      customModel: ctx.model,
      apiKey: ctx.customKey,
      logContext: {
        trigger,
        pool: 'worldInit',
        model: ctx.model,
        sessionId,
      },
      logMeta: {
        kvSubPool: callOpts.subPool,
        stablePrefixChars: prepared.stablePrefixChars,
        userId: `winit-${sessionId}`,
        jsonMode,
        ...callOpts.logMeta,
      },
      logMetaResolver: callOpts.logMetaResolver,
      outputSchema: callOpts.outputSchema,
    },
  )
}

const RESILIENT_AI_MAX_ATTEMPTS = 3

/** 带截断检测与预算递增的 world-init AI 调用 */
async function callWorldInitAIResilient(
  ctx: WorldInitPipelineContext,
  systemPrompt: string,
  userTemplate: string,
  initialBudget: number,
  trigger: string,
  subPool: WorldInitKVSubPool,
  validate?: (raw: string) => void,
  getDiagnostics?: (raw: string) => WorldInitValidationDiagnostics,
  outputSchema?: ZodSchema,
): Promise<string> {
  let budget = initialBudget
  let lastRaw = ''
  let retrySuffix = ''

  const buildLogMetaResolver = (attemptIndex: number): (response: string) => Record<string, unknown> => {
    return (response: string) => {
      const base = {
        resilientAttempt: attemptIndex,
        resilientMaxAttempts: RESILIENT_AI_MAX_ATTEMPTS,
        tokenBudget: budget,
      }
      const truncated = isLikelyTruncatedJSON(response)
      const diagnostics = getDiagnostics?.(response)
      let businessError: string | null = null
      if (validate) {
        try {
          validate(response)
        } catch (err) {
          businessError = String(err)
        }
      }
      return resolveWorldInitFailureLogMeta(base, response, truncated, diagnostics, businessError)
    }
  }

  for (let attempt = 0; attempt < RESILIENT_AI_MAX_ATTEMPTS; attempt++) {
    lastRaw = await callWorldInitAI(
      ctx, systemPrompt, userTemplate, budget, trigger,
      {
        subPool,
        extraUserMessages: retrySuffix ? [retrySuffix] : undefined,
        logMeta: {
          resilientAttempt: attempt + 1,
          resilientMaxAttempts: RESILIENT_AI_MAX_ATTEMPTS,
          tokenBudget: budget,
        },
        logMetaResolver: buildLogMetaResolver(attempt + 1),
        outputSchema,
      },
    )

    if (isLikelyTruncatedJSON(lastRaw)) {
      console.warn(`[mod-world] AI 响应可能被截断（budget=${budget}），尝试提高预算重试`)
      retrySuffix = '【修正】上次 JSON 不完整或被截断，请输出完整闭合 JSON，勿省略 aiDetailedParameters 字段。'
      budget = bumpTokenBudgetForRetry(budget)
      continue
    }

    if (validate) {
      try {
        validate(lastRaw)
      } catch (err) {
        if (attempt < RESILIENT_AI_MAX_ATTEMPTS - 1) {
          console.warn(`[mod-world] AI 响应校验失败，重试: ${String(err)}`)
          retrySuffix = [
            '【修正】上次输出未通过校验，请严格按 outputExample 重写：',
            String(err),
            'dimensions.powerCeiling 必须为整数；metadata 用 camelCase 英文 tag；',
            'aiDetailedParameters 为扁平 43 字段，禁止嵌套 worldview/sociology。',
          ].join('\n')
          budget = bumpTokenBudgetForRetry(budget)
          continue
        }
        throw err
      }
    }

    return lastRaw
  }

  throw new Error(`AI 响应不完整或校验失败（最终 budget=${budget}，${lastRaw.length} 字符）`)
}

function syncCtxPromptVars(ctx: WorldInitPipelineContext): void {
  const store = useWorldStore.getState()
  const cal = store.calibration ?? buildDefaultCalibration(ctx.config)
  ctx.promptVars.worldTags = formatWorldTagsForPrompt(ctx.rawTags)
  ctx.promptVars.calibrationSummary = formatCalibrationSummary(cal)
  ctx.promptVars.entityRanges = formatEntityRangesForPrompt(cal)
}

/** 空 _dimensionModes 视为全部 AI；仅当每个维度都显式非 ai 时跳过推断 */
function shouldRunDimensionInference(modes: Record<string, string>): boolean {
  const values = Object.values(modes)
  if (values.length === 0) return true
  return values.some((m) => m === 'ai')
}

function isDimensionAIMode(modes: Record<string, string>, dimKey: string): boolean {
  if (Object.keys(modes).length === 0) return true
  return (modes[dimKey] ?? 'ai') === 'ai'
}

function applyDimensionInferenceToConfig(
  config: WorldConfig,
  inferred: DimensionInferenceOutput,
  modes: Record<string, string>,
): void {
  if (isDimensionAIMode(modes, 'powerSystem')) {
    config.powerSystemTag = mapPowerSystemZhToTag(inferred.powerSystem)
  }
  if (isDimensionAIMode(modes, 'worldviewEssence')) {
    config.essenceTag = mapWorldviewEssenceZhToTag(inferred.worldviewEssence)
    config.worldType = inferred.worldType
  }
  if (isDimensionAIMode(modes, 'civilizationStage')) {
    const mapped = CIVILIZATION_ZH_MAP[inferred.civilizationStage]
    if (mapped) config.civilizationStage = mapped
  }
  if (isDimensionAIMode(modes, 'universeScale')) {
    const mapped = SPATIAL_FORM_ZH_MAP[inferred.spatialForm]
    if (mapped) config.spatialForm = mapped
  }
  if (isDimensionAIMode(modes, 'powerCeiling')) {
    config.powerCeiling = inferred.powerCeiling
  }

  // 魔法等外部能量体系：纠偏 worldType / essenceTag（避免 idealist+modern 触发意志修仙 hint）
  if (config.powerSystemTag === 'magic') {
    if (config.essenceTag === 'modern' || config.essenceTag === 'cultivation') {
      config.essenceTag = 'western-fantasy'
    }
    if (inferred.worldType === 'idealist') {
      config.worldType = 'mixed'
    }
  }
}

/** 按当前 config + store.calibration 重算区域并注入实体系统 */
function syncEntitySystemRegions(entitySystem: WorldEntitySystem, config: WorldConfig): void {
  const snapshot = new WorldInitSystem().initialize(config)
  entitySystem.setRegions(snapshot.regions)
}

function syncPipelineRegions(ctx: WorldInitPipelineContext): void {
  syncEntitySystemRegions(ctx.entitySystem, ctx.config)
}

function applyCalibrationParsed(
  ctx: WorldInitPipelineContext,
  bundle: ParsedWorldCalibrationBundle | ParsedWorldDimensionCalibrationBundle,
): void {
  const store = useWorldStore.getState()
  const clamped = clampCalibration(bundle.calibration, ctx.config)
  store.setCalibration(clamped)
  ctx.calibrationGenerated = true

  if (bundle.aiDetailedParameters) {
    const current = store.worldConfig ?? ctx.config
    store.setWorldConfig({
      ...current,
      aiDetailedParameters: bundle.aiDetailedParameters,
      _aiFlags: { ...current._aiFlags, aiDetailedParameters: true, calibrationFromAI: true },
    })
  } else {
    const current = store.worldConfig ?? ctx.config
    store.setWorldConfig({
      ...current,
      _aiFlags: { ...current._aiFlags, calibrationFromAI: true },
    })
  }
  ctx.configGenerated = true

  if (bundle.worldTags?.length) {
    const filtered = commitWorldTags(ctx.config, bundle.worldTags)
    ctx.rawTags = filtered
    ctx.tagsGenerated = true
  }

  saveCachedWorldCalibration(
    ctx.worldCode,
    ctx.initFingerprint,
    clamped,
    ctx.rawTags?.length ? ctx.rawTags : undefined,
  )
  syncPipelineRegions(ctx)
}

function applyCalibrationBundle(
  ctx: WorldInitPipelineContext,
  raw: string,
): void {
  const bundle = parseWorldCalibrationBundleResponse(raw)
  if (!bundle) throw new Error('calibration bundle 解析失败')
  applyCalibrationParsed(ctx, bundle)
}

function loadCalibrationFromCache(
  ctx: WorldInitPipelineContext,
): boolean {
  const cached = loadCachedWorldInitBundle(ctx.worldCode, ctx.initFingerprint)
  if (!cached?.calibration) return false

  const store = useWorldStore.getState()
  store.setCalibration(cached.calibration)
  ctx.calibrationGenerated = true
  if (cached.tags?.length) {
    const filtered = commitWorldTags(ctx.config, cached.tags)
    ctx.rawTags = filtered
    ctx.tagsGenerated = true
    syncCtxPromptVars(ctx)
  }
  ctx.configGenerated = !!(store.worldConfig?.aiDetailedParameters)
  console.info(`[mod-world] 使用缓存校准（worldCode ${ctx.worldCode}，指纹 ${ctx.initFingerprint}）`)
  syncPipelineRegions(ctx)
  return true
}

function applyDimensionInferenceToContext(
  ctx: WorldInitPipelineContext,
  inferred: DimensionInferenceOutput,
): void {
  const modes = ctx.config._dimensionModes ?? {}
  applyDimensionInferenceToConfig(ctx.config, inferred, modes)

  ctx.initFingerprint = buildWorldInitFingerprint(ctx.config, ctx.config.description)
  useWorldStore.getState().setWorldConfig({ ...ctx.config })
  syncPipelineRegions(ctx)

  ctx.promptVars = buildWorldInitPromptVars(ctx.config, {
    beforeConfig: ctx.configBeforeCoherence,
    worldTags: ctx.rawTags,
  })
}

function finalizeAnchorYearAndTimeline(ctx: WorldInitPipelineContext): void {
  const eraFromCal = useWorldStore.getState().calibration?.timeline?.eraStartYear
  const anchorYear = typeof eraFromCal === 'number' && Number.isFinite(eraFromCal)
    ? eraFromCal
    : resolvePipelineAnchorYear(ctx.config, ctx.startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  reinitTimelineSystem(ctx, anchorYear)
}

function reinitTimelineSystem(ctx: WorldInitPipelineContext, anchorYear: number): void {
  ctx.timelineSystemPrompt = worldTimelinePrompt.systemPrompt

  ctx.timelineSystem.init(
    ctx.worldCode,
    ctx.worldCode,
    ctx.config.essenceTag,
    ctx.config.name,
    ctx.config.description,
    anchorYear,
    ctx.config.civilizationStage,
    ctx.promptVars.coherenceHint,
    ctx.promptVars.coherenceNote,
    ctx.config.worldType ?? 'idealist',
  )
}

async function runCalibrationW02Fallback(ctx: WorldInitPipelineContext): Promise<void> {
  syncCtxPromptVars(ctx)
  const raw = await callWorldInitAIResilient(
    ctx, worldCalibrationPrompt.systemPrompt,
    worldCalibrationPrompt.userPromptTemplate, ctx.budgets.calibration,
    'world-init/pipeline:calibration-fallback',
    'cal',
    (response) => {
      if (calibrationEchoesDescription(response, ctx.config.description.length)) {
        throw new Error('calibration 错误回写了 worldDescription 全文')
      }
      validateWorldCalibrationBundleResponse(response)
    },
    (response) => fromCalibrationBundleDiagnostics(getCalibrationBundleDiagnostics(response)),
    worldCalibrationPrompt.outputSchema,
  )
  applyCalibrationBundle(ctx, raw)
  syncCtxPromptVars(ctx)
}

function buildDimensionCalibrationStep(): WorldInitStep {
  return {
    id: 'dimension-calibration',
    label: '维度推断与校准',
    run: async (ctx) => {
      const modes = ctx.config._dimensionModes ?? {}
      const needInference = shouldRunDimensionInference(modes)

      if (loadCalibrationFromCache(ctx)) {
        if (!ctx.configGenerated) {
          console.info('[mod-world] 缓存无 W02 参数，补生成校准 fallback')
          await runCalibrationW02Fallback(ctx)
        }
        finalizeAnchorYearAndTimeline(ctx)
        return
      }

      if (isInitFingerprintChanged(ctx.worldCode, ctx.initFingerprint)) {
        console.info('[mod-world] 指纹变更，清除上古史缓存')
        invalidatePastHistoryCache(ctx.worldCode)
      } else {
        console.info('[mod-world] 校准缓存未命中（可能已过期），保留上古史不删除')
      }

      syncCtxPromptVars(ctx)
      const raw = await callWorldInitAIResilient(
        ctx,
        worldDimensionCalibrationPrompt.systemPrompt,
        worldDimensionCalibrationPrompt.userPromptTemplate,
        ctx.budgets.dimensionCalibration,
        'world-init/pipeline:dimension-calibration',
        'cal',
        (response) => {
          if (calibrationEchoesDescription(response, ctx.config.description.length)) {
            throw new Error('dimension-calibration 错误回写了 worldDescription 全文')
          }
          const err = getDimensionCalibrationValidationError(response)
          if (err) throw new Error(err)
        },
        (response) => fromDimensionCalibrationDiagnostics(getDimensionCalibrationDiagnostics(response)),
      worldDimensionCalibrationPrompt.outputSchema,
    )

      const bundle = parseWorldDimensionCalibrationResponse(raw)
      if (!bundle) throw new Error('dimension-calibration 解析失败')

      if (needInference) {
        applyDimensionInferenceToContext(ctx, bundle.dimensions)
      }

      applyCalibrationParsed(ctx, bundle)
      if (!ctx.configGenerated) {
        console.info('[mod-world] 合并步未返回有效 W02，单独补 calibration-fallback')
        await runCalibrationW02Fallback(ctx)
      }
      syncCtxPromptVars(ctx)
      finalizeAnchorYearAndTimeline(ctx)

      console.info('[mod-world] 维度推断+校准完成:', {
        powerSystem: ctx.config.powerSystemTag,
        essenceTag: ctx.config.essenceTag,
        civilizationStage: ctx.config.civilizationStage,
        spatialForm: ctx.config.spatialForm,
        powerCeiling: ctx.config.powerCeiling,
        worldType: ctx.config.worldType,
        tags: ctx.rawTags?.length ?? 0,
      })
    },
  }
}

function buildTagsFallbackStep(): WorldInitStep {
  return {
    id: 'tags-fallback',
    label: '标签生成',
    shouldSkip: (ctx) => ctx.tagsGenerated,
    run: async (ctx) => {
      const store = useWorldStore.getState()
      const raw = await callWorldInitAIResilient(
        ctx, worldTagsPrompt.systemPrompt,
        worldTagsPrompt.userPromptTemplate, ctx.budgets.tags,
        'world-init/pipeline:tags-fallback',
        'tag',
        undefined,
        getWorldTagsValidationDiagnostics,
        worldTagsPrompt.outputSchema,
      )
      const tags = parseWorldTagsResponse(raw)
      const filtered = commitWorldTags(ctx.config, tags)
      ctx.rawTags = filtered
      ctx.tagsGenerated = true
      syncCtxPromptVars(ctx)
      const cal = store.calibration
      if (cal) saveCachedWorldCalibration(ctx.worldCode, ctx.initFingerprint, cal, filtered)
    },
  }
}

function buildTimelineStep(): WorldInitStep {
  return {
    id: 'timeline',
    label: '时间线生成',
    run: async (ctx) => {
      ctx.timelineSystemPrompt = worldTimelinePrompt.systemPrompt

      ctx.timelineSystem.updateWorldviewContext({
        essenceTag: ctx.config.essenceTag,
        civilizationStage: ctx.config.civilizationStage,
        worldType: ctx.config.worldType,
        worldDescription: ctx.config.description,
      })

      ctx.timelineSystem.setAIService(
        createWorldInitAIService(
          ctx.aiConfig,
          worldTimelinePrompt.systemPrompt,
          ctx.budgets.timeline,
          'world-init/pipeline:timeline-fill',
          buildWorldInitContentLogMetaResolver('timeline', coherenceGuardFromConfig(ctx.config)),
          { subPool: 'tl', worldCode: ctx.worldCode },
          worldTimelinePrompt.outputSchema,
        ),
      )
      await ctx.timelineSystem.fillStageWithAI(0, 0)
      ctx.timelineGenerated = true
    },
  }
}

function buildPastHistoryStep(): WorldInitStep {
  return {
    id: 'past-history',
    label: '过去历史',
    critical: false,
    run: async (ctx) => {
      const store = useWorldStore.getState()
      const cal = store.calibration ?? buildDefaultCalibration(ctx.config)
      const styleHint = buildTimelineStyleHint(
        ctx.config.civilizationStage,
        ctx.config.description,
        resolveWorldviewStyleHint({
          cal,
          essenceTag: ctx.config.essenceTag,
          worldDescription: ctx.config.description,
          worldType: ctx.config.worldType,
        }),
        cal,
        ctx.config.worldType,
        ctx.config.essenceTag,
      )

      ctx.timelineSystem.updateWorldviewContext({
        essenceTag: ctx.config.essenceTag,
        civilizationStage: ctx.config.civilizationStage,
        worldType: ctx.config.worldType,
        worldDescription: ctx.config.description,
      })

      ctx.timelineSystem.setPastHistoryAIService(
        createWorldInitAIService(
          ctx.aiConfig,
          pastHistoryPrompt.systemPrompt,
          ctx.budgets.pastHistory,
          'world-init/pipeline:past-history',
          buildWorldInitContentLogMetaResolver('past-history', coherenceGuardFromConfig(ctx.config)),
          { subPool: 'tl', worldCode: ctx.worldCode },
          pastHistoryPrompt.outputSchema,
        ),
        styleHint,
      )
      await ctx.timelineSystem.generatePastHistory(15)
    },
  }
}

function buildEntitiesStep(): WorldInitStep {
  return {
    id: 'entities',
    label: '实体生成',
    run: async (ctx) => {
      const store = useWorldStore.getState()
      const activeCalibration = store.calibration ?? buildDefaultCalibration(ctx.config)
      syncPipelineRegions(ctx)
      syncCtxPromptVars(ctx)
      const regionsSummary = formatRegionsForPrompt(ctx.entitySystem.getRegions())
      ctx.entitySystem.setWorldContext(
        ctx.config.name,
        ctx.config.description,
        ctx.config.civilizationStage,
        ctx.promptVars.coherenceHint,
        ctx.promptVars.coherenceNote,
        ctx.config.worldType ?? 'idealist',
        ctx.promptVars.worldTags,
        ctx.promptVars.calibrationSummary,
        ctx.promptVars.entityRanges,
        regionsSummary,
      )
      if (shouldSkipEntityAIGeneration(activeCalibration)) {
        store.setEntities([])
        ctx.entitiesGenerated = true
        syncEntitiesToMapMarkers([])
        console.info('[mod-world] 实体层全禁用（calibration entities 0-0），跳过 AI 实体生成')
        return
      }
      const ents = await ctx.entitySystem.generateEntities(ctx.config)
      store.setEntities(ents)
      syncEntitiesToMapMarkers(ents)
      ctx.entitiesGenerated = true
    },
  }
}

/** 默认 Pipeline（维度+校准单次→标签 fallback→时间线→上古史→实体） */
export function createDefaultWorldInitSteps(): WorldInitStep[] {
  return [
    buildDimensionCalibrationStep(),
    buildTagsFallbackStep(),
    buildTimelineStep(),
    buildPastHistoryStep(),
    buildEntitiesStep(),
  ]
}

export function createWorldInitPipelineContext(
  config: WorldConfig,
  configBeforeCoherence: WorldConfig,
  worldCode: number,
  aiConfig: AIModelConfig,
  budgets: WorldInitPipelineBudgets,
  startingYear?: number,
): WorldInitPipelineContext {
  const { customKey, provider, customUrl, customModel: cm } = useSettingsStore.getState()
  const model = cm || aiConfig.model
  const description = config.description
  const initFingerprint = buildWorldInitFingerprint(config, description)
  const anchorYear = resolvePipelineAnchorYear(config, startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  if (isInitFingerprintChanged(worldCode, initFingerprint)) {
    invalidatePastHistoryCache(worldCode)
  }
  const promptVars = buildWorldInitPromptVars(config, { beforeConfig: configBeforeCoherence })

  const entitySystem = new WorldEntitySystem()
  entitySystem.setWorldContext(
    config.name, description, config.civilizationStage, promptVars.coherenceHint,
    promptVars.coherenceNote, config.worldType ?? 'idealist',
  )
  entitySystem.setAIService(createWorldInitAIService(
    aiConfig,
    worldEntityPrompt.systemPrompt,
    budgets.entities,
    'world-init/pipeline:entities',
    buildWorldInitContentLogMetaResolver('entities', coherenceGuardFromConfig(config)),
    { subPool: 'geo', worldCode },
    worldEntityPrompt.outputSchema,
  ))
  syncEntitySystemRegions(entitySystem, config)

  const timelineSystem = new WorldTimelineSystem()
  timelineSystem.init(
    worldCode, worldCode, config.essenceTag, config.name, description, anchorYear,
    config.civilizationStage, promptVars.coherenceHint, promptVars.coherenceNote,
    config.worldType ?? 'idealist',
  )

  const timelineSystemPrompt = worldTimelinePrompt.systemPrompt

  return {
    config,
    configBeforeCoherence,
    worldCode,
    startingYear: anchorYear,
    model,
    provider,
    customUrl: customUrl || '',
    customKey: customKey || '',
    aiConfig,
    budgets,
    initFingerprint,
    promptVars,
    errors: [],
    calibrationGenerated: false,
    tagsGenerated: false,
    configGenerated: false,
    timelineGenerated: false,
    entitiesGenerated: false,
    currentStep: '准备中',
    entitySystem,
    timelineSystem,
    timelineSystemPrompt,
  }
}

function updatePipelineStatus(ctx: WorldInitPipelineContext, baseStatus: WorldInitAIStatus): void {
  useWorldStore.getState().setWorldInitAIStatus({
    ...baseStatus,
    currentStep: ctx.currentStep,
    calibrationGenerated: ctx.calibrationGenerated,
    tagsGenerated: ctx.tagsGenerated,
    configGenerated: ctx.configGenerated,
    timelineGenerated: ctx.timelineGenerated,
    entitiesGenerated: ctx.entitiesGenerated,
    retryCount: ctx.calibrationGenerated && ctx.tagsGenerated && ctx.configGenerated
      && ctx.timelineGenerated && ctx.entitiesGenerated ? 0 : 1,
    errors: ctx.errors,
  })
}

/** 执行 Pipeline 并返回 bundle 结果 */
export async function runWorldInitPipeline(
  ctx: WorldInitPipelineContext,
  steps: WorldInitStep[] = createDefaultWorldInitSteps(),
): Promise<WorldInitPipelineResult> {
  const baseStatus: WorldInitAIStatus = {
    status: 'running',
    calibrationGenerated: false,
    tagsGenerated: false,
    configGenerated: false,
    timelineGenerated: false,
    entitiesGenerated: false,
    retryCount: 0,
    maxRetries: MAX_AI_RETRIES,
    errors: [],
  }
  useWorldStore.getState().setWorldInitAIStatus(baseStatus)

  console.info(`[mod-world] Pipeline 开始: 世界 "${ctx.config.name}"（编码 ${ctx.worldCode}，${steps.length} 步）`)

  for (const step of steps) {
    if (step.shouldSkip?.(ctx)) continue

    ctx.currentStep = step.label
    updatePipelineStatus(ctx, baseStatus)

    const ok = await withRetry(step.label, () => step.run(ctx), ctx.errors)

    if (!ok && step.critical !== false && step.id === 'dimension-calibration' && !ctx.calibrationGenerated) {
      useWorldStore.getState().setCalibration(buildDefaultCalibration(ctx.config))
      ctx.calibrationGenerated = true
    }

    updatePipelineStatus(ctx, baseStatus)
  }

  const allOk = ctx.calibrationGenerated && ctx.tagsGenerated && ctx.configGenerated
    && ctx.timelineGenerated && ctx.entitiesGenerated

  useWorldStore.getState().setWorldInitAIStatus({
    status: allOk ? 'complete' : 'failed',
    currentStep: allOk ? '完成' : ctx.currentStep,
    calibrationGenerated: ctx.calibrationGenerated,
    tagsGenerated: ctx.tagsGenerated,
    configGenerated: ctx.configGenerated,
    timelineGenerated: ctx.timelineGenerated,
    entitiesGenerated: ctx.entitiesGenerated,
    retryCount: MAX_AI_RETRIES,
    maxRetries: MAX_AI_RETRIES,
    errors: ctx.errors,
  })

  return {
    calibrationGenerated: ctx.calibrationGenerated,
    tagsGenerated: ctx.tagsGenerated,
    configGenerated: ctx.configGenerated,
    timelineGenerated: ctx.timelineGenerated,
    entitiesGenerated: ctx.entitiesGenerated,
    errors: ctx.errors,
    rawTags: ctx.rawTags,
  }
}

/** 注入 orchestrator（Pipeline 完成后调用） */
export async function injectWorldInitOrchestratorContext(
  config: WorldConfig,
  rawTags?: string[],
): Promise<void> {
  try {
    const { orchestrator } = await import('@/mods/mod-engine/engine-api')
    const { WorldInitSystem } = await import('../subsystems/world-init-system')
    const { formatWorldTagsText } = await import('../constants/world-tag-defaults')
    const store = useWorldStore.getState()
    const calibration = store.calibration
    const calibrationSummary = formatCalibrationSummary(
      calibration ?? buildDefaultCalibration(config),
    )
    const snapshot = new WorldInitSystem().initialize(config)
    const formattedTags = formatWorldTagsText(snapshot.tags)
    orchestrator.setContext(
      {
        name: config.name,
        description: config.description,
        era: config.civilizationStage,
        config: {
          ...(config as unknown as Record<string, unknown>),
          _worldTagsText: formattedTags,
          _calibration: calibration,
          _calibrationSummary: calibrationSummary,
          _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
          ...(store.worldConfig?.aiDetailedParameters
            ? { _aiDetailedParameters: store.worldConfig.aiDetailedParameters }
            : {}),
        },
      },
      { name: '', age: 0, gender: '未设定', background: '', attributes: {} },
    )
    if (rawTags && rawTags.length > 0) {
      console.info(`[mod-world] AI 氛围标签 ${rawTags.length} 条已写入 store（orchestrator 使用结构化标签）`)
    }
    console.info('[mod-world] 世界校准已注入 orchestrator')
  } catch (err) {
    console.warn('[mod-world] 注入 orchestrator 失败:', err)
  }
}
