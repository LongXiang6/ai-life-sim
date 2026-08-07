/**
 * Purpose: Validate world-init region enrichment and materialize owned region/life-stage records.
 * Owner: mod-world / world-init.
 * Responsibility: Deterministic parsing and normalization only; AI transport and Store commits stay outside.
 */

import type { CharacterLifeStageDefinition } from '@/foundation'
import type { RegionData } from '../types'
import {
  worldRegionProfileOutputSchema,
  type WorldRegionProfileOutput,
} from '../prompts/world-region-profile-prompt'
import { parseAIJSON } from './parse-ai-json'

const DAYS_PER_YEAR = 365

export function parseWorldRegionProfileOutput(raw: string): WorldRegionProfileOutput {
  return worldRegionProfileOutputSchema.parse(parseAIJSON(raw))
}

export function applyRegionProfileOutput(
  regions: RegionData[],
  output: WorldRegionProfileOutput,
  updatedAtGlobalDay: number,
): RegionData[] {
  const byId = new Map(output.regions.map((profile) => [profile.regionId, profile]))
  const knownIds = new Set(regions.map((region) => region.id))
  for (const profile of output.regions) {
    if (!knownIds.has(profile.regionId)) throw new Error(`区域概况引用未知 regionId：${profile.regionId}`)
  }
  return regions.map((region) => {
    const profile = byId.get(region.id)
    return profile
      ? { ...region, ...structuredClone(profile), id: region.id, name: region.name, updatedAtGlobalDay }
      : structuredClone(region)
  })
}

export function materializeLifeStageTemplate(
  output: WorldRegionProfileOutput,
): CharacterLifeStageDefinition[] {
  const sorted = [...output.lifeStages].sort((left, right) => left.minAgeYears - right.minAgeYears)
  let previousMax = 0
  return sorted.map((stage, index) => {
    const minAgeDays = stage.minAgeYears * DAYS_PER_YEAR
    if (index === 0 && minAgeDays !== 0) throw new Error('生命阶段必须从 0 岁开始')
    if (minAgeDays < previousMax) throw new Error('生命阶段年龄区间重叠或逆序')
    const maxAgeDays = stage.maxAgeYears === undefined ? undefined : stage.maxAgeYears * DAYS_PER_YEAR
    if (maxAgeDays !== undefined && maxAgeDays <= minAgeDays) throw new Error('生命阶段结束年龄必须大于开始年龄')
    previousMax = maxAgeDays ?? minAgeDays
    return {
      stageId: `life-stage-${index + 1}`,
      displayName: stage.displayName,
      description: stage.description,
      minAgeDays,
      maxAgeDays,
      guidance: stage.guidance,
    }
  })
}
