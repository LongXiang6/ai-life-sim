/**
 * @module world-init/route.ts
 * @description 世界初始化后台服务 —— 服务端跑校准+标签（heaviest 2 步），不可被客户端切页面中断
 *
 * POST /api/world-init  启动后台初始化（fire-and-forget）
 * GET  /api/world-init?worldCode=X  查询进度和结果
 *
 * 设计要点：
 *   - 每个任务有唯一 UUID（jobId），避免多用户 worldCode 碰撞
 *   - worldCode 仍可用于查询（查找该编码的最新任务）
 *   - 服务端直连 DeepSeek，绕过 /api/proxy，不依赖客户端信号
 *   - 内存存储 _JOBS Map（适合 VPS/容器部署；serverless 需换成外部存储）
 *
 * 双通道策略（费用模型）：
 *   通道 1（服务端）：校准 + 标签   ← 2 次 AI，不被切页面中断
 *   通道 2（客户端）：全 5 步         ← 5 次 AI，但检测缓存命中后跳过 step 1-2，实际 3 次
 *   总计：服务端 2 + 客户端 3 = 5 次（和改造前一样，不增加费用）
 *
 *   为什么不全放服务端？
 *   - 时间线/实体需要 WorldTimelineSystem / WorldEntitySystem 的校验逻辑
 *   - 这两个系统依赖 Zustand store（客户端专用），无法在 API route 里直接跑
 *   - 服务端只做 AI 调用+解析，客户端做完整的 system 级处理
 *
 * 多用户并发安全性：
 *   - 不同 worldCode → 独立 job，互不影响
 *   - 同一个 worldCode 的重复请求 → 返回 200 "已在进行中"（幂等）
 */

import { randomUUID } from 'crypto'
import { z } from 'zod'
import type { WorldConfig } from '@/mods/mod-world'
import {
  buildWorldInitPromptVars,
  buildWorldInitPipelineBudgets,
  parseWorldDimensionCalibrationResponse,
  parseWorldTagsResponse,
  filterCoherentWorldTags,
  fillPromptTemplate,
} from '@/mods/mod-world'

// ============================================================
// 类型
// ============================================================

type JobStep = {
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  startedAt?: number
  completedAt?: number
  error?: string
}

type WorldInitJob = {
  jobId: string
  worldCode: number
  status: 'running' | 'complete' | 'failed'
  startedAt: number
  completedAt?: number

  steps: {
    calibration: JobStep
    tags: JobStep
  }

  calibration?: Record<string, unknown>
  aiDetailedParameters?: Record<string, unknown>
  worldTags?: string[]

  errors: string[]
}

// ============================================================
// Pipeline 选项（由客户端传入）
// ============================================================

type PipelineOptions = {
  apiKey?: string
  baseUrl?: string
  model?: string
}

// ============================================================
// 全局任务表
// ============================================================

const _JOBS = new Map<string, WorldInitJob>()
const _WORLDCODE_INDEX = new Map<number, string>()
const MAX_JOBS = 30

function createJob(worldCode: number): WorldInitJob {
  const jobId = randomUUID()
  if (_JOBS.size >= MAX_JOBS) {
    const oldest = [..._JOBS.entries()]
      .filter(([, v]) => v.status !== 'running')
      .sort(([, a], [, b]) => (a.startedAt || 0) - (b.startedAt || 0))
    if (oldest.length > 0) {
      _JOBS.delete(oldest[0][0])
      for (const [wc, jid] of _WORLDCODE_INDEX) {
        if (jid === oldest[0][0]) _WORLDCODE_INDEX.delete(wc)
      }
    }
  }
  const job: WorldInitJob = {
    jobId,
    worldCode,
    status: 'running',
    startedAt: Date.now(),
    steps: {
      calibration: { label: '维度推断与校准', status: 'pending' },
      tags: { label: '标签生成', status: 'pending' },
    },
    errors: [],
  }
  _JOBS.set(jobId, job)
  _WORLDCODE_INDEX.set(worldCode, jobId)
  return job
}

function getJobById(jobId: string): WorldInitJob | undefined {
  return _JOBS.get(jobId)
}

function getLatestJobByWorldCode(worldCode: number): WorldInitJob | undefined {
  const jobId = _WORLDCODE_INDEX.get(worldCode)
  if (!jobId) return undefined
  return _JOBS.get(jobId)
}

