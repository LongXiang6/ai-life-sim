/**
 * @module world-init-calibration-cache.ts
 * @description 世界校准缓存 —— 同 worldCode + 描述指纹命中则跳过重复 AI 校准
 * @mod mod-world
 */

import { saveStore } from '@/core'

import type { WorldAIDetailedParameters } from '../prompts/world-config-prompt'
import type { WorldCalibration, WorldConfig } from '../types'

const CACHE_MOD = 'mod-world'

interface CalibrationCacheEntry {
  fingerprint: string
  calibration: WorldCalibration
  aiDetailedParameters: WorldAIDetailedParameters
  tags: string[]
  cachedAt: number
}

export interface CachedWorldInitBundle {
  calibration: WorldCalibration
  aiDetailedParameters: WorldAIDetailedParameters
  tags: string[]
}

/** 世界描述 + 关键标签指纹（用于缓存键） */
export function buildWorldInitFingerprint(config: WorldConfig, description: string): string {
  return [
    config.name,
    description.trim(),
    config.essenceTag,
    config.civilizationStage,
    config.powerSystemTag,
    config.spatialForm,
  ].join('|')
}

export function loadCachedWorldCalibration(
  worldCode: number,
  fingerprint: string,
): WorldCalibration | null {
  return loadCachedWorldInitBundle(worldCode, fingerprint)?.calibration ?? null
}

export function loadCachedWorldInitBundle(
  worldCode: number,
  fingerprint: string,
): CachedWorldInitBundle | null {
  if (!worldCode) return null
  const entry = saveStore.get<CalibrationCacheEntry>(CACHE_MOD, 0, `init-cal:${worldCode}`)
  if (
    !entry
    || entry.fingerprint !== fingerprint
    || !entry.aiDetailedParameters
    || !Array.isArray(entry.tags)
    || entry.tags.length === 0
  ) return null
  return {
    calibration: entry.calibration,
    aiDetailedParameters: entry.aiDetailedParameters,
    tags: entry.tags,
  }
}

export function saveCachedWorldCalibration(
  worldCode: number,
  fingerprint: string,
  calibration: WorldCalibration,
  aiDetailedParameters: WorldAIDetailedParameters,
  tags: string[],
): void {
  if (!worldCode) return
  saveStore.set<CalibrationCacheEntry>(CACHE_MOD, 0, `init-cal:${worldCode}`, {
    fingerprint,
    calibration,
    aiDetailedParameters,
    tags,
    cachedAt: Date.now(),
  })
}

/** 检测世界配置指纹是否已变化（与上次缓存的指纹比对），无缓存返回 false */
export function isInitFingerprintChanged(worldCode: number, fingerprint: string): boolean {
  if (!worldCode) return false
  const entry = saveStore.get<CalibrationCacheEntry>(CACHE_MOD, 0, `init-cal:${worldCode}`)
  if (!entry) return false
  return entry.fingerprint !== fingerprint
}
