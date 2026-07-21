import { CloudSyncRequestSchema } from '@/core/account/account-contract'
import {
  accountErrorResponse,
  assertSameOrigin,
  jsonNoStore,
  parseAccountJson,
  readSessionToken,
} from '@/core/account/account-http'
import { AccountServiceError, syncAccount } from '@/core/account/account-service'

export const runtime = 'nodejs'

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const token = readSessionToken(request)
    if (!token) throw new AccountServiceError('请先登录账号', 401, 'unauthenticated')
    const input = CloudSyncRequestSchema.parse(await parseAccountJson(request))
    return jsonNoStore(syncAccount(token, input))
  } catch (error) {
    return accountErrorResponse(error)
  }
}
