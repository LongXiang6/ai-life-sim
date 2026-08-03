/**
 * Purpose: Materialize curated fallback entities and bind them to generated regions.
 * Owner: mod-world / world-entity.
 * Responsibility: Pure static entity projection; no AI calls, events, or Store writes.
 */

import type { AnyWorldEntity, EntityCountRange, RegionData, WorldCalibration, WorldConfig } from '../../types'
import { getDefaultEntitySet, type EntitySet } from './default-entity-sets'

function sliceEntitySet<T>(items: T[], range: EntityCountRange | undefined, fallbackLength: number): T[] {
  if (!range) return items.slice(0, fallbackLength)
  const count = Math.max(range.min, Math.min(range.max, items.length))
  return items.slice(0, count)
}

function trimEntitySet(set: EntitySet, calibration: WorldCalibration | null): EntitySet {
  return {
    factions: sliceEntitySet(set.factions, calibration?.entities?.factionCount, set.factions.length),
    nations: sliceEntitySet(set.nations, calibration?.entities?.nationCount, set.nations.length),
    nobleHouses: sliceEntitySet(set.nobleHouses, calibration?.entities?.nobleHouseCount, set.nobleHouses.length),
    settlements: sliceEntitySet(set.settlements, calibration?.entities?.settlementCount, set.settlements.length),
    tradeRoutes: sliceEntitySet(set.tradeRoutes, calibration?.entities?.tradeRouteCount, set.tradeRoutes.length),
  }
}

function flattenEntitySet(set: EntitySet): AnyWorldEntity[] {
  return [
    ...set.nations.map((entity) => ({ ...entity, type: 'nation' as const, regionId: '', attributes: {} })),
    ...set.factions.map((entity) => ({ ...entity, type: 'faction' as const, regionId: '', influenceRegionIds: [], attributes: {} })),
    ...set.nobleHouses.map((entity) => ({ ...entity, type: 'nobleHouse' as const, regionId: '', attributes: {} })),
    ...set.settlements.map((entity) => ({ ...entity, type: 'settlement' as const, regionId: '', attributes: {} })),
    ...set.tradeRoutes.map((entity) => ({ ...entity, type: 'tradeRoute' as const, regionId: '', prosperity: 60, attributes: {} })),
  ]
}

export function generateStaticEntities(input: {
  calibration: WorldCalibration | null
  config: WorldConfig
  regions: RegionData[]
}): AnyWorldEntity[] {
  const set = trimEntitySet(getDefaultEntitySet(input.config.essenceTag), input.calibration)
  if (input.regions.length === 0) return flattenEntitySet(set)

  const regionCount = input.regions.length
  const sortedRegionIndices = input.regions
    .map((region, index) => ({ index, developmentLevel: region.developmentLevel }))
    .sort((left, right) => right.developmentLevel - left.developmentLevel)

  const settlements = set.settlements.map((entity, index) => ({
    ...entity,
    type: 'settlement' as const,
    regionId: input.regions[index % regionCount].id,
    attributes: {},
  }))
  const nations = set.nations.map((entity, index) => ({
    ...entity,
    type: 'nation' as const,
    regionId: sortedRegionIndices[index % sortedRegionIndices.length]?.index !== undefined
      ? input.regions[sortedRegionIndices[index % sortedRegionIndices.length].index].id
      : input.regions[0]?.id ?? '',
    attributes: {},
  }))
  const factions = set.factions.map((entity, index) => ({
    ...entity,
    type: 'faction' as const,
    regionId: input.regions[index % regionCount].id,
    influenceRegionIds: [],
    attributes: {},
  }))
  const nobleHouses = set.nobleHouses.map((entity, index) => ({
    ...entity,
    type: 'nobleHouse' as const,
    regionId: input.regions[index % regionCount].id,
    attributes: {},
  }))
  const tradeRoutes = set.tradeRoutes.map((entity) => ({
    ...entity,
    type: 'tradeRoute' as const,
    regionId: '',
    prosperity: 60,
    attributes: {},
  }))

  return [...nations, ...factions, ...nobleHouses, ...settlements, ...tradeRoutes]
}
