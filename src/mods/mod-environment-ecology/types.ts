import type { DecimalInteger, SpatialNodeId } from '@/foundation'

export type ClimateZone = 'tropical' | 'subtropical' | 'temperate' | 'boreal' | 'polar' | 'arid' | 'mediterranean'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type DisasterType = 'flood' | 'drought' | 'earthquake' | 'tsunami' | 'volcano' | 'storm' | 'blizzard' | 'wildfire' | 'plague' | 'locust'

export interface Disaster {
  id: string
  type: DisasterType
  severity: number
  affectedNodeIds: SpatialNodeId[]
  startedAtTotalDays: number
  endsAtTotalDays: number
  evidenceEventIds: string[]
}

export interface SeasonEffect {
  diseaseRiskMultiplier: number
  incomeMultiplier: number
  staminaCostMultiplier: number
  healthRegenMultiplier: number
  narrativeTheme: string
}

export interface SpecialSeason { name: string; description: string }

export interface ClimateState {
  contextId: string
  temperatureOffset: number
  humidity: number
  season: Season
  seasonProgress: number
  seasonEffects: SeasonEffect
  specialSeason: SpecialSeason | null
  activeDisasters: Disaster[]
  climateZones: Record<SpatialNodeId, ClimateZone>
  updatedAtTotalDays: number
}

export type SpeciesCategory = 'plant' | 'animal' | 'monster' | 'spirit' | 'alien' | 'mutant'
export type SpeciesRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export interface EcologyMetrics {
  biodiversityIndex: number
  resilience: number
  habitatIntegrity: number
  foodChainStability: number
}

export interface SpeciesEntry {
  id: string
  name: string
  category: SpeciesCategory
  rarity: SpeciesRarity
  habitatNodeIds: SpatialNodeId[]
  population: DecimalInteger
  carryingCapacity: DecimalInteger
  annualGrowthPerMillion: number
  extinctionThreat: number
  endangered: boolean
  role: 'predator' | 'prey' | 'producer' | 'decomposer' | 'keystone'
  updatedAtTotalDays: number
}

export interface EcologyState {
  contextId: string
  metrics: EcologyMetrics
  species: SpeciesEntry[]
  invasiveSpeciesIds: string[]
  extinctionEvents: string[]
  overexploitationYears: number
  updatedAtTotalDays: number
}

export type PollutionLevel = 0 | 1 | 2 | 3 | 4 | 5
export type IndustryType = 'agriculture' | 'mining' | 'manufacturing' | 'magic' | 'military' | 'trade' | 'service' | 'mixed'

export interface RegionPollution {
  nodeId: SpatialNodeId
  pollutionIndex: number
  level: PollutionLevel
  annualEmission: number
  annualDecay: number
  industryType: IndustryType
}

export interface PollutionState {
  contextId: string
  regionPollutions: Record<SpatialNodeId, RegionPollution>
  globalPollutionIndex: number
  updatedAtTotalDays: number
}

export interface EnvironmentEcologySummary { climate: ClimateState; ecology: EcologyState; pollution: PollutionState }

export interface SpeciesTemplate {
  name: string
  category: SpeciesCategory
  rarity: SpeciesRarity
  region: string
  maxPopulation: number
  compatibleWorldviews: string[]
  role: SpeciesEntry['role']
}

export interface ClimatePersistenceState { schemaVersion: 1; contexts: Record<string, ClimateState> }
export interface EcologyPersistenceState { schemaVersion: 1; contexts: Record<string, EcologyState> }
export interface PollutionPersistenceState { schemaVersion: 1; contexts: Record<string, PollutionState> }
