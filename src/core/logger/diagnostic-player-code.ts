/**
 * @module diagnostic-player-code.ts
 * @description 玩家诊断编号的共享格式与 Cookie 契约
 * @mod core
 */

export const DIAGNOSTIC_PLAYER_CODE_COOKIE = 'ai-life-sim-diagnostic-code'
export const DIAGNOSTIC_PLAYER_CODE_LENGTH = 6

const DIAGNOSTIC_PLAYER_CODE_PATTERN = /^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{6}$/

/** 六位大写字母与数字，排除 I/O/0/1 等易混淆字符。 */
export function normalizeDiagnosticPlayerCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase()
  return DIAGNOSTIC_PLAYER_CODE_PATTERN.test(normalized) ? normalized : undefined
}

