/**
 * @module calibration-access.ts
 * @description 子系统读取 WorldCalibration 公式系数的统一入口
 * @mod mod-world
 */

import type { WorldCalibration, WorldCalibrationFormulas } from '../types'

import { useWorldStore } from '../store'
import { clampModifier } from './calibration-clamp'

/** 读取当前世界的校准数据（Store 未就绪时返回 null，由调用方使用默认值） */
export function getWorldCalibration(): WorldCalibration | null {
  const getState = useWorldStore.getState
  if (typeof getState !== 'function') return null
  return getState().calibration
}

/** 读取 L2 公式 modifier（默认 1.0，已 clamp）。 */
export function getFormulaModifier(
  key: keyof WorldCalibrationFormulas,
  defaultValue = 1.0,
  contextId?: string,
): number {
  const state = useWorldStore.getState()
  const context = contextId ? state.contexts[contextId] : undefined
  const cal = contextId ? context?.calibration : state.calibration
  const raw = cal?.formulas?.[key]
  let base = defaultValue
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    base = clampModifier(raw)
  }

  return base
}
