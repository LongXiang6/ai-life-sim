/**
 * Purpose: Define the six-domain structured world-tag contract and narrative constraints.
 * Owner: mod-world / world tags.
 * Responsibility: Tag shapes only; default catalogs and formatting stay outside.
 */

export interface SocietyTags {
  socialClass: string
  politicalStability: string
  factionDensity: string
  urbanization: string
  legalSystem: string
  educationLevel: string
  familyStructure: string
}

export interface EnvironmentTags {
  disasterFrequency: string
  climateType: string
  terrainType: string
  resourceAbundance: string
  biomeDiversity: string
  pollutionLevel: string
}

export interface EconomyTags {
  economyType: string
  wealthDistribution: string
  tradeNetwork: string
  currencySystem: string
  techLevel: string
  industryFocus: string
}

export interface SupernaturalTags {
  powerSystem: string
  powerDensity: string
  powerAccessibility: string
  divineActivity: string
  monsterPresence: string
  cultivationCeiling: string
  supernaturalTaboo: string
}

export interface DemographicsTags {
  populationDensity: string
  raceDiversity: string
  lifespanBaseline: string
  healthLevel: string
  literacyRate: string
  socialMobility: string
}

export interface CulturalFabricTags {
  honorImportance: string
  artStyle: string
  religiousInfluence: string
  traditionStrength: string
  innovationRate: string
  culturalDiversity: string
  narrativeTone: string
}

export interface WorldTagConstraints {
  hardForbidden: string[]
  softForbidden: string[]
  narrativeRules: string[]
}

export interface WorldTagsV2 {
  worldview: string
  society: SocietyTags
  environment: EnvironmentTags
  economy: EconomyTags
  supernatural: SupernaturalTags
  demographics: DemographicsTags
  culturalFabric: CulturalFabricTags
  constraints: WorldTagConstraints
}
