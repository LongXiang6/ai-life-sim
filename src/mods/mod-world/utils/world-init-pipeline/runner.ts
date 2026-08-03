/**
 * Purpose: Run the declared world-init execution graph and publish its single terminal result.
 * Owner: mod-world / world-init pipeline.
 * Responsibility: Execution sequencing, status projection, and final orchestrator injection.
 */

import { EXECUTION_FLOWS, recordExecutionSequenceResult } from '@/core'
import { createExecutionOutcomeCodes, runExecutionSequence } from '@/foundation'

import { useWorldStore } from '../../store'
import type { WorldConfig, WorldInitAIStatus } from '../../types'
import { buildDefaultCalibration, formatCalibrationSummary } from '../../world-init-bundle-deps'
import { withRetry } from './ai-service'
import {
  MAX_AI_RETRIES,
  type WorldInitPipelineContext,
  type WorldInitPipelineResult,
  type WorldInitStep,
} from './contracts'
import { createDefaultWorldInitSteps } from './steps'

function updatePipelineStatus(
  context: WorldInitPipelineContext,
  baseStatus: WorldInitAIStatus,
  stepTimers: Record<string, { start: number; end?: number }>,
  status: WorldInitAIStatus['status'] = baseStatus.status,
): void {
  useWorldStore.getState().setWorldInitAIStatus({
    ...baseStatus,
    status,
    currentStep: context.currentStep,
    stepTimers: { ...stepTimers },
    calibrationGenerated: context.calibrationGenerated,
    tagsGenerated: context.tagsGenerated,
    configGenerated: context.configGenerated,
    entitiesGenerated: context.entitiesGenerated,
    retryCount: context.calibrationGenerated
      && context.tagsGenerated
      && context.configGenerated
      && context.entitiesGenerated ? 0 : 1,
    errors: context.errors,
  })
}

export async function runWorldInitPipeline(
  context: WorldInitPipelineContext,
  steps: WorldInitStep[] = createDefaultWorldInitSteps(),
): Promise<WorldInitPipelineResult> {
  const flow = EXECUTION_FLOWS.worldInit
  const baseStatus: WorldInitAIStatus = {
    status: 'running',
    calibrationGenerated: false,
    tagsGenerated: false,
    configGenerated: false,
    entitiesGenerated: false,
    retryCount: 0,
    maxRetries: MAX_AI_RETRIES,
    errors: [],
    stepTimers: {},
  }
  const stepTimers: Record<string, { start: number; end?: number }> = {}
  useWorldStore.getState().setWorldInitAIStatus(baseStatus)
  console.info(`[mod-world] Pipeline 开始: 世界 "${context.config.name}"（编码 ${context.worldCode}，${steps.length} 步）`)

  const labels = new Map(steps.map((step) => [step.id, step.label]))
  const nodes = steps.map((step) => ({
    id: step.id,
    owner: step.owner,
    failureTarget: step.failureTarget,
    phase: step.phase,
    dependsOn: step.dependsOn,
    order: step.order,
    optional: step.optional,
    timeoutMs: step.timeoutMs,
    shouldSkip: step.shouldSkip,
    outcomes: createExecutionOutcomeCodes(flow.flowId, step.id),
    run: async (pipelineContext: WorldInitPipelineContext) => {
      const signal = await withRetry(step.label, async () => {
        const result = await step.run(pipelineContext)
        if (result === undefined) throw new Error(`步骤 "${step.id}" 返回但未提供状态码`)
        return result
      }, pipelineContext.errors)
      return signal ?? {
        status: 'failed' as const,
        message: pipelineContext.errors.at(-1) ?? `${step.label} 执行失败`,
      }
    },
  }))

  const sequenceResult = await runExecutionSequence({
    flow,
    executionId: `${flow.flowId}:${context.worldCode}:${context.initFingerprint}:${Date.now()}`,
    context,
    nodes,
    onEvent: (event) => {
      const label = labels.get(event.nodeId) ?? event.nodeId
      context.currentStep = label
      if (event.status === 'running') {
        stepTimers[label] = { start: Date.now() }
        updatePipelineStatus(context, baseStatus, stepTimers, 'running')
        return
      }
      if (
        event.status === 'succeeded'
        || event.status === 'skipped'
        || event.status === 'failed'
        || event.status === 'blocked'
        || event.status === 'cancelled'
        || event.status === 'timed-out'
        || event.status === 'missing-status'
        || event.status === 'invalid-status'
        || event.status === 'duplicate-status'
      ) {
        stepTimers[label] = {
          ...(stepTimers[label] ?? { start: event.at }),
          end: event.at,
        }
        const failed = event.status !== 'succeeded' && event.status !== 'skipped'
        if (failed && event.message && !context.errors.includes(event.message)) {
          context.errors.push(event.message)
        }
        updatePipelineStatus(context, baseStatus, stepTimers, failed ? 'failed' : 'running')
      }
    },
  })
  recordExecutionSequenceResult(sequenceResult)

  const allOk = sequenceResult.status === 'succeeded'
    && context.calibrationGenerated
    && context.tagsGenerated
    && context.configGenerated
    && context.entitiesGenerated
  if (!allOk && sequenceResult.failure) {
    const message = `${sequenceResult.failure.code}: ${sequenceResult.failure.message}`
    if (!context.errors.includes(message)) context.errors.push(message)
  }
  useWorldStore.getState().setWorldInitAIStatus({
    status: allOk ? 'complete' : 'failed',
    currentStep: allOk ? '完成' : context.currentStep,
    stepTimers: { ...stepTimers },
    calibrationGenerated: context.calibrationGenerated,
    tagsGenerated: context.tagsGenerated,
    configGenerated: context.configGenerated,
    entitiesGenerated: context.entitiesGenerated,
    retryCount: MAX_AI_RETRIES,
    maxRetries: MAX_AI_RETRIES,
    errors: context.errors,
  })

  return {
    calibrationGenerated: context.calibrationGenerated,
    tagsGenerated: context.tagsGenerated,
    configGenerated: context.configGenerated,
    entitiesGenerated: context.entitiesGenerated,
    errors: context.errors,
    rawTags: context.rawTags,
  }
}

