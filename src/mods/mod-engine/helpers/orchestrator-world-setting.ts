/**
 * Purpose: Build the public WorldSetting projection consumed by the orchestrator.
 * Owner: mod-engine
 * Responsibility: World-setting and era-anchor projection only; world state remains owned by mod-world.
 *
 * @module orchestrator-world-setting.ts
 * @description 构建 orchestrator.setContext 用的 WorldSetting（含纪年锚点）
 * @mod mod-engine
 */

import type { WorldSetting } from '@/foundation'
import { formatEraYear } from '@/foundation/utils/format-time'

import {
  inferAnchorYearFromDescription,
  useWorldStore,
  type WorldConfig,
} from '@/mods/mod-world/world-runtime-api'

export function buildOrchestratorWorldSetting(
  worldConfig: WorldConfig,
  options?: {
    contextId?: string
    eraStartYear?: number
    eraName?: string
    extraConfig?: Record<string, unknown>
  },
): WorldSetting {
  const worldState = useWorldStore.getState()
  const contextId = options?.contextId ?? worldState.currentContextId
  const instance = contextId ? worldState.contexts[contextId] : undefined
  const eraStartYear = options?.eraStartYear
    ?? worldConfig.eraStartYear
    ?? inferAnchorYearFromDescription(worldConfig.description)
    ?? 0
  // 纪元名称：优先来自 WorldConfig，缺省时由引擎自动判定
  const eraName = options?.eraName
    ?? worldConfig.eraName
    ?? (eraStartYear !== 0 ? '' : '创世纪元')
  const calendarYear = eraStartYear !== 0 ? eraStartYear : 1
  const eraLabel = formatEraYear(calendarYear, eraName)

  return {
    contextId: instance?.record.id ?? contextId ?? `legacy-context:${worldConfig.name}`,
    contextKind: instance?.record.kind ?? 'world',
    simulationScope: instance?.scope.scope ?? 'active',
    capabilityProfile: instance?.capabilityProfile ?? {
      contextId: contextId ?? `legacy-context:${worldConfig.name}`,
      capabilities: ['space'],
      enabledSubsystemIds: [],
      backgroundSubsystemIds: [],
      derivedFrom: 'migration',
    },
    name: worldConfig.name,
    description: worldConfig.description,
    era: eraLabel,
    config: {
      ...(worldConfig as unknown as Record<string, unknown>),
      _eraStartYear: eraStartYear,
      _eraName: eraName,
      _birthEraYear: eraStartYear,
      _contextId: instance?.record.id ?? contextId,
      _contextKind: instance?.record.kind,
      _simulationScope: instance?.scope.scope ?? 'active',
      _enabledSubsystemIds: instance?.capabilityProfile.enabledSubsystemIds ?? [],
      _localCalendar: instance ? structuredClone(instance.record.localCalendar) : undefined,
      _localClock: instance ? structuredClone(instance.record.localClock) : undefined,
      ...options?.extraConfig,
    },
  }
}
