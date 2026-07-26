import { createHash } from 'crypto'
import { z } from 'zod'

import { assertSameOrigin, jsonNoStore } from '@/core/account/account-http'

export const runtime = 'nodejs'

const MAX_REQUEST_BYTES = 4 * 1024
const BALANCE_CACHE_TTL_MS = 60 * 1000

const RequestSchema = z.object({
  apiKey: z.string().min(1).max(512),
  baseUrl: z.string().url().max(2048),
  forceRefresh: z.boolean().optional(),
}).strict()

const UpstreamSchema = z.object({
  is_available: z.boolean(),
  balance_infos: z.array(z.object({
    currency: z.string(),
    total_balance: z.string(),
    granted_balance: z.string(),
    topped_up_balance: z.string(),
  }).passthrough()),
}).passthrough()

interface CachedBalance {
  expiresAt: number
  promise: Promise<{
    isAvailable: boolean
    balances: Array<{
      currency: string
      totalBalance: string
      grantedBalance: string
      toppedUpBalance: string
    }>
    fetchedAt: number
  }>
}

declare global {
  var __deepSeekBalanceCache: Map<string, CachedBalance> | undefined
}

const balanceCache = globalThis.__deepSeekBalanceCache ?? new Map<string, CachedBalance>()
globalThis.__deepSeekBalanceCache = balanceCache

function resolveBalanceUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'api.deepseek.com') {
    throw new Error('余额查询只支持 DeepSeek 官方接口')
  }
  return `${parsed.origin}/user/balance`
}

async function readBody(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) throw new Error('请求体过大')
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) throw new Error('请求体过大')
  return raw
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const input = RequestSchema.parse(JSON.parse(await readBody(request)))
    const balanceUrl = resolveBalanceUrl(input.baseUrl)
    const cacheKey = createHash('sha256').update(`${balanceUrl}\0${input.apiKey}`).digest('hex')
    const now = Date.now()
    if (input.forceRefresh) balanceCache.delete(cacheKey)
    const cached = balanceCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return jsonNoStore(await cached.promise)

    const promise = (async () => {
      const response = await fetch(balanceUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.apiKey}` },
        cache: 'no-store',
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(`DeepSeek 余额接口返回 ${response.status}: ${raw}`)
      const result = UpstreamSchema.parse(JSON.parse(raw))
      return {
        isAvailable: result.is_available,
        balances: result.balance_infos.map((balance) => ({
          currency: balance.currency,
          totalBalance: balance.total_balance,
          grantedBalance: balance.granted_balance,
          toppedUpBalance: balance.topped_up_balance,
        })),
        fetchedAt: Date.now(),
      }
    })()
    balanceCache.set(cacheKey, { expiresAt: now + BALANCE_CACHE_TTL_MS, promise })
    try {
      return jsonNoStore(await promise)
    } catch (error) {
      balanceCache.delete(cacheKey)
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek 余额查询失败'
    return jsonNoStore({ error: message, code: 'balance_lookup_failed' }, { status: 400 })
  }
}
