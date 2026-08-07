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
  buildWorldInitPromptVars,
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
import { parseWorldCalibrationBundleResponse, type ParsedWorldCalibrationBundle } from '../world-calibration-parse'
import type { ParsedWorldDimensionCalibrationBundle } from '../world-dimension-calibration-parse'
import { filterCoherentWorldTags } from '../world-coherence-output-guard'
import type { WorldInitPipelineContext } from './contracts'
import { buildSpatialGraph, namespaceRegions } from '../world-context-runtime'
import {
  applyRegionProfileOutput,
  materializeLifeStageTemplate,
  parseWorldRegionProfileOutput,
} from '../world-region-profile'

export function commitWorldTags(config: WorldConfig, tags: string[]): string[] {
  const filtered = filterCoherentWorldTags(tags, {
    worldDescription: config.description,
    worldType: config.worldType,
  })
  useWorldStore.getState().setWorldTags(filtered)
  return filtered
}

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

  if (config.powerSystemTag === 'magic') {
    if (isDimensionAIMode(modes, 'worldviewEssence')) {
      if (!config.essenceTag || config.essenceTag === 'modern' || config.essenceTag === 'cultivation') {
        const mapped = mapWorldviewEssenceZhToTag(inferred.worldviewEssence)
        if (mapped && mapped !== config.essenceTag) config.essenceTag = mapped
      }
    }
    if (isDimensionAIMode(modes, 'worldviewEssence') && inferred.worldType === 'idealist') {
      config._aiFlags = { ...config._aiFlags, magicIdealistWorldType: true }
    }
  }
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
  context.config = config
  store.setWorldConfig(config)
  store.replaceContext({ ...instance, worldConfig: structuredClone(config), regions, spatialGraph })
  context.promptVars.mapRegions = formatRegionsForPrompt(regions)
}

export function applyCalibrationParsed(
  context: WorldInitPipelineContext,
  bundle: ParsedWorldCalibrationBundle | ParsedWorldDimensionCalibrationBundle,
): void {
  const store = useWorldStore.getState()
  const clamped = clampCalibration(bundle.calibration, context.config)
  store.setCalibration(clamped)
  context.calibrationGenerated = true

  const current = store.worldConfig ?? context.config
  if (bundle.aiDetailedParameters) {
    store.setWorldConfig({
      ...current,
      aiDetailedParameters: bundle.aiDetailedParameters,
      _aiFlags: { ...current._aiFlags, aiDetailedParameters: true, calibrationFromAI: true },
    })
  } else {
    store.setWorldConfig({
      ...current,
      _aiFlags: { ...current._aiFlags, calibrationFromAI: true },
    })
  }
  context.configGenerated = true

  if (bundle.worldTags?.length) {
    const filtered = commitWorldTags(context.config, bundle.worldTags)
    context.rawTags = filtered
    context.tagsGenerated = true
  }
  saveCachedWorldCalibration(
    context.worldCode,
    context.initFingerprint,
    clamped,
    context.rawTags?.length ? context.rawTags : undefined,
  )
  syncPipelineRegions(context)
}

export function applyCalibrationBundle(context: WorldInitPipelineContext, raw: string): void {
  const bundle = parseWorldCalibrationBundleResponse(raw)
  if (!bundle) throw new Error('calibration bundle 解析失败')
  applyCalibrationParsed(context, bundle)
}

export function loadCalibrationFromCache(context: WorldInitPipelineContext): boolean {
  const cached = loadCachedWorldInitBundle(context.worldCode, context.initFingerprint)
  if (!cached?.calibration) return false

  const store = useWorldStore.getState()
  store.setCalibration(cached.calibration)
  context.calibrationGenerated = true
  if (cached.tags?.length) {
    const filtered = commitWorldTags(context.config, cached.tags)
    context.rawTags = filtered
    context.tagsGenerated = true
    syncContextPromptVars(context)
  }
  context.configGenerated = !!store.worldConfig?.aiDetailedParameters
  console.info(`[mod-world] 使用缓存校准（worldCode ${context.worldCode}，指纹 ${context.initFingerprint}）`)
  syncPipelineRegions(context)
  return true
}

export function applyDimensionInferenceToContext(
  context: WorldInitPipelineContext,
  inferred: DimensionInferenceOutput,
): void {
  const modes = context.config._dimensionModes ?? {}
  applyDimensionInferenceToConfig(context.config, inferred, modes)
  context.initFingerprint = buildWorldInitFingerprint(context.config, context.config.description)
  useWorldStore.getState().setWorldConfig({ ...context.config })
  syncPipelineRegions(context)
  context.promptVars = buildWorldInitPromptVars(context.config, {
    beforeConfig: context.configBeforeCoherence,
    worldTags: context.rawTags,
  })
}

export function finalizeAnchorYear(context: WorldInitPipelineContext): void {
  const eraFromCalibration = useWorldStore.getState().calibration?.timeline?.eraStartYear
  const anchorYear = typeof eraFromCalibration === 'number' && Number.isFinite(eraFromCalibration)
    ? eraFromCalibration
    : resolvePipelineAnchorYear(context.config, context.startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  if (context.config.eraName) useWorldStore.getState().setEraName(context.config.eraName)
}
