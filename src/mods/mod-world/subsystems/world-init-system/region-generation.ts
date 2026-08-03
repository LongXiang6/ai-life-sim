/**
 * Purpose: Generate deterministic-shape world regions from a selected map strategy.
 * Owner: mod-world / world-init.
 * Responsibility: Region algorithms only; context IDs, tags, events, and subsystem state stay outside.
 */

import { clamp } from '@/core/shared'
import type {
  MapTemplateConfig,
  RegionData,
  WorldCalibration,
  WorldConfig,
} from '../../types'
import { clampModifier } from '../../utils/calibration-clamp'

const CIVILIZATION_DEVELOPMENT_RANGE: Record<string, [number, number]> = {
  primitive: [1, 15],
  ancient: [10, 30],
  medieval: [20, 45],
  renaissance: [35, 60],
  industrial: [50, 80],
  modern: [70, 95],
  information: [75, 95],
  space: [80, 100],
}

const TERRAIN_DEVELOPMENT_OFFSET: Record<string, number> = {
  plains: 5,
  forest: 1,
  savanna: -2,
  rainforest: -4,
  desert: -8,
  tundra: -10,
  ethereal: 0,
  space: 3,
  void: 0,
}

const FLAT_DISC_RING_NAMES = ['中央圣地', '内环沃土', '中环疆域', '外环荒野', '边缘绝域']
const PLANE_LAYER_NAMES = ['上层界', '中层界', '下层界', '深渊界']
const STAR_SYSTEM_NAMES = ['恒星核心区', '亚空间航道', '殖民星域', '外星边域', '虚空缓冲区']

function getDevelopmentRange(
  config: WorldConfig,
  calibration: WorldCalibration | null,
): [number, number] {
  const custom = calibration?.world?.developmentRange
  const base = custom
    ? [custom.min, custom.max] as [number, number]
    : CIVILIZATION_DEVELOPMENT_RANGE[config.civilizationStage] ?? [10, 50]
  const modifier = clampModifier(calibration?.formulas?.developmentModifier ?? 1)
  return [
    clamp(Math.round(base[0] * modifier), -Infinity, 100),
    clamp(Math.round(base[1] * modifier), -Infinity, 100),
  ]
}

function calculateDevelopmentLevel(range: [number, number], terrainTag: string): number {
  return clamp(
    Math.round((range[0] + range[1]) / 2 + (TERRAIN_DEVELOPMENT_OFFSET[terrainTag] ?? 0)),
    0,
    100,
  )
}

function jitter(range: number): number {
  return (Math.random() - 0.5) * 2 * range
}

function pickTerrain(temperature: number, humidity: number): string {
  if (temperature < 0) return 'tundra'
  if (humidity < 20) return 'desert'
  if (temperature > 25 && humidity > 60) return 'rainforest'
  if (humidity > 50) return 'forest'
  if (temperature > 20) return 'savanna'
  return 'plains'
}

function generateClimateLatitudeRegions(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
): RegionData[] {
  const range = getDevelopmentRange(config, calibration)
  return Array.from({ length: template.regionCount }, (_, index) => {
    const yRatio = template.regionCount > 1 ? (index / (template.regionCount - 1)) * 2 - 1 : 0
    const temperature = Math.max(-10, Math.min(40, Math.round(30 - Math.abs(yRatio) * 35 + jitter(3))))
    const humidity = Math.max(0, Math.min(100, Math.round(80 - Math.abs(yRatio) * 70 + jitter(10))))
    const terrainTag = pickTerrain(temperature, humidity)
    return {
      id: `${config.name}-region-${index}`,
      name: `${template.label}第${index + 1}区`,
      templateType: template.label,
      temperature,
      humidity,
      terrainTag,
      resourceDistribution: {},
      developmentLevel: calculateDevelopmentLevel(range, terrainTag),
    }
  })
}

function generateConcentricRingRegions(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
): RegionData[] {
  const range = getDevelopmentRange(config, calibration)
  return Array.from({ length: template.regionCount }, (_, index) => {
    const ringRatio = template.regionCount > 1 ? index / (template.regionCount - 1) : 0
    const temperature = Math.round(25 - ringRatio * 30)
    const humidity = Math.round(60 - ringRatio * 50)
    const terrainTag = pickTerrain(temperature, humidity)
    const name = FLAT_DISC_RING_NAMES[index] ?? `第${index + 1}环`
    return {
      id: `${config.name}-region-${index}`,
      name: `${template.label}·${name}`,
      templateType: template.label,
      temperature,
      humidity,
      terrainTag,
      resourceDistribution: {},
      developmentLevel: calculateDevelopmentLevel(range, terrainTag),
    }
  })
}

function generateDiscreteRegions(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
): RegionData[] {
  const range = getDevelopmentRange(config, calibration)
  return Array.from({ length: template.regionCount }, (_, index) => ({
    id: `${config.name}-region-${index}`,
    name: `${template.label}·${PLANE_LAYER_NAMES[index] ?? `第${index + 1}层`}`,
    templateType: template.label,
    temperature: 15 + jitter(10),
    humidity: 50 + jitter(20),
    terrainTag: 'ethereal',
    resourceDistribution: {},
    developmentLevel: calculateDevelopmentLevel(range, 'ethereal'),
  }))
}

function generateCosmicRegions(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
): RegionData[] {
  const range = getDevelopmentRange(config, calibration)
  return Array.from({ length: template.regionCount }, (_, index) => ({
    id: `${config.name}-region-${index}`,
    name: `${template.label}·${STAR_SYSTEM_NAMES[index] ?? `星系${index + 1}`}`,
    templateType: template.label,
    temperature: 20 + jitter(15),
    humidity: 50 + jitter(30),
    terrainTag: 'space',
    resourceDistribution: {},
    developmentLevel: calculateDevelopmentLevel(range, 'space'),
  }))
}

function generateAbstractRegions(config: WorldConfig): RegionData[] {
  return [{
    id: `${config.name}-origin`,
    name: '原点',
    templateType: '虚空',
    temperature: 20,
    humidity: 50,
    terrainTag: 'void',
    resourceDistribution: {},
    developmentLevel: 50,
  }]
}

export function generateRegionsByStrategy(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
): RegionData[] {
  switch (template.generationStrategy) {
    case 'climateLatitude': return generateClimateLatitudeRegions(config, template, calibration)
    case 'concentricRings': return generateConcentricRingRegions(config, template, calibration)
    case 'discrete': return generateDiscreteRegions(config, template, calibration)
    case 'cosmic': return generateCosmicRegions(config, template, calibration)
    case 'abstract': return generateAbstractRegions(config)
  }
}
