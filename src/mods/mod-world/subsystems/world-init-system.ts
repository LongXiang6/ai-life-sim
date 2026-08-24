/**
 * Purpose: Initialize a world snapshot from local configuration and selected map strategy.
 * Owner: mod-world / world-init.
 * Responsibility: Snapshot orchestration and subsystem lifecycle; region algorithms live in the sibling directory.
 */

import type {
  RoundContext,
  SubSystemChanges,
  SubSystemState,
  WorldContextKind,
} from '@/foundation'
import { BaseSubsystem, eventBus } from '@/core'

import {
  type WorldConfig,
  type WorldSnapshot,
  type WorldTagsV2,
  MAP_TEMPLATES,
  WORLDVIEW_TAG_DEFAULTS,
  combineTagDefaults,
  inferMapTemplate,
} from './world-init-deps'
import { shouldUseGenericSimulationPools } from '../utils/world-pool-selectors'
import { useWorldStore } from '../store'
import {
  contextKindUsesRegionMap,
  createGlobalEntityId,
  createWorldContextId,
  inferContextKind,
} from '../utils/world-context-runtime'
import { generateRegionsByStrategy } from './world-init-system/region-generation'

interface InternalState {
  config: WorldConfig | null
  snapshot: WorldSnapshot | null
}

export class WorldInitSystem extends BaseSubsystem {
  readonly id = 'world-init' as const
  readonly mod = 'mod-world' as const
  readonly label = '世界初始化' as const
  readonly description = '世界创建本地工厂：按本地配置生成区域与默认标签' as const

  private state: InternalState = { config: null, snapshot: null }

  initialize(
    config: WorldConfig,
    options?: {
      contextId?: string
      contextKind?: WorldContextKind
      worldCode?: number
      calibration?: ReturnType<typeof useWorldStore.getState>['calibration']
    },
  ): WorldSnapshot {
    const contextId = createWorldContextId({
      contextId: options?.contextId,
      legacyWorldCode: options?.worldCode,
    })
    const calibration = options?.calibration ?? useWorldStore.getState().calibration
    const contextKind = options?.contextKind ?? inferContextKind(config)
    const mapTemplateId = calibration?.world?.mapTemplate ?? inferMapTemplate(config)
    let template = MAP_TEMPLATES[mapTemplateId] ?? MAP_TEMPLATES.continent
    if (calibration?.world?.regionCount) {
      template = { ...template, regionCount: calibration.world.regionCount }
    }
    const regions = contextKindUsesRegionMap(contextKind)
      ? generateRegionsByStrategy(config, template, calibration)
      : []
    const snapshot: WorldSnapshot = {
      contextId,
      rootSpatialNodeId: createGlobalEntityId(contextId, 'space', 'root'),
      worldConfig: config,
      regions,
      tags: this.resolveTags(config),
    }
    this.state = { config, snapshot }
    eventBus.emit('mod-world:initialized', snapshot)
    return snapshot
  }

  private resolveTags(config: WorldConfig): WorldTagsV2 {
    if (shouldUseGenericSimulationPools()) return WORLDVIEW_TAG_DEFAULTS.mixed!
    const tag = config.essenceTag
    if (tag.includes('+')) {
      const [primary, secondary] = tag.split('+').map((part) => part.trim())
      const primaryTags = WORLDVIEW_TAG_DEFAULTS[primary]
      const secondaryTags = WORLDVIEW_TAG_DEFAULTS[secondary]
      if (primaryTags && secondaryTags) return combineTagDefaults(primaryTags, secondaryTags)
    }
    return WORLDVIEW_TAG_DEFAULTS[tag] ?? WORLDVIEW_TAG_DEFAULTS.mixed!
  }

  getSnapshot(): WorldSnapshot | null {
    return this.state.snapshot
  }

  collectState(context: RoundContext): SubSystemState {
    const instance = useWorldStore.getState().contexts[context.contextId]
    const snapshot = instance
      ? {
          contextId: instance.record.id,
          rootSpatialNodeId: instance.record.rootSpatialNodeId,
          worldConfig: instance.worldConfig,
          regions: instance.regions,
          tags: instance.tags,
        }
      : this.state.snapshot
    const status = snapshot ? '已初始化' : '未初始化'
    const contextId = snapshot?.contextId ?? '无'
    const worldName = snapshot?.worldConfig.name ?? '无'
    const regionCount = snapshot?.regions.length ?? 0
    return {
      id: this.id,
      summary: `【${this.label}：${status} | 上下文：${contextId} | 世界：${worldName} | ${regionCount} 区域】`,
      data: structuredClone(snapshot ?? {}),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
  }

  reset(): void {
    this.state = { config: null, snapshot: null }
  }

  hydrateFromStore(): void {
    const state = useWorldStore.getState()
    const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
    if (!instance) return
    this.state = {
      config: structuredClone(instance.worldConfig),
      snapshot: {
        contextId: instance.record.id,
        rootSpatialNodeId: instance.record.rootSpatialNodeId,
        worldConfig: structuredClone(instance.worldConfig),
        regions: structuredClone(instance.regions),
        tags: structuredClone(instance.tags),
      },
    }
  }
}
