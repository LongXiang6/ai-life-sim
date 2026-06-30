/**
 * @module world-init-fallback.ts
 * @description 世界初始化降级策略 —— 区分「无 API 离线兜底」与「AI 驱动通用模拟池」
 * @mod mod-world
 *
 * P2：硬编码世界观表仅在无 API Key 或 AI 尚未接管时使用；
 * 已走 AI 初始化或有实质世界描述时，运行时子系统用 default 通用池 + calibration modifier。
 */

import { useSettingsStore } from '@/mods/mod-settings'

import { useWorldStore } from '../store'

const TEMPLATE_DESCRIPTION_RE = /^.+世界观 · .+空间形态 · .+文明阶段$/

/** 是否已配置世界初始化 API Key */
export function isWorldInitAIAvailable(): boolean {
  try {
    return Boolean(useSettingsStore.getState().customKey)
  } catch {
    return false
  }
}

/** 仅无 API Key 时使用硬编码世界观实体集 / inferEssenceFromText 等 */
export function shouldUseStaticEntityFallback(): boolean {
  return !isWorldInitAIAvailable()
}

/**
 * 是否应使用通用 default 模拟池（而非 *_BY_WORLDVIEW 分层表）
 * 信号：AI 校准产物、AI 标签、用户自定义描述
 */
export function shouldUseGenericSimulationPools(): boolean {
  const store = useWorldStore.getState()
  const cal = store.calibration
  if (cal?.styleGuide?.worldviewStyleHint?.trim()) return true
  if (store.worldConfig?._aiFlags?.calibrationFromAI) return true
  if (store.worldConfig?._aiFlags?.aiDetailedParameters) return true
  if (store.worldTags.length > 0) return true

  const desc = store.worldConfig?.description?.trim() ?? ''
  if (desc.length >= 20 && !TEMPLATE_DESCRIPTION_RE.test(desc)) return true

  return false
}

/** 静态池 lookup 键：AI/自定义世界 → default，离线预设 → 原 worldview */
export function resolveStaticPoolWorldviewKey(worldview: string): string {
  if (shouldUseGenericSimulationPools()) return 'default'
  const key = worldview?.trim()
  return key || 'default'
}
