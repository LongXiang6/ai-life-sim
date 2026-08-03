/**
 * Purpose: Implement the persistent Zustand Store that owns world and context projections.
 * Owner: mod-world / world Store.
 * Responsibility: Store actions and persistence wiring; contracts and normalization helpers are delegated.
 */

'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EntityReference, GlobalEntityId } from '@/foundation'
import {
  normalizeWorldEntitiesForContext,
  projectWorldContextInstance,
} from './utils/world-context-runtime'
import { sanitizeWorldStateSnapshot } from './utils/world-state-migration'
import { initialWorldState, type WorldStore } from './store/contracts'
import {
  deriveUpdatedCapabilityProfile,
  lifecycleForScope,
  mergeContextOrganizations,
  mergeEntityReference,
  normalizeEntityReference,
  updateCurrentContext,
} from './store/helpers'

export function generateWorldCode(): number {
  const timestamp = Date.now() % 10_000_000_000
  const random = Math.floor(Math.random() * 10_000)
  return timestamp * 10_000 + random
}

export const useWorldStore = create<WorldStore>()(
  persist(
    (set,) => ({
      ...initialWorldState,

      setWorldConfig: (config,) => set((s,) => {
        const worldCode = s.worldCode === 0 ? generateWorldCode() : s.worldCode
        return {
          worldConfig: config,
          worldCode,
          ...updateCurrentContext(s, (instance) => ({
            ...instance,
            worldConfig: structuredClone(config),
            worldCode,
            capabilityProfile: deriveUpdatedCapabilityProfile(instance, config),
            record: {
              ...instance.record,
              name: config.name,
              description: config.description,
              legacyWorldCode: worldCode || instance.record.legacyWorldCode,
            },
          })),
        }
      }),
      setEntities: (entities,) => set((s) => {
        const instance = s.currentContextId ? s.contexts[s.currentContextId] : undefined
        const normalized = instance
          ? normalizeWorldEntitiesForContext(instance.record.id, entities, instance.regions)
          : entities
        const entityReferences = instance
          ? mergeContextOrganizations(s.entityReferences, {
              ...instance,
              entities: normalized,
            })
          : s.entityReferences
        return {
          entities: normalized,
          entityReferences,
          ...updateCurrentContext(s, (current) => {
            const entityLocations = { ...current.spatialGraph.entityLocations }
            for (const previousEntity of current.entities) delete entityLocations[previousEntity.id]
            for (const entity of normalized) {
              const nodeId = entity.regionId && current.spatialGraph.nodes[entity.regionId]
                ? entity.regionId
                : current.record.rootSpatialNodeId
              entityLocations[entity.id] = {
                entityId: entity.id,
                contextId: current.record.id,
                nodeId,
                updatedAtGlobalDay: current.record.localClock.lastGlobalTotalDays,
              }
            }
            return {
              ...current,
              entities: structuredClone(normalized),
              spatialGraph: { ...current.spatialGraph, entityLocations },
            }
          }),
        }
      }),
      setInitialized: (value,) => set((s) => ({
        initialized: value,
        ...updateCurrentContext(s, (instance) => ({ ...instance, initialized: value })),
      }),),
      setWorldCode: (code,) => set((s) => ({
        worldCode: code,
        ...updateCurrentContext(s, (instance) => ({
          ...instance,
          worldCode: code,
          record: { ...instance.record, legacyWorldCode: code || undefined },
        })),
      }),),
      setCurrentYear: (year,) => set((s) => ({
        currentYear: year,
        ...updateCurrentContext(s, (instance) => ({ ...instance, currentYear: year })),
      }),),
      setWorldTags: (tags,) => set((s) => ({
        worldTags: tags,
        ...updateCurrentContext(s, (instance) => ({ ...instance, worldTags: [...tags] })),
      }),),
      setEraStartYear: (year,) => set((s) => ({
        eraStartYear: year,
        ...updateCurrentContext(s, (instance) => ({ ...instance, eraStartYear: year })),
      }),),
      setEraName: (eraName,) => set((s) => ({
        eraName,
        ...updateCurrentContext(s, (instance) => ({ ...instance, eraName })),
      }),),
      setCalibration: (calibration,) => set((s) => ({
        calibration,
        ...updateCurrentContext(s, (instance) => ({ ...instance, calibration: structuredClone(calibration) })),
      }),),
      setDestinyPatternModifiers: (destinyPatternModifiers,) => set((s) => ({
        destinyPatternModifiers,
        ...updateCurrentContext(s, (instance) => ({
          ...instance,
          destinyPatternModifiers: { ...destinyPatternModifiers },
        })),
      }),),
      setWorldInitAIStatus: (status) => set((s) => ({
        worldInitAIStatus: status,
        ...updateCurrentContext(s, (instance) => ({
          ...instance,
          worldInitAIStatus: structuredClone(status),
        })),
      }),),
      registerContext: (input, makeActive = false) => set((s) => {
        const instance = structuredClone(input)
        const existing = s.contexts[instance.record.id]
        if (instance.scope.contextId !== instance.record.id || instance.spatialGraph.contextId !== instance.record.id) {
          throw new Error(`上下文内部 ID 不一致：${instance.record.id}`)
        }
        if (existing && s.currentContextId !== instance.record.id) {
          throw new Error(`上下文 ID 冲突：${instance.record.id}`)
        }
        if (makeActive && instance.scope.scope === 'closed') {
          throw new Error('已关闭上下文不能通过注册入口重新激活')
        }
        if (makeActive && s.currentContextId && s.currentContextId !== instance.record.id) {
          throw new Error('已有 active 上下文时，新上下文必须先注册为非 active，再通过上下文切换系统进入')
        }
        if (!makeActive && s.currentContextId === instance.record.id) {
          throw new Error('当前 active 上下文只能由激活注册更新，不能降级为非 active')
        }
        if (!makeActive && instance.scope.scope === 'active') {
          instance.scope = { ...instance.scope, scope: 'dormant', reason: '未激活的新上下文' }
        }
        instance.record = {
          ...instance.record,
          lifecycle: lifecycleForScope(makeActive ? 'active' : instance.scope.scope),
        }
        const contexts = { ...s.contexts, [instance.record.id]: instance }
        const entityReferences = mergeContextOrganizations(s.entityReferences, instance)
        if (!makeActive) return { contexts, entityReferences }

        contexts[instance.record.id] = {
          ...instance,
          scope: { ...instance.scope, scope: 'active', reason: '当前玩家上下文' },
          record: { ...instance.record, lifecycle: 'open' },
        }
        return {
          contexts,
          entityReferences,
          currentContextId: instance.record.id,
          ...projectWorldContextInstance(contexts[instance.record.id]),
        }
      }),
      replaceContext: (instance) => set((s) => {
        const next = structuredClone(instance)
        if (next.scope.contextId !== next.record.id || next.spatialGraph.contextId !== next.record.id) {
          throw new Error(`上下文内部 ID 不一致：${next.record.id}`)
        }
        if (next.record.id === s.currentContextId && next.scope.scope !== 'active') {
          throw new Error('当前上下文必须保持 active；离开当前上下文只能通过上下文切换系统')
        }
        if (next.record.id !== s.currentContextId && next.scope.scope === 'active') {
          throw new Error('非当前上下文不能设为 active；进入上下文只能通过上下文切换系统')
        }
        next.record.lifecycle = lifecycleForScope(next.scope.scope)
        const contexts = { ...s.contexts, [next.record.id]: next }
        const entityReferences = mergeContextOrganizations(s.entityReferences, next)
        return instance.record.id === s.currentContextId
          ? { contexts, entityReferences, ...projectWorldContextInstance(next) }
          : { contexts, entityReferences }
      }),
      setCrossContextEdge: (edge) => set((s) => ({
        crossContextEdges: { ...s.crossContextEdges, [edge.id]: structuredClone(edge) },
      })),
      recordTransition: (record) => set((s) => ({
        transitionHistory: [...s.transitionHistory, structuredClone(record)],
      })),
      registerEntityReference: (reference) => set((s) => ({
        entityReferences: mergeEntityReference(s.entityReferences, reference),
      })),
      replaceEntityReferences: (references) => set(() => {
        const entityReferences: Record<GlobalEntityId, EntityReference> = {}
        for (const reference of references) {
          if (entityReferences[reference.entityId]) {
            throw new Error(`实体引用目录存在重复 ID：${reference.entityId}`)
          }
          entityReferences[reference.entityId] = normalizeEntityReference(reference)
        }
        return { entityReferences }
      }),
      generateAndSetWorldCode: () => {
        const code = generateWorldCode()
        set((s) => ({
          worldCode: code,
          ...updateCurrentContext(s, (instance) => ({
            ...instance,
            worldCode: code,
            record: { ...instance.record, legacyWorldCode: code },
          })),
        }))
        return code
      },
      recycleWorldCode: (): void => {
        set((s) => ({
          worldCode: 0,
          ...updateCurrentContext(s, (instance) => ({
            ...instance,
            worldCode: 0,
            record: { ...instance.record, legacyWorldCode: undefined },
          })),
        }))
      },
      reset: () => set({ ...initialWorldState, },),
    }),
    {
      name: 'mod-world:persist:world-state',
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>
        if (version < 2 && state.calibration === undefined) {
          state.calibration = null
        }
        if (version < 3 && state.destinyPatternModifiers === undefined) {
          state.destinyPatternModifiers = {}
        }
        return sanitizeWorldStateSnapshot(state) as unknown as WorldStore
      },
      partialize: (state,) => {
        const {
          setWorldConfig: _a, setEntities: _b, setInitialized: _c, setWorldCode: _d,
          setCurrentYear: _e, setWorldTags: _f, setEraStartYear: _g, setEraName: _g2, setCalibration: _h2,
          entityReferences: _entityReferences,
          setWorldInitAIStatus: _h, registerContext: _l, replaceContext: _m,
          setCrossContextEdge: _p, recordTransition: _q,
          registerEntityReference: _r, replaceEntityReferences: _s,
          generateAndSetWorldCode: _i, recycleWorldCode: _j, reset: _k,
          ...rest
        } = state
        return rest
      },
    },
  ),
)
