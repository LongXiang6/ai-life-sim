/**
 * 跨 MOD 通用工具函数
 *
 * 规则：
 * - 所有函数必须是纯函数，不依赖任何 MOD 的 store 或外部状态
 * - 被 2 个以上 MOD 调用的函数放这里
 * - 只被 1 个 MOD 使用的函数放该 MOD 自己的 utils.ts
 * - 新增函数前先检查本文是否已有同名或等价实现
 * - **每个导出函数必须有详细中文注释（@param/@returns/@example）** — B-46 要求
 *
 * @mod core/shared
 */

/**
 * 安全 JSON 解析
 * 
 * 解析失败不抛异常，返回 undefined。
 * 用于处理 AI 返回的不规范 JSON 字符串、API 响应等不可信数据源。
 * 
 * @param json - 待解析的 JSON 字符串
 * @returns 解析后的对象，失败返回 undefined
 *
 * @example
 * ```ts
 * const data = safeJsonParse<{ name: string }>('{"name":"test"}')
 * if (data) console.log(data.name) // "test"
 * ```
 */
export function safeJsonParse<T = unknown>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T
  } catch {
    return undefined
  }
}

/**
 * 范围限制（clamp）
 * 
 * 将数值限制在 [min, max] 区间内。
 * 低于 min 返回 min，高于 max 返回 max，中间值原样返回。
 * 
 * @param value - 输入值
 * @param min   - 下限
 * @param max   - 上限
 * @returns 限制后的值
 *
 * @example
 * ```ts
 * clamp(5, 0, 10)   // 5
 * clamp(-1, 0, 10)  // 0
 * clamp(15, 0, 10)  // 10
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 生成指定范围的随机整数 [min, max]（含两端）
 * 
 * 用于随机选取、随机属性赋值、随机事件触发等场景。
 * 与各 MOD 中原有的 randomInRange 签名和行为完全一致。
 * 
 * @param min - 最小值（含）
 * @param max - 最大值（含）
 * @returns [min, max] 区间内的随机整数
 *
 * @example
 * ```ts
 * randomInt(1, 6)  // 模拟骰子，返回 1~6
 * randomInt(0, arr.length - 1)  // 随机数组索引
 * ```
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 深度合并两个对象
 * 
 * - 仅处理普通对象，数组直接覆盖（不递归合并数组元素）
 * - 用于 MOD 配置合并、默认值与用户设置的叠加等场景
 * - source 中 undefined 的值不会覆盖 target
 * 
 * @param target - 目标对象（会被浅拷贝，不修改原对象）
 * @param source - 源对象，属性合并到 target
 * @returns 合并后的新对象
 *
 * @example
 * ```ts
 * const defaults = { a: 1, b: { x: 10 } }
 * const overrides = { b: { y: 20 }, c: 3 }
 * deepMerge(defaults, overrides)
 * // => { a: 1, b: { x: 10, y: 20 }, c: 3 }
 * ```
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key]
    const tv = result[key]
    if (isPlainObject(tv) && isPlainObject(sv)) {
      result[key] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>,
      ) as T[keyof T]
    } else if (sv !== undefined) {
      result[key] = sv as T[keyof T]
    }
  }
  return result
}

/** 判断是否普通对象（非数组、非 null） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 唯一 ID 生成（短格式）
 * 
 * 生成临时标识符，格式为 `${prefix}_<7位随机字符>`。
 * 用于 session ID、临时缓存 key、匿名标识等非持久化场景。
 * 不保证全局唯一，仅适合同一运行周期内的临时标识。
 * 
 * @param prefix - ID 前缀，默认 "id"
 * @returns 格式为 `prefix_xxxxxxx` 的短 ID
 *
 * @example
 * ```ts
 * uniqueId('session')  // "session_3x9ak2b"
 * uniqueId()           // "id_7m1nq4z"
 * ```
 */
export function uniqueId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 延迟 Promise
 * 
 * 用于异步流程中的等待、防抖、UI 过渡等场景。
 * 
 * @param ms - 等待毫秒数
 * @returns 指定毫秒后 resolve 的 Promise
 *
 * @example
 * ```ts
 * await delay(1000)  // 等待 1 秒
 * ```
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// 以下为本次蓝图整合新增的公共函数
// ============================================================

/**
 * 计算数值数组平均值
 * 
 * 空数组返回 0，不做除零错误。
 * 用于战力平均、属性平均、经济指标平均等统计场景。
 * 
 * @param values - 数值数组
 * @returns 算术平均值，空数组返回 0
 *
 * @example
 * ```ts
 * computeAverage([10, 20, 30])   // 20
 * computeAverage([])              // 0
 * computeAverage([5])             // 5
 * ```
 */
export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * 过滤字符串中的非数字字符（仅保留 0-9）
 * 
 * 用于寿命/年龄等输入框的实时过滤，防止用户输入字母或符号。
 * 是一个通用的 input 清理工具。
 * 
 * @param value - 原始输入字符串
 * @returns 只含数字字符的字符串，无数字返回空串
 *
 * @example
 * ```ts
 * filterDigitsOnly("abc123")   // "123"
 * filterDigitsOnly("999岁")    // "999"
 * filterDigitsOnly("hello")    // ""
 * ```
 */
export function filterDigitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * 判断字符串是否为空白（null/undefined/全空白字符）
 * 
 * trim() 后长度为 0 视为空白。
 * 替代项目内大量重复的 `!x || x.trim() === ''` guard 模式。
 * 
 * @param str - 待判断的值
 * @returns true 表示为空、undefined 或全空白字符
 *
 * @example
 * ```ts
 * isBlank(null)         // true
 * isBlank("   ")        // true
 * isBlank("hello")      // false
 * isBlank(undefined)    // true
 * ```
 */
export function isBlank(str: string | null | undefined): str is null | undefined | '' {
  return str == null || str.trim() === ''
}
