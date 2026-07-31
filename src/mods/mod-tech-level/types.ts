export type KnowledgeDomainId = 'food' | 'materials' | 'energy' | 'health' | 'governance' | 'information' | 'transport' | 'space'
export interface KnowledgeDomain {
  id: KnowledgeDomainId | string
  label: string
  maturity: number
  diffusion: number
  annualResearchCapacity: number
  applications: string[]
  updatedAtTotalDays: number
}
export type CultureTrendCategory = 'art' | 'philosophy' | 'science' | 'military' | 'commerce' | 'religion'
export interface CultureTrend { id: string; type: CultureTrendCategory; name: string; intensity: number; remainingDays: number; originContextId: string }
export interface CultureTechState {
  contextId: string
  researchCapacity: number
  domains: KnowledgeDomain[]
  activeTrends: CultureTrend[]
  knowledgeBonus: number
  workQualityBonus: number
  lastUpdateTotalDays: number
  activeEvents: string[]
}

/** Industry/resource read models are intentionally not runtime owners anymore. */
export interface IndustryState { initialized: boolean; primaryFocus: string; productivityMultiplier: number; techAdoptionRate: number }
export interface RegionResource { type: string; abundance: number; quality: number }
export interface ResourceDistributionState { initialized: boolean; regionalResources: Record<string, RegionResource[]>; globalScarcity: number }
export interface TechLevelSummary { cultureTech: CultureTechState }
export interface CultureTechPersistenceState { schemaVersion: 1; contexts: Record<string, CultureTechState> }
export type PrimaryFocus = string
export type TerrainType = string
export type ResourceRangeEntry = { type: string; abundance: [number, number] }
