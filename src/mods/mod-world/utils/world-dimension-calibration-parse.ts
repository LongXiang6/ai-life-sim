/**
 * @module world-dimension-calibration-parse.ts
 * @description 维度推断 + 校准合并响应解析（含归一化容错）
 * @mod mod-world
 */

import {
  dimensionInferenceOutputSchema,
  type DimensionInferenceOutput,
} from '../prompts/dimension-inference-schema'
import { worldCalibrationOutputSchema } from '../prompts/world-calibration-prompt'
import type { WorldAIDetailedParameters } from '../prompts/world-config-prompt'
import type { WorldCalibration } from '../types'
import { parseAIJSON } from './parse-ai-json'
import { parseWorldConfigFromObject } from './world-config-ai'
import {
  normalizeCalibrationPayload,
  normalizeDimensionCalibrationParsed,
  normalizeDimensionsPayload,
} from './world-dimension-calibration-normalize'
import { isLikelyTruncatedJSON } from './world-coherence-output-guard'

export interface ParsedWorldDimensionCalibrationBundle {
  dimensions: DimensionInferenceOutput
  calibration: WorldCalibration
  aiDetailedParameters?: WorldAIDetailedParameters
  worldTags?: string[]
}

/** 解析合并 AI 响应（归一化后再校验） */
export function parseWorldDimensionCalibrationResponse(
  raw: string,
): ParsedWorldDimensionCalibrationBundle | null {
  const parsed = parseAIJSON<Record<string, unknown>>(raw)
  if (!parsed || typeof parsed !== 'object') return null

  const normalizedTop = normalizeDimensionCalibrationParsed(parsed)

  const dimNorm = normalizeDimensionsPayload(normalizedTop.dimensions ?? normalizedTop)
  if (!dimNorm) return null
  const dimResult = dimensionInferenceOutputSchema.safeParse(dimNorm)
  if (!dimResult.success) return null

  const calPayload = normalizedTop.calibration
  if (!calPayload || typeof calPayload !== 'object' || Array.isArray(calPayload)) return null

  const calNormalized = normalizeCalibrationPayload(
    calPayload as Record<string, unknown>,
    dimResult.data,
  )
  const calResult = worldCalibrationOutputSchema.safeParse(calNormalized)
  if (!calResult.success) return null

  const aiDetailedParameters = normalizedTop.aiDetailedParameters != null
    ? parseWorldConfigFromObject(normalizedTop.aiDetailedParameters) ?? undefined
    : undefined

  let worldTags: string[] | undefined
  if (Array.isArray(normalizedTop.worldTags)) {
    const strings = normalizedTop.worldTags.filter((t): t is string => typeof t === 'string')
    if (strings.length >= 3) worldTags = strings
  }

  return {
    dimensions: dimResult.data,
    calibration: calResult.data as WorldCalibration,
    aiDetailedParameters,
    worldTags,
  }
}

/** 供 resilient 重试：返回人类可读校验错误 */
export function getDimensionCalibrationValidationError(raw: string): string | null {
  const parsed = parseAIJSON<Record<string, unknown>>(raw)
  if (!parsed || typeof parsed !== 'object') {
    return 'JSON 无法解析为对象'
  }

  const dimNorm = normalizeDimensionsPayload(
    normalizeDimensionCalibrationParsed(parsed).dimensions ?? parsed,
  )
  if (!dimNorm) return 'dimensions 缺失或格式错误'

  const dimResult = dimensionInferenceOutputSchema.safeParse(dimNorm)
  if (!dimResult.success) {
    return `dimensions 校验失败: ${dimResult.error.issues.map((i) => i.message).join('; ')}`
  }

  const calRaw = parsed.calibration
  if (!calRaw || typeof calRaw !== 'object') return '缺少 calibration 对象'

  const calNormalized = normalizeCalibrationPayload(
    calRaw as Record<string, unknown>,
    dimResult.data,
  )
  const calResult = worldCalibrationOutputSchema.safeParse(calNormalized)
  if (!calResult.success) {
    return `calibration 校验失败: ${calResult.error.issues.map((i) => i.message).join('; ')}`
  }

  if (isLikelyTruncatedJSON(raw)) {
    return 'JSON 可能被截断（括号未闭合）'
  }

  return null
}

