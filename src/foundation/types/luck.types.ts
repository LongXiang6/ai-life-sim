/**
 * @module luck.types.ts
 * @description 气运系统的跨 MOD 状态契约；运行态由 mod-character 独占。
 * @mod foundation
 */

export type LuckNarrativeDirection = 'bad' | 'neutral' | 'good'

/** 一次本地投掷产生的、只用于下一次叙事的低优先级方向引导。 */
export interface LuckNarrativeGuidance {
  direction: LuckNarrativeDirection
  /** 百分比刻度上的本地随机值，范围 [0, 100)。 */
  roll: number
  badProbabilityPercent: number
  neutralProbabilityPercent: number
  goodProbabilityPercent: number
  luck: number
  generatedAtRound: number
  generatedAtTotalDays: number
}

export interface LuckModifiers {
  diseaseAvoidance: number
  deathAvoidChance: number
  eventWeightBias: number
}

/** 气运系统 owning state；页面与 mod-power-system 只保存该状态的只读投影。 */
export interface LuckState {
  contextId: string
  luck: number
  modifiers: LuckModifiers
  luckNotificationRounds: number
  luckNotificationText: string
  narrativeGuidance: LuckNarrativeGuidance | null
}

export interface LuckPersistenceState {
  schemaVersion: 1
  contexts: Record<string, LuckState>
}
