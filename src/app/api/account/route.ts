import { DeleteAccountRequestSchema } from '@/core/account/account-contract'
import {
  accountErrorResponse,
  assertSameOrigin,
  clearSessionCookie,
  jsonNoStore,
  parseAccountJson,
  readSessionToken,
} from '@/core/account/account-http'
import {
  AccountServiceError,
  cleanupInactiveAccounts,
  deleteAccount,
  getSessionAccount,
} from '@/core/account/account-service'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    cleanupInactiveAccounts()
    const payload = getSessionAccount(readSessionToken(request))
    return jsonNoStore(payload ?? { authenticated: false })
  } catch (error) {
    return accountErrorResponse(error)
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const token = readSessionToken(request)
    if (!token) throw new AccountServiceError('请先登录账号', 401, 'unauthenticated')
    const input = DeleteAccountRequestSchema.parse(await parseAccountJson(request))
    await deleteAccount(token, input.password)
    const response = jsonNoStore({ ok: true })
    clearSessionCookie(response)
    return response
  } catch (error) {
    return accountErrorResponse(error)
  }
}
