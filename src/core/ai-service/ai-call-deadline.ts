/**
 * @module ai-call-deadline.ts
 * @description 浏览器与代理共享的 AI 工作量总时限计算
 * @mod core
 */

import type { ReasoningEffort } from '@/foundation'

export interface AiCallDeadlineInput {
  callKind: string
  maxTokens: number
  reasoningEffort: ReasoningEffort
}

export const AI_CALL_DEADLINE_MIN_MS = 60_000
export const AI_CALL_DEADLINE_MAX_MS = 10 * 60_000

const REASONING_RESERVE_MS: Readonly<Record<ReasoningEffort, number>> = {
  disabled: 0,
  auto: 60_000,
  high: 120_000,
  max: 240_000,
}

function workloadProfile(callKind: string): { baseMs: number; perTokenMs: number } {
  const kind = callKind.trim().toLowerCase()
  if (kind === 'narrative-main' || kind === 'immersion-warmup' || kind === 'narrative-format-repair') {
    return { baseMs: 60_000, perTokenMs: 35 }
  }
  if (kind.startsWith('summary-compress-')) {
    return { baseMs: 50_000, perTokenMs: 30 }
  }
  if (
    kind === 'narrative-basic-attribute-analysis'
    || kind === 'narrative-basic-attribute-analysis-format-repair'
    || kind === 'narrative-data-analysis'
    || kind === 'narrative-data-analysis-format-repair'
    || kind === 'narrative-event-recognition'
    || kind === 'narrative-event-recognition-format-repair'
    || kind === 'narrative-macro-impact'
    || kind === 'narrative-macro-impact-format-repair'
  ) {
    return { baseMs: 45_000, perTokenMs: 28 }
  }
  return { baseMs: 45_000, perTokenMs: 30 }
}

/** 按合法最大输出与推理模式计算一次 HTTP 请求从开始到完整终态的总时限。 */
export function computeAiCallDeadlineMs(input: AiCallDeadlineInput): number {
  if (!input.callKind.trim()) throw new Error('AI 调用时限缺少 callKind')
  if (!Number.isFinite(input.maxTokens) || input.maxTokens <= 0) {
    throw new Error('AI 调用时限缺少有效 maxTokens')
  }

  const maxTokens = Math.ceil(input.maxTokens)
  const profile = workloadProfile(input.callKind)
  const rawDeadline = profile.baseMs
    + maxTokens * profile.perTokenMs
    + REASONING_RESERVE_MS[input.reasoningEffort]
  const rounded = Math.ceil(rawDeadline / 1_000) * 1_000
  return Math.min(AI_CALL_DEADLINE_MAX_MS, Math.max(AI_CALL_DEADLINE_MIN_MS, rounded))
}
