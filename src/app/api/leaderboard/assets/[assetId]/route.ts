import { isPlayerLeaderboardEnabled } from '@/core/player-content/player-content-features'
import { playerContentErrorResponse } from '@/core/player-content/player-content-http'
import { readPortraitAsset } from '@/core/player-content/portrait-asset-store'
import { readLeaderboardPortraitAsset } from '@/core/player-content/player-content-service'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  try {
    if (!isPlayerLeaderboardEnabled()) return new Response(null, { status: 404 })
    const { assetId } = await context.params
    const asset = readLeaderboardPortraitAsset(assetId)
    if (!asset) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(readPortraitAsset(asset.storageKey)), {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Content-Type': asset.mimeType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
