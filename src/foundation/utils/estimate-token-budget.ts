/**
 * @module estimate-token-budget.ts
 * @description Token 预算估算（输出量 × 冗余系数，256 对齐；不设输出上限，由 Provider 窗口约束）
 * @mod foundation
 */

/** 默认最低保证值 */
export const TOKEN_BUDGET_DEFAULT_MIN = 512

/** 输出冗余系数（50% headroom，降低 JSON 截断概率） */
export const TOKEN_BUDGET_HEADROOM = 1.5

/** 256 对齐步长 */
const TOKEN_ALIGN = 256

export interface EstimateTokenBudgetOptions {
  /** 最低保证值（默认 512） */
  minTokens?: number
}

/**
 * 估算文本 token 数（中英混合启发式，与 mod-engine estimateTokens 算法一致）
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0
  let cjkChars = 0
  let otherChars = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      cjkChars++
    } else {
      otherChars++
    }
  }
  return Math.ceil(cjkChars / 1.5 + otherChars / 4)
}

function alignTokenBudget(value: number): number {
  return Math.ceil(value / TOKEN_ALIGN) * TOKEN_ALIGN
}

/**
 * 根据估计输出 token 数计算 maxTokens（含冗余，向上取整到 256 倍数，无上限）
 *
 * 当 system/user prompt 非空时，额外计入约 10% 输入 token 作为「误回写输入」风险缓冲。
 */
export function estimateTokenBudget(
  systemPrompt: string,
  userPrompt: string,
  estimatedOutputTokens: number,
  minOrOptions: number | EstimateTokenBudgetOptions = TOKEN_BUDGET_DEFAULT_MIN,
): number {
  const minTokens = typeof minOrOptions === 'number'
    ? minOrOptions
    : (minOrOptions.minTokens ?? TOKEN_BUDGET_DEFAULT_MIN)

  const inputTokens = estimateTextTokens(systemPrompt) + estimateTextTokens(userPrompt)
  const echoFromPrompt = inputTokens > 0 ? Math.ceil(inputTokens * 0.1) : 0

  const safeEstimate = Math.max(0, estimatedOutputTokens) + echoFromPrompt
  const raw = Math.ceil(safeEstimate * TOKEN_BUDGET_HEADROOM)
  const value = Math.max(raw, minTokens)
  return alignTokenBudget(value)
}

/**
 * 按额外输入字符长度追加 echo 风险预算（长 worldDescription 等）
 *
 * @param baseEstimate - 基础估计输出 token
 * @param inputCharLength - 额外字符数（如 worldDescription 长度或填充后 user prompt 总长）
 * @param minOrOptions - 最低保证值或选项
 */
export function scaleTokenBudgetByInputLength(
  baseEstimate: number,
  inputCharLength: number,
  minOrOptions: number | EstimateTokenBudgetOptions = TOKEN_BUDGET_DEFAULT_MIN,
): number {
  // 中文为主：约 8 字符 / token 的 echo 风险（比 /16 更保守）
  const echoRisk = Math.ceil(Math.max(0, inputCharLength) / 8)
  return estimateTokenBudget('', '', baseEstimate + echoRisk, minOrOptions)
}

/** 截断重试时将预算放大（256 对齐，不封顶） */
export function bumpTokenBudget(current: number, multiplier = 2): number {
  return alignTokenBudget(Math.ceil(current * multiplier))
}