export async function injectWorldInitOrchestratorContext(
  config: WorldConfig,
  rawTags?: string[],
): Promise<void> {
  try {
    const { buildOrchestratorWorldSetting, orchestrator } = await import('@/mods/mod-engine/engine-api')
    const { useCharacterStore } = await import('@/mods/mod-character')
    const { WorldInitSystem } = await import('../../subsystems/world-init-system')
    const { formatWorldTagsText } = await import('../../constants/world-tag-defaults')
    const store = useWorldStore.getState()
    const calibration = store.calibration
    const calibrationSummary = formatCalibrationSummary(calibration ?? buildDefaultCalibration(config))
    const snapshot = new WorldInitSystem().initialize(config, {
      contextId: store.currentContextId ?? undefined,
      worldCode: store.worldCode,
      calibration,
    })
    const formattedTags = formatWorldTagsText(snapshot.tags)
    orchestrator.setContext(
      buildOrchestratorWorldSetting(config, {
        extraConfig: {
          ...(config as unknown as Record<string, unknown>),
          _worldTagsText: formattedTags,
          _calibration: calibration,
          _calibrationSummary: calibrationSummary,
          _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
          ...(store.worldConfig?.aiDetailedParameters
            ? { _aiDetailedParameters: store.worldConfig.aiDetailedParameters }
            : {}),
        },
      }),
      {
        characterId: useCharacterStore.getState().ensureCharacterId(),
        name: '',
        age: 0,
        gender: '未设定',
        background: '',
        attributes: {},
      },
    )
    if (rawTags && rawTags.length > 0) {
      console.info(`[mod-world] AI 氛围标签 ${rawTags.length} 条已写入 store（orchestrator 使用结构化标签）`)
    }
    console.info('[mod-world] 世界校准已注入 orchestrator')
  } catch (error) {
    console.warn('[mod-world] 注入 orchestrator 失败:', error)
  }
}
