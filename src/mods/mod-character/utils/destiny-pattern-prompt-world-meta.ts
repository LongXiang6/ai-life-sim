/**
 * @module destiny-pattern-prompt-world-meta.ts
 * @description 命格 Prompt 用世界元数据 —— 统一字段，不再区分世界观类型
 * @mod mod-character
 *
 * 设计原则：
 *   - 所有世界观使用相同的 modifier 字段集合
 *   - AI 根据 worldDescription 自主判断输出哪些 modifier
 *   - 仅保留个人向字段，世界向字段通过个人层面的连锁计算来影响
 */

import type { WorldConfig } from '@/mods/mod-world'
import { formatPowerFrameworkForPrompt } from '@/mods/mod-world'

import {
  DESTINY_PATTERN_PERSONAL_MODIFIERS,
} from '../constants'

export interface ResolvedDestinyPatternWorldMeta {
  powerSystemTag: string
  civilizationStage: string
  powerFramework?: string
  personalModifierFields: Record<string, string>
}

/**
 * 为命格 AI prompt 组装世界元数据
 *
 * 统一逻辑：不再判断 cultivation/modern，所有世界观注入相同的个人向字段
 * AI 根据 worldDescription 自行决定输出哪些 modifier
 */
export function resolveDestinyPatternPromptWorldMeta(
  config: WorldConfig | null | undefined,
): ResolvedDestinyPatternWorldMeta {
  // 优先级：AI/用户设定 > 默认值
  const powerSystemTag = config?.powerSystemTag ?? 'none'
  const civilizationStage = config?.civilizationStage ?? 'unknown'
  const powerFramework = formatPowerFrameworkForPrompt(config?.powerFramework)

  // 统一注入所有个人向字段，不再做世界观判断
  const personalModifierFields = { ...DESTINY_PATTERN_PERSONAL_MODIFIERS }

  return {
    powerSystemTag,
    civilizationStage,
    powerFramework,
    personalModifierFields,
  }
}
