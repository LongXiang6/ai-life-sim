import {
  accountErrorResponse,
  assertSameOrigin,
  clearSessionCookie,
  jsonNoStore,
  readSessionToken,
} from '@/core/account/account-http'
import { logoutAccount } from '@/core/account/account-service'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    logoutAccount(readSessionToken(request))
    const response = jsonNoStore({ ok: true })
    clearSessionCookie(response)
    return response
  } catch (error) {
    return accountErrorResponse(error)
  }
}
