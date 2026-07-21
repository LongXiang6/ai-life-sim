import 'server-only'

import { createHash } from 'node:crypto'

import { NextResponse } from 'next/server'

import {
  ACCOUNT_RETENTION_DAYS,
  ACCOUNT_SESSION_COOKIE,
  ACCOUNT_SYNC_BODY_LIMIT,
} from './account-contract'
import { AccountServiceError } from './account-service'
import { getServerRequestSource } from '@/core/logger/server-log-store'

export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') {
    throw new AccountServiceError('拒绝跨站账号请求', 403, 'cross_site_request')
  }
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    throw new AccountServiceError('账号请求来源无效', 403, 'invalid_origin')
  }
}
export async function parseAccountJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > ACCOUNT_SYNC_BODY_LIMIT) {
    throw new AccountServiceError('账号请求内容过大', 413, 'body_too_large')
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > ACCOUNT_SYNC_BODY_LIMIT) {
    throw new AccountServiceError('账号请求内容过大', 413, 'body_too_large')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new AccountServiceError('账号请求格式无效', 400, 'invalid_json')
  }
}

export function readSessionToken(request: Request): string | undefined {
  const cookie = request.headers.get('cookie') ?? ''
  for (const item of cookie.split(';')) {
    const [name, ...parts] = item.trim().split('=')
    if (name === ACCOUNT_SESSION_COOKIE) return decodeURIComponent(parts.join('='))
  }
  return undefined
}

export function accountRateKey(request: Request, scope: string, username = ''): string {
  const source = getServerRequestSource(request)
  return createHash('sha256')
    .update(`${scope}\u0000${source.sourceId}\u0000${username.normalize('NFKC').toLocaleLowerCase('zh-CN')}`)
    .digest('hex')
}

export function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: ACCOUNT_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ACCOUNT_RETENTION_DAYS * 24 * 60 * 60,
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: ACCOUNT_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}

export function accountErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccountServiceError) {
    return jsonNoStore({ error: error.message, code: error.code }, { status: error.status })
  }
  if (error && typeof error === 'object' && 'issues' in error) {
    const issue = (error as { issues?: Array<{ message?: string }> }).issues?.[0]
    return jsonNoStore({ error: issue?.message ?? '账号输入无效', code: 'validation_error' }, { status: 400 })
  }
  console.error('[account] 未处理的账号服务错误:', error)
  return jsonNoStore({ error: '账号服务暂时不可用', code: 'account_service_error' }, { status: 503 })
}
