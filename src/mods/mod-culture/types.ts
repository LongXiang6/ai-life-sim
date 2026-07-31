/** Culture-domain runtime contracts. Subsystems own state; Zustand is projection only. */

export type EducationSystemType = 'oral' | 'household' | 'guild' | 'religious' | 'school' | 'network'
export type EducationQuality = 'poor' | 'adequate' | 'good' | 'excellent'
export type EducationLevel = 'none' | 'elite' | 'basic' | 'universal' | 'advanced'
export type EducationDirection = 'general' | 'vocational' | 'classical' | 'scientific' | 'mystical'

export interface EducationState {
  contextId: string
  systemType: EducationSystemType
  institutions: string[]
  literacyRate: number
  educationAccess: number
  researchCapacity: number
  knowledgeSpreadRate: number
  educationDirection: EducationDirection
  educationLevel: EducationLevel
  literacyByClass: Record<'elite' | 'middle' | 'common', number>
  worldview: string
  updatedAtTotalDays: number
}

export type CulturalValue =
  | 'collectivism'
  | 'individualism'
  | 'hierarchy'
  | 'egalitarianism'
  | 'militarism'
  | 'pacifism'
  | 'spiritualism'
  | 'materialism'

export interface Festival {
  name: string
  date: string
  description: string
  importance: number
  worldTypes?: string[]
  frequencyYears?: number
  lastTriggeredYear?: number
  effects?: Record<string, number>
}

export interface Ritual {
  name: string
  category: 'birth' | 'coming_of_age' | 'marriage' | 'death' | 'harvest' | 'war' | 'worship'
  description: string
  worldTypes?: string[]
  triggerCondition?: string
  traditionImpact?: number
}

export interface Taboo {
  action: string
  severity: 'mild' | 'moderate' | 'severe' | 'capital'
  consequence: string
  worldTypes?: string[]
  traditionImpactOnViolation?: number
}

export type CustomCategory = 'greeting' | 'coming_of_age' | 'marriage' | 'funeral'

export interface Custom {
  name: string
  category: CustomCategory
  description: string
  worldTypes?: string[]
  frequencyYears?: number
  lastTriggeredYear?: number
  effects?: Record<string, number>
  traditionImpact?: number
}

export interface NotableEvent {
  year: number
  type: 'custom'
  customCategory: CustomCategory
  name: string
  description: string
  impact: Record<string, number>
}

export interface CultureState {
  contextId: string
  cultureName: string
  traditionStrength: number
  reformResistance: number
  culturalInertia: number
  reformPressure: number
  values: Record<CulturalValue, number>
  festivals: Festival[]
  rituals: Ritual[]
  taboos: Taboo[]
  customs: Custom[]
  notableEvents: NotableEvent[]
  artProsperity: number
  updatedAtTotalDays: number
}

export type ArtForm = 'literature' | 'painting' | 'music' | 'sculpture' | 'architecture' | 'theater' | 'dance'

/** Art owns the local creative ecosystem. Concrete works belong to WorksState. */
export interface ArtState {
  contextId: string
  currentStyles: string[]
  patronageLevel: number
  prestige: number
  innovationIndex: number
  worldview: string
  updatedAtTotalDays: number
}

export type WorkStatus = 'in_progress' | 'completed' | 'lost'
export type WorkCategory = 'biography' | 'novel' | 'treatise' | 'poetry' | 'art' | 'craft' | 'code' | 'paper' | 'holo'

export interface WorksEntry {
  id: string
  title: string
  category: WorkCategory
  status: WorkStatus
  progress: number
  authorEntityIds: string[]
  originContextId: string
  startedAtTotalDays: number
  completedAtTotalDays?: number
  influence: number
  tags: string[]
}

export interface WorksState {
  contextId: string
  works: WorksEntry[]
  nextId: number
  updatedAtTotalDays: number
}

export interface CultureSummary {
  education: EducationState
  culture: CultureState
  art: ArtState
  works: WorksState
}

export interface EducationPersistenceState { schemaVersion: 1; contexts: Record<string, EducationState> }
export interface CulturePersistenceState { schemaVersion: 1; contexts: Record<string, CultureState> }
export interface ArtPersistenceState { schemaVersion: 1; contexts: Record<string, ArtState> }
export interface WorksPersistenceState { schemaVersion: 1; contexts: Record<string, WorksState> }
