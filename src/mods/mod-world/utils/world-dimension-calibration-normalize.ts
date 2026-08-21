/**
 * @module world-dimension-calibration-normalize.ts
 * @description 合并步 AI 响应归一化 —— 只统一等价字段表达，不补造缺失内容
 * @mod mod-world
 */

import type { DimensionInferenceOutput } from '../prompts/dimension-inference-schema'
import {
  CIVILIZATION_ZH_MAP,
  mapPowerSystemZhToTag,
  mapWorldviewEssenceZhToTag,
  SPATIAL_FORM_ZH_MAP,
} from './world-config-mapping'
const METADATA_TAG_KEYS = ['essenceTag', 'civilizationStage', 'powerSystemTag', 'spatialForm'] as const

function normalizePowerFramework(raw: unknown): unknown {
  if (raw === null) return null
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>
    const ranks = Array.isArray(value.ranks)
      ? value.ranks
        .filter((rank): rank is Record<string, unknown> => (
          typeof rank === 'object' && rank !== null && !Array.isArray(rank)
        ))
        .map((rank) => ({
          label: typeof rank.label === 'string' ? rank.label.trim() : '',
          description: typeof rank.description === 'string' ? rank.description.trim() : '',
        }))
        .filter((rank) => rank.label && rank.description)
      : []
    if (ranks.length > 0) {
      return {
        label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : '世界力量体系',
        progression: value.progression === 'open' ? 'open' : 'bounded',
        ranks,
      }
    }
  }
  return raw
}

/** 统一 dimensions 中等价的力量框架结构，不填充缺失维度。 */
export function normalizeDimensionsPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const raw = payload as Record<string, unknown>

  return {
    ...raw,
    powerFramework: normalizePowerFramework(raw.powerFramework),
  }
}

function metadataFromDimensions(dimensions: DimensionInferenceOutput): Record<string, string> {
  return {
    essenceTag: mapWorldviewEssenceZhToTag(dimensions.worldviewEssence),
    civilizationStage: CIVILIZATION_ZH_MAP[dimensions.civilizationStage] ?? 'modern',
    powerSystemTag: mapPowerSystemZhToTag(dimensions.powerSystem),
    spatialForm: SPATIAL_FORM_ZH_MAP[dimensions.spatialForm] ?? 'universe',
  }
}

function metadataHasValidTags(meta: Record<string, unknown>): boolean {
  return METADATA_TAG_KEYS.every((k) => typeof meta[k] === 'string' && meta[k].length > 0)
}

/** 修复 calibration 结构：styleGuide、metadata 与 dimensions 对齐 */
export function normalizeCalibrationPayload(
  cal: Record<string, unknown>,
  dimensions: DimensionInferenceOutput,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cal }

  if (typeof out.worldviewStyleHint === 'string') {
    const styleGuide = (out.styleGuide && typeof out.styleGuide === 'object')
      ? { ...(out.styleGuide as Record<string, unknown>) }
      : {}
    if (!styleGuide.worldviewStyleHint) {
      styleGuide.worldviewStyleHint = out.worldviewStyleHint
    }
    out.styleGuide = styleGuide
    delete out.worldviewStyleHint
  }

  const rootDifficulty = out.difficulty
  const metaRaw = out.metadata
  const meta = metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
    ? { ...(metaRaw as Record<string, unknown>) }
    : {}

  if (typeof rootDifficulty === 'string') {
    meta.difficulty = rootDifficulty
    delete out.difficulty
  }

  if (!metadataHasValidTags(meta)) {
    out.metadata = {
      ...metadataFromDimensions(dimensions),
      ...(typeof meta.difficulty === 'string' ? { difficulty: meta.difficulty } : {}),
    }
  } else {
    out.metadata = meta
  }

  delete out.formModifiers
  return out
}

/** 顶层 parsed 对象归一化（dimensions + calibration） */
export function normalizeDimensionCalibrationParsed(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const dimNorm = normalizeDimensionsPayload(parsed.dimensions ?? parsed)
  if (!dimNorm) return parsed

  const out: Record<string, unknown> = { ...parsed, dimensions: dimNorm }

  if (parsed.calibration && typeof parsed.calibration === 'object' && !Array.isArray(parsed.calibration)) {
    // dimensions 需在 normalizeCalibration 前通过 schema，此处用粗归一化结果
    const dimLike = dimNorm as DimensionInferenceOutput
    out.calibration = normalizeCalibrationPayload(
      parsed.calibration as Record<string, unknown>,
      dimLike,
    )
  }

  return out
}
