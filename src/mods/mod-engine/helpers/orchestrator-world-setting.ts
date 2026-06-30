/**
 * @module orchestrator-world-setting.ts
 * @description 构建 orchestrator.setContext 用的 WorldSetting（含纪年锚点）
 * @mod mod-engine
 */

import type { WorldSetting } from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'

import type { WorldConfig } from '@/mods/mod-world'
import { inferAnchorYearFromDescription } from '@/mods/mod-world/world-init-api'

export function buildOrchestratorWorldSetting(
  worldConfig: WorldConfig,
  options?: {
    eraStartYear?: number
    extraConfig?: Record<string, unknown>
  },
): WorldSetting {
  const eraStartYear = options?.eraStartYear
    ?? inferAnchorYearFromDescription(worldConfig.description)
    ?? 0
  const calendarYear = eraStartYear !== 0 ? eraStartYear : 1
  const eraLabel = formatEraYear(calendarYear, eraStartYear !== 0 ? '' : '创世纪元')

  return {
    name: worldConfig.name,
    description: worldConfig.description,
    era: eraLabel,
    config: {
      ...(worldConfig as unknown as Record<string, unknown>),
      _eraStartYear: eraStartYear,
      _birthEraYear: eraStartYear,
      ...options?.extraConfig,
    },
  }
}
