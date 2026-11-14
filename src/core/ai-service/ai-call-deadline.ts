/**
 * Purpose: Resolve the shared AI request deadline from call kind and reasoning mode.
 * Owner: core / ai-service
 * Responsibility: Deadline calculation only; callers own cancellation and failure handling.
 */

import type { ReasoningEffort } from '@/foundation'

export interface AiCallDeadlineInput {
  callKind: string
  reasoningEffort: ReasoningEffort
  /** 主故事一次请求里要求模型产出的连续回合数；批量越多次线性放宽工作负载预算。 */
  batchRounds?: number
}

export const AI_CALL_DEADLINE_MIN_MS = 60_000
export const AI_CALL_DEADLINE_MAX_MS = 10 * 60_000

/** 主故事批量输出每多一轮追加的生成预算。 */
const BATCH_ROUND_EXTRA_MS = 15_000

const REASONING_RESERVE_MS: Readonly<Record<ReasoningEffort, number>> = {
  disabled: 0,
  auto: 60_000,
  high: 120_000,
  max: 240_000,
}

function workloadProfile(callKind: string, batchRounds?: number): number {
  const kind = callKind.trim().toLowerCase()
  if (kind === 'narrative-main') {
    const rounds = Number.isFinite(batchRounds) ? Math.max(1, Math.floor(batchRounds as number)) : 1
    return 60_000 + (rounds - 1) * BATCH_ROUND_EXTRA_MS
  }
  if (kind === 'immersion-warmup') {
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

/** 按调用类型、推理模式与批量轮数计算一次 HTTP 请求从开始到完整终态的总时限。 */
export function computeAiCallDeadlineMs(input: AiCallDeadlineInput): number {
  if (!input.callKind.trim()) throw new Error('AI 调用时限缺少 callKind')
  const rawDeadline = workloadProfile(input.callKind, input.batchRounds)
    + REASONING_RESERVE_MS[input.reasoningEffort]
  const rounded = Math.ceil(rawDeadline / 1_000) * 1_000
  return Math.min(AI_CALL_DEADLINE_MAX_MS, Math.max(AI_CALL_DEADLINE_MIN_MS, rounded))
}
