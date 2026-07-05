/**
 * @module world-init-fallback.ts
 * @description 世界初始化降级策略 —— 「无 API 离线兜底」判定（依赖设置 store）
 * @mod mod-world
 *
 * P2：硬编码世界观表仅在无 API Key 或 AI 尚未接管时使用；
 * 已走 AI 初始化或有实质世界描述时，运行时子系统用 default 通用池 + calibration modifier。
 *
 * 注意：仅依赖「世界 store」的池选择器（shouldUseGenericSimulationPools /
 * resolveStaticPoolWorldviewKey）已拆到 world-pool-selectors.ts，以免纯计算模块
 * 因本文件的 mod-settings 依赖被拉起设置 UI / mod-engine barrel。
 */

import { useSettingsStore } from '@/mods/mod-settings'

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
