/**
 * Purpose: Own the in-memory registry for background world initialization jobs.
 * Owner: app:api
 * Responsibility: Create, index, bound, and retrieve job state; it does not execute the pipeline.
 */

import { randomUUID } from 'crypto'

export interface JobStep {
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface WorldInitJob {
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

const jobs = new Map<string, WorldInitJob>()
const worldCodeIndex = new Map<number, string>()
const MAX_JOBS = 30

export function createJob(worldCode: number): WorldInitJob {
  const jobId = randomUUID()
  if (jobs.size >= MAX_JOBS) {
    const oldest = [...jobs.entries()]
      .filter(([, job]) => job.status !== 'running')
      .sort(([, left], [, right]) => left.startedAt - right.startedAt)
    if (oldest.length > 0) {
      const [oldestJobId] = oldest[0]
      jobs.delete(oldestJobId)
      for (const [indexedWorldCode, indexedJobId] of worldCodeIndex) {
        if (indexedJobId === oldestJobId) worldCodeIndex.delete(indexedWorldCode)
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
  jobs.set(jobId, job)
  worldCodeIndex.set(worldCode, jobId)
  return job
}

export function getJobById(jobId: string): WorldInitJob | undefined {
  return jobs.get(jobId)
}

export function getLatestJobByWorldCode(worldCode: number): WorldInitJob | undefined {
  const jobId = worldCodeIndex.get(worldCode)
  return jobId ? jobs.get(jobId) : undefined
}
