/**
 * Purpose: Build, call, validate, and convert the world-entity AI response.
 * Owner: mod-world / world-entity.
 * Responsibility: AI entity generation only; no Store writes or subsystem lifecycle state.
 */

import type { AnyWorldEntity, RegionData, WorldConfig } from '../../types'
import { worldEntityPrompt } from '../../prompts'
import { parseAIJSON } from '../../utils/parse-ai-json'
import {
  buildCoherenceRetryHint,
  detectCoherenceViolations,
} from '../../utils/world-coherence-output-guard'

export interface EntityAIContext {
  calibrationSummary: string
  requestAI: (prompt: string, extraUserMessages?: string[]) => Promise<string>
  civilizationStage: string
  coherenceHint: string
  coherenceNote: string
  entityRanges: string
  existingEntities: AnyWorldEntity[]
  mapRegions: string
  regions: RegionData[]
  worldDescription: string
  worldName: string
  worldTags: string
  worldType: string
}

interface ParsedEntityResponse {
  systemApplicability?: Partial<Record<'nations' | 'factions' | 'nobleHouses' | 'settlements' | 'tradeRoutes', boolean>>
  nations: Array<{ name: string; capital: string; stability: number; regionId?: string; description: string }>
  factions: Array<{ name: string; factionType: string; power: number; regionId?: string; description: string; joinRequirement: string }>
  nobleHouses: Array<{ name: string; rank: string; influence: number; regionId?: string; description: string }>
  settlements: Array<{ name: string; tier: string; developmentLevel: number; regionId?: string; description: string }>
  tradeRoutes: Array<{ name: string; fromSettlementId: string; toSettlementId: string; prosperity: number }>
  nobles?: Array<{ name: string; rank: string; influence: number; regionId?: string; description: string }>
}

function resolveRegionId(regions: RegionData[], regionId: string | undefined, fallbackIndex: number): string {
  if (regions.length === 0) return ''
  if (regionId && regions.some((region) => region.id === regionId)) return regionId
  return regions[fallbackIndex % regions.length].id
}

function buildEntityPrompt(config: WorldConfig, context: EntityAIContext): string {
  const existingContent = context.existingEntities.length > 0
    ? `已存在的实体（请与之协调，避免重复）：\n${context.existingEntities.map((entity) => `- ${entity.name}（${entity.type}）`).join('\n')}`
    : ''

  return worldEntityPrompt.userPromptTemplate
    .replace('{{worldName}}', context.worldName)
    .replace('{{essenceTag}}', config.essenceTag)
    .replace('{{powerSystemTag}}', config.powerSystemTag)
    .replace('{{civilizationStage}}', config.civilizationStage || context.civilizationStage)
    .replace('{{spatialForm}}', config.spatialForm)
    .replace('{{worldDescription}}', context.worldDescription)
    .replace('{{coherenceHint}}', context.coherenceHint)
    .replace('{{coherenceNote}}', context.coherenceNote)
    .replace('{{worldType}}', context.worldType)
    .replace('{{worldTags}}', context.worldTags)
    .replace('{{calibrationSummary}}', context.calibrationSummary)
    .replace('{{entityRanges}}', context.entityRanges)
    .replace('{{mapRegions}}', context.mapRegions)
    .replace('{{existingEntities}}', existingContent)
    .replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, '')
}

function convertEntityResponse(parsed: ParsedEntityResponse, regions: RegionData[]): AnyWorldEntity[] {
  const applicability = parsed.systemApplicability
  const enabled = (key: keyof NonNullable<typeof applicability>): boolean => applicability?.[key] !== false
  const nobleHouses = enabled('nobleHouses')
    ? (Array.isArray(parsed.nobleHouses) ? parsed.nobleHouses : Array.isArray(parsed.nobles) ? parsed.nobles : [])
    : []
  const entities: AnyWorldEntity[] = []

  if (enabled('nations') && Array.isArray(parsed.nations)) {
    for (const entity of parsed.nations) {
      entities.push({
        id: `nation-ai-${entities.length}`,
        name: entity.name,
        type: 'nation',
        capital: entity.capital ?? '',
        stability: entity.stability ?? 50,
        description: entity.description ?? '',
        regionId: resolveRegionId(regions, entity.regionId, entities.length),
        attributes: {},
      })
    }
  }
  if (enabled('factions') && Array.isArray(parsed.factions)) {
    for (const entity of parsed.factions) {
      entities.push({
        id: `faction-ai-${entities.length}`,
        name: entity.name,
        type: 'faction',
        factionType: (entity.factionType ?? 'political') as 'military' | 'religious' | 'merchant' | 'academic' | 'political',
        power: entity.power ?? 50,
        influenceRegionIds: [],
        joinRequirement: entity.joinRequirement ?? '',
        description: entity.description ?? '',
        regionId: resolveRegionId(regions, entity.regionId, entities.length),
        attributes: {},
      })
    }
  }
  for (const entity of nobleHouses) {
    entities.push({
      id: `noble-ai-${entities.length}`,
      name: entity.name,
      type: 'nobleHouse',
      homeRegion: '',
      rank: (entity.rank ?? 'count') as 'duke' | 'marquis' | 'earl' | 'count' | 'baron',
      influence: entity.influence ?? 50,
      description: entity.description ?? '',
      regionId: resolveRegionId(regions, entity.regionId, entities.length),
      attributes: {},
    })
  }
  if (enabled('settlements') && Array.isArray(parsed.settlements)) {
    for (const entity of parsed.settlements) {
      entities.push({
        id: `settlement-ai-${entities.length}`,
        name: entity.name,
        type: 'settlement',
        tier: (entity.tier ?? 'town') as 'village' | 'town' | 'city' | 'metropolis',
        developmentLevel: entity.developmentLevel ?? 30,
        description: entity.description ?? '',
        regionId: resolveRegionId(regions, entity.regionId, entities.length),
        attributes: {},
      })
    }
  }
  if (enabled('tradeRoutes') && Array.isArray(parsed.tradeRoutes)) {
    for (const entity of parsed.tradeRoutes) {
      entities.push({
        id: `trade-ai-${entities.length}`,
        name: entity.name,
        type: 'tradeRoute',
        fromSettlementId: entity.fromSettlementId ?? '',
        toSettlementId: entity.toSettlementId ?? '',
        prosperity: entity.prosperity ?? 60,
        description: '',
        regionId: '',
        attributes: {},
      })
    }
  }
  return entities
}

export async function generateAIEntities(config: WorldConfig, context: EntityAIContext): Promise<AnyWorldEntity[] | null> {
  const prompt = buildEntityPrompt(config, context)
  try {
    let response = ''
    let retryHint = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await context.requestAI(prompt, retryHint ? [retryHint] : undefined)
      if (!response || response.trim() === '' || response.trim() === '无') return null
      const violations = detectCoherenceViolations(response, {
        worldDescription: context.worldDescription,
        worldType: context.worldType,
      })
      if (violations.length > 0 && attempt === 0) {
        console.warn(`[mod-world] 实体 AI 输出含禁词 ${violations.join('、')}，重试`)
        retryHint = buildCoherenceRetryHint(violations)
        continue
      }
      break
    }

    const parsed = parseAIJSON<ParsedEntityResponse>(response)
    if (!parsed) return null
    const entities = convertEntityResponse(parsed, context.regions)
    return entities.length > 0 ? entities : null
  } catch {
    return null
  }
}
