/**
 * @module store.ts
 * @description 世界 Zustand Store —— 全局暴露世界配置、具名实体、时间线
 * @mod mod-world
 */

'use client'

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  WorldConfig,
  AnyWorldEntity,
  WorldCalibration,
  FormulaModifierKey,
  WorldContextInstance,
  WorldInitAIStatus,
} from './types'
import type {
  ContextTransitionRecord,
  EntityReference,
  GlobalEntityId,
  SimulationScope,
  SpatialEdge,
} from '@/foundation'
import {
  deriveCapabilityProfile,
  normalizeWorldEntitiesForContext,
  projectWorldContextInstance,
} from './utils/world-context-runtime'
import { sanitizeWorldStateSnapshot } from './utils/world-state-migration'

/** 生成世界唯一编码（时间戳 + 随机数） */
export function generateWorldCode(): number {
  const ts = Date.now() % 10_000_000_000
  const rand = Math.floor(Math.random() * 10_000,)
  return ts * 10_000 + rand
}

interface WorldStore {
  /** P0 存档级世界上下文注册表；完整状态真源 */
  contexts: Record<string, WorldContextInstance>
  /** 当前投影所属的稳定上下文 ID */
  currentContextId: string | null
  /** 跨上下文出口；不属于任一旧地图单例 */
  crossContextEdges: Record<string, SpatialEdge>
  /** 完整切换审计记录；不得按固定容量删除 */
  transitionHistory: ContextTransitionRecord[]
  /** P2 global entity-reference directory; business state remains with each owner. */
  entityReferences: Record<GlobalEntityId, EntityReference>

  /** 当前世界配置 */
  worldConfig: WorldConfig | null
  /** 具名实体列表 */
  entities: AnyWorldEntity[]
  /** 世界是否已初始化 */
  initialized: boolean
  /** 当前世界编码 */
  worldCode: number
  /** 当前世纪年份（从引擎轮数转换） */
  currentYear: number
  /** 世界标签（AI 生成） */
  worldTags: string[]
  /** 时间线起始年份（来自世界预设 eraStartYear） */
  eraStartYear: number
  /** 纪元名称（来自世界预设 eraName，空字符串时由引擎自动生成） */
  eraName: string

  /** AI 世界校准（Step 0） */
  calibration: WorldCalibration | null

  /** 命格选取后叠加的运行时公式 modifier（乘法） */
  destinyPatternModifiers: Partial<Record<FormulaModifierKey, number>>

  /** AI 初始化状态（静默生成 → fate-preview 门控） */
  worldInitAIStatus: WorldInitAIStatus | null

  setWorldConfig: (config: WorldConfig) => void
  setEntities: (entities: AnyWorldEntity[]) => void
  setInitialized: (value: boolean) => void
  setWorldCode: (code: number) => void
  setCurrentYear: (year: number) => void
  setWorldTags: (tags: string[]) => void
  setEraStartYear: (year: number) => void
  setEraName: (name: string) => void
  setCalibration: (calibration: WorldCalibration | null) => void
  setDestinyPatternModifiers: (modifiers: Partial<Record<FormulaModifierKey, number>>) => void
  setWorldInitAIStatus: (status: WorldInitAIStatus | null) => void
  registerContext: (instance: WorldContextInstance, makeActive?: boolean) => void
  replaceContext: (instance: WorldContextInstance) => void
  setCrossContextEdge: (edge: SpatialEdge) => void
  recordTransition: (record: ContextTransitionRecord) => void
  registerEntityReference: (reference: EntityReference) => void
  replaceEntityReferences: (references: EntityReference[]) => void
  /** 生成并设置新的世界编码 */
  generateAndSetWorldCode: () => number
  /** 回收当前世界编码（清除 store 中的编码） */
  recycleWorldCode: () => void
  reset: () => void,
}

