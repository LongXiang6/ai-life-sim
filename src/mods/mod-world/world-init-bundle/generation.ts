/**
 * Purpose: Run background AI enrichment for an already committed world initialization.
 * Owner: mod-world / world-init bundle.
 * Responsibility: World enrichment pipeline only; local context commit and launch locking stay outside.
 */

import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import { useWorldStore } from '../store'
import { applyCoherenceToWorldConfig } from '../world-init-bundle-deps'
import type { WorldConfig } from '../types'
import {
  createWorldInitPipelineContext,
  injectWorldInitOrchestratorContext,
  runWorldInitPipeline,
} from '../utils/world-init-pipeline'
import { resolvePipelineAnchorYear } from '../utils/world-init-anchor-year'
import { WORLD_AI_CONFIG, type WorldInitBundleResult } from './contracts'

export async function generateWorldInitBundle(
  configInput: WorldConfig,
  worldCode: number,
  startingYear?: number,
): Promise<WorldInitBundleResult> {
  const configBeforeCoherence = configInput
  const config = applyCoherenceToWorldConfig(configInput)
  if (config !== configInput) useWorldStore.getState().setWorldConfig(config)

  if (!useSettingsStore.getState().customKey) {
    console.info('[mod-world] 跳过后台 AI 初始化（API Key 未配置）')
    return {
      calibrationGenerated: false,
      tagsGenerated: false,
      configGenerated: false,
      regionProfilesGenerated: false,
      errors: [],
    }
  }

  const anchorYear = resolvePipelineAnchorYear(config, startingYear)
  const context = createWorldInitPipelineContext(
    config,
    configBeforeCoherence,
    worldCode,
    WORLD_AI_CONFIG,
    anchorYear,
  )
  const result = await runWorldInitPipeline(context)

  await injectWorldInitOrchestratorContext(config, result.rawTags)
  const successCount = [
    result.calibrationGenerated,
    result.tagsGenerated,
    result.configGenerated,
    result.regionProfilesGenerated,
  ].filter(Boolean).length
  console.info(
    `[mod-world] 世界 "${config.name}" AI 初始化完成: ${successCount}/4 成功`
      + (result.errors.length > 0 ? `，${result.errors.length} 项失败` : ''),
  )
  if (result.errors.length > 0) console.warn('[mod-world] 世界 AI 初始化部分失败', result.errors)
  return result
}
