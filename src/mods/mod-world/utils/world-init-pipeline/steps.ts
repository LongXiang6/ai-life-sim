/**
 * Purpose: Declare the default world-init execution graph and its business step actions.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Step definitions and dependencies only; the shared runner owns terminal publication.
 */

import {
  worldDimensionCalibrationPrompt,
  worldRegionProfileOutputSchema,
  worldRegionProfilePrompt,
} from '../../world-init-bundle-deps'
import { calibrationEchoesDescription } from '../world-coherence-output-guard'
import {
  fromDimensionCalibrationDiagnostics,
} from '../world-init-ai-validation'
import {
  getDimensionCalibrationDiagnostics,
  getDimensionCalibrationValidationError,
  parseWorldDimensionCalibrationResponse,
} from '../world-dimension-calibration-parse'
import { parseWorldRegionProfileOutput } from '../world-region-profile'
import { callWorldInitAIOnce } from './ai-service'
import {
  WORLD_INIT_FAILURE_TARGET,
  WORLD_INIT_OWNER,
  type WorldInitPipelineContext,
  type WorldInitStep,
} from './contracts'
import {
  applyCalibrationParsed,
  commitRegionProfileOutput,
  finalizeAnchorYear,
  loadCalibrationFromCache,
  shouldRunDimensionInference,
  syncContextPromptVars,
  syncPipelineRegions,
} from './context-state'

function buildDimensionCalibrationStep(): WorldInitStep {
  return {
    id: 'dimension-calibration',
    label: '维度推断与校准',
    phase: 'execute',
    dependsOn: ['queue-world-init'],
    order: 100,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
    run: async (context) => {
      const modes = context.config._dimensionModes ?? {}
      const needInference = shouldRunDimensionInference(modes)
      if (loadCalibrationFromCache(context)) {
        finalizeAnchorYear(context)
        return { status: 'succeeded' }
      }

      syncContextPromptVars(context)
      const raw = await callWorldInitAIOnce(
        context,
        worldDimensionCalibrationPrompt.systemPrompt,
        worldDimensionCalibrationPrompt.userPromptTemplate,
        'world-init/pipeline:dimension-calibration',
        'cal',
        (response) => {
          if (calibrationEchoesDescription(response, context.config.description.length)) {
            throw new Error('dimension-calibration 错误回写了 worldDescription 全文')
          }
          const error = getDimensionCalibrationValidationError(response)
          if (error) throw new Error(error)
        },
        (response) => fromDimensionCalibrationDiagnostics(getDimensionCalibrationDiagnostics(response)),
        worldDimensionCalibrationPrompt.outputSchema,
      )
      const bundle = parseWorldDimensionCalibrationResponse(raw)
      if (!bundle) throw new Error('dimension-calibration 解析失败')
      applyCalibrationParsed(context, bundle, needInference)
      syncContextPromptVars(context)
      finalizeAnchorYear(context)

      console.info('[mod-world] 维度推断+校准完成:', {
        powerSystem: context.config.powerSystemTag,
        essenceTag: context.config.essenceTag,
        civilizationStage: context.config.civilizationStage,
        spatialForm: context.config.spatialForm,
        powerFramework: {
          label: context.config.powerFramework.label,
          progression: context.config.powerFramework.progression,
          rankCount: context.config.powerFramework.ranks.length,
        },
        worldType: context.config.worldType,
        tags: context.rawTags?.length ?? 0,
      })
      return { status: 'succeeded' }
    },
  }
}

function buildRegionProfilesStep(): WorldInitStep {
  return {
    id: 'region-profiles',
    label: '区域概况与生命阶段',
    phase: 'transition',
    dependsOn: ['dimension-calibration'],
    order: 300,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
    run: async (context) => {
      syncPipelineRegions(context)
      syncContextPromptVars(context)
      const raw = await callWorldInitAIOnce(
        context,
        worldRegionProfilePrompt.systemPrompt,
        worldRegionProfilePrompt.userPromptTemplate,
        'world-init/pipeline:region-profiles',
        'geo',
        (response) => { parseWorldRegionProfileOutput(response) },
        undefined,
        worldRegionProfileOutputSchema,
      )
      commitRegionProfileOutput(context, raw)
      context.regionProfilesGenerated = true
      return { status: 'succeeded' }
    },
  }
}

export function createDefaultWorldInitSteps(): WorldInitStep[] {
  return [
    {
      id: 'prepare-world-init',
      label: '准备世界初始化',
      phase: 'prepare',
      dependsOn: [],
      order: 0,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async (context) => {
        if (!context.config.name.trim() || !context.config.description.trim()) {
          return { status: 'failed', message: '世界配置缺少名称或描述' }
        }
        if (!context.initFingerprint.trim()) {
          return { status: 'failed', message: '世界初始化缺少稳定指纹' }
        }
        return { status: 'succeeded' }
      },
    },
    {
      id: 'queue-world-init',
      label: '排队世界初始化',
      phase: 'ready',
      dependsOn: ['prepare-world-init'],
      order: 0,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async () => ({ status: 'succeeded', message: '世界初始化步骤已按依赖排队' }),
    },
    buildDimensionCalibrationStep(),
    buildRegionProfilesStep(),
    {
      id: 'finalize-world-init',
      label: '完成世界初始化',
      phase: 'finalize',
      dependsOn: ['region-profiles'],
      order: 400,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async (context) => context.calibrationGenerated
        && context.tagsGenerated
        && context.configGenerated
        && context.regionProfilesGenerated
        ? { status: 'succeeded' }
        : { status: 'failed', message: '世界初始化结束前置条件未满足' },
    },
  ]
}
