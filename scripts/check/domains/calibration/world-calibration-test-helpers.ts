/**
 * @module world-calibration-test-helpers.ts
 * @description 世界校准验收测试共享工具
 */

import type { WorldConfig, WorldCalibrationFormulas } from '@/mods/mod-world/types'

import { worldCalibrationOutputSchema } from '@/mods/mod-world/prompts/world-calibration-prompt'
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

/** 模拟 world-init-bundle Step 0：Zod safeParse → clampCalibration */
export function simulateAiCalibrationPath(raw: unknown, config: WorldConfig) {
  const zodResult = worldCalibrationOutputSchema.safeParse(raw ?? {})
  const clamped = clampCalibration(zodResult.success ? zodResult.data : raw, config)
  return { zodOk: zodResult.success, clamped }
}
