/**
 * @module narrative-interceptor-pipeline.ts
 * @description 叙事拦截器管线 —— 解析后、RoundCommit 前的三步治理
 * @mod mod-engine
 *
 * 步骤（可关断 / 可扩展）：
 *   1. safety   — 变更数量 / 叙事长度 / 可疑内容
 *   2. schema   — Zod 字段校验（subsystem-field-registry）
 *   3. deadLoop — 死循环保护
 */

import type { ParsedNarrative } from '../subsystems/narrative-parser-system'
import { validateRoundChanges } from './subsystem-field-registry'
import { globalDeadLoopDetector } from './system-safety'

export interface NarrativeInterceptorContext {
  rawContent: string
  parsed: ParsedNarrative
  roundSequence: number
  knownSubsystemIds: readonly string[]
}

export interface NarrativeInterceptorOutcome {
  parsed: ParsedNarrative
  blocked: boolean
  blockReason?: string
  warnings: string[]
}

export type NarrativeInterceptor = (
  ctx: NarrativeInterceptorContext,
) => NarrativeInterceptorOutcome

const MAX_NARRATIVE_CHANGES = 24
const MAX_NARRATIVE_LENGTH = 50_000
const COMPLETE_NARRATIVE_END_CHARS = new Set(['。', '！', '？', '…', '」', '”', '）', '】'])

function hasCompleteNarrativeEnd(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const last = trimmed.at(-1)
  return Boolean(last && COMPLETE_NARRATIVE_END_CHARS.has(last))
}

function trimIncompleteNarrativeTail(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || hasCompleteNarrativeEnd(trimmed)) return trimmed

  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const char = trimmed[i]
    if (!char || !COMPLETE_NARRATIVE_END_CHARS.has(char)) continue

    const cleaned = trimmed.slice(0, i + 1).trim()
    return cleaned.length >= 40 ? cleaned : trimmed
  }

  return trimmed
}

/** 步骤 1：安全边界 */
export function safetyInterceptor(ctx: NarrativeInterceptorContext): NarrativeInterceptorOutcome {
  const warnings: string[] = []
  let parsed = ctx.parsed

  if (parsed.changes.length > MAX_NARRATIVE_CHANGES) {
    warnings.push(
      `变更数量 ${parsed.changes.length} 超过上限 ${MAX_NARRATIVE_CHANGES}，已截断`,
    )
    parsed = { ...parsed, changes: parsed.changes.slice(0, MAX_NARRATIVE_CHANGES) }
  }

  if (parsed.narrative.length > MAX_NARRATIVE_LENGTH) {
    warnings.push(`叙事文本超过 ${MAX_NARRATIVE_LENGTH} 字符，已截断`)
    parsed = { ...parsed, narrative: parsed.narrative.slice(0, MAX_NARRATIVE_LENGTH) }
  }

  if (parsed.narrative && !hasCompleteNarrativeEnd(parsed.narrative)) {
    const repairedNarrative = trimIncompleteNarrativeTail(parsed.narrative)
    if (repairedNarrative !== parsed.narrative.trim()) {
      warnings.push('叙事疑似未完整收束，已移除末尾未完成片段')
      parsed = { ...parsed, narrative: repairedNarrative }
    } else {
      warnings.push('叙事疑似未完整收束，且未找到可保留的完整句边界')
    }
  }

  const cleaned = parsed.narrative.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  )
  if (cleaned !== parsed.narrative) {
    warnings.push('叙事含可疑 script 标签，已剥离')
    parsed = { ...parsed, narrative: cleaned }
  }

  return { parsed, blocked: false, warnings }
}

/** 步骤 2：schema 校验（丢弃非法 changes，不阻断叙事） */
export function schemaInterceptor(ctx: NarrativeInterceptorContext): NarrativeInterceptorOutcome {
  const validChanges = validateRoundChanges(ctx.parsed.changes)
  const dropped = ctx.parsed.changes.length - validChanges.length
  const warnings = dropped > 0 ? [`schema 拦截器丢弃 ${dropped} 条非法变更`] : []

  return {
    parsed: { ...ctx.parsed, changes: validChanges },
    blocked: false,
    warnings,
  }
}

/** 步骤 3：死循环保护 */
export function deadLoopInterceptor(ctx: NarrativeInterceptorContext): NarrativeInterceptorOutcome {
  const check = globalDeadLoopDetector.checkAndIncrement('narrative-interceptor', 150)
  if (!check.allowed) {
    const reason = check.reason ?? '叙事拦截器死循环保护触发'
    return {
      parsed: { ...ctx.parsed, changes: [] },
      blocked: true,
      blockReason: reason,
      warnings: [reason],
    }
  }
  return { parsed: ctx.parsed, blocked: false, warnings: [] }
}

export const DEFAULT_NARRATIVE_INTERCEPTORS: NarrativeInterceptor[] = [
  safetyInterceptor,
  schemaInterceptor,
  deadLoopInterceptor,
]

/**
 * 顺序执行拦截器链
 */
export function runNarrativeInterceptors(
  ctx: NarrativeInterceptorContext,
  interceptors: NarrativeInterceptor[] = DEFAULT_NARRATIVE_INTERCEPTORS,
): NarrativeInterceptorOutcome {
  let current = ctx
  const allWarnings: string[] = []

  for (const interceptor of interceptors) {
    const outcome = interceptor(current)
    allWarnings.push(...outcome.warnings)
    if (outcome.blocked) {
      return { ...outcome, warnings: allWarnings }
    }
    current = { ...current, parsed: outcome.parsed }
  }

  return { parsed: current.parsed, blocked: false, warnings: allWarnings }
}
