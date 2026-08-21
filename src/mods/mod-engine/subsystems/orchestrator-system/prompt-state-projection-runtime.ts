/**
 * Purpose: Project stable world configuration for the approved story input.
 * Owner: mod-engine
 * Responsibility: Remove internal-only configuration before the world projection is serialized.
 */

import type { OrchestratorSystem } from '../orchestrator-system'

export function buildLightWorldSettingRuntime(
  orchestrator: OrchestratorSystem,
  eraLabel: string,
): import('@/foundation').WorldSetting {
  if (!orchestrator['worldSetting']) {
    return { name: '', description: '', era: eraLabel, config: {} } as import('@/foundation').WorldSetting
  }

  const worldSetting = orchestrator['worldSetting'] as unknown as Record<string, unknown>
  const { config, ...rest } = worldSetting
  const lightConfig = config && typeof config === 'object'
    ? { ...config as Record<string, unknown> }
    : {}

  delete lightConfig.aiDetailedParameters
  delete lightConfig.description
  for (const key of Object.keys(lightConfig)) {
    if (key.startsWith('_') || lightConfig[key] === undefined) delete lightConfig[key]
  }

  return {
    ...rest,
    era: eraLabel,
    config: lightConfig,
  } as unknown as import('@/foundation').WorldSetting
}
