/**
 * @module game-rule-config-loader.ts
 * @description 游戏规则配置加载器 —— 将硬编码规则外部化为可配置的 JSON 配置
 * @mod mod-engine
 *
 * 职责：
 *   - 加载默认规则配置（从 game-rules-config.default.json 静态导入）
 *   - Zod schema 校验确保规则数据完整性
 *   - 支持运行时合并自定义配置（不同世界/场景可覆盖规则）
 *   - 提供配置版本号，支持热更新追踪
 */

import defaultConfigJson from './game-rules-config.default.json'
import { z } from 'zod'

// ============================================================
// Zod Schema 定义
// ============================================================

const ChainReactionRuleSchema = z.object({
  id: z.string(),
  keywords: z.array(z.string()),
  healthChange: z.number(),
  wealthChange: z.number(),
  reputationChange: z.number(),
  note: z.string(),
})

const BreakthroughConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requiredLuck: z.number(),
  requiredWealth: z.number(),
  requiredReputation: z.number(),
  yearsGained: z.number(),
})

const LifespanLossEventSchema = z.object({
  id: z.string(),
  keywords: z.array(z.string()),
  yearsLost: z.number(),
  note: z.string(),
})

const GameRuleConstantsSchema = z.object({
  maxApplyPerRound: z.number(),
  breakthroughDifficultyMultiplier: z.number(),
  breakthroughBaseProbability: z.number(),
  breakthroughTriggerThreshold: z.number(),
})

export const GameRuleConfigSchema = z.object({
  chainReactionRules: z.array(ChainReactionRuleSchema),
  breakthroughConditions: z.array(BreakthroughConditionSchema),
  lifespanLossEvents: z.array(LifespanLossEventSchema),
  constants: GameRuleConstantsSchema,
})

// ============================================================
// 类型导出
// ============================================================

export type ChainReactionRule = z.infer<typeof ChainReactionRuleSchema>
export type BreakthroughCondition = z.infer<typeof BreakthroughConditionSchema>
export type LifespanLossEvent = z.infer<typeof LifespanLossEventSchema>
export type GameRuleConstants = z.infer<typeof GameRuleConstantsSchema>
export type GameRuleConfig = z.infer<typeof GameRuleConfigSchema>

// ============================================================
// 配置加载器
// ============================================================

export class GameRuleConfigLoader {
  private config: GameRuleConfig
  private configVersion: number = 0

  constructor() {
    // 启动时使用默认配置（Zod 校验）
    const result = GameRuleConfigSchema.safeParse(defaultConfigJson)
    if (!result.success) {
      console.error(
        '[GameRuleConfig] 默认规则配置校验失败:',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      )
      // 降级：强制类型转换（不阻塞启动）
      this.config = defaultConfigJson as GameRuleConfig
    } else {
      this.config = result.data
    }
  }

  /** 获取当前规则配置 */
  getConfig(): GameRuleConfig {
    return this.config
  }

  /** 获取链式反应规则 */
  getChainReactionRules(): ChainReactionRule[] {
    return this.config.chainReactionRules
  }

  /** 获取寿命突破条件 */
  getBreakthroughConditions(): BreakthroughCondition[] {
    return this.config.breakthroughConditions
  }

  /** 获取寿命损失事件 */
  getLifespanLossEvents(): LifespanLossEvent[] {
    return this.config.lifespanLossEvents
  }

  /** 获取游戏规则常量 */
  getConstants(): GameRuleConstants {
    return this.config.constants
  }

  /** 获取配置版本号 */
  getVersion(): number {
    return this.configVersion
  }

  /**
   * 合并自定义配置（用于不同世界/场景的规则覆盖）
   * 采用浅合并策略：每个规则数组完全替换，constants 字段级别合并。
   */
  mergeConfig(partial: Partial<GameRuleConfig>): { valid: boolean; errors: string[] } {
    const merged: GameRuleConfig = {
      chainReactionRules: partial.chainReactionRules ?? this.config.chainReactionRules,
      breakthroughConditions: partial.breakthroughConditions ?? this.config.breakthroughConditions,
      lifespanLossEvents: partial.lifespanLossEvents ?? this.config.lifespanLossEvents,
      constants: { ...this.config.constants, ...partial.constants },
    }

    const result = GameRuleConfigSchema.safeParse(merged)
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      console.warn('[GameRuleConfig] 合并配置校验失败:', errors)
      return { valid: false, errors }
    }

    this.config = result.data
    this.configVersion++
    return { valid: true, errors: [] }
  }

  /**
   * 完全替换配置（用于热更新）
   */
  setConfig(config: unknown): { valid: boolean; errors: string[] } {
    const result = GameRuleConfigSchema.safeParse(config)
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      console.warn('[GameRuleConfig] 设置配置校验失败:', errors)
      return { valid: false, errors }
    }

    this.config = result.data
    this.configVersion++
    return { valid: true, errors: [] }
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): boolean {
    const result = GameRuleConfigSchema.safeParse(defaultConfigJson)
    if (!result.success) {
      console.error('[GameRuleConfig] 重置默认配置失败')
      return false
    }
    this.config = result.data
    this.configVersion++
    return true
  }
}

/** 全局单例 */
export const gameRuleConfigLoader = new GameRuleConfigLoader()
