/**
 * @module world-pool-selectors.ts
 * @description 世界模拟池选择器 —— 仅依赖「世界 store」的纯运行时判定
 * @mod mod-world
 *
 * 这两个选择器只读 useWorldStore，不触碰设置或 UI 依赖，
 * 因此可被纯计算模块（calibration-clamp 等）安全使用。
 */

import { useWorldStore } from '../store'

const TEMPLATE_DESCRIPTION_RE = /^.+世界观 · .+空间形态 · .+文明阶段$/

/**
 * 是否应使用通用 default 模拟池（而非 *_BY_WORLDVIEW 分层表）
 * 信号：本地标签和用户自定义描述
 */
export function shouldUseGenericSimulationPools(): boolean {
  const store = useWorldStore.getState()
  const cal = store.calibration
  if (cal?.styleGuide?.worldviewStyleHint?.trim()) return true
  if (store.worldTags.length > 0) return true

  const desc = store.worldConfig?.description?.trim() ?? ''
  if (desc.length >= 20 && !TEMPLATE_DESCRIPTION_RE.test(desc)) return true

  return false
}

/** 静态池 lookup 键：AI/自定义世界 → default，结构化预设 → 原 worldview */
export function resolveStaticPoolWorldviewKey(worldview: string): string {
  if (shouldUseGenericSimulationPools()) return 'default'
  const key = worldview?.trim()
  return key || 'default'
}
