/**
 * @module utils.ts
 * @description 角色系统工具函数（浮点精度提升自 foundation，保留角色专用工具）
 * @mod mod-character
 */

import type { DeathCause } from './types'

export { ROUND_DECIMALS, round } from '@/foundation'

import { RECOVERY_BASE_RATES } from './constants'

// ============================================================
// 恢复速率
// ============================================================

/**
 * 根据严重度和体魄计算实际恢复轮次
 * 公式：max(1, baseRounds - floor(physique / 2))
 */
export function getRecoveryRounds(severity: number, physique: number): number {
  const baseRounds = RECOVERY_BASE_RATES[Math.min(10, Math.max(1, severity))] ?? severity * 2
  return Math.max(1, baseRounds - Math.floor(physique / 2))
}

// ============================================================
// 健康/精神状态文字标签
// ============================================================

/** 健康值 → 文字标签 */
export function getHealthStatusLabel(hp: number, maxHp: number): string {
  const ratio = hp / maxHp
  if (ratio <= 0) return '已死亡'
  if (ratio < 0.25) return '濒死'
  if (ratio < 0.50) return '重病'
  if (ratio < 0.75) return '亚健康'
  if (ratio < 1) return '健康'
  return '精力充沛'
}

/** 精神值 → 文字标签 */
export function getMentalStateLabel(spirit: number): string {
  if (spirit < 25) return '精神崩溃'
  if (spirit < 50) return '抑郁'
  if (spirit < 75) return '正常'
  if (spirit < 100) return '乐观'
  return '精神巅峰'
}

// ============================================================
// 死因推断
// ============================================================

/** 永生/不死类背景或叙事关键词 */
export const IMMORTAL_LIFESPAN_KEYWORDS = [
  '永生', '不死', '不朽', '长生', '系统无限寿命', '寿命无限', '寿命锁定', '寿元无限', '不老不死',
] as const

/** 仅允许数字的输入过滤（寿命/年龄）—— 已统一到 shared/，mod-character 保留 re-export 兼容 */
export { filterDigitsOnly } from '@/core/shared'

/** 背景或叙事是否暗示永生 */
export function hasImmortalLifespanHint(...texts: (string | undefined)[]): boolean {
  const combined = texts.filter(Boolean).join('')
  return IMMORTAL_LIFESPAN_KEYWORDS.some((kw) => combined.includes(kw))
}

/** 是否应跳过「老死/寿终」类结局（极高寿元或明确永生设定） */
export function shouldSkipOldAgeDeath(
  maxAge: number,
  narrative: string,
  background?: string,
): boolean {
  if (maxAge >= 10_000) return true
  return hasImmortalLifespanHint(background, narrative)
}

/**
 * 从叙事文本 + 健康值 + 年龄综合推断死因
 */
export function inferDeathCause(
  narrative: string,
  healthVal: number,
  age: number,
  maxAge: number,
  background?: string,
): DeathCause {
  const text = narrative
  const skipOldAge = shouldSkipOldAgeDeath(maxAge, text, background)

  if (!skipOldAge) {
    if (text.includes('老') || text.includes('寿') || (age >= maxAge * 0.85 && healthVal > -5)) {
      return 'old_age'
    }
  }
  if (text.includes('病') || text.includes('疾') || text.includes('瘟疫')) return 'illness'
  if (text.includes('战') || text.includes('杀') || text.includes('斗') || text.includes('剑') || text.includes('刀')) return 'battle'
  if (text.includes('灾') || text.includes('洪') || text.includes('火') || text.includes('地震')) return 'catastrophe'
  if (text.includes('意外') || text.includes('摔') || text.includes('坠落')) return 'accident'
  if (text.includes('刺') || text.includes('毒') || text.includes('暗杀')) return 'murder'
  if (healthVal <= -5) return 'illness'
  return 'unknown'
}
