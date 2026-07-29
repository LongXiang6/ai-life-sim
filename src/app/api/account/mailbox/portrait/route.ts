import { assertSameOrigin, jsonNoStore, readSessionToken } from '@/core/account/account-http'
import { after } from 'next/server'
import { requireSessionAccountId } from '@/core/account/account-service'
import { PortraitMailRequestSchema } from '@/core/player-content/player-content-contract'
import { isPortraitImageEnabled } from '@/core/player-content/player-content-features'
import { playerContentErrorResponse, readBoundedRequestBody } from '@/core/player-content/player-content-http'
import { processPortraitMailRequest, schedulePortraitMailWorker } from '@/core/player-content/portrait-mail-service'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isPortraitImageEnabled()) {
      return jsonNoStore({ error: '满分人生画像尚未开放', code: 'feature_disabled' }, { status: 404 })
    }
    assertSameOrigin(request)
    const accountId = requireSessionAccountId(readSessionToken(request))
    const raw = await readBoundedRequestBody(request, 4 * 1024 * 1024)
    const input = PortraitMailRequestSchema.parse(JSON.parse(raw.toString('utf8')))
    const result = await processPortraitMailRequest(accountId, input)
    after(() => schedulePortraitMailWorker())
    return jsonNoStore(result, { status: 202 })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
