import {
  accountErrorResponse,
  assertSameOrigin,
  jsonNoStore,
  readSessionToken,
} from '@/core/account/account-http'
import { getSessionAccount } from '@/core/account/account-service'
import {
  createAccountQqLinkCode,
  unlinkAccountQq,
} from '@/core/account/qq-bot-integration'

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    return jsonNoStore(createAccountQqLinkCode(readSessionToken(request)))
  } catch (error) {
    return accountErrorResponse(error)
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const token = readSessionToken(request)
    unlinkAccountQq(token)
    const payload = getSessionAccount(token)
    return jsonNoStore(payload ?? { authenticated: false })
  } catch (error) {
    return accountErrorResponse(error)
  }
}
