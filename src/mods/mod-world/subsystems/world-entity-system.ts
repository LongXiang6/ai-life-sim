/**
 * Purpose: Expose the world-entity subsystem and coordinate its owned collaborators.
 * Owner: mod-world / world-entity.
 * Responsibility: Subsystem lifecycle, generation adoption, and stable public directory methods.
 */

import type {
  EntityReference,
  EntityReferenceDirectoryPersistenceState,
  EntityReferenceKind,
  GlobalEntityId,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'
import { BaseSubsystem, eventBus, saveStore } from '@/core'

import type { AnyWorldEntity, RegionData, WorldConfig } from '../types'
import { useWorldStore } from '../store'
import {
  isWorldInitAIAvailable,
  shouldUseStaticEntityFallback,
} from '../utils/world-init-fallback'
import { generateAIEntities } from './world-entity-system/ai-entity-generation'
import {
  assertEntityReference,
  buildContextTransitionDirectory,
  capturePersistenceState,
  capturePreviewState,
  ensureEntityDirectoryValidated,
  getEntityReference,
  listEntityReferences,
  registerEntityReference,
  repairEntityReferenceDirectory,
  restorePersistenceState,
  restorePreviewState,
} from './world-entity-system/entity-reference-directory'
import { generateStaticEntities } from './world-entity-system/static-entity-generation'

interface InternalState {
  entities: AnyWorldEntity[]
}

export class WorldEntitySystem extends BaseSubsystem {
  readonly id = 'world-entity' as const
  readonly mod = 'mod-world' as const
  readonly label = '具名实体生成' as const
  readonly description = '生成世界的国家、势力、贵族世家、定居点和商路' as const

  private state: InternalState = { entities: [] }
  private regions: RegionData[] = []
  private callAI: ((prompt: string, extraUserMessages?: string[]) => Promise<string>) | null = null
  private worldName = ''
  private worldDescription = ''
  private civilizationStage = ''
  private coherenceHint = ''
  private coherenceNote = ''
  private worldType = 'idealist'
  private worldTags = ''
  private calibrationSummary = ''
  private entityRanges = ''
  private mapRegions = ''

  setAIService(callAI: (prompt: string, extraUserMessages?: string[]) => Promise<string>): void {
    this.callAI = callAI
  }

  setWorldContext(
    name: string,
    description: string,
    civilizationStage?: string,
    coherenceHint?: string,
    coherenceNote?: string,
    worldType?: string,
    worldTags?: string,
    calibrationSummary?: string,
    entityRanges?: string,
    mapRegions?: string,
  ): void {
    this.worldName = name
    this.worldDescription = description
    this.civilizationStage = civilizationStage ?? ''
    this.coherenceHint = coherenceHint ?? ''
    this.coherenceNote = coherenceNote ?? ''
    this.worldType = worldType ?? 'idealist'
    this.worldTags = worldTags ?? ''
    this.calibrationSummary = calibrationSummary ?? ''
    this.entityRanges = entityRanges ?? ''
    this.mapRegions = mapRegions ?? ''
  }

  hasAIService(): boolean {
    return this.callAI !== null
  }

  setRegions(regions: RegionData[]): void {
    this.regions = regions
  }

  getRegions(): RegionData[] {
    return this.regions
  }

  async generateEntities(config: WorldConfig): Promise<AnyWorldEntity[]> {
    if (this.callAI && this.worldName) {
      const aiEntities = await generateAIEntities(config, {
        calibrationSummary: this.calibrationSummary,
        civilizationStage: this.civilizationStage,
        coherenceHint: this.coherenceHint,
        coherenceNote: this.coherenceNote,
        entityRanges: this.entityRanges,
        existingEntities: this.state.entities,
        mapRegions: this.mapRegions,
        regions: this.regions,
        requestAI: this.callAI,
        worldDescription: this.worldDescription,
        worldName: this.worldName,
        worldTags: this.worldTags,
        worldType: this.worldType,
      })
      if (aiEntities && aiEntities.length > 0) return this.adoptGeneratedEntities(aiEntities)
      if (isWorldInitAIAvailable()) return []
    }

    if (!shouldUseStaticEntityFallback()) return []
    const entities = generateStaticEntities({
      calibration: useWorldStore.getState().calibration,
      config,
      regions: this.regions,
    })
    this.state.entities = entities
    if (this.regions.length === 0) return entities
    return this.adoptGeneratedEntities(entities)
  }

  private adoptGeneratedEntities(entities: AnyWorldEntity[]): AnyWorldEntity[] {
    this.state.entities = entities
    eventBus.emit('mod-world:entities-generated', entities)
    useWorldStore.getState().setEntities(entities)
    this.state.entities = structuredClone(useWorldStore.getState().entities)
    return this.state.entities
  }

  getEntities(): AnyWorldEntity[] {
    const state = useWorldStore.getState()
    const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
    return structuredClone(instance?.entities ?? this.state.entities)
  }

  getEntitiesByType<T extends AnyWorldEntity>(type: T['type']): T[] {
    return this.getEntities().filter((entity) => entity.type === type) as T[]
  }

  registerEntityReference(reference: EntityReference): EntityReference {
    return registerEntityReference(reference)
  }

  getEntityReference(entityId: GlobalEntityId): EntityReference | undefined {
    return getEntityReference(entityId)
  }

  listEntityReferences(): EntityReference[] {
    return listEntityReferences()
  }

  buildContextTransitionDirectory(input: {
    movedEntityIds: readonly GlobalEntityId[]
    sourceContextId: string
    targetContextId: string
    actorEntityId: GlobalEntityId
    globalTotalDays: number
  }): Record<GlobalEntityId, EntityReference> {
    return buildContextTransitionDirectory(input)
  }

  assertEntityReference(
    entityId: GlobalEntityId,
    allowedKinds?: readonly EntityReferenceKind[],
  ): EntityReference {
    return assertEntityReference(entityId, allowedKinds)
  }

  capturePersistenceState(): EntityReferenceDirectoryPersistenceState {
    return capturePersistenceState()
  }

  restorePersistenceState(snapshot: unknown): void {
    restorePersistenceState(snapshot)
  }

  capturePreviewState(): EntityReferenceDirectoryPersistenceState {
    return capturePreviewState()
  }

  restorePreviewState(snapshot: unknown): void {
    restorePreviewState(snapshot)
  }

  repairEntityReferenceDirectory(): { fallbackEntityIds: string[] } {
    return repairEntityReferenceDirectory()
  }

  saveEntities(worldCode: number): void {
    if (typeof window === 'undefined') return
    try {
      saveStore.set('mod-world', 0, `entities:${worldCode}`, this.state.entities)
    } catch (error) {
      console.warn('world-entity: 实体数据写入失败', error)
    }
  }

  async loadEntities(worldCode: number): Promise<AnyWorldEntity[]> {
    if (typeof window === 'undefined') return []
    try {
      const entities = saveStore.get<AnyWorldEntity[]>('mod-world', 0, `entities:${worldCode}`)
      if (!entities) return []
      this.state.entities = entities
      return entities
    } catch {
      return []
    }
  }

  collectState(context: RoundContext): SubSystemState {
    ensureEntityDirectoryValidated()
    const instance = useWorldStore.getState().contexts[context.contextId]
    const entities = instance?.entities ?? this.state.entities
    const count = entities.length
    const summary = count > 0
      ? `实体：${count} 个（${entities.filter((entity) => entity.type === 'nation').length} 国家，${entities.filter((entity) => entity.type === 'faction').length} 势力，${entities.filter((entity) => entity.type === 'settlement').length} 定居点）`
      : ''
    return {
      id: this.id,
      summary,
      data: {
        contextId: context.contextId,
        entities: structuredClone(entities),
        entityReferenceCount: listEntityReferences().length,
      },
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Invalid changes`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object') throw new Error(`[${this.id}] Invalid changes.changes`)
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    void context
  }

  reset(): void {
    this.state = { entities: [] }
    this.regions = []
    this.callAI = null
    this.worldName = ''
    this.worldDescription = ''
  }

  hydrateFromStore(): void {
    this.restoreCollectedState({ entities: useWorldStore.getState().entities })
  }

  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const entities = (snapshot as { entities?: unknown }).entities
    if (!Array.isArray(entities)) return
    this.state = { entities: structuredClone(entities) as AnyWorldEntity[] }
    useWorldStore.getState().setEntities(this.state.entities)
  }
}

let runtimeWorldEntitySystem: WorldEntitySystem | undefined

export function getWorldEntitySystem(): WorldEntitySystem {
  runtimeWorldEntitySystem ??= new WorldEntitySystem()
  return runtimeWorldEntitySystem
}
