/**
 * Purpose: Declare the default world-init execution graph and its business step actions.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Step definitions and dependencies only; the shared runner owns retries and terminal publication.
 */

import { useWorldStore } from '../../store'
import {
  buildDefaultCalibration,
  saveCachedWorldCalibration,
  shouldSkipEntityAIGeneration,
  worldCalibrationPrompt,
  worldDimensionCalibrationPrompt,
  worldTagsPrompt,
} from '../../world-init-bundle-deps'
import { formatRegionsForPrompt } from '../world-init-prompt-vars'
import { calibrationEchoesDescription } from '../world-coherence-output-guard'
import {
  fromCalibrationBundleDiagnostics,
  fromDimensionCalibrationDiagnostics,
  getWorldTagsValidationDiagnostics,
} from '../world-init-ai-validation'
import { parseWorldTagsResponse } from '../world-init-kv'
import {
  getCalibrationBundleDiagnostics,
  validateWorldCalibrationBundleResponse,
} from '../world-calibration-parse'
import {
  getDimensionCalibrationDiagnostics,
  getDimensionCalibrationValidationError,
  parseWorldDimensionCalibrationResponse,
} from '../world-dimension-calibration-parse'
import { callWorldInitAIResilient } from './ai-service'
import {
  WORLD_INIT_FAILURE_TARGET,
  WORLD_INIT_OWNER,
  type WorldInitPipelineContext,
  type WorldInitStep,
} from './contracts'
import {
  applyCalibrationBundle,
  applyCalibrationParsed,
  applyDimensionInferenceToContext,
  commitWorldTags,
  finalizeAnchorYear,
  loadCalibrationFromCache,
  shouldRunDimensionInference,
  syncContextPromptVars,
  syncPipelineRegions,
} from './context-state'

async function runCalibrationFallback(context: WorldInitPipelineContext): Promise<void> {
  syncContextPromptVars(context)
  const raw = await callWorldInitAIResilient(
    context,
    worldCalibrationPrompt.systemPrompt,
    worldCalibrationPrompt.userPromptTemplate,
    context.budgets.calibration,
    'world-init/pipeline:calibration-fallback',
    'cal',
    (response) => {
      if (calibrationEchoesDescription(response, context.config.description.length)) {
        throw new Error('calibration 错误回写了 worldDescription 全文')
      }
      validateWorldCalibrationBundleResponse(response)
    },
    (response) => fromCalibrationBundleDiagnostics(getCalibrationBundleDiagnostics(response)),
    worldCalibrationPrompt.outputSchema,
  )
  applyCalibrationBundle(context, raw)
  syncContextPromptVars(context)
}

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
        if (!context.configGenerated) {
          console.info('[mod-world] 缓存无 W02 参数，补生成校准 fallback')
          await runCalibrationFallback(context)
        }
        finalizeAnchorYear(context)
        return { status: 'succeeded' }
      }

      syncContextPromptVars(context)
      const raw = await callWorldInitAIResilient(
        context,
        worldDimensionCalibrationPrompt.systemPrompt,
        worldDimensionCalibrationPrompt.userPromptTemplate,
        context.budgets.dimensionCalibration,
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
      if (needInference) applyDimensionInferenceToContext(context, bundle.dimensions)
      applyCalibrationParsed(context, bundle)
      if (!context.configGenerated) {
        console.info('[mod-world] 合并步未返回有效 W02，单独补 calibration-fallback')
        await runCalibrationFallback(context)
      }
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

function buildTagsFallbackStep(): WorldInitStep {
  return {
    id: 'tags-fallback',
    label: '标签生成',
    phase: 'execute',
    dependsOn: ['dimension-calibration'],
    order: 200,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
    optional: true,
    shouldSkip: (context) => context.tagsGenerated,
    run: async (context) => {
      const raw = await callWorldInitAIResilient(
        context,
        worldTagsPrompt.systemPrompt,
        worldTagsPrompt.userPromptTemplate,
        context.budgets.tags,
        'world-init/pipeline:tags-fallback',
        'tag',
        undefined,
        getWorldTagsValidationDiagnostics,
        worldTagsPrompt.outputSchema,
      )
      const filtered = commitWorldTags(context.config, parseWorldTagsResponse(raw))
      context.rawTags = filtered
      context.tagsGenerated = true
      syncContextPromptVars(context)
      const calibration = useWorldStore.getState().calibration
      if (calibration) {
        saveCachedWorldCalibration(context.worldCode, context.initFingerprint, calibration, filtered)
      }
      return { status: 'succeeded' }
    },
  }
}

function buildEntitiesStep(): WorldInitStep {
  return {
    id: 'entities',
    label: '实体生成',
    phase: 'transition',
    dependsOn: ['tags-fallback'],
    order: 300,
    owner: WORLD_INIT_OWNER,
    failureTarget: WORLD_INIT_FAILURE_TARGET,
    run: async (context) => {
      const store = useWorldStore.getState()
      const activeCalibration = store.calibration ?? buildDefaultCalibration(context.config)
      syncPipelineRegions(context)
      syncContextPromptVars(context)
      context.entitySystem.setWorldContext(
        context.config.name,
        context.config.description,
        context.config.civilizationStage,
        context.promptVars.coherenceHint,
        context.promptVars.coherenceNote,
        context.config.worldType ?? 'idealist',
        context.promptVars.worldTags,
        context.promptVars.calibrationSummary,
        context.promptVars.entityRanges,
        formatRegionsForPrompt(context.entitySystem.getRegions()),
      )
      if (shouldSkipEntityAIGeneration(activeCalibration)) {
        store.setEntities([])
        context.entitiesGenerated = true
        console.info('[mod-world] 实体层全禁用（calibration entities 0-0），跳过 AI 实体生成')
        return { status: 'succeeded' }
      }
      store.setEntities(await context.entitySystem.generateEntities(context.config))
      context.entitiesGenerated = true
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
    buildTagsFallbackStep(),
    buildEntitiesStep(),
    {
      id: 'finalize-world-init',
      label: '完成世界初始化',
      phase: 'finalize',
      dependsOn: ['entities'],
      order: 400,
      owner: WORLD_INIT_OWNER,
      failureTarget: WORLD_INIT_FAILURE_TARGET,
      run: async (context) => context.calibrationGenerated
        && context.tagsGenerated
        && context.configGenerated
        && context.entitiesGenerated
        ? { status: 'succeeded' }
        : { status: 'failed', message: '世界初始化结束前置条件未满足' },
    },
  ]
}
