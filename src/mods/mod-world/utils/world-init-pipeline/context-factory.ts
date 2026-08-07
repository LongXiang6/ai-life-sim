/**
 * Purpose: Build a fully initialized world-init pipeline context from player settings and world config.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Context construction and initial region projection only; no step execution.
 */

import type { AIModelConfig } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { useWorldStore } from '../../store'
import type { WorldConfig } from '../../types'
import { buildWorldInitFingerprint } from '../../world-init-bundle-deps'
import { buildWorldInitPromptVars } from '../world-init-prompt-vars'
import { resolvePipelineAnchorYear } from '../world-init-anchor-year'
import type { WorldInitPipelineContext } from './contracts'
import { syncPipelineRegions } from './context-state'

export function createWorldInitPipelineContext(
  config: WorldConfig,
  configBeforeCoherence: WorldConfig,
  worldCode: number,
  aiConfig: AIModelConfig,
  startingYear?: number,
): WorldInitPipelineContext {
  const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
  const model = customModel || aiConfig.model
  const initFingerprint = buildWorldInitFingerprint(config, config.description)
  const anchorYear = resolvePipelineAnchorYear(config, startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  if (config.eraName) useWorldStore.getState().setEraName(config.eraName)

  const context: WorldInitPipelineContext = {
    config,
    configBeforeCoherence,
    worldCode,
    startingYear: anchorYear,
    model,
    provider,
    customUrl: customUrl || '',
    customKey: customKey || '',
    aiConfig,
    initFingerprint,
    promptVars: buildWorldInitPromptVars(config, { beforeConfig: configBeforeCoherence }),
    errors: [],
    calibrationGenerated: false,
    tagsGenerated: false,
    configGenerated: false,
    regionProfilesGenerated: false,
    currentStep: '准备中',
  }
  syncPipelineRegions(context)
  return context
}
