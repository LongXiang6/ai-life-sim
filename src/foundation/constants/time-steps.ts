/**
 * Purpose: Define the shared calendar and event-node time-step options.
 * Owner: foundation:constants
 * Responsibility: Expose stable time-step labels and codecs for UI and engine consumers.
 *
 * @module time-steps.ts
 * @description 全局时间步进档位（UI + 引擎共用）
 * @mod foundation
 */

import type { TimeStep } from '../types'
import {
  DEFAULT_ANNUAL_EVENT_COUNT,
  normalizeAnnualEventCount,
} from '../utils/annual-clock'

export type TimeStepOption = TimeStep & {
  label: string
  experimental?: boolean
  icon?: string
}

const STEP_ICONS: Record<string, string> = {
  'year:1': '📅',
  'year:3': '⚡',
  'year:5': '🚀',
  'year:10': '⏩',
  [`event:${DEFAULT_ANNUAL_EVENT_COUNT}`]: '🧭',
  'event:24': '🧭',
}

const RAW_STEPS: Array<TimeStep & { label: string; experimental?: boolean }> = [
  { unit: 'event', value: DEFAULT_ANNUAL_EVENT_COUNT, label: '12节点/年' },
  { unit: 'event', value: 24, label: '24节点/年', experimental: true },
  { unit: 'year', value: 1, label: '年' },
  { unit: 'year', value: 3, label: '3年' },
  { unit: 'year', value: 5, label: '5年' },
  { unit: 'year', value: 10, label: '10年' },
  { unit: 'year', value: 50, label: '50年' },
  { unit: 'year', value: 100, label: '100年' },
  { unit: 'year', value: 200, label: '200年' },
  { unit: 'year', value: 500, label: '500年' },
  { unit: 'year', value: 1000, label: '1000年' },
]

/** 可用时间步长列表（从细到粗） */
export const AVAILABLE_TIME_STEPS: TimeStepOption[] = RAW_STEPS.map((s) => ({
  ...s,
  icon: STEP_ICONS[`${s.unit}:${s.value}`] ?? '📅',
}))

/** UI 默认展示（事件轮次 + 年度宏观快进） */
export const PRIMARY_TIME_STEPS: TimeStepOption[] = AVAILABLE_TIME_STEPS.filter(
  (s) => !s.experimental,
)

/** 编码为 UI 选择键 `unit:value` */
export function encodeTimeStepKey(step: TimeStep): string {
  return `${step.unit}:${step.value}`
}

/** 从 UI 键解码 */
export function decodeTimeStepKey(key: string): TimeStep {
  const [unit, raw] = key.split(':')
  const value = Number(raw)
  if (unit === 'year' && Number.isFinite(value) && value > 0) {
    return { unit: 'year', value: Math.floor(value) }
  }
  if (unit === 'event' && Number.isFinite(value) && value > 0) {
    return { unit: 'event', value: normalizeAnnualEventCount(value) }
  }
  // Legacy day/month/season keys are accepted only at this boundary and are
  // normalized to the canonical annual event clock.
  return { unit: 'event', value: DEFAULT_ANNUAL_EVENT_COUNT }
}

export function findTimeStepOption(key: string): TimeStepOption | undefined {
  return AVAILABLE_TIME_STEPS.find((s) => encodeTimeStepKey(s) === key)
}
