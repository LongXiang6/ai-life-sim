/**
 * Purpose: Authenticate loopback QQ Bot requests with HMAC, freshness, nonce, and body guards.
 * Owner: core:account
 * Responsibility: Integration request verification and JSON parsing only.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { getAccountDatabase } from '../account-database'
import { AccountServiceError } from '../account-service'

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000
const NONCE_RETENTION_MS = 10 * 60 * 1000

function integrationSecret(): string {
  const secret = process.env.QQ_BOT_INTEGRATION_SECRET?.trim() ?? ''
  if (secret.length < 32) {
    throw new AccountServiceError('QQ Bot 联动尚未配置', 503, 'integration_unavailable')
  }
  return secret
}

export function buildQqBotSignature(
  method: string,
  pathname: string,
  rawBody: string,
  timestamp: string,
  nonce: string,
  secret: string,
): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${pathname}\n${bodyHash}`)
    .digest('hex')
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === '::1') return true
  const ipv4 = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized
  const octets = ipv4.split('.')
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/u.test(octet))) return false
  const values = octets.map(Number)
  return values.every((octet) => octet >= 0 && octet <= 255) && values[0] === 127
}

function hasOnlyLoopbackForwardingAddresses(headers: Headers): boolean {
  return ['x-forwarded-for', 'x-real-ip'].every((headerName) => {
    const value = headers.get(headerName)
    return value === null || value.split(',').every(isLoopbackAddress)
  })
}

export function verifyQqBotRequest(request: Request, rawBody: string, now = Date.now()): void {
  if (!hasOnlyLoopbackForwardingAddresses(request.headers)) {
    throw new AccountServiceError('联动接口仅允许回环调用', 403, 'integration_loopback_required')
  }
  const timestamp = request.headers.get('x-ai-life-bot-timestamp') ?? ''
  const nonce = request.headers.get('x-ai-life-bot-nonce') ?? ''
  const signature = request.headers.get('x-ai-life-bot-signature') ?? ''
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isInteger(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_MAX_AGE_MS) {
    throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(nonce) || !/^[a-f0-9]{64}$/u.test(signature)) {
    throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
  }
  const expected = buildQqBotSignature(
    request.method,
    new URL(request.url).pathname,
    rawBody,
    timestamp,
    nonce,
    integrationSecret(),
  )
  const expectedBytes = Buffer.from(expected, 'hex')
  const actualBytes = Buffer.from(signature, 'hex')
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
    throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
  }
  const database = getAccountDatabase()
  const nonceHash = createHash('sha256').update(nonce).digest('hex')
  try {
    database.transaction(() => {
      database.prepare('DELETE FROM qq_bot_request_nonces WHERE seen_at < ?').run(now - NONCE_RETENTION_MS)
      database.prepare('INSERT INTO qq_bot_request_nonces(nonce_hash, seen_at) VALUES (?, ?)')
        .run(nonceHash, now)
    })()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new AccountServiceError('联动请求签名无效', 401, 'integration_auth_failed')
    }
    throw error
  }
}

export async function readVerifiedQqBotJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    throw new AccountServiceError('联动请求内容过大', 413, 'integration_body_too_large')
  }
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > 4096) {
    throw new AccountServiceError('联动请求内容过大', 413, 'integration_body_too_large')
  }
  verifyQqBotRequest(request, rawBody)
  try {
    return JSON.parse(rawBody)
  } catch {
    throw new AccountServiceError('联动请求格式无效', 400, 'integration_invalid_json')
  }
}