const initialState = {
  contexts: {} as Record<string, WorldContextInstance>,
  currentContextId: null as string | null,
  crossContextEdges: {} as Record<string, SpatialEdge>,
  transitionHistory: [] as ContextTransitionRecord[],
  entityReferences: {} as Record<GlobalEntityId, EntityReference>,
  worldConfig: null as WorldConfig | null,
  entities: [] as AnyWorldEntity[],
  initialized: false,
  worldCode: 0,
  currentYear: 0,
  worldTags: [] as string[],
  eraStartYear: 0,
  eraName: '',
  calibration: null as WorldCalibration | null,
  destinyPatternModifiers: {} as Partial<Record<FormulaModifierKey, number>>,
  worldInitAIStatus: null as WorldInitAIStatus | null,
}

function normalizeEntityReference(reference: EntityReference): EntityReference {
  if (!reference.entityId.trim()) throw new Error('实体引用缺少稳定实体 ID')
  if (!reference.displayName.trim()) throw new Error(`实体引用 ${reference.entityId} 缺少显示标签`)
  if (!['player', 'npc', 'organization'].includes(reference.kind)) {
    throw new Error(`实体引用 ${reference.entityId} 的种类无效`)
  }
  if (!Number.isInteger(reference.registeredAtTotalDays) || reference.registeredAtTotalDays < 0) {
    throw new Error(`实体引用 ${reference.entityId} 的登记时间无效`)
  }
  const contextIds = [...new Set(reference.contextIds)]
  if (contextIds.some((contextId) => !contextId.trim())) {
    throw new Error(`实体引用 ${reference.entityId} 含空上下文 ID`)
  }
  return {
    ...structuredClone(reference),
    contextIds,
  }
}

function mergeEntityReference(
  directory: Record<GlobalEntityId, EntityReference>,
  reference: EntityReference,
): Record<GlobalEntityId, EntityReference> {
  const normalized = normalizeEntityReference(reference)
  const existing = directory[normalized.entityId]
  if (existing && existing.kind !== normalized.kind) {
    throw new Error(`实体引用 ${normalized.entityId} 的种类冲突`)
  }
  return {
    ...directory,
    [normalized.entityId]: {
      ...normalized,
      contextIds: [...new Set([...(existing?.contextIds ?? []), ...normalized.contextIds])],
      registeredAtTotalDays: existing?.registeredAtTotalDays ?? normalized.registeredAtTotalDays,
    },
  }
}

function mergeContextOrganizations(
  directory: Record<GlobalEntityId, EntityReference>,
  instance: WorldContextInstance,
): Record<GlobalEntityId, EntityReference> {
  let next = directory
  for (const entity of instance.entities) {
    next = mergeEntityReference(next, {
      entityId: entity.id,
      kind: 'organization',
      displayName: entity.name,
      contextIds: [instance.record.id],
      registeredAtTotalDays: instance.record.createdAtGlobalDay,
    })
  }
  return next
}

function updateCurrentContext(
  state: WorldStore,
  update: (instance: WorldContextInstance) => WorldContextInstance,
): Pick<WorldStore, 'contexts'> {
  const id = state.currentContextId
  if (!id || !state.contexts[id]) return { contexts: state.contexts }
  return {
    contexts: {
      ...state.contexts,
      [id]: update(structuredClone(state.contexts[id])),
    },
  }
}

function deriveUpdatedCapabilityProfile(instance: WorldContextInstance, config: WorldConfig) {
  const confirmedCapabilities = instance.capabilityProfile.derivedFrom === 'confirmed-facts'
    ? instance.capabilityProfile.capabilities
    : undefined
  return deriveCapabilityProfile(
    instance.record.id,
    config,
    instance.capabilityProfile.derivedFrom,
    confirmedCapabilities,
  )
}

function lifecycleForScope(scope: SimulationScope): WorldContextInstance['record']['lifecycle'] {
  if (scope === 'closed') return 'closed'
  if (scope === 'dormant') return 'dormant'
  return 'open'
}

export const useWorldStore = create<WorldStore>()(
  persist(
    (set,) => ({
      ...initialState,

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
      reset: () => set({ ...initialState, },),
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
