/**
 * Purpose: Normalize UI and persisted time-step values before runtime advancement.
 * Owner: mod-engine/time
 * Responsibility: Keep only the canonical year/event clock at the runtime boundary.
 *
 * @module time-step-resolver.ts
 * @description 年度基础点时间步长解析
 * @mod mod-engine
 */

import {
  DEFAULT_ANNUAL_EVENT_COUNT,
  normalizeAnnualEventCount,
} from '@/foundation'
import type { TimeStep } from '@/foundation'

export interface ResolvedTick {
  /** 传给 TimeSystem.advance 的规范化步长 */
  calendarAdvance: TimeStep
}
/**
 * Normalize a persisted/UI step. Legacy day/month/season values are accepted
 * only at this boundary and become the default annual event budget.
 */
export function resolveTimeStep(step: TimeStep): ResolvedTick {
  if (step?.unit === 'year') {
    return {
      calendarAdvance: {
        unit: 'year',
        value: Math.max(1, Math.floor(Number.isFinite(step.value) ? step.value : 1)),
      },
    }
  }
  if (step?.unit === 'event') {
    return {
      calendarAdvance: {
        unit: 'event',
        value: normalizeAnnualEventCount(step.value),
      },
    }
  }
  return {
    calendarAdvance: {
      unit: 'event',
      value: DEFAULT_ANNUAL_EVENT_COUNT,
    },
  }
}
