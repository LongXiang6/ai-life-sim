/**
 * @module post-narrative-processor.ts
 * @description 叙事后处理器 —— 连锁反应检测 + 寿命突破检测 + 寿命损失检测
 * @mod mod-engine
 *
 * 来源：废案 world-event-bus.ts 的 applyChainReactions / checkBreakthrough / detectLifespanLoss
 *
 * 功能：
 *   - AI 叙事 → 关键词匹配 → 自动数值修正（连锁反应）
 *   - 寿命将尽时多因素突破判定
 *   - 叙事中寿命损失关键词检测
 *
 * 规则配置已外部化至 game-rule-config-loader.ts + game-rules-config.default.json，
 * 支持不同世界/场景通过 mergeConfig() 覆盖规则。
 */

import { clampNumber, globalDeadLoopDetector, deepSanitize } from './system-safety'
import {
  gameRuleConfigLoader,
  type ChainReactionRule,
  type BreakthroughCondition,
  type LifespanLossEvent,
} from './game-rule-config-loader'

// ============================================================
// 类型导出
// ============================================================

export type { ChainReactionRule, BreakthroughCondition, LifespanLossEvent }

export interface ChainReactionResult {
  updatedHealth: number
  wealthChange: number
  reputationChange: number
  notificationTexts: string[],
}

export interface LifespanBreakthroughResult {
  triggered: boolean
  condition: BreakthroughCondition | null
  yearsGained: number
  hintText: string
  totalBreakthroughs: number,
}

export interface LifespanLossResult {
  keyword: string
  yearsLost: number
  note: string
  lossText: string,
}

export interface PostNarrativeOutput {
  chainResult: ChainReactionResult
  breakthroughResult: LifespanBreakthroughResult
  lossResult: LifespanLossResult | null
  newMaxAge: number | null
  notificationText: string,
}

export interface PostNarrativeInput {
  narrative: string
  currentHealth: number
  currentWealth: number
  currentReputation: number
  currentAge: number
  maxAge: number
  luckBonus: number
  totalBreakthroughs: number
  devotionLevel?: number
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
// 寿命突破检测
// ============================================================

/** 检测是否触发寿命突破 */
function checkBreakthrough(
  currentAge: number,
  maxAge: number,
  luckBonus: number,
  currentWealth: number,
  currentReputation: number,
  totalBreakthroughs: number,
  devotionLevel: number,
): LifespanBreakthroughResult {
  const constants = gameRuleConfigLoader.getConstants()
  const triggerThreshold = constants.breakthroughTriggerThreshold

  // 只有接近寿命极限时才检测（当前年龄 >= 配置的寿命上限比例）
  if (maxAge <= 0 || currentAge < maxAge * triggerThreshold) {
    return { triggered: false, condition: null, yearsGained: 0, hintText: '', totalBreakthroughs }
  }

  // 难度递增：每次突破后概率降低
  const difficultyMod = Math.pow(constants.breakthroughDifficultyMultiplier, totalBreakthroughs)
  const baseProb = constants.breakthroughBaseProbability / difficultyMod

  // 多因素加权
  const luckFactor = clampNumber(luckBonus / 10, 0, 1)
  const wealthFactor = clampNumber(currentWealth / 10000, 0, 1)
  const repFactor = clampNumber(currentReputation / 100, 0, 1)
  const devotionFactor = clampNumber(devotionLevel / 100, 0, 0.5)
  const ageFactor = clampNumber((currentAge - maxAge * triggerThreshold) / (maxAge * (1 - triggerThreshold)), 0, 1)

  const combinedProb = baseProb * (0.3 + 0.2 * luckFactor + 0.15 * wealthFactor + 0.15 * repFactor + 0.1 * devotionFactor + 0.1 * ageFactor)

  // 检查是否有满足条件的突破方式
  const conditions = gameRuleConfigLoader.getBreakthroughConditions()
  const validConditions = conditions.filter((c) => {
    if (c.requiredLuck > 0 && luckBonus < c.requiredLuck) return false
    if (c.requiredWealth > 0 && currentWealth < c.requiredWealth) return false
    if (c.requiredReputation > 0 && currentReputation < c.requiredReputation) return false
    // 负声望条件（如禁忌仪式需要负声望）
    if (c.requiredReputation < 0 && currentReputation >= 0) return false
    return true
  })

  if (validConditions.length === 0) {
    return { triggered: false, condition: null, yearsGained: 0, hintText: '', totalBreakthroughs }
  }

  // 随机判定
  const roll = Math.random()
  if (roll < combinedProb) {
    // 随机选一个满足条件的突破方式（优先高收益）
    validConditions.sort((a, b) => b.yearsGained - a.yearsGained)
    const selected = validConditions[0]
    return {
      triggered: true,
      condition: selected,
      yearsGained: selected.yearsGained,
      hintText: `【寿命突破】${selected.description}，寿命延长 ${selected.yearsGained} 年！`,
      totalBreakthroughs: totalBreakthroughs + 1,
    }
  }

  return { triggered: false, condition: null, yearsGained: 0, hintText: '', totalBreakthroughs }
}

// ============================================================
// 寿命损失检测
// ============================================================

/** 检测叙事中是否触发了寿命损失 */
function detectLifespanLoss(narrative: string): LifespanLossResult | null {
  const events = gameRuleConfigLoader.getLifespanLossEvents()
  for (const event of events) {
    for (const kw of event.keywords) {
      if (narrative.includes(kw)) {
        return {
          keyword: kw,
          yearsLost: event.yearsLost,
          note: event.note,
          lossText: `【寿命损失】${event.note}（-${event.yearsLost} 年）`,
        }
      }
    }
  }
  return null
}

// ============================================================
// 主入口
// ============================================================

/**
 * 执行叙事后处理（连锁反应 + 寿命突破 + 寿命损失）
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

  // 寿命突破检测
  const breakCheck = globalDeadLoopDetector.checkAndIncrement('lifespan-breakthrough', 50)
  let breakthroughResult: LifespanBreakthroughResult
  if (breakCheck.allowed) {
    breakthroughResult = checkBreakthrough(
      input.currentAge, input.maxAge, input.luckBonus,
      input.currentWealth, input.currentReputation, input.totalBreakthroughs,
      input.devotionLevel ?? 0,
    )
  } else {
    // console.warn('[PostNarrative]', breakCheck.reason)
    breakthroughResult = { triggered: false, condition: null, yearsGained: 0, hintText: '', totalBreakthroughs: input.totalBreakthroughs }
  }

  // 寿命损失检测
  const lossResult = detectLifespanLoss(input.narrative)

  // 汇总通知
  const notificationParts: string[] = []
  if (chainResult.notificationTexts.length > 0) {
    notificationParts.push(...chainResult.notificationTexts)
  }
  if (breakthroughResult.hintText) {
    notificationParts.push(breakthroughResult.hintText)
  }
  if (lossResult) {
    notificationParts.push(lossResult.lossText)
  }

  return {
    chainResult,
    breakthroughResult,
    lossResult,
    newMaxAge: breakthroughResult.triggered
      ? input.maxAge + breakthroughResult.yearsGained
      : lossResult ? Math.max(1, input.maxAge - lossResult.yearsLost) : null,
    notificationText: notificationParts.join('\n'),
  }
}
