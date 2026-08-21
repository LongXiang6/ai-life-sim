/**
 * Purpose: Validate runtime subsystem values and recursively sanitize serializable state.
 * Owner: mod-engine
 * Responsibility: Runtime data-safety helpers only.
 *
 * @module system-safety.ts
 * @description 系统安全防护层 —— NaN/Infinity 检测修复、数值钳制、死循环检测、递归深度保护
 * @mod mod-engine
 *
 * 来源：废案 system-safety.ts
 *
 * 功能：
 *   - NaN/Infinity 检测与自动修复
 *   - 数值范围钳制
 *   - 对象递归安全校验
 *   - 死循环深度计数器
 */

import type { SubSystemState } from '@/foundation'

// ============================================================
// 类型定义
// ============================================================

export interface SafetyReport {
  passed: boolean
  errors: string[]
  fixedValues: number,
}

// ============================================================
// 数值范围配置
// ============================================================

// 业务状态允许数组嵌套对象（例如世界区域与角色阶段定义）。
// 5 层会把合法的世界初始化评分配置误判为危险深度；保留明确上限并单独拦截循环引用。
const MAX_RECURSION_DEPTH = 12

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NUMBER_RANGES: Record<string, { min: number; max: number }> = {
  health: { min: 0, max: 100 },
  stamina: { min: 0, max: 100 },
  mentalState: { min: 0, max: 100 },
  level: { min: 0, max: 100 },
  quality: { min: 0, max: 10 },
  trust: { min: 0, max: 10 },
  reputation: { min: -100, max: 100 },
  power: { min: 0, max: 100 },
  severity: { min: 1, max: 10 },
  contribution: { min: 0, max: 100000 },
  wealth: { min: 0, max: 1000000000 },
  inflationRate: { min: -1, max: 10 },
  incomePerRound: { min: -100000, max: 100000 },
  expensePerRound: { min: 0, max: 100000 },
}

// ============================================================
// 基础安全函数
// ============================================================

/** 检测 NaN 或 Infinity */
export function isNaNOrInfinity(value: unknown): boolean {
  if (typeof value !== 'number') return false
  return isNaN(value) || !isFinite(value)
}

/** 安全数字：NaN/Infinity 使用 fallback 替代 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value !== 'number') return fallback
  if (isNaN(value) || !isFinite(value)) return fallback
  return value
}

/** 数值钳制 */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, safeNumber(value, min)))
}

/** 验证数值字段 */
export function validateNumberField(
  value: unknown,
  fieldName: string,
  context: string,
): { value: number; error: string | null } {
  if (typeof value !== 'number') {
    return { value: 0, error: `[${context}] ${fieldName} 类型错误：期望 number，实际 ${typeof value}，已重置为0` }
  }
  if (isNaN(value)) {
    return { value: 0, error: `[${context}] ${fieldName} 为 NaN，已重置为0` }
  }
  if (!isFinite(value)) {
    const clamped = value > 0 ? 1e9 : -1e9
    return { value: clamped, error: `[${context}] ${fieldName} 为 Infinity，已钳制为 ${clamped}` }
  }
  return { value, error: null }
}

/** 深层次安全清洗 */
export function deepSanitize<T>(
  obj: T,
  path: string = 'root',
  depth: number = 0,
  seen: WeakSet<object> = new WeakSet<object>(),
): { result: T; report: SafetyReport } {
  const report: SafetyReport = { passed: true, errors: [], fixedValues: 0 }

  if (depth > MAX_RECURSION_DEPTH) {
    report.passed = false
    report.errors.push(`[${path}] 递归深度超过限制(${MAX_RECURSION_DEPTH})`)
    return { result: obj, report }
  }

  if (obj === null || obj === undefined) return { result: obj, report }

  if (typeof obj === 'number') {
    const validated = validateNumberField(obj, path, 'deepSanitize')
    if (validated.error) {
      report.errors.push(validated.error)
      report.fixedValues++
      report.passed = false
    }
    return { result: validated.value as unknown as T, report }
  }

  if (typeof obj === 'object') {
    if (seen.has(obj)) {
      report.passed = false
      report.errors.push(`[${path}] 检测到循环引用`)
      return { result: obj, report }
    }
    seen.add(obj)
    if (Array.isArray(obj)) {
      const sanitized = obj.map((item, i) => {
        const { result, report: subReport } = deepSanitize(item, `${path}[${i}]`, depth + 1, seen)
        report.errors.push(...subReport.errors)
        report.fixedValues += subReport.fixedValues
        if (!subReport.passed) report.passed = false
        return result
      })
      seen.delete(obj)
      return { result: sanitized as unknown as T, report }
    }
    const result = {} as Record<string, unknown>
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const { result: sanitized, report: subReport } = deepSanitize(val, `${path}.${key}`, depth + 1, seen)
      result[key] = sanitized
      report.errors.push(...subReport.errors)
      report.fixedValues += subReport.fixedValues
      if (!subReport.passed) report.passed = false
    }
    seen.delete(obj)
    return { result: result as unknown as T, report }
  }

  return { result: obj, report }
}

/**
 * 子系统状态安全清洗 —— 仅扫描 data 字段，避免 { id, summary, data } 外包装额外占深度。
 */
export function sanitizeSubSystemState(
  state: SubSystemState,
  pathPrefix: string,
): { result: SubSystemState; report: SafetyReport } {
  const dataSanitized = deepSanitize(state.data ?? {}, `${pathPrefix}.data`)
  return {
    result: {
      ...state,
      data: dataSanitized.result,
    },
    report: dataSanitized.report,
  }
}

// ============================================================
// 死循环检测器
// ============================================================

interface DeadLoopEntry {
  count: number
  maxAllowed: number
  lastReset: number,
}

export class GlobalDeadLoopDetector {
  private entries: Map<string, DeadLoopEntry> = new Map()

  /**
   * 检查并递增计数器
   * @param key 检测键（如 'chain-reaction'）
   * @param maxAllowed 最大允许次数（默认 100）
   * @returns 是否允许继续
   */
  checkAndIncrement(key: string, maxAllowed: number = 100): { allowed: boolean; reason: string } {
    let entry = this.entries.get(key)
    const now = Date.now()

    // 每 5 秒自动重置
    if (entry && now - entry.lastReset > 5000) {
      entry.count = 0
      entry.lastReset = now
    }

    if (!entry) {
      entry = { count: 0, maxAllowed, lastReset: now }
      this.entries.set(key, entry)
    }

    entry.count++
    if (entry.count > maxAllowed) {
      return { allowed: false, reason: `[${key}] 检测到疑似死循环：count=${entry.count}/${maxAllowed}` }
    }
    return { allowed: true, reason: '' }
  }

  reset(key: string): void {
    const entry = this.entries.get(key)
    if (entry) {
      entry.count = 0
      entry.lastReset = Date.now()
    }
  }

  resetAll(): void {
    this.entries.clear()
  }
}

/** 全局单例 */
export const globalDeadLoopDetector = new GlobalDeadLoopDetector()
