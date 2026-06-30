/**
 * @module constants.ts
 * @description 难度配置常量 —— 四档难度参数
 * @mod mod-difficulty
 */

import type { DifficultyLevel, DifficultyMap, } from './types'

/**
 * 四档难度配置（对齐废弃项目 DIFFICULTY_CONFIG +
 * DIFFICULTY_MULTIPLIERS + economy DIFFICULTY_MULTIPLIER）
 *
 * 交互影响说明：
 * - disasterRate：每回合自然灾害/世界事件触发概率
 * - enemyScale：战斗/对抗中敌人的属性修正倍率
 * - ceilingSuppress：角色能力超过 suppressThreshold 比例时，压制到阈值
 * - fortuneMultiplier：奇遇/机缘触发概率乘数
 * - expenseMultiplier：生活消耗/经济支出乘数
 */
export const DIFFICULTY_CONFIG: DifficultyMap = {
  normal: {
    label: '普通',
    color: '#22c55e',
    disasterRate: 0.02,
    enemyScale: 0.9,
    ceilingSuppress: false,
    suppressThreshold: 0,
    fortuneMultiplier: 1.0,
    expenseMultiplier: 1.0,
  },
  hard: {
    label: '困难',
    color: '#f59e0b',
    disasterRate: 0.10,
    enemyScale: 1.0,
    ceilingSuppress: false,
    suppressThreshold: 0,
    fortuneMultiplier: 0.8,
    expenseMultiplier: 1.3,
  },
  nightmare: {
    label: '噩梦',
    color: '#ef4444',
    disasterRate: 0.16,
    enemyScale: 1.3,
    ceilingSuppress: true,
    suppressThreshold: 0.40,
    fortuneMultiplier: 0.6,
    expenseMultiplier: 1.8,
  },
  hell: {
    label: '地狱',
    color: '#7c3aed',
    disasterRate: 0.24,
    enemyScale: 1.8,
    ceilingSuppress: true,
    suppressThreshold: 0.25,
    fortuneMultiplier: 0.4,
    expenseMultiplier: 2.5,
  },
}

/** 难度等级列表（按低→高排序） */
export const DIFFICULTY_LEVELS: DifficultyLevel[] = ['normal', 'hard', 'nightmare', 'hell',]

/** 默认难度 */
export const DEFAULT_DIFFICULTY: DifficultyLevel = 'normal'

/** 存储键 */
export const STORAGE_KEY_DIFFICULTY = 'mod-difficulty:config:level' as const
