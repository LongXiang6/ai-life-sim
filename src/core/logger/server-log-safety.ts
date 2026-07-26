/**
 * @module server-log-safety.ts
 * @description 生产日志的可信请求来源分类
 * @mod core
 */

import { isIP } from 'net'

import {
  DIAGNOSTIC_PLAYER_CODE_COOKIE,
  normalizeDiagnosticPlayerCode,
} from './diagnostic-player-code'
import {
  DEVICE_PROVENANCE_ID_COOKIE,
  normalizeDeviceProvenanceId,
} from './device-provenance'

/** 将任意动态字段压缩为安全文件名片段。 */
export function safeLogSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  return normalized.slice(0, 96) || 'unknown'
}

export interface ServerRequestSource {
  ip: string
  sourceId: string
  diagnosticCode?: string
  deviceProvenanceId?: string
  isRegistered: boolean
  accountId?: string
  username?: string
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
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
  const diagnosticCode = normalizeDiagnosticPlayerCode(
    readCookie(request, DIAGNOSTIC_PLAYER_CODE_COOKIE),
  )
  const deviceProvenanceId = normalizeDeviceProvenanceId(
    readCookie(request, DEVICE_PROVENANCE_ID_COOKIE),
  )
  return {
    ip,
    sourceId: `ip-${safeLogSegment(ip)}`,
    diagnosticCode,
    deviceProvenanceId,
    isRegistered: false,
  }
}
