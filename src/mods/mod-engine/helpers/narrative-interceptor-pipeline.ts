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

const NARRATIVE_LENGTH_WARNING_THRESHOLD = 50_000
const COMPLETE_NARRATIVE_END_CHARS = new Set(['。', '！', '？', '…', '」', '”', '）', '】'])

function hasCompleteNarrativeEnd(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const last = trimmed.at(-1)
  return Boolean(last && COMPLETE_NARRATIVE_END_CHARS.has(last))
}

/** 步骤 1：安全边界 */
export function safetyInterceptor(ctx: NarrativeInterceptorContext): NarrativeInterceptorOutcome {
  const warnings: string[] = []
  let parsed = ctx.parsed

  if (parsed.narrative.length > NARRATIVE_LENGTH_WARNING_THRESHOLD) {
    warnings.push(`叙事文本超过 ${NARRATIVE_LENGTH_WARNING_THRESHOLD} 字符，已保留全文`)
  }

  if (parsed.narrative && !hasCompleteNarrativeEnd(parsed.narrative)) {
    warnings.push('叙事疑似未完整收束，已保留全文并交由三段归一化处理')
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

/** 步骤 2：schema 校验。任一非法变更出现时整包拒绝状态变更，禁止部分提交。 */
export function schemaInterceptor(ctx: NarrativeInterceptorContext): NarrativeInterceptorOutcome {
  if (ctx.parsed.metadataRejected) {
    return {
      parsed: {
        narrative: ctx.parsed.narrative,
        digest: ctx.parsed.digest,
        metadataRejected: true,
        structuredDataPresent: ctx.parsed.structuredDataPresent,
        changes: [],
        notableEvents: [],
      },
      blocked: false,
      warnings: ['完整 META Schema 校验失败，已整包拒绝本轮 META；叙事正文保持完整'],
    }
  }

  const validChanges = validateRoundChanges(ctx.parsed.changes)
  if (ctx.parsed.changes.length > 0 && validChanges.length === 0) {
    return {
      parsed: {
        narrative: ctx.parsed.narrative,
        digest: ctx.parsed.digest,
        metadataRejected: true,
        structuredDataPresent: ctx.parsed.structuredDataPresent,
        changes: [],
        notableEvents: [],
      },
      blocked: false,
      warnings: ['schema 拦截器发现非法变更，已整包拒绝本轮 META；叙事正文保持完整'],
    }
  }

  return {
    parsed: { ...ctx.parsed, changes: validChanges },
    blocked: false,
    warnings: [],
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
