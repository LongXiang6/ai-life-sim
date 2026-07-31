/**
 * @module world-init-pipeline.ts
 * @description 世界初始化 AI Pipeline —— 可扩展步骤注册表
 *
 * ## 默认执行图（createDefaultWorldInitSteps）
 * prepare-world-init → queue-world-init → dimension-calibration → tags-fallback（可选跳过）
 * → entities → finalize-world-init。
 * 维度校准仍是单次 AI：dimensions + calibration + W02 + worldTags；缓存缺少
 * W02 时在该节点内部执行已声明的校准补全动作，不改变节点顺序或终态条件。
 * @mod mod-world
 */

import { callAI, EXECUTION_FLOWS, recordExecutionSequenceResult } from '@/core'

import {
  createExecutionOutcomeCodes,
  runExecutionSequence,
} from '@/foundation'
import type {
  AIModelConfig,
  ExecutionNodeSignal,
  ExecutionPhase,
} from '@/foundation'
import type { ZodSchema } from 'zod'

import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '../store'
import type { WorldConfig, WorldInitAIStatus } from '../types'
import {
  worldTagsPrompt,
  worldEntityPrompt,
  worldCalibrationPrompt,
  worldDimensionCalibrationPrompt,
  buildDefaultCalibration,
  clampCalibration,
  formatCalibrationSummary,
  buildWorldInitFingerprint,
  loadCachedWorldInitBundle,
  saveCachedWorldCalibration,
  shouldSkipEntityAIGeneration,
  WorldInitSystem,
  WorldEntitySystem,
  getWorldEntitySystem,
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
import { materializePowerFramework } from './power-framework'
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

export type { WorldInitPipelineBudgets } from './world-init-budgets'

export const MAX_AI_RETRIES = 3
export const RETRY_DELAY_MS = 2000
const WORLD_INIT_OWNER = 'mod-world'
const WORLD_INIT_FAILURE_TARGET = 'mod-world'

export interface WorldInitPipelineResult {
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
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
  entitiesGenerated: boolean
  rawTags?: string[]
  currentStep: string
  entitySystem: WorldEntitySystem
}

export interface WorldInitStep {
  id: string
  label: string
  phase: ExecutionPhase
  dependsOn: readonly string[]
  order: number
  owner: string
  failureTarget: string
  optional?: boolean
  timeoutMs?: number
  shouldSkip?: (ctx: WorldInitPipelineContext) => boolean | Promise<boolean>
  run: (ctx: WorldInitPipelineContext) => Promise<ExecutionNodeSignal | undefined>
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

async function withRetry<T>(
  name: string,
  fn: () => Promise<T>,
  errors: string[],
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const msg = `${name} 第 ${attempt}/${MAX_AI_RETRIES} 次失败: ${String(err)}`
      console.warn(`[mod-world] ${msg}`)
      if (attempt < MAX_AI_RETRIES) {
        await sleep(RETRY_DELAY_MS)
      } else {
        errors.push(msg)
        return undefined
      }
    }
  }
  return undefined
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
            'dimensions.powerFramework 必须是当前世界的具名阶位提议；metadata 用 camelCase 英文 tag；',
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
  if (isDimensionAIMode(modes, 'powerFramework')) {
    const store = useWorldStore.getState()
    const contextId = store.currentContextId ?? `world-${store.worldCode || 'pending'}`
    config.powerFramework = materializePowerFramework(inferred.powerFramework, {
      contextId,
      powerSystemTag: config.powerSystemTag,
      source: 'world-ai',
    })
  }

  // 魔法等外部能量体系：仅在 AI 模式下且标签为西式奇幻兼容值时做兜底映射（不覆盖 AI 明确判定）
  if (config.powerSystemTag === 'magic') {
    // essenceTag：仅在 AI 模式且当前 essenceTag 为空或不合法时填充
    if (isDimensionAIMode(modes, 'worldviewEssence')) {
      if (!config.essenceTag || config.essenceTag === 'modern' || config.essenceTag === 'cultivation') {
        const mapped = mapWorldviewEssenceZhToTag(inferred.worldviewEssence)
        if (mapped && mapped !== config.essenceTag) config.essenceTag = mapped
      }
    }
    // worldType：仅在 AI 模式且为 idealist 时才考虑提示冲突（由 hint 层提示，不强制覆盖）
    if (isDimensionAIMode(modes, 'worldviewEssence') && inferred.worldType === 'idealist') {
      // 不强制改写 worldType，由 hint 层 buildWorldviewStyleHint 提示冲突
      config._aiFlags = {
        ...config._aiFlags,
        magicIdealistWorldType: true,
      }
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

function finalizeAnchorYear(ctx: WorldInitPipelineContext): void {
  const eraFromCal = useWorldStore.getState().calibration?.timeline?.eraStartYear
  const anchorYear = typeof eraFromCal === 'number' && Number.isFinite(eraFromCal)
    ? eraFromCal
    : resolvePipelineAnchorYear(ctx.config, ctx.startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  // 纪元名称同步到 world store：优先使用 WorldConfig 预设，缺省时留空由引擎自动判定
  if (ctx.config.eraName) useWorldStore.getState().setEraName(ctx.config.eraName)
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
    phase: 'execute',
    dependsOn: ['queue-world-init'],
    order: 100,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
    run: async (ctx) => {
      const modes = ctx.config._dimensionModes ?? {}
      const needInference = shouldRunDimensionInference(modes)

      if (loadCalibrationFromCache(ctx)) {
        if (!ctx.configGenerated) {
          console.info('[mod-world] 缓存无 W02 参数，补生成校准 fallback')
          await runCalibrationW02Fallback(ctx)
        }
        finalizeAnchorYear(ctx)
        return { status: 'succeeded' }
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
      finalizeAnchorYear(ctx)

      console.info('[mod-world] 维度推断+校准完成:', {
        powerSystem: ctx.config.powerSystemTag,
        essenceTag: ctx.config.essenceTag,
        civilizationStage: ctx.config.civilizationStage,
        spatialForm: ctx.config.spatialForm,
        powerFramework: {
          label: ctx.config.powerFramework.label,
          progression: ctx.config.powerFramework.progression,
          rankCount: ctx.config.powerFramework.ranks.length,
        },
        worldType: ctx.config.worldType,
        tags: ctx.rawTags?.length ?? 0,
      })
      return { status: 'succeeded' }
    },
  }
}

function buildTagsFallbackStep(): WorldInitStep {
  return {
    id: 'tags-fallback',
    label: '标签生成',
    phase: 'execute',
    dependsOn: ['dimension-calibration'],
    order: 200,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
    optional: true,
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
      return { status: 'succeeded' }
    },
  }
}

function buildEntitiesStep(): WorldInitStep {
  return {
    id: 'entities',
    label: '实体生成',
    phase: 'transition',
    dependsOn: ['tags-fallback'],
    order: 300,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
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
        console.info('[mod-world] 实体层全禁用（calibration entities 0-0），跳过 AI 实体生成')
        return { status: 'succeeded' }
      }
      const ents = await ctx.entitySystem.generateEntities(ctx.config)
      store.setEntities(ents)
      ctx.entitiesGenerated = true
      return { status: 'succeeded' }
    },
  }
}

/** 默认 Pipeline（维度+校准单次→标签 fallback→实体） */
export function createDefaultWorldInitSteps(): WorldInitStep[] {
  return [
    {
      id: 'prepare-world-init',
      label: '准备世界初始化',
      phase: 'prepare',
      dependsOn: [],
      order: 0,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async (ctx) => {
        if (!ctx.config.name.trim() || !ctx.config.description.trim()) {
          return { status: 'failed', message: '世界配置缺少名称或描述' }
        }
        if (!ctx.initFingerprint.trim()) {
          return { status: 'failed', message: '世界初始化缺少稳定指纹' }
        }
        return { status: 'succeeded' }
      },
    },
    {
      id: 'queue-world-init',
      label: '排队世界初始化',
      phase: 'ready',
      dependsOn: ['prepare-world-init'],
      order: 0,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async () => ({ status: 'succeeded', message: '世界初始化步骤已按依赖排队' }),
    },
    buildDimensionCalibrationStep(),
    buildTagsFallbackStep(),
    buildEntitiesStep(),
    {
      id: 'finalize-world-init',
      label: '完成世界初始化',
      phase: 'finalize',
      dependsOn: ['entities'],
      order: 400,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async (ctx) => {
        const complete = ctx.calibrationGenerated
          && ctx.tagsGenerated
          && ctx.configGenerated
          && ctx.entitiesGenerated
        return complete
          ? { status: 'succeeded' }
          : { status: 'failed', message: '世界初始化结束前置条件未满足' }
      },
    },
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
  // 纪元名称同步到 world store
  if (config.eraName) useWorldStore.getState().setEraName(config.eraName)
  const promptVars = buildWorldInitPromptVars(config, { beforeConfig: configBeforeCoherence })

  const entitySystem = getWorldEntitySystem()
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
    entitiesGenerated: false,
    currentStep: '准备中',
    entitySystem,
  }
}

function updatePipelineStatus(
  ctx: WorldInitPipelineContext,
  baseStatus: WorldInitAIStatus,
  stepTimers: Record<string, { start: number; end?: number }>,
  status: WorldInitAIStatus['status'] = baseStatus.status,
): void {
  useWorldStore.getState().setWorldInitAIStatus({
    ...baseStatus,
    status,
    currentStep: ctx.currentStep,
    stepTimers: { ...stepTimers },
    calibrationGenerated: ctx.calibrationGenerated,
    tagsGenerated: ctx.tagsGenerated,
    configGenerated: ctx.configGenerated,
    entitiesGenerated: ctx.entitiesGenerated,
    retryCount: ctx.calibrationGenerated && ctx.tagsGenerated && ctx.configGenerated
      && ctx.entitiesGenerated ? 0 : 1,
    errors: ctx.errors,
  })
}

/** 执行 Pipeline 并返回 bundle 结果 */
export async function runWorldInitPipeline(
  ctx: WorldInitPipelineContext,
  steps: WorldInitStep[] = createDefaultWorldInitSteps(),
): Promise<WorldInitPipelineResult> {
  const flow = EXECUTION_FLOWS.worldInit
  const allGenFlags = false
  const baseStatus: WorldInitAIStatus = {
    status: 'running',
    calibrationGenerated: allGenFlags,
    tagsGenerated: allGenFlags,
    configGenerated: allGenFlags,
    entitiesGenerated: allGenFlags,
    retryCount: 0,
    maxRetries: MAX_AI_RETRIES,
    errors: [],
    stepTimers: {},
  }
  const stepTimers: Record<string, { start: number; end?: number }> = {}
  useWorldStore.getState().setWorldInitAIStatus(baseStatus)

  console.info(`[mod-world] Pipeline 开始: 世界 "${ctx.config.name}"（编码 ${ctx.worldCode}，${steps.length} 步）`)

  const labels = new Map(steps.map((step) => [step.id, step.label]))
  const nodes = steps.map((step) => ({
    id: step.id,
    owner: step.owner,
    failureTarget: step.failureTarget,
    phase: step.phase,
    dependsOn: step.dependsOn,
    order: step.order,
    optional: step.optional,
    timeoutMs: step.timeoutMs,
    shouldSkip: step.shouldSkip,
    outcomes: createExecutionOutcomeCodes(flow.flowId, step.id),
    run: async (pipelineContext: WorldInitPipelineContext) => {
      const signal = await withRetry(step.label, async () => {
        const result = await step.run(pipelineContext)
        if (result === undefined) {
          throw new Error(`步骤 "${step.id}" 返回但未提供状态码`)
        }
        return result
      }, pipelineContext.errors)
      if (signal === undefined) {
        return {
          status: 'failed' as const,
          message: pipelineContext.errors.at(-1) ?? `${step.label} 执行失败`,
        }
      }
      return signal
    },
  }))

  const sequenceResult = await runExecutionSequence({
    flow,
    executionId: `${flow.flowId}:${ctx.worldCode}:${ctx.initFingerprint}:${Date.now()}`,
    context: ctx,
    nodes,
    onEvent: (event) => {
      const label = labels.get(event.nodeId) ?? event.nodeId
      ctx.currentStep = label
      if (event.status === 'running') {
        stepTimers[label] = { start: Date.now() }
        updatePipelineStatus(ctx, baseStatus, stepTimers, 'running')
        return
      }
      if (
        event.status === 'succeeded'
        || event.status === 'skipped'
        || event.status === 'failed'
        || event.status === 'blocked'
        || event.status === 'cancelled'
        || event.status === 'timed-out'
        || event.status === 'missing-status'
        || event.status === 'invalid-status'
        || event.status === 'duplicate-status'
      ) {
        stepTimers[label] = {
          ...(stepTimers[label] ?? { start: event.at }),
          end: event.at,
        }
        const failed = event.status !== 'succeeded' && event.status !== 'skipped'
        if (failed && event.message && !ctx.errors.includes(event.message)) {
          ctx.errors.push(event.message)
        }
        updatePipelineStatus(ctx, baseStatus, stepTimers, failed ? 'failed' : 'running')
      }
    },
  })
  recordExecutionSequenceResult(sequenceResult)

  const allOk = sequenceResult.status === 'succeeded'
    && ctx.calibrationGenerated
    && ctx.tagsGenerated
    && ctx.configGenerated
    && ctx.entitiesGenerated

  if (!allOk && sequenceResult.failure) {
    const message = `${sequenceResult.failure.code}: ${sequenceResult.failure.message}`
    if (!ctx.errors.includes(message)) ctx.errors.push(message)
  }

  useWorldStore.getState().setWorldInitAIStatus({
    status: allOk ? 'complete' : 'failed',
    currentStep: allOk ? '完成' : ctx.currentStep,
    stepTimers: { ...stepTimers },
    calibrationGenerated: ctx.calibrationGenerated,
    tagsGenerated: ctx.tagsGenerated,
    configGenerated: ctx.configGenerated,
    entitiesGenerated: ctx.entitiesGenerated,
    retryCount: MAX_AI_RETRIES,
    maxRetries: MAX_AI_RETRIES,
    errors: ctx.errors,
  })

  return {
    calibrationGenerated: ctx.calibrationGenerated,
    tagsGenerated: ctx.tagsGenerated,
    configGenerated: ctx.configGenerated,
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
    const { buildOrchestratorWorldSetting, orchestrator } = await import('@/mods/mod-engine/engine-api')
    const { useCharacterStore } = await import('@/mods/mod-character')
    const { WorldInitSystem } = await import('../subsystems/world-init-system')
    const { formatWorldTagsText } = await import('../constants/world-tag-defaults')
    const store = useWorldStore.getState()
    const calibration = store.calibration
    const calibrationSummary = formatCalibrationSummary(
      calibration ?? buildDefaultCalibration(config),
    )
    const snapshot = new WorldInitSystem().initialize(config, {
      contextId: store.currentContextId ?? undefined,
      worldCode: store.worldCode,
      calibration,
    })
    const formattedTags = formatWorldTagsText(snapshot.tags)
    orchestrator.setContext(
      buildOrchestratorWorldSetting(config, {
        extraConfig: {
          ...(config as unknown as Record<string, unknown>),
          _worldTagsText: formattedTags,
          _calibration: calibration,
          _calibrationSummary: calibrationSummary,
          _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
          ...(store.worldConfig?.aiDetailedParameters
            ? { _aiDetailedParameters: store.worldConfig.aiDetailedParameters }
            : {}),
        },
      }),
      {
        characterId: useCharacterStore.getState().ensureCharacterId(),
        name: '', age: 0, gender: '未设定', background: '', attributes: {},
      },
    )
    if (rawTags && rawTags.length > 0) {
      console.info(`[mod-world] AI 氛围标签 ${rawTags.length} 条已写入 store（orchestrator 使用结构化标签）`)
    }
    console.info('[mod-world] 世界校准已注入 orchestrator')
  } catch (err) {
    console.warn('[mod-world] 注入 orchestrator 失败:', err)
  }
}
