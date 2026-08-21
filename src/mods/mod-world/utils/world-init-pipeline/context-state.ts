/**
 * Purpose: Apply validated world-init results to the pipeline context and owned world Store.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Deterministic context and Store synchronization; no AI transport or step scheduling.
 */

import { useWorldStore } from '../../store'
import type { WorldConfig } from '../../types'
import {
  buildDefaultCalibration,
  buildWorldInitFingerprint,
  clampCalibration,
  formatCalibrationSummary,
  loadCachedWorldInitBundle,
  saveCachedWorldCalibration,
  WorldInitSystem,
} from '../../world-init-bundle-deps'
import type { DimensionInferenceOutput } from '../../prompts/dimension-inference-schema'
import {
  formatRegionsForPrompt,
  formatWorldTagsForPrompt,
} from '../world-init-prompt-vars'
import { resolvePipelineAnchorYear } from '../world-init-anchor-year'
import {
  CIVILIZATION_ZH_MAP,
  mapPowerSystemZhToTag,
  mapWorldviewEssenceZhToTag,
  SPATIAL_FORM_ZH_MAP,
} from '../world-config-mapping'
import { materializePowerFramework } from '../power-framework'
import type { ParsedWorldDimensionCalibrationBundle } from '../world-dimension-calibration-parse'
import { filterCoherentWorldTags } from '../world-coherence-output-guard'
import type { WorldInitPipelineContext } from './contracts'
import { buildSpatialGraph, namespaceRegions } from '../world-context-runtime'
import {
  applyRegionProfileOutput,
  materializeLifeStageTemplate,
  parseWorldRegionProfileOutput,
} from '../world-region-profile'

export function syncContextPromptVars(context: WorldInitPipelineContext): void {
  const calibration = useWorldStore.getState().calibration ?? buildDefaultCalibration(context.config)
  context.promptVars.worldTags = formatWorldTagsForPrompt(context.rawTags)
  context.promptVars.calibrationSummary = formatCalibrationSummary(calibration)
  const state = useWorldStore.getState()
  const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
  context.promptVars.mapRegions = formatRegionsForPrompt(instance?.regions ?? [])
}

export function shouldRunDimensionInference(modes: Record<string, string>): boolean {
  const values = Object.values(modes)
  if (values.length === 0) return true
  return values.some((mode) => mode === 'ai')
}

function isDimensionAIMode(modes: Record<string, string>, dimensionKey: string): boolean {
  if (Object.keys(modes).length === 0) return true
  return (modes[dimensionKey] ?? 'ai') === 'ai'
}

function resolveDimensionInferenceConfig(
  config: WorldConfig,
  inferred: DimensionInferenceOutput,
  modes: Record<string, string>,
): WorldConfig {
  const resolved = structuredClone(config)
  if (isDimensionAIMode(modes, 'powerSystem')) {
    resolved.powerSystemTag = mapPowerSystemZhToTag(inferred.powerSystem)
  }
  if (isDimensionAIMode(modes, 'worldviewEssence')) {
    resolved.essenceTag = mapWorldviewEssenceZhToTag(inferred.worldviewEssence)
    resolved.worldType = inferred.worldType
  }
  if (isDimensionAIMode(modes, 'civilizationStage')) {
    const mapped = CIVILIZATION_ZH_MAP[inferred.civilizationStage]
    if (mapped) resolved.civilizationStage = mapped
  }
  if (isDimensionAIMode(modes, 'universeScale')) {
    const mapped = SPATIAL_FORM_ZH_MAP[inferred.spatialForm]
    if (mapped) resolved.spatialForm = mapped
  }
  if (isDimensionAIMode(modes, 'powerFramework')) {
    const store = useWorldStore.getState()
    const contextId = store.currentContextId ?? `world-${store.worldCode || 'pending'}`
    resolved.powerFramework = materializePowerFramework(inferred.powerFramework, {
      contextId,
      powerSystemTag: resolved.powerSystemTag,
      source: 'world-ai',
    })
  }

  if (resolved.powerSystemTag === 'magic') {
    if (isDimensionAIMode(modes, 'worldviewEssence')) {
      if (!resolved.essenceTag || resolved.essenceTag === 'modern' || resolved.essenceTag === 'cultivation') {
        const mapped = mapWorldviewEssenceZhToTag(inferred.worldviewEssence)
        if (mapped && mapped !== resolved.essenceTag) resolved.essenceTag = mapped
      }
    }
    if (isDimensionAIMode(modes, 'worldviewEssence') && inferred.worldType === 'idealist') {
      resolved._aiFlags = { ...resolved._aiFlags, magicIdealistWorldType: true }
    }
  }
  return resolved
}

function buildCalibratedContextInstance(
  config: WorldConfig,
  calibration: ReturnType<typeof clampCalibration>,
  worldTags: string[],
) {
  const store = useWorldStore.getState()
  const contextId = store.currentContextId
  const instance = contextId ? store.contexts[contextId] : undefined
  if (!instance) throw new Error('世界校准提交时当前世界上下文不存在')

  const snapshot = new WorldInitSystem().initialize(config)
  const resolvedContextId = instance.record.id
  const { regions } = namespaceRegions(resolvedContextId, snapshot.regions)
  const spatialGraph = buildSpatialGraph(
    resolvedContextId,
    instance.record.kind,
    config.name,
    config.spatialForm,
    regions,
  )
  if (spatialGraph.nodes[instance.spatialGraph.currentRegionId]) {
    spatialGraph.currentRegionId = instance.spatialGraph.currentRegionId
  }
  return {
    ...instance,
    worldConfig: structuredClone(config),
    calibration: structuredClone(calibration),
    worldTags: [...worldTags],
    regions,
    spatialGraph,
  }
}

