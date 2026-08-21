/**
 * @module world-init-ai-validation.ts
 * @description world-init 各步 AI 响应校验诊断 —— 失败时写入对应单次 API 日志【元信息】
 * @mod mod-world
 */

import { parseAIJSON } from './parse-ai-json'
import {
  detectCoherenceViolations,
  isLikelyTruncatedJSON,
  type CoherenceGuardContext,
} from './world-coherence-output-guard'
import type { DimensionCalibrationDiagnostics } from './world-dimension-calibration-parse'
import { formatDimensionCalibrationDiagnostics } from './world-dimension-calibration-parse'

export interface WorldInitValidationDiagnostics {
  ok: boolean
  error: string | null
  details: string
}

/** 将诊断结果转为 debug-log 元信息（仅失败时含校验字段） */
export function resolveWorldInitFailureLogMeta(
  base: Record<string, unknown>,
  raw: string,
  truncated: boolean,
  diagnostics?: WorldInitValidationDiagnostics | null,
  businessError?: string | null,
): Record<string, unknown> {
  const diagFailed = diagnostics != null && !diagnostics.ok
  const failed = truncated || diagFailed || businessError
  if (!failed) return base

  const parts: string[] = []
  if (diagnostics?.details) parts.push(diagnostics.details)
  if (businessError && businessError !== diagnostics?.error) parts.push(businessError)
  if (truncated) parts.push('JSON 可能被截断（括号未闭合）')

  const error = businessError
    ?? (truncated && !diagnostics?.error ? 'JSON 可能被截断' : null)
    ?? diagnostics?.error
    ?? '校验失败'

  return {
    ...base,
    validationPassed: false,
    validationError: error,
    validationDetails: parts.length > 0 ? parts.join(' | ') : error,
    truncatedDetected: truncated,
  }
}

export function fromDimensionCalibrationDiagnostics(
  d: DimensionCalibrationDiagnostics,
): WorldInitValidationDiagnostics {
  return {
    ok: d.ok,
    error: d.summary,
    details: formatDimensionCalibrationDiagnostics(d),
  }
}

function emptyResponseDiagnostics(label: string): WorldInitValidationDiagnostics {
  return { ok: false, error: `${label} AI 返回空`, details: '响应为空或为「无」' }
}

function truncatedDiagnostics(): WorldInitValidationDiagnostics {
  return { ok: false, error: 'JSON 可能被截断', details: '响应括号未闭合或 JSON 不完整' }
}

function coherenceDiagnostics(violations: string[]): WorldInitValidationDiagnostics {
  return {
    ok: false,
    error: `一致性禁词: ${violations.join('、')}`,
    details: `禁词违规: ${violations.join('; ')}`,
  }
}

export function getWorldTagsValidationDiagnostics(raw: string): WorldInitValidationDiagnostics {
  const truncated = isLikelyTruncatedJSON(raw)
  if (truncated) return truncatedDiagnostics()
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '无') return emptyResponseDiagnostics('标签')

  try {
    const parsed = parseAIJSON<{ tags?: unknown } | string[]>(raw)
    if (!parsed) {
      return { ok: false, error: '标签 JSON 无法解析', details: 'parseAIJSON 返回 null' }
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.tags)
        ? parsed.tags
        : null
    if (!candidates) {
      return { ok: false, error: '标签须为 { tags: string[] } 或 string[]', details: `实际类型: ${typeof parsed}` }
    }
    const strings = candidates.filter((t): t is string => typeof t === 'string')
    if (strings.length === 0) {
      return {
        ok: false,
        error: '标签为空或无有效字符串',
        details: `数组长度 ${candidates.length}，string 项 0`,
      }
    }
    return { ok: true, error: null, details: '' }
  } catch (err) {
    return { ok: false, error: String(err), details: String(err) }
  }
}

const ENTITY_LAYER_KEYS = [
  'nations',
  'factions',
  'nobleHouses',
  'settlements',
  'tradeRoutes',
  'nobles',
] as const

export function getEntityBundleValidationDiagnostics(
  raw: string,
  guard?: CoherenceGuardContext,
): WorldInitValidationDiagnostics {
  const truncated = isLikelyTruncatedJSON(raw)
  if (truncated) return truncatedDiagnostics()
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '无') return emptyResponseDiagnostics('实体')

  if (guard) {
    const violations = detectCoherenceViolations(raw, guard)
    if (violations.length > 0) return coherenceDiagnostics(violations)
  }

  const parsed = parseAIJSON<Record<string, unknown>>(raw)
  if (!parsed) {
    return { ok: false, error: '实体 JSON 无法解析', details: 'parseAIJSON 返回 null' }
  }

  let total = 0
  const badLayers: string[] = []
  for (const key of ENTITY_LAYER_KEYS) {
    const arr = parsed[key]
    if (Array.isArray(arr)) total += arr.length
    else if (arr !== undefined) badLayers.push(`${key}: 非数组`)
  }
  if (badLayers.length > 0) {
    return {
      ok: false,
      error: '实体层字段类型错误',
      details: badLayers.join('; '),
    }
  }
  if (total === 0) {
    return {
      ok: false,
      error: '未解析到任何实体',
      details: 'nations/factions/nobleHouses/settlements/tradeRoutes 均为空或缺失',
    }
  }
  return { ok: true, error: null, details: '' }
}

export type WorldInitContentLogKind = 'entities'

/** 实体单次 API 日志的 logMetaResolver */
export function buildWorldInitContentLogMetaResolver(
  kind: WorldInitContentLogKind,
  guard: CoherenceGuardContext,
): (response: string) => Record<string, unknown> {
  return (response: string) => {
    const truncated = isLikelyTruncatedJSON(response)
    const diagnostics = getEntityBundleValidationDiagnostics(response, guard)
    return resolveWorldInitFailureLogMeta({}, response, truncated, diagnostics)
  }
}
