import { getServerRequestSource } from '@/core/logger/server-log-store'
import { playerContentErrorResponse } from '@/core/player-content/player-content-http'
import { readMailboxPortraitAsset } from '@/core/player-content/player-mail-service'
import { readPortraitAsset } from '@/core/player-content/portrait-asset-store'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  try {
    const source = getServerRequestSource(request)
    const { assetId } = await context.params
    const asset = readMailboxPortraitAsset({
      ...(source.accountId ? { accountId: source.accountId } : {}),
      ...(source.username ? { username: source.username } : {}),
      ...(source.diagnosticCode ? { diagnosticCode: source.diagnosticCode } : {}),
      ...(source.deviceProvenanceId ? { deviceProvenanceId: source.deviceProvenanceId } : {}),
    }, assetId)
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
