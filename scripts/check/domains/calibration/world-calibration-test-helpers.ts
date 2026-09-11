/**
 * Purpose: Provide shared WorldConfig fixtures and calibration readers for domain checks.
 * Owner: scripts/check/domains/calibration
 * Responsibility: Test data construction only; production state and formulas stay with their owners.
 *
 * @module world-calibration-test-helpers.ts
 * @description 世界校准验收测试共享工具
 */

import type { WorldConfig, WorldCalibrationFormulas } from '@/mods/mod-world/types'

import { clampCalibration } from '@/mods/mod-world/utils/calibration-clamp'
import { createDefaultPowerFramework } from '@/mods/mod-world/utils/power-framework'

export function baseConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    name: '测试世界',
    essenceTag: 'historical',
    powerSystemTag: 'none',
    powerFramework: createDefaultPowerFramework('none', { contextId: 'test' }),
    spatialForm: 'universe',
    civilizationStage: 'medieval',
    difficulty: 'normal',
    description: '验收测试用世界',
    ...overrides,
  }
}

export function formula(
  cal: ReturnType<typeof clampCalibration>,
  key: keyof WorldCalibrationFormulas,
  fallback = 1,
): number {
  const val = cal.formulas?.[key]
  return typeof val === 'number' ? val : fallback
}
