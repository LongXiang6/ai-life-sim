/**
 * @module world-calibration-parse.ts
 * @description 校准合并响应解析 —— calibration + aiDetailedParameters
 * @mod mod-world
 */

import {
  worldCalibrationBundleOutputSchema,
  worldCalibrationOutputSchema,
} from '../prompts/world-calibration-prompt'
import type { WorldAIDetailedParameters } from '../prompts/world-config-prompt'
import type { WorldCalibration } from '../types'
import { parseAIJSON } from './parse-ai-json'
import { parseWorldConfigFromObject } from './world-config-ai'
import { isLikelyTruncatedJSON } from './world-coherence-output-guard'

export interface ParsedWorldCalibrationBundle {
  calibration: WorldCalibration
  aiDetailedParameters?: WorldAIDetailedParameters
  worldTags?: string[]
}

/** 解析校准合并 AI 响应；兼容旧版根对象即 calibration 的格式 */
export function parseWorldCalibrationBundleResponse(raw: string): ParsedWorldCalibrationBundle | null {
  const parsed = parseAIJSON<Record<string, unknown>>(raw)
  if (!parsed || typeof parsed !== 'object') return null

  let calPayload: unknown = parsed
  let configPayload: unknown = parsed.aiDetailedParameters
  let tagsPayload: unknown = parsed.worldTags

  if (parsed.calibration && typeof parsed.calibration === 'object') {
    calPayload = parsed.calibration
    configPayload = parsed.aiDetailedParameters
    tagsPayload = parsed.worldTags
  }

  const zodResult = worldCalibrationOutputSchema.safeParse(calPayload ?? {})
  if (!zodResult.success) return null

  const aiDetailedParameters = configPayload != null
    ? parseWorldConfigFromObject(configPayload) ?? undefined
    : undefined

  let worldTags: string[] | undefined
  if (Array.isArray(tagsPayload)) {
    const strings = tagsPayload.filter((t): t is string => typeof t === 'string')
    if (strings.length >= 3) worldTags = strings
  }

  return { calibration: zodResult.data as WorldCalibration, aiDetailedParameters, worldTags }
}

/** 供 resilient validate 使用：至少 calibration 必须可解析 */
export function validateWorldCalibrationBundleResponse(raw: string): void {
  const bundle = parseWorldCalibrationBundleResponse(raw)
  if (!bundle?.calibration) throw new Error('calibration bundle JSON 解析失败')
  const zodResult = worldCalibrationBundleOutputSchema.safeParse({
    calibration: bundle.calibration,
    aiDetailedParameters: bundle.aiDetailedParameters,
  })
  if (!zodResult.success) {
    const issues = zodResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`calibration bundle 校验失败: ${issues}`)
  }
}

export interface CalibrationBundleDiagnostics {
  ok: boolean
  error: string | null
  truncated: boolean
  calibrationIssues: string[]
  bundleIssues: string[]
  w02Parsed: boolean
  worldTagsCount: number
}

/** 结构化校验诊断（供 debug 日志） */
export function getCalibrationBundleDiagnostics(raw: string): CalibrationBundleDiagnostics {
  const truncated = isLikelyTruncatedJSON(raw)
  const parsed = parseAIJSON<Record<string, unknown>>(raw)

  const empty: CalibrationBundleDiagnostics = {
    ok: false,
    error: truncated ? 'JSON 可能被截断' : 'JSON 无法解析',
    truncated,
    calibrationIssues: [],
    bundleIssues: [],
    w02Parsed: false,
    worldTagsCount: 0,
  }

  if (!parsed || typeof parsed !== 'object') return empty

  let calPayload: unknown = parsed
  let configPayload: unknown = parsed.aiDetailedParameters
  let tagsPayload: unknown = parsed.worldTags

  if (parsed.calibration && typeof parsed.calibration === 'object') {
    calPayload = parsed.calibration
    configPayload = parsed.aiDetailedParameters
    tagsPayload = parsed.worldTags
  }

  const calResult = worldCalibrationOutputSchema.safeParse(calPayload ?? {})
  const calibrationIssues = calResult.success
    ? []
    : calResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

  const w02Parsed = configPayload != null && parseWorldConfigFromObject(configPayload) != null
  const worldTagsCount = Array.isArray(tagsPayload)
    ? tagsPayload.filter((t): t is string => typeof t === 'string').length
    : 0

  const bundle = parseWorldCalibrationBundleResponse(raw)
  let bundleIssues: string[] = []
  if (bundle) {
    const zodResult = worldCalibrationBundleOutputSchema.safeParse({
      calibration: bundle.calibration,
      aiDetailedParameters: bundle.aiDetailedParameters,
    })
    if (!zodResult.success) {
      bundleIssues = zodResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    }
  } else if (!calResult.success) {
    bundleIssues = ['calibration 对象无法解析']
  }

  let error: string | null = null
  if (truncated) error = 'JSON 可能被截断'
  else if (!bundle) error = 'calibration bundle JSON 解析失败'
  else if (bundleIssues.length > 0) error = 'calibration bundle 校验失败'
  else if (calibrationIssues.length > 0) error = 'calibration 校验失败'

  const ok = !truncated && !error

  return {
    ok,
    error,
    truncated,
    calibrationIssues,
    bundleIssues,
    w02Parsed,
    worldTagsCount,
  }
}

export function formatCalibrationBundleDiagnostics(d: CalibrationBundleDiagnostics): string {
  const parts: string[] = []
  if (d.error) parts.push(d.error)
  if (d.calibrationIssues.length) parts.push(`calibration: ${d.calibrationIssues.join('; ')}`)
  if (d.bundleIssues.length) parts.push(`bundle: ${d.bundleIssues.join('; ')}`)
  if (!d.w02Parsed) parts.push('W02(aiDetailedParameters) 未解析成功')
  if (d.worldTagsCount < 3) parts.push(`worldTags 不足 (${d.worldTagsCount})`)
  return parts.join(' | ')
}
