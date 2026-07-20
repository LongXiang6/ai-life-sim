/**
 * @module redact-sensitive-data.ts
 * @description 浏览器与服务端共享的秘密脱敏规则
 * @mod core
 */

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  if (
    normalized === 'device_id'
    || normalized === 'hardware_id'
    || normalized === 'serial_number'
    || normalized === 'serial'
    || normalized === 'imei'
    || normalized === 'mac_address'
  ) {
    return true
  }
  return /(^|[_-])(?:(?:api|custom|managed|provider|auth|access|refresh|id)[_-]?)?(?:key|token|secret|password|authorization|cookie)($|[_-])/.test(normalized)
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, '[REDACTED_API_KEY]')
    .replace(/((?:"|')?(?:api[_-]?key|custom[_-]?key|managed[_-]?api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|cookie)(?:"|')?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|token|secret|password)=)[^&#\s]*/gi, '$1[REDACTED]')
}

/** 递归脱敏结构化数据；保留非秘密的配置、叙事和诊断语义。 */
export function redactSensitiveData(value: unknown, key = ''): unknown {
  if (isSensitiveKey(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactSensitiveString(value)
  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = redactSensitiveData(childValue, childKey)
    }
    return output
  }
  return value
}
