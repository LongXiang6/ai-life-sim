/**
 * Purpose: Commit a locally initialized world context and its owned world projections atomically.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Local world/context creation only; background AI enrichment is delegated.
 */

import type { ContextCapability } from '@/foundation'
import { generateWorldCode, useWorldStore } from '../store'
import {
  applyCoherenceToWorldConfig,
  buildDefaultCalibration,
  formatWorldTagsText,
  WorldInitSystem,
} from '../world-init-bundle-deps'
import type { WorldConfig, WorldInitAIStatus, WorldSnapshot } from '../types'
import { assertValidPowerFramework, materializePowerFramework } from '../utils/power-framework'
import {
  buildFallbackWorldScoringProfile,
  isCompleteWorldScoringProfile,
} from '../scoring-profile'
import { resolvePipelineAnchorYear } from '../utils/world-init-anchor-year'
import {
  buildWorldContextInstance,
  createCrossContextExit,
  createWorldContextId,
  inferContextKind,
  normalizeConfirmedCapabilities,
} from '../utils/world-context-runtime'
import { getWorldContextRegistrySystem } from '../subsystems/world-context-registry-system'
import { getSpatialGraphSystem } from '../subsystems/spatial-graph-system'
import type {
  AdditionalWorldContextOptions,
  WorldCommitResult,
  WorldContextCreationOptions,
} from './contracts'

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
  if (!coherentConfig.powerFramework) throw new Error('世界配置缺少已定义的力量框架')
  const framework = materializePowerFramework(coherentConfig.powerFramework, {
    contextId,
    powerSystemTag: coherentConfig.powerSystemTag,
    source: coherentConfig.powerFramework.source,
  })
  assertValidPowerFramework(framework)
  const coherentConfigWithFramework = { ...coherentConfig, powerFramework: framework }
  const resolvedConfig = isCompleteWorldScoringProfile(coherentConfigWithFramework.scoringProfile)
    && coherentConfigWithFramework.scoringProfile.worldId === contextId
    ? coherentConfigWithFramework
    : {
        ...coherentConfigWithFramework,
        scoringProfile: buildFallbackWorldScoringProfile(coherentConfigWithFramework, contextId),
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
  const snapshot = new WorldInitSystem().initialize(resolvedConfig, {
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
    regionProfilesGenerated: true,
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
    if (source && target) getSpatialGraphSystem().addCrossContextExit(createCrossContextExit(source, target))
  }

  const formattedTags = formatWorldTagsText(snapshot.tags)
  console.info(
    `[mod-world] 世界 "${config.name}" 本地初始化完成（编码 ${worldCode}，区域 ${snapshot.regions.length}）`,
  )
  const stored = useWorldStore.getState().contexts[contextId]
  const storedSnapshot: WorldSnapshot = stored
    ? {
        contextId,
        rootSpatialNodeId: stored.record.rootSpatialNodeId,
        worldConfig: structuredClone(stored.worldConfig),
        regions: structuredClone(stored.regions),
        tags: structuredClone(stored.tags),
      }
    : snapshot
  return { contextId, config: resolvedConfig, snapshot: storedSnapshot, worldCode, formattedTags }
}

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
