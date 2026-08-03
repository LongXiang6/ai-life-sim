/**
 * Purpose: Run background AI enrichment for an already committed world initialization.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Pipeline and scoring enrichment only; local context commit and launch locking stay outside.
 */

import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import { useWorldStore } from '../store'
import { applyCoherenceToWorldConfig } from '../world-init-bundle-deps'
import type { WorldConfig } from '../types'
import { generateWorldScoringProfile } from '../world-scoring-profile-generation'
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
      entitiesGenerated: false,
      scoringProfileGenerated: false,
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

  let scoringProfileGenerated = config._scoringProfileSource === 'ai'
  const current = useWorldStore.getState()
  const activeWorldId = current.currentContextId
    ?? current.worldConfig?.scoringProfile?.worldId
    ?? `world-${worldCode}`
  if (!scoringProfileGenerated) {
    try {
      const profile = await generateWorldScoringProfile(config, activeWorldId, worldCode)
      const latest = useWorldStore.getState()
      if (latest.worldCode === worldCode && latest.worldConfig) {
        latest.setWorldConfig({
          ...latest.worldConfig,
          scoringProfile: profile,
          _scoringProfileSource: 'ai',
        })
        scoringProfileGenerated = true
      }
    } catch (error) {
      result.errors.push(`结算维度生成失败，继续使用本地维度：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  await injectWorldInitOrchestratorContext(config, result.rawTags)
  const successCount = [
    result.calibrationGenerated,
    result.tagsGenerated,
    result.configGenerated,
    result.entitiesGenerated,
    scoringProfileGenerated,
  ].filter(Boolean).length
  console.info(
    `[mod-world] 世界 "${config.name}" AI 初始化完成: ${successCount}/5 成功`
      + (result.errors.length > 0 ? `，${result.errors.length} 项失败` : ''),
  )
  if (result.errors.length > 0) console.warn('[mod-world] 世界 AI 初始化部分失败', result.errors)
  return { ...result, scoringProfileGenerated }
}
