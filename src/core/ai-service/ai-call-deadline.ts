/**
 * Purpose: Resolve the shared AI request deadline from call kind and reasoning mode.
 * Owner: core / ai-service
 * Responsibility: Deadline calculation only; callers own cancellation and failure handling.
 */

import type { ReasoningEffort } from '@/foundation'

export interface AiCallDeadlineInput {
  callKind: string
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

function workloadProfile(callKind: string): number {
  const kind = callKind.trim().toLowerCase()
  if (kind === 'narrative-main' || kind === 'immersion-warmup') {
    return 60_000
  }
  if (kind === 'narrative-story-continuity') {
    return 50_000
  }
  if (
    kind === 'narrative-talent-growth'
  ) {
    return 45_000
  }
  return 45_000
}

/** 按调用类型与推理模式计算一次 HTTP 请求从开始到完整终态的总时限。 */
export function computeAiCallDeadlineMs(input: AiCallDeadlineInput): number {
  if (!input.callKind.trim()) throw new Error('AI 调用时限缺少 callKind')
  const rawDeadline = workloadProfile(input.callKind)
    + REASONING_RESERVE_MS[input.reasoningEffort]
  const rounded = Math.ceil(rawDeadline / 1_000) * 1_000
  return Math.min(AI_CALL_DEADLINE_MAX_MS, Math.max(AI_CALL_DEADLINE_MIN_MS, rounded))
}