function commitCalibrationState(
  context: WorldInitPipelineContext,
  config: WorldConfig,
  calibration: ReturnType<typeof clampCalibration>,
  worldTags: string[],
): void {
  const nextInstance = buildCalibratedContextInstance(config, calibration, worldTags)
  useWorldStore.getState().replaceContext(nextInstance)
  context.config = config
  context.initFingerprint = buildWorldInitFingerprint(config, config.description)
  context.rawTags = worldTags
  context.calibrationGenerated = true
  context.configGenerated = true
  context.tagsGenerated = true
  context.promptVars.mapRegions = formatRegionsForPrompt(nextInstance.regions)
}

export function syncPipelineRegions(context: WorldInitPipelineContext): void {
  const store = useWorldStore.getState()
  const contextId = store.currentContextId
  const instance = contextId ? store.contexts[contextId] : undefined
  const snapshot = new WorldInitSystem().initialize(context.config)
  if (!instance) {
    context.promptVars.mapRegions = formatRegionsForPrompt(snapshot.regions)
    return
  }
  const resolvedContextId = instance.record.id
  const { regions } = namespaceRegions(resolvedContextId, snapshot.regions)
  const spatialGraph = buildSpatialGraph(
    resolvedContextId,
    instance.record.kind,
    context.config.name,
    context.config.spatialForm,
    regions,
  )
  if (spatialGraph.nodes[instance.spatialGraph.currentRegionId]) {
    spatialGraph.currentRegionId = instance.spatialGraph.currentRegionId
  }
  store.replaceContext({ ...instance, regions, spatialGraph, worldConfig: structuredClone(context.config) })
  context.promptVars.mapRegions = formatRegionsForPrompt(regions)
}

export function commitRegionProfileOutput(context: WorldInitPipelineContext, raw: string): void {
  const store = useWorldStore.getState()
  const contextId = store.currentContextId
  const instance = contextId ? store.contexts[contextId] : undefined
  if (!instance) throw new Error('区域概况提交时当前世界上下文不存在')
  const resolvedContextId = instance.record.id
  const output = parseWorldRegionProfileOutput(raw)
  const regions = applyRegionProfileOutput(
    instance.regions,
    output,
    instance.record.localClock.lastGlobalTotalDays,
  )
  const spatialGraph = buildSpatialGraph(
    resolvedContextId,
    instance.record.kind,
    context.config.name,
    context.config.spatialForm,
    regions,
  )
  if (spatialGraph.nodes[instance.spatialGraph.currentRegionId]) {
    spatialGraph.currentRegionId = instance.spatialGraph.currentRegionId
  }
  const config = {
    ...context.config,
    lifeStageTemplate: materializeLifeStageTemplate(output),
  }
  store.replaceContext({ ...instance, worldConfig: structuredClone(config), regions, spatialGraph })
  context.config = config
  context.promptVars.mapRegions = formatRegionsForPrompt(regions)
}

export function applyCalibrationParsed(
  context: WorldInitPipelineContext,
  bundle: ParsedWorldDimensionCalibrationBundle,
  applyDimensions: boolean,
): void {
  const dimensionConfig = applyDimensions
    ? resolveDimensionInferenceConfig(
      context.config,
      bundle.dimensions,
      context.config._dimensionModes ?? {},
    )
    : structuredClone(context.config)
  const enrichedConfig = {
    ...dimensionConfig,
    aiDetailedParameters: bundle.aiDetailedParameters,
    _aiFlags: { ...dimensionConfig._aiFlags, aiDetailedParameters: true, calibrationFromAI: true },
  }
  const clamped = clampCalibration(bundle.calibration, enrichedConfig)
  const filtered = filterCoherentWorldTags(bundle.worldTags, {
    worldDescription: enrichedConfig.description,
    worldType: enrichedConfig.worldType,
  })
  if (filtered.length === 0) throw new Error('世界标签经一致性校验后为空')
  commitCalibrationState(context, enrichedConfig, clamped, filtered)
  saveCachedWorldCalibration(
    context.worldCode,
    context.initFingerprint,
    clamped,
    bundle.aiDetailedParameters,
    filtered,
  )
}

export function loadCalibrationFromCache(context: WorldInitPipelineContext): boolean {
  const cached = loadCachedWorldInitBundle(context.worldCode, context.initFingerprint)
  if (!cached) return false

  const current = structuredClone(context.config)
  const enrichedConfig = {
    ...current,
    aiDetailedParameters: cached.aiDetailedParameters,
    _aiFlags: { ...current._aiFlags, aiDetailedParameters: true, calibrationFromAI: true },
  }
  const clamped = clampCalibration(cached.calibration, enrichedConfig)
  const filtered = filterCoherentWorldTags(cached.tags, {
    worldDescription: enrichedConfig.description,
    worldType: enrichedConfig.worldType,
  })
  if (filtered.length === 0) return false
  commitCalibrationState(context, enrichedConfig, clamped, filtered)
  syncContextPromptVars(context)
  console.info(`[mod-world] 使用缓存校准（worldCode ${context.worldCode}，指纹 ${context.initFingerprint}）`)
  return true
}

export function finalizeAnchorYear(context: WorldInitPipelineContext): void {
  const eraFromCalibration = useWorldStore.getState().calibration?.timeline?.eraStartYear
  const anchorYear = typeof eraFromCalibration === 'number' && Number.isFinite(eraFromCalibration)
    ? eraFromCalibration
    : resolvePipelineAnchorYear(context.config, context.startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  if (context.config.eraName) useWorldStore.getState().setEraName(context.config.eraName)
}
