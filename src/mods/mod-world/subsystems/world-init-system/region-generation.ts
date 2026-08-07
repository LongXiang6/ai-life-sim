/**
 * Purpose: Generate compact regional narrative backgrounds for the selected world shape.
 * Owner: mod-world / world-init.
 * Responsibility: Deterministic local defaults only; AI enrichment and graph commits stay outside.
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

function climateText(temperature: number, humidity: number): string {
  const heat = temperature < 0 ? '严寒' : temperature < 12 ? '寒凉' : temperature < 25 ? '温和' : '炎热'
  const moisture = humidity < 20 ? '干旱' : humidity < 50 ? '偏干' : humidity < 75 ? '湿润' : '多雨'
  return `${heat}、${moisture}`
}

function ecologyText(terrainTag: string): string {
  const values: Record<string, string> = {
    plains: '开阔地貌，常见物种与人类活动相互交织',
    forest: '林地生态较完整，生物多样性较高',
    savanna: '草木稀疏，生物随季节和水源迁移',
    rainforest: '高密度生态，物种丰富且环境变化迅速',
    desert: '生态承载力低，生命围绕稀缺水源聚集',
    tundra: '耐寒生态占主导，生长与繁衍窗口短暂',
    ethereal: '生态受当地超常规则影响，常规物种分布不稳定',
    space: '生命依赖封闭栖息地或特殊环境适应机制',
    void: '缺少稳定自然生态，生命活动依赖世界规则维持',
  }
  return values[terrainTag] ?? '生态由当地地形与世界规则共同塑造'
}

function resourceText(terrainTag: string): string[] {
  const values: Record<string, string[]> = {
    plains: ['耕作条件', '普通建材'],
    forest: ['木材', '药材', '野生食物'],
    savanna: ['牧业条件', '季节性水源'],
    rainforest: ['稀有生物资源', '药材'],
    desert: ['矿物', '稀缺水源'],
    tundra: ['寒地矿物', '耐寒生物资源'],
    ethereal: ['当地超常资源'],
    space: ['能源', '矿物', '人工补给'],
    void: ['规则性资源'],
  }
  return values[terrainTag] ?? ['常见生活资源']
}

function levelText(level: number, labels: readonly [string, string, string]): string {
  if (level < 35) return labels[0]
  if (level < 70) return labels[1]
  return labels[2]
}

function buildRegion(
  config: WorldConfig,
  template: MapTemplateConfig,
  idSuffix: string,
  name: string,
  terrainTag: string,
  temperature: number,
  humidity: number,
  developmentLevel: number,
): RegionData {
  const climate = climateText(temperature, humidity)
  const ecology = ecologyText(terrainTag)
  const resources = resourceText(terrainTag)
  const economy = levelText(developmentLevel, ['以自给与交换为主', '存在稳定市场和专业分工', '经济网络成熟且流动频繁'])
  const population = levelText(developmentLevel, ['人口稀疏', '人口规模适中', '人口密集且流动活跃'])
  const settlement = levelText(developmentLevel, ['聚落分散', '形成稳定城镇或社区', '聚落体系成熟、核心节点明显'])
  const education = levelText(developmentLevel, ['知识主要靠家庭与师徒传递', '存在稳定教育或训练渠道', '教育与知识传播体系成熟'])
  const pollution = developmentLevel < 45 ? '污染轻微或局部存在' : developmentLevel < 80 ? '存在可感知的人类活动污染' : '污染与治理并存，局部压力明显'
  const culture = `${config.civilizationStage}阶段的当地文化，与${terrainTag}环境长期互动`
  const socialStructure = levelText(developmentLevel, ['社会关系较松散', '身份与分工较稳定', '社会分层和组织网络较复杂'])
  const factions = levelText(developmentLevel, ['缺少长期稳定的大型组织', '存在若干地方组织与利益群体', '多方组织长期竞争与合作'])
  const law = levelText(developmentLevel, ['主要依靠习俗和即时裁决', '存在稳定规则与地方秩序', '法律和治理结构较完整'])
  return {
    id: `${config.name}-region-${idSuffix}`,
    name,
    templateType: template.label,
    terrainTag,
    summary: `${name}处于${climate}环境，${settlement}；${economy}。`,
    climate,
    ecology,
    resources,
    pollution,
    economy,
    population,
    settlement,
    culture,
    education,
    socialStructure,
    factions,
    law,
    updatedAtGlobalDay: 0,
  }
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
    return buildRegion(
      config,
      template,
      String(index),
      `${template.label}第${index + 1}区`,
      terrainTag,
      temperature,
      humidity,
      calculateDevelopmentLevel(range, terrainTag),
    )
  })
}

function generateNamedRegions(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
  names: readonly string[],
  terrainTag: string,
): RegionData[] {
  const range = getDevelopmentRange(config, calibration)
  return Array.from({ length: template.regionCount }, (_, index) => {
    const temperature = terrainTag === 'space' ? 20 + jitter(15) : terrainTag === 'ethereal' ? 15 + jitter(10) : 25 - index * 6
    const humidity = terrainTag === 'space' ? 50 + jitter(30) : terrainTag === 'ethereal' ? 50 + jitter(20) : 60 - index * 10
    const resolvedTerrain = terrainTag === 'plains' ? pickTerrain(temperature, humidity) : terrainTag
    return buildRegion(
      config,
      template,
      String(index),
      `${template.label}·${names[index] ?? `第${index + 1}区`}`,
      resolvedTerrain,
      temperature,
      humidity,
      calculateDevelopmentLevel(range, resolvedTerrain),
    )
  })
}

export function generateRegionsByStrategy(
  config: WorldConfig,
  template: MapTemplateConfig,
  calibration: WorldCalibration | null,
): RegionData[] {
  switch (template.generationStrategy) {
    case 'climateLatitude':
      return generateClimateLatitudeRegions(config, template, calibration)
    case 'concentricRings':
      return generateNamedRegions(config, template, calibration, FLAT_DISC_RING_NAMES, 'plains')
    case 'discrete':
      return generateNamedRegions(config, template, calibration, PLANE_LAYER_NAMES, 'ethereal')
    case 'cosmic':
      return generateNamedRegions(config, template, calibration, STAR_SYSTEM_NAMES, 'space')
    case 'abstract':
      return [buildRegion(config, template, 'origin', '原点', 'void', 20, 50, 50)]
  }
}
