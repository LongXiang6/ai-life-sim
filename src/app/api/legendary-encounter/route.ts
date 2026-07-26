import { z } from 'zod'

import {
  assertSameOrigin,
  jsonNoStore,
  parseAccountJson,
  readSessionToken,
} from '@/core/account/account-http'
import { getSessionAccountIdentity } from '@/core/account/account-service'
import { getServerRequestSource } from '@/core/logger/server-log-store'
import { playerContentErrorResponse } from '@/core/player-content/player-content-http'
import {
  markLegendaryEncounterInjected,
  selectLegendaryEncounter,
} from '@/core/player-content/player-content-service'

export const runtime = 'nodejs'

const RequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('select'),
    lifeRunId: z.string().min(1).max(160),
  }).strict(),
  z.object({
    action: z.literal('injected'),
    lifeRunId: z.string().min(1).max(160),
    round: z.number().int().min(1).max(1_000_000),
  }).strict(),
])

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const input = RequestSchema.parse(await parseAccountJson(request))
    const identity = getSessionAccountIdentity(readSessionToken(request))
    const source = getServerRequestSource(request)
    const targetKey = identity
      ? `account:${identity.accountId}`
      : `device:${source.deviceProvenanceId ?? source.diagnosticCode ?? source.sourceId}`
    if (input.action === 'select') {
      return jsonNoStore({
        encounter: selectLegendaryEncounter({
          targetKey,
          targetAccountId: identity?.accountId,
          targetLifeRunId: input.lifeRunId,
        }),
      })
    }
    return jsonNoStore({
      updated: markLegendaryEncounterInjected({
        targetKey,
        targetLifeRunId: input.lifeRunId,
        round: input.round,
      }),
    })
  } catch (error) {
    return playerContentErrorResponse(error)
  }
}
