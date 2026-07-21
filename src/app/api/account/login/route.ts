import { LoginRequestSchema } from '@/core/account/account-contract'
import {
  accountErrorResponse,
  accountRateKey,
  assertSameOrigin,
  jsonNoStore,
  parseAccountJson,
  setSessionCookie,
} from '@/core/account/account-http'
import {
  cleanupInactiveAccounts,
  enforceAccountRateLimit,
  loginAccount,
} from '@/core/account/account-service'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    cleanupInactiveAccounts()
    const raw = await parseAccountJson(request)
    const username = raw && typeof raw === 'object' && 'username' in raw
      ? String(raw.username)
      : ''
    enforceAccountRateLimit(accountRateKey(request, 'login-source'), 40, 15 * 60 * 1000)
    enforceAccountRateLimit(accountRateKey(request, 'login', username), 10, 15 * 60 * 1000)
    const input = LoginRequestSchema.parse(raw)
    const result = await loginAccount(input)
    const response = jsonNoStore(result.payload)
    setSessionCookie(response, result.token)
    return response
  } catch (error) {
    return accountErrorResponse(error)
  }
}
