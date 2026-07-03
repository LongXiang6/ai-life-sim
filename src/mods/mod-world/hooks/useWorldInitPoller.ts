/**
 * @module useWorldInitPoller.ts
 * @description 轮询服务端世界初始化 API（校准+标签），将结果同步到 Zustand store
 * @mod mod-world
 *
 * 用途：
 *   startBackgroundWorldInit 同时启动服务端管道（POST /api/world-init，跑校准+标签）
 *   和客户端管道（generateWorldInitBundle，跑全 5 步）。
 *
 *   服务端管道直连 DeepSeek 完成校准+标签，不受客户端切页面中断。
 *   本 hook 在 fate-preview 页轮询服务端结果，写入 Zustand store。
 *   客户端管道的校准/标签步检测到 store 缓存命中后跳过，避免重复 AI 调用。
 *
 * 用法：
 *   useWorldInitPoller(worldCode)
 *   // 自动轮询，结果写入 useWorldStore
 */

'use client'

import { useEffect, useRef } from 'react'
import { useWorldStore } from '../store'
import { clampCalibration } from '../utils/calibration-clamp'
import type { WorldConfig } from '../types'

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 2000

/** 服务端单步状态 */
interface ServerStep {
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  startedAt?: number
  completedAt?: number
  error?: string
}

/** 服务端返回的 Job 数据（仅校准+标签 2 步） */
interface ServerJob {
  jobId: string
  worldCode: number
  status: 'running' | 'complete' | 'failed' | 'not_found'
  startedAt: number
  completedAt?: number
  steps: {
    calibration: ServerStep
    tags: ServerStep
  }
  calibration?: Record<string, unknown>
  aiDetailedParameters?: Record<string, unknown>
  worldTags?: string[]
  errors: string[]
}

/**
 * 轮询服务端世界初始化 API，将结果同步到 Zustand store。
 * 在 fate-preview 等需要世界初始化结果的页面中使用。
 */
export function useWorldInitPoller(worldCode: number): void {
  const store = useWorldStore
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const calSyncedRef = useRef(false)
  const tagsSyncedRef = useRef(false)

  useEffect(() => {
    if (!worldCode) return

    const poll = async () => {
      try {
        const resp = await fetch(`/api/world-init?worldCode=${worldCode}`)
        if (!resp.ok) return

        const job: ServerJob = await resp.json()

        if (job.status === 'not_found') {
          return // 服务端还没有任务，可能还没启动
        }

        // ── 同步校准数据 ──
        if (job.calibration && !calSyncedRef.current) {
          const state = store.getState()
          const worldConfig = state.worldConfig
          if (worldConfig) {
            const clamped = clampCalibration(
              job.calibration as Parameters<typeof clampCalibration>[0],
              worldConfig,
            )
            state.setCalibration(clamped)

            if (job.aiDetailedParameters) {
              state.setWorldConfig({
                ...worldConfig,
                aiDetailedParameters: job.aiDetailedParameters as WorldConfig['aiDetailedParameters'],
                _aiFlags: {
                  ...worldConfig._aiFlags,
                  aiDetailedParameters: true,
                  calibrationFromAI: true,
                },
              })
            } else {
              state.setWorldConfig({
                ...worldConfig,
                _aiFlags: {
                  ...worldConfig._aiFlags,
                  calibrationFromAI: true,
                },
              })
            }
            calSyncedRef.current = true
          }
        }

        // ── 同步标签 ──
        if (job.worldTags?.length && !tagsSyncedRef.current) {
          const state = store.getState()
          if (state.worldTags.length === 0) {
            state.setWorldTags(job.worldTags)
          }
          tagsSyncedRef.current = true
        }

        // ── 更新 worldInitAIStatus（补充校准/标签步骤状态） ──
        const state = store.getState()
        const currentStatus = state.worldInitAIStatus

        // 客户端已完成全 5 步 → 不再覆盖
        if (currentStatus?.status === 'complete') return

        // 只在客户端空闲/运行中时补充服务端状态
        if (
          !currentStatus ||
          currentStatus.status === 'idle' ||
          currentStatus.status === 'running'
        ) {
          const calDone = job.steps.calibration.status === 'done'
          const tagsDone = job.steps.tags.status === 'done'

          // 保留客户端已有的 stepTimers（时间线/上古史/实体的计时器）
          const stepTimers: Record<string, { start: number; end?: number }> = {
            ...currentStatus?.stepTimers,
          }

          // 补充服务端校准/标签的计时器
          if (job.steps.calibration.startedAt && job.steps.calibration.completedAt) {
            stepTimers['校准'] = {
              start: job.steps.calibration.startedAt,
              end: job.steps.calibration.completedAt,
            }
          }
          if (job.steps.tags.startedAt && job.steps.tags.completedAt) {
            stepTimers['标签'] = {
              start: job.steps.tags.startedAt,
              end: job.steps.tags.completedAt,
            }
          }

          // 服务端失败不标记整体失败（客户端管道可能还在跑且会成功）
          const serverFailed = job.status === 'failed'
          const currentStep = serverFailed
            ? '服务端校准失败，客户端管道继续中...'
            : calDone && tagsDone
              ? '服务端校准+标签完成'
              : calDone
                ? '服务端校准完成'
                : '服务端校准中...'

          state.setWorldInitAIStatus({
            status: 'running',
            currentStep,
            calibrationGenerated: calDone || currentStatus?.calibrationGenerated || false,
            tagsGenerated: tagsDone || currentStatus?.tagsGenerated || false,
            configGenerated: currentStatus?.configGenerated || false,
            // 以下三步由客户端管道负责，保留已有值
            timelineGenerated: currentStatus?.timelineGenerated || false,
            pastHistoryGenerated: currentStatus?.pastHistoryGenerated || false,
            entitiesGenerated: currentStatus?.entitiesGenerated || false,
            retryCount: currentStatus?.retryCount ?? 0,
            maxRetries: currentStatus?.maxRetries ?? 3,
            errors: serverFailed
              ? [...(currentStatus?.errors || []), `[服务端] ${job.errors.join('; ')}`]
              : currentStatus?.errors || [],
            stepTimers,
          })
        }
      } catch (_err) {
        // 轮询失败静默处理（网络临时中断等）
      }
    }

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setInterval>
    poll() // 立即执行一次

    return () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current as ReturnType<typeof setInterval>)
        pollTimerRef.current = null
      }
    }
  }, [worldCode, store])
}
