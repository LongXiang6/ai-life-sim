import { z } from 'zod'

import type {
  ScoringCurveId,
  ScoringEvidenceKind,
  WorldScoringDimension,
  WorldScoringProfile,
} from '@/foundation'

import type { WorldConfig } from './types'

export const SCORING_EVIDENCE_KINDS = [
  'attributes',
  'journey',
  'choices',
  'lifespan-adjustments',
  'achievements',
  'completion',
] as const satisfies readonly ScoringEvidenceKind[]

export const SCORING_CURVE_IDS = [
  'growth',
  'agency',
  'journey',
  'impact',
] as const satisfies readonly ScoringCurveId[]

export const WorldScoringProfileSuggestionSchema = z.object({
  profileVersion: z.literal(1),
  worldId: z.string().min(1),
  dimensions: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    weight: z.number().finite().positive(),
    evidenceKinds: z.array(z.enum(SCORING_EVIDENCE_KINDS)).min(1),
    curveId: z.enum(SCORING_CURVE_IDS),
  }).strict()).min(3).max(6),
}).strict()

function stableDimensionId(value: string, index: number): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return normalized || `dimension-${index + 1}`
}

function integerWeights(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (total <= 0) {
    const base = Math.floor(100 / values.length)
    return values.map((_, index) => base + (index < 100 - base * values.length ? 1 : 0))
  }
  const exact = values.map((value) => Math.max(0, value) / total * 100)
  const result = exact.map(Math.floor)
  let remaining = 100 - result.reduce((sum, value) => sum + value, 0)
  const order = exact
    .map((value, index) => ({ index, remainder: value - result[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
  for (const item of order) {
    if (remaining <= 0) break
    result[item.index] += 1
    remaining -= 1
  }
  return result
}

export function normalizeWorldScoringProfile(
  input: z.infer<typeof WorldScoringProfileSuggestionSchema>,
  worldId: string,
): WorldScoringProfile {
  const parsed = WorldScoringProfileSuggestionSchema.parse(input)
  if (parsed.worldId !== worldId) throw new Error('评分维度 worldId 与当前世界不一致')
  const seenIds = new Set<string>()
  const seenLabels = new Set<string>()
  const dimensions = parsed.dimensions.map((dimension, index) => {
    let id = stableDimensionId(dimension.id, index)
    while (seenIds.has(id)) id = `${id}-${index + 1}`
    seenIds.add(id)
    const label = dimension.label.trim()
    if (seenLabels.has(label)) throw new Error(`评分维度名称重复：${label}`)
    seenLabels.add(label)
    return {
      ...dimension,
      id,
      label,
      description: dimension.description.trim(),
      evidenceKinds: [...new Set(dimension.evidenceKinds)],
    }
  })
  const weights = integerWeights(dimensions.map((dimension) => dimension.weight))
  return {
    profileVersion: 1,
    worldId,
    dimensions: dimensions.map((dimension, index): WorldScoringDimension => ({
      ...dimension,
      weight: weights[index],
    })),
  }
}

export function buildFallbackWorldScoringProfile(
  config: Pick<WorldConfig, 'essenceTag' | 'powerSystemTag'>,
  worldId: string,
): WorldScoringProfile {
  const theme = `${config.essenceTag} ${config.powerSystemTag}`.toLowerCase()
  const labels = /cultivation|仙|修/u.test(theme)
    ? ['道行成长', '命途抉择', '岁月历练', '因果传承']
    : /science|technology|cyber|space|科幻|赛博/u.test(theme)
      ? ['适应进化', '关键决断', '探索历程', '世界影响']
      : ['自我成长', '人生抉择', '历程完成', '留下回响']
  const curves: ScoringCurveId[] = ['growth', 'agency', 'journey', 'impact']
  const evidence: ScoringEvidenceKind[][] = [
    ['attributes', 'lifespan-adjustments'],
    ['choices', 'achievements'],
    ['journey', 'completion'],
    ['achievements', 'choices', 'lifespan-adjustments'],
  ]
  return {
    profileVersion: 1,
    worldId,
    dimensions: labels.map((label, index) => ({
      id: curves[index],
      label,
      description: `依据本地结构化${evidence[index].join('、')}证据计算。`,
      weight: 25,
      evidenceKinds: evidence[index],
      curveId: curves[index],
    })),
  }
}

export function isCompleteWorldScoringProfile(value: unknown): value is WorldScoringProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<WorldScoringProfile>
  if (profile.profileVersion !== 1 || typeof profile.worldId !== 'string' || !Array.isArray(profile.dimensions)) return false
  if (profile.dimensions.length < 3 || profile.dimensions.length > 6) return false
  const ids = new Set<string>()
  const labels = new Set<string>()
  let totalWeight = 0
  for (const dimension of profile.dimensions) {
    if (!dimension || typeof dimension !== 'object') return false
    if (!dimension.id || !dimension.label || ids.has(dimension.id) || labels.has(dimension.label)) return false
    if (!SCORING_CURVE_IDS.includes(dimension.curveId) || !Number.isInteger(dimension.weight) || dimension.weight <= 0) return false
    if (!Array.isArray(dimension.evidenceKinds) || dimension.evidenceKinds.length === 0) return false
    if (dimension.evidenceKinds.some((kind) => !SCORING_EVIDENCE_KINDS.includes(kind))) return false
    ids.add(dimension.id)
    labels.add(dimension.label)
    totalWeight += dimension.weight
  }
  return totalWeight === 100
}
