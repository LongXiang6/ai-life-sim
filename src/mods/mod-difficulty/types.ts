/**
 * @module types.ts
 * @description MOD 类型定义 —— 四档难度系统
 * @mod mod-difficulty
 */

// ============================================================
// 公共类型（通过 index.ts 导出，供其他 MOD 使用）
// ============================================================

import type { DifficultyLevel as DifficultyLevelBase } from '@/foundation'

/** 四档难度等级（复用 Foundation 定义，消除重复声明） */
export type DifficultyLevel = DifficultyLevelBase

/** 单档难度配置 */
export interface DifficultyConfig {
  /** 显示标签 */
  label: string
  /** 标识色 */
  color: string
  /** 灾害发生率（每回合概率） */
  disasterRate: number
  /** 敌人强度缩放（1.0 = 基准） */
  enemyScale: number
  /** 是否启用人格天花板压制 */
  ceilingSuppress: boolean
  /** 天花板压制阈值（角色能力超过此比例时被强制压缩） */
  suppressThreshold: number
  /** 奇遇/机缘触发概率乘数（对齐废弃项目 DIFFICULTY_MULTIPLIERS） */
  fortuneMultiplier: number
  /** 消耗/支出乘数（对齐废弃项目 economy DIFFICULTY_MULTIPLIER） */
  expenseMultiplier: number,
}

/** 所有难度配置的映射表 */
export type DifficultyMap = Record<DifficultyLevel, DifficultyConfig>

/** MOD 事件载荷映射 */
export interface ModEventPayloads {
  'mod-difficulty:changed': { level: DifficultyLevel; config: DifficultyConfig },
}

/** MOD 事件载荷映射类型别名 */
export type ModEvents = ModEventPayloads

// ============================================================
// 内部类型
// ============================================================

/** Store 状态 */
export interface DifficultyStoreState {
  /** 当前难度等级 */
  level: DifficultyLevel
  /** 设置难度 */
  setLevel: (level: DifficultyLevel) => void
  /** 获取当前难度配置 */
  getConfig: () => DifficultyConfig,
}

