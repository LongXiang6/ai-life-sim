/**
 * Purpose: Expose the HTTP boundary for background world initialization jobs.
 * Owner: app:api
 * Responsibility: Validate requests, start the owned pipeline, and project job responses only.
 */

import { z } from 'zod'

import {
  getJobById,
  getLatestJobByWorldCode,
  type WorldInitJob,
} from './route/job-store'
import { runServerPipeline } from './route/pipeline'
import type { PipelineOptions } from './route/provider'

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
    runServerPipeline(config, worldCode, opts).catch((error) => {
      console.error(`[world-init/api] worldCode=${worldCode} 异常:`, error)
    })

    const newJob = getLatestJobByWorldCode(worldCode)
    return Response.json(
      { message: '已启动', jobId: newJob?.jobId, worldCode, status: 'running' },
      { status: 202 },
    )
  } catch (error) {
    return Response.json(
      { error: '请求处理失败', detail: String(error) },
      { status: 500 },
    )
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url)
    const worldCodeText = searchParams.get('worldCode')
    const jobId = searchParams.get('jobId')
    let job: WorldInitJob | undefined

    if (jobId) {
      job = getJobById(jobId)
    } else if (worldCodeText) {
      const worldCode = Number.parseInt(worldCodeText, 10)
      if (Number.isNaN(worldCode)) {
        return Response.json({ error: 'worldCode 必须是数字' }, { status: 400 })
      }
      job = getLatestJobByWorldCode(worldCode)
    } else {
      return Response.json({ error: '缺少 worldCode 或 jobId 参数' }, { status: 400 })
    }

    if (!job) {
      return Response.json(
        { status: 'not_found', worldCode: worldCodeText ? Number.parseInt(worldCodeText, 10) : undefined },
        { status: 200 },
      )
    }

    return Response.json(job, { status: 200 })
  } catch (error) {
    return Response.json(
      { error: '查询失败', detail: String(error) },
      { status: 500 },
    )
  }
}
