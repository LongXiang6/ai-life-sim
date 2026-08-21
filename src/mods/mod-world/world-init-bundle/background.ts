/**
 * Purpose: Launch one deduplicated background world-init pipeline without blocking the UI.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Launch locking only; AI pipeline work stays in generation.ts.
 */

import type { WorldConfig } from '../types'
import { resolvePipelineAnchorYear } from '../utils/world-init-anchor-year'
import { generateWorldInitBundle } from './generation'

const IN_PROGRESS_FILLS = new Set<string>()

function tryAcquireFillLock(key: string): boolean {
  if (IN_PROGRESS_FILLS.has(key)) {
    console.info(`[mod-world] 跳过重复调用: ${key} 已在填充中`)
    return false
  }
  IN_PROGRESS_FILLS.add(key)
  return true
}

function releaseFillLock(key: string): void {
  IN_PROGRESS_FILLS.delete(key)
}

export function startBackgroundWorldInit(
  config: WorldConfig,
  worldCode: number,
  startingYear?: number,
): void {
  const lockKey = `init:${worldCode}`
  if (!tryAcquireFillLock(lockKey)) return

  void generateWorldInitBundle(config, worldCode, startingYear).catch((error) => {
    console.warn('[mod-world] 后台世界 AI 初始化失败', error)
  }).finally(() => {
    releaseFillLock(lockKey)
  })
}

export function startBackgroundWorldInitForCustom(
  config: WorldConfig,
  worldCode: number,
): void {
  startBackgroundWorldInit(config, worldCode, resolvePipelineAnchorYear(config))
}
