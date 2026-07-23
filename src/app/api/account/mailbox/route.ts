import { z } from 'zod'

import { assertSameOrigin, jsonNoStore, readSessionToken } from '@/core/account/account-http'
import { requireSessionAccountId } from '@/core/account/account-service'
import { isPlayerMailboxEnabled } from '@/core/player-content/player-content-features'
import { playerContentErrorResponse, readBoundedRequestBody } from '@/core/player-content/player-content-http'
import { markPlayerMailRead, readPlayerMail } from '@/core/player-content/player-content-service'

export const runtime = 'nodejs'

const ReadMailSchema = z.object({ messageId: z.string().uuid() }).strict()

function disabled(): Response | null {
  return isPlayerMailboxEnabled()
    ? null
    : jsonNoStore({ error: '邮箱尚未开放', code: 'feature_disabled' }, { status: 404 })
}

export async function GET(request: Request): Promise<Response> {
  try {
    const disabledResponse = disabled()
    if (disabledResponse) return disabledResponse
    const accountId = requireSessionAccountId(readSessionToken(request))
    const messages = readPlayerMail(accountId).map((message) => ({
      ...message,
      assetUrl: message.assetId ? `/api/account/mailbox/assets/${message.assetId}` : null,
    }))
    return jsonNoStore({ messages })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const disabledResponse = disabled()
    if (disabledResponse) return disabledResponse
    assertSameOrigin(request)
    const accountId = requireSessionAccountId(readSessionToken(request))
    const raw = await readBoundedRequestBody(request, 16 * 1024)
    const input = ReadMailSchema.parse(JSON.parse(raw.toString('utf8')))
    return jsonNoStore({ updated: markPlayerMailRead(accountId, input.messageId) })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
