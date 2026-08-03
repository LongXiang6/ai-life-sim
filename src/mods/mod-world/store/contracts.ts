/**
 * Purpose: Define the canonical Zustand world Store state, actions, and initial values.
 * Owner: mod-world / world Store.
 * Responsibility: Store contract only; normalization and action implementation stay separate.
 */

import type {
  ContextTransitionRecord,
  EntityReference,
  GlobalEntityId,
  SpatialEdge,
} from '@/foundation'
import type {
  AnyWorldEntity,
  FormulaModifierKey,
  WorldCalibration,
  WorldConfig,
  WorldContextInstance,
  WorldInitAIStatus,
} from '../types'

export interface WorldStore {
  contexts: Record<string, WorldContextInstance>
  currentContextId: string | null
  crossContextEdges: Record<string, SpatialEdge>
  transitionHistory: ContextTransitionRecord[]
  entityReferences: Record<GlobalEntityId, EntityReference>
  worldConfig: WorldConfig | null
  entities: AnyWorldEntity[]
  initialized: boolean
  worldCode: number
  currentYear: number
  worldTags: string[]
  eraStartYear: number
  eraName: string
  calibration: WorldCalibration | null
  destinyPatternModifiers: Partial<Record<FormulaModifierKey, number>>
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
  generateAndSetWorldCode: () => number
  recycleWorldCode: () => void
  reset: () => void
}

export const initialWorldState = {
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
