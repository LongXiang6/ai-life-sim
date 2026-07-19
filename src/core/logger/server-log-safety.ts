/**
 * @module server-log-safety.ts
 * @description 生产日志的纯来源分类与秘密脱敏规则
 * @mod core
 */

import { isIP } from 'net'

/** 将任意动态字段压缩为安全文件名片段。 */
export function safeLogSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  return normalized.slice(0, 96) || 'unknown'
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  return /(^|[_-])(?:(?:api|custom|managed|provider|auth|access|refresh|id)[_-]?)?(?:key|token|secret|password|authorization|cookie)($|[_-])/.test(normalized)
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, '[REDACTED_API_KEY]')
    .replace(/((?:"|')?(?:api[_-]?key|custom[_-]?key|managed[_-]?api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|cookie)(?:"|')?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|token|secret|password)=)[^&#\s]*/gi, '$1[REDACTED]')
}

/** 递归脱敏结构化数据；保留 Prompt、响应和叙事正文的完整非密钥内容。 */
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

export interface ServerRequestSource {
  ip: string
  sourceId: string
}

function normalizeIpCandidate(value: string | null): string | undefined {
  if (!value) return undefined
  let candidate = value.trim().replace(/^"|"$/g, '')
  if (!candidate) return undefined

  if (candidate.startsWith('[')) {
    const closingBracket = candidate.indexOf(']')
    if (closingBracket > 1) candidate = candidate.slice(1, closingBracket)
  }
  if (isIP(candidate)) return candidate

  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4WithPort && isIP(ipv4WithPort[1])) return ipv4WithPort[1]
  return undefined
}

/** 从服务器可信代理头派生来源；请求体不能覆盖 IP。 */
export function getServerRequestSource(request: Request): ServerRequestSource {
  const realIp = normalizeIpCandidate(request.headers.get('x-real-ip'))
  const forwardedIp = normalizeIpCandidate(
    request.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
  )
  const ip = realIp ?? forwardedIp ?? 'unknown'
  return {
    ip,
    sourceId: `ip-${safeLogSegment(ip)}`,
  }
}
