/**
 * Purpose: Define named world entities, regions, and region-generation template contracts.
 * Owner: mod-world / world-entity and world-init.
 * Responsibility: Entity and region shapes only; Store ownership and generation behavior stay outside.
 */

export interface WorldEntity {
  id: string
  localId?: string
  contextId?: string
  name: string
  type: 'nation' | 'faction' | 'nobleHouse' | 'settlement' | 'tradeRoute'
  regionId?: string
  description: string
  attributes: Record<string, unknown>
}

export interface Nation extends WorldEntity {
  type: 'nation'
  capital: string
  stability: number
}

export interface Faction extends WorldEntity {
  type: 'faction'
  factionType: 'military' | 'religious' | 'merchant' | 'academic' | 'political'
  power: number
  influenceRegionIds: string[]
  joinRequirement?: string
}

export interface NobleHouse extends WorldEntity {
  type: 'nobleHouse'
  homeRegion: string
  rank: 'duke' | 'marquis' | 'earl' | 'count' | 'baron'
  influence: number
}

export interface Settlement extends WorldEntity {
  type: 'settlement'
  tier: 'village' | 'town' | 'city' | 'metropolis'
  developmentLevel: number
}

export interface TradeRoute extends WorldEntity {
  type: 'tradeRoute'
  fromSettlementId: string
  toSettlementId: string
  prosperity: number
}

export type AnyWorldEntity = Nation | Faction | NobleHouse | Settlement | TradeRoute

export interface RegionData {
  id: string
  localId?: string
  contextId?: string
  name: string
  templateType: string
  temperature: number
  humidity: number
  terrainTag: string
  resourceDistribution: Record<string, number>
  developmentLevel: number
}

export type GenerationStrategy = 'climateLatitude' | 'concentricRings' | 'discrete' | 'cosmic' | 'abstract'

export interface MapTemplateConfig {
  label: string
  regionCount: number
  description: string
  generationStrategy: GenerationStrategy
}
