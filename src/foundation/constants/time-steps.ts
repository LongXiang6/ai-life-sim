/**
 * Purpose: Define the shared calendar time-step options.
 * Owner: foundation:constants
 * Responsibility: Expose stable calendar labels and codecs for UI and engine consumers.
 *
 * @module time-steps.ts
 * @description 全局日历时间步进档位（UI + 引擎共用）
 * @mod foundation
 */

import type { TimeStep } from '../types'

export type TimeStepOption = TimeStep & {
  label: string
  experimental?: boolean
  icon?: string
}

const STEP_ICONS: Record<string, string> = {
  'day:1': '🌅',
  'month:1': '🌙',
  'season:1': '🍂',
  'year:1': '📅',
  'year:3': '⚡',
  'year:5': '🚀',
  'year:10': '⏩',
}

const RAW_STEPS: Array<TimeStep & { label: string; experimental?: boolean }> = [
  { unit: 'day', value: 1, label: '日' },
  { unit: 'month', value: 1, label: '月' },
  { unit: 'season', value: 1, label: '季' },
  { unit: 'year', value: 1, label: '年' },
  { unit: 'year', value: 3, label: '3年' },
  { unit: 'year', value: 5, label: '5年' },
  { unit: 'year', value: 10, label: '10年' },
]

/** 可用时间步长列表（从细到粗） */
export const AVAILABLE_TIME_STEPS: TimeStepOption[] = RAW_STEPS.map((s) => ({
  ...s,
  icon: STEP_ICONS[`${s.unit}:${s.value}`] ?? '📅',
}))

/** UI 默认展示（日历粒度推进 + 年度宏观快进） */
export const PRIMARY_TIME_STEPS: TimeStepOption[] = AVAILABLE_TIME_STEPS

export const CANONICAL_TIME_STEP_KEYS = AVAILABLE_TIME_STEPS.map(encodeTimeStepKey)
const CANONICAL_TIME_STEP_KEY_SET = new Set(CANONICAL_TIME_STEP_KEYS)

/** Normalize persisted or external values to one of the seven public steps. */
export function normalizeCanonicalTimeStep(step: unknown): TimeStep {
  if (step && typeof step === 'object' && !Array.isArray(step)) {
    const value = step as Partial<TimeStep>
    const numeric = typeof value.value === 'number' ? value.value : Number(value.value)
    const key = `${value.unit}:${Number.isSafeInteger(numeric) ? numeric : ''}`
    if (CANONICAL_TIME_STEP_KEY_SET.has(key)) {
      const [unit, rawValue] = key.split(':')
      return { unit: unit as TimeStep['unit'], value: Number(rawValue) }
    }
  }
  return { unit: 'year', value: 1 }
}

/** 编码为 UI 选择键 `unit:value` */
export function encodeTimeStepKey(step: TimeStep): string {
  return `${step.unit}:${step.value}`
}

/** 从 UI 键解码 */
export function decodeTimeStepKey(key: string): TimeStep {
  return normalizeCanonicalTimeStep(
    key.includes(':')
      ? (() => {
          const [unit, raw] = key.split(':')
          return { unit, value: Number(raw) }
        })()
      : undefined,
  )
}

export function findTimeStepOption(key: string): TimeStepOption | undefined {
  return AVAILABLE_TIME_STEPS.find((s) => encodeTimeStepKey(s) === key)
}
