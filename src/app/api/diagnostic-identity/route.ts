/**
 * @module diagnostic-identity/route.ts
 * @description 为当前浏览器环境分配稳定的诊断编号与设备来源编号
 * @mod app
 */

import { NextResponse } from 'next/server'

import {
  DIAGNOSTIC_PLAYER_CODE_COOKIE,
} from '@/core/logger/diagnostic-player-code'
import { ensureDiagnosticPlayerCode } from '@/core/logger/diagnostic-player-identity'
import { DEVICE_PROVENANCE_ID_COOKIE } from '@/core/logger/device-provenance'
import { ensureDeviceProvenanceId } from '@/core/logger/device-provenance-identity'
import { getServerRequestSource } from '@/core/logger/server-log-store'
import { bindDiagnosticMailboxIdentity } from '@/core/player-content/player-mail-service'

const COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_COUNT = 60
const recentAllocations = new Map<string, number[]>()

function isDisabled(): boolean {
  return process.env.AI_DIAGNOSTIC_LOGS_ENABLED === 'false'
}

function isRateLimited(sourceId: string, now: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  for (const [key, values] of recentAllocations) {
    const retained = values.filter((value) => value >= cutoff)
    if (retained.length === 0) recentAllocations.delete(key)
    else if (retained.length !== values.length) recentAllocations.set(key, retained)
  }
  const recent = recentAllocations.get(sourceId) ?? []
  if (recent.length >= RATE_LIMIT_COUNT) return true
  recent.push(now)
  recentAllocations.set(sourceId, recent)
  return false
}

export async function GET(request: Request): Promise<Response> {
  if (isDisabled()) {
    return Response.json({ error: '诊断日志服务当前不可用' }, { status: 503 })
  }

  const source = getServerRequestSource(request)
  if (isRateLimited(source.sourceId, Date.now())) {
    return Response.json({ error: '诊断编号请求过于频繁' }, { status: 429 })
  }

  const allocatedIdentity = await Promise.all([
    ensureDiagnosticPlayerCode(source.diagnosticCode),
    ensureDeviceProvenanceId(source.deviceProvenanceId),
  ])
  let diagnosticCode = allocatedIdentity[0]
  const deviceProvenanceId = allocatedIdentity[1]
  if (!diagnosticCode || !deviceProvenanceId) {
    return Response.json({ error: '暂时无法分配日志来源编号' }, { status: 503 })
  }
  let boundDiagnosticCode = bindDiagnosticMailboxIdentity(diagnosticCode, deviceProvenanceId)
  for (let attempt = 0; !boundDiagnosticCode && attempt < 4; attempt += 1) {
    diagnosticCode = await ensureDiagnosticPlayerCode()
    if (diagnosticCode) {
      boundDiagnosticCode = bindDiagnosticMailboxIdentity(diagnosticCode, deviceProvenanceId)
    }
  }
  if (!boundDiagnosticCode) {
    return Response.json({ error: '暂时无法建立邮箱身份' }, { status: 503 })
  }
  diagnosticCode = boundDiagnosticCode

  const response = NextResponse.json(
    { diagnosticCode, deviceProvenanceId, scope: 'browser-profile' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  response.cookies.set({
    name: DIAGNOSTIC_PLAYER_CODE_COOKIE,
    value: diagnosticCode,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  response.cookies.set({
    name: DEVICE_PROVENANCE_ID_COOKIE,
    value: deviceProvenanceId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