// ============================================================
// 服务端 Provider 直连
// ============================================================

const AI_TIMEOUT_MS = 120_000

async function callProviderDirect(
  systemPrompt: string,
  userPrompt: string,
  opts: {
    maxTokens?: number
    temperature?: number
    jsonMode?: boolean
    model?: string
    apiKey?: string
    baseUrl?: string
  },
): Promise<string> {
  const apiKey = opts.apiKey?.trim() || ''
  const baseUrl = opts.baseUrl?.trim().replace(/\/+$/u, '') || ''
  const model = opts.model?.trim() || ''
  if (!apiKey || !baseUrl || !model) throw new Error('玩家 API Key、接口或模型未完整配置')

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: opts.maxTokens || 4096,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  }

  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`玩家 API ${response.status}: ${errorText.slice(0, 500)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content || content.trim() === '') throw new Error(`${model} 返回空内容`)
  return content
}

// ============================================================
// 步 1：维度推断 + 校准
// ============================================================

async function runCalibrationStep(
  config: Record<string, unknown>,
  opts: PipelineOptions,
): Promise<{
  calibration?: Record<string, unknown>
  aiDetailedParameters?: Record<string, unknown>
  worldTags?: string[]
  error?: string
}> {
  try {
    const { worldDimensionCalibrationPrompt } = await import(
      '@/mods/mod-world'
    )
    const budgets = buildWorldInitPipelineBudgets(
      (config.description as string)?.length || 100,
    )

    const worldConfig = config as unknown as WorldConfig
    const promptVars = buildWorldInitPromptVars(worldConfig)
    const userPrompt = fillPromptTemplate(
      worldDimensionCalibrationPrompt.userPromptTemplate,
      promptVars,
    )

    const raw = await callProviderDirect(
      worldDimensionCalibrationPrompt.systemPrompt,
      userPrompt,
      { maxTokens: budgets.dimensionCalibration, temperature: 0.3, jsonMode: true, apiKey: opts.apiKey, baseUrl: opts.baseUrl, model: opts.model },
    )

    const bundle = parseWorldDimensionCalibrationResponse(raw)
    if (!bundle) throw new Error('dimension-calibration 解析失败')

    return {
      calibration: bundle.calibration as unknown as Record<string, unknown>,
      aiDetailedParameters: bundle.aiDetailedParameters as unknown as Record<string, unknown> | undefined,
      worldTags: bundle.worldTags?.length ? bundle.worldTags : undefined,
    }
  } catch (err) {
    return { error: String(err) }
  }
}

// ============================================================
// 步 2：标签生成（仅在校准步未返回标签时执行）
// ============================================================

async function runTagsStep(
  config: Record<string, unknown>,
  opts: PipelineOptions,
): Promise<{ worldTags?: string[]; error?: string }> {
  try {
    const { worldTagsPrompt } = await import(
      '@/mods/mod-world'
    )
    const budgets = buildWorldInitPipelineBudgets(
      (config.description as string)?.length || 100,
    )

    const worldConfig = config as unknown as WorldConfig
    const promptVars = buildWorldInitPromptVars(worldConfig)
    const userPrompt = fillPromptTemplate(
      worldTagsPrompt.userPromptTemplate,
      promptVars,
    )

    const raw = await callProviderDirect(
      worldTagsPrompt.systemPrompt,
      userPrompt,
      { maxTokens: budgets.tags, temperature: 0.6, jsonMode: true, apiKey: opts.apiKey, baseUrl: opts.baseUrl, model: opts.model },
    )

    const tags = parseWorldTagsResponse(raw)
    if (!tags?.length) throw new Error('标签生成返回空结果')

    const filtered = filterCoherentWorldTags(tags, {
      worldDescription: (config.description as string) || '',
      worldType: (config.worldType as string) || 'idealist',
    })

    return { worldTags: filtered }
  } catch (err) {
    return { error: String(err) }
  }
}

// ============================================================
// 服务端 Pipeline（2 步：校准 → 标签）
// ============================================================

async function runServerPipeline(
  configData: Record<string, unknown>,
  worldCode: number,
  opts: PipelineOptions,
): Promise<void> {
  const job = createJob(worldCode)
  const cfg = configData as { description?: string; worldType?: string; name?: string }
  const config = configData

  console.info(`[world-init/api] 开始后台初始化 jobId=${job.jobId} worldCode=${worldCode} "${cfg.name || ''}"`)

  // ── 步 1：维度推断 + 校准 ──
  job.steps.calibration.status = 'running'
  job.steps.calibration.startedAt = Date.now()

  const calResult = await runCalibrationStep(config, opts)

  if (calResult.error) {
    job.steps.calibration.status = 'failed'
    job.steps.calibration.error = calResult.error
    job.steps.calibration.completedAt = Date.now()
    job.errors.push(`校准: ${calResult.error}`)
    job.status = 'failed'
    job.completedAt = Date.now()
    console.error(`[world-init/api] 校准失败 jobId=${job.jobId}: ${calResult.error}`)
    return
  }

  job.steps.calibration.status = 'done'
  job.steps.calibration.completedAt = Date.now()
  job.calibration = calResult.calibration
  job.aiDetailedParameters = calResult.aiDetailedParameters

  // ── 步 2：标签（校准步返回标签则跳过） ──
  if (calResult.worldTags?.length) {
    job.worldTags = calResult.worldTags
    job.steps.tags.status = 'done'
    job.steps.tags.startedAt = Date.now()
    job.steps.tags.completedAt = Date.now()
  } else {
    job.steps.tags.status = 'running'
    job.steps.tags.startedAt = Date.now()

    const tagsResult = await runTagsStep(config, opts)

    if (tagsResult.error) {
      job.steps.tags.status = 'failed'
      job.steps.tags.error = tagsResult.error
      job.errors.push(`标签: ${tagsResult.error}`)
    }
    job.steps.tags.completedAt = Date.now()
    job.steps.tags.status = 'done'
    job.worldTags = tagsResult.worldTags || job.worldTags
  }

  job.status = 'complete'
  job.completedAt = Date.now()
  console.info(`[world-init/api] 后台初始化完成 jobId=${job.jobId} worldCode=${worldCode}`)
}

// ============================================================
// API Route Handler
// ============================================================

const PostBodySchema = z.object({
  worldCode: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const parsed = PostBodySchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: '参数校验失败', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { worldCode, config, apiKey, baseUrl, model } = parsed.data

    const existing = getLatestJobByWorldCode(worldCode)
    if (existing?.status === 'running') {
      return Response.json(
        { message: '已在进行中', jobId: existing.jobId, worldCode, status: 'running' },
        { status: 200 },
      )
    }

    const opts: PipelineOptions = { apiKey, baseUrl, model }

    runServerPipeline(config, worldCode, opts).catch((err) => {
      console.error(`[world-init/api] worldCode=${worldCode} 异常:`, err)
    })

    const newJob = getLatestJobByWorldCode(worldCode)

    return Response.json(
      { message: '已启动', jobId: newJob?.jobId, worldCode, status: 'running' },
      { status: 202 },
    )
  } catch (err) {
    return Response.json(
      { error: '请求处理失败', detail: String(err) },
      { status: 500 },
    )
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url)
    const worldCodeStr = searchParams.get('worldCode')
    const jobId = searchParams.get('jobId')

    let job: WorldInitJob | undefined

    if (jobId) {
      job = getJobById(jobId)
    } else if (worldCodeStr) {
      const worldCode = parseInt(worldCodeStr, 10)
      if (isNaN(worldCode)) {
        return Response.json({ error: 'worldCode 必须是数字' }, { status: 400 })
      }
      job = getLatestJobByWorldCode(worldCode)
    } else {
      return Response.json({ error: '缺少 worldCode 或 jobId 参数' }, { status: 400 })
    }

    if (!job) {
      return Response.json(
        { status: 'not_found', worldCode: worldCodeStr ? parseInt(worldCodeStr, 10) : undefined },
        { status: 200 },
      )
    }

    return Response.json({
      jobId: job.jobId,
      worldCode: job.worldCode,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      steps: job.steps,
      calibration: job.calibration,
      aiDetailedParameters: job.aiDetailedParameters,
      worldTags: job.worldTags,
      errors: job.errors,
    }, { status: 200 })
  } catch (err) {
    return Response.json(
      { error: '查询失败', detail: String(err) },
      { status: 500 },
    )
  }
}
