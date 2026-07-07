/**
 * @module post-narrative-processor.ts
 * @description 叙事后处理器 —— 仅保留非权威连锁反应提示
 * @mod mod-engine
 *
 * 来源：废案 world-event-bus.ts 的 applyChainReactions
 *
 * 功能：
 *   - AI 叙事 → 关键词匹配 → 自动数值修正（连锁反应）
 *   - 寿命突破与减寿已收回 LifespanSystem，本文件不得再写 lifespan 状态
 *
 * 规则配置已外部化至 game-rule-config-loader.ts + game-rules-config.default.json，
 * 支持不同世界/场景通过 mergeConfig() 覆盖规则。
 */

import { clampNumber, globalDeadLoopDetector, deepSanitize } from './system-safety'
import {
  gameRuleConfigLoader,
  type ChainReactionRule,
} from './game-rule-config-loader'

// ============================================================
// 类型导出
// ============================================================

export type { ChainReactionRule }

export interface ChainReactionResult {
  updatedHealth: number
  wealthChange: number
  reputationChange: number
  notificationTexts: string[],
}

export interface PostNarrativeOutput {
  chainResult: ChainReactionResult
  notificationText: string,
}

export interface PostNarrativeInput {
  narrative: string
  currentHealth: number
  currentWealth: number
  currentReputation: number
}

// ============================================================
// 连锁反应检测
// ============================================================

/** 扫描 AI 叙事文本中的关键词，自动触发数值变动 */
function applyChainReactions(
  narrative: string,
  currentHealth: number,
): ChainReactionResult {
  const config = gameRuleConfigLoader.getConfig()
  const rules = config.chainReactionRules
  const maxApply = config.constants.maxApplyPerRound
  const matchedRules: ChainReactionRule[] = []

  for (const rule of rules) {
    if (matchedRules.length >= maxApply) break
    const matched = rule.keywords.some((kw) => narrative.includes(kw))
    if (matched) {
      // 检查是否已被更高优先级的规则覆盖
      const alreadyCovered = matchedRules.some((r) =>
        r.keywords.some((kw) => rule.keywords.includes(kw)),
      )
      if (!alreadyCovered) {
        matchedRules.push(rule)
      }
    }
  }

  let totalHealth = 0
  let totalWealth = 0
  let totalReputation = 0
  const notificationTexts: string[] = []

  for (const rule of matchedRules) {
    totalHealth += rule.healthChange
    totalWealth += rule.wealthChange
    totalReputation += rule.reputationChange
    if (rule.healthChange !== 0 || rule.wealthChange !== 0 || rule.reputationChange !== 0) {
      notificationTexts.push(`【连锁反应】${rule.note}`)
    }
  }

  const updatedHealth = clampNumber(currentHealth + totalHealth, 0, 100)

  return { updatedHealth, wealthChange: totalWealth, reputationChange: totalReputation, notificationTexts }
}

// ============================================================
// 主入口
// ============================================================

/**
 * 执行叙事后处理（仅连锁反应）。
 *
 * 寿命突破/减寿的判定与落地属于 LifespanSystem 的闭环职责。
 * 编排层只可分发，不再从叙事文本二次推导 maxAge，避免同一业务规则双算。
 *
 * @param input 后处理输入参数
 * @returns 后处理结果
 */
export function runPostNarrativePhase(input: PostNarrativeInput): PostNarrativeOutput {
  // 连锁反应检测
  const chainCheck = globalDeadLoopDetector.checkAndIncrement('chain-reaction', 50)
  let chainResult: ChainReactionResult
  if (chainCheck.allowed) {
    chainResult = applyChainReactions(input.narrative, input.currentHealth)
    const chainSanitized = deepSanitize(chainResult, 'chain-reaction')
    if (!chainSanitized.report.passed) {
      // console.warn('[PostNarrative] 连锁反应安全校验未通过:', chainSanitized.report.errors)
    }
    chainResult = chainSanitized.result as unknown as ChainReactionResult
  } else {
    // console.warn('[PostNarrative]', chainCheck.reason)
    chainResult = { updatedHealth: input.currentHealth, wealthChange: 0, reputationChange: 0, notificationTexts: [] }
  }

  // 汇总通知
  const notificationParts: string[] = []
  if (chainResult.notificationTexts.length > 0) {
    notificationParts.push(...chainResult.notificationTexts)
  }

  return {
    chainResult,
    notificationText: notificationParts.join('\n'),
  }
}
