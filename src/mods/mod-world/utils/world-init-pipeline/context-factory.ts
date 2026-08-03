/**
 * Purpose: Build a fully initialized world-init pipeline context from player settings and world config.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Context construction and entity-service injection only; no step execution.
 */

import type { AIModelConfig } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'

import { useWorldStore } from '../../store'
import type { WorldConfig } from '../../types'
import {
  buildWorldInitFingerprint,
  getWorldEntitySystem,
  worldEntityPrompt,
} from '../../world-init-bundle-deps'
import { buildWorldInitPromptVars } from '../world-init-prompt-vars'
import { resolvePipelineAnchorYear } from '../world-init-anchor-year'
import type { WorldInitPipelineBudgets } from '../world-init-budgets'
import { buildWorldInitContentLogMetaResolver } from '../world-init-ai-validation'
import { coherenceGuardFromConfig, createWorldInitAIService } from './ai-service'
import type { WorldInitPipelineContext } from './contracts'
import { syncEntitySystemRegions } from './context-state'

export function createWorldInitPipelineContext(
  config: WorldConfig,
  configBeforeCoherence: WorldConfig,
  worldCode: number,
  aiConfig: AIModelConfig,
  budgets: WorldInitPipelineBudgets,
  startingYear?: number,
): WorldInitPipelineContext {
  const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
  const model = customModel || aiConfig.model
  const description = config.description
  const initFingerprint = buildWorldInitFingerprint(config, description)
  const anchorYear = resolvePipelineAnchorYear(config, startingYear)
  useWorldStore.getState().setEraStartYear(anchorYear)
  if (config.eraName) useWorldStore.getState().setEraName(config.eraName)
  const promptVars = buildWorldInitPromptVars(config, { beforeConfig: configBeforeCoherence })

  const entitySystem = getWorldEntitySystem()
  entitySystem.setWorldContext(
    config.name,
    description,
    config.civilizationStage,
    promptVars.coherenceHint,
    promptVars.coherenceNote,
    config.worldType ?? 'idealist',
  )
  entitySystem.setAIService(createWorldInitAIService(
    aiConfig,
    worldEntityPrompt.systemPrompt,
    budgets.entities,
    'world-init/pipeline:entities',
    buildWorldInitContentLogMetaResolver('entities', coherenceGuardFromConfig(config)),
    { subPool: 'geo', worldCode },
    worldEntityPrompt.outputSchema,
  ))
  syncEntitySystemRegions(entitySystem, config)

  return {
    config,
    configBeforeCoherence,
    worldCode,
    startingYear: anchorYear,
    model,
    provider,
    customUrl: customUrl || '',
    customKey: customKey || '',
    aiConfig,
    budgets,
    initFingerprint,
    promptVars,
    errors: [],
    calibrationGenerated: false,
    tagsGenerated: false,
    configGenerated: false,
    entitiesGenerated: false,
    currentStep: '准备中',
    entitySystem,
  }
}
