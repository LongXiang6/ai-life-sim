/**
 * JSON-safe arbitrary precision integer helpers for simulation quantities.
 * Canonical values are unsigned base-10 strings so saves can represent scales
 * above Number.MAX_SAFE_INTEGER without precision loss.
 */

export type DecimalInteger = string

const DECIMAL_INTEGER_RE = /^(0|[1-9]\d*)$/

export function normalizeDecimalInteger(
  value: string | number | bigint,
  label = '整数',
): DecimalInteger {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} 必须是非负安全整数；超大数量请使用十进制字符串`)
    }
    return String(value)
  }
  const text = typeof value === 'bigint' ? value.toString() : value.trim()
  if (!DECIMAL_INTEGER_RE.test(text)) throw new Error(`${label} 必须是非负十进制整数`)
  return text
}

export function decimalIntegerToBigInt(value: DecimalInteger, label = '整数'): bigint {
  return BigInt(normalizeDecimalInteger(value, label))
}

export function compareDecimalIntegers(left: DecimalInteger, right: DecimalInteger): number {
  const a = decimalIntegerToBigInt(left)
  const b = decimalIntegerToBigInt(right)
  return a === b ? 0 : a > b ? 1 : -1
}

export function addDecimalIntegers(...values: DecimalInteger[]): DecimalInteger {
  return values.reduce((sum, value) => sum + decimalIntegerToBigInt(value), BigInt(0)).toString()
}

export function subtractDecimalIntegers(
  left: DecimalInteger,
  right: DecimalInteger,
): DecimalInteger {
  const result = decimalIntegerToBigInt(left) - decimalIntegerToBigInt(right)
  if (result < BigInt(0)) throw new Error('十进制整数相减结果不能为负数')
  return result.toString()
}

/** Multiply by an integer ratio and round half up. */
export function multiplyDecimalInteger(
  value: DecimalInteger,
  numerator: number | bigint,
  denominator: number | bigint = 1,
): DecimalInteger {
  const n = typeof numerator === 'bigint' ? numerator : BigInt(Math.round(numerator))
  const d = typeof denominator === 'bigint' ? denominator : BigInt(Math.round(denominator))
  if (n < BigInt(0) || d <= BigInt(0)) throw new Error('十进制整数倍率必须为非负分子和正分母')
  const product = decimalIntegerToBigInt(value) * n
  return ((product + d / BigInt(2)) / d).toString()
}

/**
 * Apply an annual per-million rate for a canonical elapsed-day interval.
 * The signed delta is returned as bigint so the owning system can combine
 * births, deaths and migration before clamping once.
 */
export function annualRateDelta(
  value: DecimalInteger,
  annualPerMillion: number,
  elapsedDays: number,
  daysPerYear = 365,
): bigint {
  if (!Number.isInteger(annualPerMillion)) throw new Error('年率必须使用每百万人整数')
  if (!Number.isInteger(elapsedDays) || elapsedDays < 0) throw new Error('经过天数必须是非负整数')
  if (!Number.isInteger(daysPerYear) || daysPerYear <= 0) throw new Error('每年天数必须是正整数')
  const numerator = decimalIntegerToBigInt(value) * BigInt(annualPerMillion) * BigInt(elapsedDays)
  const denominator = BigInt(1_000_000) * BigInt(daysPerYear)
  const absolute = numerator < BigInt(0) ? -numerator : numerator
  const rounded = (absolute + denominator / BigInt(2)) / denominator
  return numerator < BigInt(0) ? -rounded : rounded
}

/** Allocate a total by non-negative integer weights while preserving the exact sum. */
export function allocateDecimalInteger(
  total: DecimalInteger,
  weights: readonly number[],
): DecimalInteger[] {
  if (weights.length === 0) return []
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new Error('分配权重必须是非负安全整数')
  }
  const weightTotal = weights.reduce((sum, weight) => sum + BigInt(weight), BigInt(0))
  if (weightTotal === BigInt(0)) throw new Error('分配权重之和必须大于零')
  const source = decimalIntegerToBigInt(total)
  const allocated = weights.map((weight) => source * BigInt(weight) / weightTotal)
  let remainder = source - allocated.reduce((sum, value) => sum + value, BigInt(0))
  for (let index = 0; remainder > BigInt(0); index = (index + 1) % allocated.length) {
    if (weights[index] === 0) continue
    allocated[index] += BigInt(1)
    remainder -= BigInt(1)
  }
  return allocated.map((value) => value.toString())
}

function chineseFourDigitUnit(group: number): string {
  if (group <= 0) return ''
  return `${group % 2 === 1 ? '万' : ''}${'亿'.repeat(Math.floor(group / 2))}`
}

function groupedDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Format exact integers with unambiguous mainland-Chinese four-digit units.
 * Examples: 1,000,000 -> 100万; 10,000,000,000 -> 100亿;
 * 10,000,000,000,000,000 -> 1亿亿.
 */
export function formatChineseMagnitude(
  value: DecimalInteger | number | bigint,
  maximumFractionDigits = 2,
): string {
  const canonical = normalizeDecimalInteger(value)
  const source = BigInt(canonical)
  if (source < BigInt(10_000)) return groupedDigits(canonical)
  const digits = Math.max(0, Math.min(4, Math.round(maximumFractionDigits)))
  const fractionScale = BigInt(10) ** BigInt(digits)
  let group = Math.floor((canonical.length - 1) / 4)
  let unitScale = BigInt(10_000) ** BigInt(group)
  let scaled = (source * fractionScale + unitScale / BigInt(2)) / unitScale
  if (scaled >= BigInt(10_000) * fractionScale) {
    group += 1
    unitScale *= BigInt(10_000)
    scaled = (source * fractionScale + unitScale / BigInt(2)) / unitScale
  }
  const whole = scaled / fractionScale
  const fraction = digits === 0
    ? ''
    : (scaled % fractionScale).toString().padStart(digits, '0').replace(/0+$/, '')
  return `${whole}${fraction ? `.${fraction}` : ''}${chineseFourDigitUnit(group)}`
}

export function decimalIntegerToSafeNumber(value: DecimalInteger, label = '整数'): number {
  const parsed = decimalIntegerToBigInt(value, label)
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} 超出 JavaScript 安全整数范围`)
  }
  return Number(parsed)
}
