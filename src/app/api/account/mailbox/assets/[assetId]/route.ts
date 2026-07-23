import { readSessionToken } from '@/core/account/account-http'
import { requireSessionAccountId } from '@/core/account/account-service'
import { isPlayerMailboxEnabled } from '@/core/player-content/player-content-features'
import { playerContentErrorResponse } from '@/core/player-content/player-content-http'
import { readOwnedPortraitAsset } from '@/core/player-content/player-content-service'
import { readPortraitAsset } from '@/core/player-content/portrait-asset-store'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  try {
    if (!isPlayerMailboxEnabled()) return new Response(null, { status: 404 })
    const accountId = requireSessionAccountId(readSessionToken(request))
    const { assetId } = await context.params
    const asset = readOwnedPortraitAsset(accountId, assetId)
    if (!asset) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(readPortraitAsset(asset.storageKey)), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': asset.mimeType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
