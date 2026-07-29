import {
  RegisterRequestSchema,
} from '@/core/account/account-contract'
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
  registerAccount,
} from '@/core/account/account-service'
import { getServerRequestSource } from '@/core/logger/server-log-store'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    cleanupInactiveAccounts()
    enforceAccountRateLimit(accountRateKey(request, 'register'), 5, 60 * 60 * 1000)
    const input = RegisterRequestSchema.parse(await parseAccountJson(request))
    const source = getServerRequestSource(request)
    const result = await registerAccount(input, {
      diagnosticCode: source.diagnosticCode,
      deviceProvenanceId: source.deviceProvenanceId,
    })
    const response = jsonNoStore(result.payload, { status: 201 })
    setSessionCookie(response, result.token)
    return response
  } catch (error) {
    return accountErrorResponse(error)
  }
}
