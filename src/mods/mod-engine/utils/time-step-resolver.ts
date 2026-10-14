/**
 * Purpose: Normalize UI and persisted time-step values before runtime advancement.
 * Owner: mod-engine/time
 * Responsibility: Keep only the canonical calendar clock at the runtime boundary.
 *
 * @module time-step-resolver.ts
 * @description 日历时间步长解析
 * @mod mod-engine
 */

import { normalizeCanonicalTimeStep, type TimeStep } from '@/foundation'

export interface ResolvedTick {
  /** 传给 TimeSystem.advance 的规范化步长 */
  calendarAdvance: TimeStep
}
/**
 * Normalize a persisted/UI step to one of the seven public canonical values.
 * Removed or malformed values restore the default one-year step.
 */
export function resolveTimeStep(step: TimeStep | undefined): ResolvedTick {
  return { calendarAdvance: normalizeCanonicalTimeStep(step) }
}