export interface DimensionCalibrationDiagnostics {
  ok: boolean
  summary: string | null
  truncated: boolean
  dimensionsIssues: string[]
  calibrationIssues: string[]
  w02Parsed: boolean
  worldTagsCount: number
}

/** 结构化校验诊断（供 debug 日志与 Pipeline 追踪） */
export function getDimensionCalibrationDiagnostics(raw: string): DimensionCalibrationDiagnostics {
  const truncated = isLikelyTruncatedJSON(raw)
  const parsed = parseAIJSON<Record<string, unknown>>(raw)

  const empty: DimensionCalibrationDiagnostics = {
    ok: false,
    summary: truncated ? 'JSON 可能被截断' : 'JSON 无法解析',
    truncated,
    dimensionsIssues: [],
    calibrationIssues: [],
    w02Parsed: false,
    worldTagsCount: 0,
  }

  if (!parsed || typeof parsed !== 'object') return empty

  const normalizedTop = normalizeDimensionCalibrationParsed(parsed)
  const dimNorm = normalizeDimensionsPayload(normalizedTop.dimensions ?? normalizedTop)
  if (!dimNorm) {
    return { ...empty, summary: 'dimensions 缺失或格式错误' }
  }

  const dimResult = dimensionInferenceOutputSchema.safeParse(dimNorm)
  const dimensionsIssues = dimResult.success
    ? []
    : dimResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

  const calRaw = normalizedTop.calibration
  let calibrationIssues: string[] = []
  if (!calRaw || typeof calRaw !== 'object') {
    calibrationIssues = ['缺少 calibration 对象']
  } else {
    const calNormalized = normalizeCalibrationPayload(
      calRaw as Record<string, unknown>,
      dimResult.success ? dimResult.data : {
        powerSystem: String(dimNorm.powerSystem ?? '混合'),
        worldviewEssence: String(dimNorm.worldviewEssence ?? '混合'),
        civilizationStage: String(dimNorm.civilizationStage ?? '现代'),
        spatialForm: String(dimNorm.spatialForm ?? '宇宙'),
        powerFramework: (dimNorm.powerFramework as DimensionInferenceOutput['powerFramework']) ?? null,
        worldType: 'mixed' as const,
      },
    )
    const calResult = worldCalibrationOutputSchema.safeParse(calNormalized)
    if (!calResult.success) {
      calibrationIssues = calResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    }
  }

  const w02Parsed = normalizedTop.aiDetailedParameters != null
    && parseWorldConfigFromObject(normalizedTop.aiDetailedParameters) != null
  const worldTagsCount = Array.isArray(normalizedTop.worldTags)
    ? normalizedTop.worldTags.filter((t): t is string => typeof t === 'string').length
    : 0

  const summary = getDimensionCalibrationValidationError(raw)
  const ok = !truncated && !summary

  return {
    ok,
    summary,
    truncated,
    dimensionsIssues,
    calibrationIssues,
    w02Parsed,
    worldTagsCount,
  }
}

export function formatDimensionCalibrationDiagnostics(d: DimensionCalibrationDiagnostics): string {
  const parts: string[] = []
  if (d.summary) parts.push(d.summary)
  if (d.dimensionsIssues.length) parts.push(`dimensions: ${d.dimensionsIssues.join('; ')}`)
  if (d.calibrationIssues.length) parts.push(`calibration: ${d.calibrationIssues.join('; ')}`)
  if (!d.w02Parsed) parts.push('W02(aiDetailedParameters) 未解析成功')
  if (d.worldTagsCount < 3) parts.push(`worldTags 不足 (${d.worldTagsCount})`)
  return parts.join(' | ')
}

/** resilient validate：dimensions + calibration 必须可解析；W02 缺失不阻塞（由 fallback 补） */
export function validateWorldDimensionCalibrationResponse(raw: string): void {
  const err = getDimensionCalibrationValidationError(raw)
  if (err) throw new Error(`dimension-calibration ${err}`)
}
