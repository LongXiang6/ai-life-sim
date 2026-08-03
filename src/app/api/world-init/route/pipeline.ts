/**
 * Purpose: Execute the ordered calibration and tag stages for one world initialization job.
 * Owner: app:api
 * Responsibility: Run and record the two-stage pipeline; HTTP parsing and provider transport stay separate.
 */

import type { WorldConfig } from '@/mods/mod-world'
import {
  buildWorldInitPipelineBudgets,
  buildWorldInitPromptVars,
  fillPromptTemplate,
  filterCoherentWorldTags,
  parseWorldDimensionCalibrationResponse,
  parseWorldTagsResponse,
} from '@/mods/mod-world'

import { createJob } from './job-store'
import { callProviderDirect, type PipelineOptions } from './provider'

async function runCalibrationStep(
  config: Record<string, unknown>,
  options: PipelineOptions,
): Promise<{
  calibration?: Record<string, unknown>
  aiDetailedParameters?: Record<string, unknown>
  worldTags?: string[]
  error?: string
}> {
  try {
    const { worldDimensionCalibrationPrompt } = await import('@/mods/mod-world')
    const budgets = buildWorldInitPipelineBudgets((config.description as string)?.length || 100)
    const promptVars = buildWorldInitPromptVars(config as unknown as WorldConfig)
    const userPrompt = fillPromptTemplate(worldDimensionCalibrationPrompt.userPromptTemplate, promptVars)
    const raw = await callProviderDirect(
      worldDimensionCalibrationPrompt.systemPrompt,
      userPrompt,
      {
        maxTokens: budgets.dimensionCalibration,
        temperature: 0.3,
        jsonMode: true,
        ...options,
      },
    )
    const bundle = parseWorldDimensionCalibrationResponse(raw)
    if (!bundle) throw new Error('dimension-calibration 解析失败')
    return {
      calibration: bundle.calibration as unknown as Record<string, unknown>,
      aiDetailedParameters: bundle.aiDetailedParameters as unknown as Record<string, unknown> | undefined,
      worldTags: bundle.worldTags?.length ? bundle.worldTags : undefined,
    }
  } catch (error) {
    return { error: String(error) }
  }
}

async function runTagsStep(
  config: Record<string, unknown>,
  options: PipelineOptions,
): Promise<{ worldTags?: string[]; error?: string }> {
  try {
    const { worldTagsPrompt } = await import('@/mods/mod-world')
    const budgets = buildWorldInitPipelineBudgets((config.description as string)?.length || 100)
    const promptVars = buildWorldInitPromptVars(config as unknown as WorldConfig)
    const userPrompt = fillPromptTemplate(worldTagsPrompt.userPromptTemplate, promptVars)
    const raw = await callProviderDirect(worldTagsPrompt.systemPrompt, userPrompt, {
      maxTokens: budgets.tags,
      temperature: 0.6,
      jsonMode: true,
      ...options,
    })
    const tags = parseWorldTagsResponse(raw)
    if (!tags?.length) throw new Error('标签生成返回空结果')
    return {
      worldTags: filterCoherentWorldTags(tags, {
        worldDescription: (config.description as string) || '',
        worldType: (config.worldType as string) || 'idealist',
      }),
    }
  } catch (error) {
    return { error: String(error) }
  }
}

export async function runServerPipeline(
  config: Record<string, unknown>,
  worldCode: number,
  options: PipelineOptions,
): Promise<void> {
  const job = createJob(worldCode)
  const world = config as { name?: string }
  console.info(`[world-init/api] 开始后台初始化 jobId=${job.jobId} worldCode=${worldCode} "${world.name || ''}"`)

  job.steps.calibration.status = 'running'
  job.steps.calibration.startedAt = Date.now()
  const calibration = await runCalibrationStep(config, options)
  job.steps.calibration.completedAt = Date.now()

  if (calibration.error) {
    job.steps.calibration.status = 'failed'
    job.steps.calibration.error = calibration.error
    job.errors.push(`校准: ${calibration.error}`)
    job.status = 'failed'
    job.completedAt = Date.now()
    console.error(`[world-init/api] 校准失败 jobId=${job.jobId}: ${calibration.error}`)
    return
  }

  job.steps.calibration.status = 'done'
  job.calibration = calibration.calibration
  job.aiDetailedParameters = calibration.aiDetailedParameters

  if (calibration.worldTags?.length) {
    job.worldTags = calibration.worldTags
    job.steps.tags.status = 'done'
    job.steps.tags.startedAt = Date.now()
    job.steps.tags.completedAt = Date.now()
  } else {
    job.steps.tags.status = 'running'
    job.steps.tags.startedAt = Date.now()
    const tags = await runTagsStep(config, options)
    if (tags.error) {
      job.steps.tags.status = 'failed'
      job.steps.tags.error = tags.error
      job.errors.push(`标签: ${tags.error}`)
    }
    job.steps.tags.completedAt = Date.now()
    job.steps.tags.status = 'done'
    job.worldTags = tags.worldTags || job.worldTags
  }

  job.status = 'complete'
  job.completedAt = Date.now()
  console.info(`[world-init/api] 后台初始化完成 jobId=${job.jobId} worldCode=${worldCode}`)
}
